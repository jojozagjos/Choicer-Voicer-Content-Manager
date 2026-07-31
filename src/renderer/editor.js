/**
 * Full screen editors for building packs.
 *
 * The dub editor is the reason this exists. The official instructions ask you
 * to pull the audio out of a video, cut it in Audacity, name each export with
 * its timestamp by hand, then type those timestamps back into the game's
 * metadata editor. All of that is doable here from the video alone: scrub,
 * mark a range, and the clip and its timestamp fall out together. Frames can
 * be grabbed straight off the video for character pictures.
 */

import { attachRecorder } from './recorder.js';
import { Timeline, computePeaks } from './timeline.js';
import { specFor, KIND_ACCEPTS } from './packspec.js';

const el = (tag, className, html) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (html != null) node.innerHTML = html;
  return node;
};

const fmt = (seconds) => {
  if (!Number.isFinite(seconds)) return '0:00.00';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toFixed(2).padStart(5, '0')}`;
};

// Pack types that are a person on screen. Only these stand in the game's
// cardboard cutout when they have no picture; the rest get their type's glyph,
// matching what the library grid does.
const CHARACTER_PACKS = new Set(['player', 'host', 'judges']);

const TYPE_GLYPH = {
  voice: '🎙️', player: '🧍', host: '🎤', judges: '⭐',
  studio: '🏛️', menu: '🖼️', chatter: '💬',
};

const escapeHtml = (text) => {
  const div = document.createElement('div');
  div.textContent = text == null ? '' : String(text);
  return div.innerHTML;
};

/**
 * Turns a config key into something readable.
 *
 * Keys carry a sort prefix so they come out in the right order in the file
 * (`a_welcome`, `b_contestant`), which is noise once they are laid out on
 * screen in that order anyway.
 */
function prettyKey(key) {
  const text = String(key)
    .replace(/^[a-z]_(?=[a-z])/i, '')
    .replace(/_/g, ' ')
    .trim();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** `['a','b','c']` and a value becomes `{a:{b:{c:value}}}`. */
function buildNestedPatch(trail, value) {
  return trail.reduceRight((acc, key) => ({ [key]: acc }), value);
}

/** Sortable, filename-safe clip name: 01_something. */
function clipFileName(index, label) {
  const clean = String(label || 'clip')
    .replace(/['’]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '') || 'clip';
  return `${String(index).padStart(2, '0')}_${clean}`;
}

/** Keyboard shortcuts, shown in the editor so they are discoverable. */
export const EDITOR_KEYS = [
  ['Space', 'Play or pause'],
  ['← →', 'Step 2 seconds'],
  ['Shift + ← →', 'Step a frame'],
  // Left dragging deliberately does nothing on its own, so this has to name the
  // buttons that do pan rather than say "drag anywhere".
  ['Right or middle drag', 'Pan the timeline'],
  ['Drag a clip grip', 'Move that clip'],
  ['Drag a clip edge', 'Change where it starts or ends'],
  ['Hold then drag', 'Cut a new clip'],
  ['Delete', 'Delete the selected clip'],
  ['Ctrl + Z', 'Undo'],
  ['Ctrl + Y', 'Redo'],
  ['F', 'Fit the whole video'],
  ['+ −', 'Zoom in and out'],
];

export class PackEditor {
  constructor(root, api, toast, ask) {
    this.root = root;
    this.api = api;
    this.toast = toast;
    // Asking questions is the app's job, not the operating system's.
    this.ask = ask;
    this.pack = null;
    this.onClose = null;
    this.onChanged = null;

    // Undo covers everything that changes a clip, including deletion, which
    // moves files aside rather than removing them so it can be put back.
    this.undoStack = [];
    this.redoStack = [];
    this.busy = 0;

    // Jobs running in the main process on this editor's behalf. Tracked so
    // leaving can call them off, and so a job that has been abandoned cannot
    // still drive the overlay.
    this._jobs = new Set();
    this._jobId = null;
    this._jobSeq = 0;

    this._keyHandler = (e) => this._onKey(e);
  }

  close() {
    this.root.hidden = true;
    this.cancelJobs();
    if (this.timeline) this.timeline.destroy();
    if (this._captionRaf) cancelAnimationFrame(this._captionRaf);
    this._captionRaf = null;
    this._captionKey = null;
    this.root.innerHTML = '';
    document.removeEventListener('keydown', this._keyHandler);
    if (this.video) {
      this.video.pause();
      this.video = null;
    }
    if (this.backingAudio) {
      this.backingAudio.pause();
      this.backingAudio.src = '';
      this.backingAudio = null;
    }
    if (this._backingSync) { clearInterval(this._backingSync); this._backingSync = null; }
    this.backingCanvas = null;
    this.backingPeaks = null;
    this.backingDuration = 0;

    this.captionBox = null;
    this.cropLayer = null;
    this.timeline = null;
    this.undoStack = [];
    this.redoStack = [];
    if (this.onClose) this.onClose();
  }

  /** Shows a blocking-looking overlay while ffmpeg works on a clip. */
  setBusy(on, message) {
    this.busy += on ? 1 : -1;
    this.busy = Math.max(0, this.busy);

    // The file being played may be the one about to be rewritten, so playback
    // stops for the duration rather than running on under the overlay.
    if (on && this.video && !this.video.paused) this.video.pause();

    const bar = this.root.querySelector('.editor-busy');
    if (!bar) return;
    bar.hidden = this.busy === 0;
    if (message) bar.querySelector('span').textContent = message;

    // Each job starts without a figure and only shows one if it reports.
    if (on) {
      const pct = bar.querySelector('.editor-busy-pct');
      if (pct) { pct.hidden = true; pct.textContent = ''; }
    }
  }

  /**
   * How far along the current job is, when it says.
   *
   * Trimming a video takes long enough that a spinner alone leaves you
   * wondering whether it has hung. Recutting a clip is over too quickly to
   * report anything, so the figure stays hidden unless it arrives.
   */
  setBusyProgress(percent, jobId) {
    if (!this.busy || percent == null) return;
    // Only the job the overlay is actually showing may move the figure.
    if (jobId && jobId !== this._jobId) return;
    const pct = this.root.querySelector('.editor-busy-pct');
    if (!pct) return;
    pct.hidden = false;
    pct.textContent = `${Math.min(100, Math.max(0, percent)).toFixed(0)}%`;
  }

  /**
   * Runs one job behind the busy overlay.
   *
   * The job is given an id, which travels to the main process and comes back on
   * every progress report. That is what lets a report be matched to the job that
   * sent it: leaving the tab part way through a trim and starting another one
   * used to leave both of them taking turns driving the same percentage, since
   * neither the overlay nor the reports knew which job they belonged to.
   */
  async run(label, task) {
    const jobId = `editor-${Date.now()}-${++this._jobSeq}`;
    this._jobs.add(jobId);
    this._jobId = jobId;
    this.setBusy(true, label);
    try {
      return await task(jobId);
    } finally {
      this._jobs.delete(jobId);
      if (this._jobId === jobId) this._jobId = null;
      this.setBusy(false);
    }
  }

  /**
   * Calls off everything still running for this editor.
   *
   * ffmpeg does not stop just because the editor was closed, and an abandoned
   * job still renames its output over the pack's video when it finishes. Leaving
   * has to actually cancel the work, not only stop watching it.
   */
  cancelJobs() {
    for (const jobId of this._jobs) {
      Promise.resolve(this.api.content.cancelJob(jobId)).catch(() => {});
    }
    this._jobs.clear();
    this._jobId = null;
  }

  /**
   * Whether the video may play right now.
   *
   * It may not while a job is running, because the file it is playing is the
   * one being rewritten, and it may not while the trim panel is open, because
   * the panel exists to pick a still frame. In both cases the overlay on top
   * says something is happening, and the video carrying on underneath it looks
   * like the overlay is lying.
   */
  get playable() {
    return this.busy === 0 && !this.trim;
  }

  /** Starts or stops playback, if it is allowed at all. */
  togglePlay() {
    const video = this.video;
    if (!video) return;

    if (!video.paused) { video.pause(); return; }
    if (!this.playable) {
      this.toast(this.trim
        ? 'Finish or cancel the trim first.'
        : 'Wait for that to finish first.', 'info', 2200);
      return;
    }
    video.play().catch(() => {});
  }

  // Undo

  push(entry) {
    this.undoStack.push(entry);
    if (this.undoStack.length > 50) this.undoStack.shift();
    this.redoStack = [];
    this._refreshUndoButtons();
  }

  async undo() {
    await this._step('undo', this.undoStack, this.redoStack, 'Undid');
  }

  async redo() {
    await this._step('redo', this.redoStack, this.undoStack, 'Redid');
  }

  /**
   * Moves one entry between the two stacks, carrying out its half of the change.
   *
   * Behind the overlay, because undoing a trim re-runs work that takes real time
   * and an app that looks frozen reads as an app that has broken. And in a
   * try/catch, because the entry has already left its stack by then: a failure
   * without this put it on neither stack, so a redo that went wrong quietly
   * removed the only way to ask for it again.
   */
  async _step(which, from, to, past) {
    if (this.busy) { this.toast('Wait for that to finish first.', 'info', 2000); return; }

    const entry = from.pop();
    if (!entry) {
      this.toast(which === 'undo' ? 'Nothing to undo.' : 'Nothing to redo.', 'info', 1500);
      return;
    }
    this._refreshUndoButtons();

    try {
      await this.run(`${which === 'undo' ? 'Undoing' : 'Redoing'} ${entry.label}…`,
        (jobId) => entry[which](jobId));
    } catch (err) {
      from.push(entry); // still available to try again
      this._refreshUndoButtons();
      // Leaving the editor cancels whatever it was doing, so a cancel here is
      // the person's own decision rather than something that went wrong.
      if (!err.cancelled) {
        this.toast(`Could not ${which} ${entry.label}: ${err.message}`, 'error', 8000);
      }
      return;
    }

    to.push(entry);
    this._refreshUndoButtons();
    this.toast(`${past}: ${entry.label}`, 'ok', 1800);
  }

  _refreshUndoButtons() {
    const undo = this.root.querySelector('[data-act="undo"]');
    const redo = this.root.querySelector('[data-act="redo"]');
    if (undo) undo.disabled = !this.undoStack.length;
    if (redo) redo.disabled = !this.redoStack.length;
  }

  _onKey(event) {
    if (this.root.hidden) return;
    // Never steal keys from a field someone is typing in.
    if (event.target.matches('input, textarea, select')) return;

    const key = event.key.toLowerCase();
    const ctrl = event.ctrlKey || event.metaKey;

    if (ctrl && key === 'z') { event.preventDefault(); this.undo(); return; }
    if (ctrl && (key === 'y' || (key === 'z' && event.shiftKey))) { event.preventDefault(); this.redo(); return; }
    if (ctrl) return;

    const video = this.video;
    const timeline = this.timeline;

    if (event.code === 'Space' && video) {
      event.preventDefault();
      this.togglePlay();
    } else if (key === 'arrowleft' && video) {
      video.currentTime = Math.max(0, video.currentTime - (event.shiftKey ? 1 / 30 : 2));
    } else if (key === 'arrowright' && video) {
      video.currentTime += event.shiftKey ? 1 / 30 : 2;
    } else if (key === 'f' && timeline) {
      timeline.viewStart = 0;
      timeline.viewEnd = timeline.duration;
      timeline.draw();
    } else if ((key === '+' || key === '=') && timeline) {
      timeline.zoomAt(timeline.canvas.getBoundingClientRect().width / 2, 1 / 1.3);
    } else if ((key === '-' || key === '_') && timeline) {
      timeline.zoomAt(timeline.canvas.getBoundingClientRect().width / 2, 1.3);
    } else if ((key === 'delete' || key === 'backspace') && timeline && timeline.selected) {
      event.preventDefault();
      const clip = (this.pack.clips || []).find((c) => c.base === timeline.selected);
      if (clip) this.deleteClip(clip);
    }
  }

  /** Opens the right editor for a pack that already exists on disk. */
  open(pack) {
    this.pack = pack;
    this.root.hidden = false;
    this.root.innerHTML = '';

    const head = el('header', 'editor-head');
    const back = el('button', 'btn btn-ghost', '← Back');
    back.addEventListener('click', () => this.close());

    head.append(back);
    head.append(el('div', 'editor-title', `
      <h2>${escapeHtml(pack.title)}</h2>
      <p class="muted small">${escapeHtml(pack.dir)}</p>`));

    const undo = el('button', 'btn btn-small', '↶ Undo');
    undo.dataset.act = 'undo';
    undo.disabled = true;
    undo.addEventListener('click', () => this.undo());

    const redo = el('button', 'btn btn-small', '↷ Redo');
    redo.dataset.act = 'redo';
    redo.disabled = true;
    redo.addEventListener('click', () => this.redo());

    const keys = el('button', 'btn btn-small', 'Shortcuts');
    keys.addEventListener('click', () => this.toggleShortcuts());

    const openFolder = el('button', 'btn btn-small', 'Open folder');
    openFolder.addEventListener('click', () => this.api.shell.openPath(pack.dir));

    head.append(undo, redo, keys, openFolder);
    this.root.append(head);

    // These are fresh elements, so they start disabled no matter what has
    // already been done. Some changes reopen the editor over the same pack to
    // pick up what they wrote, and without this the history was still there but
    // both buttons looked dead, which after a trim read as not being able to
    // redo it at all.
    this._refreshUndoButtons();

    const busy = el('div', 'editor-busy', `
      <div class="editor-busy-card">
        <div class="spinner"></div>
        <span></span>
        <b class="editor-busy-pct" hidden></b>
      </div>`);
    // Also a fresh element, and a change can reopen the editor while its own job
    // is still running, so this follows the counter rather than starting hidden.
    busy.hidden = this.busy === 0;
    this.root.append(busy);

    const sheet = el('div', 'shortcut-sheet', `
      <h4>Keyboard shortcuts</h4>
      <dl>${EDITOR_KEYS.map(([k, what]) =>
    `<div><dt>${escapeHtml(k)}</dt><dd>${escapeHtml(what)}</dd></div>`).join('')}</dl>`);
    sheet.hidden = true;
    this.root.append(sheet);
    this.sheet = sheet;

    const body = el('div', 'editor-body');
    this.root.append(body);
    this.body = body;

    document.removeEventListener('keydown', this._keyHandler);
    document.addEventListener('keydown', this._keyHandler);

    if (pack.type === 'voice') this.renderDubEditor(body);
    else if (pack.type === 'player') this.renderPlayerEditor(body);
    else if (pack.type === 'chatter') this.renderChatterEditor(body);
    else if (specFor(pack.type)) this.renderSlotEditor(body, specFor(pack.type));
    else this.renderGenericEditor(body);
  }

  toggleShortcuts() {
    if (this.sheet) this.sheet.hidden = !this.sheet.hidden;
  }

  // Dub and voice packs

  renderDubEditor(body) {
    const pack = this.pack;

    if (!pack.videoUrl) {
      body.append(el('div', 'editor-empty', `
        <h3>Add a video to start</h3>
        <p class="muted">A dub pack needs a video to sync against. Drop one in and it is converted
           to the .ogv format the game needs. Everything else can be built here from that video.</p>`));

      const drop = this.buildDropzone('Drop a video here', 'video', async (paths) => {
        await this.importFiles(paths, { baseName: 'dub_video', kind: 'video' });
        this.toast('Video added. Reopening the editor.', 'ok');
        if (this.onChanged) await this.onChanged(pack.id);
      });
      body.append(drop);
      return;
    }

    // Video with the clip controls beneath it.
    const stage = el('div', 'editor-stage');
    const videoWrap = el('div', 'editor-video');
    const video = document.createElement('video');
    video.src = pack.videoUrl;
    video.preload = 'auto';
    video.controls = false;
    videoWrap.append(video);

    // Captions sit over the video so wording and timing can be checked without
    // leaving the editor. Off is a setting, not a per-pack choice.
    const captionBox = el('div', 'editor-caption');
    captionBox.hidden = true;
    videoWrap.append(captionBox);
    this.captionBox = captionBox;

    const cropLayer = el('div', 'crop-layer');
    cropLayer.hidden = true;
    videoWrap.append(cropLayer);
    this.cropLayer = cropLayer;

    stage.append(videoWrap);
    this.video = video;

    const controls = el('div', 'editor-controls');
    controls.innerHTML = `
      <div class="editor-transport">
        <button type="button" class="btn btn-icon" data-act="play">▶</button>
        <button type="button" class="btn btn-icon" data-act="back">⟲</button>
        <button type="button" class="btn btn-icon" data-act="fwd">⟳</button>
        <span class="time" data-role="time">0:00.00</span>

        <label class="slider-field" title="How loud the video plays here. This does not change the pack.">
          <span class="slider-icon" data-role="vol-icon">🔊</span>
          <input type="range" data-role="volume" min="0" max="1" step="0.01" value="1" />
          <b class="slider-read" data-role="vol-read">100%</b>
        </label>

        <span class="grow"></span>

        <button type="button" class="btn btn-small" data-act="caption-here">+ Caption here</button>
        <button type="button" class="btn btn-small" data-act="captions" aria-pressed="true">Captions</button>
        <button type="button" class="btn btn-small" data-act="trim">Trim video</button>
        <button type="button" class="btn btn-small" data-act="backing">Backing track</button>
        <button type="button" class="btn btn-small" data-act="zoom-fit">Fit</button>
      </div>
      <div class="editor-hint">
        <span><b>Click</b> a clip to select it</span>
        <span><b>Drag the grip</b>, the ribbed bar on top of a clip, to move it</span>
        <span><b>Drag an edge</b> to change where it starts or ends</span>
        <span><b>Hold still, then drag</b> empty space to cut a new clip</span>
        <span><b>Right or middle drag</b> to pan &middot; <b>scroll</b> to zoom</span>
      </div>
      <canvas class="timeline" data-role="timeline"></canvas>

      <div class="backing-lane" data-role="backing-lane" hidden>
        <div class="backing-head">
          <span class="backing-title">Backing track</span>

          <span class="muted small">Listening to</span>
          <div class="segmented listen-switch" role="group">
            <button type="button" data-listen="video" class="on"
                    title="The video's own audio, as it came">Video</button>
            <button type="button" data-listen="backing"
                    title="Only the backing track, to check it on its own">Backing track</button>
          </div>

          <span class="grow"></span>
          <span class="muted small" data-role="backing-note">
            Press play. Only the one selected is audible.
          </span>
        </div>
        <canvas class="backing-wave" data-role="backing-wave"></canvas>
      </div>`;
    stage.append(controls);
    body.append(stage);

    const side = el('aside', 'editor-side');
    side.innerHTML = `
      <div class="side-tabs" role="tablist">
        <button type="button" class="seg-tab on" data-side-tab="clips">Clips</button>
        <button type="button" class="seg-tab" data-side-tab="pack">Pack details</button>
      </div>
      <div data-side-panel="clips">
        <div class="clip-list" data-role="clips"></div>
      </div>
      <div data-side-panel="pack" hidden></div>`;
    body.append(side);

    side.querySelector('.side-tabs').addEventListener('click', (event) => {
      const which = event.target.dataset.sideTab;
      if (!which) return;
      for (const tab of side.querySelectorAll('[data-side-tab]')) {
        tab.classList.toggle('on', tab.dataset.sideTab === which);
      }
      for (const panel of side.querySelectorAll('[data-side-panel]')) {
        panel.hidden = panel.dataset.sidePanel !== which;
      }
    });

    this.renderPackDetails(side.querySelector('[data-side-panel="pack"]'));
    this.wireDubControls(controls, side, video);
  }

  wireDubControls(controls, clipPanel, video) {
    const q = (role) => controls.querySelector(`[data-role="${role}"]`);
    const clipList = clipPanel.querySelector('[data-role="clips"]');

    const timeline = new Timeline(q('timeline'), { maxClip: 6 });
    this.timeline = timeline;
    timeline.setClips(this.pack.clips || []);

    timeline.onSeek = (time) => { video.currentTime = time; };
    timeline.onSelect = (clip) => {
      this.renderClipList(clipList);
      const row = clipList.querySelector(`[data-base="${CSS.escape(clip.base)}"]`);
      if (row) row.scrollIntoView({ block: 'nearest' });
    };
    timeline.onCreate = (start, duration) => this.addClip(start, duration, video, clipList);
    timeline.onCommit = (clip, change) => this.commitClipChange(clip, change, clipList);

    const sizeToBox = () => {
      const box = q('timeline');
      box.style.width = '100%';
      timeline.draw();
    };
    new ResizeObserver(sizeToBox).observe(q('timeline'));

    controls.addEventListener('click', async (event) => {
      const act = event.target.dataset.act;
      if (!act) return;

      if (act === 'play') {
        this.togglePlay();
      } else if (act === 'back') video.currentTime = Math.max(0, video.currentTime - 2);
      else if (act === 'fwd') video.currentTime += 2;
      else if (act === 'zoom-fit') {
        timeline.viewStart = 0;
        timeline.viewEnd = timeline.duration;
        timeline.draw();
      } else if (act === 'captions') {
        this.setCaptionsVisible(this.captionsOn === false);
        this.api.settings.set({ showEditorCaptions: this.captionsOn });
      } else if (act === 'caption-here') {
        this.addCaptionAtPlayhead(video);
      } else if (act === 'trim') {
        this.toggleTrim(event.target);
      } else if (act === 'backing') {
        this.makeBackingTrack();
      }
    });

    controls.addEventListener('click', (event) => {
      const which = event.target.dataset.listen;
      if (which) this.listenTo(which);
    });

    this.setupBackingLane(controls, video);

    // Preview volume only. It never touches what is written into the pack, so
    // it is deliberately not saved anywhere.
    const volume = q('volume');
    const applyVolume = () => {
      const value = Number(volume.value);
      video.volume = value;
      q('vol-read').textContent = `${Math.round(value * 100)}%`;
      q('vol-icon').textContent = value === 0 ? '🔇' : value < 0.5 ? '🔉' : '🔊';
    };
    volume.addEventListener('input', applyVolume);
    applyVolume();

    const ready = () => {
      timeline.setDuration(video.duration || 0);
      this.loadWaveform(timeline);
    };
    if (video.readyState >= 1) ready();
    else video.addEventListener('loadedmetadata', ready, { once: true });

    // The backing lane shares the timeline's view window and playhead, so it
    // repaints whenever the timeline does rather than tracking anything itself.
    const drawTimeline = timeline.draw.bind(timeline);
    timeline.draw = () => {
      drawTimeline();
      this.drawBackingWave();
    };

    // The playhead follows the video every frame; the readout only needs to
    // keep up with what a person can read.
    timeline.follow(video);
    video.addEventListener('timeupdate', () => {
      q('time').textContent = fmt(video.currentTime);
    });

    // Captions keep up with the playhead rather than with timeupdate, which
    // only fires a few times a second and made a line appear noticeably after
    // the voice started.
    const trackCaption = () => {
      if (this.root.hidden) return;
      this.paintCaption(video.currentTime);
      this._captionRaf = requestAnimationFrame(trackCaption);
    };
    this._captionRaf = requestAnimationFrame(trackCaption);

    // rAF stops when the window is hidden or occluded, so on its own it leaves
    // whatever caption was last drawn frozen on screen. These cover the cases
    // where the time changed but no frame was painted.
    for (const event of ['seeked', 'timeupdate', 'play', 'pause']) {
      video.addEventListener(event, () => this.paintCaption(video.currentTime));
    }

    // The button follows the video rather than being set wherever playback was
    // asked for, so it stays right when something else stops it: the end of the
    // video, opening the trim panel, or a job starting.
    const playButton = controls.querySelector('.editor-transport [data-act="play"]');
    const showState = () => {
      if (playButton) playButton.textContent = video.paused ? '▶' : '❚❚';
    };
    for (const event of ['play', 'pause', 'ended']) {
      video.addEventListener(event, showState);
    }
    showState();

    this.setCaptionsVisible(!this.settings || this.settings.showEditorCaptions !== false);
    this.renderClipList(clipList);
  }

  // Captions over the video

  setCaptionsVisible(on) {
    this.captionsOn = Boolean(on);
    const button = this.root.querySelector('[data-act="captions"]');
    if (button) {
      button.classList.toggle('on', this.captionsOn);
      button.setAttribute('aria-pressed', String(this.captionsOn));
    }
    if (this.captionBox) {
      this.captionBox.hidden = true;
      if (this.captionsOn && this.video) this.paintCaption(this.video.currentTime);
    }
  }

  /**
   * Shows whichever lines are speaking at `time`. Clips that share a timestamp
   * are two people talking over each other, so they stack rather than one
   * winning, which is how the export draws them too.
   */
  paintCaption(time) {
    const box = this.captionBox;
    if (!box) return;
    if (!this.captionsOn) { box.hidden = true; return; }

    const live = (this.pack.clips || []).filter((c) =>
      c.caption && time >= c.time && time < c.time + Math.max(c.duration || 0, 0.4));

    if (!live.length) {
      if (!box.hidden) box.hidden = true;
      return;
    }

    const key = live.map((c) => c.base).join('|');
    if (key === this._captionKey) { box.hidden = false; return; }
    this._captionKey = key;

    box.innerHTML = live.map((c) => {
      const colour = this.characterColour(c.character);
      const who = c.character
        ? `<b style="color:${colour}">${escapeHtml(c.character)}:</b> `
        : '';
      return `<span class="editor-caption-line">${who}${escapeHtml(c.caption)}</span>`;
    }).join('');
    box.hidden = false;
  }

  /** The same colour the export and the line list give this character. */
  characterColour(name) {
    const set = (this.settings && this.settings.characterColors) || {};
    if (name && set[name]) return set[name];
    return 'var(--accent)';
  }

  /**
   * Every picture already in the pack, with who uses it.
   *
   * Clips do not borrow each other's pictures automatically: two people can
   * share a name and still look different, and guessing wrong is worse than
   * showing nothing. Reuse is offered instead, and a reused picture is pointed
   * at rather than copied, so one file serves however many lines want it.
   */
  packPictures() {
    const byFile = new Map();
    for (const clip of this.pack.clips || []) {
      if (!clip.imageUrl || !clip.image) continue;
      if (!byFile.has(clip.image)) {
        byFile.set(clip.image, { file: clip.image, url: clip.imageUrl, users: [] });
      }
      byFile.get(clip.image).users.push(clip.character || clip.base);
    }
    return [...byFile.values()];
  }

  // Pack details

  /**
   * The fields the game shows in its Customize menu. These used to be settable
   * only when a pack was first created, which meant a typo in a title was
   * permanent unless you opened the ini by hand.
   */
  renderPackDetails(panel) {
    const pack = this.pack;
    panel.innerHTML = `
      <div class="pack-detail-icon">
        ${pack.iconUrl ? `<img src="${pack.iconUrl}" alt="" />`
    : '<div class="editor-portrait-blank small">No icon</div>'}
        <button type="button" class="btn btn-small" data-act="pick-icon">Choose an icon…</button>
        <button type="button" class="btn btn-small" data-act="grab-icon">Use this frame</button>
      </div>
      <label class="field"><span>Title</span>
        <input class="input" data-info="title" placeholder="What the pack is called" /></label>
      <label class="field"><span>Subtitle</span>
        <input class="input" data-info="subtitle" placeholder="A short line under the title" /></label>
      <label class="field"><span>Author</span>
        <input class="input" data-info="authors" placeholder="Who made it" /></label>
      <label class="field"><span>Notes</span>
        <textarea class="input" rows="3" data-info="readme"
                  placeholder="Anything worth telling whoever installs this"></textarea></label>
      <p class="muted small">Saved into _pack_info.ini, which is what the game reads.</p>`;

    // Set as properties, not attributes: titles and notes contain quotes.
    const fields = {};
    for (const input of panel.querySelectorAll('[data-info]')) {
      fields[input.dataset.info] = input;
    }
    fields.title.value = pack.title || '';
    fields.subtitle.value = pack.subtitle || '';
    fields.authors.value = (pack.authors || []).join(', ');
    fields.readme.value = pack.readme || '';

    const save = async () => {
      const patch = {
        title: fields.title.value.trim(),
        subtitle: fields.subtitle.value.trim(),
        authors: fields.authors.value.split(',').map((s) => s.trim()).filter(Boolean),
        readme: fields.readme.value.trim(),
      };
      const result = await this.api.content.writePackInfo({ dir: this.pack.dir, patch });
      if (!result.ok) {
        this.toast(`Could not save that: ${result.error}`, 'error', 7000);
        return;
      }
      Object.assign(this.pack, patch);
      const heading = this.root.querySelector('.editor-title h2');
      if (heading && patch.title) heading.textContent = patch.title;
      if (this.onChanged) await this.onChanged(this.pack.id, { keepEditor: true });
      this.toast('Pack details saved.', 'ok', 1500);
    };
    for (const input of Object.values(fields)) input.addEventListener('change', save);

    panel.querySelector('[data-act="pick-icon"]').addEventListener('click', async () => {
      const picked = await this.api.dialog.pickFiles({ title: 'Pack icon', kind: 'image' });
      if (!picked.length) return;
      await this.importFiles([picked[0]], { baseName: '_icon', kind: 'image', overwrite: true });
      if (this.onChanged) await this.onChanged(this.pack.id);
    });

    panel.querySelector('[data-act="grab-icon"]').addEventListener('click', async () => {
      const frame = this.video && this.captureFrame(this.video);
      if (!frame) { this.toast('Nothing to grab yet. Let the video load first.', 'warn'); return; }
      const result = await this.api.content.saveImage({
        destDir: this.pack.dir, base: '_icon', dataUrl: frame,
      });
      if (!result.ok) { this.toast(`Could not save it: ${result.error}`, 'error', 7000); return; }
      this.toast('Icon set from the video.', 'ok');
      if (this.onChanged) await this.onChanged(this.pack.id);
    });
  }

  // Backing track

  /**
   * Builds the pack's backing track from the video by quietening it under every
   * line. See convert.buildBackingTrack for why it works this way rather than
   * trying to separate the voice out.
   */
  async makeBackingTrack() {
    const pack = this.pack;
    const clips = (pack.clips || []).filter((c) => Number.isFinite(c.time) && c.duration > 0);

    if (!pack.videoPath) { this.toast('This pack has no video to work from.', 'warn', 6000); return; }
    if (!clips.length) {
      this.toast('Cut some clips first. The backing track is built from where they sit.', 'warn', 7000);
      return;
    }

    const replacing = Boolean(pack.backingPath);
    const answer = await this.ask({
      title: replacing ? 'Replace the backing track?' : 'Build a backing track?',
      detail: `The video's own audio is used, quietened under each of the ${clips.length} lines `
        + 'so your dub sits in front of it.\n\n'
        + 'MUFFLE keeps the scene going underneath. The music and room tone are still there, '
        + 'dulled and turned down, so it sounds like the original with the voices pushed back. '
        + 'This is almost always what you want.\n\n'
        + 'SILENCE cuts it to nothing under each line. Cleaner, but the scene drops away every '
        + 'time somebody speaks, which can sound like the audio broke.\n\n'
        + 'Either way, music playing underneath a line is affected along with the voice.'
        + (replacing ? '\n\nThe current backing track is overwritten.' : ''),
      buttons: ['Muffle (recommended)', 'Silence', 'Cancel'],
      mark: '♪',
    });
    if (answer !== 0 && answer !== 1) return;

    // Let go of the existing track before it is overwritten. The lane keeps an
    // <audio> element pointed at the file, and Windows will not let anything
    // replace a file another handle still has open, so building a second track
    // straight after a first one failed with a permission error.
    this.releaseBackingAudio();

    const result = await this.run('Building the backing track…', (jobId) =>
      this.api.content.buildBacking({
        jobId,
        packDir: pack.dir,
        videoPath: pack.videoPath,
        ranges: clips.map((c) => ({ start: c.time, duration: c.duration })),
        mode: answer === 1 ? 'silence' : 'muffle',
      }));

    if (result.cancelled) return;
    if (!result.ok) {
      this.toast(`Could not build it: ${result.error}`, 'error', 8000);
      return;
    }
    this.toast(
      `Backing track ${result.mode === 'silence' ? 'built, silent' : 'built, muffled'} under `
      + `${result.ducked} line${result.ducked === 1 ? '' : 's'}.`,
      'ok', 6000
    );

    if (this.onChanged) await this.onChanged(pack.id, { keepEditor: true });

    // The lane is built from the pack as it was when the editor opened, so a
    // track that did not exist then has nowhere to appear. Rebuilding the
    // controls puts it there straight away rather than on the next visit.
    this.rebuildBackingLane();
  }

  /**
   * Rebuilds the backing lane against the pack's current state.
   *
   * Used after building or replacing a track, which is the one change that can
   * make the lane appear from nothing or need a different file behind it.
   */
  rebuildBackingLane() {
    const controls = this.root.querySelector('.editor-controls');
    if (!controls || !this.video) return;

    this.releaseBackingAudio();
    this.setupBackingLane(controls, this.video);
  }

  /**
   * Closes the lane's handle on the backing track file.
   *
   * Clearing `src` and calling `load()` is what actually makes the browser let
   * the file go; pausing alone leaves it open. That matters because anything
   * writing over the file, on Windows, cannot do so while a handle is held.
   */
  releaseBackingAudio() {
    if (this.backingAudio) {
      this.backingAudio.pause();
      this.backingAudio.removeAttribute('src');
      this.backingAudio.load();
      this.backingAudio = null;
    }
    if (this._backingSync) { clearInterval(this._backingSync); this._backingSync = null; }
    this.backingPeaks = null;
    this.backingDuration = 0;
  }

  // Trimming the video

  toggleTrim(button) {
    if (this.trim) { this.endTrim(); return; }
    if (!this.video || !this.video.duration) {
      this.toast('Let the video load first.', 'warn');
      return;
    }
    this.video.pause();
    button.classList.add('on');
    // The panel sits at the bottom over the picture rather than covering it,
    // because choosing where to cut means watching the frame you are cutting.
    this.cropLayer.classList.add('trimming');
    this.trim = new TrimBar(this.cropLayer, {
      duration: this.video.duration,
      onPreview: (time) => { this.video.currentTime = time; },
      onApply: (range) => this.applyTrim(range),
      onCancel: () => this.endTrim(),
    });
    this.cropLayer.hidden = false;
  }

  endTrim() {
    if (this.trim) { this.trim.destroy(); this.trim = null; }
    if (this.cropLayer) {
      this.cropLayer.hidden = true;
      this.cropLayer.classList.remove('trimming');
    }
    const button = this.root.querySelector('[data-act="trim"]');
    if (button) button.classList.remove('on');
  }

  /**
   * Cuts the video down to the chosen range.
   *
   * Everything in the pack is timed against the video, so dropping seconds off
   * the front moves every clip with it. Both the video and the timestamps have
   * to change together or the whole dub slips, and undo has to put both back.
   */
  async applyTrim(range) {
    const pack = this.pack;
    this.endTrim();

    const clipsBefore = (pack.clips || []).map((c) => ({
      base: c.base,
      time: c.time,
      caption: c.caption || '',
      character: c.character || '',
      image: c.image || '',
    }));

    const result = await this.run('Trimming the video…', (jobId) => this.api.content.trimVideo({
      jobId,
      packDir: pack.dir,
      videoPath: pack.videoPath,
      start: range.start,
      end: range.end,
    }));

    if (!result.ok) {
      if (!result.cancelled) this.toast(`Could not trim it: ${result.error}`, 'error', 8000);
      return;
    }

    // Clips move with the picture. Any that fall outside what is left keep a
    // clamped time rather than vanishing, since deleting someone's work as a
    // side effect of a trim would be worse than leaving it at zero.
    const shifted = clipsBefore.map((c) => ({
      ...c,
      time: Math.max(0, Math.min(c.time + result.shift, result.nowSeconds)),
    }));
    await this.writeClipTimes(shifted);

    // Counted against where the cut actually landed, which can be a fraction of
    // a second earlier than asked if it was nudged onto a keyframe.
    const lost = clipsBefore.filter((c) =>
      c.time < result.from - 0.01 || c.time > result.to + 0.01).length;
    this.toast(
      `Trimmed to ${result.nowSeconds.toFixed(1)}s.`
      + (lost ? ` ${lost} clip${lost > 1 ? 's' : ''} fell outside and moved to the edge.` : ''),
      lost ? 'warn' : 'ok',
      lost ? 8000 : 4000
    );

    const reopen = async () => {
      if (this.onChanged) await this.onChanged(pack.id);
    };

    this.push({
      label: 'trim video',
      undo: async () => {
        // Checked, because putting the original back is the whole undo. Going on
        // to move the timestamps after it failed would leave the clips lined up
        // against a video that is still trimmed.
        const back = await this.api.content.restoreClip({ moved: result.moved });
        if (!back.ok) throw new Error(back.error || 'the original video could not be put back');
        await this.writeClipTimes(clipsBefore);
        await reopen();
      },
      redo: async (jobId) => {
        // The same range as the first time, against the restored original, so it
        // lands in the same place rather than compounding onto an earlier cut.
        const again = await this.api.content.trimVideo({
          jobId, packDir: pack.dir, videoPath: pack.videoPath,
          start: range.start, end: range.end,
        });
        if (!again.ok) {
          const err = new Error(again.error);
          err.cancelled = Boolean(again.cancelled);
          throw err;
        }
        result.moved = again.moved;
        await this.writeClipTimes(shifted);
        await reopen();
      },
    });

    await reopen();
  }

  /** Writes a set of clip timestamps back, leaving everything else as it was. */
  async writeClipTimes(clips) {
    for (const clip of clips) {
      await this.api.content.writeClipMeta({
        destDir: this.pack.dir,
        base: clip.base,
        meta: {
          caption: clip.caption || '',
          character: clip.character || '',
          image: clip.image || `${clip.base}.png`,
          timestamp: clip.time,
        },
      });
    }
  }

  // Captions

  /**
   * Cuts a clip at the playhead so a caption can be typed straight in. Its
   * length runs to the next clip, capped at the game's limit, which is almost
   * always what you want when captioning a line you just heard.
   */
  async addCaptionAtPlayhead(video) {
    const start = video.currentTime;
    const max = (this.timeline && this.timeline.maxClip) || 6;

    const next = (this.pack.clips || [])
      .map((c) => c.time)
      .filter((t) => t > start + 0.05)
      .sort((a, b) => a - b)[0];

    const room = next != null ? next - start : (video.duration || start + max) - start;
    const duration = Math.max(0.3, Math.min(max, room));

    if (duration < 0.3) {
      this.toast('No room for a clip here. Move the playhead somewhere clearer.', 'warn', 6000);
      return;
    }

    const clipList = this.root.querySelector('[data-role="clips"]');
    await this.addClip(start, duration, video, clipList);

    // Straight into typing, which is the whole point of the button.
    const row = this.root.querySelector(`.clip-row[data-base="${CSS.escape(this._lastAdded || '')}"]`);
    const field = row && row.querySelector('[data-field="caption"]');
    if (field) { field.focus(); field.scrollIntoView({ block: 'nearest' }); }
  }

  /**
   * The backing track as a second lane under the timeline.
   *
   * It used to be a button that played the track on its own, which told you
   * what the track sounded like but not how it sat against the dub. Here it
   * follows the video: same playhead, same view window, playing together, so
   * you hear the mix you are actually building and can see where the ducking
   * landed against the lines above it.
   */
  setupBackingLane(controls, video) {
    const lane = controls.querySelector('[data-role="backing-lane"]');
    if (!lane) return;

    lane.hidden = !this.pack.backingUrl;
    if (!this.pack.backingUrl) return;

    const canvas = controls.querySelector('[data-role="backing-wave"]');

    const audio = new Audio(this.pack.backingUrl);
    audio.preload = 'auto';
    this.backingAudio = audio;
    this.backingCanvas = canvas;

    // The video is the clock. The track chases it rather than running its own
    // timeline, because two independent players drift apart within seconds.
    const DRIFT = 0.25;
    const sync = () => {
      if (Math.abs(audio.currentTime - video.currentTime) > DRIFT) {
        audio.currentTime = Math.min(video.currentTime, audio.duration || video.currentTime);
      }
    };

    video.addEventListener('play', () => {
      sync();
      if (this.listening === 'backing') audio.play().catch(() => {});
    });
    video.addEventListener('pause', () => audio.pause());
    video.addEventListener('seeked', sync);
    video.addEventListener('ratechange', () => { audio.playbackRate = video.playbackRate; });

    // A gentle correction while playing, rather than a jump every frame.
    this._backingSync = setInterval(() => {
      if (!video.paused) sync();
    }, 1000);

    this.listenTo('video');

    this.drawBackingWave();
    new ResizeObserver(() => this.drawBackingWave()).observe(canvas);
    this.loadBackingPeaks();
  }

  /**
   * Picks which of the two you are hearing.
   *
   * They used to play together, which sounded like a mess and made it
   * impossible to tell whether the backing track was right: the video's own
   * dialogue was still in there underneath it. One at a time is the only way
   * to check the track actually does what you asked for.
   */
  listenTo(which) {
    this.listening = which;

    for (const button of this.root.querySelectorAll('[data-listen]')) {
      button.classList.toggle('on', button.dataset.listen === which);
    }

    const note = this.root.querySelector('[data-role="backing-note"]');
    if (note) {
      note.textContent = which === 'backing'
        ? 'The video is muted. You are hearing the backing track alone.'
        : 'Press play. Only the one selected is audible.';
    }

    const video = this.video;
    const audio = this.backingAudio;
    if (!video) return;

    if (which === 'backing') {
      video.muted = true;
      if (audio) {
        audio.volume = 1;
        audio.currentTime = video.currentTime;
        if (!video.paused) audio.play().catch(() => {});
      }
    } else {
      video.muted = false;
      if (audio) audio.pause();
    }
  }

  /** Decodes the backing track once, for the waveform under the timeline. */
  async loadBackingPeaks() {
    try {
      const res = await fetch(this.pack.backingUrl);
      const bytes = await res.arrayBuffer();
      const ctx = new AudioContext();
      const buffer = await ctx.decodeAudioData(bytes);
      this.backingPeaks = computePeaks(buffer);
      this.backingDuration = buffer.duration;
      ctx.close();
      this.drawBackingWave();
    } catch {
      // The lane still works as a control strip without its picture.
    }
  }

  /**
   * Draws the backing waveform across the same window the timeline is showing,
   * so the two line up and a duck can be seen under the clip that caused it.
   */
  drawBackingWave() {
    const canvas = this.backingCanvas;
    const timeline = this.timeline;
    if (!canvas || !timeline) return;

    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;

    const dpr = window.devicePixelRatio || 1;
    if (canvas.width !== Math.round(rect.width * dpr)) {
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
    }

    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, rect.width, rect.height);

    const css = getComputedStyle(document.documentElement);
    const colour = (name, fallback) => (css.getPropertyValue(name) || fallback).trim();

    ctx.fillStyle = colour('--bg-sunken', '#08111a');
    ctx.fillRect(0, 0, rect.width, rect.height);

    const peaks = this.backingPeaks;
    const duration = this.backingDuration || timeline.duration;

    if (peaks && peaks.length && duration) {
      const mid = rect.height / 2;
      ctx.fillStyle = colour('--ok', '#4ade80');
      ctx.globalAlpha = 0.65;

      for (let x = 0; x < rect.width; x++) {
        const t0 = timeline.xToTime(x);
        const t1 = timeline.xToTime(x + 1);
        if (t1 < 0 || t0 > duration) continue;

        const i0 = Math.floor((t0 / duration) * peaks.length);
        const i1 = Math.max(i0 + 1, Math.floor((t1 / duration) * peaks.length));

        let peak = 0;
        for (let i = Math.max(0, i0); i < Math.min(peaks.length, i1); i++) {
          if (peaks[i] > peak) peak = peaks[i];
        }
        const h = Math.max(0.5, peak * (rect.height / 2) * 0.9);
        ctx.fillRect(x, mid - h, 1, h * 2);
      }
      ctx.globalAlpha = 1;
    } else {
      ctx.fillStyle = colour('--muted', '#8ea9c0');
      ctx.font = '11px system-ui, sans-serif';
      ctx.fillText('Reading the backing track…', 8, rect.height / 2 + 4);
    }

    // The same playhead as the timeline above, so they read as one view.
    const x = Math.round(timeline.timeToX(timeline.playhead)) + 0.5;
    if (x >= 0 && x <= rect.width) {
      ctx.strokeStyle = colour('--bad', '#f87171');
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, rect.height);
      ctx.stroke();
    }
  }

  /** Decodes the preview audio once and hands the timeline its peaks. */
  async loadWaveform(timeline) {
    if (!this.pack.videoUrl) return;
    try {
      const res = await fetch(this.pack.videoUrl);
      const bytes = await res.arrayBuffer();
      const ctx = new AudioContext();
      const buffer = await ctx.decodeAudioData(bytes);
      timeline.setPeaks(computePeaks(buffer));
      ctx.close();
    } catch {
      // A timeline without a waveform still works; it is only a guide.
    }
  }

  /**
   * Applies a drag. Moving a clip only rewrites its timestamp, but changing
   * where it starts or ends means the audio itself has to be cut again.
   */
  async commitClipChange(clip, change, clipList) {
    const pack = this.pack;
    const before = { start: change.previousStart, duration: change.previousDuration };

    // Moving a clip only rewrites its timestamp.
    const move = async (start) => {
      const result = await this.api.content.writeClipMeta({
        destDir: pack.dir,
        base: clip.base,
        meta: {
          caption: clip.caption || '',
          character: clip.character || '',
          image: clip.image || `${clip.base}.png`,
          timestamp: start,
        },
      });
      if (!result.ok) throw new Error(result.error);
      clip.time = start;
      this.refreshClips();
    };

    // Retiming has to cut the audio again so the file matches the block.
    const retime = async (start, duration) => {
      const result = await this.run('Recutting the clip…', () => this.api.content.extractClip({
        source: pack.videoPath,
        destDir: pack.dir,
        baseName: clip.base,
        start,
        duration,
        meta: {
          caption: clip.caption || '',
          character: clip.character || '',
          image: clip.image || `${clip.base}.png`,
        },
        overwrite: true,
      }));
      if (!result.ok) throw new Error(result.error);
      clip.time = start;
      clip.duration = duration;
      if (this.onChanged) await this.onChanged(pack.id, { keepEditor: true });
      this.refreshClips();
    };

    try {
      if (!change.resized) {
        await move(change.start);
        this.toast(`Moved to ${fmt(change.start)}.`, 'ok', 1600);
        this.push({
          label: 'move clip',
          undo: () => move(before.start),
          redo: () => move(change.start),
        });
      } else {
        await retime(change.start, change.duration);
        this.toast(`Retimed to ${fmt(change.start)}, ${change.duration.toFixed(2)}s.`, 'ok', 2000);
        this.push({
          label: 'retime clip',
          undo: () => retime(before.start, before.duration),
          redo: () => retime(change.start, change.duration),
        });
      }
    } catch (err) {
      this.toast(`Could not save that: ${err.message}`, 'error', 8000);
      this.refreshClips();
    }
  }

  /** Cuts the marked range out of the video and writes its metadata. */
  async addClip(start, duration, video, clipList) {
    const pack = this.pack;
    const index = (pack.clipCount || 0) + 1;
    const base = clipFileName(index, `clip_${Math.round(start * 1000)}`);

    const result = await this.run('Cutting the clip from the video…', () =>
      this.api.content.extractClip({
        source: pack.videoPath,
        destDir: pack.dir,
        baseName: base,
        start,
        duration,
        meta: { caption: '', character: '' },
      }));

    if (!result.ok) {
      this.toast(`Could not cut that clip: ${result.error}`, 'error', 8000);
      return;
    }

    // A frame from the middle of the range makes a sensible default picture.
    const wasAt = video.currentTime;
    video.currentTime = start + duration / 2;
    await new Promise((resolve) => video.addEventListener('seeked', resolve, { once: true }));
    const frame = this.captureFrame(video);
    if (frame) {
      await this.api.content.saveImage({ destDir: pack.dir, base: result.base, dataUrl: frame });
    }
    video.currentTime = wasAt;

    pack.clipCount = index;
    this._lastAdded = result.base;
    this.toast(`Added ${result.base}.`, 'ok');
    if (this.onChanged) await this.onChanged(pack.id, { keepEditor: true });

    // The rescan replaced the pack object, so the timeline needs the new list.
    if (this.timeline) {
      this.timeline.setClips(this.pack.clips || []);
      this.timeline.select(result.base);
    }
    this.renderClipList(clipList);
  }

  /** Grabs the current video frame as a PNG data URL. */
  captureFrame(video) {
    if (!video.videoWidth) return null;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/png');
  }

  renderClipList(container) {
    // Anything typed but not yet written goes to disk before the boxes holding
    // it are thrown away. Rebuilding the list is how an edit in progress used to
    // be lost: the text disappeared and the previous wording came back.
    if (this._pendingEdit) {
      const flush = this._pendingEdit;
      this._pendingEdit = null;
      flush();
    }

    const clips = this.pack.clips || [];
    container.innerHTML = '';

    if (!clips.length) {
      container.innerHTML = '<p class="muted small">No clips yet. Mark a range on the video and add one.</p>';
      return;
    }

    // Everyone already speaking in this pack, offered as suggestions on each
    // line. Typing a name out every time invites a misspelling, and a name
    // that differs by one letter is a different character as far as the game,
    // the captions and the colours are concerned. Taken from the clips
    // themselves rather than a stored list, so it follows renames.
    // A native datalist used to do this, and was wrong in three ways at once: the
    // browser drew its own arrow next to ours, it placed the list itself so it
    // ran off the bottom of the window with no way to reach it, and it hid every
    // name that did not match what had been typed, which is exactly when the full
    // list is wanted.
    const known = [...new Set(clips.map((c) => c.character).filter(Boolean))].sort();

    for (const clip of clips) {
      const row = el('div', 'clip-row');
      row.dataset.base = clip.base;
      row.classList.toggle('on', this.timeline && this.timeline.selected === clip.base);

      const hasAudio = Boolean(clip.audio);
      // Its own picture, or the pack's filler image, which is what the game
      // itself falls back to. Marked as borrowed so it is clear which is which.
      const own = Boolean(clip.imageUrl);
      const picture = clip.imageUrl || this.pack.fillerUrl || null;
      row.innerHTML = `
        <div class="clip-head">
          <button type="button" class="line-time">${fmt(clip.time)}</button>
          <span class="clip-name">${escapeHtml(clip.base)}</span>
          <span class="clip-length muted small">${(clip.duration || 0).toFixed(2)}s</span>
          <button type="button" class="icon-btn" data-act="play" title="Play this clip"
                  ${hasAudio ? '' : 'disabled'}>▶</button>
          <button type="button" class="icon-btn danger" data-act="delete" title="Delete this clip">✕</button>
        </div>
        <div class="clip-main">
          <div class="clip-thumb ${picture ? '' : 'blank'}${own ? '' : ' filler'}"
               title="${picture && !own ? 'Using the pack filler image' : ''}">
            ${picture
    ? `<img src="${picture}" alt="" />`
    : '<span>no picture</span>'}
            <div class="clip-pic-actions">
              <button type="button" data-act="grab"
                      title="Take a picture from the video frame showing right now">Grab frame</button>
              <button type="button" data-act="upload"
                      title="Choose a picture file from your computer">Upload</button>
              <button type="button" data-act="reuse"
                      title="Point this line at a picture already in the pack">Reuse</button>
            </div>
          </div>
          <div class="clip-fields">
            <textarea class="input" data-field="caption" rows="2"
                      placeholder="What they say"></textarea>
            <div class="character-field">
              <input class="input" data-field="character"
                     placeholder="Who says it" autocomplete="off" />
              <button type="button" class="character-arrow" data-act="characters"
                      title="Everyone in this pack" tabindex="-1">▾</button>
            </div>
          </div>
        </div>`;

      row.querySelector('[data-act="grab"]').addEventListener('click', () => this.grabClipImage(clip));
      row.querySelector('[data-act="upload"]').addEventListener('click', () => this.uploadClipImage(clip));
      row.querySelector('[data-act="reuse"]').addEventListener('click', () => this.reuseClipImage(clip));

      this.placePictureMenu(row.querySelector('.clip-thumb'));

      // Set through the property, never through the attribute: captions are
      // full of double quotes and putting one in value="" ends the attribute,
      // which silently blanked most of them.
      const [captionInput, characterInput] = row.querySelectorAll('[data-field]');
      captionInput.value = clip.caption || '';
      characterInput.value = clip.character || '';
      this.attachCharacterList(
        row.querySelector('.character-field'), characterInput, known,
        () => characterInput.dispatchEvent(new Event('change', { bubbles: true }))
      );

      row.querySelector('.line-time').addEventListener('click', () => {
        if (this.video) this.video.currentTime = clip.time;
        if (this.timeline) this.timeline.select(clip.base);
        this.renderClipList(container);
      });

      const playBtn = row.querySelector('[data-act="play"]');
      if (hasAudio) playBtn.addEventListener('click', () => this.playClip(clip, playBtn));

      row.querySelector('[data-act="delete"]').addEventListener('click', () => this.deleteClip(clip));

      const write = async (values) => {
        const result = await this.api.content.writeClipMeta({
          destDir: this.pack.dir,
          base: clip.base,
          meta: { ...values, image: clip.image || `${clip.base}.png`, timestamp: clip.time },
        });
        // Checked, because a write that failed used to update the line on screen
        // anyway. The text then sat there looking saved until something reread
        // the pack and put the old wording back.
        if (!result || !result.ok) {
          this.toast(`Could not save that line: ${(result && result.error) || 'unknown error'}`,
            'error', 8000);
          return false;
        }
        clip.caption = values.caption;
        clip.character = values.character;
        if (this.timeline) this.timeline.setClips(this.pack.clips || []);
        return true;
      };

      /**
       * Writes what is in the boxes, if it differs from what the clip holds.
       *
       * Saving only on `change` meant saving only when the field lost focus, and
       * anything that rebuilt the list first, such as picking a clip on the
       * timeline, destroyed the box with the typing still in it. The text
       * vanished and the old wording came back. Typing now saves shortly after
       * it stops, and the list flushes whatever is pending before it rebuilds.
       */
      const commit = async () => {
        const after = { caption: captionInput.value, character: characterInput.value };
        if ((clip.caption || '') === after.caption
          && (clip.character || '') === after.character) return;
        await write(after);
      };

      let idle = null;
      const later = () => {
        clearTimeout(idle);
        this._pendingEdit = commit;
        idle = setTimeout(() => { this._pendingEdit = null; commit(); }, 600);
      };

      // A finished edit is one undo step, whatever it took to type. The starting
      // point is taken when the box is first entered rather than per keystroke.
      let from = null;
      const remember = () => {
        if (!from) from = { caption: clip.caption || '', character: clip.character || '' };
      };
      const settle = async () => {
        clearTimeout(idle);
        this._pendingEdit = null;
        const before = from;
        from = null;
        const after = { caption: captionInput.value, character: characterInput.value };
        if (!before) return;
        if (before.caption === after.caption && before.character === after.character) return;
        if (!await write(after)) return;
        this.push({
          label: 'caption edit',
          undo: async () => { await write(before); this.renderClipList(container); },
          redo: async () => { await write(after); this.renderClipList(container); },
        });
      };

      for (const input of [captionInput, characterInput]) {
        input.addEventListener('focus', remember);
        input.addEventListener('input', () => { remember(); later(); });
        input.addEventListener('change', settle);
        input.addEventListener('blur', settle);
      }

      container.append(row);
    }
  }

  /**
   * Takes a clip's picture from the video.
   *
   * The file is always named after the clip, so the game, the editor and the
   * export all find it the same way without anything having to be pointed at
   * anything else.
   */
  async grabClipImage(clip) {
    if (!this.video || !this.video.videoWidth) {
      this.toast('Let the video load first.', 'warn');
      return;
    }
    const frame = this.captureFrame(this.video);
    const result = await this.api.content.saveImage({
      destDir: this.pack.dir, base: clip.base, dataUrl: frame,
    });
    if (!result.ok) { this.toast(`Could not save it: ${result.error}`, 'error', 7000); return; }

    await this.writeImageRef(clip);
    this.toast(`Picture set for ${clip.base}.`, 'ok', 2000);
    if (this.onChanged) await this.onChanged(this.pack.id, { keepEditor: true });
    this.refreshClips();
  }

  /** Same, from a file, converted to PNG on the way in. */
  async uploadClipImage(clip) {
    const picked = await this.api.dialog.pickFiles({ title: `Picture for ${clip.base}`, kind: 'image' });
    if (!picked.length) return;

    const ok = await this.importFiles([picked[0]], {
      baseName: clip.base, kind: 'image', overwrite: true,
    });
    if (!ok) return;

    await this.writeImageRef(clip);
    if (this.onChanged) await this.onChanged(this.pack.id, { keepEditor: true });
    this.refreshClips();
  }

  /**
   * Picks a picture already in the pack for this clip to use.
   *
   * The metadata points at the existing file rather than copying it, which is
   * what makes this a link: change that one picture later and every clip using
   * it changes too.
   */
  async reuseClipImage(clip) {
    const options = this.packPictures().filter((p) => p.file !== clip.image);
    if (!options.length) {
      this.toast('No other pictures in this pack yet. Grab or upload one first.', 'info', 6000);
      return;
    }

    const sheet = el('div', 'picker-sheet');
    sheet.innerHTML = `
      <div class="picker-card">
        <h4>Reuse a picture for ${escapeHtml(clip.character || clip.base)}</h4>
        <p class="muted small">The clip points at the same file, so editing that picture later
           updates every line using it.</p>
        <div class="picker-grid">
          ${options.map((p) => `
            <button type="button" class="picker-item" data-file="${escapeHtml(p.file)}">
              <img src="${p.url}" alt="" />
              <span class="picker-name">${escapeHtml(p.file)}</span>
              <span class="picker-users muted small">${escapeHtml(
    [...new Set(p.users)].slice(0, 3).join(', '))}</span>
            </button>`).join('')}
        </div>
        <div class="picker-actions">
          ${clip.image ? '<button type="button" class="btn btn-small" data-role="clear">Remove this clip\'s picture</button>' : ''}
          <span class="grow"></span>
          <button type="button" class="btn btn-small" data-role="cancel">Cancel</button>
        </div>
      </div>`;

    const close = () => sheet.remove();
    sheet.addEventListener('click', (e) => { if (e.target === sheet) close(); });
    sheet.querySelector('[data-role="cancel"]').addEventListener('click', close);

    const clearBtn = sheet.querySelector('[data-role="clear"]');
    if (clearBtn) {
      clearBtn.addEventListener('click', async () => {
        close();
        await this.setClipImage(clip, '');
      });
    }

    for (const button of sheet.querySelectorAll('.picker-item')) {
      button.addEventListener('click', async () => {
        close();
        await this.setClipImage(clip, button.dataset.file);
      });
    }

    this.root.append(sheet);
  }

  /** Writes which picture file a clip uses, or none. */
  async setClipImage(clip, file) {
    const before = clip.image || '';
    const write = async (value) => {
      const result = await this.api.content.writeClipMeta({
        destDir: this.pack.dir,
        base: clip.base,
        meta: {
          caption: clip.caption || '',
          character: clip.character || '',
          image: value,
          timestamp: clip.time,
        },
      });
      if (!result.ok) throw new Error(result.error);
      clip.image = value;
      if (this.onChanged) await this.onChanged(this.pack.id, { keepEditor: true });
      this.refreshClips();
    };

    try {
      await write(file);
      this.toast(file ? `Now using ${file}.` : 'Picture removed.', 'ok', 2500);
      this.push({
        label: 'clip picture',
        undo: () => write(before),
        redo: () => write(file),
      });
    } catch (err) {
      this.toast(`Could not save that: ${err.message}`, 'error', 7000);
    }
  }

  /** Points a clip's metadata at its picture, keeping the name in step. */
  async writeImageRef(clip) {
    clip.image = `${clip.base}.png`;
    await this.api.content.writeClipMeta({
      destDir: this.pack.dir,
      base: clip.base,
      meta: {
        caption: clip.caption || '',
        character: clip.character || '',
        image: clip.image,
        timestamp: clip.time,
      },
    });
  }

  /**
   * Opens a clip's picture buttons to the left of its thumbnail.
   *
   * Positioned from script rather than in the stylesheet because the clip list
   * scrolls, and a scrolling box clips on both axes even when only one is set
   * to scroll. An absolutely placed panel reaching left, out of that box, was
   * simply cut in half. Fixed coordinates escape it entirely.
   *
   * It flips to the right if there is no room on the left, so the buttons stay
   * reachable on a narrow window instead of running off the edge.
   */
  /**
   * The list of names beside a line's character box.
   *
   * Always offers everyone in the pack, whatever has been typed. What is typed
   * moves the matches to the top rather than hiding the rest, because reaching
   * for the list usually means not remembering the exact spelling, which is the
   * moment a filter is least helpful.
   *
   * Placed with fixed coordinates and flipped above the box when there is no
   * room below, so it can always be reached near the bottom of the window.
   */
  attachCharacterList(field, input, names, onPick) {
    const button = field.querySelector('[data-act="characters"]');
    if (!button || !names.length) {
      if (button) button.hidden = true;
      return;
    }

    let list = null;
    const close = () => {
      if (!list) return;
      list.remove();
      list = null;
      document.removeEventListener('pointerdown', onAway, true);
      window.removeEventListener('resize', close);
      field.classList.remove('open');
    };
    const onAway = (event) => {
      if (list && !list.contains(event.target) && !field.contains(event.target)) close();
    };

    const open = () => {
      if (list) { close(); return; }

      const typed = input.value.trim().toLowerCase();
      const ordered = typed
        ? [...names].sort((a, b) => {
          const am = a.toLowerCase().startsWith(typed) ? 0 : a.toLowerCase().includes(typed) ? 1 : 2;
          const bm = b.toLowerCase().startsWith(typed) ? 0 : b.toLowerCase().includes(typed) ? 1 : 2;
          return am - bm || a.localeCompare(b);
        })
        : names;

      list = el('div', 'character-list');
      list.innerHTML = ordered.map((name) =>
        `<button type="button" data-name="${escapeHtml(name)}">${escapeHtml(name)}</button>`).join('');
      document.body.append(list);
      field.classList.add('open');

      const box = input.getBoundingClientRect();
      const height = list.offsetHeight;
      const below = window.innerHeight - box.bottom - 8;
      list.style.left = `${Math.round(box.left)}px`;
      list.style.width = `${Math.round(box.width)}px`;
      // Above when it will not fit below, and never past the top of the window.
      if (height > below && box.top > below) {
        list.style.top = `${Math.round(Math.max(8, box.top - height - 4))}px`;
      } else {
        list.style.top = `${Math.round(box.bottom + 4)}px`;
        list.style.maxHeight = `${Math.max(80, below)}px`;
      }

      list.addEventListener('click', (event) => {
        const name = event.target.dataset && event.target.dataset.name;
        if (!name) return;
        input.value = name;
        close();
        onPick();
      });

      document.addEventListener('pointerdown', onAway, true);
      window.addEventListener('resize', close);
    };

    button.addEventListener('click', open);
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') close();
    });
  }

  placePictureMenu(thumb) {
    if (!thumb) return;
    const menu = thumb.querySelector('.clip-pic-actions');
    if (!menu) return;

    const place = () => {
      const at = thumb.getBoundingClientRect();
      // Measured while shown, since a hidden element reports no size.
      menu.style.visibility = 'hidden';
      menu.style.display = 'flex';
      const size = menu.getBoundingClientRect();
      menu.style.display = '';
      menu.style.visibility = '';

      const GAP = 8;
      const room = at.left - GAP;
      const toLeft = room >= size.width;

      menu.classList.toggle('flipped', !toLeft);
      menu.style.left = toLeft
        ? `${at.left - size.width - GAP}px`
        : `${at.right + GAP}px`;

      // Centred on the thumbnail, then kept on screen.
      const wanted = at.top + at.height / 2 - size.height / 2;
      const top = Math.max(8, Math.min(wanted, window.innerHeight - size.height - 8));
      menu.style.top = `${top}px`;
    };

    thumb.addEventListener('pointerenter', place);
    // A scroll or resize mid-hover would leave it pointing at nothing.
    thumb.addEventListener('focusin', place);
  }

  /** Plays a single clip so you can hear what you cut. */
  playClip(clip, button) {
    if (this.clipAudio) {
      this.clipAudio.pause();
      if (this.clipButton) this.clipButton.textContent = '▶';
      if (this.clipAudio.dataset.base === clip.base) {
        this.clipAudio = null;
        this.clipButton = null;
        return;
      }
    }

    const audio = new Audio(clip.audioUrl);
    audio.dataset.base = clip.base;
    audio.addEventListener('ended', () => { button.textContent = '▶'; this.clipAudio = null; });
    audio.play().catch(() => this.toast('Could not play that clip.', 'warn'));

    button.textContent = '■';
    this.clipAudio = audio;
    this.clipButton = button;
  }

  /** Deletes a clip by moving its files aside, so undo can put them back. */
  async deleteClip(clip) {
    const pack = this.pack;

    // Takes recorded against this line live outside the pack, so deleting the
    // clip left them behind, belonging to a line that no longer exists. Only
    // asked about when there are some.
    let takes = [];
    const found = await this.api.content.clipRecordings({ packDir: pack.dir, base: clip.base });
    if (found && found.ok && found.takes.length) {
      const sessions = new Set(found.takes.map((t) => t.session)).size;
      const answer = await this.ask({
        title: `Delete "${clip.base}"?`,
        detail: `There ${found.takes.length === 1 ? 'is 1 dub recording' : `are ${found.takes.length} dub recordings`} `
          + `of this line, across ${sessions} session${sessions === 1 ? '' : 's'}.\n\n`
          + 'Deleting both leaves nothing behind for a line that is gone. Keeping the recordings '
          + 'leaves them where they are, which is what you want if you still intend to export '
          + 'that take.\n\nEither way this can be undone.',
        buttons: ['Delete both', 'Keep the recordings', 'Cancel'],
        mark: '🗑',
        danger: true,
      });
      if (answer === 2 || answer == null) return;
      if (answer === 0) takes = found.takes;
    }

    const result = await this.run('Deleting the clip…', () =>
      this.api.content.trashClip({ packDir: pack.dir, base: clip.base, takes }));

    if (!result.ok) {
      this.toast(`Could not delete it: ${result.error}`, 'error', 7000);
      return;
    }

    this.toast(takes.length
      ? `Deleted ${clip.base} and ${takes.length} recording${takes.length === 1 ? '' : 's'}.`
      : `Deleted ${clip.base}.`, 'ok');
    this.push({
      label: `delete ${clip.base}`,
      undo: async () => {
        await this.api.content.restoreClip({ moved: result.moved });
        if (this.onChanged) await this.onChanged(pack.id, { keepEditor: true });
        this.refreshClips();
      },
      redo: async () => {
        await this.api.content.trashClip({ packDir: pack.dir, base: clip.base, takes });
        if (this.onChanged) await this.onChanged(pack.id, { keepEditor: true });
        this.refreshClips();
      },
    });

    if (this.onChanged) await this.onChanged(pack.id, { keepEditor: true });
    this.refreshClips();
  }

  /**
   * Repaints whatever the open editor is showing, from the pack as it now is.
   *
   * Called after every change that keeps the editor open. Individual actions
   * used to each remember to refresh their own corner, and the ones that
   * forgot produced the same puzzling symptom every time: the change was on
   * disk, but you had to leave the editor and come back to see it. One place
   * that repaints everything is harder to forget than a dozen.
   */
  refreshAfterChange() {
    if (this.root.hidden) return;

    // Each of these is a no-op when the editor on screen has no such part.
    this.refreshSlots();
    if (this.root.querySelector('[data-role="clips"]')) this.refreshClips();
    if (this.root.querySelector('[data-role="chatter"]')) this.renderChatterList();

    const heading = this.root.querySelector('.pack-head-text h3');
    if (heading && this.pack.title) heading.textContent = this.pack.title;
  }

  /** Repaints the timeline and clip list from the pack's current clips. */
  refreshClips() {
    if (this.timeline) this.timeline.setClips(this.pack.clips || []);
    const list = this.root.querySelector('[data-role="clips"]');
    if (list) this.renderClipList(list);
  }

  // Players

  renderPlayerEditor(body) {
    const pack = this.pack;
    const config = pack.config || {};
    const SLOTS = [
      ['intro_greet', 'Introductory greeting'],
      ['score_0', 'Getting a score of 0'],
      ['score_1', 'Getting a score of 1'],
      ['score_2', 'Getting a score of 2'],
      ['score_3', 'Getting a score of 3'],
      ['score_4', 'Getting a score of 4'],
      ['score_5', 'Getting a score of 5'],
      ['game_winner', 'Game winner'],
      ['game_loser', 'Game loser'],
    ];

    const main = el('div', 'editor-stage');
    main.append(this.buildEditorHeader(
      'A contestant on the show: their picture, their colours, and how they react to a score.'
    ));

    // The picture, as a slot card like every other editor uses, rather than a
    // full width image with a drop zone the same size again underneath it.
    const pictureGroup = el('section', 'slot-group');
    pictureGroup.innerHTML = `
      <h4>Picture</h4>
      <p class="muted small">Not scaled, so a small image stays small. Around 1000 pixels tall
         suits a standing person. A short one is hidden by their podium unless you leave empty
         space below them.</p>
      <div class="slot-grid"></div>`;
    pictureGroup.querySelector('.slot-grid').append(this.buildSlot({
      key: 'player', label: 'Contestant picture', kind: 'image', required: true,
    }));
    main.append(pictureGroup);

    const reactions = el('section', 'slot-group');
    reactions.innerHTML = `
      <h4>Reactions</h4>
      <p class="muted small">Record straight into the app, or use a file. Each is saved into the
         pack and pointed at for you. Leave one empty for silence.</p>
      <div class="slot-grid reaction-grid"></div>`;
    const grid = reactions.querySelector('.slot-grid');
    for (const [key, label] of SLOTS) grid.append(this.buildReactionSlot(key, label, config));
    main.append(reactions);

    body.append(main);
    this.wireBodyDrop(main, [{ key: 'player', label: 'Contestant picture', kind: 'image' }]);

    const side = el('aside', 'editor-side');
    body.append(side);
    this.renderPlayerConfig(side);
  }

  /**
   * One reaction. These differ from every other slot in the app: the file can
   * be called anything, and the config points at it, so the card shows what it
   * is pointed at rather than a fixed filename.
   */
  buildReactionSlot(key, label, config) {
    const assigned = (config.audio_assignment || {})[key] || '';
    const url = assigned && this.pack.slotUrls ? this.pack.slotUrls[assigned] : null;

    const card = el('div', 'slot-card slot-audio');
    card.dataset.slot = key;
    card._slot = { key, label, kind: 'audio', reaction: true };
    card.classList.toggle('filled', Boolean(assigned));

    card.innerHTML = `
      <div class="slot-preview"><span class="slot-glyph">♪</span></div>
      <div class="slot-info">
        <b>${escapeHtml(label)}</b>
        <span class="slot-filename ${assigned ? '' : 'muted'}">${
  escapeHtml(assigned || 'nothing, so this is silent')}</span>
        <span class="slot-timer muted small"></span>
      </div>
      <div class="slot-buttons">
        <button type="button" class="icon-btn" data-act="play" ${assigned ? '' : 'disabled'}
                title="Play this">▶</button>
        <button type="button" class="icon-btn" data-act="rec" title="Record one">●</button>
        <button type="button" class="icon-btn" data-act="pick" title="Choose a file">↑</button>
      </div>`;

    const playBtn = card.querySelector('[data-act="play"]');
    if (assigned) playBtn.addEventListener('click', () => this.playFile(url, playBtn));

    attachRecorder(
      card.querySelector('[data-act="rec"]'),
      card.querySelector('.slot-timer'),
      async (take) => { if (take) await this.saveSlotRecording(key, take, card); },
      {
        maxSeconds: 30,
        onError: (err) => this.toast(err.message, 'error', 7000),
        // Recording writes over whatever is there under the same name, so a
        // slot that already has a sound asks before it starts rather than
        // after the take is already lost.
        beforeStart: assigned
          ? async () => (await this.ask({
            title: `Record over "${assigned}"?`,
            detail: `${label} already has a sound. Recording a new one replaces it, and that `
              + 'cannot be undone.',
            buttons: ['Record over it', 'Keep what is there'],
            mark: '●',
            danger: true,
          })) === 0
          : null,
      }
    );

    card.querySelector('[data-act="pick"]').addEventListener('click', async () => {
      const picked = await this.api.dialog.pickFiles({ title: label, kind: 'audio' });
      if (!picked.length) return;
      await this.run('Adding the sound…', () =>
        this.importFiles([picked[0]], { baseName: key, kind: 'audio', audioFormat: 'wav', overwrite: true }));
      await this.assignSlot(key, key, card);
    });

    for (const event of ['dragenter', 'dragover']) {
      card.addEventListener(event, (e) => { e.preventDefault(); card.classList.add('over'); });
    }
    for (const event of ['dragleave', 'drop']) {
      card.addEventListener(event, () => card.classList.remove('over'));
    }
    card.addEventListener('drop', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const paths = [...(e.dataTransfer.files || [])]
        .map((f) => this.api.pathForFile(f)).filter(Boolean);
      if (!paths.length) return;
      await this.run('Adding the sound…', () =>
        this.importFiles([paths[0]], { baseName: key, kind: 'audio', audioFormat: 'wav', overwrite: true }));
      await this.assignSlot(key, key, card);
    });

    return card;
  }

  renderPlayerConfig(side) {
    const config = this.pack.config || {};
    side.innerHTML = `
      <h3>Contestant</h3>
      <label class="field"><span>Name</span>
        <input class="input" data-cfg="name" placeholder="Player" /></label>
      <p class="muted small">The contestant does not take the pack's name. Left blank they are
         called <b>Player</b>.</p>

      <label class="field"><span>How the host introduces them</span>
        <input class="input" data-cfg="introduction" placeholder="Our next contestant:" /></label>

      <h4 class="side-heading">Colours</h4>
      <p class="muted small">Used for their podium and their score tracker.</p>
      <label class="field"><span>Main</span>
        <div class="colour-row">
          <input type="color" data-cfg="color1" />
          <input class="input" data-cfg="color1-hex" spellcheck="false" />
        </div></label>
      <label class="field"><span>Accent</span>
        <div class="colour-row">
          <input type="color" data-cfg="color2" />
          <input class="input" data-cfg="color2-hex" spellcheck="false" />
        </div></label>`;

    const name = side.querySelector('[data-cfg="name"]');
    name.value = config.name || '';
    const intro = side.querySelector('[data-cfg="introduction"]');
    intro.value = config.introduction || '';

    const save = async (patch, note = true) => {
      if (await this.patchConfig('config_player.json', patch) && note) {
        this.toast('Saved.', 'ok', 1500);
      }
    };

    name.addEventListener('change', async () => {
      await save({ name: name.value.trim() });
      const heading = this.root.querySelector('.pack-head-text h3');
      if (heading) heading.textContent = name.value.trim() || this.pack.title;
      if (this.onChanged) await this.onChanged(this.pack.id, { keepEditor: true });
    });
    intro.addEventListener('change', () => save({ introduction: intro.value.trim() }));

    // The game stores colours without the leading hash, so it is stripped on
    // the way out and put back on the way in.
    for (const which of ['color1', 'color2']) {
      const swatch = side.querySelector(`[data-cfg="${which}"]`);
      const hex = side.querySelector(`[data-cfg="${which}-hex"]`);
      const stored = String(config[which] || (which === 'color1' ? 'accbd1' : 'ffffff'))
        .replace('#', '');
      swatch.value = `#${stored}`;
      hex.value = stored;

      swatch.addEventListener('change', () => {
        hex.value = swatch.value.replace('#', '');
        save({ [which]: hex.value });
      });
      hex.addEventListener('change', () => {
        const clean = hex.value.replace('#', '').trim();
        if (!/^[0-9a-f]{6}$/i.test(clean)) {
          this.toast('A colour is six hex digits, like accbd1.', 'warn', 5000);
          hex.value = swatch.value.replace('#', '');
          return;
        }
        swatch.value = `#${clean}`;
        save({ [which]: clean });
      });
    }
  }

  async saveSlotRecording(key, take, card) {
    const saved = await this.api.content.saveRecording({
      destDir: this.pack.dir,
      base: key,
      bytes: take.bytes,
      audioFormat: 'wav',
    });
    if (!saved.ok) {
      this.toast(`Could not save that take: ${saved.error}`, 'error', 7000);
      return;
    }
    await this.assignSlot(key, saved.base, card);
  }

  /** Points a reaction slot at a file, without disturbing the other slots. */
  async assignSlot(key, base, card) {
    const config = this.pack.config || {};
    const assignment = { ...(config.audio_assignment || {}), [key]: base };
    const result = await this.api.content.writeConfig({
      dir: this.pack.dir,
      file: 'config_player.json',
      patch: { audio_assignment: assignment },
    });
    if (!result.ok) {
      this.toast(`Could not save it: ${result.error}`, 'error', 7000);
      return;
    }
    this.pack.config = result.config;
    this.toast('Saved.', 'ok', 1500);

    // Rescan so the new file has a URL, then rebuild the card from it rather
    // than patching the markup in place and hoping it matches.
    if (this.onChanged) await this.onChanged(this.pack.id, { keepEditor: true });

    const label = card.querySelector('b').textContent;
    card.replaceWith(this.buildReactionSlot(key, label, this.pack.config || {}));
  }


  // Shared furniture for every editor except the dub one

  /**
   * The block every pack editor opens with: what the pack is, what it looks
   * like, and how to get files into it. Having one of these is most of what
   * makes the editors feel like the same app.
   */
  /**
   * The picture at the top of an editor.
   *
   * The cardboard cutout only stands in for a pack that is a person on screen,
   * because that is what the game does with one. A menu or a studio is not a
   * person, and showing a cutout for one said the pack was missing a character
   * picture it never had.
   */
  packIconHtml() {
    const pack = this.pack;
    if (pack.iconUrl) return `<img src="${escapeHtml(pack.iconUrl)}" alt="" />`;
    if (CHARACTER_PACKS.has(pack.type)) {
      return '<img src="../../assets/placeholder.png" alt="No picture yet" class="placeholder-art" />';
    }
    return `<span class="slot-glyph">${TYPE_GLYPH[pack.type] || '📦'}</span>`;
  }

  buildEditorHeader(blurb) {
    const pack = this.pack;
    const icon = this.packIconHtml();

    const head = el('div', 'pack-head');
    head.innerHTML = `
      <div class="pack-head-icon" data-act="view-icon">${icon}</div>
      <div class="pack-head-text">
        <h3>${escapeHtml(pack.title)}</h3>
        <p class="muted">${escapeHtml(blurb)}</p>
        <p class="muted small">Drop files anywhere on this page and each one goes to the slot its
           name matches. Anything in the wrong format is converted for you.</p>
      </div>`;

    if (pack.iconUrl) {
      const box = head.querySelector('[data-act="view-icon"]');
      box.classList.add('clickable');
      box.addEventListener('click', () => this.openViewer(pack.iconUrl, pack.title));
    }
    return head;
  }

  /**
   * Shows a picture at full size.
   *
   * Character art is tall and thin, and judging one from a 52 pixel thumbnail
   * is not really possible, so every picture in an editor can be opened.
   */
  openViewer(url, label) {
    const sheet = el('div', 'viewer-sheet');
    sheet.innerHTML = `
      <figure class="viewer-figure">
        <img src="${url}" alt="" />
        <figcaption>
          <span>${escapeHtml(label || '')}</span>
          <b class="viewer-size" data-role="size"></b>
        </figcaption>
      </figure>
      <button type="button" class="viewer-close" title="Close">✕</button>`;

    const img = sheet.querySelector('img');
    img.addEventListener('load', () => {
      sheet.querySelector('[data-role="size"]').textContent =
        `${img.naturalWidth} × ${img.naturalHeight}`;
    });

    const close = () => {
      sheet.remove();
      document.removeEventListener('keydown', onKey);
    };
    const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };

    sheet.addEventListener('click', (e) => { if (e.target === sheet) close(); });
    sheet.querySelector('.viewer-close').addEventListener('click', close);
    document.addEventListener('keydown', onKey);

    this.root.append(sheet);
  }

  /**
   * Lets a whole set of files be dropped on the editor at once, sending each
   * to the slot whose name it matches.
   *
   * Dropping the five judge pictures in one go is the obvious thing to try,
   * and before this it either did nothing or was mistaken for installing a
   * pack. Files that match nothing are named rather than silently ignored.
   */
  wireBodyDrop(container, slots) {
    for (const event of ['dragenter', 'dragover']) {
      container.addEventListener(event, (e) => {
        e.preventDefault();
        container.classList.add('drop-ready');
      });
    }
    for (const event of ['dragleave', 'drop']) {
      container.addEventListener(event, (e) => {
        if (event === 'dragleave' && container.contains(e.relatedTarget)) return;
        container.classList.remove('drop-ready');
      });
    }

    container.addEventListener('drop', async (e) => {
      // A slot card handles its own drop, so do not also treat it as a loose one.
      if (e.target.closest('.slot-card')) return;
      e.preventDefault();

      const paths = [...(e.dataTransfer.files || [])]
        .map((f) => this.api.pathForFile(f))
        .filter(Boolean);
      if (!paths.length) return;

      const byName = new Map(slots.map((s) => [s.key.toLowerCase(), s]));
      const matched = [];
      const unmatched = [];

      for (const p of paths) {
        const base = p.split(/[\\/]/).pop().replace(/\.[^.]+$/, '').toLowerCase();
        const slot = byName.get(base);
        if (slot) matched.push({ slot, path: p });
        else unmatched.push(p.split(/[\\/]/).pop());
      }

      if (!matched.length) {
        this.toast(
          `Nothing there matches a slot in this pack. Expected names like `
          + `${slots.slice(0, 3).map((s) => s.key).join(', ')}. `
          + 'Drop onto a single slot to use any file for it.',
          'warn', 10000
        );
        return;
      }

      await this.run(`Adding ${matched.length} file${matched.length > 1 ? 's' : ''}…`, async () => {
        for (const { slot, path } of matched) await this.fillSlot(slot, path, { quiet: true });
      });

      this.toast(
        `Added ${matched.length} file${matched.length > 1 ? 's' : ''}.`
        + (unmatched.length ? ` Ignored: ${unmatched.join(', ')}.` : ''),
        unmatched.length ? 'warn' : 'ok',
        unmatched.length ? 9000 : 3000
      );

      if (this.onChanged) await this.onChanged(this.pack.id, { keepEditor: true });
      this.refreshSlots();
    });
  }

  // Slot editors: host, judges, studio, menu

  /**
   * Builds an editor from a pack type's file structure.
   *
   * Every type except dubs and chatter is the same job wearing different
   * clothes: the game looks for particular filenames, and each one either
   * exists or does not. Rather than five editors that each invent their own
   * idea of what a pack holds, this renders whatever packspec.js says the type
   * contains, so adding a file the game supports is a one line change there.
   */
  renderSlotEditor(body, spec) {
    const pack = this.pack;

    const main = el('div', 'editor-stage');
    main.append(this.buildEditorHeader(spec.blurb));

    for (const group of spec.groups) {
      const section = el('section', 'slot-group');
      section.innerHTML = `
        <h4>${escapeHtml(group.title)}</h4>
        ${group.note ? `<p class="muted small">${escapeHtml(group.note)}</p>` : ''}
        <div class="slot-grid"></div>`;
      const grid = section.querySelector('.slot-grid');
      for (const slot of group.slots) grid.append(this.buildSlot(slot));
      main.append(section);
    }

    // The host's dialogue is the bulk of that pack, so it sits with the files
    // rather than being pushed into a side panel.
    if (pack.type === 'host') this.renderHostDialogue(main);

    body.append(main);
    this.wireBodyDrop(main, spec.groups.flatMap((g) => g.slots));

    const side = el('aside', 'editor-side');
    body.append(side);
    this.renderTypeConfig(side, spec);
  }

  /** Finds whichever file fills a slot, whatever extension it uses. */
  slotFile(key) {
    const names = this.pack.fileNames || [];
    const lower = key.toLowerCase();
    return names.find((n) => n.slice(0, n.lastIndexOf('.')).toLowerCase() === lower) || null;
  }

  buildSlot(slot) {
    const file = this.slotFile(slot.key);
    const url = file && this.pack.fileUrls ? this.pack.fileUrls[file] : null;

    const card = el('div', `slot-card slot-${slot.kind}`);
    card.dataset.slot = slot.key;
    // Kept on the element so a refresh can rebuild it without having to look
    // the definition up again.
    card._slot = slot;
    card.classList.toggle('filled', Boolean(file));
    if (slot.required && !file) card.classList.add('missing');

    // An empty character slot shows the cutout the game would stand there, so
    // what is missing looks like what the game will actually do.
    const isCharacter = slot.kind === 'image' && /^(judge[1-5]|host|player)$/.test(slot.key);
    const preview = slot.kind === 'image' && url
      ? `<img src="${url}" alt="" />`
      : isCharacter
        ? '<img src="../../assets/placeholder.png" alt="No picture yet" class="placeholder-art" />'
        : `<span class="slot-glyph">${
          slot.kind === 'audio' ? '♪' : slot.kind === 'video' ? '▶' : slot.kind === 'model' ? '◈' : '🖼'
        }</span>`;

    card.innerHTML = `
      <div class="slot-preview">${preview}</div>
      <div class="slot-info">
        <b>${escapeHtml(slot.label)}</b>
        <span class="slot-filename ${file ? '' : 'muted'}">${
  escapeHtml(file || `${slot.key} (not set)`)}</span>
        ${slot.note ? `<em class="muted small">${escapeHtml(slot.note)}</em>` : ''}
      </div>
      <div class="slot-buttons">
        ${slot.kind === 'audio' && url
    ? '<button type="button" class="icon-btn" data-act="play" title="Play this">▶</button>' : ''}
        <button type="button" class="icon-btn" data-act="pick" title="Choose a file">↑</button>
        ${file
    ? '<button type="button" class="icon-btn danger" data-act="clear" title="Remove this file">✕</button>'
    : ''}
      </div>`;

    card.querySelector('[data-act="pick"]').addEventListener('click', () => this.fillSlot(slot));

    // Judging a tall character cutout from a 52 pixel thumbnail is not really
    // possible, so the preview opens it.
    if (slot.kind === 'image' && url) {
      const box = card.querySelector('.slot-preview');
      box.classList.add('clickable');
      box.title = 'Click to see it full size';
      box.addEventListener('click', () => this.openViewer(url, `${slot.label} — ${file}`));
    }

    const playBtn = card.querySelector('[data-act="play"]');
    if (playBtn) playBtn.addEventListener('click', () => this.playFile(url, playBtn));

    const clearBtn = card.querySelector('[data-act="clear"]');
    if (clearBtn) clearBtn.addEventListener('click', () => this.clearSlot(slot, file));

    for (const event of ['dragenter', 'dragover']) {
      card.addEventListener(event, (e) => { e.preventDefault(); card.classList.add('over'); });
    }
    for (const event of ['dragleave', 'drop']) {
      card.addEventListener(event, () => card.classList.remove('over'));
    }
    card.addEventListener('drop', (e) => {
      e.preventDefault();
      const paths = [...(e.dataTransfer.files || [])]
        .map((f) => this.api.pathForFile(f))
        .filter(Boolean);
      if (paths.length) this.fillSlot(slot, paths[0]);
    });

    return card;
  }

  /** Puts a file into a slot, converted and named the way the game wants. */
  async fillSlot(slot, sourcePath, { quiet = false } = {}) {
    let source = sourcePath;
    if (!source) {
      const picked = await this.api.dialog.pickFiles({
        title: slot.label,
        kind: KIND_ACCEPTS[slot.kind] || 'all',
      });
      if (!picked.length) return;
      source = picked[0];
    }

    // A 3D model is the one thing here ffmpeg cannot touch, so it is copied
    // rather than converted and has to already be the right format.
    if (slot.kind === 'model' && !/\.(glb|gltf)$/i.test(source)) {
      this.toast('A studio model has to be a .glb or .gltf file.', 'error', 7000);
      return;
    }

    // Music is stored as OGG, everything else as WAV. A button click wants WAV,
    // which decodes instantly and costs nothing at a few kilobytes, but a music
    // loop is minutes long and the same choice turns a four megabyte song into a
    // hundred megabyte file the game has to load whole.
    const doImport = () => this.importFiles([source], {
      baseName: slot.key,
      kind: slot.kind === 'model' ? undefined : slot.kind,
      overwrite: true,
      audioFormat: slot.audioFormat || 'wav',
    }, { quiet });

    // A batch drop reports once at the end rather than per file.
    const ok = quiet ? await doImport() : await this.run(`Adding ${slot.label.toLowerCase()}…`, doImport);
    if (!ok || quiet) return;

    if (this.onChanged) await this.onChanged(this.pack.id, { keepEditor: true });
    this.refreshSlots();
  }

  /** Removes a slot's file, keeping it so the removal can be undone. */
  async clearSlot(slot, file) {
    const base = file.slice(0, file.lastIndexOf('.'));
    const result = await this.run('Removing…', () =>
      this.api.content.trashClip({ packDir: this.pack.dir, base }));

    if (!result.ok) {
      this.toast(`Could not remove it: ${result.error}`, 'error', 7000);
      return;
    }

    this.toast(`Removed ${file}.`, 'ok', 2500);
    const refresh = async () => {
      if (this.onChanged) await this.onChanged(this.pack.id, { keepEditor: true });
      this.refreshSlots();
    };
    this.push({
      label: `remove ${file}`,
      undo: async () => { await this.api.content.restoreClip({ moved: result.moved }); await refresh(); },
      redo: async () => {
        await this.api.content.trashClip({ packDir: this.pack.dir, base });
        await refresh();
      },
    });
    await refresh();
  }

  /** Repaints every slot from the pack's current files. */
  /**
   * Repaints every slot card on screen from the pack's current files.
   *
   * Driven by what is actually in the page rather than by the type's spec.
   * Going through the spec meant contestant packs, which have no spec entry
   * because their sounds are assignments rather than fixed filenames, refreshed
   * nothing at all: changing a contestant's picture only showed up after
   * leaving the editor and coming back.
   */
  refreshSlots() {
    // The pack's own picture at the top is the one most likely to have just
    // been changed, so it repaints too.
    const head = this.root.querySelector('.pack-head-icon');
    if (head) head.innerHTML = this.packIconHtml();

    for (const card of [...this.root.querySelectorAll('.slot-card[data-slot]')]) {
      const slot = card._slot;
      if (!slot) continue;
      card.replaceWith(slot.reaction
        ? this.buildReactionSlot(slot.key, slot.label, this.pack.config || {})
        : this.buildSlot(slot));
    }
  }

  /** Plays any audio file, used by the slot editors. */
  playFile(url, button) {
    if (this.slotAudio) {
      this.slotAudio.pause();
      if (this.slotButton) this.slotButton.textContent = '▶';
      const same = this.slotAudio.dataset.url === url;
      this.slotAudio = null;
      this.slotButton = null;
      if (same) return;
    }
    if (!url) return;

    const audio = new Audio(url);
    audio.dataset.url = url;
    audio.addEventListener('ended', () => { button.textContent = '▶'; this.slotAudio = null; });
    audio.play().catch(() => this.toast('Could not play that.', 'warn'));
    button.textContent = '■';
    this.slotAudio = audio;
    this.slotButton = button;
  }

  // The JSON config beside a slot editor

  renderTypeConfig(side, spec) {
    const type = this.pack.type;
    if (type === 'host') return this.renderHostConfig(side);
    if (type === 'judges') return this.renderJudgeConfig(side);
    if (type === 'menu') return this.renderMenuConfig(side, spec);

    // Anything with a settings list gets a form built from it. Only types with
    // no settings at all fall through to the note about where the file lives.
    side.innerHTML = '<h3>Config</h3>';
    if (this.renderSettings(side, spec)) return null;
    return this.renderPlainConfig(side, spec);
  }

  /** Writes a patch into the pack's JSON config and keeps the local copy in step. */
  async patchConfig(file, patch) {
    const result = await this.api.content.writeConfig({ dir: this.pack.dir, file, patch });
    if (!result.ok) {
      this.toast(`Could not save that: ${result.error}`, 'error', 7000);
      return false;
    }
    this.pack.config = result.config;
    return true;
  }

  renderHostConfig(side) {
    const config = this.pack.config || {};
    side.innerHTML = `
      <h3>The host</h3>
      <label class="field"><span>Name</span>
        <input class="input" data-cfg="name" placeholder="Shae" /></label>
      <p class="muted small">The host does not take the pack's name. Left blank they are called
         <b>Shae</b>.</p>
      <label class="field"><span>Kind of host</span>
        <select class="select" data-cfg="host_type">
          <option value="basic">Basic</option>
          <option value="advanced">Advanced</option>
        </select></label>

      <h4 class="side-heading">These change as they are spoken</h4>
      <dl class="token-list">
        <div><dt>&lt;host_name&gt;</dt><dd>the name above</dd></div>
        <div><dt>&lt;player&gt;</dt><dd>whoever is up</dd></div>
        <div><dt>&lt;round&gt;</dt><dd>the round now or next</dd></div>
        <div><dt>&lt;points&gt;</dt><dd>points earned this round</dd></div>
      </dl>
      <p class="muted small">Every box below is one text box in game. Press Enter for a line break
         inside one, or add another box to make the host pause and continue.</p>`;

    const name = side.querySelector('[data-cfg="name"]');
    name.value = config.name || '';
    name.addEventListener('change', async () => {
      const value = name.value.trim();
      if (await this.patchConfig('config_host.json', { name: value })) {
        this.toast('Saved.', 'ok', 1500);
        // The pack is titled by the host's name, so the heading follows it.
        const heading = this.root.querySelector('.pack-head-text h3');
        if (heading) heading.textContent = value || 'Shae';
        if (this.onChanged) await this.onChanged(this.pack.id, { keepEditor: true });
      }
    });

    const hostType = side.querySelector('[data-cfg="host_type"]');
    hostType.value = config.host_type || 'basic';
    hostType.addEventListener('change', async () => {
      if (await this.patchConfig('config_host.json', { host_type: hostType.value })) {
        this.toast('Saved.', 'ok', 1500);
      }
    });
  }

  /**
   * The host's dialogue, laid out from whatever the config actually contains.
   *
   * The shape is not fixed: a match mode nests events inside groups, while the
   * Twitch mode puts them straight at the top. Walking for string arrays
   * handles both, and handles a pack that carries something this app has never
   * seen, instead of showing only the parts it was told about.
   */
  renderHostDialogue(main) {
    const config = this.pack.config || {};
    const MODES = {
      match_singleplayer: 'Single player',
      match_multiplayer: 'Multiplayer',
      twitch_standard: 'Twitch mode',
    };

    const wrap = el('div', 'dialogue-wrap');
    const modes = Object.keys(config).filter((k) => config[k] && typeof config[k] === 'object');

    if (!modes.length) {
      wrap.innerHTML = `
        <div class="editor-empty">
          <h3>No dialogue yet</h3>
          <p class="muted">This host has no lines. The game can fill in a starting set for you
             under Extras, then everything shows up here to edit.</p>
        </div>`;
      main.append(wrap);
      return;
    }

    const tabs = el('div', 'seg-tabs dialogue-tabs');
    const panels = el('div', 'dialogue-panels');

    modes.forEach((mode, i) => {
      const tab = el('button', `seg-tab${i === 0 ? ' on' : ''}`, escapeHtml(MODES[mode] || mode));
      tab.type = 'button';
      tab.dataset.mode = mode;
      tab.addEventListener('click', () => {
        for (const t of tabs.children) t.classList.toggle('on', t === tab);
        for (const p of panels.children) p.hidden = p.dataset.mode !== mode;
      });
      tabs.append(tab);

      const panel = el('div', 'dialogue-panel');
      panel.dataset.mode = mode;
      panel.hidden = i !== 0;
      this.buildDialogueTree(panel, config[mode], [mode]);
      panels.append(panel);
    });

    wrap.append(tabs, panels);
    main.append(wrap);
  }

  /** Renders one level of the dialogue tree, recursing until it finds lines. */
  buildDialogueTree(container, node, trail) {
    for (const [key, value] of Object.entries(node || {})) {
      if (Array.isArray(value)) {
        container.append(this.buildDialogueEvent(key, value, [...trail, key]));
      } else if (value && typeof value === 'object') {
        const group = el('section', 'dialogue-group');
        group.innerHTML = `<h4>${escapeHtml(prettyKey(key))}</h4>`;
        this.buildDialogueTree(group, value, [...trail, key]);
        container.append(group);
      }
    }
  }

  /** One dialogue event: a list of text boxes the host says in order. */
  buildDialogueEvent(key, lines, trail) {
    const card = el('div', 'dialogue-event');
    card.innerHTML = `
      <div class="dialogue-event-head">
        <b>${escapeHtml(prettyKey(key))}</b>
        <span class="muted small">${lines.length} box${lines.length === 1 ? '' : 'es'}</span>
        <span class="grow"></span>
        <button type="button" class="btn btn-small" data-act="add">+ Box</button>
      </div>
      <div class="dialogue-boxes"></div>`;

    const boxes = card.querySelector('.dialogue-boxes');
    const current = [...lines];

    const save = async () => {
      const patch = buildNestedPatch(trail, current.filter((s) => s.trim().length));
      if (await this.patchConfig('config_host.json', patch)) this.toast('Saved.', 'ok', 1200);
    };

    const draw = () => {
      boxes.innerHTML = '';
      current.forEach((text, i) => {
        const row = el('div', 'dialogue-box');
        row.innerHTML = `
          <textarea class="input" rows="2"></textarea>
          <button type="button" class="icon-btn danger" data-act="drop" title="Remove this box">✕</button>`;
        // Through the property: dialogue is full of quotes and apostrophes.
        const field = row.querySelector('textarea');
        field.value = text;
        field.addEventListener('change', () => { current[i] = field.value; save(); });
        row.querySelector('[data-act="drop"]').addEventListener('click', () => {
          current.splice(i, 1);
          draw();
          save();
        });
        boxes.append(row);
      });
      card.querySelector('.muted').textContent =
        `${current.length} box${current.length === 1 ? '' : 'es'}`;
    };

    card.querySelector('[data-act="add"]').addEventListener('click', () => {
      current.push('');
      draw();
    });

    draw();
    return card;
  }

  renderJudgeConfig(side) {
    const config = this.pack.config || {};
    side.innerHTML = `
      <h3>Judges</h3>
      <p class="muted small">Names shown under each judge.</p>
      <div class="judge-names"></div>
      <label class="option-row">
        <input type="checkbox" data-cfg="play_voices_with_blips" />
        <span>
          <b>Play score blips for judges who have their own voice</b>
          <em>Off means a judge with their own voice plays only that.</em>
        </span>
      </label>`;

    const list = side.querySelector('.judge-names');
    for (let n = 1; n <= 5; n++) {
      const key = `judge${n}`;
      const row = el('label', 'field');
      row.innerHTML = `<span>Judge ${n}</span><input class="input" />`;
      const input = row.querySelector('input');
      input.value = (config[key] && config[key].name) || '';
      input.placeholder = `Judge ${n}`;
      input.addEventListener('change', async () => {
        const patch = { [key]: { ...(config[key] || {}), name: input.value.trim() } };
        if (await this.patchConfig('config_judges.json', patch)) {
          this.toast('Saved.', 'ok', 1500);
        }
      });
      list.append(row);
    }

    const blips = side.querySelector('[data-cfg="play_voices_with_blips"]');
    blips.checked = config.play_voices_with_blips !== false;
    blips.addEventListener('change', async () => {
      if (await this.patchConfig('config_judges.json', {
        play_voices_with_blips: blips.checked,
      })) this.toast('Saved.', 'ok', 1500);
    });
  }

  renderMenuConfig(side, spec) {
    const hasVideo = Boolean(this.slotFile('video'));

    side.innerHTML = '<h3>Menu options</h3>';
    this.renderSettings(side, spec, {
      // Nothing to apply it to until the pack has a video.
      disable: (field) => field.path === 'audio.use_video' && !hasVideo,
    });
  }

  // Config forms built from a pack type's settings list

  /** Reads a dotted path out of a config, or undefined. */
  static at(config, path) {
    let node = config;
    for (const part of path.split('.')) {
      if (node == null || typeof node !== 'object') return undefined;
      node = node[part];
    }
    return node;
  }

  /** Builds the nested object needed to set one dotted path. */
  static patchAt(path, value) {
    const parts = path.split('.');
    const root = {};
    let node = root;
    for (let i = 0; i < parts.length - 1; i++) {
      node[parts[i]] = {};
      node = node[parts[i]];
    }
    node[parts[parts.length - 1]] = value;
    return root;
  }

  /**
   * Renders every setting a pack type has, from its spec.
   *
   * Driven by a list rather than written out per type, because these forms are
   * the same shape every time and the ones written by hand ended up covering a
   * fraction of what the file actually holds.
   *
   * Writes are merged into the file, so a setting this app does not know about
   * survives being saved next to one it does.
   */
  renderSettings(side, spec, options = {}) {
    const config = this.pack.config || {};
    const groups = spec.settings || [];
    if (!groups.length) return false;

    const save = async (path, value) => {
      const ok = await this.patchConfig(spec.config, PackEditor.patchAt(path, value));
      if (ok) this.toast('Saved.', 'ok', 1200);
      return ok;
    };

    const wrap = el('div', 'config-form');
    for (const group of groups) {
      wrap.append(el('h4', '', escapeHtml(group.title)));
      for (const field of group.fields) {
        wrap.append(this.settingRow(field, config, save, options));
      }
    }

    side.append(wrap);
    return true;
  }

  /** One control, chosen by the field's kind. */
  settingRow(field, config, save, options) {
    const current = PackEditor.at(config, field.path);
    const value = current === undefined ? field.fallback : current;
    const note = field.note ? `<em>${escapeHtml(field.note)}</em>` : '';

    if (field.kind === 'bool') {
      const row = el('label', 'option-row', `
        <input type="checkbox" />
        <span><b>${escapeHtml(field.label)}</b>${note}</span>`);
      const box = row.querySelector('input');
      box.checked = Boolean(value);
      if (options.disable && options.disable(field)) box.disabled = true;
      box.addEventListener('change', () => save(field.path, box.checked));
      return row;
    }

    if (field.kind === 'choice') {
      const row = el('label', 'field', `<span>${escapeHtml(field.label)}</span>
        <select class="select">${field.options.map(([v, label]) =>
    `<option value="${escapeHtml(JSON.stringify(v))}">${escapeHtml(label)}</option>`).join('')}</select>
        ${note ? `<em class="field-note">${escapeHtml(field.note)}</em>` : ''}`);
      const select = row.querySelector('select');
      select.value = JSON.stringify(value === undefined ? field.fallback : value);
      select.addEventListener('change', () => save(field.path, JSON.parse(select.value)));
      return row;
    }

    if (field.kind === 'rgba' || field.kind === 'rgb') {
      return this.colourRow(field, value, save);
    }

    // number and text
    const row = el('label', 'field', `<span>${escapeHtml(field.label)}</span>
      <input class="input" type="${field.kind === 'number' ? 'number' : 'text'}"
             ${field.step ? `step="${escapeHtml(String(field.step))}"` : ''} />
      ${note ? `<em class="field-note">${escapeHtml(field.note)}</em>` : ''}`);
    const input = row.querySelector('input');
    input.value = value === undefined || value === null ? '' : String(value);
    input.addEventListener('change', () => {
      if (field.kind !== 'number') { save(field.path, input.value); return; }
      const number = Number(input.value);
      if (!Number.isFinite(number)) {
        this.toast(`${field.label} has to be a number.`, 'warn', 3000);
        input.value = value === undefined ? '' : String(value);
        return;
      }
      save(field.path, number);
    });
    return row;
  }

  /**
   * A colour, stored the way the game writes them: hex digits with no leading
   * hash. Eight digits carry an alpha, six do not, and which one a setting uses
   * is fixed by the game rather than by what happens to be in the file.
   */
  colourRow(field, value, save) {
    const withAlpha = field.kind === 'rgba';
    const text = typeof value === 'string' ? value.replace(/^#/, '') : '';
    const rgb = (text.slice(0, 6).padEnd(6, '0')).toLowerCase();
    const alpha = withAlpha && text.length >= 8 ? parseInt(text.slice(6, 8), 16) : 255;

    const row = el('div', 'field colour-field', `
      <span>${escapeHtml(field.label)}</span>
      <div class="colour-row">
        <input type="color" value="#${escapeHtml(rgb)}" />
        ${withAlpha ? '<input type="range" min="0" max="255" class="colour-alpha" />' : ''}
        <b class="colour-read"></b>
      </div>
      ${field.note ? `<em class="field-note">${escapeHtml(field.note)}</em>` : ''}`);

    const picker = row.querySelector('input[type="color"]');
    const alphaInput = row.querySelector('.colour-alpha');
    const read = row.querySelector('.colour-read');
    if (alphaInput) alphaInput.value = String(alpha);

    const compose = () => {
      const base = picker.value.replace('#', '').toLowerCase();
      if (!withAlpha) return base;
      return base + Number(alphaInput.value).toString(16).padStart(2, '0');
    };
    const show = () => { read.textContent = compose(); };
    show();

    for (const input of [picker, alphaInput].filter(Boolean)) {
      input.addEventListener('input', show);
      input.addEventListener('change', () => save(field.path, compose()));
    }
    return row;
  }

  /** For types whose config has nothing worth a dedicated form yet. */
  renderPlainConfig(side, spec) {
    side.innerHTML = `
      <h3>Config</h3>
      <p class="muted small">This pack's settings live in <code>${escapeHtml(spec.config)}</code>.
         Nothing in it needs a form yet, and the app checks it is valid whenever the pack is
         scanned.</p>
      <button type="button" class="btn btn-small" data-act="open">Open the pack folder</button>`;
    side.querySelector('[data-act="open"]').addEventListener('click', () =>
      this.api.shell.openPath(this.pack.dir));
  }

  // Chatter

  /**
   * Chatter packs map keywords to sounds, so the editor is a table rather than
   * a set of slots. Two kinds of match, which behave differently enough to be
   * worth keeping visibly apart:
   *
   *   exact  the whole word, capitalisation included, for Twitch emote names
   *   broad  found anywhere in the word, ignoring case
   */
  renderChatterEditor(body) {
    const pack = this.pack;
    const sections = (pack.config && pack.config.sections) || {};

    const main = el('div', 'editor-stage');
    main.innerHTML = `
      <div class="slot-intro">
        <h3>${escapeHtml(pack.title)}</h3>
        <p class="muted">Sounds triggered by Twitch chat. The first word of a message is checked
           against the keywords below.</p>
      </div>
      <div class="chatter-legend">
        <span><b>Exact</b> matches the whole word including capitals. "Clap" fires only for
          "Clap". Use it for emote names.</span>
        <span><b>Broad</b> matches anywhere in the word and ignores capitals. "clap" fires for
          "CLAP", "clapping", "LeftClap".</span>
      </div>
      <div class="chatter-list" data-role="chatter"></div>
      <div class="chatter-add">
        <button type="button" class="btn btn-small" data-act="add-sounds">Add sounds…</button>
        <span class="muted small">Any WAV, MP3 or OGG. Several sounds can share a keyword and one
          is picked at random.</span>
      </div>`;
    body.append(main);

    const side = el('aside', 'editor-side');
    side.innerHTML = `
      <h3>Pack details</h3>
      <label class="field"><span>Title</span>
        <input class="input" data-cfg="title" placeholder="What the pack is called" /></label>
      <label class="field"><span>Author</span>
        <input class="input" data-cfg="authors" placeholder="Who made it" /></label>
      <label class="field"><span>Volume</span>
        <div class="slider-field wide">
          <input type="range" data-cfg="volume" min="0" max="2" step="0.05" />
          <b class="slider-read" data-role="vol-read"></b>
        </div>
      </label>
      <p class="muted small">Applies to every sound in this pack. 1.00 leaves them as recorded.</p>
      <p class="muted small">Saved into <code>config_chatter.ini</code>, which is what the game
         reads. Keys there are full filenames including the extension, unlike other pack types.</p>`;
    body.append(side);

    this.chatterSections = {
      data: { ...(sections.data || {}) },
      exact_keywords: { ...(sections.exact_keywords || {}) },
      broad_keywords: { ...(sections.broad_keywords || {}) },
    };

    const title = side.querySelector('[data-cfg="title"]');
    const authors = side.querySelector('[data-cfg="authors"]');
    const volume = side.querySelector('[data-cfg="volume"]');
    const volRead = side.querySelector('[data-role="vol-read"]');

    title.value = this.chatterSections.data.title || '';
    authors.value = [].concat(this.chatterSections.data.authors || []).join(', ');
    volume.value = String(
      typeof this.chatterSections.data.volume === 'number' ? this.chatterSections.data.volume : 1
    );
    const showVolume = () => { volRead.textContent = Number(volume.value).toFixed(2); };
    showVolume();

    const saveData = async () => {
      this.chatterSections.data = {
        ...this.chatterSections.data,
        title: title.value.trim(),
        authors: authors.value.split(',').map((s) => s.trim()).filter(Boolean),
        volume: Number(volume.value),
      };
      await this.saveChatter();
    };
    title.addEventListener('change', saveData);
    authors.addEventListener('change', saveData);
    volume.addEventListener('input', showVolume);
    volume.addEventListener('change', saveData);

    main.querySelector('[data-act="add-sounds"]').addEventListener('click', async () => {
      const picked = await this.api.dialog.pickFiles({ title: 'Chatter sounds', kind: 'audio' });
      if (!picked.length) return;
      await this.run(`Adding ${picked.length} sound${picked.length > 1 ? 's' : ''}…`, () =>
        this.importFiles(picked, { audioFormat: 'wav' }));
      if (this.onChanged) await this.onChanged(this.pack.id, { keepEditor: true });
      this.renderChatterList();
    });

    this.renderChatterList();
  }

  renderChatterList() {
    const container = this.root.querySelector('[data-role="chatter"]');
    if (!container) return;

    const AUDIO = /\.(wav|mp3|ogg|opus)$/i;
    const sounds = (this.pack.fileNames || []).filter((f) => AUDIO.test(f)).sort();
    container.innerHTML = '';

    if (!sounds.length) {
      container.innerHTML = '<p class="muted small">No sounds yet. Add some to start mapping them.</p>';
      return;
    }

    for (const file of sounds) {
      const url = (this.pack.fileUrls || {})[file];
      const exact = [].concat(this.chatterSections.exact_keywords[file] || []).join(', ');
      const broad = [].concat(this.chatterSections.broad_keywords[file] || []).join(', ');

      const row = el('div', 'chatter-row');
      row.classList.toggle('unmapped', !exact && !broad);
      row.innerHTML = `
        <button type="button" class="icon-btn" data-act="play" title="Play this sound">▶</button>
        <span class="chatter-file">${escapeHtml(file)}</span>
        <label class="chatter-field">
          <span>Exact</span>
          <input class="input" data-kind="exact_keywords" placeholder="Clap, PogChamp" />
        </label>
        <label class="chatter-field">
          <span>Broad</span>
          <input class="input" data-kind="broad_keywords" placeholder="clap, yes" />
        </label>
        <button type="button" class="icon-btn danger" data-act="delete"
                title="Remove this sound from the pack">✕</button>`;

      // Through the property: keywords can contain quotes and emoji.
      const [exactInput, broadInput] = row.querySelectorAll('input');
      exactInput.value = exact;
      broadInput.value = broad;

      const playBtn = row.querySelector('[data-act="play"]');
      playBtn.addEventListener('click', () => this.playFile(url, playBtn));

      row.querySelector('[data-act="delete"]')
        .addEventListener('click', () => this.deleteChatterSound(file));

      for (const input of [exactInput, broadInput]) {
        input.addEventListener('change', async () => {
          const words = input.value.split(',').map((s) => s.trim()).filter(Boolean);
          const section = this.chatterSections[input.dataset.kind];
          if (words.length) section[file] = words;
          else delete section[file];

          row.classList.toggle('unmapped',
            !this.chatterSections.exact_keywords[file] && !this.chatterSections.broad_keywords[file]);
          await this.saveChatter();
        });
      }

      container.append(row);
    }
  }

  /**
   * Removes a chatter sound and the keywords pointing at it.
   *
   * Both have to go together: a keyword left behind names a file that is no
   * longer there, which the scanner then reports as broken. Undo puts the file
   * and its keywords back.
   */
  async deleteChatterSound(file) {
    const base = file.slice(0, file.lastIndexOf('.'));
    const before = {
      exact: this.chatterSections.exact_keywords[file],
      broad: this.chatterSections.broad_keywords[file],
    };

    const result = await this.run('Removing the sound…', () =>
      this.api.content.trashClip({ packDir: this.pack.dir, base }));

    if (!result.ok) {
      this.toast(`Could not remove it: ${result.error}`, 'error', 7000);
      return;
    }

    const applyRemoval = async () => {
      delete this.chatterSections.exact_keywords[file];
      delete this.chatterSections.broad_keywords[file];
      await this.saveChatter();
      this.renderChatterList();
    };
    const applyRestore = async () => {
      if (before.exact) this.chatterSections.exact_keywords[file] = before.exact;
      if (before.broad) this.chatterSections.broad_keywords[file] = before.broad;
      await this.saveChatter();
      this.renderChatterList();
    };

    await applyRemoval();
    this.toast(`Removed ${file}.`, 'ok', 2500);

    this.push({
      label: `remove ${file}`,
      undo: async () => {
        await this.api.content.restoreClip({ moved: result.moved });
        await applyRestore();
      },
      redo: async () => {
        await this.api.content.trashClip({ packDir: this.pack.dir, base });
        await applyRemoval();
      },
    });
  }

  /** Writes the whole chatter config back as Godot ini. */
  async saveChatter() {
    const result = await this.api.content.writeIniSections({
      dir: this.pack.dir,
      file: 'config_chatter.ini',
      sections: this.chatterSections,
    });
    if (!result.ok) {
      this.toast(`Could not save that: ${result.error}`, 'error', 7000);
      return;
    }
    this.toast('Saved.', 'ok', 1200);
    if (this.onChanged) await this.onChanged(this.pack.id, { keepEditor: true });
  }

  // Everything else, for now

  renderGenericEditor(body) {
    const pack = this.pack;
    body.append(el('div', 'editor-empty', `
      <h3>${escapeHtml(pack.title)}</h3>
      <p class="muted">Drop files in and they are converted and renamed to what the game expects.
         A dedicated editor for this type is still to come.</p>`));
    body.append(this.buildDropzone('Drop files here', 'all', async (paths) => {
      await this.importFiles(paths);
      if (this.onChanged) await this.onChanged(pack.id);
    }));
  }

  // Shared

  buildDropzone(label, kind, onFiles) {
    const zone = el('div', 'dropzone', `
      <p><b>${escapeHtml(label)}</b></p>
      <p class="muted small">Anything in the wrong format is converted automatically.</p>
      <button type="button" class="btn btn-small">Choose files…</button>`);

    zone.querySelector('button').addEventListener('click', async () => {
      const picked = await this.api.dialog.pickFiles({ title: label, kind });
      if (picked.length) onFiles(picked);
    });

    for (const event of ['dragenter', 'dragover']) {
      zone.addEventListener(event, (e) => { e.preventDefault(); zone.classList.add('over'); });
    }
    for (const event of ['dragleave', 'drop']) {
      zone.addEventListener(event, () => zone.classList.remove('over'));
    }
    zone.addEventListener('drop', (e) => {
      e.preventDefault();
      const paths = [...(e.dataTransfer.files || [])]
        .map((f) => this.api.pathForFile(f))
        .filter(Boolean);
      if (paths.length) onFiles(paths);
    });

    return zone;
  }

  async importFiles(paths, options = {}, { quiet = false } = {}) {
    const result = await this.api.content.import(this.pack.dir, paths, options);
    if (!result.ok) {
      this.toast(`Could not add those: ${result.error}`, 'error', 8000);
      return false;
    }
    const failed = result.results.filter((r) => !r.ok);
    if (quiet) return !failed.length;

    if (failed.length) this.toast(`${failed.length} file(s) failed.`, 'warn', 7000);
    else this.toast('Added.', 'ok');
    return true;
  }
}

