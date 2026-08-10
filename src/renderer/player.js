/**
 * Preview engine.
 *
 * The <video> element is the master clock. Every dub take and the backing
 * track are decoded into AudioBuffers and scheduled against the AudioContext
 * clock relative to that clock's origin:
 *
 *     originTime = ctx.currentTime - video.currentTime
 *
 * so a line that belongs at T seconds on the timeline starts at
 * `originTime + T`. Any seek, pause, or mix change tears the schedule down and
 * rebuilds it, which keeps the logic simple and drift-free.
 *
 * The two clocks still creep apart over a few minutes, so a watchdog resyncs
 * whenever they disagree by more than DRIFT_LIMIT.
 */

const DRIFT_LIMIT = 0.12;   // seconds of audio/video skew before a resync
const DRIFT_INTERVAL = 300; // ms between drift checks

const abortError = () => new DOMException('Load superseded', 'AbortError');

export class DubPlayer {
  constructor(video) {
    this.video = video;
    this.ctx = null;
    this.items = [];
    this.freestyle = null;
    this.backing = null;
    this.buffers = new Map(); // url -> AudioBuffer
    this.active = [];
    this.originTime = 0;
    this.driftTimer = null;
    this.onStateChange = null;

    // The video is silent on purpose, from the moment it exists.
    //
    // Its soundtrack is the original mix, with the original dialogue in it.
    // What plays instead is the backing track, which is that same audio with
    // the spoken ranges quietened, plus whichever take each line is set to.
    // Letting the element through would put the original performance
    // underneath the dub.
    //
    // This used to happen by accident. The element was routed into the audio
    // graph through a MediaElementAudioSource connected to a gain left at zero;
    // because a custom scheme counts as cross-origin, the graph refused to read
    // it and emitted silence and a console warning on every load. Nothing ever
    // raised that gain, so the whole path existed to mute the video by failing
    // at it.
    this.video.muted = true;

    this.video.addEventListener('play', () => this._onPlay());
    this.video.addEventListener('pause', () => this._onPause());
    this.video.addEventListener('seeking', () => this._stopSources());
    this.video.addEventListener('seeked', () => { if (!this.video.paused) this._schedule(); });
    this.video.addEventListener('ratechange', () => this._schedule());
  }

  // setup

  _ensureContext() {
    if (this.ctx) return;

    this.ctx = new AudioContext({ latencyHint: 'interactive' });

    this.master = this.ctx.createGain();
    this.master.connect(this.ctx.destination);

    this.dubGain = this.ctx.createGain();
    this.dubGain.connect(this.master);

    this.backingGain = this.ctx.createGain();
    this.backingGain.connect(this.master);

  }

  /**
   * Reads and decodes one audio file, remembering it.
   *
   * The bytes come over IPC rather than from `fetch`. Chromium refuses a
   * cross-origin fetch to any scheme outside http, https and a short built-in
   * list, whatever headers the handler sets — so reading our own cvmedia://
   * addresses this way is not a preference, it is the only way that works.
   */
  async _decode(url, signal) {
    if (!url) return null;
    if (this.buffers.has(url)) return this.buffers.get(url);

    const got = await window.api.media.bytes(url);
    if (signal && signal.aborted) throw new DOMException('Aborted', 'AbortError');
    if (!got || !got.ok) throw new Error(`Could not read audio: ${got ? got.error : 'no answer'}`);

    const buffer = await this.ctx.decodeAudioData(got.bytes);
    this.buffers.set(url, buffer);
    return buffer;
  }

  /** Stops whatever load is in flight, so a new one can take over cleanly. */
  cancelLoad() {
    if (this.loadController) this.loadController.abort();
    this.loadController = null;
  }

  /**
   * Drops the current pack's lines and audio.
   *
   * Called the moment a new selection starts, because loading is slow and
   * anything reading `items` in the meantime would otherwise be looking at the
   * pack you just clicked away from.
   */
  reset() {
    this.cancelLoad();
    this.stop();
    this.items = [];
    this.freestyle = null;
    this.backing = null;
  }

