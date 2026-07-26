import { DubPlayer } from './player.js';

const $ = (sel) => document.querySelector(sel);

const el = {
  splash: $('#splash'),
  themeButtons: document.querySelectorAll('[data-theme-set]'),
  setTheme: $('#set-theme'),
  setSplash: $('#set-splash'),
  btnAbout: $('#btn-about'),
  aboutDialog: $('#about-dialog'),
  aboutVersion: $('#about-version'),
  btnAboutClose: $('#btn-about-close'),
  btnAboutPage: $('#btn-about-page'),

  gameDir: $('#game-dir'),
  ffmpegPill: $('#ffmpeg-pill'),
  btnRefresh: $('#btn-refresh'),
  btnSettings: $('#btn-settings'),

  packSearch: $('#pack-search'),
  packList: $('#pack-list'),

  emptyState: $('#empty-state'),
  workspace: $('#workspace'),
  packTitle: $('#pack-title'),
  packSubtitle: $('#pack-subtitle'),
  sessionSelect: $('#session-select'),
  btnExport: $('#btn-export'),

  video: $('#video'),
  portrait: $('#portrait'),
  caption: $('#caption'),
  loadingOverlay: $('#loading-overlay'),
  loadingText: $('#loading-text'),

  btnPlay: $('#btn-play'),
  btnBack: $('#btn-back'),
  btnFwd: $('#btn-fwd'),
  timeDisplay: $('#time-display'),
  scrub: $('#scrub'),
  markers: $('#markers'),
  volBacking: $('#vol-backing'),
  volBackingVal: $('#vol-backing-val'),
  volDub: $('#vol-dub'),
  volDubVal: $('#vol-dub-val'),

  lineCount: $('#line-count'),
  lineList: $('#line-list'),
  btnAllTake: $('#btn-all-take'),
  btnAllOriginal: $('#btn-all-original'),
  btnResetMix: $('#btn-reset-mix'),

  exportDialog: $('#export-dialog'),
  optFormat: $('#opt-format'),
  optPreset: $('#opt-preset'),
  optQuality: $('#opt-quality'),
  optScope: $('#opt-scope'),
  optBurn: $('#opt-burn'),
  optSrt: $('#opt-srt'),
  optNormalize: $('#opt-normalize'),
  optOriginal: $('#opt-original'),
  optOutput: $('#opt-output'),
  btnPickOutput: $('#btn-pick-output'),
  exportSummary: $('#export-summary'),
  btnExportCancel: $('#btn-export-cancel'),
  btnExportStart: $('#btn-export-start'),

  settingsDialog: $('#settings-dialog'),
  setGameDir: $('#set-gamedir'),
  setOutDir: $('#set-outdir'),
  setFfmpeg: $('#set-ffmpeg'),
  settingsFfmpegStatus: $('#settings-ffmpeg-status'),
  btnPickGameDir: $('#btn-pick-gamedir'),
  btnPickOutDir: $('#btn-pick-outdir'),
  btnPickFfmpeg: $('#btn-pick-ffmpeg'),
  btnClearFfmpeg: $('#btn-clear-ffmpeg'),
  btnSettingsClose: $('#btn-settings-close'),

  progressBar: $('#progress-bar'),
  progressTitle: $('#progress-title'),
  progressDetail: $('#progress-detail'),
  progressFill: $('#progress-fill'),
  btnProgressCancel: $('#btn-progress-cancel'),

  toasts: $('#toasts'),
};

const state = {
  info: null,
  settings: null,
  model: null,
  pack: null,
  session: null,
  durations: {},      // absolute path -> seconds
  selectedLineId: null,
  filter: '',
  activeExportId: null,
  scrubbing: false,
};

const player = new DubPlayer(el.video);

// Utilities

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