/**
 * The trim bar over the video: two handles marking what to keep.
 *
 * Times are held in seconds rather than fractions, because everything else in
 * the pack is in seconds and converting back and forth invites rounding drift
 * in the clip timestamps that have to shift with the cut.
 */
class TrimBar {
  constructor(layer, { duration, onPreview, onApply, onCancel }) {
    this.layer = layer;
    this.duration = duration;
    this.onPreview = onPreview;
    this.onApply = onApply;
    this.onCancel = onCancel;

    this.start = 0;
    this.end = duration;

    layer.innerHTML = `
      <div class="trim-panel">
        <p class="trim-title">Keep this part of the video</p>
        <div class="trim-track" data-role="track">
          <div class="trim-dim" data-role="dim-left"></div>
          <div class="trim-dim" data-role="dim-right"></div>
          <div class="trim-keep" data-role="keep"></div>
          <i class="trim-handle" data-handle="start" title="Where it starts"></i>
          <i class="trim-handle" data-handle="end" title="Where it ends"></i>
        </div>
        <div class="trim-times">
          <label class="trim-field"><span>From</span>
            <input class="input" data-role="from" inputmode="decimal" /></label>
          <button type="button" class="btn btn-small" data-role="set-from">Use playhead</button>
          <span class="trim-length" data-role="length"></span>
          <button type="button" class="btn btn-small" data-role="set-to">Use playhead</button>
          <label class="trim-field"><span>To</span>
            <input class="input" data-role="to" inputmode="decimal" /></label>
        </div>
        <p class="muted small trim-note" data-role="note"></p>
        <div class="trim-actions">
          <button type="button" class="btn btn-small" data-role="reset">Reset</button>
          <span class="grow"></span>
          <button type="button" class="btn btn-small" data-role="cancel">Cancel</button>
          <button type="button" class="btn btn-small btn-primary" data-role="apply">Trim video</button>
        </div>
      </div>`;

    this.q = (role) => layer.querySelector(`[data-role="${role}"]`);
    this._onResize = () => this.paint();
    window.addEventListener('resize', this._onResize);

    this._bind();
    this.paint();
  }

