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

    this.video.muted = false; // routed through Web Audio instead
    this.video.volume = 1;

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

    // The video's own audio is the original mix (with the original dialogue).
    // Kept at zero unless explicitly asked for, but wired up so it can be
    // faded in for reference.
    this.originalGain = this.ctx.createGain();
    this.originalGain.gain.value = 0;
    this.originalGain.connect(this.master);

    this.videoSource = this.ctx.createMediaElementSource(this.video);
    this.videoSource.connect(this.originalGain);
  }

  async _decode(url) {
    if (!url) return null;
    if (this.buffers.has(url)) return this.buffers.get(url);

    const res = await fetch(url);
    if (!res.ok) throw new Error(`Could not read audio (${res.status})`);
    const bytes = await res.arrayBuffer();
    const buffer = await this.ctx.decodeAudioData(bytes);
    this.buffers.set(url, buffer);
    return buffer;
  }

  /**
   * Loads a pack + session. Decodes the backing track and every available take
   * up front; original dialogue is decoded lazily, since most of the time
   * you're listening to your own performance.
   */
  async load({ pack, session, onProgress }) {
    this._ensureContext();
    this.stop();
    this.items = [];
    this.freestyle = null;
    this.backing = null;

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
      try {
        const buffer = await this._decode(job.url);
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
        console.warn('Could not decode', job.url, err.message);
      }
      done++;
      if (onProgress) onProgress(done / total);
    }

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

  setLineVolume(id, volume) {
    const item = this.items.find((i) => i.id === id);
    if (!item) return;
    item.volume = volume;
    // Live-adjust anything already playing so the change is audible at once.
    for (const node of this.active) {
      if (node.item === item) node.gain.gain.value = volume;
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

  setOriginalVolume(v) {
    this._ensureContext();
    this.originalGain.gain.value = v;
  }

  // transport

  async play() {
    this._ensureContext();
    if (this.ctx.state === 'suspended') await this.ctx.resume();
    await this.video.play();
  }

  pause() {
    this.video.pause();
  }

  async toggle() {
    if (this.video.paused) await this.play();
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
      this._startAt(buffer, item.time + item.offset, videoTime, item.volume, item);
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
