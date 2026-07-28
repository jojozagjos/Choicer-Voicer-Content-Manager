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

const escapeHtml = (text) => {
  const div = document.createElement('div');
  div.textContent = text == null ? '' : String(text);
  return div.innerHTML;
};

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
  ['Drag anywhere', 'Pan the timeline'],
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
  constructor(root, api, toast) {
    this.root = root;
    this.api = api;
    this.toast = toast;
    this.pack = null;
    this.onClose = null;
    this.onChanged = null;

    // Undo covers everything that changes a clip, including deletion, which
    // moves files aside rather than removing them so it can be put back.
    this.undoStack = [];
    this.redoStack = [];
    this.busy = 0;

    this._keyHandler = (e) => this._onKey(e);
  }

  close() {
    this.root.hidden = true;
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
    const bar = this.root.querySelector('.editor-busy');
    if (!bar) return;
    bar.hidden = this.busy === 0;
    if (message) bar.querySelector('span').textContent = message;
  }

  async run(label, task) {
    this.setBusy(true, label);
    try {
      return await task();
    } finally {
      this.setBusy(false);
    }
  }

  // Undo

  push(entry) {
    this.undoStack.push(entry);
    if (this.undoStack.length > 50) this.undoStack.shift();
    this.redoStack = [];
    this._refreshUndoButtons();
  }

  async undo() {
    const entry = this.undoStack.pop();
    if (!entry) { this.toast('Nothing to undo.', 'info', 1500); return; }
    await entry.undo();
    this.redoStack.push(entry);
    this._refreshUndoButtons();
    this.toast(`Undid: ${entry.label}`, 'ok', 1800);
  }

  async redo() {
    const entry = this.redoStack.pop();
    if (!entry) { this.toast('Nothing to redo.', 'info', 1500); return; }
    await entry.redo();
    this.undoStack.push(entry);
    this._refreshUndoButtons();
    this.toast(`Redid: ${entry.label}`, 'ok', 1800);
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
      if (video.paused) video.play().catch(() => {});
      else video.pause();
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

    const busy = el('div', 'editor-busy', '<div class="spinner spinner-small"></div><span></span>');
    busy.hidden = true;
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

        <button type="button" class="btn btn-small" data-act="captions" aria-pressed="true">Captions</button>
        <button type="button" class="btn btn-small" data-act="crop">Crop video</button>
        <button type="button" class="btn btn-small" data-act="backing">Make backing track</button>
        <button type="button" class="btn btn-small" data-act="zoom-fit">Fit</button>
      </div>
      <p class="muted small editor-hint">
        Click a clip to select it. Drag its grip to move it, or an edge to change its timing.
        Dragging anywhere else pans. Hold still a moment then drag to cut a new clip.
      </p>
      <canvas class="timeline" data-role="timeline"></canvas>`;
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
        if (video.paused) { await video.play(); event.target.textContent = '❚❚'; }
        else { video.pause(); event.target.textContent = '▶'; }
      } else if (act === 'back') video.currentTime = Math.max(0, video.currentTime - 2);
      else if (act === 'fwd') video.currentTime += 2;
      else if (act === 'zoom-fit') {
        timeline.viewStart = 0;
        timeline.viewEnd = timeline.duration;
        timeline.draw();
      } else if (act === 'captions') {
        this.setCaptionsVisible(this.captionsOn === false);
        this.api.settings.set({ showEditorCaptions: this.captionsOn });
      } else if (act === 'crop') {
        this.toggleCrop(event.target);
      } else if (act === 'backing') {
        this.makeBackingTrack();
      }
    });

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

    // The playhead follows the video every frame; the readout only needs to
    // keep up with what a person can read.
    timeline.follow(video);
    video.addEventListener('timeupdate', () => {
      q('time').textContent = fmt(video.currentTime);
    });

    // Captions have to keep up with the playhead, not with timeupdate, or a
    // line appears a fifth of a second after the voice starts.
    const trackCaption = () => {
      if (this.root.hidden) return;
      this.paintCaption(video.currentTime);
      this._captionRaf = requestAnimationFrame(trackCaption);
    };
    this._captionRaf = requestAnimationFrame(trackCaption);

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

    const result = await this.run('Building the backing track…', () =>
      this.api.content.buildBacking({
        packDir: pack.dir,
        videoPath: pack.videoPath,
        ranges: clips.map((c) => ({ start: c.time, duration: c.duration })),
        level: 0,
        replacing: Boolean(pack.backingPath),
      }));

    if (result.cancelled) return;
    if (!result.ok) {
      this.toast(`Could not build it: ${result.error}`, 'error', 8000);
      return;
    }
    this.toast(`Backing track built, quietened under ${result.ducked} lines.`, 'ok', 5000);
    if (this.onChanged) await this.onChanged(pack.id, { keepEditor: true });
  }

  // Cropping

  toggleCrop(button) {
    if (this.crop) { this.endCrop(); return; }
    if (!this.video || !this.video.videoWidth) {
      this.toast('Let the video load first.', 'warn');
      return;
    }
    this.video.pause();
    button.classList.add('on');
    this.crop = new CropBox(this.cropLayer, {
      onApply: (rect) => this.applyCrop(rect),
      onCancel: () => this.endCrop(),
      size: { width: this.video.videoWidth, height: this.video.videoHeight },
    });
    this.cropLayer.hidden = false;
  }

  endCrop() {
    if (this.crop) { this.crop.destroy(); this.crop = null; }
    if (this.cropLayer) this.cropLayer.hidden = true;
    const button = this.root.querySelector('[data-act="crop"]');
    if (button) button.classList.remove('on');
  }

  /**
   * Crops the pack's video. The original is kept aside so this can be undone,
   * which matters because cropping re-encodes and is otherwise one way.
   */
  async applyCrop(rect) {
    const pack = this.pack;
    this.endCrop();

    const result = await this.run('Cropping the video…', () => this.api.content.cropVideo({
      packDir: pack.dir,
      videoPath: pack.videoPath,
      crop: rect,
    }));

    if (!result.ok) {
      this.toast(`Could not crop it: ${result.error}`, 'error', 8000);
      return;
    }

    this.toast(`Cropped to ${result.to.width}×${result.to.height}.`, 'ok', 4000);

    // Undo puts the original file back. Both directions reopen the editor,
    // since the proxy the editor plays has to be rebuilt from the new file.
    const reopen = async () => {
      if (this.onChanged) await this.onChanged(pack.id);
    };
    this.push({
      label: 'crop video',
      undo: async () => {
        await this.api.content.restoreClip({ moved: result.moved });
        await reopen();
      },
      redo: async () => {
        const again = await this.api.content.cropVideo({
          packDir: pack.dir, videoPath: pack.videoPath, crop: rect,
        });
        if (!again.ok) throw new Error(again.error);
        result.moved = again.moved;
        await reopen();
      },
    });

    await reopen();
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
    const clips = this.pack.clips || [];
    container.innerHTML = '';

    if (!clips.length) {
      container.innerHTML = '<p class="muted small">No clips yet. Mark a range on the video and add one.</p>';
      return;
    }

    for (const clip of clips) {
      const row = el('div', 'clip-row');
      row.dataset.base = clip.base;
      row.classList.toggle('on', this.timeline && this.timeline.selected === clip.base);

      const hasAudio = Boolean(clip.audio);
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
          <div class="clip-thumb ${clip.imageUrl ? '' : 'blank'}">
            ${clip.imageUrl
    ? `<img src="${clip.imageUrl}" alt="" />`
    : '<span>no picture</span>'}
            <div class="clip-thumb-actions">
              <button type="button" class="icon-btn" data-act="grab"
                      title="Use the frame showing now">⧉</button>
              <button type="button" class="icon-btn" data-act="upload"
                      title="Choose a picture file">↑</button>
            </div>
          </div>
          <div class="clip-fields">
            <input class="input" data-field="caption" placeholder="Caption" />
            <input class="input" data-field="character" placeholder="Who says it" />
          </div>
        </div>`;

      row.querySelector('[data-act="grab"]').addEventListener('click', () => this.grabClipImage(clip));
      row.querySelector('[data-act="upload"]').addEventListener('click', () => this.uploadClipImage(clip));

      // Set through the property, never through the attribute: captions are
      // full of double quotes and putting one in value="" ends the attribute,
      // which silently blanked most of them.
      const [captionInput, characterInput] = row.querySelectorAll('[data-field]');
      captionInput.value = clip.caption || '';
      characterInput.value = clip.character || '';

      row.querySelector('.line-time').addEventListener('click', () => {
        if (this.video) this.video.currentTime = clip.time;
        if (this.timeline) this.timeline.select(clip.base);
        this.renderClipList(container);
      });

      const playBtn = row.querySelector('[data-act="play"]');
      if (hasAudio) playBtn.addEventListener('click', () => this.playClip(clip, playBtn));

      row.querySelector('[data-act="delete"]').addEventListener('click', () => this.deleteClip(clip));

      // Saving on change keeps typing responsive and avoids a write per keypress.
      const save = async () => {
        const before = { caption: clip.caption || '', character: clip.character || '' };
        const after = { caption: captionInput.value, character: characterInput.value };
        if (before.caption === after.caption && before.character === after.character) return;

        const write = async (values) => {
          await this.api.content.writeClipMeta({
            destDir: this.pack.dir,
            base: clip.base,
            meta: { ...values, image: clip.image || `${clip.base}.png`, timestamp: clip.time },
          });
          clip.caption = values.caption;
          clip.character = values.character;
          if (this.timeline) this.timeline.setClips(this.pack.clips || []);
        };

        await write(after);
        this.push({
          label: 'caption edit',
          undo: async () => { await write(before); this.renderClipList(container); },
          redo: async () => { await write(after); this.renderClipList(container); },
        });
      };

      captionInput.addEventListener('change', save);
      characterInput.addEventListener('change', save);

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
    const result = await this.run('Deleting the clip…', () =>
      this.api.content.trashClip({ packDir: pack.dir, base: clip.base }));

    if (!result.ok) {
      this.toast(`Could not delete it: ${result.error}`, 'error', 7000);
      return;
    }

    this.toast(`Deleted ${clip.base}.`, 'ok');
    this.push({
      label: `delete ${clip.base}`,
      undo: async () => {
        await this.api.content.restoreClip({ moved: result.moved });
        if (this.onChanged) await this.onChanged(pack.id, { keepEditor: true });
        this.refreshClips();
      },
      redo: async () => {
        await this.api.content.trashClip({ packDir: pack.dir, base: clip.base });
        if (this.onChanged) await this.onChanged(pack.id, { keepEditor: true });
        this.refreshClips();
      },
    });

    if (this.onChanged) await this.onChanged(pack.id, { keepEditor: true });
    this.refreshClips();
  }

  /** Repaints the timeline and clip list from the pack's current clips. */
  refreshClips() {
    if (this.timeline) this.timeline.setClips(this.pack.clips || []);
    const list = this.root.querySelector('[data-role="clips"]');
    if (list) this.renderClipList(list);
  }

  // Contestants

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

    const left = el('div', 'editor-stage');
    left.innerHTML = `
      <div class="editor-portrait">
        ${pack.iconUrl ? `<img src="${pack.iconUrl}" alt="" />`
    : '<div class="editor-portrait-blank">No picture yet</div>'}
      </div>`;
    left.append(this.buildDropzone('Drop a picture', 'image', async (paths) => {
      await this.importFiles(paths, { baseName: 'player', kind: 'image' });
      if (this.onChanged) await this.onChanged(pack.id);
    }));
    body.append(left);

    const side = el('aside', 'editor-side');
    side.innerHTML = `
      <h3>Reaction sounds</h3>
      <p class="muted small">Record one, or drop in a file. Each is saved into the pack and
         assigned for you.</p>
      <div class="slot-list"></div>`;
    body.append(side);

    const list = side.querySelector('.slot-list');
    for (const [key, label] of SLOTS) {
      const assigned = (config.audio_assignment || {})[key] || '';
      const row = el('div', 'slot-row');
      row.dataset.slot = key;
      row.classList.toggle('filled', Boolean(assigned));
      row.innerHTML = `
        <span class="slot-state" title="${assigned ? 'Ready' : 'Nothing set'}">${assigned ? '●' : '○'}</span>
        <span class="slot-label">${escapeHtml(label)}</span>
        <span class="slot-file">${assigned ? escapeHtml(assigned) : 'not set'}</span>
        <span class="slot-timer muted small"></span>
        <button type="button" class="btn btn-small play" ${assigned ? '' : 'disabled'}>▶</button>
        <button type="button" class="btn btn-small rec">● Record</button>
        <button type="button" class="btn btn-small pick">File…</button>`;

      const playBtn = row.querySelector('.play');
      playBtn.addEventListener('click', () => this.playSlot(key, playBtn));

      attachRecorder(
        row.querySelector('.rec'),
        row.querySelector('.slot-timer'),
        async (take) => {
          if (!take) return;
          await this.saveSlotRecording(key, take, row);
        },
        { maxSeconds: 30, onError: (err) => this.toast(err.message, 'error', 7000) }
      );

      row.querySelector('.pick').addEventListener('click', async () => {
        const picked = await this.api.dialog.pickFiles({ title: label, kind: 'audio' });
        if (!picked.length) return;
        const base = key;
        await this.importFiles([picked[0]], { baseName: base, kind: 'audio', audioFormat: 'wav' });
        await this.assignSlot(key, base, row);
      });

      list.append(row);
    }
  }

  async saveSlotRecording(key, take, row) {
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
    await this.assignSlot(key, saved.base, row);
  }

  /** Points a reaction slot at a file, without disturbing the other slots. */
  async assignSlot(key, base, row) {
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
    this.pack.config = { ...config, audio_assignment: assignment };
    row.querySelector('.slot-file').textContent = base;
    row.querySelector('.slot-state').textContent = '●';
    row.querySelector('.slot-state').title = 'Ready';
    row.querySelector('.play').disabled = false;
    row.classList.add('filled');
    this.toast('Saved.', 'ok', 1500);
  }

  /** Plays whatever a reaction slot points at. */
  async playSlot(key, button) {
    const assigned = ((this.pack.config || {}).audio_assignment || {})[key];
    if (!assigned) return;

    if (this.slotAudio) {
      this.slotAudio.pause();
      if (this.slotButton) this.slotButton.textContent = '▶';
      const same = this.slotAudio.dataset.slot === key;
      this.slotAudio = null;
      this.slotButton = null;
      if (same) return;
    }

    // The scan lists every file in the pack, so find the one this points at
    // regardless of which extension it happens to use.
    const scan = await this.api.content.scan();
    const fresh = scan.ok && scan.types.flatMap((t) => t.packs).find((p) => p.id === this.pack.id);
    const url = fresh && fresh.slotUrls ? fresh.slotUrls[assigned] : null;
    if (!url) {
      this.toast(`Could not find "${assigned}" in this pack.`, 'warn', 6000);
      return;
    }

    const audio = new Audio(url);
    audio.dataset.slot = key;
    audio.addEventListener('ended', () => { button.textContent = '▶'; this.slotAudio = null; });
    audio.play().catch(() => this.toast('Could not play that sound.', 'warn'));
    button.textContent = '■';
    this.slotAudio = audio;
    this.slotButton = button;
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

  async importFiles(paths, options = {}) {
    const result = await this.api.content.import(this.pack.dir, paths, options);
    if (!result.ok) {
      this.toast(`Could not add those: ${result.error}`, 'error', 8000);
      return false;
    }
    const failed = result.results.filter((r) => !r.ok);
    if (failed.length) this.toast(`${failed.length} file(s) failed.`, 'warn', 7000);
    else this.toast('Added.', 'ok');
    return true;
  }
}

