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

export class PackEditor {
  constructor(root, api, toast) {
    this.root = root;
    this.api = api;
    this.toast = toast;
    this.pack = null;
    this.onClose = null;
    this.onChanged = null;
  }

  close() {
    this.root.hidden = true;
    this.root.innerHTML = '';
    if (this.video) {
      this.video.pause();
      this.video = null;
    }
    if (this.onClose) this.onClose();
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

    const openFolder = el('button', 'btn btn-small', 'Open folder');
    openFolder.addEventListener('click', () => this.api.shell.openPath(pack.dir));
    head.append(openFolder);

    this.root.append(head);

    const body = el('div', 'editor-body');
    this.root.append(body);
    this.body = body;

    if (pack.type === 'voice') this.renderDubEditor(body);
    else if (pack.type === 'player') this.renderPlayerEditor(body);
    else this.renderGenericEditor(body);
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
    stage.append(videoWrap);
    this.video = video;

    const controls = el('div', 'editor-controls');
    controls.innerHTML = `
      <div class="editor-transport">
        <button type="button" class="btn btn-icon" data-act="play">▶</button>
        <button type="button" class="btn btn-icon" data-act="back">⟲</button>
        <button type="button" class="btn btn-icon" data-act="fwd">⟳</button>
        <span class="time" data-role="time">0:00.00</span>
        <span class="muted small" data-role="hint">
          Drag across the timeline to make a clip. Drag a block to move it, or its edge to retime
          it. Scroll to zoom, double click to fit.
        </span>
        <button type="button" class="btn btn-small" data-act="zoom-fit">Fit</button>
      </div>
      <canvas class="timeline" data-role="timeline"></canvas>`;
    stage.append(controls);
    body.append(stage);

    const clipPanel = el('aside', 'editor-side');
    clipPanel.innerHTML = '<h3>Clips</h3><div class="clip-list" data-role="clips"></div>';
    body.append(clipPanel);

    this.wireDubControls(controls, clipPanel, video);
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
      }
    });

    const ready = () => {
      timeline.setDuration(video.duration || 0);
      this.loadWaveform(timeline);
    };
    if (video.readyState >= 1) ready();
    else video.addEventListener('loadedmetadata', ready, { once: true });

    video.addEventListener('timeupdate', () => {
      q('time').textContent = fmt(video.currentTime);
      timeline.setPlayhead(video.currentTime);
    });

    this.renderClipList(clipList);
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

    if (!change.resized) {
      const result = await this.api.content.writeClipMeta({
        destDir: pack.dir,
        base: clip.base,
        meta: {
          caption: clip.caption || '',
          character: clip.character || '',
          image: clip.image || `${clip.base}.png`,
          timestamp: change.start,
        },
      });
      if (!result.ok) this.toast(`Could not save it: ${result.error}`, 'error', 7000);
      else this.toast(`Moved to ${fmt(change.start)}.`, 'ok', 1600);
      this.renderClipList(clipList);
      return;
    }

    this.toast('Recutting the clip…');
    const result = await this.api.content.extractClip({
      source: pack.videoPath,
      destDir: pack.dir,
      baseName: clip.base,
      start: change.start,
      duration: change.duration,
      meta: {
        caption: clip.caption || '',
        character: clip.character || '',
        image: clip.image || `${clip.base}.png`,
      },
      overwrite: true,
    });

    if (!result.ok) {
      this.toast(`Could not recut it: ${result.error}`, 'error', 8000);
      return;
    }
    this.toast(`Retimed to ${fmt(change.start)}, ${change.duration.toFixed(2)}s.`, 'ok', 2000);
    if (this.onChanged) await this.onChanged(pack.id, { keepEditor: true });
    this.renderClipList(clipList);
  }

  /** Cuts the marked range out of the video and writes its metadata. */
  async addClip(start, duration, video, clipList) {
    const pack = this.pack;
    const index = (pack.clipCount || 0) + 1;
    const base = clipFileName(index, `clip_${Math.round(start * 1000)}`);

    this.toast('Cutting the clip…');
    const result = await this.api.content.extractClip({
      source: pack.videoPath,
      destDir: pack.dir,
      baseName: base,
      start,
      duration,
      meta: { caption: '', character: '' },
    });

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
      row.innerHTML = `
        <button type="button" class="line-time">${fmt(clip.time)}</button>
        <div class="clip-fields">
          <input class="input" data-field="caption" placeholder="Caption"
                 value="${escapeHtml(clip.caption || '')}" />
          <input class="input" data-field="character" placeholder="Who says it"
                 value="${escapeHtml(clip.character || '')}" />
        </div>`;

      row.querySelector('.line-time').addEventListener('click', () => {
        if (this.video) this.video.currentTime = clip.time;
        if (this.timeline) this.timeline.select(clip.base);
        this.renderClipList(container);
      });

      // Saving on blur keeps typing responsive and avoids a write per keypress.
      for (const input of row.querySelectorAll('[data-field]')) {
        input.addEventListener('change', async () => {
          const fields = row.querySelectorAll('[data-field]');
          await this.api.content.writeClipMeta({
            destDir: this.pack.dir,
            base: clip.base,
            meta: {
              caption: fields[0].value,
              character: fields[1].value,
              image: clip.image || `${clip.base}.png`,
              timestamp: clip.time,
            },
          });
          this.toast('Saved.', 'ok', 1500);
        });
      }

      container.append(row);
    }
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
      row.innerHTML = `
        <span class="slot-label">${escapeHtml(label)}</span>
        <span class="slot-file ${assigned ? '' : 'muted'}">${escapeHtml(assigned || 'nothing')}</span>
        <span class="slot-timer muted small"></span>
        <button type="button" class="btn btn-small rec">● Record</button>
        <button type="button" class="btn btn-small pick">File…</button>`;

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
    const label = row.querySelector('.slot-file');
    label.textContent = base;
    label.classList.remove('muted');
    this.toast('Saved.', 'ok', 1500);
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