  destroy() {
    window.removeEventListener('resize', this._onResize);
    this.layer.innerHTML = '';
  }

  clamp() {
    const min = 0.5;
    this.start = Math.max(0, Math.min(this.start, this.duration - min));
    this.end = Math.min(this.duration, Math.max(this.end, this.start + min));
  }

  paint() {
    this.clamp();
    const pct = (t) => `${(t / this.duration) * 100}%`;

    this.q('keep').style.left = pct(this.start);
    this.q('keep').style.width = pct(this.end - this.start);
    this.q('dim-left').style.width = pct(this.start);
    this.q('dim-right').style.left = pct(this.end);
    this.q('dim-right').style.width = pct(this.duration - this.end);
    this.layer.querySelector('[data-handle="start"]').style.left = pct(this.start);
    this.layer.querySelector('[data-handle="end"]').style.left = pct(this.end);

    // Fields are not rewritten while they are being typed in, or the caret
    // jumps to the end after every keystroke.
    const from = this.q('from');
    const to = this.q('to');
    if (document.activeElement !== from) from.value = this.start.toFixed(2);
    if (document.activeElement !== to) to.value = this.end.toFixed(2);

    this.q('length').textContent = `${(this.end - this.start).toFixed(2)}s kept`;
    const cut = this.duration - (this.end - this.start);
    this.q('note').textContent = cut < 0.01
      ? 'Nothing is being cut yet. Drag a handle in.'
      : `${cut.toFixed(2)}s removed. Every clip shifts by ${(-this.start).toFixed(2)}s to stay in sync.`;
    this.q('apply').disabled = cut < 0.01;
  }