/**
 * The crop rectangle drawn over the video.
 *
 * It works in fractions of the frame rather than pixels, so it survives the
 * window being resized and does not care what size the video is displayed at.
 * Only the corners resize; dragging inside moves the whole rectangle, which is
 * what people reach for first.
 */
const HANDLES = ['nw', 'ne', 'sw', 'se'];

class CropBox {
  constructor(layer, { onApply, onCancel, size }) {
    this.layer = layer;
    this.onApply = onApply;
    this.onCancel = onCancel;
    this.size = size;

    // Starts as the whole frame, so the first drag pulls an edge in rather
    // than having to find an invisible rectangle first.
    this.rect = { x: 0, y: 0, width: 1, height: 1 };
    this.aspect = null;

    layer.innerHTML = `
      <div class="crop-rect">
        ${HANDLES.map((h) => `<i class="crop-handle ${h}" data-handle="${h}"></i>`).join('')}
      </div>
      <div class="crop-bar">
        <span class="crop-size" data-role="size"></span>
        <label class="crop-aspect">
          <span>Shape</span>
          <select class="select" data-role="aspect">
            <option value="">Free</option>
            <option value="16:9">16:9 wide</option>
            <option value="4:3">4:3</option>
            <option value="1:1">Square</option>
            <option value="9:16">9:16 tall</option>
          </select>
        </label>
        <button type="button" class="btn btn-small" data-role="reset">Reset</button>
        <button type="button" class="btn btn-small" data-role="cancel">Cancel</button>
        <button type="button" class="btn btn-small btn-primary" data-role="apply">Crop</button>
      </div>`;

    this.box = layer.querySelector('.crop-rect');
    this._onResize = () => this.paint();
    window.addEventListener('resize', this._onResize);

    this._bind();
    this.paint();
  }