function formatTime(seconds) {
  if (!Number.isFinite(seconds)) return '0:00';
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function formatBytes(bytes) {
  if (!bytes) return '';
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  let value = bytes;
  while (value >= 1024 && i < units.length - 1) { value /= 1024; i++; }
  return `${value.toFixed(value < 10 && i > 0 ? 1 : 0)} ${units[i]}`;
}

function sanitizeFilename(name) {
  return String(name).replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').replace(/\s+/g, ' ').trim();
}

function toast(message, kind = 'info', timeout = 4200) {
  const node = document.createElement('div');
  node.className = `toast toast-${kind}`;
  node.textContent = message;
  el.toasts.append(node);
  requestAnimationFrame(() => node.classList.add('in'));
  setTimeout(() => {
    node.classList.remove('in');
    setTimeout(() => node.remove(), 250);
  }, timeout);
  return node;
}

function friendlySessionName(session) {
  if (!session) return 'No recordings';
  const date = session.date ? new Date(session.date) : null;
  const label = date
    ? date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
    : session.name;
  const kind = session.isFreestyle ? 'freestyle' : `${session.takeCount} takes`;
  return `${label} (${kind})`;
}

// Theme

const systemDark = window.matchMedia('(prefers-color-scheme: dark)');

const resolveTheme = (pref) =>
  (pref === 'light' || pref === 'dark') ? pref : (systemDark.matches ? 'dark' : 'light');

/** Stamps a concrete theme on <html>; the stylesheet keys off that alone. */
function applyTheme(pref) {
  document.documentElement.dataset.theme = resolveTheme(pref);
  for (const button of el.themeButtons) {
    button.classList.toggle('on', button.dataset.themeSet === pref);
  }
  el.setTheme.value = pref;
}

async function setTheme(pref) {
  state.settings = await window.api.settings.set({ theme: pref });
  applyTheme(pref);
}

systemDark.addEventListener('change', () => {
  if (state.settings && (state.settings.theme || 'system') === 'system') applyTheme('system');
});

// Splash

const SPLASH_MIN_MS = 1700;

function dismissSplash() {
  if (el.splash.hidden) return;
  el.splash.classList.add('out');
  setTimeout(() => { el.splash.hidden = true; }, 500);
}

// Boot

async function boot() {
  state.info = await window.api.appInfo();
  state.settings = await window.api.settings.get();

  // Theme first, so the splash and shell paint in the right palette.
  applyTheme(state.settings.theme || 'system');
  el.aboutVersion.textContent = state.info.version;

  const wantSplash = state.settings.showSplash !== false;
  const splashUntil = Date.now() + SPLASH_MIN_MS;
  if (!wantSplash) { el.splash.hidden = true; }

  renderFfmpegStatus();
  applyExportDefaults();
  await rescan(state.settings.gameDir || state.info.defaultGameDir);
  wireEvents();
  requestAnimationFrame(tick);

  if (wantSplash) setTimeout(dismissSplash, Math.max(0, splashUntil - Date.now()));
}

function renderFfmpegStatus() {
  const { ffmpeg } = state.info;
  if (ffmpeg.ok) {
    el.ffmpegPill.textContent = `ffmpeg ${ffmpeg.version || 'ready'}`;
    el.ffmpegPill.className = 'pill pill-ok';
  } else {
    el.ffmpegPill.textContent = 'ffmpeg missing';
    el.ffmpegPill.className = 'pill pill-bad';
  }
  el.settingsFfmpegStatus.textContent = ffmpeg.ok
    ? `Using: ${ffmpeg.ffmpeg}`
    : 'ffmpeg was not found. Exporting will not work until it is installed or located here.';
}

async function rescan(dir) {
  try {
    state.model = await window.api.game.scan(dir);
    state.settings = await window.api.settings.get();
    el.gameDir.textContent = state.model.gameDir;
    el.gameDir.title = state.model.gameDir;
    renderPacks();

    const withRecordings = state.model.packs.filter((p) => p.sessions.length);
    if (!state.model.packs.length) {
      toast('No voice packs found in that folder.', 'warn');
    } else if (!withRecordings.length) {
      toast('Packs found, but no recordings yet. Dub something in the game first.', 'warn', 6000);
    }
  } catch (err) {
    el.gameDir.textContent = 'Game folder not found. Click here to choose it.';
    toast(err.message, 'error', 8000);
  }
}

// Pack list

function renderPacks() {
  el.packList.innerHTML = '';
  if (!state.model) return;

  const needle = state.filter.trim().toLowerCase();
  const packs = state.model.packs.filter((p) => {
    if (!needle) return true;
    return p.title.toLowerCase().includes(needle)
      || p.name.toLowerCase().includes(needle)
      || (p.subtitle || '').toLowerCase().includes(needle);
  });

  if (!packs.length) {
    el.packList.innerHTML = '<p class="muted pad">No packs match that search.</p>';
    return;
  }

  for (const pack of packs) {
    const card = document.createElement('button');
    card.className = 'pack-card';
    card.classList.toggle('active', state.pack && state.pack.id === pack.id);

    const icon = pack.iconUrl
      ? `<img class="pack-icon" src="${pack.iconUrl}" alt="" loading="lazy" />`
      : '<div class="pack-icon pack-icon-blank">🎬</div>';

    const takes = pack.sessions.length
      ? `<span class="chip chip-ok">${pack.sessions.length} session${pack.sessions.length > 1 ? 's' : ''}</span>`
      : '<span class="chip">no dubs yet</span>';

    card.innerHTML = `
      ${icon}
      <span class="pack-meta">
        <strong>${escapeHtml(pack.title)}</strong>
        <span class="muted small">${pack.lines.length} lines</span>
        ${takes}
      </span>`;

    card.addEventListener('click', () => selectPack(pack));
    el.packList.append(card);
  }
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text == null ? '' : String(text);
  return div.innerHTML;
}

// Pack / session selection

async function selectPack(pack) {
  state.pack = pack;
  state.selectedLineId = null;
  renderPacks();

  el.emptyState.hidden = true;
  el.workspace.hidden = false;
  el.packTitle.textContent = pack.title;
  el.packSubtitle.textContent = pack.subtitle
    || (pack.authors.length ? `by ${pack.authors.join(', ')}` : '');

  el.sessionSelect.innerHTML = '';
  if (!pack.sessions.length) {
    const opt = document.createElement('option');
    opt.textContent = 'No recordings, original audio only';
    opt.value = '';
    el.sessionSelect.append(opt);
  } else {
    for (const session of pack.sessions) {
      const opt = document.createElement('option');
      opt.value = session.id;
      opt.textContent = friendlySessionName(session);
      el.sessionSelect.append(opt);
    }
  }

  await loadSession(pack.sessions[0] || null);
}

async function loadSession(session) {
  state.session = session;
  player.stop();

  showLoading(true, 'Reading clip lengths…');

  // Durations drive caption timing and export placement, and come from
  // ffprobe rather than the decoder so they're known before audio loads.
  const paths = [];
  for (const line of state.pack.lines) {
    if (line.sourceAudioPath) paths.push(line.sourceAudioPath);
    if (session && session.takes[line.base]) paths.push(session.takes[line.base]);
  }
  if (session && session.freestylePath) paths.push(session.freestylePath);

  try {
    Object.assign(state.durations, await window.api.media.probe(paths));
  } catch (err) {
    console.warn('Probe failed:', err.message);
  }

  // Seed line durations so the UI has them even before decoding finishes.
  for (const line of state.pack.lines) {
    const takePath = session && session.takes[line.base];
    line.duration = state.durations[takePath] || state.durations[line.sourceAudioPath] || 0;
  }

  // The pack video is Ogg Theora, which Chromium can no longer decode, so the
  // preview plays a cached MP4 transcode. Exports still use the original.
  showLoading(true, 'Preparing preview…');
  const proxy = await window.api.media.proxy(state.pack.videoPath);
  if (proxy.ok) {
    el.video.src = proxy.url;
    el.video.load();
  } else {
    toast(`Could not prepare the preview video: ${proxy.error}`, 'error', 9000);
  }

  showLoading(true, 'Loading audio…');
  try {
    await player.load({
      pack: state.pack,
      session,
      onProgress: (fraction) => {
        el.loadingText.textContent = `Loading audio… ${Math.round(fraction * 100)}%`;
      },
    });
  } catch (err) {
    toast(`Could not load audio: ${err.message}`, 'error', 7000);
  }
  showLoading(false);

  player.setBackingVolume(Number(el.volBacking.value) / 100);
  player.setDubVolume(Number(el.volDub.value) / 100);

  renderLines();
  renderMarkers();
}

function showLoading(visible, text) {
  el.loadingOverlay.hidden = !visible;
  if (text) el.loadingText.textContent = text;
}

// Line list

function renderLines() {
  el.lineList.innerHTML = '';
  const items = player.items;
  el.lineCount.textContent = `(${items.length})`;

  if (state.session && state.session.isFreestyle) {
    el.lineList.innerHTML = `
      <div class="freestyle-note">
        <strong>Freestyle take</strong>
        <p class="muted">This session is one continuous recording over the whole video, so there
        are no per-line controls. The captions below still show the original script.</p>
      </div>`;
  }

  for (const item of items) {
    const row = document.createElement('div');
    row.className = 'line-row';
    row.dataset.id = item.id;
    row.classList.toggle('selected', state.selectedLineId === item.id);

    const hasTake = Boolean(item.takeUrl);
    const hasOriginal = Boolean(item.originalUrl);

    row.innerHTML = `
      <button class="line-time" title="Jump to this line">${formatTime(item.time)}</button>
      <div class="line-body">
        <div class="line-top">
          <span class="line-char">${escapeHtml(item.character || 'Unknown')}</span>
          ${hasTake ? '' : '<span class="chip chip-warn">not dubbed</span>'}
          <span class="muted small">${item.duration ? `${item.duration.toFixed(1)}s` : ''}</span>
        </div>
        <p class="line-caption">${escapeHtml(item.caption || '(no caption)')}</p>
      </div>
      <div class="line-controls">
        <div class="segmented" role="group">
          <button data-src="take" ${hasTake ? '' : 'disabled'}
                  class="${item.source === 'take' ? 'on' : ''}" title="Use your recording">Yours</button>
          <button data-src="original" ${hasOriginal ? '' : 'disabled'}
                  class="${item.source === 'original' ? 'on' : ''}" title="Use the original audio">Original</button>
          <button data-src="none"
                  class="${item.source === 'none' ? 'on' : ''}" title="Silence this line">Off</button>
        </div>
        <label class="line-vol" title="Line volume">
          <input type="range" min="0" max="200" value="${Math.round(item.volume * 100)}" />
        </label>
        <div class="nudge" title="Shift this line's timing">
          <button data-nudge="-0.05">−</button>
          <span class="nudge-val">${item.offset ? `${item.offset > 0 ? '+' : ''}${(item.offset * 1000).toFixed(0)}ms` : '0'}</span>
          <button data-nudge="0.05">+</button>
        </div>
      </div>`;

    row.querySelector('.line-time').addEventListener('click', () => {
      player.seek(item.time);
      selectLine(item.id);
    });

    row.addEventListener('click', (event) => {
      if (event.target.closest('button, input')) return;
      selectLine(item.id);
    });

    for (const button of row.querySelectorAll('.segmented button')) {
      button.addEventListener('click', async () => {
        await player.setLineSource(item.id, button.dataset.src);
        renderLines();
      });
    }

    row.querySelector('.line-vol input').addEventListener('input', (event) => {
      player.setLineVolume(item.id, Number(event.target.value) / 100);
    });

    for (const button of row.querySelectorAll('.nudge button')) {
      button.addEventListener('click', () => {
        const next = clamp(item.offset + Number(button.dataset.nudge), -5, 5);
        player.setLineOffset(item.id, next);
        row.querySelector('.nudge-val').textContent =
          next ? `${next > 0 ? '+' : ''}${(next * 1000).toFixed(0)}ms` : '0';
        renderMarkers();
      });
    }

    el.lineList.append(row);
  }
}

function selectLine(id) {
  state.selectedLineId = id;
  for (const row of el.lineList.querySelectorAll('.line-row')) {
    row.classList.toggle('selected', row.dataset.id === id);
  }
}

function renderMarkers() {
  el.markers.innerHTML = '';
  const duration = el.video.duration;
  if (!Number.isFinite(duration) || duration <= 0) return;

  for (const item of player.items) {
    const mark = document.createElement('span');
    mark.className = 'marker';
    if (!item.takeUrl) mark.classList.add('marker-missing');
    mark.style.left = `${((item.time + item.offset) / duration) * 100}%`;
    mark.title = `${formatTime(item.time)}\n${item.character}: ${item.caption}`;
    mark.addEventListener('click', () => player.seek(item.time + item.offset));
    el.markers.append(mark);
  }
}

// Playback loop

function tick() {
  const time = el.video.currentTime || 0;
  const duration = el.video.duration || 0;

  if (!state.scrubbing && duration > 0) {
    el.scrub.value = String(Math.round((time / duration) * 1000));
  }
  el.timeDisplay.textContent = `${formatTime(time)} / ${formatTime(duration)}`;

  const active = player.activeItem(time);
  if (active && active.caption) {
    el.caption.hidden = false;
    el.caption.innerHTML = active.character
      ? `<b>${escapeHtml(active.character)}</b>${escapeHtml(active.caption)}`
      : escapeHtml(active.caption);
  } else {
    el.caption.hidden = true;
  }

  if (active && active.imageUrl) {
    if (el.portrait.getAttribute('src') !== active.imageUrl) el.portrait.src = active.imageUrl;
    el.portrait.hidden = false;
  } else {
    el.portrait.hidden = true;
  }

  requestAnimationFrame(tick);
}

// Export

/** Caption windows, clipped so a long line never overruns the next speaker. */
function buildCaptions() {
  const items = [...player.items].sort((a, b) => a.time - b.time);
  return items.map((item, i) => {
    const start = item.time + item.offset;
    const next = items[i + 1];
    const natural = start + Math.max(item.duration || 0, 0.9);
    const limit = next ? (next.time + next.offset) - 0.04 : Infinity;
    return {
      start,
      end: Math.max(start + 0.5, Math.min(natural, limit)),
      text: item.caption || '',
      character: item.character || '',
    };
  }).filter((c) => c.text);
}

function buildTracks() {
  const pack = state.pack;
  const session = state.session;

  if (session && session.isFreestyle && session.freestylePath) {
    return [{
      path: session.freestylePath,
      time: 0,
      offset: 0,
      volume: 1,
      duration: state.durations[session.freestylePath] || 0,
      enabled: true,
    }];
  }

  const tracks = [];
  for (const item of player.items) {
    if (item.source === 'none' || item.muted) continue;
    const line = pack.lines.find((l) => l.id === item.id);
    if (!line) continue;

    const path = item.source === 'take'
      ? (session && session.takes[line.base])
      : line.sourceAudioPath;
    if (!path) continue;

    tracks.push({
      path,
      time: item.time,
      offset: item.offset,
      volume: item.volume,
      duration: state.durations[path] || item.duration || 0,
      enabled: true,
    });
  }
  return tracks;
}

function defaultOutputName() {
  const pack = sanitizeFilename(state.pack.title);
  const session = state.session;
  const stamp = session && session.date
    ? new Date(session.date).toISOString().slice(0, 16).replace(/[-T:]/g, '_')
    : 'original';
  const scope = el.optScope.value === 'line' && state.selectedLineId
    ? `_${sanitizeFilename(state.selectedLineId)}`
    : '';
  return `${pack}_${stamp}${scope}.${el.optFormat.value}`;
}

function applyExportDefaults() {
  const opts = state.settings.exportOptions || {};
  el.optFormat.value = opts.format || 'mp4';
  el.optPreset.value = opts.preset || 'source';
  el.optQuality.value = opts.quality || 'balanced';
  el.optBurn.checked = Boolean(opts.burnCaptions);
  el.optSrt.checked = Boolean(opts.writeSrt);
  el.optNormalize.checked = Boolean(opts.normalizeDub);
  el.optOriginal.checked = Boolean(opts.includeOriginalAudio);
}

function currentExportOptions() {
  return {
    format: el.optFormat.value,
    preset: el.optPreset.value,
    quality: el.optQuality.value,
    burnCaptions: el.optBurn.checked,
    writeSrt: el.optSrt.checked,
    normalizeDub: el.optNormalize.checked,
    includeOriginalAudio: el.optOriginal.checked,
    backingVolume: Number(el.volBacking.value) / 100,
    dubVolume: Number(el.volDub.value) / 100,
  };
}

function updateExportSummary() {
  const tracks = buildTracks();
  const scope = el.optScope.value;
  const parts = [`${tracks.length} audio clip${tracks.length === 1 ? '' : 's'}`];

  if (scope === 'line') {
    const item = player.items.find((i) => i.id === state.selectedLineId);
    parts.push(item ? `just "${item.character}" at ${formatTime(item.time)}` : 'no line selected');
  } else {
    parts.push(`${formatTime(el.video.duration || 0)} long`);
  }
  if (el.optBurn.checked) parts.push('captions burned in');
  el.exportSummary.textContent = parts.join(' · ');
}

async function openExportDialog() {
  if (!state.info.ffmpeg.ok) {
    toast('ffmpeg is not available. Set its location in Settings.', 'error', 7000);
    return;
  }
  const dir = state.settings.outputDir.replace(/[\\/]+$/, '');
  el.optOutput.value = `${dir}${pathSep()}${defaultOutputName()}`;
  updateExportSummary();
  el.exportDialog.showModal();
}

function pathSep() {
  return state.info.platform === 'win32' ? '\\' : '/';
}

async function startExport() {
  const scope = el.optScope.value;
  const options = currentExportOptions();

  let trim = null;
  if (scope === 'line') {
    const item = player.items.find((i) => i.id === state.selectedLineId);
    if (!item) {
      toast('Select a line first, then export.', 'warn');
      return;
    }
    const start = Math.max(0, item.time + item.offset - 0.4);
    const end = item.time + item.offset + Math.max(item.duration || 1, 1) + 0.6;
    trim = { start, end: Math.min(end, el.video.duration || end) };
  }

  const job = {
    videoPath: state.pack.videoPath,
    backingPath: state.pack.backingPath,
    tracks: buildTracks(),
    captions: buildCaptions(),
    outputPath: el.optOutput.value,
    options: { ...options, trim },
  };

  el.exportDialog.close();
  await window.api.settings.set({ exportOptions: options });
  state.settings = await window.api.settings.get();

  showProgress(true, 'Exporting…', '');
  const result = await window.api.exporter.run(job);
  showProgress(false);

  if (result.ok) {
    const done = toast(`Exported ${formatBytes(result.size)}. Click to show the file.`, 'ok', 9000);
    done.style.cursor = 'pointer';
    done.addEventListener('click', () => window.api.shell.reveal(result.outputPath));
  } else if (result.cancelled) {
    toast('Export cancelled.', 'warn');
  } else {
    toast(`Export failed: ${result.error.split('\n')[0]}`, 'error', 12000);
    console.error(result.error);
  }
}

function showProgress(visible, title, detail) {
  el.progressBar.hidden = !visible;
  if (title) el.progressTitle.textContent = title;
  if (detail != null) el.progressDetail.textContent = detail;
  if (!visible) el.progressFill.style.width = '0%';
}

// Settings

function openSettings() {
  el.setGameDir.value = state.settings.gameDir || '';
  el.setOutDir.value = state.settings.outputDir || '';
  el.setFfmpeg.value = state.settings.ffmpegPath || '';
  el.setTheme.value = state.settings.theme || 'system';
  el.setSplash.checked = state.settings.showSplash !== false;
  renderFfmpegStatus();
  el.settingsDialog.showModal();
}

// Events

function wireEvents() {
  el.splash.addEventListener('click', dismissSplash);

  for (const button of el.themeButtons) {
    button.addEventListener('click', () => setTheme(button.dataset.themeSet));
  }
  el.setTheme.addEventListener('change', () => setTheme(el.setTheme.value));
  el.setSplash.addEventListener('change', async () => {
    state.settings = await window.api.settings.set({ showSplash: el.setSplash.checked });
  });

  el.btnAbout.addEventListener('click', () => el.aboutDialog.showModal());
  el.btnAboutClose.addEventListener('click', () => el.aboutDialog.close());
  el.btnAboutPage.addEventListener('click', () => {
    window.api.shell.openExternal('https://yeahmaybe.itch.io/the-choicer-voicer');
  });

  el.packSearch.addEventListener('input', (e) => {
    state.filter = e.target.value;
    renderPacks();
  });

  el.gameDir.addEventListener('click', pickGameDir);
  el.btnRefresh.addEventListener('click', () => rescan(state.settings.gameDir));
  el.btnSettings.addEventListener('click', openSettings);

  el.sessionSelect.addEventListener('change', () => {
    const session = state.pack.sessions.find((s) => s.id === el.sessionSelect.value);
    loadSession(session || null);
  });

  el.btnPlay.addEventListener('click', () => player.toggle());
  el.btnBack.addEventListener('click', () => player.seek(el.video.currentTime - 5));
  el.btnFwd.addEventListener('click', () => player.seek(el.video.currentTime + 5));
  el.video.addEventListener('loadedmetadata', renderMarkers);

  player.onStateChange = (playing) => {
    el.btnPlay.textContent = playing ? '❚❚' : '▶';
  };

  el.scrub.addEventListener('pointerdown', () => { state.scrubbing = true; });
  el.scrub.addEventListener('pointerup', () => { state.scrubbing = false; });
  el.scrub.addEventListener('input', () => {
    const duration = el.video.duration || 0;
    if (duration) player.seek((Number(el.scrub.value) / 1000) * duration);
  });

  el.volBacking.addEventListener('input', () => {
    const v = Number(el.volBacking.value) / 100;
    el.volBackingVal.textContent = `${el.volBacking.value}%`;
    player.setBackingVolume(v);
  });
  el.volDub.addEventListener('input', () => {
    const v = Number(el.volDub.value) / 100;
    el.volDubVal.textContent = `${el.volDub.value}%`;
    player.setDubVolume(v);
  });

  el.btnAllTake.addEventListener('click', () => setAllSources('take'));
  el.btnAllOriginal.addEventListener('click', () => setAllSources('original'));
  el.btnResetMix.addEventListener('click', () => {
    for (const item of player.items) {
      item.volume = 1;
      item.offset = 0;
      item.muted = false;
      item.source = item.takeUrl ? 'take' : (item.originalUrl ? 'original' : 'none');
    }
    player._schedule();
    renderLines();
    renderMarkers();
  });

  el.btnExport.addEventListener('click', openExportDialog);
  el.btnExportCancel.addEventListener('click', () => el.exportDialog.close());
  el.btnExportStart.addEventListener('click', startExport);
  el.optScope.addEventListener('change', updateExportSummary);
  el.optBurn.addEventListener('change', updateExportSummary);
  el.optFormat.addEventListener('change', () => {
    el.optOutput.value = el.optOutput.value.replace(/\.[^.\\/]+$/, `.${el.optFormat.value}`);
  });

  el.btnPickOutput.addEventListener('click', async () => {
    const picked = await window.api.dialog.pickOutput({
      defaultPath: el.optOutput.value,
      format: el.optFormat.value,
    });
    if (picked) el.optOutput.value = picked;
  });

  el.btnPickGameDir.addEventListener('click', pickGameDir);
  el.btnPickOutDir.addEventListener('click', async () => {
    const dir = await window.api.dialog.pickDirectory(state.settings.outputDir);
    if (!dir) return;
    state.settings = await window.api.settings.set({ outputDir: dir });
    el.setOutDir.value = dir;
  });
  el.btnPickFfmpeg.addEventListener('click', async () => {
    const p = await window.api.dialog.pickBinary('ffmpeg');
    if (!p) return;
    state.settings = await window.api.settings.set({ ffmpegPath: p });
    state.info = await window.api.appInfo();
    el.setFfmpeg.value = p;
    renderFfmpegStatus();
  });
  el.btnClearFfmpeg.addEventListener('click', async () => {
    state.settings = await window.api.settings.set({ ffmpegPath: null, ffprobePath: null });
    state.info = await window.api.appInfo();
    el.setFfmpeg.value = '';
    renderFfmpegStatus();
  });
  el.btnSettingsClose.addEventListener('click', () => el.settingsDialog.close());

  el.btnProgressCancel.addEventListener('click', () => window.api.exporter.cancelAll());

  // First open of a pack transcodes its video; show how far along that is.
  window.api.media.onProxyProgress(({ percent }) => {
    if (percent != null) el.loadingText.textContent = `Preparing preview… ${percent.toFixed(0)}%`;
  });

  window.api.exporter.on('export:started', ({ id }) => { state.activeExportId = id; });
  window.api.exporter.on('export:progress', ({ percent, seconds, duration }) => {
    if (percent != null) {
      el.progressFill.style.width = `${percent.toFixed(1)}%`;
      el.progressDetail.textContent = `${formatTime(seconds)} of ${formatTime(duration)} · ${percent.toFixed(0)}%`;
    } else {
      el.progressDetail.textContent = formatTime(seconds);
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.target.matches('input, select, textarea') || document.querySelector('dialog[open]')) return;
    if (event.code === 'Space') { event.preventDefault(); player.toggle(); }
    else if (event.code === 'ArrowLeft') player.seek(el.video.currentTime - (event.shiftKey ? 1 : 5));
    else if (event.code === 'ArrowRight') player.seek(el.video.currentTime + (event.shiftKey ? 1 : 5));
    else if (event.key === 'r' || event.key === 'R') rescan(state.settings.gameDir);
    else if (event.key === 'e' || event.key === 'E') { if (state.pack) openExportDialog(); }
  });
}

async function setAllSources(source) {
  for (const item of player.items) {
    const available = source === 'take' ? item.takeUrl : item.originalUrl;
    if (available) await player.setLineSource(item.id, source);
  }
  renderLines();
}

async function pickGameDir() {
  const dir = await window.api.game.pickFolder();
  if (!dir) return;
  state.settings = await window.api.settings.set({ gameDir: dir });
  state.pack = null;
  state.session = null;
  el.workspace.hidden = true;
  el.emptyState.hidden = false;
  el.setGameDir.value = dir;
  await rescan(dir);
}

boot().catch((err) => {
  console.error(err);
  toast(`Startup failed: ${err.message}`, 'error', 12000);
});