  /**
   * Loads a pack + session. Decodes the backing track and every available take
   * up front; original dialogue is decoded lazily, since most of the time
   * you're listening to your own performance.
   *
   * Clicking through packs quickly abandons the previous load part way, so this
   * bails out the moment its signal is aborted rather than carrying on and
   * writing its results over whichever pack won.
   */
  async load({ pack, session, onProgress, signal }) {
    this._ensureContext();
    this.cancelLoad();
    this.stop();
    this.items = [];
    this.freestyle = null;
    this.backing = null;

    const controller = new AbortController();
    this.loadController = controller;
    if (signal) {
      if (signal.aborted) controller.abort();
      else signal.addEventListener('abort', () => controller.abort(), { once: true });
    }
    const { signal: loadSignal } = controller;

    const takeUrls = (session && session.takeUrls) || {};
    const jobs = [];

    if (pack.backingUrl) {
      jobs.push({ kind: 'backing', url: pack.backingUrl });
    }

    if (session && session.freestyleUrl) {
      jobs.push({ kind: 'freestyle', url: session.freestyleUrl });
    }

    for (const line of pack.lines) {
      const takeUrl = takeUrls[line.base] || null;
      this.items.push({
        id: line.id,
        time: line.time,
        character: line.character,
        caption: line.caption,
        imageUrl: line.imageUrl,
        takeUrl,
        originalUrl: line.sourceAudioUrl,
        // Default to your take where one exists, the original otherwise, so
        // the first playback sounds like a finished dub.
        source: takeUrl ? 'take' : (line.sourceAudioUrl ? 'original' : 'none'),
        volume: 1,
        offset: 0,
        muted: false,
        duration: line.duration || 0,
        buffer: null,
        originalBuffer: null,
      });
      if (takeUrl) jobs.push({ kind: 'take', url: takeUrl, id: line.id });
      else if (line.sourceAudioUrl) jobs.push({ kind: 'original', url: line.sourceAudioUrl, id: line.id });
    }

    let done = 0;
    const total = jobs.length || 1;

    for (const job of jobs) {
      if (loadSignal.aborted) throw abortError();
      try {
        const buffer = await this._decode(job.url, loadSignal);
        if (job.kind === 'backing') this.backing = buffer;
        else if (job.kind === 'freestyle') this.freestyle = buffer;
        else {
          const item = this.items.find((i) => i.id === job.id);
          if (item) {
            if (job.kind === 'take') item.buffer = buffer;
            else item.originalBuffer = buffer;
            item.duration = buffer.duration;
          }
        }
      } catch (err) {
        if (err.name === 'AbortError' || loadSignal.aborted) throw abortError();

        // A pack whose metadata names a file that is not there is a real
        // situation, and the library already reports it as a problem with the
        // pack. Here it just means the line has nothing to play, so it is
        // marked as such and the rest of the dub still loads.
        const item = this.items.find((i) => i.id === job.id);
        if (item) {
          if (job.kind === 'take') item.takeUrl = null;
          else item.originalUrl = null;
          item.missing = true;
          if (item.source !== 'none' && !item.takeUrl && !item.originalUrl) item.source = 'none';
        }
        console.warn('Could not decode', job.url, err.message);
      }
      done++;
      if (onProgress) onProgress(done / total);
    }

    if (loadSignal.aborted) throw abortError();
    if (this.loadController === controller) this.loadController = null;
    return this.items;
  }

  // buffer selection

  _bufferFor(item) {
    if (item.muted || item.source === 'none') return null;
    if (item.source === 'take') return item.buffer;
    if (item.source === 'original') return item.originalBuffer;
    return null;
  }

  /** Switching a line to the original may need a decode first. */
  async setLineSource(id, source) {
    const item = this.items.find((i) => i.id === id);
    if (!item) return;

    if (source === 'original' && !item.originalBuffer && item.originalUrl) {
      item.originalBuffer = await this._decode(item.originalUrl).catch(() => null);
      if (item.originalBuffer) item.duration = item.originalBuffer.duration;
    }
    if (source === 'take' && !item.buffer && item.takeUrl) {
      item.buffer = await this._decode(item.takeUrl).catch(() => null);
    }

    item.source = source;
    this._schedule();
  }

  /**
   * How loud one line actually plays: its own volume, times its character's.
   *
   * Two separate things deliberately. The line volume is the balance set between
   * one line and the next, and the character volume lifts a whole performer at
   * once without disturbing it.
   */
  gainFor(item) {
    if (!item || typeof item !== 'object') return 1;
    const own = Number.isFinite(item.volume) ? item.volume : 1;
    if (!this.useCharacterVolumes) return own;
    const perCharacter = (this.characterVolumes || {})[item.character];
    return own * (Number.isFinite(perCharacter) ? perCharacter : 1);
  }

  /** Sets the per character multipliers, and whether they apply at all. */
  setCharacterVolumes(map, enabled = true) {
    this.characterVolumes = map || {};
    this.useCharacterVolumes = enabled !== false;
    for (const node of this.active) {
      if (node.item && typeof node.item === 'object') node.gain.gain.value = this.gainFor(node.item);
    }
  }