  destroy() {
    window.removeEventListener('resize', this._onResize);
    this.layer.innerHTML = '';
  }

  /**
   * Where the picture actually is inside the layer. The video is object-fit:
   * contain, so on a wide window there are black bars either side that are not
   * part of the frame and must not be croppable.
   */
  contentBox() {
    const outer = this.layer.getBoundingClientRect();
    const scale = Math.min(outer.width / this.size.width, outer.height / this.size.height);
    const width = this.size.width * scale;
    const height = this.size.height * scale;
    return {
      left: (outer.width - width) / 2,
      top: (outer.height - height) / 2,
      width,
      height,
    };
  }

  paint() {
    const content = this.contentBox();
    const r = this.rect;
    Object.assign(this.box.style, {
      left: `${content.left + r.x * content.width}px`,
      top: `${content.top + r.y * content.height}px`,
      width: `${r.width * content.width}px`,
      height: `${r.height * content.height}px`,
    });

    const even = (n) => Math.max(2, Math.round(n / 2) * 2);
    const w = even(this.size.width * r.width);
    const h = even(this.size.height * r.height);
    this.layer.querySelector('[data-role="size"]').textContent =
      `${w} × ${h}  (from ${this.size.width} × ${this.size.height})`;
  }

  /** Keeps a rectangle inside the frame and above the minimum useful size. */
  clampRect(r) {
    const minW = 16 / this.size.width;
    const minH = 16 / this.size.height;
    const width = Math.min(1, Math.max(minW, r.width));
    const height = Math.min(1, Math.max(minH, r.height));
    return {
      width,
      height,
      x: Math.min(Math.max(0, r.x), 1 - width),
      y: Math.min(Math.max(0, r.y), 1 - height),
    };
  }

