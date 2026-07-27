import { DubPlayer } from './player.js';

const $ = (sel) => document.querySelector(sel);

const el = {
  splash: $('#splash'),
  themeButtons: document.querySelectorAll('[data-theme-set]'),
  setTheme: $('#set-theme'),
  setSplash: $('#set-splash'),
  btnAbout: $('#btn-about'),
  btnDiscord: $('#btn-discord'),
  aboutDialog: $('#about-dialog'),
  aboutVersion: $('#about-version'),
  aboutUpdate: $('#about-update'),
  btnAboutClose: $('#btn-about-close'),
  btnAboutPage: $('#btn-about-page'),
  btnAboutDiscord: $('#btn-about-discord'),
  btnAboutRepo: $('#btn-about-repo'),
  btnAboutDonate: $('#btn-about-donate'),
  donateBlurb: $('#donate-blurb'),
  helpTabs: document.querySelectorAll('.help-tab'),

  alertBar: $('#alert-bar'),
  alertText: $('#alert-text'),
  alertAction: $('#alert-action'),

  captionDialog: $('#caption-dialog'),
  btnCaptionStyle: $('#btn-caption-style'),
  btnCaptionClose: $('#btn-caption-close'),
  btnCaptionReset: $('#btn-caption-reset'),
  captionPreview: $('#caption-preview'),
  capFont: $('#cap-font'),
  capSize: $('#cap-size'),
  capMargin: $('#cap-margin'),
  capColor: $('#cap-color'),
  capOutlineColor: $('#cap-outline-color'),
  capOutline: $('#cap-outline'),
  capShowSpeaker: $('#cap-show-speaker'),
  capPerCharacter: $('#cap-per-character'),
  characterColors: $('#character-colors'),

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
  progressName: $('#progress-name'),
  progressDetail: $('#progress-detail'),
  progressQueue: $('#progress-queue'),
  progressFill: $('#progress-fill'),
  btnProgressCancel: $('#btn-progress-cancel'),
  btnProgressCancelAll: $('#btn-progress-cancel-all'),

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
  runningExportId: null,
  scrubbing: false,
  outputPathChosen: false,
  // Guards against two pack loads racing when you click through the list fast.
  loadTicket: 0,
  loadAbort: null,
  loadingVideoPath: null,
  loading: false,
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

/**
 * Turns a pack or line name into a tidy filename token: no characters Windows
 * refuses, no spaces or punctuation, and no runs of underscores.
 * "Pizza Commercial: Hold the Sauce?" becomes "Pizza_Commercial_Hold_the_Sauce".
 */
function sanitizeFilename(name) {
  return String(name)
    .replace(/['’]/g, '')            // Caine's -> Caines, rather than Caine_s
    .replace(/[^A-Za-z0-9]+/g, '_')  // everything else becomes a separator
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
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

// Captions and character colours

const DEFAULT_CAPTION_STYLE = {
  font: 'Arial',
  fontSize: 46,
  marginV: 70,
  color: '#ffffff',
  outlineColor: '#000000',
  outline: 3.5,
  showSpeaker: true,
  perCharacterColors: true,
};

// Picked to stay legible on video in both light and dark scenes, and to stay
// distinguishable for the most common forms of colour blindness.
const CHARACTER_PALETTE = [
  '#7fdcff', '#ffd166', '#8affc1', '#ff9ecd', '#c2a3ff',
  '#ffb27f', '#9fe8ff', '#ffe98a', '#b8ff9e', '#ff8f8f',
];

function captionStyle() {
  return { ...DEFAULT_CAPTION_STYLE, ...(state.settings.captionStyle || {}) };
}

/**
 * A character's colour: whatever you picked, else one from the palette chosen
 * by name so the same character keeps the same colour between sessions.
 */
function characterColor(name) {
  const style = captionStyle();
  if (!style.perCharacterColors || !name) return style.color;

  const overrides = state.settings.characterColors || {};
  if (overrides[name]) return overrides[name];

  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return CHARACTER_PALETTE[hash % CHARACTER_PALETTE.length];
}

/** Distinct speakers in the loaded pack, in the order they first appear. */
function packCharacters() {
  const seen = [];
  for (const item of player.items) {
    if (item.character && !seen.includes(item.character)) seen.push(item.character);
  }
  return seen;
}

async function saveCaptionStyle(patch) {
  state.settings = await window.api.settings.set({
    captionStyle: { ...captionStyle(), ...patch },
  });
  applyCaptionStyle();
}

/** Pushes the style onto the preview overlay through CSS custom properties. */
function applyCaptionStyle() {
  const s = captionStyle();
  const root = el.caption.style;
  root.setProperty('--cap-font', s.font);
  root.setProperty('--cap-color', s.color);
  // The overlay is sized against a 1080-tall frame, same as the export.
  const scale = (el.video.videoHeight || 1080) / 1080;
  root.setProperty('--cap-size', `${Math.max(11, s.fontSize * scale * 0.62)}px`);
  root.setProperty('--cap-bottom', `${Math.max(6, s.marginV * scale * 0.62)}px`);
  root.setProperty(
    '--cap-shadow',
    s.outline > 0 ? buildTextOutline(s.outlineColor, Math.max(1, s.outline * scale * 0.5)) : 'none'
  );
}

/** CSS has no text outline, so it is faked with shadows in eight directions. */
function buildTextOutline(color, width) {
  const steps = [];
  for (let a = 0; a < 360; a += 45) {
    const rad = (a * Math.PI) / 180;
    steps.push(`${(Math.cos(rad) * width).toFixed(2)}px ${(Math.sin(rad) * width).toFixed(2)}px 0 ${color}`);
  }
  return steps.join(', ');
}

function renderCaptionPreview() {
  const s = captionStyle();
  const name = packCharacters()[0] || 'Caine';
  const speaker = s.showSpeaker
    ? `<b style="color:${characterColor(name)}">${escapeHtml(name)}</b>`
    : '';
  el.captionPreview.innerHTML = `${speaker}${escapeHtml('This is what your captions will look like.')}`;
  el.captionPreview.style.fontFamily = s.font;
  el.captionPreview.style.color = s.color;
  el.captionPreview.style.fontSize = `${Math.max(12, s.fontSize * 0.42)}px`;
  el.captionPreview.style.textShadow = s.outline > 0
    ? buildTextOutline(s.outlineColor, Math.max(1, s.outline * 0.42))
    : 'none';
  el.captionPreview.style.paddingBottom = `${Math.max(0, s.marginV * 0.24)}px`;
}

function renderCharacterColors() {
  const names = packCharacters();
  el.characterColors.innerHTML = '';

  if (!names.length) {
    el.characterColors.innerHTML = '<p class="muted small">Open a pack to see its characters.</p>';
    return;
  }

  const overrides = state.settings.characterColors || {};
  const enabled = captionStyle().perCharacterColors;

  for (const name of names) {
    const row = document.createElement('div');
    row.className = 'character-row';
    row.innerHTML = `
      <input type="color" class="color" value="${characterColor(name)}" ${enabled ? '' : 'disabled'} />
      <span class="character-name">${escapeHtml(name)}</span>
      ${overrides[name] ? '<button type="button" class="link-btn">reset</button>' : ''}`;

    row.querySelector('input').addEventListener('change', async (event) => {
      state.settings = await window.api.settings.set({
        characterColors: { ...(state.settings.characterColors || {}), [name]: event.target.value },
      });
      renderCharacterColors();
      renderCaptionPreview();
    });

    const reset = row.querySelector('.link-btn');
    if (reset) {
      reset.addEventListener('click', async () => {
        const next = { ...(state.settings.characterColors || {}) };
        delete next[name];
        state.settings = await window.api.settings.set({ characterColors: next, replaceCharacterColors: true });
        renderCharacterColors();
        renderCaptionPreview();
      });
    }

    el.characterColors.append(row);
  }
}

function openCaptionDialog() {
  const s = captionStyle();
  el.capFont.value = s.font;
  el.capSize.value = String(s.fontSize);
  el.capMargin.value = String(s.marginV);
  el.capColor.value = s.color;
  el.capOutlineColor.value = s.outlineColor;
  el.capOutline.value = String(s.outline);
  el.capShowSpeaker.checked = s.showSpeaker !== false;
  el.capPerCharacter.checked = s.perCharacterColors !== false;
  renderCharacterColors();
  renderCaptionPreview();
  el.captionDialog.showModal();
}

// Donations

// Only ask once the app has genuinely earned it, and rarely. A free tool that
// nags is worse than one that never asks.
const DONATE_AFTER_EXPORTS = 3;
const DONATE_COOLDOWN_DAYS = 14;

function donateUrl() {
  return (state.info && state.info.links && state.info.links.donate) || null;
}

/**
 * Whether the donation note is due. Kept separate from the DOM so the rules
 * can be checked directly: getting this wrong means pestering people.
 */
export function shouldAskForDonation(settings, now = Date.now()) {
  if (!settings) return false;
  if (settings.donateDismissed) return false;
  if ((settings.exportsCompleted || 0) < DONATE_AFTER_EXPORTS) return false;

  const last = settings.donatePromptedAt ? Date.parse(settings.donatePromptedAt) : 0;
  if (!Number.isFinite(last)) return true;
  return now - last >= DONATE_COOLDOWN_DAYS * 86400000;
}

/**
 * Called after a successful export. Shows a dismissible note if the user has
 * exported a few times, has not opted out, and has not been asked recently.
 */
async function maybeAskForDonation() {
  const url = donateUrl();
  if (!url) return;

  const done = (state.settings.exportsCompleted || 0) + 1;
  state.settings = await window.api.settings.set({ exportsCompleted: done });

  if (!shouldAskForDonation(state.settings)) return;

  state.settings = await window.api.settings.set({ donatePromptedAt: new Date().toISOString() });

  showAlert(
    'Glad this is useful. It is free and stays free, but donations help me keep building it.',
    '♥ Donate',
    () => {
      window.api.shell.openExternal(url);
      hideAlert();
    }
  );

  // A second button so dismissing is as easy as accepting.
  const dismiss = document.createElement('button');
  dismiss.className = 'btn btn-small btn-ghost';
  dismiss.textContent = 'No thanks';
  dismiss.addEventListener('click', async () => {
    state.settings = await window.api.settings.set({ donateDismissed: true });
    hideAlert();
  });
  el.alertBar.append(dismiss);
}

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
  applyCaptionStyle();
  await rescan(state.settings.gameDir || state.info.defaultGameDir);
  wireEvents();
  requestAnimationFrame(tick);

  if (wantSplash) setTimeout(dismissSplash, Math.max(0, splashUntil - Date.now()));

  checkForUpdate();
}

/**
 * Looks for a newer release in the background. Nothing is downloaded; if one
 * exists you get a dismissible note and a link to the releases page.
 */
async function checkForUpdate() {
  const result = await window.api.checkUpdate().catch(() => null);
  if (!result || !result.ok) return;

  if (!result.newer) {
    el.aboutUpdate.textContent = ' (up to date)';
    return;
  }

  el.aboutUpdate.innerHTML = ` — <b>${escapeHtml(result.latest)} available</b>`;
  showAlert(
    `Version ${result.latest} is out. You have ${result.current}.`,
    'Get it',
    () => window.api.shell.openExternal(result.url)
  );
}

/**
 * The header used to carry a permanent ffmpeg version string and the game
 * path, which mean nothing to most people. Status now only appears when
 * something actually needs attention, with a button that fixes it.
 */
function showAlert(message, actionLabel, onAction) {
  clearExtraAlertButtons();
  el.alertText.textContent = message;
  el.alertBar.hidden = false;
  el.alertAction.hidden = !actionLabel;
  if (actionLabel) {
    el.alertAction.textContent = actionLabel;
    el.alertAction.onclick = onAction;
  }
}

/** Removes buttons a previous alert appended beyond the built-in one. */
function clearExtraAlertButtons() {
  for (const extra of [...el.alertBar.querySelectorAll('button')]) {
    if (extra !== el.alertAction) extra.remove();
  }
}

function hideAlert() {
  el.alertBar.hidden = true;
  el.alertAction.onclick = null;
  clearExtraAlertButtons();
}

function renderFfmpegStatus() {
  const { ffmpeg } = state.info;
  el.settingsFfmpegStatus.textContent = ffmpeg.ok
    ? `Using: ${ffmpeg.ffmpeg}`
    : 'ffmpeg was not found. Exporting will not work until it is installed or located here.';

  if (!ffmpeg.ok) {
    showAlert('Video tools are missing, so exporting will not work.', 'Fix in Settings', openSettings);
  }
}

async function rescan(dir) {
  try {
    state.model = await window.api.game.scan(dir);
    state.settings = await window.api.settings.get();
    el.setGameDir.value = state.model.gameDir;
    renderPacks();

    const withRecordings = state.model.packs.filter((p) => p.sessions.length);
    if (!state.model.packs.length) {
      showAlert('No voice packs found in that folder.', 'Choose folder', pickGameDir);
    } else if (!withRecordings.length) {
      showAlert(
        'Packs found, but you have not recorded any dubs yet. Record one in the game first.',
        'How it works',
        () => el.aboutDialog.showModal()
      );
    } else if (state.info.ffmpeg.ok) {
      hideAlert();
    }
  } catch (err) {
    showAlert(
      'Could not find The Choicer Voicer’s files. Point the app at your game folder.',
      'Choose folder',
      pickGameDir
    );
    console.warn(err.message);
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

/** Resolves once the video element has real picture, or rejects on failure. */
function videoReady(video) {
  return new Promise((resolve, reject) => {
    const done = () => {
      cleanup();
      // A file can "load" and still decode to nothing, which is exactly what a
      // torn transcode looks like.
      if (video.videoWidth > 0) resolve();
      else reject(new Error('no picture'));
    };
    const fail = () => { cleanup(); reject(new Error('could not decode')); };
    const cleanup = () => {
      video.removeEventListener('loadeddata', done);
      video.removeEventListener('error', fail);
      clearTimeout(timer);
    };
    const timer = setTimeout(fail, 15000);
    video.addEventListener('loadeddata', done, { once: true });
    video.addEventListener('error', fail, { once: true });
  });
}

/**
 * Points the player at a pack's preview video, rebuilding the cached transcode
 * once if it turns out not to play. Guards against a bad cache entry leaving
 * you with a black screen forever.
 */
async function loadPreviewVideo(pack, superseded, { rebuild = false } = {}) {
  const proxy = await window.api.media.proxy(pack.videoPath, { rebuild });
  if (superseded() || !proxy.ok) return proxy;

  el.video.src = proxy.url;
  el.video.load();

  try {
    await videoReady(el.video);
    return proxy;
  } catch {
    if (superseded()) return proxy;
    if (rebuild) return { ok: false, error: 'the preview video would not play, even after rebuilding it' };

    console.warn('Preview video failed to decode; rebuilding it.');
    showLoading(true, 'Preview was damaged, rebuilding…');
    return loadPreviewVideo(pack, superseded, { rebuild: true });
  }
}

/**
 * Loads a session's audio and video.
 *
 * Loading takes several seconds, and clicking another pack part way through
 * used to leave two loads racing: both wrote to the same player, the video and
 * the loading overlay flickered between them, and whichever finished last won.
 *
 * Every load now takes a ticket. After each await the ticket is checked, and a
 * load that has been superseded returns without touching anything. The player's
 * own decode loop is aborted at the same time so it stops fetching.
 */
async function loadSession(session) {
  const ticket = ++state.loadTicket;
  const superseded = () => ticket !== state.loadTicket;

  const pack = state.pack;

  // Published before the previous load is torn down, so its cancel handler can
  // tell whether we are moving to a different video or just another session of
  // the same one.
  state.loadingVideoPath = pack.videoPath;

  // Tear down whatever the previous selection was still doing. The player is
  // reset now rather than when its audio arrives, so nothing can read the
  // outgoing pack's lines while the new one is still loading.
  if (state.loadAbort) state.loadAbort.abort();
  const abort = new AbortController();
  state.loadAbort = abort;
  player.reset();
  setLoadingState(true);
  renderLines();
  renderMarkers();

  // Stop this pack's transcode if you click away to a different video. Picking
  // another session of the same pack must leave it running, since the incoming
  // load needs exactly that transcode.
  abort.signal.addEventListener('abort', () => {
    if (state.loadingVideoPath !== pack.videoPath) window.api.media.cancelProxy(pack.videoPath);
  }, { once: true });

  state.session = session;

  showLoading(true, 'Reading clip lengths…');

  // Durations drive caption timing and export placement, and come from
  // ffprobe rather than the decoder so they're known before audio loads.
  const paths = [];
  for (const line of pack.lines) {
    if (line.sourceAudioPath) paths.push(line.sourceAudioPath);
    if (session && session.takes[line.base]) paths.push(session.takes[line.base]);
  }
  if (session && session.freestylePath) paths.push(session.freestylePath);

  try {
    Object.assign(state.durations, await window.api.media.probe(paths));
  } catch (err) {
    console.warn('Probe failed:', err.message);
  }
  if (superseded()) return;

  // Seed line durations so the UI has them even before decoding finishes.
  for (const line of pack.lines) {
    const takePath = session && session.takes[line.base];
    line.duration = state.durations[takePath] || state.durations[line.sourceAudioPath] || 0;
  }

  // The pack video is Ogg Theora, which Chromium can no longer decode, so the
  // preview plays a cached MP4 transcode. Exports still use the original.
  showLoading(true, 'Preparing preview…');
  const proxy = await loadPreviewVideo(pack, superseded);
  if (superseded()) return;
  if (!proxy.ok) toast(`Could not prepare the preview video: ${proxy.error}`, 'error', 9000);

  showLoading(true, 'Loading audio…');
  try {
    await player.load({
      pack,
      session,
      signal: abort.signal,
      onProgress: (fraction) => {
        if (superseded()) return;
        el.loadingText.textContent = `Loading audio… ${Math.round(fraction * 100)}%`;
      },
    });
  } catch (err) {
    if (err.name === 'AbortError' || superseded()) return;
    toast(`Could not load audio: ${err.message}`, 'error', 7000);
  }
  if (superseded()) return;
  showLoading(false);

  player.setBackingVolume(Number(el.volBacking.value) / 100);
  player.setDubVolume(Number(el.volDub.value) / 100);

  renderLines();
  renderMarkers();

  // Only the load that actually finished may re-enable exporting.
  setLoadingState(false);
}

function showLoading(visible, text) {
  el.loadingOverlay.hidden = !visible;
  if (text) el.loadingText.textContent = text;
}

/**
 * Exporting mid-load used to produce a video with the backing track but no
 * dubbing, because the job was built from whatever the player still held.
 * The button is disabled until the pack it would export is fully in place.
 */
function setLoadingState(loading) {
  state.loading = loading;
  el.btnExport.disabled = loading;
  el.btnExport.title = loading
    ? 'Waiting for this pack to finish loading'
    : 'Export this dub as a video';
}

// Line list

function renderLines() {
  el.lineList.innerHTML = '';
  const items = player.items;
  el.lineCount.textContent = `(${items.length})`;

  // A freestyle take is one recording over the whole video, so the per-line
  // source, volume and timing controls have nothing to act on. Neither the
  // player nor the exporter reads them in this mode, so they are left out
  // rather than rendered dead.
  const freestyle = Boolean(state.session && state.session.isFreestyle);

  if (freestyle) {
    el.lineList.innerHTML = `
      <div class="freestyle-note">
        <strong>Freestyle take</strong>
        <p class="muted">This session is one continuous recording over the whole video, so there
        are no per-line controls. The script below is still the original, and you can click a
        timestamp to jump there.</p>
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
      ${freestyle ? '' : `
      <div class="line-controls">
        <div class="segmented" role="group">
          <button data-src="take" ${hasTake ? '' : 'disabled'}
                  class="${item.source === 'take' ? 'on' : ''}" title="Use your recording">Yours</button>
          <button data-src="original" ${hasOriginal ? '' : 'disabled'}
                  class="${item.source === 'original' ? 'on' : ''}" title="Use the original audio">Original</button>
          <button data-src="none"
                  class="${item.source === 'none' ? 'on' : ''}" title="Silence this line">Off</button>
        </div>
        <div class="line-vol" title="Line volume">
          <input type="range" min="0" max="200" value="${Math.round(item.volume * 100)}" />
          <span class="num-field">
            <input class="num line-vol-num" type="number" min="0" max="200" step="1"
                   value="${Math.round(item.volume * 100)}" />
            <b>%</b>
          </span>
        </div>
        <div class="nudge" title="Shift this line's timing">
          <button data-nudge="-0.05">−</button>
          <span class="num-field">
            <input class="num nudge-val" type="number" min="-5000" max="5000" step="10"
                   value="${Math.round(item.offset * 1000)}" />
            <b>ms</b>
          </span>
          <button data-nudge="0.05">+</button>
        </div>
      </div>`}`;

    row.querySelector('.line-time').addEventListener('click', () => {
      player.seek(item.time);
      selectLine(item.id);
    });

    if (freestyle) {
      el.lineList.append(row);
      continue;
    }

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

    // Slider and number box drive each other, so either can be used.
    const volSlider = row.querySelector('.line-vol input[type="range"]');
    const volNumber = row.querySelector('.line-vol-num');

    const applyVolume = (percent, echoTo) => {
      const value = clamp(Math.round(percent), 0, 200);
      echoTo.value = String(value);
      player.setLineVolume(item.id, value / 100);
    };

    volSlider.addEventListener('input', () => applyVolume(Number(volSlider.value), volNumber));
    volNumber.addEventListener('change', () => applyVolume(Number(volNumber.value), volSlider));

    const offsetInput = row.querySelector('.nudge-val');

    const applyOffset = (ms) => {
      const value = clamp(Math.round(ms), -5000, 5000);
      offsetInput.value = String(value);
      player.setLineOffset(item.id, value / 1000);
      renderMarkers();
    };

    offsetInput.addEventListener('change', () => applyOffset(Number(offsetInput.value)));

    for (const button of row.querySelectorAll('.nudge button')) {
      button.addEventListener('click', () => {
        applyOffset(item.offset * 1000 + Number(button.dataset.nudge) * 1000);
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
    const showSpeaker = captionStyle().showSpeaker !== false;
    const speaker = showSpeaker && active.character
      ? `<b style="color:${characterColor(active.character)}">${escapeHtml(active.character)}</b>`
      : '';
    el.caption.hidden = false;
    el.caption.innerHTML = `${speaker}${escapeHtml(active.caption)}`;
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

/**
 * Builds a self-describing filename, so a folder of exports stays readable and
 * sorts sensibly:
 *
 *   Caines_Crashout_dub_20260725_2225_1080p.mp4
 *   Caines_Crashout_line_04_caine_20260725_2225.mp4
 *   Backrooms_StayInCharacter_dub_original_vertical.mp4
 */
function defaultOutputName() {
  const parts = [sanitizeFilename(state.pack.title)];

  const line = el.optScope.value === 'line' && state.selectedLineId;
  parts.push(line ? `line_${sanitizeFilename(state.selectedLineId)}` : 'dub');

  const session = state.session;
  if (session && session.date) {
    const d = new Date(session.date);
    const pad = (n) => String(n).padStart(2, '0');
    parts.push(`${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`);
    parts.push(`${pad(d.getHours())}${pad(d.getMinutes())}`);
  } else {
    parts.push('original');
  }

  // Only worth naming when it is not the plain source render.
  if (el.optPreset.value !== 'source') parts.push(el.optPreset.value);
  if (el.optBurn.checked) parts.push('captioned');

  return `${parts.join('_')}.${el.optFormat.value}`;
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
  const style = captionStyle();
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
    // Burned-in captions match what the preview showed.
    captionStyle: {
      ...style,
      characterColors: style.perCharacterColors
        ? Object.fromEntries(packCharacters().map((n) => [n, characterColor(n)]))
        : {},
    },
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
  if (state.loading) {
    toast('Still loading this pack. Give it a moment, then export.', 'warn');
    return;
  }
  state.outputPathChosen = false;
  refreshOutputName();
  updateExportSummary();
  el.exportDialog.showModal();
}

function pathSep() {
  return state.info.platform === 'win32' ? '\\' : '/';
}

/** Rewrites the suggested output path, unless you've chosen one yourself. */
function refreshOutputName() {
  if (!state.pack) return;

  if (state.outputPathChosen) {
    // Keep their folder and filename, but the extension has to track the
    // format: ffmpeg picks the container from the name, so "dub.mp4" with
    // WebM selected would be handed VP9/Opus in an MP4 and refuse to run.
    el.optOutput.value = el.optOutput.value.replace(/\.[^.\\/]+$/, `.${el.optFormat.value}`);
    return;
  }

  const dir = (state.settings.outputDir || '').replace(/[\\/]+$/, '');
  el.optOutput.value = `${dir}${pathSep()}${defaultOutputName()}`;
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

  const tracks = buildTracks();

  // Last line of defence against exporting a video with no dubbing in it.
  // If the session has takes but none of them made it into the job, something
  // is out of step and a silent export would be worse than no export.
  const expected = state.session && !state.session.isFreestyle
    ? player.items.filter((i) => i.takeUrl && i.source !== 'none' && !i.muted).length
    : 0;
  if (expected > 0 && tracks.length === 0) {
    toast('This pack is not ready yet. Wait for it to finish loading, then export.', 'warn', 7000);
    return;
  }

  const job = {
    videoPath: state.pack.videoPath,
    backingPath: state.pack.backingPath,
    tracks,
    captions: buildCaptions(),
    outputPath: el.optOutput.value,
    options: { ...options, trim },
  };

  el.exportDialog.close();
  await window.api.settings.set({ exportOptions: options });
  state.settings = await window.api.settings.get();

  // Picking a path by hand means you chose it deliberately, and the save
  // dialog already asked about overwriting. Suggested names get stepped past
  // anything on disk or already queued instead of silently replacing it.
  if (!state.outputPathChosen) {
    const reserved = exportQueue.items
      .filter((i) => i.status === 'queued' || i.status === 'running')
      .map((i) => i.job.outputPath);
    job.outputPath = await window.api.exporter.resolvePath(job.outputPath, reserved);
  }

  enqueueExport(job);
}

/**
 * Exports run one at a time.
 *
 * Running several at once meant every job wrote to the same progress bar and
 * the first one to finish hid it, leaving the rest running invisibly. Several
 * concurrent ffmpeg encodes also just fight over the same CPU, so they finish
 * no sooner than they would in sequence.
 */
const exportQueue = {
  items: [],
  running: false,
  nextId: 1,
};

function enqueueExport(job) {
  const item = {
    id: exportQueue.nextId++,
    job,
    name: job.outputPath.split(/[\\/]/).pop(),
    status: 'queued',
    percent: 0,
  };
  exportQueue.items.push(item);

  const waiting = exportQueue.items.filter((i) => i.status === 'queued').length;
  if (exportQueue.running) {
    toast(`Queued "${item.name}". ${waiting} waiting.`, 'info');
  }

  renderQueue();
  drainQueue();
}

async function drainQueue() {
  if (exportQueue.running) return;

  const next = exportQueue.items.find((i) => i.status === 'queued');
  if (!next) {
    // Nothing left; clear out the finished jobs and hide the bar.
    exportQueue.items = [];
    state.runningExportId = null;
    showProgress(false);
    return;
  }

  exportQueue.running = true;
  next.status = 'running';
  next.percent = 0;
  renderQueue();

  let result;
  try {
    result = await window.api.exporter.run(next.job);
  } catch (err) {
    // Without this the queue would sit at running:true forever and every
    // later export would be silently swallowed.
    result = { ok: false, error: err.message || String(err) };
  } finally {
    exportQueue.running = false;
    state.runningExportId = null;
  }

  next.status = result.ok ? 'done' : (result.cancelled ? 'cancelled' : 'failed');

  if (result.ok) {
    const done = toast(`Exported "${next.name}" (${formatBytes(result.size)}). Click to show it.`, 'ok', 9000);
    done.style.cursor = 'pointer';
    done.addEventListener('click', () => window.api.shell.reveal(result.outputPath));
    maybeAskForDonation();
  } else if (result.cancelled) {
    toast(`Cancelled "${next.name}".`, 'warn');
  } else {
    toast(`Export failed for "${next.name}": ${result.error.split('\n')[0]}`, 'error', 12000);
    console.error(result.error);
  }

  renderQueue();
  drainQueue();
}

/** Cancels the running job. The rest of the queue carries on. */
function cancelCurrentExport() {
  if (state.runningExportId != null) window.api.exporter.cancel(state.runningExportId);
  else window.api.exporter.cancelAll();
}

/** Drops everything still waiting, then stops the one in progress. */
function cancelAllExports() {
  for (const item of exportQueue.items) {
    if (item.status === 'queued') item.status = 'cancelled';
  }
  renderQueue();
  cancelCurrentExport();
}

function renderQueue() {
  const running = exportQueue.items.find((i) => i.status === 'running');
  const waiting = exportQueue.items.filter((i) => i.status === 'queued').length;

  if (!running) {
    showProgress(false);
    return;
  }

  const index = exportQueue.items.filter((i) => i.status !== 'queued').length;
  const total = index + waiting;

  showProgress(true, total > 1 ? `Exporting ${index} of ${total}` : 'Exporting…');
  el.progressName.textContent = running.name;
  el.progressQueue.textContent = waiting ? `${waiting} more queued` : '';
  el.btnProgressCancelAll.hidden = waiting === 0;
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

/**
 * Ties a range input to a number input so either can drive the value.
 * The slider updates live while dragging; the box commits on blur or Enter.
 */
function bindMixControl(slider, number, max, apply) {
  const set = (value, echoTo) => {
    const clamped = clamp(Math.round(value), 0, max);
    echoTo.value = String(clamped);
    apply(clamped);
  };

  slider.addEventListener('input', () => set(Number(slider.value), number));
  number.addEventListener('change', () => set(Number(number.value), slider));
  number.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') number.blur();
  });
}

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

  const links = (state.info && state.info.links) || {};
  el.btnAboutPage.addEventListener('click', () => window.api.shell.openExternal(links.game));
  el.btnAboutDiscord.addEventListener('click', () => window.api.shell.openExternal(links.discord));
  el.btnAboutRepo.addEventListener('click', () => window.api.shell.openExternal(links.releases));
  el.btnDiscord.addEventListener('click', () => window.api.shell.openExternal(links.discord));

  // Donation links stay hidden entirely until a page is configured.
  if (links.donate) {
    el.btnAboutDonate.hidden = false;
    el.donateBlurb.hidden = false;
    el.btnAboutDonate.addEventListener('click', () => window.api.shell.openExternal(links.donate));
  }

  for (const tab of el.helpTabs) {
    tab.addEventListener('click', () => {
      for (const other of el.helpTabs) other.classList.toggle('on', other === tab);
      for (const panel of document.querySelectorAll('[data-help-panel]')) {
        panel.hidden = panel.dataset.helpPanel !== tab.dataset.help;
      }
    });
  }

  // Caption appearance
  el.btnCaptionStyle.addEventListener('click', openCaptionDialog);
  el.btnCaptionClose.addEventListener('click', () => el.captionDialog.close());

  const captionInputs = [
    [el.capFont, 'font', (v) => v],
    [el.capSize, 'fontSize', Number],
    [el.capMargin, 'marginV', Number],
    [el.capColor, 'color', (v) => v],
    [el.capOutlineColor, 'outlineColor', (v) => v],
    [el.capOutline, 'outline', Number],
  ];
  for (const [input, key, cast] of captionInputs) {
    input.addEventListener('input', async () => {
      await saveCaptionStyle({ [key]: cast(input.value) });
      renderCaptionPreview();
    });
  }

  el.capShowSpeaker.addEventListener('change', async () => {
    await saveCaptionStyle({ showSpeaker: el.capShowSpeaker.checked });
    renderCaptionPreview();
  });
  el.capPerCharacter.addEventListener('change', async () => {
    await saveCaptionStyle({ perCharacterColors: el.capPerCharacter.checked });
    renderCharacterColors();
    renderCaptionPreview();
  });

  el.btnCaptionReset.addEventListener('click', async () => {
    state.settings = await window.api.settings.set({
      captionStyle: { ...DEFAULT_CAPTION_STYLE },
      characterColors: {},
      replaceCharacterColors: true,
    });
    applyCaptionStyle();
    openCaptionDialog();
  });

  el.packSearch.addEventListener('input', (e) => {
    state.filter = e.target.value;
    renderPacks();
  });

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

  // Each mix control is a slider plus a number box that mirror each other.
  bindMixControl(el.volBacking, el.volBackingVal, 150, (v) => player.setBackingVolume(v / 100));
  bindMixControl(el.volDub, el.volDubVal, 200, (v) => player.setDubVolume(v / 100));

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
  // The suggested filename describes the settings, so it follows them around
  // until you pick a path yourself.
  for (const control of [el.optScope, el.optBurn, el.optFormat, el.optPreset]) {
    control.addEventListener('change', () => {
      updateExportSummary();
      refreshOutputName();
    });
  }

  el.btnPickOutput.addEventListener('click', async () => {
    const picked = await window.api.dialog.pickOutput({
      defaultPath: el.optOutput.value,
      format: el.optFormat.value,
    });
    if (picked) {
      el.optOutput.value = picked;
      state.outputPathChosen = true;
    }
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

  el.btnProgressCancel.addEventListener('click', cancelCurrentExport);
  el.btnProgressCancelAll.addEventListener('click', cancelAllExports);

  // First open of a pack transcodes its video; show how far along that is.
  // Ignore progress from a pack you have already clicked away from.
  window.api.media.onProxyProgress(({ videoPath, percent }) => {
    if (percent == null || videoPath !== state.loadingVideoPath) return;
    el.loadingText.textContent = `Preparing preview… ${percent.toFixed(0)}%`;
  });

  window.api.exporter.on('export:started', ({ id }) => { state.runningExportId = id; });
  window.api.exporter.on('export:progress', ({ id, percent, seconds, duration }) => {
    // Only the job the queue is currently running may drive the bar.
    if (state.runningExportId != null && id !== state.runningExportId) return;
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
