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
        <button type="button" class="btn btn-small" data-act="play-backing" hidden>♪ Backing</button>
        <button type="button" class="btn btn-small" data-act="zoom-fit">Fit</button>
      </div>
      <p class="muted small editor-hint">
        Click a clip to select it. Drag its grip to move it, or an edge to change its timing.
        Hold still a moment then drag to cut a new clip. Right or middle drag pans.
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
      } else if (act === 'caption-here') {
        this.addCaptionAtPlayhead(video);
      } else if (act === 'trim') {
        this.toggleTrim(event.target);
      } else if (act === 'backing') {
        this.makeBackingTrack();
      } else if (act === 'play-backing') {
        this.playBacking(event.target);
      }
    });

    // Only offered once there is something to play.
    const backingBtn = controls.querySelector('[data-act="play-backing"]');
    if (backingBtn) backingBtn.hidden = !this.pack.backingUrl;

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

  // Trimming the video

  toggleTrim(button) {
    if (this.trim) { this.endTrim(); return; }
    if (!this.video || !this.video.duration) {
      this.toast('Let the video load first.', 'warn');
      return;
    }
    this.video.pause();
    button.classList.add('on');
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
    if (this.cropLayer) this.cropLayer.hidden = true;
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

    const result = await this.run('Trimming the video…', () => this.api.content.trimVideo({
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

    const lost = clipsBefore.filter((c) =>
      c.time < range.start - 0.01 || c.time > range.end + 0.01).length;
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
        await this.api.content.restoreClip({ moved: result.moved });
        await this.writeClipTimes(clipsBefore);
        await reopen();
      },
      redo: async () => {
        const again = await this.api.content.trimVideo({
          packDir: pack.dir, videoPath: pack.videoPath, start: range.start, end: range.end,
        });
        if (!again.ok) throw new Error(again.error);
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

  /** Plays the pack's backing track, so the ducking can be checked by ear. */
  playBacking(button) {
    if (this.backingAudio) {
      this.backingAudio.pause();
      this.backingAudio = null;
      button.textContent = '♪ Backing';
      button.classList.remove('on');
      return;
    }
    if (!this.pack.backingUrl) {
      this.toast('This pack has no backing track yet.', 'warn');
      return;
    }

    if (this.video) this.video.pause();
    const audio = new Audio(this.pack.backingUrl);
    // Starts where the playhead is, so you can check one line rather than
    // sitting through the whole track.
    audio.currentTime = this.video ? this.video.currentTime : 0;
    audio.addEventListener('ended', () => {
      button.textContent = '♪ Backing';
      button.classList.remove('on');
      this.backingAudio = null;
    });
    audio.play().catch(() => this.toast('Could not play the backing track.', 'warn'));

    button.textContent = '■ Backing';
    button.classList.add('on');
    this.backingAudio = audio;
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
            <div class="clip-thumb-actions">
              <button type="button" class="icon-btn" data-act="grab"
                      title="Use the frame showing now">⧉</button>
              <button type="button" class="icon-btn" data-act="upload"
                      title="Choose a picture file">↑</button>
              <button type="button" class="icon-btn" data-act="reuse"
                      title="Reuse a picture already in this pack">⧉↺</button>
            </div>
          </div>
          <div class="clip-fields">
            <input class="input" data-field="caption" placeholder="Caption" />
            <input class="input" data-field="character" placeholder="Who says it" />
          </div>
        </div>`;

      row.querySelector('[data-act="grab"]').addEventListener('click', () => this.grabClipImage(clip));
      row.querySelector('[data-act="upload"]').addEventListener('click', () => this.uploadClipImage(clip));
      row.querySelector('[data-act="reuse"]').addEventListener('click', () => this.reuseClipImage(clip));

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
    main.append(el('div', 'slot-intro', `
      <h3>${escapeHtml(pack.title)}</h3>
      <p class="muted">${escapeHtml(spec.blurb)}</p>
      <p class="muted small">Drop a file on a slot, or click it to choose one. Anything in the
         wrong format is converted and named the way the game expects.</p>`));

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

    body.append(main);

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
    card.classList.toggle('filled', Boolean(file));
    if (slot.required && !file) card.classList.add('missing');

    const preview = slot.kind === 'image' && url
      ? `<img src="${url}" alt="" />`
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
  async fillSlot(slot, sourcePath) {
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

    const ok = await this.run(`Adding ${slot.label.toLowerCase()}…`, () => this.importFiles([source], {
      baseName: slot.key,
      kind: slot.kind === 'model' ? undefined : slot.kind,
      overwrite: true,
      audioFormat: 'wav',
    }));
    if (!ok) return;

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
  refreshSlots() {
    const spec = specFor(this.pack.type);
    if (!spec) return;
    for (const group of spec.groups) {
      for (const slot of group.slots) {
        const old = this.root.querySelector(`.slot-card[data-slot="${CSS.escape(slot.key)}"]`);
        if (old) old.replaceWith(this.buildSlot(slot));
      }
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
    if (type === 'menu') return this.renderMenuConfig(side);
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

      <h4 class="side-heading">Writing dialogue</h4>
      <p class="muted small">These stand in for things that change during a session:</p>
      <dl class="token-list">
        <div><dt>&lt;host_name&gt;</dt><dd>the name above</dd></div>
        <div><dt>&lt;player&gt;</dt><dd>whoever is up</dd></div>
        <div><dt>&lt;round&gt;</dt><dd>the round now or next</dd></div>
        <div><dt>&lt;points&gt;</dt><dd>points earned this round</dd></div>
      </dl>
      <p class="muted small">In the config file each dialogue event is a list, and every entry in
         it is one text box. Use <code>\\n</code> for a line break, and do not use
         <code>&lt;/next&gt;</code>; that is only for the in game editor.</p>

      <h4 class="side-heading">Dialogue</h4>
      <p class="muted small" data-role="line-count"></p>
      <button type="button" class="btn btn-small" data-act="open-config">Edit config_host.json</button>
      <p class="muted small">Dialogue is a deep structure and the game has its own editor for it,
         under Extras. This app checks it and leaves the wording to you.</p>`;

    const name = side.querySelector('[data-cfg="name"]');
    name.value = config.name || '';
    name.addEventListener('change', async () => {
      if (await this.patchConfig('config_host.json', { name: name.value.trim() })) {
        this.toast('Saved.', 'ok', 1500);
        if (this.onChanged) await this.onChanged(this.pack.id, { keepEditor: true });
      }
    });

    let lines = 0;
    const walk = (node) => {
      if (Array.isArray(node)) lines += node.filter((v) => typeof v === 'string').length;
      else if (node && typeof node === 'object') Object.values(node).forEach(walk);
    };
    walk(config);
    side.querySelector('[data-role="line-count"]').textContent =
      `${lines} line${lines === 1 ? '' : 's'} of dialogue in this pack.`;

    side.querySelector('[data-act="open-config"]').addEventListener('click', () =>
      this.api.shell.openPath(`${this.pack.dir}\\config_host.json`));
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

  renderMenuConfig(side) {
    const config = this.pack.config || {};
    const audio = config.audio || {};
    const hasVideo = Boolean(this.slotFile('video'));

    side.innerHTML = `
      <h3>Menu options</h3>
      <label class="field"><span>Background fitting</span>
        <select class="select" data-cfg="stretch">
          <option value="false">Tile at its own size</option>
          <option value="true">Stretch to the window</option>
        </select>
      </label>
      <label class="option-row">
        <input type="checkbox" data-cfg="use_video" ${hasVideo ? '' : 'disabled'} />
        <span>
          <b>Use the video's own audio</b>
          <em>${hasVideo
    ? 'Off plays the menu music instead and mutes the video.'
    : 'Only applies once this pack has a background video.'}</em>
        </span>
      </label>`;

    const stretch = side.querySelector('[data-cfg="stretch"]');
    stretch.value = String(Boolean(config.stretch_background));
    stretch.addEventListener('change', async () => {
      if (await this.patchConfig('config_menu.json', {
        stretch_background: stretch.value === 'true',
      })) this.toast('Saved.', 'ok', 1500);
    });

    const useVideo = side.querySelector('[data-cfg="use_video"]');
    useVideo.checked = audio.use_video !== false;
    useVideo.addEventListener('change', async () => {
      if (await this.patchConfig('config_menu.json', {
        audio: { ...audio, use_video: useVideo.checked },
      })) this.toast('Saved.', 'ok', 1500);
    });
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
        </label>`;

      // Through the property: keywords can contain quotes and emoji.
      const [exactInput, broadInput] = row.querySelectorAll('input');
      exactInput.value = exact;
      broadInput.value = broad;

      const playBtn = row.querySelector('[data-act="play"]');
      playBtn.addEventListener('click', () => this.playFile(url, playBtn));

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