  /** Forces a rectangle to a chosen shape, anchored on its centre. */
  applyAspect(r) {
    if (!this.aspect) return r;
    const target = this.aspect;
    const frame = this.size.width / this.size.height;
    // The rectangle is in fractions of a frame that is not itself square, so
    // the ratio has to be expressed in frame units before it means anything.
    const wanted = target / frame;

    let { width, height } = r;
    if (width / height > wanted) width = height * wanted;
    else height = width / wanted;

    const cx = r.x + r.width / 2;
    const cy = r.y + r.height / 2;
    return this.clampRect({ x: cx - width / 2, y: cy - height / 2, width, height });
  }

  _bind() {
    const layer = this.layer;

    layer.querySelector('[data-role="cancel"]').addEventListener('click', () => this.onCancel());
    layer.querySelector('[data-role="apply"]').addEventListener('click', () => {
      this.onApply(this.rect);
    });
    layer.querySelector('[data-role="reset"]').addEventListener('click', () => {
      this.rect = { x: 0, y: 0, width: 1, height: 1 };
      this.paint();
    });
    layer.querySelector('[data-role="aspect"]').addEventListener('change', (e) => {
      const value = e.target.value;
      if (!value) { this.aspect = null; return; }
      const [w, h] = value.split(':').map(Number);
      this.aspect = w / h;
      this.rect = this.applyAspect(this.rect);
      this.paint();
    });

    // The bar must not start a drag on the rectangle behind it.
    layer.querySelector('.crop-bar').addEventListener('pointerdown', (e) => e.stopPropagation());

    const start = (e) => {
      if (e.button !== 0) return;
      const content = this.contentBox();
      const handle = e.target.dataset.handle || null;
      if (!handle && !e.target.closest('.crop-rect')) return;

      e.preventDefault();
      const origin = { ...this.rect };
      const from = { x: e.clientX, y: e.clientY };
      layer.setPointerCapture(e.pointerId);

      const move = (ev) => {
        const dx = (ev.clientX - from.x) / content.width;
        const dy = (ev.clientY - from.y) / content.height;

        let next;
        if (!handle) {
          next = this.clampRect({ ...origin, x: origin.x + dx, y: origin.y + dy });
        } else {
          const left = handle.includes('w');
          const top = handle.includes('n');
          const x = left ? origin.x + dx : origin.x;
          const y = top ? origin.y + dy : origin.y;
          const width = left ? origin.width - dx : origin.width + dx;
          const height = top ? origin.height - dy : origin.height + dy;
          next = this.applyAspect(this.clampRect({ x, y, width, height }));
        }
        this.rect = next;
        this.paint();
      };

      const end = (ev) => {
        layer.removeEventListener('pointermove', move);
        layer.removeEventListener('pointerup', end);
        try { layer.releasePointerCapture(ev.pointerId); } catch { /* already released */ }
      };

      layer.addEventListener('pointermove', move);
      layer.addEventListener('pointerup', end);
    };

    layer.addEventListener('pointerdown', start);
  }
}