  _bind() {
    const layer = this.layer;
    const track = this.q('track');

    this.q('cancel').addEventListener('click', () => this.onCancel());
    this.q('apply').addEventListener('click', () => {
      this.onApply({ start: this.start, end: this.end });
    });
    this.q('reset').addEventListener('click', () => {
      this.start = 0;
      this.end = this.duration;
      this.paint();
    });

    for (const [role, which] of [['set-from', 'start'], ['set-to', 'end']]) {
      this.q(role).addEventListener('click', () => {
        const video = layer.closest('.editor-video').querySelector('video');
        if (video) { this[which] = video.currentTime; this.paint(); }
      });
    }

    for (const [role, which] of [['from', 'start'], ['to', 'end']]) {
      this.q(role).addEventListener('change', (e) => {
        const value = parseFloat(e.target.value);
        if (Number.isFinite(value)) this[which] = value;
        this.paint();
        this.onPreview(this[which]);
      });
    }

    track.addEventListener('pointerdown', (e) => {
      const which = e.target.dataset.handle;
      if (!which) return;
      e.preventDefault();
      track.setPointerCapture(e.pointerId);

      const move = (ev) => {
        const box = track.getBoundingClientRect();
        const t = ((ev.clientX - box.left) / box.width) * this.duration;
        this[which] = Math.max(0, Math.min(this.duration, t));
        this.paint();
        // Seeking as you drag is what makes picking a cut point possible at
        // all, since the numbers alone say nothing about what is on screen.
        this.onPreview(this[which]);
      };

      const end = (ev) => {
        track.removeEventListener('pointermove', move);
        track.removeEventListener('pointerup', end);
        try { track.releasePointerCapture(ev.pointerId); } catch { /* already released */ }
      };

      track.addEventListener('pointermove', move);
      track.addEventListener('pointerup', end);
    });
  }
}