  setLineVolume(id, volume) {
    const item = this.items.find((i) => i.id === id);
    if (!item) return;
    item.volume = volume;
    // Live-adjust anything already playing so the change is audible at once.
    for (const node of this.active) {
      if (node.item === item) node.gain.gain.value = this.gainFor(item);
    }
  }

  setLineOffset(id, offset) {
    const item = this.items.find((i) => i.id === id);
    if (!item) return;
    item.offset = offset;
    this._schedule();
  }

  setLineMuted(id, muted) {
    const item = this.items.find((i) => i.id === id);
    if (!item) return;
    item.muted = muted;
    this._schedule();
  }

  setBackingVolume(v) {
    this._ensureContext();
    this.backingGain.gain.value = v;
  }

  setDubVolume(v) {
    this._ensureContext();
    this.dubGain.gain.value = v;
  }


  // transport

  async play() {
    this._ensureContext();
    if (this.ctx.state === 'suspended') await this.ctx.resume();
    try {
      await this.video.play();
    } catch (err) {
      // Switching packs pauses the video mid-play(), which rejects the pending
      // promise. That is the normal outcome of the swap, not a failure.
      if (err.name !== 'AbortError') throw err;
    }
  }

  pause() {
    this.video.pause();
  }

  async toggle() {
    if (this.video.paused) await this.play().catch(() => {});
    else this.pause();
  }

  seek(time) {
    this.video.currentTime = Math.max(0, Math.min(time, this.video.duration || time));
  }

  stop() {
    this.video.pause();
    this._stopSources();
  }

  _onPlay() {
    this._ensureContext();
    if (this.ctx.state === 'suspended') this.ctx.resume();
    this._schedule();
    this._startDriftWatch();
    if (this.onStateChange) this.onStateChange(true);
  }

  _onPause() {
    this._stopSources();
    this._stopDriftWatch();
    if (this.onStateChange) this.onStateChange(false);
  }

  // scheduling

  _stopSources() {
    for (const node of this.active) {
      try { node.src.stop(); } catch { /* already finished */ }
      try { node.src.disconnect(); } catch { /* already torn down */ }
    }
    this.active = [];
  }

  _startAt(buffer, startTime, videoTime, gainValue, item) {
    const end = startTime + buffer.duration;
    if (end <= videoTime) return; // already finished by the playhead

    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    src.playbackRate.value = this.video.playbackRate || 1;

    const gain = this.ctx.createGain();
    gain.gain.value = gainValue;

    src.connect(gain);
    gain.connect(item === 'backing' ? this.backingGain : this.dubGain);

    if (startTime >= videoTime) {
      src.start(this.originTime + startTime);
    } else {
      // Mid-clip: begin now, skipping into the buffer by however much has
      // already gone past.
      src.start(this.ctx.currentTime, videoTime - startTime);
    }

    this.active.push({ src, gain, item });
  }

  _schedule() {
    if (!this.ctx) return;
    this._stopSources();
    if (this.video.paused || this.video.seeking) return;

    const videoTime = this.video.currentTime;
    this.originTime = this.ctx.currentTime - videoTime;

    if (this.backing) {
      this._startAt(this.backing, 0, videoTime, 1, 'backing');
    }

    // A freestyle session is one continuous take over the whole video, so it
    // replaces the per-line schedule entirely.
    if (this.freestyle) {
      this._startAt(this.freestyle, 0, videoTime, 1, { id: '__freestyle__', volume: 1 });
      return;
    }

    for (const item of this.items) {
      const buffer = this._bufferFor(item);
      if (!buffer) continue;
      this._startAt(buffer, item.time + item.offset, videoTime, this.gainFor(item), item);
    }
  }

  _startDriftWatch() {
    this._stopDriftWatch();
    this.driftTimer = setInterval(() => {
      if (!this.ctx || this.video.paused) return;
      const expected = this.ctx.currentTime - this.originTime;
      if (Math.abs(expected - this.video.currentTime) > DRIFT_LIMIT) this._schedule();
    }, DRIFT_INTERVAL);
  }

  _stopDriftWatch() {
    if (this.driftTimer) clearInterval(this.driftTimer);
    this.driftTimer = null;
  }

  /** The line under the playhead, for the caption and portrait overlays. */
  activeItem(time) {
    for (const item of this.items) {
      const start = item.time + item.offset;
      const duration = item.duration || 0;
      if (time >= start && time <= start + Math.max(duration, 0.4)) return item;
    }
    return null;
  }

  destroy() {
    this.stop();
    this._stopDriftWatch();
    this.buffers.clear();
    if (this.ctx) this.ctx.close().catch(() => {});
    this.ctx = null;
  }
}
