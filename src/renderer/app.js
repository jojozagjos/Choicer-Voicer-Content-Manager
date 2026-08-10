import { DubPlayer } from './player.js';
import { PackEditor } from './editor.js';
import { escapeForHtml } from './escape.js';

/**
 * Finds an element, and says so loudly when it is not there.
 *
 * Returning null quietly is how a renamed id in the markup turns into
 * "Cannot read properties of null" thrown from a line that has nothing to do
 * with the mistake — usually an addEventListener several hundred lines later,
 * which takes the whole start-up down with it and names none of the guilty
 * parties. Failing here instead names the selector.
 */
const $ = (sel) => {
  const found = document.querySelector(sel);
  if (!found) throw new Error(`The interface is missing ${sel}`);
  return found;
};

const el = {
  splash: $('#splash'),
  themeButtons: document.querySelectorAll('[data-theme-set]'),
  setTheme: $('#set-theme'),
  setSplash: $('#set-splash'),
  setPreviewCaptions: $('#set-preview-captions'),
  setEditorCaptions: $('#set-editor-captions'),
  btnAbout: $('#btn-about'),
  aboutDialog: $('#about-dialog'),
  aboutVersion: $('#about-version'),
  versionBadge: $('#version-badge'),
  versionNumber: $('#version-number'),
  aboutUpdate: $('#about-update'),
  btnAboutClose: $('#btn-about-close'),
  btnAboutPage: $('#btn-about-page'),
  btnAboutDiscord: $('#btn-about-discord'),
  btnAboutRepo: $('#btn-about-repo'),
  btnAboutDonate: $('#btn-about-donate'),
  donateBlurb: $('#donate-blurb'),
  helpTabs: document.querySelectorAll('.help-tabs [data-help]'),
  changelogBody: $('#changelog-body'),

  alertBar: $('#alert-bar'),
  alertText: $('#alert-text'),
  alertAction: $('#alert-action'),

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
  btnReport: $('#btn-report'),

  packSearch: $('#pack-search'),
  packList: $('#pack-list'),

  emptyState: $('#empty-state'),
  workspace: $('#workspace'),
  packTitle: $('#pack-title'),
  packSubtitle: $('#pack-subtitle'),
  sessionSelect: $('#session-select'),
  btnSessionDelete: $('#btn-session-delete'),
  contentSearch: $('#content-search'),
  btnExport: $('#btn-export'),

  video: $('#video'),
  portrait: $('#portrait'),
  caption: $('#caption'),
  videoWrap: $('#video-wrap'),
  loadingOverlay: $('#loading-overlay'),
  loadingText: $('#loading-text'),
  prepOverlay: $('#prep-overlay'),
  prepTitle: $('#prep-title'),
  prepNote: $('#prep-note'),
  prepPct: $('#prep-pct'),

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
  expVolBackingRead: $('#exp-vol-backing-read'),
  expVolDubRead: $('#exp-vol-dub-read'),

  lineCount: $('#line-count'),
  lineList: $('#line-list'),
  btnAllTake: $('#btn-all-take'),
  btnAllOriginal: $('#btn-all-original'),
  btnResetMix: $('#btn-reset-mix'),

  exportDialog: $('#export-dialog'),
  exportTabs: document.querySelectorAll('[data-export-tab]'),
  optFormat: $('#opt-format'),
  optPreset: $('#opt-preset'),
  optQuality: $('#opt-quality'),
  optScope: $('#opt-scope'),
  optBurn: $('#opt-burn'),
  optSrt: $('#opt-srt'),
  optNormalize: $('#opt-normalize'),
  optCharacterVolumes: $('#opt-character-volumes'),
  orphanNote: $('#orphan-note'),
  orphanText: $('#orphan-text'),
  btnOrphanOpen: $('#btn-orphan-open'),
  characterVolumeNote: $('#character-volume-note'),
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

  tabButtons: document.querySelectorAll('[data-tab]'),
  homeView: $('#home-view'),
  confirmDialog: $('#confirm-dialog'),
  confirmMark: $('#confirm-mark'),
  confirmTitle: $('#confirm-title'),
  confirmDetail: $('#confirm-detail'),
  confirmCode: $('#confirm-code'),
  backingDialog: $('#backing-dialog'),
  backingDetail: $('#backing-detail'),
  backingMode: $('#backing-mode'),
  backingStrength: $('#backing-strength'),
  backingStrengthRow: $('#backing-strength-row'),
  backingStrengthNote: $('#backing-strength-note'),
  backingTechnique: $('#backing-technique'),
  backingPreview: $('#backing-preview'),
  backingSample: $('#backing-sample'),
  backingSampleNote: $('#backing-sample-note'),
  backingGo: $('#backing-go'),
  backingCancel: $('#backing-cancel'),
  btnModsInstalled: $('#btn-mods-installed'),
  modsUpdateBadge: $('#mods-update-badge'),
  confirmButtons: $('#confirm-buttons'),
  setupDialog: $('#setup-dialog'),
  setupDefaultPath: $('#setup-default-path'),
  setupSuggestion: $('#setup-suggestion'),
  setupUseDefault: $('#setup-use-default'),
  setupDrop: $('#setup-drop'),
  setupBrowse: $('#setup-browse'),
  setupError: $('#setup-error'),
  setupHelp: $('#setup-help'),
  setupLater: $('#setup-later'),
  homeStats: $('#home-stats'),
  homeRecent: $('#home-recent'),
  homeExportNote: $('#home-export-note'),
  homeManageNote: $('#home-manage-note'),
  cardExport: $('#card-export'),
  cardCreate: $('#card-create'),
  cardManage: $('#card-manage'),

  editorView: $('#editor-view'),
  btnContentNew: $('#btn-content-new'),
  createDialog: $('#create-dialog'),
  createTitle: $('#create-title'),
  createHint: $('#create-hint'),
  createTypes: $('#create-types'),
  createForm: $('#create-form'),
  createName: $('#create-name'),
  createExtra: $('#create-extra'),
  createDrop: $('#create-drop'),
  createDropHint: $('#create-drop-hint'),
  createBrowse: $('#create-browse'),
  createFiles: $('#create-files'),
  btnCreateBack: $('#btn-create-back'),
  btnCreateCancel: $('#btn-create-cancel'),
  btnCreateGo: $('#btn-create-go'),

  tagline: $('#tagline'),
  sidebar: document.querySelector('.sidebar'),
  stage: document.querySelector('.stage'),
  contentView: $('#content-view'),
  modsView: $('#mods-view'),
  modsTypes: $('#mods-types'),
  modsTitle: $('#mods-title'),
  modsSubtitle: $('#mods-subtitle'),
  modsGrid: $('#mods-grid'),
  modsSearch: $('#mods-search'),
  btnModsRefresh: $('#btn-mods-refresh'),
  modsSort: $('#mods-sort'),
  modsSortWrap: $('#mods-sort-wrap'),
  btnModsBrowse: $('#btn-mods-browse'),
  btnModsPublishers: $('#btn-mods-publishers'),
  btnModsInbox: $('#btn-mods-inbox'),
  tabAdmin: $('#tab-admin'),
  adminView: $('#admin-view'),
  adminList: $('#admin-list'),
  adminMain: $('#admin-main'),
  btnAdminRefresh: $('#btn-admin-refresh'),
  adminTabs: document.querySelectorAll('[data-admin]'),
  adminSearch: $('#admin-search'),
  adminSort: $('#admin-sort'),
  adminSortWrap: $('#admin-sort-wrap'),
  githubStatus: $('#github-status'),
  githubNote: $('#github-note'),
  btnGithubLink: $('#btn-github-link'),
  btnGithubUnlink: $('#btn-github-unlink'),
  contentTypes: $('#content-types'),
  contentTitle: $('#content-title'),
  contentSubtitle: $('#content-subtitle'),
  contentGrid: $('#content-grid'),
  contentDetail: $('#content-detail'),
  btnContentFolder: $('#btn-content-folder'),

  toasts: $('#toasts'),
};

const state = {
  info: null,
  settings: null,
  model: null,
  // Whether the alert bar is currently showing one of the dub-recording
  // nudges from rescan(), as opposed to something like a missing-ffmpeg
  // warning. Only these are safe to dismiss on our own when the Content tab
  // opens; anything else showing there is left alone.
  dubAlertActive: false,
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
  // Set when the setup overlay is dismissed, so it stays dismissed.
  setupSkipped: false,
  // The newer release the update check found, if any.
  update: null,
  // Content manager
  tab: 'dubs',
  content: null,
  contentType: 'voice',
  contentPackId: null,
  // Packs whose files are still converting, keyed by folder.
  converting: new Map(),
  // Collects folder-watch notices, so a batch of them costs one reread.
  diskChangeTimer: null,
  // What is typed in the Content search box.
  contentSearch: '',
  // The directory, once fetched. Held for the session so revisiting the tab
  // does not re-fetch it; Refresh is what forces that.
  mods: null,
  modsType: 'all',
  modsSort: 'downloads',
  modsShow: 'browse',
  // The pack whose own page is open, if one is, and which list it was opened
  // from so that list stays lit and is where going back goes.
  listing: null,
  listingFrom: 'browse',
  // What this machine has installed from the directory, worked out once per
  // directory refresh and cleared alongside it.
  installed: null,
  // Whether GitHub says this account can moderate. Decides what is drawn, never
  // what is allowed — GitHub refuses the actions themselves.
  moderator: false,
  adminItems: [],
  adminShow: 'reports',
  adminSort: 'oldest',
  // Issues decided in this session, so a slow refetch cannot resurrect one.
  adminDecided: new Set(),
  publishers: [],
  adminOpen: null,
};

const player = new DubPlayer(el.video);
const editor = new PackEditor(el.editorView, window.api, toast, askConfirm, askBackingSettings);

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

const TOAST_MARKS = { ok: '✓', warn: '!', error: '✕', info: 'i' };

/**
 * Fades the messages out of the way when the pointer reaches them.
 *
 * They sit in the corner over the buttons at the foot of the pack details, and
 * take no pointer events, so a click goes straight through to whatever is
 * underneath. That also means they never receive a hover, and CSS :hover can
 * never fire on them, so the pointer is tested against their boxes instead.
 *
 * The listener only runs while something is on screen.
 */
let toastWatch = null;
function watchToastHover() {
  if (toastWatch) return;
  toastWatch = (event) => {
    const notes = el.toasts.children;
    if (!notes.length) { stopToastHover(); return; }
    for (const note of notes) {
      const box = note.getBoundingClientRect();
      const over = event.clientX >= box.left && event.clientX <= box.right
        && event.clientY >= box.top && event.clientY <= box.bottom;
      note.classList.toggle('faded', over);
    }
  };
  document.addEventListener('mousemove', toastWatch);
}

function stopToastHover() {
  if (!toastWatch) return;
  document.removeEventListener('mousemove', toastWatch);
  toastWatch = null;
}

function toast(message, kind = 'info', timeout = 4200) {
  const node = document.createElement('div');
  node.className = `toast toast-${kind}`;
  node.innerHTML = `<b class="toast-mark">${TOAST_MARKS[kind] || TOAST_MARKS.info}</b>
    <span class="toast-text"></span>`;
  node.querySelector('.toast-text').textContent = message;

  el.toasts.append(node);
  requestAnimationFrame(() => node.classList.add('in'));
  watchToastHover();

  setTimeout(() => {
    node.classList.remove('in');
    setTimeout(() => {
      node.remove();
      if (!el.toasts.children.length) stopToastHover();
    }, 220);
  }, timeout);
  return node;
}

/**
 * Anything that went wrong and was not caught on the way, said out loud.
 *
 * Every button in this app is wired as `() => doSomething(x)`, and none of those
 * handlers can await anything. So a promise that rejects anywhere inside one has
 * nowhere to land: the browser notes it on a console nobody has open and the
 * interface simply does nothing. Publishing died that way, and "nothing happens"
 * is the least actionable thing an app can do.
 *
 * This is the backstop, not the plan. Anything that can fail in a way somebody
 * can act on should still say so itself, in words about the pack rather than
 * about the code. This catches what nobody thought to catch.
 */
function watchForUnhandled() {
  // The same fault often fires repeatedly, and a stack of identical toasts
  // buries the first one, which is the only one worth reading.
  let last = '';
  let lastAt = 0;

  const shout = (what, error) => {
    const message = (error && error.message) || String(error || 'something went wrong');
    const now = Date.now();
    if (message === last && now - lastAt < 4000) return;
    last = message;
    lastAt = now;

    console.error(what, error);
    toast(`Something went wrong: ${message}`, 'error', 9000);
  };

  window.addEventListener('unhandledrejection', (event) => {
    shout('Unhandled rejection', event.reason);
  });
  window.addEventListener('error', (event) => {
    // Media and image elements raise this too, and those already have their own
    // handling where it matters. Only script faults have an Error on them.
    if (!event.error) return;
    shout('Uncaught error', event.error);
  });
}

function friendlySessionName(session) {
  if (!session) return 'No recordings';
  const date = session.date ? new Date(session.date) : null;
  const label = date
    ? date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
    : session.name;
  const kind = session.isFreestyle ? 'freestyle' : `${session.takeCount} takes`;
  // No mark for a session nothing has played yet. The list is newest first and
  // every entry carries the time it was made, which already answers "which one
  // did I just record" without a label that then has to be cleared, remembered
  // per session, and explained.
  return `${label} (${kind})`;
}



/**
 * Deletes the recording session currently chosen.
 *
 * Sessions are the only thing in the app that cannot be remade: the takes were
 * performed. So this asks plainly, says how many takes are going, and does not
 * offer an undo it cannot honour.
 */
async function removeCurrentSession() {
  const pack = state.pack;
  const session = state.session;
  if (!pack || !session || !session.name) return;

  const takes = session.isFreestyle ? 1 : session.takeCount;
  const answer = await askConfirm({
    title: 'Delete this recording session?',
    detail: `${friendlySessionName(session)}\n\n`
      + `${takes} recording${takes === 1 ? '' : 's'} in this session are deleted from disk. `
      + 'The pack itself is untouched, and its other sessions are left alone.\n\n'
      + 'Recordings cannot be undone here, and a performance cannot be remade.',
    buttons: ['Delete the session', 'Keep it'],
    mark: '!',
    danger: true,
  });
  if (answer !== 0) return;

  const result = await window.api.content.deleteSession({
    packName: pack.name || pack.title,
    sessionName: session.name,
  });
  if (!result.ok) {
    toast(`Could not delete it: ${result.error}`, 'error', 8000);
    return;
  }

  toast('Session deleted.', 'ok');
  await rescan(state.settings.gameDir);
  const fresh = state.model.packs.find((p) => p.id === pack.id);
  if (fresh) await selectPack(fresh);
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
 * A character's colour: whatever you picked, else one from the palette.
 *
 * Assigned by order of first appearance in the pack rather than by hashing the
 * name, because hashing let two characters in the same pack land on the same
 * colour, which is exactly the case the feature exists to prevent. Order is
 * stable for a given pack, so a character keeps its colour between sessions.
 */
function characterColor(name) {
  const style = captionStyle();
  if (!style.perCharacterColors || !name) return style.color;

  const overrides = state.settings.characterColors || {};
  if (overrides[name]) return overrides[name];

  const index = packCharacters().indexOf(name);
  if (index >= 0) return CHARACTER_PALETTE[index % CHARACTER_PALETTE.length];

  // Not in the loaded pack (the settings preview, say), so fall back to a
  // stable hash rather than always showing the first palette entry.
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return CHARACTER_PALETTE[hash % CHARACTER_PALETTE.length];
}

// The least time between two rereads caused by the folder watch. A pack being
// copied in, or the game writing a session, arrives as a long stream of changes,
// and rereading on each one turns a trickle of writes into a trickle of rescans.
const DISK_REFRESH_GAP = 4000;

/**
 * Rereads the library after something changed on disk, at a sensible pace.
 *
 * Waits for the changes to stop, then holds off if one has only just been done.
 * Whatever arrives while a reread is running is folded into the next one rather
 * than queueing up behind it.
 */
function scheduleDiskRefresh() {
  clearTimeout(state.diskChangeTimer);

  const since = Date.now() - (state.lastDiskRefresh || 0);
  const wait = state.diskRefreshRunning
    ? DISK_REFRESH_GAP
    : Math.max(1200, DISK_REFRESH_GAP - since);

  state.diskChangeTimer = setTimeout(async () => {
    if (state.diskRefreshRunning) { scheduleDiskRefresh(); return; }

    state.diskRefreshRunning = true;
    try {
      // Only the open pack is reloaded when there is one, since rebuilding the
      // whole library behind the editor achieves nothing visible.
      if (!el.editorView.hidden && editor.pack) {
        await editor.onChanged(editor.pack.id, { keepEditor: true });
      } else {
        await refreshContent();
        await rescan(state.settings.gameDir);
      }
    } catch { /* the next change will try again */ } finally {
      state.diskRefreshRunning = false;
      state.lastDiskRefresh = Date.now();
    }
  }, wait);
}

/**
 * Mentions recordings whose pack is no longer installed.
 *
 * The game keeps takes outside the pack folders, so deleting a pack leaves them
 * with nothing pointing at them anywhere in the app. Someone who deletes a pack
 * and later wonders where their takes went has no way to find out otherwise.
 */
async function renderOrphanSessions() {
  if (!el.orphanNote) return;
  let orphans = [];
  try {
    const result = await window.api.content.orphanSessions();
    if (result && result.ok) orphans = result.orphans;
  } catch { /* nothing to say */ }

  if (!orphans.length) { el.orphanNote.hidden = true; return; }

  const takes = orphans.reduce((sum, o) => sum + o.takes, 0);
  const names = orphans.map((o) => o.name).slice(0, 3).join(', ');
  el.orphanText.textContent =
    `${takes} recording${takes === 1 ? '' : 's'} here belong to `
    + `${orphans.length === 1 ? 'a pack that is' : `${orphans.length} packs that are`} `
    + `no longer installed (${names}${orphans.length > 3 ? ', and more' : ''}). `
    + 'They still work in the Export tab if the pack is put back.';
  el.orphanNote.hidden = false;
}

/**
 * How loud one character is, as a multiplier on every line they speak.
 *
 * Sits on top of each line's own volume rather than replacing it, so a single
 * quiet performer can be lifted without losing the balance already set between
 * their individual lines.
 */
function characterVolume(name) {
  const set = state.settings.characterVolumes || {};
  const value = name ? set[name] : undefined;
  return Number.isFinite(value) ? value : 1;
}

/** Whether any character has been moved off the default. */
function characterVolumesUsed() {
  const set = state.settings.characterVolumes || {};
  return Object.entries(set).filter(([, v]) => Number.isFinite(v) && v !== 1);
}

/** Pushes the current per character volumes into the preview player. */
function applyCharacterVolumes() {
  player.setCharacterVolumes(
    state.settings.characterVolumes || {},
    state.settings.useCharacterVolumes !== false
  );
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
    // Volume sits beside the colour because both are per character and both
    // carry through to the export. One quiet performer is otherwise fixed by
    // nudging every one of their lines by hand.
    row.innerHTML = `
      <input type="color" class="color" value="${characterColor(name)}" ${enabled ? '' : 'disabled'} />
      <span class="character-name">${escapeHtml(name)}</span>
      <span class="character-vol" title="How loud this character is, across every line they have">
        <input type="range" min="0" max="200" step="5" value="${Math.round(characterVolume(name) * 100)}" />
        <b>${Math.round(characterVolume(name) * 100)}%</b>
      </span>
      ${overrides[name] ? '<button type="button" class="link-btn">reset</button>' : ''}`;

    row.querySelector('input[type="color"]').addEventListener('change', async (event) => {
      state.settings = await window.api.settings.set({
        characterColors: { ...(state.settings.characterColors || {}), [name]: event.target.value },
      });
      renderCharacterColors();
      renderCaptionPreview();
      renderLines();
    });

    const vol = row.querySelector('.character-vol input');
    const volRead = row.querySelector('.character-vol b');
    vol.addEventListener('input', () => { volRead.textContent = `${vol.value}%`; });
    vol.addEventListener('change', async () => {
      state.settings = await window.api.settings.set({
        characterVolumes: {
          ...(state.settings.characterVolumes || {}),
          [name]: Number(vol.value) / 100,
        },
      });
      // The preview follows immediately, so the change can be heard rather than
      // taken on trust until an export comes out.
      applyCharacterVolumes();
      renderLines();
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

function syncCaptionControls() {
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
}

// Content manager

const TAGLINES = {
  home: '',
  export: 'Preview a dub you recorded, then export it as a video.',
  content: 'Everything installed in your game folder, and anything wrong with it.',
  mods: 'Packs other people have shared, ready to install.',
};

/**
 * The picture for each kind of pack.
 *
 * Drawn images rather than emoji. Emoji are rendered by whatever font the
 * system happens to supply, so they arrive at different sizes and weights from
 * each other, in colours nothing else in the app uses, and they change between
 * machines. A set of matching images is the same everywhere and can be sized
 * and tinted like anything else on the page.
 */
const TYPE_ICONS = {
  voice: 'video', player: 'players', host: 'host', judges: 'judge',
  studio: 'studios', menu: 'menu', chatter: 'chatter',
};

/** One of those as an `<img>`, falling back to the neutral mark. */
function typeIcon(type, className = '') {
  const name = TYPE_ICONS[type] || 'star';
  return `<img class="type-icon${className ? ` ${className}` : ''}" `
    + `src="${ASSETS}/glyphs/${name}.png" alt="" />`;
}

/** Where the pictures the app ships live, relative to the page. */
const ASSETS = '../../assets';

/**
 * The picture on an action button.
 *
 * Separate from `typeIcon` because these say what a button does rather than
 * what a pack is, and because there is no falling back: a name with no drawing
 * behind it should show nothing rather than a pack glyph that means something
 * else entirely.
 */
const ACTION_GLYPHS = new Set(['edit', 'delete', 'folder', 'export']);

function actionIcon(name) {
  if (!ACTION_GLYPHS.has(name)) return '';
  return `<img class="btn-icon-glyph" src="${ASSETS}/glyphs/${name}.png" alt="" />`;
}

// Types whose pack is a person on screen. When one of these has no picture,
// the game stands a cardboard cutout in its place, so the app shows the same
// thing rather than a generic box.
const CHARACTER_TYPES = new Set(['player', 'host', 'judges']);

async function switchTab(tab) {
  state.tab = tab;
  for (const button of el.tabButtons) button.classList.toggle('on', button.dataset.tab === tab);
  el.tagline.textContent = TAGLINES[tab] || '';

  // Each view owns the whole width except the export one, which keeps the
  // pack sidebar beside it.
  // Leaving a tab always closes the editor, so it cannot linger over another view.
  if (!el.editorView.hidden) editor.close();

  // Hiding the export view does not stop the video, so without this the dub
  // keeps playing out of sight while you are on another tab.
  if (tab !== 'export') player.pause();

  el.homeView.hidden = tab !== 'home';
  el.sidebar.hidden = tab !== 'export';
  el.stage.hidden = tab !== 'export';
  el.contentView.hidden = tab !== 'content';
  el.modsView.hidden = tab !== 'mods';
  el.adminView.hidden = tab !== 'admin';

  // Leaving admin ends any review, so a pack cannot sit unpacked on disk while
  // you are somewhere else in the app.
  if (tab !== 'admin' && state.adminOpen !== null) {
    state.adminOpen = null;
  }

  // The dub-recording nudge can already be up from an earlier rescan on
  // Export, with nothing new happening here to clear it. Content is not the
  // place for it, so arriving here dismisses it directly rather than waiting
  // for the next rescan to notice.
  if (tab === 'content' && state.dubAlertActive) {
    hideAlert();
    state.dubAlertActive = false;
  }

  if (tab === 'content') await refreshContent();
  if (tab === 'home') await renderHome();
  if (tab === 'mods') {
    // The library is what says whether a listed pack is already installed, so
    // it has to be known before the grid is drawn.
    if (!state.content) await refreshContent();
    // Through showMods rather than straight to the grid. Going straight to it
    // drew packs while the view was still set up for whichever list was open
    // last, so coming back from Your submissions left the packs in that view's
    // narrow centred column.
    // A pack's page goes back to whichever list it was opened from; a
    // publisher's page belongs to Browse.
    const back = state.modsShow === 'listing' ? state.listingFrom
      : state.modsShow === 'publisher' ? 'browse'
        : (state.modsShow || 'browse');
    await showMods(back);
  }
  if (tab === 'admin') await showAdmin(state.adminShow || 'reports');
}

// Home

async function renderHome() {
  const result = await window.api.content.scan(state.settings.gameDir).catch(() => null);
  state.content = result && result.ok ? result : null;
  renderSetup();
  renderHomeStats();
  renderHomeRecent();
}

/**
 * Finding the game folder is the one thing nothing else works without, so it
 * gets an overlay rather than a step in a checklist that can be scrolled past.
 * Everything that used to be listed alongside it (make a pack, record a dub)
 * is either a card on this page already or something that happens in the game,
 * so listing it here only made the first screen look like homework.
 */
function renderSetup() {
  const foundGame = Boolean(state.model && state.model.packs);

  if (foundGame) {
    if (el.setupDialog.open) el.setupDialog.close();
    return;
  }
  // Skipping is allowed, but it should not then reappear on every repaint.
  if (state.setupSkipped || el.setupDialog.open || !el.splash.hidden) return;
  openSetupDialog();
}

async function openSetupDialog() {
  el.setupError.hidden = true;
  const guess = (state.info && state.info.defaultGameDir) || '';
  el.setupDefaultPath.textContent = guess || '%APPDATA%\\YeahMaybe\\ChoicerVoicer';

  // If the usual place happens to hold a game folder, offer it as one click.
  // Offering is not the same as taking it: nothing is read until it is chosen.
  let looksRight = false;
  if (guess) {
    const check = await window.api.game.check(guess).catch(() => null);
    looksRight = Boolean(check && check.ok);
  }
  el.setupSuggestion.hidden = !looksRight;

  if (!el.setupDialog.open) el.setupDialog.showModal();
}

/** Takes a folder from the picker or a drop, and checks it before settling. */
async function useGameDir(dir) {
  state.settings = await window.api.settings.set({ gameDir: dir });
  state.pack = null;
  state.session = null;
  el.setGameDir.value = dir;
  await rescan(dir);

  if (state.model && state.model.packs) {
    el.setupDialog.close();
    toast('Game folder set. Everything else fills in from here.', 'ok', 4000);

    // The first time this works, show what the app is for. Someone who has
    // just pointed it at a folder has no idea what to do next, and the help
    // is where that is answered.
    if (state.settings.seenHelp !== true) {
      state.settings = await window.api.settings.set({ seenHelp: true });
      setTimeout(() => { if (!el.aboutDialog.open) openHelpTab('start'); }, 700);
    }
    return true;
  }

  el.setupError.hidden = false;
  el.setupError.textContent =
    `That folder has no packs_voice inside it. Pick the folder that contains packs_voice, `
    + 'not packs_voice itself.';
  return false;
}

function renderHomeStats() {
  el.homeStats.innerHTML = '';
  if (!state.content) {
    el.homeStats.innerHTML = '<p class="muted small">No game folder yet.</p>';
    return;
  }

  for (const type of state.content.types) {
    const errors = type.packs.reduce((n, p) => n + p.counts.error, 0);
    const stat = document.createElement('button');
    stat.className = 'stat';
    stat.innerHTML = `
      <b>${type.packs.length}</b>
      <span>${escapeHtml(type.label)}</span>
      ${errors ? `<span class="badge badge-error">${errors} to fix</span>` : ''}`;
    stat.addEventListener('click', () => {
      state.contentType = type.id;
      switchTab('content');
    });
    el.homeStats.append(stat);
  }

  el.homeManageNote.textContent = state.content.totals.errors
    ? `${state.content.totals.errors} thing${state.content.totals.errors > 1 ? 's' : ''} need attention.`
    : 'See everything installed and what needs fixing.';
}

/** The newest recording sessions, so the common job is one click from here. */
function renderHomeRecent() {
  el.homeRecent.innerHTML = '';
  if (!state.model) return;

  const sessions = [];
  for (const pack of state.model.packs) {
    for (const session of pack.sessions) sessions.push({ pack, session });
  }
  sessions.sort((a, b) => String(b.session.date || '').localeCompare(String(a.session.date || '')));

  const recent = sessions.slice(0, 5);
  el.homeExportNote.textContent = sessions.length
    ? `${sessions.length} recording${sessions.length > 1 ? 's' : ''} ready to export.`
    : 'Record a dub in the game first.';

  if (!recent.length) {
    el.homeRecent.innerHTML = '<p class="muted small">Nothing recorded yet.</p>';
    return;
  }

  for (const { pack, session } of recent) {
    const row = document.createElement('button');
    row.className = 'recent-row';
    // The pack's own picture, so a list of five recordings can be told apart at
    // a glance rather than by reading five names that often start the same way.
    const art = pack.iconUrl
      ? `<img class="recent-art" src="${escapeHtml(pack.iconUrl)}" alt="" loading="lazy" />`
      : `<span class="recent-art recent-art-blank">${typeIcon(pack.type)}</span>`;
    row.innerHTML = `
      ${art}
      <span class="recent-lines">
        <strong>${escapeHtml(pack.title)}</strong>
        <span class="muted">${escapeHtml(friendlySessionName(session))}</span>
      </span>`;
    row.addEventListener('click', async () => {
      await switchTab('export');
      const target = state.model.packs.find((p) => p.id === pack.id);
      if (target) {
        await selectPack(target);
        const index = target.sessions.findIndex((s) => s.id === session.id);
        if (index > 0) {
          el.sessionSelect.selectedIndex = index;
          el.sessionSelect.dispatchEvent(new Event('change'));
        }
      }
    });
    el.homeRecent.append(row);
  }
}

async function refreshContent() {
  const result = await window.api.content.scan(state.settings.gameDir);
  if (!result.ok) {
    el.contentGrid.innerHTML = `<p class="muted pad">${escapeHtml(result.error)}</p>`;
    return;
  }
  state.content = result;
  renderContentTypes();
  renderContentGrid();
  // Deleting a pack is what usually creates one of these, so this is checked
  // whenever the library is reread rather than only at startup.
  renderOrphanSessions();

  // The detail panel holds a pack object, and its Edit button closes over it.
  // Leaving it alone after a rescan meant editing a pack, closing the editor
  // and opening it again handed back the pack as it was before the edits, so
  // the work looked lost until something forced a full rescan.
  if (state.contentPackId) {
    const fresh = result.types.flatMap((t) => t.packs).find((p) => p.id === state.contentPackId);
    if (fresh) renderContentDetail(fresh);
    else el.contentDetail.hidden = true;
  }
}

// Admin
//
// The tab is hidden from people who cannot use it, and that is a courtesy
// rather than a defence: anyone can reveal it, and revealing it achieves
// nothing. Approving and rejecting are GitHub API calls made with the person's
// own token, so GitHub refuses them for anyone without write access to the
// directory. The check here decides what to draw, never what is permitted.

/**
 * Asks whether this account can moderate, and shows the tab if so.
 *
 * Failure is quiet. Somebody who is not a moderator is the overwhelmingly
 * common case and is not an error worth reporting to them.
 */
async function refreshAdminAccess() {
  const said = await window.api.review.status().catch(() => null);
  const allowed = Boolean(said && said.ok && said.moderator);
  el.tabAdmin.hidden = !allowed;
  state.moderator = allowed;
  return allowed;
}

/**
 * Narrows an admin list by what is typed in the search box.
 *
 * One function for both lists, taking whatever text each row should be matched
 * on. The alternative is two nearly identical filters that stop agreeing about
 * things like case the first time one of them is touched.
 */
function matchingAdmin(rows, textOf) {
  const query = (el.adminSearch.value || '').trim().toLowerCase();
  if (!query) return rows;
  return rows.filter((row) => textOf(row).toLowerCase().includes(query));
}

/**
 * Switches between the admin views.
 *
 * Uploads and reports are separated because they are different jobs with
 * different urgency — a pack waiting to be looked at can wait, and somebody
 * reporting what is already listed usually cannot. One combined queue buried
 * the second kind inside the first.
 */
async function showAdmin(which = 'reports', { force = false } = {}) {
  // Ordering is a question about the reports queue, so it goes away on the
  // views that are lists of other things.
  if (el.adminSortWrap) el.adminSortWrap.hidden = which !== 'reports';
  state.adminShow = which;
  state.adminOpen = null;
  for (const button of el.adminTabs) {
    button.classList.toggle('on', button.dataset.admin === which);
  }
  el.adminMain.innerHTML = '';
  el.adminSearch.placeholder = which === 'publishers' ? 'Search people…' : 'Search…';

  // Both of these read the directory, which is otherwise held for the session.
  if (force && (which === 'publishers' || which === 'listed')) directoryChanged();

  if (which === 'publishers') await refreshAdminPublishers();
  else if (which === 'listed') await refreshAdminListed();
  else await refreshAdminQueue();
}

/**
 * Everything currently listed, so a pack can be taken down without first
 * working out who published it.
 */
async function refreshAdminListed() {
  el.adminList.innerHTML = '<p class="muted small">Reading the directory…</p>';
  const data = await loadDirectory();

  if (!data || !data.ok || !data.configured) {
    el.adminList.innerHTML = '<p class="muted small">No directory to read yet.</p>';
    return;
  }

  const packs = matchingAdmin(data.packs, (p) => `${p.title} ${p.author} ${p.id}`);
  if (!packs.length) {
    el.adminList.innerHTML = '<p class="muted small">Nothing listed.</p>';
    return;
  }

  el.adminList.innerHTML = '';
  for (const pack of packs) {
    const button = document.createElement('button');
    button.className = 'admin-item';
    button.classList.toggle('on', state.adminOpen === pack.id);
    button.innerHTML = `
      <span class="admin-kind">${escapeHtml(pack.type)}</span>
      <span class="admin-item-title">${escapeHtml(pack.title)}</span>
      <span class="muted small">by ${escapeHtml(pack.author)}${pack.listed === false ? ' · hidden' : ''}</span>`;
    button.addEventListener('click', () => showListedPack(pack));
    el.adminList.append(button);
  }
}

/** One listed pack, with the action that applies to it. */
function showListedPack(pack) {
  state.adminOpen = pack.id;
  refreshAdminListed();

  const hidden = pack.listed === false;
  el.adminMain.innerHTML = `
    <header class="admin-head">
      <div>
        <h2>${escapeHtml(pack.title)}</h2>
        <p class="muted small">${escapeHtml(pack.type)} pack by ${escapeHtml(pack.author)} ·
          ${formatBytes(pack.bytes)} · ${formatDownloads(pack.downloads)}</p>
      </div>
      <button class="btn btn-small" id="listed-open">Open the download</button>
    </header>
    ${hidden ? '<p class="admin-warn">This pack is not listed at the moment.</p>' : ''}
    <p class="admin-summary">${escapeHtml(pack.summary || '')}</p>
    ${contentNoteHtml(pack.content)}
    <div class="admin-decide">
      <div class="admin-decide-what">
        <b>${escapeHtml(pack.id)}</b>
        <span class="muted small">${escapeHtml(pack.licence || 'unstated')} licence</span>
      </div>
      <div class="admin-decide-buttons">
        <button class="btn btn-small${hidden ? '' : ' btn-danger'}" id="listed-toggle">
          ${hidden ? 'List again' : 'Unlist'}
        </button>
      </div>
    </div>

    <!-- The same preview browsing gets. Deciding whether a pack should stay
         listed used to mean downloading it by hand and opening it somewhere
         else, which is a lot of steps between a report and an answer. -->
    <h3 class="publisher-heading">What is in it</h3>
    ${previewOfferHtml(pack, 'listed-preview')}`;

  el.adminMain.querySelector('#listed-open')
    .addEventListener('click', () => window.api.shell.openExternal(pack.downloadUrl));

  const preview = el.adminMain.querySelector('#listed-preview');
  preview.querySelector('[data-hear]')
    .addEventListener('click', () => hearListing(pack, preview));
  el.adminMain.querySelector('#listed-toggle')
    .addEventListener('click', () => setPackListed(pack.id, hidden));
}

/** The content warnings an author declared, if any. */
function contentNoteHtml(content) {
  if (!content || !content.length) return '';
  const labels = { language: 'Strong language', sexual: 'Sexual content', nudity: 'Nudity',
    violence: 'Graphic violence', drugs: 'Drug or alcohol reference', flashing: 'Flashing images' };
  return `<p class="admin-finding is-note"><b>The author marked this as containing</b>
    <span>${content.map((c) => escapeHtml(labels[c] || c)).join(', ')}</span></p>`;
}

/**
 * Everyone who has published, worked out from the directory itself.
 *
 * Derived rather than stored. There is no accounts table anywhere in this
 * design — a publisher is simply someone with packs listed — so counting them
 * from the index means the list cannot drift out of step with what is really
 * there.
 */
function publishersFrom(packs) {
  const by = new Map();
  for (const pack of packs) {
    const key = (pack.author || '').toLowerCase();
    if (!by.has(key)) {
      by.set(key, {
        handle: pack.author, packs: [], downloads: 0, bytes: 0, listed: 0, hidden: 0,
        first: pack.published, latest: pack.updated || pack.published,
      });
    }
    const who = by.get(key);
    who.packs.push(pack);
    who.downloads += pack.downloads || 0;
    who.bytes += pack.bytes || 0;
    if (pack.listed === false) who.hidden++; else who.listed++;
    if (pack.published < who.first) who.first = pack.published;
    const touched = pack.updated || pack.published;
    if (touched > who.latest) who.latest = touched;
  }
  // Ranked and counted by what is actually listed. A pack that is hidden, or
  // still waiting to be looked at, is not something somebody has published —
  // counting it would credit work nobody can install.
  return [...by.values()].sort((a, b) => b.listed - a.listed
    || a.handle.localeCompare(b.handle));
}

/** The publishers list, and one publisher in full. */
async function refreshAdminPublishers() {
  el.adminList.innerHTML = '<p class="muted small">Reading the directory…</p>';

  // The Packs tab may never have been opened, so the index is fetched rather
  // than assumed.
  const data = await loadDirectory();

  if (!data || !data.ok || !data.configured) {
    el.adminList.innerHTML = '<p class="muted small">No directory to read yet.</p>';
    el.adminMain.innerHTML = '<div class="mods-empty"><h3>Nothing published yet</h3>'
      + '<p class="muted">Publishers appear here once packs are listed.</p></div>';
    return;
  }

  const people = publishersFrom(data.packs);
  state.publishers = people;

  if (!people.length) {
    el.adminList.innerHTML = '<p class="muted small">Nobody has published yet.</p>';
    return;
  }

  const shown = matchingAdmin(people, (w) => `${w.handle} ${w.packs.map((p) => p.title).join(' ')}`);
  if (!shown.length) {
    el.adminList.innerHTML = '<p class="muted small">Nobody matches that.</p>';
    return;
  }

  el.adminList.innerHTML = '';
  for (const who of shown) {
    const button = document.createElement('button');
    button.className = 'admin-item';
    button.classList.toggle('on', state.adminOpen === `@${who.handle}`);
    button.innerHTML = `
      <span class="admin-item-title">@${escapeHtml(who.handle)}</span>
      <span class="muted small">${who.listed} pack${who.listed === 1 ? '' : 's'}
        · ${formatDownloads(who.downloads)}${who.hidden ? ` · ${who.hidden} hidden` : ''}</span>`;
    button.addEventListener('click', () => showAdminPublisher(who));
    el.adminList.append(button);
  }
}

/** Everything known about one publisher, for a moderator. */
function showAdminPublisher(who) {
  state.adminOpen = `@${who.handle}`;
  refreshAdminPublishers();

  const when = (iso) => {
    try { return new Date(iso).toLocaleDateString(); } catch { return 'unknown'; }
  };

  el.adminMain.innerHTML = `
    <header class="admin-head">
      <div>
        <h2>@${escapeHtml(who.handle)}</h2>
        <p class="muted small">
          ${who.listed} listed${who.hidden ? `, ${who.hidden} hidden` : ''} ·
          ${formatDownloads(who.downloads)} · ${formatBytes(who.bytes)} ·
          first published ${when(who.first)} · last ${when(who.latest)}
        </p>
      </div>
      <div class="admin-head-actions">
        <button class="btn btn-small" id="admin-open-profile">Open on GitHub</button>
        <button class="btn btn-small btn-danger" id="admin-ban-author">Ban</button>
        <button class="btn btn-small" id="admin-unban-author">Lift a ban</button>
      </div>
    </header>

    ${who.hidden ? `<p class="admin-warn">${who.hidden} of their packs
      ${who.hidden === 1 ? 'is' : 'are'} hidden.</p>` : ''}

    <h4 class="admin-h">Their packs</h4>
    <div class="admin-packs">
      ${who.packs.map((p) => `<div class="admin-pack${p.listed === false ? ' is-hidden' : ''}">
        <div class="admin-pack-what">
          <span>${escapeHtml(p.title)}</span>
          <span class="muted small">${escapeHtml(p.type)} · ${formatBytes(p.bytes)}
            · ${formatDownloads(p.downloads)}${p.listed === false ? ' · hidden' : ''}</span>
        </div>
        <button class="btn btn-small${p.listed === false ? '' : ' btn-danger'}"
                data-pack="${escapeHtml(p.id)}" data-listed="${p.listed === false ? '1' : '0'}">
          ${p.listed === false ? 'List again' : 'Unlist'}
        </button>
      </div>`).join('')}
    </div>`;

  for (const button of el.adminMain.querySelectorAll('[data-pack]')) {
    button.addEventListener('click', () => setPackListed(
      button.dataset.pack, button.dataset.listed === '1',
    ));
  }

  el.adminMain.querySelector('#admin-open-profile').addEventListener('click',
    () => window.api.shell.openExternal(`https://github.com/${who.handle}`));

  el.adminMain.querySelector('#admin-ban-author')
    .addEventListener('click', () => banFromAdmin(who.handle));
  el.adminMain.querySelector('#admin-unban-author')
    .addEventListener('click', () => unbanFromAdmin(who.handle));
}

/**
 * Blocks an account from the publisher page, with no report in front of it.
 *
 * Reports are the usual way in, and not the only one. Something can be noticed
 * without anybody having filed anything, and having to invent a report first in
 * order to act on it is the sort of friction that ends with people editing the
 * moderation file by hand.
 */
async function banFromAdmin(handle) {
  const answers = await askForm({
    title: `Ban @${handle}?`,
    detail: 'They cannot publish anything while the ban lasts, and everything of theirs that '
      + 'is listed comes off the list.\n\n'
      + 'Their packs stay off the list after the ban lifts, so anything to be put back has to '
      + 'be restored one at a time. That is deliberate: a ban ending is not the same as '
      + 'agreeing the packs were fine.',
    mark: '⨂',
    buttons: ['Ban them', 'Cancel'],
    fields: [
      {
        key: 'reason',
        label: 'Why (this is on a public issue)',
        value: '',
        placeholder: 'What they did',
        multiline: true,
        max: 2000,
        required: true,
      },
      {
        key: 'howLong',
        label: 'For how long',
        value: '',
        options: [
          ['', 'Permanently'],
          ['7d', 'A week'],
          ['30d', 'A month'],
          ['90d', 'Three months'],
          ['1y', 'A year'],
        ],
      },
    ],
  });
  if (answers === null) return;

  const done = await window.api.review.ban(handle, answers.reason, answers.howLong)
    .catch((err) => ({ ok: false, error: err.message }));

  if (!done.ok) {
    toast(`Could not do that: ${done.error}`, 'error', 9000);
    return;
  }
  toast(`@${handle} is blocked${answers.howLong ? ` for ${answers.howLong}` : ' permanently'}.`,
    'ok');
  directoryChanged();
  await refreshAdminPublishers();
}

/** Lifts a ban, which is a separate act from settling whatever caused it. */
async function unbanFromAdmin(handle) {
  const reason = await askText({
    title: `Lift the ban on @${handle}?`,
    detail: 'They can publish again from now on. Packs of theirs that were taken down stay '
      + 'off the list until each one is restored.\n\n'
      + 'What you write is said on a public issue, so it is worth saying why.',
    placeholder: 'Why the ban is being lifted',
    buttons: ['Lift it', 'Cancel'],
    mark: '✓',
    required: true,
  });
  if (reason === null) return;

  const done = await window.api.review.unban(handle, reason);
  if (!done.ok) {
    toast(`Could not do that: ${done.error}`, 'error', 9000);
    return;
  }
  toast(`@${handle} can publish again.`, 'ok');
  directoryChanged();
  await refreshAdminPublishers();
}

/**
 * Hides a listed pack, or puts it back.
 *
 * Asks first when hiding, because it takes somebody's work off the directory —
 * and does not when restoring, because putting it back is not the dangerous
 * direction.
 */
async function setPackListed(packId, listed) {
  if (!listed) {
    const sure = await askConfirm({
      title: 'Unlist this pack?',
      detail: 'It stops appearing in the Packs tab. The record is kept and the file stays '
        + 'on its author\'s account, so this can be undone at any time.\n\n'
        + 'The author is not told automatically.',
      buttons: ['Unlist it', 'Cancel'],
      mark: '✕',
      danger: true,
    });
    if (sure !== 0) return;
  }

  const done = await window.api.review.setListed(packId, listed);
  if (!done.ok) {
    toast(`Could not do that: ${done.error}`, 'error', 9000);
    return;
  }

  toast(done.unchanged
    ? (listed ? 'That pack was already listed.' : 'That pack was already unlisted.')
    : (listed ? 'Listed again.' : 'Unlisted.'), 'ok');
  directoryChanged();
  await refreshAdminPublishers();
}

/**
 * Says the directory has changed underneath what is held here.
 *
 * Dropping the cached copy is not enough on its own. The index is served
 * through a CDN that holds it for minutes, so the refetch was being answered
 * from before the change and the pack that had just been listed still was not
 * there. This marks it as needing to be asked for past the cache.
 */
function directoryChanged() {
  state.mods = null;
  state.modsStale = true;
  // What is installed is judged against the directory, so it goes stale with
  // it rather than answering from a comparison against a copy that has gone.
  state.installed = null;
}

/**
 * The directory, from cache or from GitHub, past the CDN when it has to be.
 *
 * Every reader goes through here. They did not, and the ones that did not were
 * why unlisting looked broken after it had already worked: the flag was written
 * to index.json correctly, and then the admin list and the browse grid each
 * fetched the index their own way without asking for a fresh copy, so the CDN
 * handed back the version from before the change for the next five minutes. The
 * pack really was hidden and nothing on screen agreed.
 */
async function loadDirectory({ force = false } = {}) {
  if (state.mods && !force && !state.modsStale) return state.mods;

  const result = await window.api.mods.index({ fresh: force || state.modsStale })
    .catch((err) => ({ ok: false, error: err.message }));

  state.mods = result;
  state.modsStale = false;
  return result;
}

/** Reports waiting to be looked at. */
async function refreshAdminQueue() {
  el.adminList.innerHTML = '<p class="muted small">Looking…</p>';

  const said = await window.api.review.queue().catch((e) => ({ ok: false, error: e.message }));
  if (!said.ok) {
    el.adminList.innerHTML = `<p class="muted small">${escapeHtml(said.error)}</p>`;
    return;
  }

  // Anything decided in this session stays gone even if GitHub still reports it
  // as open, which it does for a few seconds after closing.
  state.adminItems = said.items.filter((i) => !state.adminDecided.has(i.number));

  if (!state.adminItems.length) {
    el.adminList.innerHTML = '<p class="muted small">No reports.</p>';
    el.adminMain.innerHTML = `<div class="admin-blank">
      <h3>Nothing to deal with</h3>
      <p class="muted">Packs are listed automatically once they pass their checks, so
         nothing waits here to be approved. Reports people send about a listed pack
         show up in this list.</p>
    </div>`;
    return;
  }

  drawAdminQueue(state.adminItems);
}

/**
 * The orders reports can be worked through in.
 *
 * Oldest first is the default, which is the opposite of everywhere else in this
 * app and deliberate. A queue read newest first leaves its oldest entries
 * permanently at the bottom, and those are the ones somebody has been waiting
 * longest on.
 */
const REPORT_SORTS = [
  { id: 'oldest', label: 'Oldest first' },
  { id: 'newest', label: 'Newest first' },
  { id: 'discussed', label: 'Most discussed' },
  { id: 'pack', label: 'By pack' },
];

function sortReports(items, how) {
  const at = (value) => Date.parse(value) || 0;
  const by = {
    oldest: (a, b) => at(a.openedAt) - at(b.openedAt),
    newest: (a, b) => at(b.openedAt) - at(a.openedAt),
    discussed: (a, b) => (b.comments || 0) - (a.comments || 0) || at(a.openedAt) - at(b.openedAt),
    pack: (a, b) => String(a.title).localeCompare(String(b.title)),
  };
  return [...items].sort(by[how] || by.oldest);
}

/** Draws the queue rail from a list of items, narrowed by the search box. */
function drawAdminQueue(items) {
  const shown = sortReports(
    matchingAdmin(items, (i) => `${i.title} ${i.author || ''} #${i.number}`),
    state.adminSort,
  );
  el.adminList.innerHTML = '';
  if (!shown.length) {
    el.adminList.innerHTML = '<p class="muted small">Nothing matches that.</p>';
    return;
  }
  for (const item of shown) {
    const button = document.createElement('button');
    button.className = 'admin-item';
    button.classList.toggle('on', state.adminOpen === item.number);
    // Every one of these fields came from a stranger. None of it is trusted as
    // markup.
    button.innerHTML = `
      <span class="admin-kind is-report">Report</span>
      <span class="admin-item-title">${escapeHtml(item.title)}</span>
      <span class="muted small">#${item.number} from ${escapeHtml(item.author || 'someone')}
        · ${escapeHtml(formatWhen(item.openedAt))}</span>`;
    button.addEventListener('click', () => openForReview(item));
    el.adminList.append(button);
  }
}

/** Opens one queue item, downloading its pack into the sandbox. */
async function openForReview(item) {
  state.adminOpen = item.number;
  refreshAdminQueue();

  // Every item in this queue is a report. Packs are listed by the directory
  // once they pass their checks, so nothing arrives here waiting to be read
  // and passed by somebody.
  const named = packNamedIn(item.body);

  el.adminMain.innerHTML = `
    <header class="admin-head">
      <div>
        <h2>${escapeHtml(item.title)}</h2>
        <p class="muted small">Report #${item.number} from
          ${escapeHtml(item.author || 'someone')} · ${escapeHtml(formatWhen(item.openedAt))}</p>
      </div>
      <button class="btn btn-small" id="admin-open-github">Open on GitHub</button>
    </header>

    ${named ? `<div class="admin-target">
      <div class="admin-target-what">
        <b>${escapeHtml(named.title)}</b>
        <span class="muted small">${escapeHtml(named.id)} · by ${escapeHtml(named.author)}${
  named.listed === false ? ' · already taken down' : ''}</span>
      </div>
      <button class="btn btn-small" id="admin-see-pack">See their packs</button>
    </div>` : `<p class="admin-finding is-note"><b>No listed pack named</b>
      <span>This report does not mention a pack that is on the list, so it can be answered
      but nothing can be taken down from here.</span></p>`}

    <h4 class="admin-h">What was said</h4>
    <pre class="admin-body">${escapeHtml(item.body || '(nothing written)')}</pre>

    <div class="admin-decide">
      <div class="admin-decide-what">
        <b>Settle this report</b>
        <span class="muted small">Whatever you choose is said on the report, and it closes.</span>
      </div>
      <div class="admin-decide-buttons">
        ${named ? '<button class="btn btn-danger" id="admin-hide">Take it down</button>'
    + '<button class="btn btn-danger" id="admin-ban">⨂ Take down and ban</button>' : ''}
        <button class="btn" id="admin-dismiss">Close, nothing wrong</button>
      </div>
    </div>`;

  el.adminMain.querySelector('#admin-open-github')
    .addEventListener('click', () => window.api.shell.openExternal(item.url));

  const see = el.adminMain.querySelector('#admin-see-pack');
  if (see) {
    see.addEventListener('click', () => {
      switchTab('mods');
      showPublisher(named.author);
    });
  }

  const hide = el.adminMain.querySelector('#admin-hide');
  if (hide) hide.addEventListener('click', () => decideReview(item, 'hide', named));
  const ban = el.adminMain.querySelector('#admin-ban');
  if (ban) ban.addEventListener('click', () => decideReview(item, 'ban', named));

  el.adminMain.querySelector('#admin-dismiss')
    .addEventListener('click', () => decideReview(item, 'dismiss', null));
}

/**
 * The listed pack a report is about, if it names one.
 *
 * Matched against the directory rather than parsed out of the text. A report is
 * free prose written by whoever was upset, so there is no field to read; what
 * there is, reliably, is the pack's id or title somewhere in it. Checking
 * against what is actually listed means a match is always a real pack rather
 * than a string that looked like one.
 */
function packNamedIn(body) {
  const text = String(body || '').toLowerCase();
  const packs = (state.mods && state.mods.ok && state.mods.packs) || [];
  if (!text || !packs.length) return null;

  // Longest id first, so "meat-grinder-two" is not answered with "meat-grinder".
  return [...packs]
    .sort((a, b) => b.id.length - a.id.length)
    .find((pack) => text.includes(pack.id.toLowerCase())
      || (pack.title && pack.title.length > 3 && text.includes(pack.title.toLowerCase())))
    || null;
}


/**
 * Settles a report, and says why.
 *
 * Three outcomes, none of which is about approving anything. A report is either
 * right about a pack, right about the person behind it, or wrong, and each of
 * those gets said on the report before it closes so whoever sent it can see it
 * was actually read.
 */
async function decideReview(item, decision, pack) {
  const asked = {
    hide: {
      title: pack ? `Take "${pack.title}" down?` : 'Take it down?',
      detail: 'It stops appearing in the Packs tab straight away. The file stays on its '
        + 'author\'s own account and anyone who already has the address keeps it; this is '
        + 'the directory refusing to point at it, not a takedown.\n\n'
        + 'It can be put back at any time from the Listed tab.',
      placeholder: 'Why it was taken down',
      go: 'Take it down',
      mark: '✕',
    },
    ban: {
      title: pack ? `Take it down and ban ${pack.author}?` : 'Ban this account?',
      detail: 'The pack comes off the list and the account is blocked from publishing '
        + 'anything else. Anything already listed by them is hidden too.\n\n'
        + 'For accounts that should not be here at all rather than one pack that went '
        + 'wrong. It can be undone with /unban.',
      placeholder: 'Why (this is on a public issue)',
      go: 'Take down and ban',
      mark: '⨂',
    },
    dismiss: {
      title: 'Close this report?',
      detail: 'Nothing is taken down and nothing is held against anybody. What you write '
        + 'here is said on the report, so whoever sent it knows it was looked at rather '
        + 'than ignored.',
      placeholder: 'Why nothing was done',
      go: 'Close it',
      mark: '✓',
    },
  }[decision];

  // Banning asks for how long as well as why. Everything else is one field, so
  // the plain text box is still the right shape for those.
  let reason;
  let forDuration = '';

  if (decision === 'ban') {
    const answers = await askForm({
      title: asked.title,
      detail: asked.detail,
      mark: asked.mark,
      buttons: [asked.go, 'Cancel'],
      fields: [
        {
          key: 'reason',
          label: 'Why (this is on a public issue)',
          value: '',
          placeholder: 'What they did',
          multiline: true,
          max: 2000,
          required: true,
        },
        {
          key: 'howLong',
          label: 'For how long',
          value: '',
          options: [
            ['', 'Permanently'],
            ['7d', 'A week'],
            ['30d', 'A month'],
            ['90d', 'Three months'],
            ['1y', 'A year'],
          ],
        },
      ],
    });
    if (answers === null) return;
    reason = answers.reason;
    forDuration = answers.howLong;
  } else {
    reason = await askText({
      ...asked,
      buttons: [asked.go, 'Cancel'],
      // Every one of these is somebody being told something. None of them
      // should arrive with no explanation attached.
      required: true,
    });
    if (reason === null) return;
  }

  const said = await window.api.review.decide(item.number, decision, reason, {
    packId: pack ? pack.id : null,
    author: pack ? pack.author : null,
    forDuration,
  });
  if (!said.ok) {
    toast(`Could not do that: ${said.error}`, 'error', 10000);
    return;
  }

  toast({
    hide: 'Taken down.',
    ban: `Taken down, and ${pack ? pack.author : 'that account'} is blocked`
      + `${forDuration ? ` for ${forDuration}` : ' permanently'}.`,
    dismiss: 'Report closed.',
  }[decision], 'ok');

  state.adminOpen = null;
  el.adminMain.innerHTML = '';
  if (decision !== 'dismiss') directoryChanged();

  // Dropped from the list here rather than waiting for the refetch to notice.
  // GitHub does not always report an issue as closed the instant it is closed,
  // so refreshing alone left a settled report sitting in the queue looking like
  // the decision had not taken.
  state.adminItems = state.adminItems.filter((i) => i.number !== item.number);
  state.adminDecided.add(item.number);
  drawAdminQueue(state.adminItems);

  await refreshAdminQueue();
}

// Mods
//
// Browsing and installing never ask for an account. The directory is public and
// the app reads it anonymously; only publishing needs anyone to sign in.

/**
 * The orders packs can be browsed in.
 *
 * Most downloaded leads, because it is the closest thing to a recommendation
 * this directory can offer honestly: nothing here is curated, nobody approves
 * uploads, and the only signal about a pack is how many people kept it. Newest
 * is second, which is what stops that becoming self reinforcing and burying
 * anything published today.
 */
const MOD_SORTS = [
  { id: 'downloads', label: 'Most downloaded' },
  { id: 'newest', label: 'Newest' },
  { id: 'updated', label: 'Recently updated' },
  { id: 'name', label: 'Name' },
  { id: 'smallest', label: 'Smallest' },
];

/**
 * Reports a pack, or the account behind one, after asking why.
 *
 * Says plainly that it is not anonymous before anything is sent. Somebody
 * reporting a pack is asking for it to be taken off a list, which is a real
 * thing to do to another person, and finding out afterwards that your name was
 * attached is the wrong order to learn it in.
 */
async function reportSomething({ packId, packTitle, author }) {
  const what = packId ? `"${packTitle || packId}"` : `@${author}`;

  const me = await ensureSignedIn();
  if (!me) return;

  const reason = await askText({
    title: `Report ${what}?`,
    detail: 'Say what is wrong with it. This opens a report on the directory under your own '
      + `GitHub account, so it is signed by @${me.login} and whoever published this can see `
      + 'who asked and why.\n\n'
      + 'Reports are for packs that should not be listed: something that does not work, is '
      + 'not what it says it is, or should never have been shared. Not liking a pack is not '
      + 'a reason to take it off other people.',
    placeholder: packId ? 'What is wrong with this pack' : 'What this account is doing',
    buttons: ['Send the report', 'Cancel'],
    mark: '!',
    required: true,
  });
  if (reason === null) return;

  const sent = await window.api.mods.report({ packId, packTitle, author, reason });
  if (!sent.ok) {
    toast(`Could not send that: ${sent.error}`, 'error', 9000);
    return;
  }

  const open = await askConfirm({
    title: 'Report sent',
    detail: `Thank you. ${what} has been reported and somebody will look at it.\n\n`
      + 'You can follow it on GitHub, and anything decided is said on the report itself.',
    buttons: ['See the report', 'Done'],
    mark: '✓',
    cancelIndex: 1,
  });
  if (open === 0) openOutside(sent.url, 'this report on GitHub');
}

/**
 * Fills in the profile pictures on whatever was just drawn.
 *
 * The initial is rendered first and the picture replaces it, so a face that
 * cannot be fetched simply stays as a letter rather than leaving a hole. Run
 * after drawing rather than during it, because each one is a separate request
 * and the list should not wait on any of them.
 */
function fillFaces(root = el.modsGrid) {
  for (const holder of root.querySelectorAll('[data-face]')) {
    const login = holder.dataset.face;
    if (!login || holder.dataset.faceDone) continue;
    holder.dataset.faceDone = '1';

    window.api.mods.avatar(login).then((got) => {
      if (!got || !got.ok || !holder.isConnected) return;
      holder.innerHTML = `<img src="${escapeHtml(got.url)}" alt="" loading="lazy" />`;
      holder.classList.add('has-face');
    }).catch(() => { /* the initial is a fine answer */ });
  }
}

/** Orders a list of packs, leaving the caller's array alone. */
function sortPacks(packs, how) {
  const at = (value) => Date.parse(value) || 0;
  const by = {
    downloads: (a, b) => (b.downloads || 0) - (a.downloads || 0)
      || at(b.published) - at(a.published),
    newest: (a, b) => at(b.published) - at(a.published),
    updated: (a, b) => at(b.updated || b.published) - at(a.updated || a.published),
    name: (a, b) => String(a.title).localeCompare(String(b.title), undefined, { numeric: true }),
    smallest: (a, b) => (a.bytes || 0) - (b.bytes || 0),
  };
  return [...packs].sort(by[how] || by.downloads);
}

/** The rail down the side. "Everything" first, then one per pack type. */
const MOD_TYPES = [
  { id: 'all', label: 'Everything' },
  { id: 'voice', label: 'Voice & dubs' },
  { id: 'player', label: 'Players' },
  { id: 'host', label: 'Hosts' },
  { id: 'judges', label: 'Judges' },
  { id: 'studio', label: 'Studios' },
  { id: 'menu', label: 'Menus' },
  { id: 'chatter', label: 'Chatter' },
];

// A submission nobody has acted on is closed after this long. It matches the
// cutoff in the directory's tidy workflow, and the two have to agree: telling
// somebody they have a month when the workflow gives them two is worse than
// saying nothing.
const SUBMISSION_DAYS = 60;

/**
 * How long a waiting submission has left, in words.
 *
 * Only for ones still open, because it is the only state where a deadline
 * means anything. Closing is not a refusal and the wording says so, but not
 * knowing there is a clock at all is worse than knowing there is one.
 */
function waitNoteFor(item) {
  if (inboxStateOf(item) !== 'waiting') return '';

  const opened = Date.parse(item.openedAt);
  if (!opened) return '';

  const left = SUBMISSION_DAYS - Math.floor((Date.now() - opened) / 86400000);
  if (left > 14) return '';

  const words = left <= 0
    ? 'Closing shortly if nothing happens. Publishing again opens a fresh one.'
    : `${left} day${left === 1 ? '' : 's'} left before this closes on its own. `
      + 'That is not a refusal, and publishing again opens a fresh one.';

  return `<span class="inbox-wait">${escapeHtml(words)}</span>`;
}

/** How each submission outcome is shown. */
const INBOX_STATES = {
  waiting: { label: 'Being checked', tone: 'muted' },
  listed: { label: 'Listed', tone: 'ok' },
  // Accepted, but not yet visible to anyone. The directory is served through a
  // cache that holds it for a few minutes, so there is a real window where the
  // pack has been listed and still cannot be found. Saying "Listed" through it
  // is not wrong so much as unhelpful: somebody goes looking and concludes it
  // failed.
  appearing: { label: 'Appearing shortly', tone: 'warn' },
  // Deliberately not shown in the same colour as a refusal. Being asked to
  // change something is not being turned down, and a page that paints the two
  // the same teaches people to read both as rejection.
  changes: { label: 'Needs a change', tone: 'warn' },
  taken: { label: 'Taken down', tone: 'bad' },
  refused: { label: 'Not listed', tone: 'bad' },
  closed: { label: 'Closed', tone: 'muted' },
};

/**
 * What is actually true of a submission right now.
 *
 * The outcome that arrives with a submission is read off the last comment on
 * its issue, which is a record of what happened once and never changes again. A
 * pack taken down a week later still said "Listed", and one accepted a minute
 * ago said "Listed" while the cached directory had not caught up.
 *
 * The directory is the authority on where a pack stands, so it is asked. The
 * comment is left to say what it is good at: why, when the answer was no.
 */
function inboxStateOf(item) {
  const packs = (state.mods && state.mods.ok && state.mods.packs) || [];
  const listed = item.id ? packs.find((p) => p.id === item.id) : null;

  if (listed) return listed.listed === false ? 'taken' : 'listed';

  // Accepted according to the issue, but not in the copy of the directory this
  // app is holding. Either it is still propagating or it has been removed
  // outright, and "appearing shortly" is the honest reading of both.
  if (item.outcome === 'listed') return 'appearing';
  return item.outcome;
}

/**
 * A moderator's words, without the markdown they were written in.
 *
 * The comments are written for GitHub, which renders them. This shows them as
 * plain text, so `**Meat Grinder** is listed` arrived with its asterisks
 * showing and read like a mistake.
 */
function plainText(markdown) {
  return String(markdown || '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^#+\s*/gm, '')
    .trim();
}

/** Switches the Packs tab between browsing and your own submissions. */
async function showMods(which = 'browse') {
  state.modsShow = which;
  state.listing = null;
  // The layout follows this rather than which button happens to be lit. Keying
  // it off a button's class meant any path that drew the grid without going
  // through here inherited the previous view's layout.
  el.modsView.dataset.show = which;
  // A publisher's page is reached from Browse and belongs to it, so Browse
  // stays lit while it is open rather than nothing being lit at all.
  el.btnModsBrowse.classList.toggle('on', which === 'browse' || which === 'publisher');
  el.btnModsPublishers.classList.toggle('on', which === 'publishers');
  el.btnModsInstalled.classList.toggle('on', which === 'installed');
  el.btnModsInbox.classList.toggle('on', which === 'inbox');

  el.modsSearch.hidden = which === 'publisher';
  // Ordering is about packs, so it goes with them rather than following the
  // reader onto a list of people or their own submissions.
  el.modsSortWrap.hidden = which !== 'browse';
  el.btnModsRefresh.hidden = false;
  el.modsSearch.placeholder = which === 'publishers' ? 'Search publishers…'
    : which === 'inbox' ? 'Search your submissions…'
      : which === 'installed' ? 'Search what you have installed…'
        : 'Search packs…';
  // The type rail is about packs, so it has no meaning on the other views.
  if (which !== 'browse') el.modsTypes.hidden = true;

  if (which === 'inbox') await renderInbox();
  else if (which === 'publishers') await showPublishers();
  else if (which === 'installed') await showInstalled();
  else await refreshMods();

  // Read from the same directory the view above just used, so the number on
  // the button cannot disagree with what is on screen.
  await markUpdates();
}

/**
 * Everyone who has a pack listed, and how much they have put in.
 *
 * Built from the directory rather than asked of GitHub. A publisher is not a
 * separate thing that has to be registered anywhere: it is simply somebody with
 * packs listed, so the list of them falls straight out of the index and cannot
 * drift from it.
 */
async function showPublishers() {
  if (!state.mods || state.modsStale) {
    el.modsGrid.innerHTML = '<p class="muted small">Looking…</p>';
  }
  const data = await loadDirectory();
  if (state.modsShow !== 'publishers') return;

  el.modsTitle.textContent = 'Publishers';

  if (!data || !data.ok || !data.configured) {
    el.modsSubtitle.textContent = '';
    el.modsGrid.innerHTML = `<div class="mods-empty"><h3>No publishers yet</h3>
      <p class="muted">${escapeHtml((data && data.error)
    || 'Nobody has had a pack listed yet.')}</p></div>`;
    return;
  }

  const query = (el.modsSearch.value || '').trim().toLowerCase();
  let people = publisherStats(data.packs);
  if (query) people = people.filter((p) => p.author.toLowerCase().includes(query));

  el.modsSubtitle.textContent = `${people.length} publisher${people.length === 1 ? '' : 's'}`;

  if (!people.length) {
    el.modsGrid.innerHTML = `<div class="mods-empty"><h3>Nobody found</h3>
      <p class="muted">No publisher matches that.</p></div>`;
    return;
  }

  el.modsGrid.innerHTML = people.map((p) => `
    <article class="publisher-card" data-author="${escapeHtml(p.author)}">
      <span class="publisher-face" data-face="${escapeHtml(p.author)}">${
  escapeHtml(p.author.slice(0, 1).toUpperCase())}</span>
      <h3>${escapeHtml(p.author)}</h3>
      <p class="muted small">${p.packs} pack${p.packs === 1 ? '' : 's'} ·
        ${escapeHtml(formatDownloads(p.downloads))} · ${escapeHtml(formatBytes(p.bytes))}</p>
      <p class="muted small">Latest ${escapeHtml(formatWhen(p.latest))}</p>
    </article>`).join('');

  for (const card of el.modsGrid.querySelectorAll('[data-author]')) {
    card.addEventListener('click', () => showPublisher(card.dataset.author));
  }
  fillFaces();
}

/**
 * One publisher: what they have put out, and where it lives.
 *
 * The repository address is worked out from a pack's download address rather
 * than stored, because it is already in there and a second copy of the same
 * fact is a second thing that can be wrong.
 */
async function showPublisher(author) {
  state.modsShow = 'publisher';
  el.modsView.dataset.show = 'publisher';
  // Publishers stays lit, because that is where this page belongs and where
  // going back lands. Browse was lit instead, which said the wrong thing about
  // where you were.
  el.btnModsBrowse.classList.remove('on');
  el.btnModsPublishers.classList.add('on');
  el.btnModsInbox.classList.remove('on');
  el.modsSearch.hidden = true;
  el.modsSortWrap.hidden = true;
  // Nothing on this page is a list that refreshing would change: it is one
  // person, drawn from the directory already in hand.
  el.btnModsRefresh.hidden = true;
  el.modsTypes.hidden = true;

  const data = state.mods;
  if (!data || !data.ok) { await showMods('browse'); return; }

  const theirs = data.packs.filter((p) => p.listed !== false
    && String(p.author || '').toLowerCase() === String(author).toLowerCase());
  const stats = publisherStats(data.packs)
    .find((p) => p.author.toLowerCase() === String(author).toLowerCase());

  el.modsTitle.textContent = author;
  el.modsSubtitle.textContent = stats
    ? `${stats.packs} pack${stats.packs === 1 ? '' : 's'} · ${formatDownloads(stats.downloads)}`
    : 'Nothing listed';

  const repo = repoOf(theirs[0]);

  // The kinds of pack they make, which says more about a publisher than any of
  // the numbers do.
  const kinds = [...theirs.reduce((seen, p) => seen.set(p.type, (seen.get(p.type) || 0) + 1),
    new Map())].sort((a, b) => b[1] - a[1]);

  el.modsGrid.innerHTML = `
    <div class="publisher-page">
      <header class="publisher-hero">
        <div class="publisher-avatar publisher-face" data-face="${escapeHtml(author)}"
             aria-hidden="true">${escapeHtml(String(author).slice(0, 1).toUpperCase())}</div>
        <div class="publisher-who">
          <h2>${escapeHtml(author)}</h2>
          <p class="muted small">${stats
    ? `Publishing since ${escapeHtml(formatWhen(stats.first))}`
    : 'Nothing listed at the moment'}</p>
          <div class="publisher-kinds">${kinds.map(([type, n]) =>
    `<span class="publisher-kind">${typeIcon(type)} ${escapeHtml(
      (MOD_TYPES.find((t) => t.id === type) || { label: type }).label)} · ${n}</span>`).join('')}</div>
        </div>
        <div class="publisher-bar">
          ${repo ? `<button type="button" class="btn btn-big btn-primary" id="pub-repo">
            Open their repository</button>` : ''}
          <button type="button" class="btn btn-big mod-report" id="pub-report"
                  title="Report this publisher" aria-label="Report this publisher">!</button>
        </div>
      </header>

      ${stats ? `<div class="publisher-stats">
        <div><b>${stats.packs}</b><span class="muted small">packs listed</span></div>
        <div><b>${stats.downloads.toLocaleString()}</b>
          <span class="muted small">downloaded</span></div>
        <div><b>${escapeHtml(formatBytes(stats.bytes))}</b>
          <span class="muted small">total size</span></div>
        <div><b>${escapeHtml(formatWhen(stats.latest))}</b>
          <span class="muted small">last updated</span></div>
      </div>` : ''}

      <h3 class="publisher-heading">Their packs</h3>
      <div class="publisher-packs" id="pub-packs"></div>
    </div>`;

  const openRepo = el.modsGrid.querySelector('#pub-repo');
  if (openRepo) openRepo.addEventListener('click', () => openOutside(repo, 'their packs on GitHub'));

  el.modsGrid.querySelector('#pub-report')
    .addEventListener('click', () => reportSomething({ author }));

  const holder = el.modsGrid.querySelector('#pub-packs');
  if (!theirs.length) {
    holder.innerHTML = '<p class="muted small">Nothing of theirs is listed at the moment.</p>';
    return;
  }
  for (const pack of theirs) holder.append(modCard(pack));
  fillFaces();
}

/**
 * Everything installed from the directory, and what has moved on since.
 *
 * Updating is deliberately a button rather than something that happens to you.
 * A pack in the game folder may have been recorded over, and replacing it
 * without being asked would throw that away; and an author republishing is not
 * a reason for anybody's machine to start downloading on its own.
 */
async function showInstalled() {
  state.modsShow = 'installed';
  state.listing = null;
  el.modsView.dataset.show = 'installed';
  el.btnModsBrowse.classList.remove('on');
  el.btnModsPublishers.classList.remove('on');
  el.btnModsInstalled.classList.add('on');
  el.btnModsInbox.classList.remove('on');
  el.modsSearch.hidden = false;
  el.modsSearch.placeholder = 'Search what you have installed…';
  el.modsSortWrap.hidden = true;
  el.btnModsRefresh.hidden = false;
  el.modsTypes.hidden = true;

  el.modsTitle.textContent = 'Installed';
  el.modsSubtitle.textContent = 'Looking…';
  el.modsGrid.innerHTML = '<p class="muted small">Looking…</p>';

  const mine = await loadInstalled();
  if (state.modsShow !== 'installed') return;

  if (!mine.length) {
    el.modsSubtitle.textContent = '';
    el.modsGrid.innerHTML = `<div class="mods-empty">
      <h3>Nothing installed from here yet</h3>
      <p class="muted">Packs you install from Browse are listed here, along with anything the
         author has changed since.</p>
      <p class="muted small">Packs you made yourself, or that somebody sent you as a file, are
         in Content rather than here.</p></div>`;
    return;
  }

  const query = (el.modsSearch.value || '').trim().toLowerCase();
  const showing = query
    ? mine.filter((p) => `${p.title} ${p.author}`.toLowerCase().includes(query))
    : mine;

  const waiting = mine.filter((p) => p.hasUpdate).length;
  el.modsSubtitle.textContent = waiting
    ? `${mine.length} installed · ${waiting} with an update`
    : `${mine.length} installed · all up to date`;

  if (!showing.length) {
    el.modsGrid.innerHTML = '<div class="mods-empty"><h3>Nothing found</h3>'
      + '<p class="muted">No installed pack matches that.</p></div>';
    return;
  }

  // Anything with an update goes first. It is the only row on this page that
  // asks anything of the reader.
  const order = [...showing].sort((a, b) => (b.hasUpdate ? 1 : 0) - (a.hasUpdate ? 1 : 0));

  el.modsGrid.innerHTML = `<div class="installed-list">${order.map((p) => `
    <article class="installed-row${p.hasUpdate ? ' has-update' : ''}" data-id="${escapeHtml(p.id)}">
      <span class="mod-icon" data-icon>${typeIcon(p.type)}</span>
      <div class="installed-what">
        <h3>${escapeHtml(p.title)}</h3>
        <p class="muted small">by ${escapeHtml(p.author || 'unknown')} ·
          installed ${escapeHtml(formatWhen(p.installedAt))}</p>
      </div>
      <span class="installed-state">${installedStateHtml(p)}</span>
      <span class="installed-actions">
        <span class="mod-status muted small" data-status></span>
        ${p.hasUpdate
    ? '<button type="button" class="btn btn-small btn-primary" data-update>Update</button>'
    : ''}
        ${p.record ? '<button type="button" class="btn btn-small" data-open>View</button>' : ''}
      </span>
    </article>`).join('')}</div>`;

  for (const row of el.modsGrid.querySelectorAll('.installed-row')) {
    const pack = order.find((p) => p.id === row.dataset.id);
    if (!pack) continue;

    if (pack.record) fillModIcon(row.querySelector('[data-icon]'), pack.record);

    const open = row.querySelector('[data-open]');
    if (open) open.addEventListener('click', () => showListing(pack.record, 'installed'));

    const update = row.querySelector('[data-update]');
    if (update) {
      update.addEventListener('click', async () => {
        await installMod(pack.record, update, row.querySelector('[data-status]'));
        // Re-read rather than assume: the install reports its own failures,
        // and a row still claiming an update after a failed one is worse than
        // a row that simply has not changed.
        state.installed = null;
        await showInstalled();
      });
    }
  }
}

/** What state one installed pack is in, in a few words. */
function installedStateHtml(p) {
  if (p.hasUpdate) return '<span class="chip chip-update">Update available</span>';
  if (!p.stillListed) return '<span class="chip chip-plain">No longer listed</span>';
  if (!p.canCompare) return '<span class="muted small">Installed before updates were tracked</span>';
  return '<span class="muted small">Up to date</span>';
}

/**
 * The installed list, read once per directory refresh.
 *
 * Answered against the directory already in hand rather than fetching it
 * again, so opening this page costs nothing and cannot disagree with what
 * Browse is showing.
 */
async function loadInstalled() {
  if (state.installed) return state.installed;

  const data = await loadDirectory();
  const packs = data && data.ok && data.configured ? data.packs : [];
  const got = await window.api.mods.installed(packs).catch(() => null);
  state.installed = got && got.ok ? got.packs : [];
  return state.installed;
}

/**
 * Puts the number of waiting updates on the Installed button.
 *
 * This is the whole of the notification. A pack having been rebuilt is worth
 * a number on a button and is not worth a dialog in front of whatever somebody
 * was doing.
 */
async function markUpdates() {
  const mine = await loadInstalled().catch(() => []);
  const waiting = mine.filter((p) => p.hasUpdate).length;
  el.modsUpdateBadge.textContent = String(waiting);
  el.modsUpdateBadge.hidden = waiting === 0;
  el.btnModsInstalled.title = waiting
    ? `${waiting} installed pack${waiting === 1 ? ' has' : 's have'} an update`
    : 'Packs you have installed from the directory';
}

/**
 * One listed pack, in full, before deciding whether to install it.
 *
 * A card in a grid has room for a name and a line, and everything else the
 * record carries was being thrown away: what it may be reused for, where it is
 * hosted, when it was last touched. All of that is here, and none of it costs a
 * request. Hearing the pack is a separate press, because that does mean
 * downloading it.
 */
async function showListing(pack, from = 'browse') {
  state.modsShow = 'listing';
  state.listing = pack;
  // Which list this page was opened from stays lit, because that is where
  // going back lands. It was always Browse, so opening a pack from Installed
  // said the reader had left the view they were still working in.
  state.listingFrom = from === 'installed' ? 'installed' : 'browse';
  el.modsView.dataset.show = 'listing';
  el.btnModsBrowse.classList.toggle('on', state.listingFrom === 'browse');
  el.btnModsInstalled.classList.toggle('on', state.listingFrom === 'installed');
  el.btnModsPublishers.classList.remove('on');
  el.btnModsInbox.classList.remove('on');
  el.modsSearch.hidden = true;
  el.modsSortWrap.hidden = true;
  el.btnModsRefresh.hidden = true;
  el.modsTypes.hidden = true;

  const installed = isModInstalled(pack);
  const kind = (MOD_TYPES.find((t) => t.id === pack.type) || { label: pack.type }).label;

  el.modsTitle.textContent = pack.title;
  el.modsSubtitle.textContent = `${kind} by ${pack.author}`;

  el.modsGrid.innerHTML = `
    <div class="listing-page">
      <header class="publisher-hero">
        <div class="listing-art mod-icon">${typeIcon(pack.type)}</div>
        <div class="publisher-who">
          <h2>${escapeHtml(pack.title)}</h2>
          <p class="muted small">${escapeHtml(kind)} by
            <button type="button" class="linklike" data-author>${escapeHtml(pack.author)}</button>
          </p>
          ${contentFlagsHtml(pack.content)}
        </div>
        <div class="publisher-bar">
          <span class="mod-status muted small" id="listing-status"></span>
          <button type="button" class="btn btn-big mod-report" id="listing-report"
                  title="Report this pack" aria-label="Report this pack">!</button>
          <button type="button" class="btn btn-big ${installed ? '' : 'btn-primary'}"
                  id="listing-install" ${installed ? 'disabled' : ''}>${
  installed ? 'Installed' : 'Install'}</button>
        </div>
      </header>

      <div class="publisher-stats">
        <div><b>${escapeHtml(formatBytes(pack.bytes))}</b><span class="muted small">size</span></div>
        <div><b>${(pack.downloads || 0).toLocaleString()}</b>
          <span class="muted small">downloaded</span></div>
        <div><b>${escapeHtml(formatWhen(pack.published))}</b>
          <span class="muted small">published</span></div>
        <div><b>${escapeHtml(formatWhen(pack.updated || pack.published))}</b>
          <span class="muted small">last updated</span></div>
      </div>

      <h3 class="publisher-heading">About</h3>
      <p class="listing-summary">${escapeHtml(pack.summary || 'Nothing written about it.')}</p>
      ${pack.description ? `<p class="listing-desc">${escapeHtml(pack.description)}</p>` : ''}
      <div class="listing-facts">
        <div><span class="muted small">Reuse</span>
          <span>${escapeHtml(licenceLabel(pack.licence))}</span></div>
        <div><span class="muted small">Tags</span>
          <span>${(pack.tags || []).length ? escapeHtml(pack.tags.join(', ')) : 'none'}</span></div>
        <div><span class="muted small">Hosted on</span>
          <span>${escapeHtml(hostOf(pack.downloadUrl))}</span></div>
      </div>

      <h3 class="publisher-heading">What is in it</h3>
      ${previewOfferHtml(pack, 'listing-preview')}
    </div>`;

  el.modsGrid.querySelector('[data-author]')
    .addEventListener('click', () => showPublisher(pack.author));
  el.modsGrid.querySelector('#listing-report').addEventListener('click', () => reportSomething({
    packId: pack.id, packTitle: pack.title, author: pack.author,
  }));

  const preview = el.modsGrid.querySelector('#listing-preview');
  preview.querySelector('[data-hear]')
    .addEventListener('click', () => hearListing(pack, preview));

  const install = el.modsGrid.querySelector('#listing-install');
  if (!installed) {
    install.addEventListener('click', () => installMod(pack, install,
      el.modsGrid.querySelector('#listing-status')));
  }

  fillModIcon(el.modsGrid.querySelector('.listing-art'), pack);
}

/**
 * Reports a bug, or asks for something, without leaving the app.
 *
 * Somebody who has just watched an export fail is the one person who knows
 * exactly what happened, and they are also the least likely to go and find the
 * right repository, work out the format and write it out a second time. Almost
 * everything that goes wrong is never reported, and this is why.
 *
 * What gets attached is shown before anything is sent. It is three lines about
 * the build and no paths: a Windows folder carries an account name, and
 * somebody reporting a broken export has not agreed to put their own name on a
 * public issue to do it.
 */
async function reportIssue() {
  const facts = await window.api.diagnostics().catch(() => null);
  const about = facts
    ? `Version ${facts.version} · Electron ${facts.electron} · ${facts.platform} ${facts.arch}`
      + ` · ffmpeg ${facts.ffmpeg} · game folder ${facts.gameFolder}`
    : 'Could not be read.';

  const said = await askForm({
    title: 'Report a bug, or ask for something',
    detail: 'This opens an issue on the app\'s GitHub page without leaving here. '
      + 'Anyone can read it, so leave out anything private.\n\n'
      + `Attached: ${about}`,
    mark: '!',
    buttons: ['Send it', 'Cancel'],
    fields: [
      {
        key: 'kind',
        label: 'What is this',
        value: 'bug',
        options: [['bug', 'Something is broken'], ['idea', 'A suggestion']],
      },
      {
        key: 'title',
        label: 'In a few words',
        placeholder: 'Exporting stops at 40% every time',
        max: 120,
        min: 5,
        required: true,
      },
      {
        key: 'body',
        label: 'What happened',
        placeholder: 'What were you doing, what did you expect, and what happened instead?',
        multiline: true,
        max: 4000,
      },
    ],
  });
  if (!said) return;

  const body = `**${said.kind === 'idea' ? 'A suggestion' : 'Something is broken'}**\n\n`
    + `${said.body || '(nothing else said)'}\n\n---\n\n${about}\n\n`
    + '<sub>Sent from the Choicer Voicer Content Manager.</sub>';

  const sent = await window.api.reportIssue({ title: said.title, body, kind: said.kind });

  // GitHub has no way to open an issue without an account, so the sign-in the
  // app already knows how to do is offered rather than the report being lost.
  // What was typed is held and sent straight after, so signing in does not
  // mean writing it out a second time.
  if (sent && sent.needsSignIn) {
    const who = await ensureSignedIn({
      why: 'GitHub does not allow an issue to be opened without an account, so sending this '
        + 'report needs a GitHub sign-in. What you have written is kept and sent as soon as '
        + 'you are in.',
    });
    if (!who) return;
    return finishReport(await window.api.reportIssue({
      title: said.title, body, kind: said.kind,
    }));
  }

  return finishReport(sent);
}

/** What happened to a report, and where it went. */
async function finishReport(sent) {
  if (!sent || !sent.ok) {
    toast(`Could not send it: ${(sent && sent.error) || 'no reason given'}`, 'error', 9000);
    return;
  }

  const open = await askConfirm({
    title: 'Sent',
    detail: `It is issue #${sent.number}. Replies arrive by email from GitHub.`,
    buttons: ['See it on GitHub', 'Done'],
    mark: '✓',
    cancelIndex: 1,
  });
  if (open === 0) await openOutside(sent.url, 'the report on GitHub');
}

/** How a licence reads, using the same wording the publisher chose it by. */
function licenceLabel(id) {
  const known = (state.info && state.info.licences) || [];
  return (known.find((l) => l.id === id) || { label: id || 'unstated' }).label;
}

/** Where a pack is hosted, so that is known before anything is downloaded. */
function hostOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return 'unknown'; }
}

/**
 * The offer to fetch a pack and open it up, before anything is downloaded.
 *
 * Written once and used from both the pack's own page and the Admin list,
 * because the question being asked is the same one: is this pack what it says
 * it is. Somebody about to take a pack down has more need of the answer than
 * somebody about to install it.
 */
function previewOfferHtml(pack, id) {
  return `<div class="listing-preview" id="${id}">
      <div class="listing-offer">
        <button type="button" class="btn btn-big" data-hear>Preview pack</button>
        <p class="muted small">Downloads the pack, ${escapeHtml(formatBytes(pack.bytes))},
          and plays it here. It is kept afterwards, so nothing is downloaded twice.</p>
      </div>
    </div>`;
}

/**
 * Fetches a listed pack and shows what is inside it.
 *
 * The one thing a listing cannot tell you is whether the recording is any good,
 * and the only way to find that out was to install it and go looking in the
 * game. This plays the lines where they are, each with whatever it says.
 */
async function hearListing(pack, holder) {
  if (!holder) return;

  holder.innerHTML = '<p class="muted small" data-progress>Fetching it…</p>';
  const note = holder.querySelector('[data-progress]');

  const stop = window.api.mods.onProgress(({ stage, percent }) => {
    if (!note.isConnected) return;
    note.textContent = percent != null
      ? `${stage || 'Working'}… ${Math.round(percent)}%`
      : `${stage || 'Working'}…`;
  });

  let got;
  try {
    got = await window.api.mods.preview(pack);
  } finally {
    stop();
  }

  // Somebody who walked away mid-download is not still looking at this page.
  if (!holder.isConnected) return;

  if (!got || !got.ok) {
    holder.innerHTML = `<p class="muted small">Could not open it: ${
      escapeHtml((got && got.error) || 'no reason given')}</p>`;
    return;
  }

  // The video and the pictures sit together at the top as one strip, then the
  // lines below. Stacked loose down the page they read as three unrelated
  // dumps of whatever the zip happened to hold.
  const media = (got.videoUrl ? `<video class="listing-video"
      src="${escapeHtml(got.videoUrl)}" controls preload="metadata"></video>` : '')
    + (got.images.length ? `<div class="listing-images">${got.images.map((i) =>
      `<img src="${escapeHtml(i.url)}" alt="${escapeHtml(i.name)}"
        title="${escapeHtml(i.name)}" loading="lazy" />`).join('')}</div>` : '');

  holder.innerHTML = `
    ${media ? `<div class="listing-media">${media}</div>` : ''}
    ${got.lines.length ? `<div class="listing-lines">${got.lines.map((l) => `
      <div class="listing-line">
        <!-- metadata, not none. With none, nothing is fetched until play is
             pressed, so every line sat there reading 0:00 / 0:00 and only
             admitted its length once it had been listened to. These are files
             on this machine, so reading their headers costs nothing. -->
        <audio src="${escapeHtml(l.url)}" controls preload="metadata"></audio>
        <span class="listing-said${l.caption ? '' : ' is-empty'}"
              title="${escapeHtml(l.name)}">${escapeHtml(l.caption || l.name)}</span>
      </div>`).join('')}</div>`
    : '<p class="muted small">There are no spoken lines in this pack.</p>'}
    <p class="muted small listing-tally">${got.lineCount > got.lines.length
    ? `The first ${got.lines.length} of ${got.lineCount} lines · ` : ''}${
  got.fileCount} file${got.fileCount === 1 ? '' : 's'} ·
      ${escapeHtml(formatBytes(got.bytes))} unpacked</p>`;
}

/**
 * The repository a pack was published from.
 *
 * A release address is `.../<owner>/<repo>/releases/download/...`, so the first
 * two path parts are the repository. Anything that does not look like that
 * gives nothing rather than a guess.
 */
function repoOf(pack) {
  if (!pack || !pack.downloadUrl) return null;
  try {
    const url = new URL(pack.downloadUrl);
    if (!/(^|\.)github\.com$/.test(url.hostname.toLowerCase())) return null;
    const parts = url.pathname.split('/').filter(Boolean);
    if (parts.length < 2) return null;
    return `https://github.com/${parts[0]}/${parts[1]}`;
  } catch {
    return null;
  }
}

/**
 * Totals per publisher, from listed packs only.
 *
 * Unlisted packs are left out of every number here. Counting a hidden pack
 * towards somebody's total would say the directory holds something it will not
 * show, which is worse than not mentioning it.
 */
function publisherStats(packs) {
  const by = new Map();

  for (const pack of packs) {
    if (pack.listed === false) continue;
    const key = String(pack.author || '').toLowerCase();
    if (!by.has(key)) {
      by.set(key, {
        author: pack.author, packs: 0, downloads: 0, bytes: 0, latest: null, first: null,
      });
    }
    const who = by.get(key);
    who.packs++;
    who.downloads += pack.downloads || 0;
    who.bytes += pack.bytes || 0;
    const when = pack.updated || pack.published;
    if (!who.latest || Date.parse(when) > Date.parse(who.latest)) who.latest = when;
    if (!who.first || Date.parse(pack.published) < Date.parse(who.first)) {
      who.first = pack.published;
    }
  }

  return [...by.values()].sort((a, b) => b.packs - a.packs
    || a.author.localeCompare(b.author));
}

/**
 * Your own submissions, and where you stand with the directory.
 *
 * The reason a pack was refused is written on a GitHub issue, which is
 * somewhere almost nobody looks. Being refused and never finding out why is the
 * worst version of this for someone who made something, so it is shown here in
 * full rather than left where it happened.
 */
async function renderInbox() {
  el.modsTypes.hidden = true;
  el.modsTitle.textContent = 'Your submissions';
  el.modsSubtitle.textContent = 'Looking…';
  el.modsGrid.innerHTML = '<p class="muted small">Looking…</p>';

  const said = await window.api.mods.inbox().catch((e) => ({ ok: false, error: e.message }));

  // Reading the submissions takes a moment, and in that moment somebody can
  // press Browse. Without this the answer arrives afterwards and paints the
  // submissions into the browse tab, which is the wrong list under the wrong
  // heading with no way to tell it is wrong.
  if (state.modsShow !== 'inbox') return;

  state.inbox = said;
  drawInbox();

  // Fetched after the list is already on screen. It is a second round trip to
  // GitHub and the submissions are the thing somebody opened this for, so it
  // fills in underneath rather than holding everything up.
  if (said.ok && said.signedIn) {
    const files = await window.api.mods.releases().catch((e) => ({ ok: false, error: e.message }));
    if (state.modsShow !== 'inbox') return;
    state.releases = files;
    // Redrawn whole: the uploads are rows in the same list as the
    // submissions, not a section underneath them.
    drawInbox();
  }
}



/**
 * Deletes one uploaded file, after saying plainly what that costs.
 *
 * The only thing this app does that cannot be undone, so the warning is not a
 * formality. A release that something in the directory still points at is the
 * dangerous case: the listing survives the file and turns into a download that
 * fails for everybody who tries it, which is worse than either keeping it or
 * unlisting it properly.
 */
async function removeRelease(release, isListed) {
  const sure = await askConfirm({
    title: `Delete "${release.title}"?`,
    detail: `This removes the upload and its tag from your GitHub account for good. `
      + `${formatBytes(release.bytes)} across ${release.assets.length} `
      + `file${release.assets.length === 1 ? '' : 's'}, downloaded `
      + `${formatDownloads(release.downloads)}.\n\n`
      + (isListed
        ? 'This pack is listed in the directory right now, and the listing points at this '
          + 'file. Deleting it leaves a listing that fails to install for everyone who tries. '
          + 'Take the pack off the list first if that is what you want.\n\n'
        : 'Nothing in the directory points at this, so nothing else breaks.\n\n')
      + 'Anyone who already installed the pack keeps it. This cannot be undone.',
    buttons: ['Delete it', 'Cancel'],
    mark: '✕',
    danger: true,
    cancelIndex: 1,
  });
  if (sure !== 0) return;

  const done = await window.api.mods.deleteRelease(release.id, release.tag);
  if (!done.ok) {
    toast(`Could not delete it: ${done.error}`, 'error', 9000);
    return;
  }

  toast(`Deleted "${release.title}".`, 'ok');
  state.releases.releases = state.releases.releases.filter((r) => r.id !== release.id);
  // The row that was open has just been deleted, so the list picks the next one
  // rather than leaving the detail showing something that is no longer there.
  state.inboxOpen = null;
  drawInbox();
}

/**
 * Draws what was fetched, filtered by whatever is in the search box.
 *
 * A list on one side and one thing at a time on the other.
 *
 * It was a stack of expanding rows with the uploaded files tacked on the end,
 * which meant two unrelated lists sharing a column and a banner of standing
 * text above both. Submissions and uploads are two views of the same pack, so
 * they belong in one list, and the detail belongs beside it rather than pushing
 * everything below it down the page.
 */
function drawInbox() {
  const said = state.inbox;
  if (!said) return;

  if (!said.ok) {
    el.modsSubtitle.textContent = '';
    el.modsGrid.innerHTML = '<div class="mods-empty"><h3>Could not be read</h3>'
      + `<p class="muted">${escapeHtml(said.error)}</p></div>`;
    return;
  }
  if (!said.configured || !said.signedIn) {
    el.modsSubtitle.textContent = '';
    el.modsGrid.innerHTML = '<div class="mods-empty"><h3>Not signed in</h3>'
      + '<p class="muted">Link a GitHub account in Settings to publish packs and to see what '
      + 'happened to them.</p></div>';
    return;
  }

  const items = said.items || [];
  const files = (state.releases && state.releases.ok && state.releases.releases) || [];

  // What all of it adds up to on their account.
  //
  // Worth showing because it is the only number here somebody can act on: the
  // packs live on their GitHub, and if GitHub ever objects to how much is
  // stored, deleting old uploads is the fix. A total nobody can see is a total
  // nobody manages until something refuses.
  const used = files.reduce((n, f) => n + (f.bytes || 0), 0);
  const banned = (said.standing || {}).banned;

  el.modsSubtitle.textContent = banned
    ? `${said.login} · blocked from publishing`
    : files.length
      ? `${said.login} · ${formatBytes(used)} across `
        + `${files.length} upload${files.length === 1 ? '' : 's'}`
      : `Signed in as ${said.login}`;

  // What changed since this was last opened, so a decision made days ago is not
  // just another row in a list that all looks the same.
  const seen = JSON.parse(localStorage.getItem('inboxSeen') || '{}');
  const query = (el.modsSearch.value || '').trim().toLowerCase();
  const matches = (text) => !query || String(text).toLowerCase().includes(query);

  const rows = [];
  for (const item of items) {
    if (!matches(`${item.title} ${item.id || ''} ${item.reason || ''}`)) continue;
    rows.push({
      key: `s${item.number}`,
      kind: 'submission',
      title: item.title,
      state: INBOX_STATES[inboxStateOf(item)] || INBOX_STATES.closed,
      when: item.openedAt,
      changed: seen[item.number] !== undefined && seen[item.number] !== inboxStateOf(item),
      item,
    });
  }
  // A pack that has a submission does not also get an upload row.
  //
  // They are the same pack: publishing puts the file on the account and opens
  // the submission that points at it. Showing both listed it twice, once as
  // "Listed" and once as "Uploaded", which reads as two things when it is one.
  // The submission is the one kept, because it carries the outcome; the file is
  // reachable from its detail.
  const spokenFor = new Set(rows.map((r) => r.item && r.item.id).filter(Boolean));

  for (const file of files) {
    if (file.packId && spokenFor.has(file.packId)) continue;
    if (!matches(`${file.title} ${file.tag}`)) continue;
    rows.push({
      key: `f${file.id}`,
      kind: 'file',
      title: file.title,
      state: { label: 'Uploaded', tone: 'muted' },
      when: file.published,
      changed: false,
      file,
    });
  }

  rows.sort((a, b) => (Date.parse(b.when) || 0) - (Date.parse(a.when) || 0));
  state.inboxRows = rows;

  if (!items.length && !files.length) {
    el.modsGrid.innerHTML = '<div class="mods-empty"><h3>Nothing published yet</h3>'
      + '<p class="muted">Packs you publish from Content show up here, along with the files '
      + 'they leave on your GitHub account.</p></div>';
    return;
  }

  const listed = new Set(((state.mods && state.mods.ok && state.mods.packs) || [])
    .filter((p) => p.listed !== false).map((p) => p.id));
  state.inboxListed = listed;

  if (!state.inboxOpen || !rows.some((r) => r.key === state.inboxOpen)) {
    state.inboxOpen = rows.length ? rows[0].key : null;
  }

  el.modsGrid.innerHTML = `
    <div class="inbox-split">
      <div class="inbox-column">
        ${rows.length
    ? rows.map((row) => `
          <button type="button" class="inbox-row${row.key === state.inboxOpen ? ' on' : ''}"
                  data-key="${escapeHtml(row.key)}">
            <span class="inbox-row-top">
              <span class="inbox-row-title">${row.changed
    ? '<i class="inbox-dot" title="This changed since you last looked"></i>' : ''}${
  escapeHtml(row.title)}</span>
              <span class="inbox-state is-${row.state.tone}">${escapeHtml(row.state.label)}</span>
            </span>
            <span class="muted small">${row.kind === 'file' ? 'File on GitHub' : 'Submission'}
              · ${escapeHtml(formatWhen(row.when))}</span>
          </button>`).join('')
    : '<p class="muted small inbox-none">Nothing matches that.</p>'}
      </div>
      <div class="inbox-detail" id="inbox-detail"></div>
    </div>`;

  for (const button of el.modsGrid.querySelectorAll('[data-key]')) {
    button.addEventListener('click', () => {
      state.inboxOpen = button.dataset.key;
      drawInbox();
    });
  }

  drawInboxDetail();

  // Written after drawing, so the marks survive until they have been seen. Only
  // when nothing is filtered out, or a search would mark rows as seen that were
  // never on screen.
  if (!query) {
    const now = {};
    for (const item of items) now[item.number] = inboxStateOf(item);
    localStorage.setItem('inboxSeen', JSON.stringify(now));
  }
}

/** Whichever row is open, in full. */
function drawInboxDetail() {
  const holder = el.modsGrid.querySelector('#inbox-detail');
  if (!holder) return;

  const row = (state.inboxRows || []).find((r) => r.key === state.inboxOpen);
  if (!row) {
    holder.innerHTML = '<p class="muted small">Pick something on the left.</p>';
    return;
  }

  if (row.kind === 'submission') {
    const item = row.item;
    // The upload this submission points at, folded in rather than listed on its
    // own. Matched on the pack id, which is what the release is tagged with.
    const mine = ((state.releases && state.releases.ok && state.releases.releases) || [])
      .find((f) => f.packId && f.packId === item.id) || null;

    holder.innerHTML = `
      <header class="inbox-detail-head">
        <div>
          <h3>${escapeHtml(item.title)}</h3>
          <p class="muted small">Submission #${item.number}
            · sent ${escapeHtml(formatWhen(item.openedAt))}${
  item.id ? ` · listed as ${escapeHtml(item.id)}` : ''}</p>
        </div>
        <span class="inbox-state is-${row.state.tone}">${escapeHtml(row.state.label)}</span>
      </header>
      ${waitNoteFor(item)}
      <h4 class="inbox-h">What was said</h4>
      ${item.reason
    ? `<p class="inbox-reason">${escapeHtml(plainText(item.reason))}</p>`
    : '<p class="inbox-reason muted">Nothing has been said on it yet.</p>'}
      ${mine ? `<h4 class="inbox-h">The file it points at</h4>
      <div class="inbox-files">
        ${mine.assets.map((a) => `<div><span>${escapeHtml(a.name)}</span>
          <span class="muted small">${escapeHtml(formatBytes(a.bytes))}</span></div>`).join('')}
      </div>` : ''}

      <div class="inbox-detail-foot">
        ${mine ? '<button class="btn btn-small btn-danger" id="inbox-delete-file">'
    + 'Delete the upload</button>' : ''}
        <button class="btn btn-small" id="inbox-open-github">Open on GitHub</button>
      </div>`;
    holder.querySelector('#inbox-open-github')
      .addEventListener('click', () => openOutside(item.url, 'this submission on GitHub'));

    // The upload no longer has a row of its own, so the one thing that could
    // only be done from it lives here instead.
    const remove = holder.querySelector('#inbox-delete-file');
    if (remove) {
      remove.addEventListener('click', () => removeRelease(mine,
        Boolean(state.inboxListed && state.inboxListed.has(item.id))));
    }
    return;
  }

  const file = row.file;
  const isListed = state.inboxListed && state.inboxListed.has(file.packId);
  holder.innerHTML = `
    <header class="inbox-detail-head">
      <div>
        <h3>${escapeHtml(file.title)}</h3>
        <p class="muted small">${escapeHtml(file.tag)}
          · uploaded ${escapeHtml(formatWhen(file.published))}</p>
      </div>
      ${isListed ? '<span class="release-live">listed</span>'
    : '<span class="inbox-state is-muted">not listed</span>'}
    </header>

    <div class="inbox-figures">
      <div><b>${escapeHtml(formatBytes(file.bytes))}</b><span class="muted small">size</span></div>
      <div><b>${escapeHtml(formatDownloads(file.downloads))}</b>
        <span class="muted small">downloaded</span></div>
      <div><b>${file.assets.length}</b>
        <span class="muted small">file${file.assets.length === 1 ? '' : 's'}</span></div>
    </div>

    <h4 class="inbox-h">What is in it</h4>
    <div class="inbox-files">
      ${file.assets.map((a) => `<div><span>${escapeHtml(a.name)}</span>
        <span class="muted small">${escapeHtml(formatBytes(a.bytes))}</span></div>`).join('')}
    </div>

    <div class="inbox-detail-foot">
      <button class="btn btn-small" id="file-open">Open on GitHub</button>
      <button class="btn btn-small btn-danger" id="file-delete">Delete this upload</button>
    </div>`;

  holder.querySelector('#file-open')
    .addEventListener('click', () => openOutside(file.url, 'this release on GitHub'));
  holder.querySelector('#file-delete')
    .addEventListener('click', () => removeRelease(file, Boolean(isListed)));
}

/**
 * Fetches the directory.
 *
 * Cached for the session, because the index does not change while the app is
 * open and re-fetching it on every visit to the tab is rude to whoever is
 * serving it. Refresh forces it.
 */
async function refreshMods({ force = false } = {}) {
  if (state.mods && !force) {
    renderModTypes();
    renderMods();
    return;
  }

  el.modsSubtitle.textContent = 'Looking…';
  await loadDirectory({ force });

  // Same reason as the submissions list: this can finish after somebody has
  // moved to the other tab, and painting the directory over their submissions
  // is as wrong in this direction as in the other.
  if (state.modsShow === 'inbox') return;

  renderModTypes();
  renderMods();
}

/**
 * The kinds of pack, as a column of pictures.
 *
 * The name and the count are gone from the button. Seven rows each carrying a
 * word and a number made a rail that had to be read down before anything could
 * be picked, and the number was answering a question nobody asked: how many
 * chatter packs exist is not what somebody choosing between them wants to know.
 * The name is still there for anyone who needs it, as the tooltip and as the
 * label a screen reader announces, and the heading says which one is open.
 */
function renderModTypes() {
  el.modsTypes.innerHTML = '';

  for (const type of MOD_TYPES) {
    const button = document.createElement('button');
    button.className = 'type-btn';
    button.dataset.type = type.id;
    button.title = type.label;
    button.setAttribute('aria-label', type.label);
    button.classList.toggle('on', type.id === (state.modsType || 'all'));
    button.innerHTML = `<span class="type-icon-wrap">${typeIcon(type.id)}</span>`;
    button.addEventListener('click', () => {
      state.modsType = type.id;
      renderModTypes();
      renderMods();
    });
    el.modsTypes.append(button);
  }
}

/** Download counts are approximate, so they are shown that way. */
/**
 * How many times something has been downloaded.
 *
 * Zero is written as zero. It used to say "new", which is a different claim
 * about a different thing: a pack listed a year ago that nobody has taken is
 * not new, and dressing the number up made it impossible to tell that apart
 * from one published this morning.
 */
function formatDownloads(count) {
  const n = Number(count) || 0;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k downloaded`;
  return `${n} downloaded`;
}

/** Whether a listed pack is already installed, by title. */
function isModInstalled(pack) {
  if (!state.content) return false;
  const wanted = (pack.title || '').toLowerCase();
  return state.content.types.some((type) => type.id === pack.type
    && type.packs.some((p) => (p.title || '').toLowerCase() === wanted));
}

function renderMods() {
  const data = state.mods;
  el.modsGrid.innerHTML = '';

  if (!data) return;

  if (!data.ok) {
    el.modsTypes.hidden = true;
    el.modsSubtitle.textContent = 'Could not be reached.';
    el.modsGrid.innerHTML = `
      <div class="mods-empty">
        <h3>The directory could not be read</h3>
        <p class="muted">${escapeHtml(data.error || 'No reason given.')}</p>
        <p class="muted small">Everything else in the app works without it.</p>
      </div>`;
    return;
  }

  // Nothing set up yet, which is the normal state until a directory exists.
  // Said plainly rather than shown as an error, because nothing is wrong.
  if (!data.configured) {
    el.modsTypes.hidden = true;
    el.modsSubtitle.textContent = 'Not set up yet.';
    el.modsGrid.innerHTML = `
      <div class="mods-empty">
        <h3>No packs yet</h3>
        <p class="muted">This is where packs other people have shared will appear, ready to
           install in one press. Nothing has been listed yet.</p>
        <p class="muted small">Everything else in the app works without it, and always will.</p>
      </div>`;
    return;
  }

  el.modsTypes.hidden = false;

  const chosen = MOD_TYPES.find((t) => t.id === (state.modsType || 'all')) || MOD_TYPES[0];
  el.modsTitle.textContent = chosen.label;

  const query = (el.modsSearch.value || '').trim().toLowerCase();

  // Unlisted packs are dropped before anything else. A pack taken down stays in
  // the index on purpose, so it can be put back and so its download count is
  // not lost, but it must not appear to anybody browsing. Nothing filtered on
  // this before, which meant hiding a pack changed the file and nothing else.
  const showing = data.packs.filter((p) => p.listed !== false);

  let packs = showing;
  if (chosen.id !== 'all') packs = packs.filter((p) => p.type === chosen.id);
  if (query) {
    packs = packs.filter((p) => `${p.title} ${p.author} ${(p.tags || []).join(' ')}`
      .toLowerCase().includes(query));
  }

  packs = sortPacks(packs, state.modsSort);

  el.modsSubtitle.textContent = query
    ? `${packs.length} of ${showing.length} matching "${query}"`
    : `${packs.length} pack${packs.length === 1 ? '' : 's'}`;

  if (!packs.length) {
    el.modsGrid.innerHTML = `
      <div class="mods-empty">
        <h3>Nothing here</h3>
        <p class="muted">${query ? 'No pack matches that.' : 'No packs of this kind yet.'}</p>
      </div>`;
    return;
  }

  for (const pack of packs) {
    el.modsGrid.append(modCard(pack));
  }
}

/**
 * How long ago something happened, in words.
 *
 * A date on its own makes the reader do arithmetic to answer the only question
 * they actually have, which is whether this is recent.
 */
function formatWhen(iso) {
  const then = Date.parse(iso);
  if (!then) return 'recently';

  const days = Math.floor((Date.now() - then) / 86400000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days} days ago`;
  if (days < 60) return 'last month';
  return `${Math.floor(days / 30)} months ago`;
}

/**
 * Asks how a pack should read in the directory.
 *
 * Everything here has a sensible default, so the fastest path is still one
 * press. What it prevents is the default being the *only* thing: a page of
 * packs all summarised as "A voice pack" with no tags is a page nobody browses.
 *
 * Resolves with the details, or null if it was declined.
 */
async function askListingDetails(pack, already) {
  const said = await askForm({
    title: 'How should this pack be listed?',
    detail: 'This is what people see when browsing. A name and one line about it are required.',
    mark: '↗',
    buttons: ['Continue', 'Cancel'],
    fields: [
      // Asked rather than taken from the pack, because a pack with no name of
      // its own is shown under its folder name, and folder names are things
      // like "new voice pack 2". That is fine on your own machine and reads
      // badly as the name of the thing in a public list.
      {
        key: 'title',
        label: 'Name',
        value: (already && already.title) || pack.title || '',
        placeholder: 'What this pack is called',
        max: 80,
        min: 2,
        required: true,
      },
      {
        key: 'summary',
        label: 'One line about it',
        value: (already && already.summary) || pack.subtitle || '',
        placeholder: 'What is in it, in a few words',
        max: 140,
        required: true,
      },
      {
        key: 'description',
        label: 'More, if you want',
        value: (already && already.description) || '',
        placeholder: 'Optional',
        multiline: true,
        max: 4000,
      },
      {
        key: 'tags',
        label: 'Tags, separated by commas',
        value: ((already && already.tags) || []).join(', '),
        placeholder: 'funny, short, anime',
        max: 200,
      },
      {
        key: 'licence',
        label: 'Can other people reuse this?',
        value: (already && already.licence) || 'unstated',
        options: ((state.info && state.info.licences) || [{ id: 'unstated', label: 'Rather not say' }])
          .map((l) => [l.id, l.label]),
      },
    ],
  });
  if (said === null) return null;

  return {
    title: said.title.trim(),
    summary: said.summary.trim(),
    description: said.description.trim(),
    // Lower case, dashes for spaces, deduplicated: the validator wants tags in
    // that shape and rejecting somebody's typing for a formatting rule they
    // were never told is the wrong way round.
    tags: [...new Set(said.tags.split(',')
      .map((t) => t.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''))
      .filter(Boolean))].slice(0, 8),
    licence: said.licence || 'unstated',
  };
}

/**
 * The warnings an author declared, as small labels.
 *
 * Nothing at all is the common case and shows as nothing — a row of "no
 * violence, no nudity" on every pack would bury the ones that say otherwise.
 */
function contentFlagsHtml(content) {
  if (!content || !content.length) return '';
  const known = (state.info && state.info.contentFlags) || [];
  const labelFor = (id) => (known.find((f) => f.id === id) || { label: id }).label;
  return `<div class="mod-flags">${content.map((id) =>
    `<span class="mod-flag">${escapeHtml(labelFor(id))}</span>`
  ).join('')}</div>`;
}

/** One pack in the grid. */
function modCard(pack) {
  const card = document.createElement('article');
  card.className = 'mod-card';

  const installed = isModInstalled(pack);
  card.innerHTML = `
    <div class="mod-card-head">
      <span class="mod-icon">${typeIcon(pack.type)}</span>
      <div class="mod-card-name">
        <h3>${escapeHtml(pack.title)}</h3>
        <p class="muted small"><button type="button" class="linklike"
             data-author="${escapeHtml(pack.author)}">by ${escapeHtml(pack.author)}</button></p>
      </div>
    </div>
    <p class="mod-summary">${escapeHtml(pack.summary || '')}</p>
    ${contentFlagsHtml(pack.content)}
    <div class="mod-card-foot">
      <span class="muted small">${formatBytes(pack.bytes)} · ${formatDownloads(pack.downloads)}</span>
      <span class="mod-actions">
        <span class="mod-status muted small"></span>
        <button class="btn btn-small mod-report" title="Report this pack"
                aria-label="Report this pack">!</button>
        <button class="btn btn-small mod-install ${installed ? '' : 'btn-primary'}">
          ${installed ? 'Installed' : 'Install'}
        </button>
      </span>
    </div>`;

  // Named rather than "the first button on the card". It was the first one
  // until the author's name became a button too, and a card whose Install
  // handler is quietly attached to something else is the kind of break that
  // does not look like a break.
  const button = card.querySelector('.mod-install');
  const status = card.querySelector('.mod-status');
  if (installed) button.disabled = true;
  else button.addEventListener('click', () => installMod(pack, button, status));

  card.querySelector('[data-author]')
    .addEventListener('click', () => showPublisher(pack.author));

  card.querySelector('.mod-report').addEventListener('click', () => reportSomething({
    packId: pack.id, packTitle: pack.title, author: pack.author,
  }));

  // The card itself opens the pack's own page. The buttons on it keep doing
  // what they say, so this only picks up the presses that hit nothing else.
  card.addEventListener('click', (e) => {
    if (e.target.closest('button')) return;
    showListing(pack);
  });

  fillModIcon(card.querySelector('.mod-icon'), pack);
  return card;
}

/**
 * Puts the published icon on a card, once it has been checked.
 *
 * The type glyph stays until an image is verified, so a card is never empty and
 * a pack whose icon fails its check simply keeps the glyph. Nothing announces
 * that failure on the card: whoever is browsing did nothing wrong and cannot
 * act on it, and a grid peppered with warnings about other people's packs is
 * noise. It is refused in the main process, which is where it matters.
 */
async function fillModIcon(holder, pack) {
  if (!holder || !pack.iconUrl || !pack.iconSha256) return;

  const got = await window.api.mods.icon(pack.iconUrl, pack.iconSha256).catch(() => null);
  if (!got || !got.ok || !holder.isConnected) return;

  holder.innerHTML = `<img src="${escapeHtml(got.url)}" alt="" loading="lazy" />`;
  holder.classList.add('has-image');
}

/**
 * Downloads and installs one listed pack.
 *
 * Stages are reported as they happen: checking and unpacking a large pack takes
 * long enough that a still button reads as a broken one.
 */
async function installMod(pack, button, status) {
  button.disabled = true;
  status.textContent = 'starting…';

  const stop = window.api.mods.onProgress(({ stage, percent }) => {
    if (stage) status.textContent = `${stage}…`;
    else if (percent != null) status.textContent = `downloading ${Math.round(percent)}%`;
  });

  try {
    const result = await window.api.mods.install(pack);
    if (!result.ok) {
      status.textContent = '';
      button.disabled = false;
      if (!result.cancelled) toast(`Could not install it: ${result.error}`, 'error', 9000);
      return;
    }
    status.textContent = '';
    button.textContent = 'Installed';
    toast(`Installed "${pack.title}".`, 'ok');
    await refreshContent();
  } finally {
    stop();
  }
}


/**
 * Packages a pack into a single zip anybody can install.
 *
 * The zip carries its own record inside it, so what comes out is one file that
 * knows what it is — no second file to keep track of and nothing to fill in
 * before it can be handed over.
 */
/**
 * Refuses a pack with no picture, and says why.
 *
 * Checked before packaging rather than only before publishing. A pack with no
 * picture is an empty square everywhere it is shown, including in the game once
 * somebody installs it, and that is just as true of a zip handed over directly
 * as of one that goes to the directory. Letting the zip through and stopping
 * only at publishing meant the rule was discovered several minutes of
 * re-encoding after it could have been useful.
 *
 * Returns true when the pack has one and the caller may carry on.
 */
async function requirePicture(pack) {
  if (pack.iconPath || pack.iconUrl) return true;

  await askConfirm({
    title: 'This pack needs an icon first',
    detail: `"${pack.title}" has no icon, so it would show as an empty square everywhere it `
      + 'appears, including in the game once somebody installs it.\n\n'
      + 'To set one: press "Edit this pack", then set the icon under Pack details on the '
      + 'right. Come back and share it once it has one.',
    buttons: ['Done'],
    mark: '!',
  });
  return false;
}

async function sharePack(pack) {
  if (!await requirePicture(pack)) return;

  const go = await askConfirm({
    title: `Share "${pack.title}"?`,
    // Publishing is named here rather than only on the dialog that follows.
    // This step makes a zip and says so, which read as the whole of what the
    // button did, so the way to get a pack listed in Packs was reachable only
    // by pressing something that appeared to do something else and waiting
    // several minutes to find out.
    detail: 'This packages the pack into one zip in your exports folder, shrunk on the way, '
      + 'usually to about half the size. Your own copy is not touched.\n\n'
      + 'When it is done you can publish it to the Packs tab, where everyone can find and '
      + 'install it, or just send the zip to somebody directly. Both are offered once it is '
      + 'packaged, and nothing is uploaded until you choose to.',
    buttons: ['Package it', 'Cancel'],
    mark: '↗',
  });
  if (go !== 0) return;

  // A bar rather than toasts. Packaging a pack with video in it is minutes of
  // re-encoding, and something that has to be waited for should look like it,
  // not like a notification that has already gone.
  showProgress(true, 'Packaging…', '');
  el.progressName.textContent = pack.title;
  el.progressQueue.textContent = '';
  el.btnProgressCancel.hidden = true;
  el.btnProgressCancelAll.hidden = true;

  const stop = window.api.mods.onProgress(({ stage, file, percent }) => {
    if (stage) showProgress(true, `${stage}…`, file || '');
    if (percent != null) el.progressFill.style.width = `${percent}%`;
  });

  let result;
  try {
    result = await window.api.mods.share(pack.dir, {
      type: pack.type,
      title: pack.title,
      summary: pack.subtitle || `A ${pack.type} pack.`,
      author: (state.settings.shareHandle || '').trim(),
      licence: 'unstated',
    });
  } finally {
    stop();
    showProgress(false);
    el.btnProgressCancel.hidden = false;
  }

  if (!result || !result.ok) {
    toast(`Could not package it: ${(result && result.error) || 'no reason given'}`, 'error', 9000);
    return;
  }

  // Worth saying what the wait bought, since on a big pack it is minutes.
  const shrunk = result.shrunk;
  const saved = shrunk && shrunk.saved > 0
    ? `Shrunk from ${formatBytes(shrunk.before)} to ${formatBytes(shrunk.after)}, so it `
      + `downloads about ${Math.round((1 - shrunk.ratio) * 100)}% faster.\n\n`
    : '';

  const who = await window.api.mods.whoAmI().catch(() => ({ configured: false }));
  const canPublish = who.configured;
  const already = who.signedIn ? await alreadyPublished(pack, who.login) : null;

  await offerToShare(result, pack, saved, canPublish, already);
}

/**
 * The "ready to share" dialog, and what each button does.
 *
 * Opening the folder brings the dialog back rather than dismissing it. Looking
 * at where a file landed is not a decision, and closing on it meant packaging
 * the pack all over again to reach Publish.
 */
async function offerToShare(result, pack, saved, canPublish, already) {
  const open = await askConfirm({
    title: 'Ready to share',
    detail: `${pack.title}.zip (${formatBytes(result.bytes)}) is in your exports folder, `
      + 'under "Shared packs".\n\n'
      + saved
      + 'Send it to anyone. They open the Packs tab and pick it.'
      + (already
        ? '\n\nThis pack is already in the directory. Updating it replaces what is listed '
          + 'with this version. The listing keeps its place and its download count.'
        : canPublish
          ? '\n\nOr publish it, which uploads it to your own GitHub account and offers it to '
            + 'the pack directory so anyone can find it.'
          : ''),
    buttons: canPublish
      ? [already ? 'Update it' : 'Publish it', 'Open the folder', 'Done']
      : ['Open the folder', 'Done'],
    mark: '✓',
    cancelIndex: canPublish ? 2 : 1,
  });

  if (canPublish && open === 0) {
    await publishPack(result, pack, already);
    return;
  }
  // With the publish button present, everything after it shifts by one.
  if (open !== (canPublish ? 1 : 0)) return;

  await openSharedFolder(result.zipPath);
  await offerToShare(result, pack, saved, canPublish, already);
}

/** Opens the folder a packaged zip landed in. */
async function openSharedFolder(zipPath) {
  // Cut back to the folder rather than blanked to one: a trailing separator
  // upsets the folder check on Windows.
  const folder = zipPath.replace(/[\\/][^\\/]+$/, '');
  // openPath answers with a reason instead of throwing, and dropping that
  // answer is what makes a button like this look as though it does nothing.
  const failed = await window.api.shell.openPath(folder);
  if (failed) toast(`Could not open the folder: ${failed}`, 'error', 9000);
}

/**
 * Signs in to GitHub, if not already.
 *
 * The device flow shows a code to type on github.com. The dialog stays up while
 * that happens, because the code is useless once it is dismissed and there is
 * no way to ask for it again without starting over.
 */
async function ensureSignedIn({ force = false, why = null } = {}) {
  const who = await window.api.mods.whoAmI();
  if (!who.configured) {
    toast('This build cannot sign in to GitHub.', 'error', 7000);
    return null;
  }
  // `force` is for linking a different account from Settings, where already
  // being signed in is the reason you pressed the button.
  if (who.signedIn && !force) return who;

  // Why an account is being asked for depends on what was pressed. Publishing
  // and reporting a bug both need one and have nothing else in common, and a
  // report explained in terms of releases reads as the wrong dialog.
  const go = await askConfirm({
    title: 'Sign in to GitHub',
    detail: (why || 'Publishing puts the pack on your own GitHub account, so it stays yours and '
      + 'you can take it down whenever you like.')
      + '\n\nYou will get a short code to type on github.com. It is only asked for once.\n\n'
      + 'The app can create one repository for your packs and add releases to it. It cannot '
      + 'read your other repositories.',
    buttons: ['Sign in', 'Cancel'],
    mark: '#',
  });
  if (go !== 0) return null;

  // Arrives while signIn is still waiting, which is the only moment it is
  // useful, so it is shown from here rather than returned.
  const stop = window.api.mods.onDeviceCode(({ userCode, verificationUri }) => {
    window.api.shell.openExternal(verificationUri);
    askConfirm({
      title: 'Your code',
      detail: `Type this on ${verificationUri}, which should have just opened. `
        + 'Leave this dialog open until it is done.',
      code: userCode,
      buttons: ['Done'],
      mark: '#',
    });
  });

  try {
    const result = await window.api.mods.signIn();
    if (!result.ok) {
      toast(`Could not sign in: ${result.error}`, 'error', 9000);
      return null;
    }
    toast(`Signed in as ${result.login}.`, 'ok');
    if (!result.remembered) {
      toast('This machine cannot store the sign-in, so it will be asked for again next time.',
        'warn', 8000);
    }
    return result;
  } finally {
    stop();
  }
}

/**
 * Shows who is linked, in Settings.
 *
 * Asked of the main process rather than remembered here, because the answer
 * includes whether the stored token still works — a token can be revoked on
 * github.com without this app ever being told.
 */
async function renderGithubLink() {
  if (!el.githubStatus) return;

  const who = await window.api.mods.whoAmI().catch(() => null);

  if (!who || !who.configured) {
    el.githubStatus.textContent = 'Publishing is not available in this build.';
    el.githubNote.hidden = true;
    el.btnGithubLink.hidden = true;
    el.btnGithubUnlink.hidden = true;
    return;
  }

  el.githubNote.hidden = false;
  if (who.signedIn) {
    el.githubStatus.innerHTML = `Linked as <b>@${escapeHtml(who.login)}</b>.`;
    el.githubNote.textContent = who.canSubmit
      ? 'Packs you publish go on your own account and are offered to the pack directory.'
      : 'Packs you publish go on your own account. There is no pack directory set up yet, '
        + 'so they are not listed anywhere, but the address works.';
    el.btnGithubLink.textContent = 'Link a different account';
    el.btnGithubUnlink.hidden = false;
  } else {
    el.githubStatus.textContent = 'Not linked.';
    el.githubNote.textContent = 'Link a GitHub account to publish packs. Packs go on your own '
      + 'account, so they stay yours and you can take them down whenever you like.';
    el.btnGithubLink.textContent = 'Link GitHub';
    el.btnGithubUnlink.hidden = true;
  }
}

/** Links an account from Settings, then redraws the section. */
async function linkGithub() {
  el.btnGithubLink.disabled = true;
  try {
    await ensureSignedIn({ force: true });
  } finally {
    el.btnGithubLink.disabled = false;
    await renderGithubLink();
    // Signing in as a different account can change whether Admin belongs there.
    await refreshAdminAccess();
  }
}

async function unlinkGithub() {
  const sure = await askConfirm({
    title: 'Unlink GitHub?',
    detail: 'This app will forget the sign-in. Packs you have already published stay exactly '
      + 'where they are on your account. Nothing is taken down.\n\n'
      + 'You will be asked to sign in again the next time you publish.',
    buttons: ['Unlink', 'Cancel'],
    mark: '#',
  });
  if (sure !== 0) return;

  await window.api.mods.signOut();
  toast('GitHub unlinked.', 'ok');
  await renderGithubLink();
  await refreshAdminAccess();
  if (state.tab === 'admin') switchTab('home');
}

/**
 * The steps publishing goes through, and where each one sits on the bar.
 *
 * Uploading gets the whole middle because it is the only step that takes real
 * time; the rest are single API calls that pass in under a second. Giving them
 * equal shares would make the bar leap to two thirds and then appear to hang.
 */
const PUBLISH_STEPS = {
  checking: { at: 4, span: 4, say: 'Checking your account' },
  preparing: { at: 8, span: 8, say: 'Preparing your pack repository' },
  release: { at: 16, span: 8, say: 'Making the release' },
  uploading: { at: 24, span: 64, say: 'Uploading the pack' },
  submitting: { at: 88, span: 10, say: 'Offering it to the directory' },
  done: { at: 100, span: 0, say: 'Finished' },
};

/** Drives the shared progress bar from a publish stage. */
function showPublishProgress({ stage, percent, sent, bytes }, updating = false) {
  const step = PUBLISH_STEPS[stage];
  if (!step) return;
  // Same steps either way; only the wording differs, and only where it would
  // otherwise say something untrue.
  const say = updating && stage === 'submitting' ? 'Sending the update' : step.say;

  // Within a step, byte progress moves the bar across that step's own span
  // rather than the whole width, so the number never goes backwards when the
  // next stage starts.
  const within = percent != null ? (percent / 100) * step.span : 0;
  const total = Math.min(100, step.at + within);

  const detail = stage === 'uploading' && bytes
    ? `${formatBytes(sent || 0)} of ${formatBytes(bytes)}`
    : '';

  showProgress(true, `${say}…`, detail);
  el.progressName.textContent = '';
  el.progressQueue.textContent = '';
  // Publishing cannot be interrupted halfway without leaving a half-made
  // release behind, so the export bar's Skip and Cancel are not offered here.
  el.btnProgressCancel.hidden = true;
  el.btnProgressCancelAll.hidden = true;
  el.progressFill.style.width = `${total.toFixed(1)}%`;
}

/**
 * Uploads a packaged zip and offers it to the directory.
 *
 * Takes what `sharePack` already produced rather than repackaging, so the file
 * that gets published is the exact one whose checksum is in the record.
 */
/**
 * The id a pack will be published under.
 *
 * Kept in one place because publishing, updating and recognising an existing
 * listing all have to agree on it. Two copies of this rule that drift would
 * mean an update quietly becoming a second listing.
 */
function packIdFor(title) {
  return String(title).toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 64);
}

/**
 * The listing for this pack, if the signed-in account already published it.
 *
 * Only their own listing counts. A pack of the same name by somebody else is
 * not an update, and offering to "update" it would be offering something that
 * will be refused.
 */
async function alreadyPublished(pack, login) {
  if (!login) return null;
  const data = await loadDirectory();
  if (!data || !data.ok || !data.configured) return null;

  const mine = data.packs.filter((p) => (p.author || '').toLowerCase() === login.toLowerCase());
  const id = packIdFor(pack.title);

  // By id first, then by name. A pack listed under a name that was typed into
  // the publish form rather than taken from the folder has an id this cannot
  // guess, and missing it would turn every later update into a second listing.
  return mine.find((p) => p.id === id)
    || mine.find((p) => (p.title || '').toLowerCase() === String(pack.title).toLowerCase())
    || null;
}

async function publishPack(packaged, pack, already = null) {
  const updating = Boolean(already);

  // Asked again here as well as before packaging. Publishing is reachable from
  // more than one place, and this is the last point at which refusing costs
  // nobody an upload.
  if (!await requirePicture(pack)) return;

  const me = await ensureSignedIn();
  if (!me) return;

  // Said before anything is made, not after.
  //
  // Publishing creates a public repository on the author's own account and puts
  // the pack in a release on it. That is somebody's account being changed, and
  // finding a repository you did not know about is a bad way to learn how this
  // works. Asked once: after the repository exists there is nothing new to warn
  // about, and every later pack goes into the same one.
  if (!updating && !state.toldAboutRepo) {
    const ok = await askConfirm({
      title: 'This creates a repository on your GitHub',
      detail: `Publishing puts "${pack.title}" on your own GitHub account, under `
        + `github.com/${me.login}/choicer-voicer-packs.\n\n`
        + 'If that repository does not exist yet it is created now, as a public one, and '
        + 'every pack you publish afterwards goes into the same place rather than making '
        + 'another. The pack itself is attached to a release on it.\n\n'
        + 'It stays yours. You can delete it or take any pack down whenever you like, and '
        + 'this app cannot see your other repositories.',
      buttons: ['Create it and publish', 'Cancel'],
      mark: '#',
      cancelIndex: 1,
      // This one makes a public repository on somebody's own account. It is
      // the only thing the app does that changes something outside itself
      // without an obvious way back, so the way forward waits a few seconds
      // while the words are still on screen.
      holdFor: 5,
    });
    if (ok !== 0) return;
    state.toldAboutRepo = true;
  }

  // How the pack will read in the directory.
  //
  // Asked rather than filled in, because the defaults produce listings nobody
  // can tell apart: every pack summarised as "A voice pack", no tags, and a
  // licence of "unstated". That is a directory people scroll past.
  const details = await askListingDetails(pack, already);
  if (details === null) return;

  // An update keeps the id it was listed under. Deriving it from the name again
  // would mean that renaming a pack silently posts a second listing beside the
  // first rather than replacing it.
  const id = already ? already.id : packIdFor(details.title);

  // A name of nothing but punctuation or symbols leaves nothing to build an
  // address from. Caught before the upload rather than after it, where the only
  // way to say this would be a validation error about a field nobody typed.
  if (!id) {
    await askConfirm({
      title: 'That name will not work',
      detail: `"${details.title}" has no letters or numbers in it, and the address for a pack `
        + 'is built out of its name.\n\nAdd at least one letter or number and publish again.',
      buttons: ['Done'],
      mark: '✎',
    });
    return;
  }

  // Asked before the upload, because it belongs to the listing rather than to
  // the file, and because a question after several minutes of uploading is a
  // question nobody reads properly.
  const flags = await askChecklist({
    title: 'Does this pack contain any of these?',
    detail: 'Anything ticked is shown on the listing so people know what they are '
      + 'installing. Nothing here stops a pack being listed.\n\n'
      + 'Leave them all clear if none apply.',
    options: (state.info && state.info.contentFlags) || [],
    // An update starts from what the listing already says, so an author is not
    // silently answering this again from blank and dropping a warning they
    // meant to keep.
    ticked: (already && already.content) || [],
    buttons: [updating ? 'Update it' : 'Publish it', 'Cancel'],
    mark: '!',
  });
  if (flags === null) return;

  const stop = window.api.mods.onPublishProgress((p) => showPublishProgress(p, updating));
  showPublishProgress({ stage: 'checking' }, updating);

  let result;
  try {
    result = await window.api.mods.publish(packaged.zipPath, {
      id,
      type: pack.type,
      title: details.title,
      summary: details.summary,
      description: details.description,
      tags: details.tags,
      licence: details.licence,
      sha256: packaged.sha256,
      content: flags,
      // So the main process can check this pack was not somebody else's.
      packDir: pack.dir,
      // Checked against packDir on the other side before it is uploaded.
      iconPath: pack.iconPath,
    });
  } catch (err) {
    // A publish that throws rather than answering used to disappear entirely:
    // the bar came down and nothing was said, which reads as the button not
    // working. Whatever went wrong, it gets said.
    result = { ok: false, error: err.message || 'the upload stopped without saying why' };
  } finally {
    stop();
    showProgress(false);
    el.btnProgressCancel.hidden = false;
  }

  // Said in the dialog rather than a toast that slides away after four seconds.
  // Publishing takes minutes, it is usually left running, and "did that work"
  // is not a question anybody should have to answer by going to look on GitHub.
  if (!result || !result.ok) {
    await askConfirm({
      title: updating ? 'Not updated' : 'Not published',
      detail: `"${details.title}" was not ${updating ? 'updated' : 'published'}.\n\n`
        + `${(result && result.error) || 'The upload stopped without saying why.'}\n\n`
        + 'Nothing was changed on your GitHub account and nothing was sent to the directory. '
        + 'The zip is still in your exports folder, so nothing has been lost.',
      buttons: ['Done'],
      mark: '✕',
    });
    return;
  }

  // The directory has changed, so the copy held for this session is stale.
  directoryChanged();

  // Three different endings, and they are not interchangeable. Listed, uploaded
  // with nowhere to list it, and uploaded but the listing did not go through are
  // three different situations, and only the first one means somebody is done.
  const uploadedTo = `"${details.title}" is on your GitHub account and anyone with the `
    + 'address can install it.';

  const ending = result.submitted
    ? {
      title: updating ? 'Update sent' : 'Published',
      mark: '✓',
      detail: `"${details.title}" is on your GitHub account and has been `
        + `${updating ? 'offered as an update' : 'offered to the directory'}.\n\n`
        + (updating
          ? 'The listing keeps its place and its download count. Nothing else is needed from you.'
          : 'It appears in the Packs tab once its checks pass, usually within a few minutes. '
            + 'You can follow it in Your submissions. Nothing else is needed from you.'),
      go: 'See your submissions on GitHub',
    }
    : result.submitError
      ? {
        title: 'Uploaded, but not listed',
        mark: '!',
        detail: `${uploadedTo}\n\nOffering it to the directory did not go through:\n\n`
          + `${result.submitError}\n\n`
          + 'The upload is finished and does not need doing again. Publishing the pack a '
          + 'second time will offer it without uploading anything new.',
        go: 'See the release',
      }
      : {
        title: 'Uploaded',
        mark: '✓',
        detail: `${uploadedTo}\n\nThere is no pack directory set up yet, so it has not been `
          + 'listed anywhere. The address works regardless.',
        go: 'See the release',
      };

  const where = await askConfirm({
    title: ending.title,
    detail: ending.detail,
    buttons: [ending.go, 'Done'],
    mark: ending.mark,
    cancelIndex: 1,
  });

  if (where === 0) window.api.shell.openExternal(result.issueUrl || result.releaseUrl);
}

function renderContentTypes() {
  el.contentTypes.innerHTML = '';
  if (!state.content) return;

  for (const type of state.content.types) {
    const errors = type.packs.reduce((n, p) => n + p.counts.error, 0);
    const warnings = type.packs.reduce((n, p) => n + p.counts.warn, 0);

    // Errors outrank warnings on the same icon rather than both being shown.
    // Two numbers on a 46 pixel button is not a thing anybody reads, and a
    // type with an error in it is going to be opened regardless of what else
    // is in there. Warnings only get the badge when there is nothing worse.
    const badge = errors
      ? { count: errors, kind: 'error' }
      : warnings ? { count: warnings, kind: 'warn' } : null;

    const button = document.createElement('button');
    button.className = 'type-btn';
    button.dataset.type = type.id;
    button.title = errors
      ? `${type.label} — ${errors} need attention`
      : warnings
        ? `${type.label} — ${warnings} worth a look`
        : `${type.label} (${type.packs.length})`;
    button.setAttribute('aria-label', button.title);
    button.classList.toggle('on', type.id === state.contentType);
    // Pictures only, matching the Packs tab. The one number kept is the count of things
    // that need attention, because that is the only one worth interrupting
    // somebody for; how many host packs exist is not.
    button.innerHTML = `
      <span class="type-icon-wrap">${typeIcon(type.id)}</span>
      ${badge ? `<b class="badge badge-${badge.kind} type-badge">${badge.count}</b>` : ''}`;
    button.addEventListener('click', () => {
      state.contentType = type.id;
      state.contentPackId = null;
      el.contentDetail.hidden = true;
      renderContentTypes();
      renderContentGrid();
    });
    el.contentTypes.append(button);
  }
}

function currentContentType() {
  return state.content && state.content.types.find((t) => t.id === state.contentType);
}

/**
 * Narrows a list of packs by what was typed.
 *
 * Every word has to match something, so "jerma meat" finds the pack whether it
 * is remembered by title or by folder. Matching each word separately rather than
 * the phrase means the order they are typed in does not matter.
 */
function filterPacks(packs, query) {
  const words = String(query || '').toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return packs;

  return packs.filter((pack) => {
    const haystack = [
      pack.title, pack.name, pack.summary,
      ...(pack.authors || []),
    ].filter(Boolean).join(' ').toLowerCase();
    return words.every((word) => haystack.includes(word));
  });
}

function renderContentGrid() {
  const type = currentContentType();
  el.contentGrid.innerHTML = '';
  if (!type) return;

  el.contentTitle.textContent = type.label;
  const errors = type.packs.reduce((n, p) => n + p.counts.error, 0);
  const warnings = type.packs.reduce((n, p) => n + p.counts.warn, 0);
  el.contentSubtitle.textContent = type.packs.length
    ? `${type.packs.length} installed${errors ? `, ${errors} with problems` : ''}${warnings ? `, ${warnings} warnings` : ''}`
    : 'Nothing installed yet';

  if (!type.packs.length) {
    el.contentGrid.innerHTML = `
      <p class="muted pad">No ${escapeHtml(type.singular)}s yet. Drop a folder into
      <code>${escapeHtml(type.dir.split(/[\\/]/).pop())}</code>, or make one in the game's
      Customize menu, then press Rescan.</p>`;
    return;
  }

  // Matches the title, the folder name and the author, because a pack is as
  // likely to be remembered by who made it as by what it is called.
  const packs = filterPacks(type.packs, state.contentSearch);
  if (!packs.length) {
    el.contentGrid.innerHTML = `<p class="muted pad">Nothing here matches
      "${escapeHtml(state.contentSearch)}".</p>`;
    return;
  }
  if (packs.length !== type.packs.length) {
    el.contentSubtitle.textContent =
      `${packs.length} of ${type.packs.length} match "${state.contentSearch}"`;
  }

  for (const pack of packs) {
    const tile = document.createElement('button');
    tile.className = 'pack-tile';
    tile.classList.toggle('on', pack.id === state.contentPackId);

    // Types that put a character on screen fall back to the cardboard cutout
    // the game itself uses, so an empty pack looks the way it will in game
    // rather than showing a generic box.
    const icon = pack.iconUrl
      ? `<img class="tile-icon" src="${pack.iconUrl}" alt="" loading="lazy" />`
      : CHARACTER_TYPES.has(type.id)
        ? '<img class="tile-icon" src="../../assets/app/placeholder.png" alt="No picture yet" />'
        : `<div class="tile-icon tile-icon-blank">${typeIcon(type.id)}</div>`;

    const job = state.converting.get(pack.dir);
    const badge = job
      ? ''
      : pack.counts.error
        ? `<span class="badge badge-error">${pack.counts.error} problem${pack.counts.error > 1 ? 's' : ''}</span>`
        : pack.counts.warn
          ? `<span class="badge badge-warn">${pack.counts.warn} warning${pack.counts.warn > 1 ? 's' : ''}</span>`
          : '<span class="badge badge-ok">ok</span>';

    // A pack still converting shows its progress here rather than in a dialog.
    const status = job
      ? `<span class="tile-progress">
           <span class="tile-progress-bar"><i style="width:${(job.percent || 0).toFixed(0)}%"></i></span>
           <span class="muted small">${escapeHtml(job.label)}</span>
         </span>`
      : `<span class="muted small">${escapeHtml(pack.summary || '')}</span>`;

    // A pack mid-conversion has files half written, so opening it would show
    // a broken pack and editing it would race the converter.
    tile.classList.toggle('working', Boolean(job));
    tile.disabled = Boolean(job);
    if (job) tile.title = 'Still converting. This opens when it finishes.';
    tile.innerHTML = `
      ${icon}
      <span class="tile-body">
        <strong>${escapeHtml(pack.title)}</strong>
        ${status}
        <span class="tile-meta">${badge}</span>
      </span>`;

    tile.addEventListener('click', () => {
      if (state.converting.has(pack.dir)) return;
      state.contentPackId = pack.id;
      renderContentGrid();
      renderContentDetail(pack);
    });
    el.contentGrid.append(tile);
  }
}

function renderContentDetail(pack) {
  el.contentDetail.hidden = false;

  const icon = pack.iconUrl
    ? `<img src="${pack.iconUrl}" alt="" />`
    : CHARACTER_TYPES.has(pack.type)
      ? '<img src="../../assets/app/placeholder.png" alt="No picture yet" />'
      : '';
  const issues = (pack.issues || []).length
    ? `<div class="issue-list">${pack.issues.map((i) => `
        <div class="issue issue-${i.level}">${escapeHtml(i.message)}</div>`).join('')}</div>`
    : '<p class="muted small">Nothing wrong with this one.</p>';

  const rows = [
    ['Folder', pack.name],
    ['Kind', pack.kind],
    ['Files', String(pack.fileCount)],
    pack.subtitle && ['Subtitle', pack.subtitle],
    pack.authors && pack.authors.length && ['Authors', pack.authors.join(', ')],
    pack.characters && pack.characters.length && ['Characters', pack.characters.join(', ')],
  ].filter(Boolean);

  // A pack still being converted cannot be edited, so the panel says so rather
  // than offering a button that answers with a message about waiting.
  const converting = state.converting.get(pack.dir);
  const busyNote = converting
    ? `<div class="detail-busy"><span class="spinner spinner-small"></span>
         <span>${escapeHtml(converting.label || 'Converting…')} This pack cannot be edited until
         it finishes.</span></div>`
    : '';

  el.contentDetail.innerHTML = `
    <div class="detail-head">
      ${icon}
      <div>
        <h3>${escapeHtml(pack.title)}</h3>
        <p class="muted small">${escapeHtml(pack.summary || '')}</p>
      </div>
    </div>
    ${busyNote}
    <div class="detail-rows">
      ${rows.map(([k, v]) => `<div class="detail-row"><span>${escapeHtml(k)}</span><span>${escapeHtml(v)}</span></div>`).join('')}
    </div>
    <div>
      <h4 class="muted small">Checks</h4>
      ${issues}
    </div>

    <!-- Picture and word together. The picture alone made the row line up
         neatly at any width and left four unlabelled squares that had to be
         hovered to be told apart, which is a worse trade than an uneven row.
         Each button is sized by its own label and the row wraps between them,
         so nothing breaks inside a word. -->
    <div class="detail-actions detail-actions-icons">
      <button type="button" class="btn btn-primary icon-action" id="btn-detail-edit"
              ${converting ? 'disabled' : ''}
              title="Edit this pack">${actionIcon('edit')}<span>Edit</span></button>
      <button type="button" class="btn icon-action" id="btn-detail-share"
              ${converting ? 'disabled' : ''}
              title="${pack.iconPath || pack.iconUrl
    ? 'Package this pack, to publish to Packs or send to somebody'
    : 'This pack needs an icon first. Set one in Edit this pack, under Pack details.'
}">${actionIcon('export')}<span>Share</span></button>
      <button type="button" class="btn icon-action" id="btn-detail-open"
              title="Open this pack's folder">${actionIcon('folder')}<span>Open folder</span></button>
      <button type="button" class="btn btn-danger icon-action" id="btn-detail-delete"
              ${converting ? 'disabled' : ''}
              title="Delete this pack">${actionIcon('delete')}<span>Delete</span></button>
    </div>`;

  el.contentDetail.querySelector('#btn-detail-edit')
    .addEventListener('click', () => openEditorFor(pack));

  el.contentDetail.querySelector('#btn-detail-share')
    .addEventListener('click', () => sharePack(pack));

  el.contentDetail.querySelector('#btn-detail-open')
    .addEventListener('click', () => window.api.shell.openPath(pack.dir));

  el.contentDetail.querySelector('#btn-detail-delete')
    .addEventListener('click', () => removePack(pack));
}

/**
 * Opens the full screen editor for a pack. The content view stays in the DOM
 * behind it so closing the editor puts you back where you were.
 */
async function openEditorFor(pack) {
  // Belt and braces with the tile being disabled: the detail panel can still
  // be open for a pack that started converting after it was selected.
  if (state.converting.has(pack.dir)) {
    toast('That pack is still converting. Give it a moment.', 'warn', 5000);
    return;
  }
  el.contentView.hidden = true;

  // The pack's own video is Ogg Theora, which Chromium cannot decode, so the
  // editor shows the same cached MP4 proxy the preview uses. Clips are still
  // cut from the original file.
  if (pack.type === 'voice' && pack.videoPath && !pack.videoUrl) {
    showPrep(true, pack.title);
    state.loadingVideoPath = pack.videoPath;
    try {
      const proxy = await window.api.media.proxy(pack.videoPath);
      if (proxy.ok) pack.videoUrl = proxy.url;
      else toast(`Could not prepare the video: ${proxy.error}`, 'error', 8000);
    } finally {
      state.loadingVideoPath = null;
      showPrep(false);
    }
  }

  // Fetched per pack rather than for the whole library: clip lengths cost an
  // ffprobe each and the file list costs a stat each, so doing them up front
  // made opening the app unusable once someone had a lot of packs.
  await hydratePack(pack);

  // The editor reads the caption toggle and the character colours from here,
  // so they match what the export draws.
  editor.settings = state.settings;
  editor.open(pack);

  editor.onClose = async () => {
    el.contentView.hidden = state.tab !== 'content';
    // Whatever was done in there has to be reflected behind it, or the tile
    // and the detail panel still describe the pack as it was on the way in.
    await refreshContent();
  };

  // Re-scan after a change so the editor sees its own edits.
  editor.onChanged = async (packId, options = {}) => {
    await refreshContent();
    const fresh = state.content
      && state.content.types.flatMap((t) => t.packs).find((p) => p.id === packId);
    if (!fresh) return;

    // A rescan hands back the cheap shape, so the per pack extras have to be
    // filled in again or the editor loses its file list mid edit.
    if (options.keepEditor) {
      await hydratePack(fresh);
      editor.pack = fresh;
      // One repaint covering everything on screen, rather than each action
      // remembering to refresh its own corner and some of them not.
      editor.refreshAfterChange();
    } else {
      // Awaited, so that a change which reopens the editor has actually finished
      // reopening it by the time it says so. Reopening rebuilds the preview from
      // a fresh transcode, so without this whatever ran the change carried on
      // against the editor as it was on the way in.
      await openEditorFor(fresh);
    }
  };
}

/**
 * Fills in the parts of a pack the scan deliberately leaves out.
 *
 * The scan stays cheap so the library list is fast no matter how many packs
 * there are. Everything expensive and per pack happens here, once, when a pack
 * is actually opened.
 */
async function hydratePack(pack) {
  const jobs = [];

  if (!pack.fileNames) {
    jobs.push(window.api.content.packFiles(pack.dir).then((r) => {
      if (!r.ok) return;
      pack.fileNames = r.fileNames;
      pack.fileUrls = r.fileUrls;
    }));
  }

  // Only dub packs draw a timeline, so only they need lengths.
  if (pack.clips && pack.clips.length && pack.clips.some((c) => c.duration == null)) {
    jobs.push(window.api.content.clipDurations(pack.dir).then((r) => {
      if (!r.ok) return;
      for (const clip of pack.clips) {
        clip.duration = (clip.audio && r.durations[clip.audio]) || 0;
      }
    }));
  }

  await Promise.all(jobs);
}

/** Installs dropped pack folders, refusing anything that is not one. */
async function installPacks(paths) {
  toast(`Installing ${paths.length} folder${paths.length > 1 ? 's' : ''}…`);
  const result = await window.api.content.install(paths);

  if (!result.ok) {
    toast(`Could not install: ${result.error}`, 'error', 8000);
    return;
  }

  for (const bad of result.rejected) {
    toast(bad.error, 'warn', 9000);
  }
  if (result.installed.length) {
    const names = result.installed.map((i) => i.name).join(', ');
    toast(`Installed ${names}.`, 'ok', 7000);
    await refreshContent();
    await rescan(state.settings.gameDir);
    // Land on the type it went into, so the new pack is visible.
    state.contentType = result.installed[0].type;
    renderContentTypes();
    renderContentGrid();
  }
}

async function removePack(pack) {
  // Recorded sessions live outside the pack, so removing the folder leaves them
  // behind with nothing pointing at them. Offered as a choice, because a take
  // somebody still wants to export is worth keeping even once the pack is gone.
  let sessions = [];
  const found = await window.api.content.packSessions(pack.dir);
  if (found && found.ok) sessions = found.sessions;

  const takes = sessions.reduce((sum, s) => sum + s.takes, 0);
  const buttons = sessions.length
    ? ['Delete the pack and its recordings', 'Delete the pack only', 'Keep it']
    : ['Delete it', 'Keep it'];

  const answer = await askConfirm({
    title: `Delete "${pack.title}"?`,
    detail: `The whole folder and everything in it is removed from ${pack.dir}. `
      + 'This one cannot be undone.'
      + (sessions.length
        ? `\n\nThere ${sessions.length === 1 ? 'is 1 recorded session' : `are ${sessions.length} recorded sessions`} `
          + `of this pack, holding ${takes} take${takes === 1 ? '' : 's'}. `
          + 'Keeping them leaves the recordings where they are, listed under recordings with no pack.'
        : ''),
    buttons,
    mark: '!',
    danger: true,
  });

  const cancelled = sessions.length ? answer !== 0 && answer !== 1 : answer !== 0;
  if (cancelled) return;
  const alsoSessions = sessions.length > 0 && answer === 0;

  const result = await window.api.content.remove(pack.dir);
  if (result.cancelled) return;
  if (!result.ok) {
    toast(`Could not delete it: ${result.error}`, 'error', 8000);
    return;
  }

  let alsoRemoved = 0;
  if (alsoSessions) {
    const gone = await window.api.content.deleteSessions(pack.name || pack.title);
    if (gone && gone.ok) alsoRemoved = gone.removed || 0;
    else if (gone && gone.error) toast(`The pack went, but its recordings did not: ${gone.error}`, 'warn', 8000);
  }

  toast(alsoRemoved
    ? `Deleted "${pack.title}" and ${alsoRemoved} session${alsoRemoved === 1 ? '' : 's'}.`
    : `Deleted "${pack.title}".`, 'ok');
  state.contentPackId = null;
  el.contentDetail.hidden = true;
  await refreshContent();
  await rescan(state.settings.gameDir);
}

// Creating packs

/**
 * What each type is, in plain terms, plus the extra fields and the media it
 * expects. `accepts` drives the file picker and the wording on the drop zone.
 */
const CREATE_TYPES = [
  {
    id: 'voice', label: 'Dub or voice pack',
    blurb: 'Clips to dub over. Add a video and cut it up in the editor.',
    accepts: 'video',
    // Name and a video is all it takes; captions, clips and pictures are all
    // made in the editor afterwards.
    dropHint: 'Drop the video. Any format works, it is converted to .ogv for you.',
    fields: [],
    opensEditor: true,
  },
  {
    id: 'player', label: 'Player',
    blurb: 'A character who plays the game, with reaction sounds.',
    accepts: 'all',
    dropHint: 'Drop a picture (becomes player.png) and any reaction sounds.',
    fields: [
      { key: 'introduction', label: 'How the host introduces them', placeholder: 'Our next contestant:' },
      { key: 'color1', label: 'Main colour', type: 'color', value: '#accbd1' },
      { key: 'color2', label: 'Second colour', type: 'color', value: '#ffffff' },
    ],
  },
  {
    id: 'host', label: 'Host',
    blurb: 'Presents the show. Starts with a full script you can rewrite.',
    accepts: 'image',
    dropHint: 'Drop a picture for the host. It becomes host.png.',
    fields: [],
  },
  {
    id: 'judges', label: 'Judge panel',
    blurb: 'Five judges who score each round.',
    accepts: 'all',
    dropHint: 'Drop five pictures, plus voices and score blips if you have them.',
    fields: [],
  },
  {
    id: 'studio', label: 'Studio',
    blurb: 'The set the show is filmed on.',
    accepts: 'all',
    dropHint: 'Drop music, a screen video, or a .glb model.',
    fields: [],
  },
  {
    id: 'menu', label: 'Menu theme',
    blurb: 'Background, music and button sounds for the menus.',
    accepts: 'all',
    dropHint: 'Drop a background image, music, and button sounds.',
    fields: [],
  },
  {
    id: 'chatter', label: 'Chatter pack',
    blurb: 'Crowd sounds triggered by keywords in Twitch chat.',
    accepts: 'audio',
    dropHint: 'Drop sounds. They are converted to .ogg, which chatter packs need.',
    fields: [],
  },
];

const createState = { type: null, files: [] };

function openCreateDialog(typeId) {
  createState.type = null;
  createState.files = [];
  el.createTypes.hidden = false;
  el.createForm.hidden = true;
  el.btnCreateGo.hidden = true;
  el.btnCreateBack.hidden = true;
  el.createTitle.textContent = 'Create something new';
  el.createHint.textContent = 'Pick what you want to make.';

  el.createTypes.innerHTML = '';
  for (const type of CREATE_TYPES) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'create-type';
    button.innerHTML = `
      <span class="type-icon-wrap">${typeIcon(type.id)}</span>
      <span><b>${escapeHtml(type.label)}</b><em>${escapeHtml(type.blurb)}</em></span>`;
    button.addEventListener('click', () => chooseCreateType(type));
    el.createTypes.append(button);
  }

  if (!el.createDialog.open) el.createDialog.showModal();
  if (typeId) {
    const preset = CREATE_TYPES.find((t) => t.id === typeId);
    if (preset) chooseCreateType(preset);
  }
}

function chooseCreateType(type) {
  createState.type = type;
  createState.files = [];

  el.createTypes.hidden = true;
  el.createForm.hidden = false;
  el.btnCreateGo.hidden = false;
  el.btnCreateBack.hidden = false;
  el.createTitle.textContent = `New ${type.label.toLowerCase()}`;
  el.createHint.textContent = type.blurb;
  el.createDropHint.textContent = type.dropHint;
  el.createName.value = '';
  el.createName.placeholder = type.id === 'player' ? 'Their name' : 'My pack';

  el.createExtra.innerHTML = type.fields.map((f) => `
    <label class="field">
      <span>${escapeHtml(f.label)}</span>
      ${f.type === 'color'
    ? `<input class="color" type="color" data-field="${f.key}" value="${f.value}" />`
    : `<input class="input" type="text" data-field="${f.key}" placeholder="${escapeHtml(f.placeholder || '')}" />`}
    </label>`).join('');

  renderCreateFiles();
  el.createName.focus();
}

async function addCreateFiles(paths) {
  if (!paths || !paths.length) return;
  const described = await window.api.content.describe(paths);

  for (const file of described) {
    if (!file.kind) {
      toast(`${file.name || 'That file'} is not audio, video or an image.`, 'warn');
      continue;
    }
    if (createState.files.some((f) => f.path === file.path)) continue;

    // A pack has exactly one video, and it is always called dub_video, so a
    // second one would only overwrite the first. Replacing is what someone
    // adding another video means, so that is what happens.
    if (file.kind === 'video') {
      const existing = createState.files.find((f) => f.kind === 'video');
      if (existing) {
        createState.files = createState.files.filter((f) => f !== existing);
        toast(`A pack has one video, so ${file.name} replaced ${existing.name}.`, 'info', 6000);
      }
    }
    createState.files.push(file);
  }
  renderCreateFiles();
}

function renderCreateFiles() {
  el.createFiles.innerHTML = '';

  if (!createState.files.length) {
    el.createFiles.innerHTML = '<p class="muted small">Nothing added yet.</p>';
    return;
  }

  for (const file of createState.files) {
    const row = document.createElement('div');
    row.className = 'create-file';

    const tag = file.acceptable
      ? '<span class="badge badge-ok tag">ready</span>'
      : '<span class="badge badge-warn tag">will convert</span>';
    const kind = file.kind === 'video' ? 'video' : file.kind === 'audio' ? 'sound' : 'picture';

    row.innerHTML = `
      <span class="name" title="${escapeHtml(file.path)}">${escapeHtml(file.name)}</span>
      <span class="muted small">${kind}</span>
      ${tag}
      <button type="button" class="icon-btn danger" title="Take this one out">✕</button>`;

    row.querySelector('button').addEventListener('click', () => {
      createState.files = createState.files.filter((f) => f !== file);
      renderCreateFiles();
    });

    el.createFiles.append(row);
  }
}

async function runCreate() {
  const type = createState.type;
  if (!type) return;

  const name = el.createName.value.trim();
  if (!name) {
    toast('Give it a name first.', 'warn');
    el.createName.focus();
    return;
  }

  const options = { name, title: name };
  for (const input of el.createExtra.querySelectorAll('[data-field]')) {
    options[input.dataset.field] = input.value;
  }
  if (options.authorsText) {
    options.authors = options.authorsText.split(',').map((s) => s.trim()).filter(Boolean);
  }
  if (type.id === 'voice') {
    options.isDub = createState.files.some((f) => f.kind === 'video');
  }

  const created = await window.api.content.create(type.id, options);
  if (!created.ok) {
    toast(`Could not create it: ${created.error}`, 'error', 8000);
    return;
  }

  // The folder exists now, so show it straight away and close the dialog. The
  // files convert in the background with a bar on the tile, which leaves you
  // free to queue up another one instead of watching a spinner.
  const files = [...createState.files];
  el.createDialog.close();

  state.contentType = type.id;
  await switchTab('content');
  await refreshContent();

  if (!files.length) {
    toast(`Made "${created.name}".`, 'ok', 6000);
    return;
  }

  convertIntoNewPack(created, type, files);
}

/**
 * Converts a new pack's files in the background, showing progress on its tile
 * rather than blocking the dialog.
 */
async function convertIntoNewPack(created, type, files) {
  state.converting.set(created.dir, { percent: 0, label: 'Converting…', name: created.name });
  renderContentGrid();

  let failed = 0;
  let broke = null;
  try {
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const target = importTargetName(type.id, file, files);
      const job = state.converting.get(created.dir);
      if (job) job.label = files.length > 1 ? `Converting ${i + 1} of ${files.length}…` : 'Converting…';

      const result = await window.api.content.import(created.dir, [file.path], {
        baseName: target.base,
        kind: file.kind,
        audioFormat: target.audioFormat,
        maxSeconds: target.maxSeconds,
      });
      if (!result.ok || result.results.some((r) => !r.ok)) failed++;
    }
  } catch (err) {
    broke = err;
  } finally {
    // Always, even if a conversion threw. Without this the pack stayed marked
    // as converting for the rest of the session: the editor refused to open it,
    // its tile could not be clicked, and nothing on screen said why.
    state.converting.delete(created.dir);
  }

  await refreshContent();

  if (broke) toast(`"${created.name}" stopped converting: ${broke.message}`, 'error', 9000);
  else if (failed) toast(`"${created.name}" is ready, but ${failed} file(s) failed.`, 'warn', 9000);
  else toast(`"${created.name}" is ready. Open it and press Edit.`, 'ok', 8000);
}

/**
 * Works out what an imported file should be called inside the pack. Some names
 * are fixed by the game (dub_video, player.png, host.png); everything else
 * keeps its own name.
 */
function importTargetName(typeId, file, all) {
  if (file.kind === 'video') {
    if (typeId === 'voice') return { base: 'dub_video' };
    if (typeId === 'studio') return { base: 'screen' };
  }
  if (file.kind === 'image') {
    if (typeId === 'player') return { base: 'player' };
    if (typeId === 'host') return { base: 'host' };
    if (typeId === 'menu') return { base: 'Background' };
    if (typeId === 'judges') {
      // judge1..judge5, in the order they were added.
      const images = all.filter((f) => f.kind === 'image');
      const index = images.indexOf(file);
      if (index >= 0 && index < 5) return { base: `judge${index + 1}` };
    }
  }
  if (file.kind === 'audio') {
    if (typeId === 'chatter') return { base: baseName(file.name), audioFormat: 'ogg' };
    if (typeId === 'studio') return { base: 'music_studio' };
    if (typeId === 'menu') return { base: 'music_menu' };
    // Dub clips are capped at six seconds by the game.
    if (typeId === 'voice') return { base: baseName(file.name), audioFormat: 'wav', maxSeconds: 6 };
    return { base: baseName(file.name), audioFormat: 'wav' };
  }
  return { base: baseName(file.name) };
}

const baseName = (name) => String(name).replace(/\.[^.]+$/, '');

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
    'Donate',
    () => {
      window.api.shell.openExternalConfirmed(url, 'the donation page');
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
  setTimeout(() => {
    el.splash.hidden = true;
    // Held back until now: a modal draws in the top layer, so opening it during
    // the splash would put it in front of the logo.
    renderSetup();
  }, 500);
}

// Boot

async function boot() {
  // First, so that anything failing during start up is visible rather than
  // leaving a half drawn window with no explanation.
  watchForUnhandled();

  state.info = await window.api.appInfo();
  state.settings = await window.api.settings.get();

  // Theme first, so the splash and shell paint in the right palette.
  applyTheme(state.settings.theme || 'system');
  el.aboutVersion.textContent = state.info.version;
  el.versionNumber.textContent = state.info.version;

  const wantSplash = state.settings.showSplash !== false;
  const splashUntil = Date.now() + SPLASH_MIN_MS;
  if (!wantSplash) { el.splash.hidden = true; }

  renderFfmpegStatus();
  applyExportDefaults();
  applyCaptionStyle();
  // Only a folder the user actually chose. Reaching into %APPDATA% on a first
  // run and helping itself to whatever it found there is the kind of thing
  // that makes an unsigned app look like something you did not install on
  // purpose, and it left people with no idea where the app was even pointing.
  // The detected path is offered as a suggestion in the setup panel instead.
  await rescan(state.settings.gameDir || null);
  wireEvents();
  await switchTab('home');
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
    el.versionBadge.title = `Version ${result.current}, up to date. Click for help and credits.`;
    return;
  }

  state.update = result;
  el.aboutUpdate.innerHTML = ` <b>${escapeHtml(result.latest)} available</b>`;

  // The alert bar can be dismissed, and once it is there was nothing left to
  // say an update existed. The version badge is always on screen, so it
  // carries the notice from here on.
  el.versionBadge.classList.add('update');
  el.versionNumber.textContent = `${result.current} → ${result.latest}`;
  el.versionBadge.title = `Version ${result.latest} is available. You have ${result.current}. `
    + 'Click to go to the download page.';

  showAlert(
    `Version ${result.latest} is out. You have ${result.current}.`,
    'Get it',
    () => openUpdatePage()
  );
}

/** Sends you to the release the update check found. */
function openUpdatePage() {
  const update = state.update;
  if (!update) { el.aboutDialog.showModal(); return; }
  window.api.shell.openExternalConfirmed(update.url, `version ${update.latest} on GitHub`);
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

    // These two are guidance for the Export workflow specifically: go find or
    // choose a game folder, go record a dub. They used to fire from Content
    // actions too, since installing a pack, deleting one, or just clicking
    // Rescan while browsing the library all run through here, and the same
    // alert kept nagging about dub recordings while someone was in the middle
    // of building an unrelated pack, or inside the pack editor.
    if (state.tab === 'content') {
      if (state.dubAlertActive) { hideAlert(); state.dubAlertActive = false; }
    } else if (!state.model.packs.length) {
      state.dubAlertActive = true;
      showAlert('No voice packs found in that folder.', 'Choose folder', pickGameDir);
    } else if (!withRecordings.length) {
      state.dubAlertActive = true;
      showAlert(
        'Packs found, but you have not recorded any dubs yet. Record one in the game first.',
        'How it works',
        () => openHelpTab('start')
      );
    } else if (state.info.ffmpeg.ok) {
      state.dubAlertActive = false;
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
      : `<div class="pack-icon pack-icon-blank">${typeIcon('voice')}</div>`;

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
  return escapeForHtml(text);
}

// The What's New tab

/** Opens the help dialog with one particular tab selected. */
function openHelpTab(which) {
  const tab = document.querySelector(`.help-tabs [data-help="${which}"]`);
  if (tab) tab.click();
  if (!el.aboutDialog.open) el.aboutDialog.showModal();
}

/**
 * Shows the changelog, fetched once and kept.
 *
 * The list lives in CHANGELOG.md and is read from there rather than written out
 * again here, so the repository and the app cannot end up disagreeing about what
 * a release changed.
 */
async function loadChangelog() {
  const box = el.changelogBody;
  if (!box || box.dataset.loaded === 'yes') return;

  const result = await window.api.changelog();
  if (!result.ok) {
    box.innerHTML = '<p class="muted small">The list of changes could not be read. '
      + 'It is on the releases page on GitHub.</p>';
    return;
  }

  const releases = parseChangelog(result.text);
  if (!releases.length) {
    box.innerHTML = '<p class="muted small">No changes are listed yet.</p>';
    return;
  }

  const running = (state.info && state.info.version) || '';

  // A row of versions across the top, one shown at a time. Without it a long
  // enough changelog is one continuous scroll and it stops being obvious which
  // version any given line belongs to.
  const bar = releases.map((r, i) => {
    const isRunning = r.version === running;
    return `<button type="button" class="changelog-pill${i === 0 ? ' on' : ''}"
      data-version="${escapeHtml(r.version)}"
      title="${isRunning ? 'The installed version' : `What changed in ${escapeHtml(r.version)}`}"
      >${escapeHtml(r.version)}${isRunning ? '<i class="changelog-dot"></i>' : ''}</button>`;
  }).join('');

  const panels = releases.map((r, i) => `
    <div class="changelog-entry" data-version="${escapeHtml(r.version)}" ${i === 0 ? '' : 'hidden'}>
      <div class="changelog-heading">
        <h3>${escapeHtml(r.version)}</h3>
        ${r.version === running
    ? '<span class="changelog-tag">Installed</span>'
    : ''}
      </div>
      ${r.html}
    </div>`).join('');

  box.innerHTML = `<div class="changelog-bar" role="tablist">${bar}</div>${panels}`;

  for (const pill of box.querySelectorAll('.changelog-pill')) {
    pill.addEventListener('click', () => {
      for (const other of box.querySelectorAll('.changelog-pill')) {
        other.classList.toggle('on', other === pill);
      }
      for (const entry of box.querySelectorAll('.changelog-entry')) {
        entry.hidden = entry.dataset.version !== pill.dataset.version;
      }
    });
  }

  box.dataset.loaded = 'yes';
}

/**
 * Splits the changelog into one entry per version.
 *
 * `## <version>` starts a release; everything until the next one belongs to it.
 * Anything before the first release heading is the file's own title and is
 * dropped.
 */
function parseChangelog(text) {
  const releases = [];
  let current = null;

  for (const line of text.split(/\r?\n/)) {
    const heading = line.match(/^##\s+(?!#)(.+?)\s*$/);
    if (heading) {
      current = { version: heading[1], lines: [] };
      releases.push(current);
      continue;
    }
    if (current) current.lines.push(line);
  }

  return releases.map((r) => ({ version: r.version, html: renderChangelog(r.lines.join('\n')) }));
}

/**
 * Turns the changelog's markdown into the small subset of it this needs.
 *
 * Everything is escaped before any tag is added, so the only markup in the
 * result is the markup made here. A general markdown library would be a lot of
 * weight for six kinds of line.
 */
function renderChangelog(text) {
  const inline = (raw) => escapeHtml(raw)
    .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
    .replace(/(^|\s)\*([^*]+)\*/g, '$1<em>$2</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>');

  const out = [];
  let list = null;      // open <ul>, or null
  let indented = false; // inside an indented code block

  const closeList = () => {
    if (list) { out.push('</ul>'); list = null; }
  };

  for (const line of text.split(/\r?\n/)) {
    // An indented block is a path or a command, kept as written.
    if (/^ {4}\S/.test(line)) {
      closeList();
      if (!indented) { out.push('<pre class="changelog-pre">'); indented = true; }
      out.push(escapeHtml(line.slice(4)));
      continue;
    }
    if (indented && !line.trim()) continue;
    if (indented) { out.push('</pre>'); indented = false; }

    if (!line.trim()) { closeList(); continue; }

    // Version headings are handled by parseChangelog, which uses them to split
    // the file up, so anything left at that level is the file's own title.
    if (/^#{1,2}\s/.test(line)) continue;

    if (/^###\s/.test(line)) {
      closeList();
      out.push(`<h4>${inline(line.replace(/^###\s+/, ''))}</h4>`);
      continue;
    }
    // Nested bullets are flattened; the nesting only groups detail under a point
    // and reads the same as a plain list here.
    if (/^\s*-\s/.test(line)) {
      if (!list) { out.push('<ul class="changelog-list">'); list = true; }
      out.push(`<li>${inline(line.replace(/^\s*-\s+/, ''))}</li>`);
      continue;
    }

    // A continuation of the previous bullet, which markdown wraps by indenting.
    if (list && /^\s+\S/.test(line)) {
      const item = out.pop();
      out.push(`${item.slice(0, -5)} ${inline(line.trim())}</li>`);
      continue;
    }

    closeList();
    out.push(`<p>${inline(line.trim())}</p>`);
  }

  closeList();
  if (indented) out.push('</pre>');
  return out.join('\n');
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

  renderSessionOptions();
  await loadSession(pack.sessions[0] || null);
}

/**
 * Fills the session picker, keeping whichever one is already chosen.
 *
 * Rebuilt rather than patched because the labels carry the new mark, which
 * changes the moment a session is played.
 */
function renderSessionOptions() {
  const pack = state.pack;
  const chosen = el.sessionSelect.value;
  el.sessionSelect.innerHTML = '';

  if (!pack || !pack.sessions.length) {
    const opt = document.createElement('option');
    opt.textContent = 'No recordings, original audio only';
    opt.value = '';
    el.sessionSelect.append(opt);
    el.btnSessionDelete.disabled = true;
    return;
  }

  for (const session of pack.sessions) {
    const opt = document.createElement('option');
    opt.value = session.id;
    opt.textContent = friendlySessionName(session);
    el.sessionSelect.append(opt);
  }
  // Only put back a choice this pack actually has.
  //
  // Setting a select to a value none of its options carry leaves it showing
  // nothing at all, and the value it was being handed came from whichever pack
  // was open before. Switching packs therefore emptied the box every time,
  // while a session was in fact loaded and playing.
  if (chosen && pack.sessions.some((s) => s.id === chosen)) {
    el.sessionSelect.value = chosen;
  }
  el.btnSessionDelete.disabled = false;
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
/**
 * Where one session's adjustments are filed.
 *
 * Pack and session together, because the same pack recorded twice is two
 * different performances: takes that need lifting in one are not the takes in
 * the other, and timing nudged to fit one recording is wrong for the next.
 */
function mixKeyFor(pack, session) {
  if (!pack) return null;
  return `${pack.id}::${session ? session.id : 'none'}`;
}

/**
 * Saves the work done on a session: which take each line uses, how loud it is,
 * how far its timing was nudged, and the music and dub balance.
 *
 * Kept because it is work. Levelling thirty lines and nudging half of them into
 * place is an evening, and until now all of it was in memory: closing the app,
 * or just clicking another pack to check something, threw the lot away with no
 * warning and no way back.
 *
 * Written whole rather than patched, and only the values that differ from what
 * a fresh load would produce. A file of thirty lines all saying "normal volume,
 * no offset" is a file recording that nothing happened.
 */
function saveAdjustments() {
  const key = mixKeyFor(state.pack, state.session);
  if (!key || !player.items.length) return;

  const lines = {};
  for (const item of player.items) {
    const fresh = item.takeUrl ? 'take' : (item.originalUrl ? 'original' : 'none');
    const changed = item.source !== fresh
      || item.volume !== 1
      || item.offset !== 0
      || item.muted;
    if (!changed) continue;

    lines[item.id] = {
      source: item.source,
      volume: item.volume,
      offset: item.offset,
      muted: item.muted,
    };
  }

  const mix = {
    backing: Number(el.volBacking.value) / 100,
    dub: Number(el.volDub.value) / 100,
    lines,
  };

  const nothingToSay = !Object.keys(lines).length && mix.backing === 1 && mix.dub === 1;
  const saved = { ...(state.settings.mixes || {}) };
  if (nothingToSay) delete saved[key];
  else saved[key] = mix;

  // Fire and forget. Losing one write because the app closed mid-save costs a
  // slider position, and making every nudge wait on the disk would make the
  // sliders feel stuck.
  state.settings.mixes = saved;
  window.api.settings.set({ mixes: saved }).catch(() => { /* next change retries */ });
}

/** Puts back whatever was saved for this pack and session. */
function restoreAdjustments(pack, session) {
  const key = mixKeyFor(pack, session);
  const mix = key && state.settings.mixes && state.settings.mixes[key];
  if (!mix) return;

  // The slider and its number box mirror each other, so both are set. Leaving
  // the box behind makes it look as though the value can be typed and ignored.
  if (Number.isFinite(mix.backing)) {
    el.volBacking.value = Math.round(mix.backing * 100);
    el.volBackingVal.value = el.volBacking.value;
  }
  if (Number.isFinite(mix.dub)) {
    el.volDub.value = Math.round(mix.dub * 100);
    el.volDubVal.value = el.volDub.value;
  }
  renderMixReadout();

  for (const item of player.items) {
    const saved = mix.lines && mix.lines[item.id];
    if (!saved) continue;

    // A line whose recording has since been deleted cannot be set back to it,
    // so the saved choice is only honoured where it is still possible.
    if (saved.source === 'take' && !item.takeUrl) continue;
    if (saved.source === 'original' && !item.originalUrl) continue;

    if (saved.source) item.source = saved.source;
    if (Number.isFinite(saved.volume)) item.volume = saved.volume;
    if (Number.isFinite(saved.offset)) item.offset = saved.offset;
    item.muted = Boolean(saved.muted);
  }
}

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

  // Whatever was set last time on this pack and session, put back.
  restoreAdjustments(pack, session);

  player.setBackingVolume(Number(el.volBacking.value) / 100);
  player.setDubVolume(Number(el.volDub.value) / 100);
  // The pack's lines only exist now, so this is the first point the per
  // character volumes have anything to apply to.
  applyCharacterVolumes();

  renderLines();
  renderMarkers();
  renderCharacterVolumeNote();

  // Only the load that actually finished may re-enable exporting.
  setLoadingState(false);
}

function showLoading(visible, text) {
  el.loadingOverlay.hidden = !visible;
  if (text) el.loadingText.textContent = text;

  // The video underneath is still a live element with the previous pack's
  // proxy in it. Without this, Space or a click on it played the old pack
  // behind the overlay while the new one was still being prepared.
  if (visible) {
    el.video.pause();
    el.video.controls = false;
  }
  el.videoWrap.classList.toggle('busy', visible);


}

/**
 * Asks a question in the app's own voice and waits for an answer.
 *
 * This used to go through the operating system's message box, which plays the
 * Windows alert chime. That sound belongs to something having gone wrong, and
 * hearing it because the app wanted to confirm a backing track was alarming
 * out of all proportion to the question.
 *
 * Resolves with the index of the button pressed, or -1 for a cancel.
 */
/**
 * Whether a `close` event belongs to a dialog that has already gone.
 *
 * Every one of these helpers shares a single `<dialog>`, and closing it is not
 * as immediate as it looks: `close()` queues the `close` event as a task, while
 * the promise it resolves continues on a microtask. Microtasks run first. So
 * when one dialog leads straight into another, the order is:
 *
 *   1. button pressed, `close()` queues the close event, promise resolves
 *   2. microtasks drain, the caller opens the next dialog, which registers its
 *      own close listener
 *   3. the close event from step 1 finally fires, and lands on that listener
 *
 * The second dialog then dismisses itself the instant it appears, answering
 * with a decline nobody made. Publishing a pack with no picture did exactly
 * this: the warning opened and vanished within the same frame, so pressing
 * Publish looked like it did nothing at all.
 *
 * A stale event is easy to recognise. If the dialog is open right now, whatever
 * closed is not the thing that is on screen, so the event is not ours.
 */
function staleClose(dialog = el.confirmDialog) {
  return dialog.open;
}

function askConfirm({
  title, detail, buttons, mark = '?', danger = false, cancelIndex = -1, code = null,
  // Seconds to hold the way forward shut for. For the few dialogs that change
  // something outside this app, where the cost of being read too quickly is
  // that somebody finds an account of theirs altered and has to work out why.
  holdFor = 0,
}) {
  return new Promise((resolve) => {
    el.confirmMark.textContent = mark;
    el.confirmMark.classList.toggle('danger', danger);
    el.confirmTitle.textContent = title;
    el.confirmDetail.textContent = detail || '';
    el.confirmDetail.hidden = !detail;
    // Text, never markup: this is set from whatever the caller has, and one
    // dialog that takes HTML is all it takes for a pack title to become one.
    el.confirmCode.textContent = code || '';
    el.confirmCode.hidden = !code;
    el.confirmButtons.innerHTML = '';

    let settled = false;
    let ticking = null;
    const finish = (index) => {
      if (settled) return;
      settled = true;
      if (ticking) clearInterval(ticking);
      el.confirmDialog.removeEventListener('close', onClose);
      el.confirmDialog.close();
      resolve(index);
    };
    // Esc, or anything else that dismisses it, counts as declining.
    const onClose = () => { if (!staleClose()) finish(cancelIndex); };

    buttons.forEach((label, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      const last = index === buttons.length - 1;
      button.className = `btn btn-small${
        danger && index === 0 ? ' btn-danger' : !danger && index === 0 ? ' btn-primary' : ''}`;
      button.textContent = label;
      button.addEventListener('click', () => finish(index));
      // The way out sits apart from the ways forward.
      if (last && buttons.length > 1) el.confirmButtons.append(spacer());
      el.confirmButtons.append(button);
    });

    // Only the way forward waits. Cancelling stays available throughout, so a
    // countdown never traps anybody in a dialog they have already decided
    // against, which would make it an obstacle rather than a pause.
    const go = el.confirmButtons.querySelector('button');
    if (holdFor > 0 && go) {
      const label = buttons[0];
      let left = Math.ceil(holdFor);
      go.disabled = true;
      go.textContent = `${label} (${left})`;
      ticking = setInterval(() => {
        left -= 1;
        if (left > 0) {
          go.textContent = `${label} (${left})`;
          return;
        }
        clearInterval(ticking);
        ticking = null;
        go.disabled = false;
        go.textContent = label;
      }, 1000);
    }

    el.confirmDialog.addEventListener('close', onClose);
    el.confirmDialog.showModal();
    // The countdown is the point, so focus goes to the way out rather than to
    // a button that cannot be pressed yet and would swallow a stray Enter the
    // moment it became live.
    const focusOn = holdFor > 0
      ? el.confirmButtons.querySelector('button:last-of-type')
      : el.confirmButtons.querySelector('button');
    if (focusOn) focusOn.focus();
  });
}

/** How a strength setting reads, so the number means something. */
function strengthWords(value) {
  if (value <= 0.15) return 'barely';
  if (value <= 0.35) return 'gently';
  if (value <= 0.6) return 'firmly';
  if (value <= 0.85) return 'hard';
  return 'as hard as it goes';
}

/**
 * Asks how to build a backing track, with a few seconds of it to listen to.
 *
 * There is no setting that is right for every pack. How much of a voice can be
 * taken out without taking the music with it depends on how the scene was
 * mixed, which nothing can know in advance, and the difference between a good
 * result and a poor one is audible in about two seconds and invisible on
 * paper. So this asks, and lets the answer be heard before the several minutes
 * that building the real thing costs.
 *
 * Resolves with `{ mode, strength }`, or null if it was declined.
 */
function askBackingSettings({ videoPath, ranges, replacing, lineAt }) {
  return new Promise((resolve) => {
    let mode = 'muffle';
    let settled = false;

    el.backingDialog.querySelector('#backing-title').textContent = replacing
      ? 'Replace the backing track?' : 'Build a backing track';
    el.backingDetail.textContent = `The video's own audio is used, with the original voices `
      + `taken out under each of the ${ranges.length} lines so your dub sits in front of them.`;

    const showMode = () => {
      for (const button of el.backingMode.querySelectorAll('[data-mode]')) {
        button.classList.toggle('on', button.dataset.mode === mode);
      }
      // Silence has nothing to tune: it is zero everywhere under a line.
      el.backingStrengthRow.hidden = mode !== 'muffle';
      el.backingTechnique.hidden = mode !== 'muffle';
      el.backingTechnique.textContent = mode === 'muffle'
        ? 'Where the audio is properly stereo the centred voices are cancelled, which barely '
          + 'touches the music. Where both channels are the same signal there is no centre to '
          + 'cancel and the speech range is cut instead, which costs a little more music.'
        : '';
    };

    const strength = () => Number(el.backingStrength.value) / 100;
    const showStrength = () => {
      el.backingStrengthNote.textContent = `(${strengthWords(strength())})`;
    };

    const clearSample = () => {
      el.backingSample.pause();
      el.backingSample.removeAttribute('src');
      el.backingSample.hidden = true;
      el.backingSampleNote.textContent = '';
    };

    showMode();
    showStrength();
    clearSample();

    const onStrength = () => { showStrength(); clearSample(); };
    const onMode = (event) => {
      const picked = event.target.dataset.mode;
      if (!picked) return;
      mode = picked;
      showMode();
      clearSample();
    };

    const onPreview = async () => {
      el.backingPreview.disabled = true;
      el.backingSampleNote.textContent = 'Building a few seconds…';
      try {
        const got = await window.api.content.previewBacking({
          videoPath, ranges, mode, strength: strength(), at: lineAt,
        });
        if (!got || !got.ok) {
          el.backingSampleNote.textContent = (got && got.error) || 'Could not build a sample.';
          return;
        }
        el.backingSample.src = got.url;
        el.backingSample.hidden = false;
        el.backingSample.play().catch(() => { /* they can press play */ });
        el.backingSampleNote.textContent = got.technique === 'centre'
          ? 'Centred voices cancelled.' : 'Speech range cut.';
      } finally {
        el.backingPreview.disabled = false;
      }
    };

    const finish = (value) => {
      if (settled) return;
      settled = true;
      clearSample();
      el.backingStrength.removeEventListener('input', onStrength);
      el.backingMode.removeEventListener('click', onMode);
      el.backingPreview.removeEventListener('click', onPreview);
      el.backingGo.removeEventListener('click', onGo);
      el.backingCancel.removeEventListener('click', onCancel);
      el.backingDialog.removeEventListener('close', onClose);
      el.backingDialog.close();
      resolve(value);
    };

    function onGo() { finish({ mode, strength: strength() }); }
    function onCancel() { finish(null); }
    function onClose() { if (!staleClose(el.backingDialog)) finish(null); }

    el.backingStrength.addEventListener('input', onStrength);
    el.backingMode.addEventListener('click', onMode);
    el.backingPreview.addEventListener('click', onPreview);
    el.backingGo.addEventListener('click', onGo);
    el.backingCancel.addEventListener('click', onCancel);
    el.backingDialog.addEventListener('close', onClose);
    el.backingDialog.showModal();
  });
}

/**
 * The same dialog, with somewhere to type.
 *
 * Resolves with the text, or null if it was declined. Empty text and a decline
 * are different answers, so they are not both null: approving with nothing to
 * add is a perfectly ordinary thing to do.
 */
function askText({ title, detail, placeholder = '', buttons, mark = '?', required = false }) {
  return new Promise((resolve) => {
    el.confirmMark.textContent = mark;
    el.confirmMark.classList.remove('danger');
    el.confirmTitle.textContent = title;
    el.confirmDetail.textContent = detail || '';
    el.confirmDetail.hidden = !detail;
    el.confirmButtons.innerHTML = '';

    const field = document.createElement('textarea');
    field.className = 'input';
    field.rows = 3;
    field.placeholder = placeholder;
    field.style.width = '100%';
    field.style.marginTop = '10px';
    el.confirmDetail.after(field);

    // Pressing the button with nothing typed used to move the caret back into
    // the box and nothing else, which reads as the button being broken rather
    // than as something being wanted.
    const why = document.createElement('p');
    why.className = 'askform-why';
    why.hidden = true;
    field.after(why);

    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      el.confirmDialog.removeEventListener('close', onClose);
      field.remove();
      why.remove();
      el.confirmDialog.close();
      resolve(value);
    };
    const onClose = () => { if (!staleClose()) finish(null); };

    field.addEventListener('input', () => {
      if (!why.hidden && field.value.trim()) {
        why.hidden = true;
        field.classList.remove('is-missing');
      }
    });

    const go = document.createElement('button');
    go.type = 'button';
    go.className = 'btn btn-small btn-primary';
    go.textContent = buttons[0];
    go.addEventListener('click', () => {
      const said = field.value.trim();
      if (required && !said) {
        why.textContent = 'A reason is needed, so the author knows what to change.';
        why.hidden = false;
        field.classList.add('is-missing');
        field.focus();
        return;
      }
      finish(said);
    });

    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'btn btn-small';
    cancel.textContent = buttons[1] || 'Cancel';
    cancel.addEventListener('click', () => finish(null));

    el.confirmButtons.append(go, spacer(), cancel);
    el.confirmDialog.addEventListener('close', onClose);
    el.confirmDialog.showModal();
    field.focus();
  });
}

/**
 * The same dialog, with a list of things to tick.
 *
 * Resolves with the chosen ids, or null if it was declined. Ticking nothing is
 * a real answer and comes back as an empty list, which is different from
 * backing out.
 */
function askChecklist({ title, detail, options, ticked = [], mark = '?', buttons }) {
  return new Promise((resolve) => {
    el.confirmMark.textContent = mark;
    el.confirmMark.classList.remove('danger');
    el.confirmTitle.textContent = title;
    el.confirmDetail.textContent = detail || '';
    el.confirmDetail.hidden = !detail;
    el.confirmButtons.innerHTML = '';

    const box = document.createElement('div');
    box.className = 'checklist';
    box.innerHTML = options.map((o) => `
      <label class="checklist-row">
        <input type="checkbox" value="${escapeHtml(o.id)}"${
  ticked.includes(o.id) ? ' checked' : ''} />
        <span>${escapeHtml(o.label)}</span>
      </label>`).join('');
    el.confirmDetail.after(box);

    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      el.confirmDialog.removeEventListener('close', onClose);
      box.remove();
      el.confirmDialog.close();
      resolve(value);
    };
    const onClose = () => { if (!staleClose()) finish(null); };

    const go = document.createElement('button');
    go.type = 'button';
    go.className = 'btn btn-small btn-primary';
    go.textContent = buttons[0];
    go.addEventListener('click', () => finish(
      [...box.querySelectorAll('input:checked')].map((i) => i.value),
    ));

    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'btn btn-small';
    cancel.textContent = buttons[1] || 'Cancel';
    cancel.addEventListener('click', () => finish(null));

    el.confirmButtons.append(go, spacer(), cancel);
    el.confirmDialog.addEventListener('close', onClose);
    el.confirmDialog.showModal();
    go.focus();
  });
}

/**
 * The shared dialog with a short form in it.
 *
 * Resolves with the values keyed by field, or null if declined. Fields marked
 * required block the primary button rather than complaining after the fact.
 */
function askForm({ title, detail, fields, buttons, mark = '?' }) {
  return new Promise((resolve) => {
    el.confirmMark.textContent = mark;
    el.confirmMark.classList.remove('danger');
    el.confirmTitle.textContent = title;
    el.confirmDetail.textContent = detail || '';
    el.confirmDetail.hidden = !detail;
    el.confirmButtons.innerHTML = '';

    const box = document.createElement('div');
    box.className = 'askform';
    box.innerHTML = fields.map((f) => {
      const id = `askform-${f.key}`;
      const input = f.options
        ? `<select id="${id}" class="select">${f.options.map(([v, label]) =>
          `<option value="${escapeHtml(v)}"${v === f.value ? ' selected' : ''}>${
            escapeHtml(label)}</option>`).join('')}</select>`
        : f.multiline
          ? `<textarea id="${id}" class="input" rows="3" maxlength="${f.max || 4000}"
               placeholder="${escapeHtml(f.placeholder || '')}">${escapeHtml(f.value || '')}</textarea>`
          : `<input id="${id}" class="input" type="text" maxlength="${f.max || 200}"
               placeholder="${escapeHtml(f.placeholder || '')}" value="${escapeHtml(f.value || '')}" />`;
      return `<label class="askform-row">
        <span>${escapeHtml(f.label)}${
  f.required ? '<b class="askform-need">Required</b>' : ''}</span>${input}</label>`;
    }).join('');
    el.confirmDetail.after(box);

    // Why the way forward is closed, in words, right where the button is.
    //
    // Disabling the button on its own is silent: it looks like a dialog that
    // has stopped working rather than one waiting for something, and there is
    // nothing on screen saying which field it is waiting on.
    const why = document.createElement('p');
    why.className = 'askform-why';
    why.hidden = true;
    box.after(why);

    const read = () => Object.fromEntries(fields.map((f) =>
      [f.key, box.querySelector(`#askform-${f.key}`).value]));

    // A field is only marked wrong once it has been left, so a form does not
    // open covered in red for things nobody has had a chance to type yet.
    const touched = new Set();
    box.addEventListener('focusout', (event) => {
      const id = event.target.id || '';
      if (!id.startsWith('askform-')) return;
      touched.add(id.slice('askform-'.length));
      check();
    });

    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      el.confirmDialog.removeEventListener('close', onClose);
      box.remove();
      why.remove();
      el.confirmDialog.close();
      resolve(value);
    };
    const onClose = () => { if (!staleClose()) finish(null); };

    const go = document.createElement('button');
    go.type = 'button';
    go.className = 'btn btn-small btn-primary';
    go.textContent = buttons[0];
    go.addEventListener('click', () => finish(read()));

    // Required fields hold the primary button and say why they are holding it.
    //
    // `min` is here so a field the directory will refuse for being too short is
    // refused now instead, while it can still be typed into. Finding that out
    // after an upload has finished is a long way to travel for one character.
    function check() {
      const values = read();

      const problems = fields.map((f) => {
        const value = String(values[f.key]).trim();
        if (f.required && !value) return `${f.label} is required.`;
        if (f.min && value.length > 0 && value.length < f.min) {
          return `${f.label} needs at least ${f.min} characters.`;
        }
        return null;
      });

      fields.forEach((f, at) => {
        const row = box.querySelector(`#askform-${f.key}`).closest('.askform-row');
        row.classList.toggle('is-missing', Boolean(problems[at]) && touched.has(f.key));
      });

      // The first outstanding one, not all of them. A list of everything wrong
      // with a four field form reads as a telling off, and fixing them one at a
      // time is what happens anyway.
      const first = problems.find(Boolean) || '';
      go.disabled = Boolean(first);
      why.textContent = first;
      why.hidden = !first;
    }
    box.addEventListener('input', check);

    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'btn btn-small';
    cancel.textContent = buttons[1] || 'Cancel';
    cancel.addEventListener('click', () => finish(null));

    el.confirmButtons.append(go, spacer(), cancel);
    el.confirmDialog.addEventListener('close', onClose);
    el.confirmDialog.showModal();
    check();
    const first = box.querySelector('input, textarea, select');
    if (first) first.focus();
  });
}

function spacer() {
  const span = document.createElement('span');
  span.className = 'grow';
  return span;
}

/** Opens a link in the real browser, after asking. */
async function openOutside(url, what) {
  let host = url;
  try { host = new URL(url).host; } catch { /* show it verbatim */ }

  const answer = await askConfirm({
    title: what ? `Open ${what}?` : 'Leave the app?',
    detail: `This opens ${host} in your normal browser.`,
    buttons: ['Open in my browser', 'Stay here'],
    mark: '↗',
  });
  if (answer === 0) await window.api.shell.openExternalConfirmed(url);
}

/** Full screen wait for the one job long enough to need explaining. */
function showPrep(visible, packTitle) {
  el.prepOverlay.hidden = !visible;
  if (!visible) return;

  el.prepTitle.textContent = packTitle ? `Preparing ${packTitle}` : 'Preparing the video';
  el.prepPct.textContent = 'starting…';
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
    // Whatever the pack itself points this line at. Lines are not given each
    // other's pictures on the strength of a matching name.
    const portrait = item.imageUrl;

    row.innerHTML = `
      <button class="line-time" title="Jump to this line">${formatTime(item.time)}</button>
      ${portrait ? `<img class="line-portrait" src="${portrait}" alt="" />` : ''}
      <div class="line-body">
        <div class="line-top">
          <span class="line-char" style="color:${characterColor(item.character)}">${escapeHtml(item.character || 'Unknown')}</span>
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
        saveAdjustments();
      });
    }

    // Slider and number box drive each other, so either can be used.
    const volSlider = row.querySelector('.line-vol input[type="range"]');
    const volNumber = row.querySelector('.line-vol-num');

    const applyVolume = (percent, echoTo) => {
      const value = clamp(Math.round(percent), 0, 200);
      echoTo.value = String(value);
      player.setLineVolume(item.id, value / 100);
      saveAdjustments();
    };

    volSlider.addEventListener('input', () => applyVolume(Number(volSlider.value), volNumber));
    volNumber.addEventListener('change', () => applyVolume(Number(volNumber.value), volSlider));

    const offsetInput = row.querySelector('.nudge-val');

    const applyOffset = (ms) => {
      const value = clamp(Math.round(ms), -5000, 5000);
      offsetInput.value = String(value);
      player.setLineOffset(item.id, value / 1000);
      renderMarkers();
      saveAdjustments();
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

  const window = activeCaption(time);
  const active = window ? window.items[0] : null;
  const wantCaptions = state.settings.showPreviewCaptions !== false;

  if (wantCaptions && window) {
    const showSpeaker = captionStyle().showSpeaker !== false;
    // Simultaneous speakers get a line each rather than overlapping.
    el.caption.innerHTML = window.lines.map(({ text, character }) => {
      const speaker = showSpeaker && character
        ? `<b style="color:${characterColor(character)}">${escapeHtml(character)}</b>`
        : '';
      return `<span class="caption-line">${speaker}${escapeHtml(text)}</span>`;
    }).join('');
    el.caption.hidden = false;
  } else {
    el.caption.hidden = true;
  }

  // The speaker's picture follows the same switch as the caption. It is the
  // other half of the same overlay, and leaving it up with the words turned off
  // meant there was no way to see the video by itself.
  if (wantCaptions && active && active.imageUrl) {
    if (el.portrait.getAttribute('src') !== active.imageUrl) el.portrait.src = active.imageUrl;
    el.portrait.hidden = false;
  } else {
    el.portrait.hidden = true;
  }

  requestAnimationFrame(tick);
}

// Export

/**
 * Caption windows, clipped so a long line never overruns the next speaker.
 *
 * Takes routinely run past where the next line starts, so without the clip a
 * caption swallows the one after it and that line never appears. Eight of the
 * twenty six Backrooms captions were being lost this way.
 */
function captionWindows() {
  const items = [...player.items].sort((a, b) => (a.time + a.offset) - (b.time + b.offset));
  return items.map((item, i) => {
    const start = item.time + item.offset;
    const next = items[i + 1];
    const natural = start + Math.max(item.duration || 0, 0.9);
    // Clips sharing a timestamp are grouped later, so only a genuinely later
    // line limits this one.
    const following = items.slice(i + 1).find((n) => (n.time + n.offset) > start);
    const limit = following ? (following.time + following.offset) : Infinity;
    return {
      item,
      start,
      end: Math.min(natural, limit),
      text: item.caption || '',
      character: item.character || '',
    };
  });
}

/**
 * Caption events for the export, built the same way the preview builds them so
 * the two cannot disagree. Clips sharing a timestamp become one event with a
 * line each, rather than two events drawn on top of each other.
 */
function buildCaptions() {
  const byStart = new Map();
  for (const w of captionWindows()) {
    if (!w.text) continue;
    const key = w.start.toFixed(3);
    if (!byStart.has(key)) byStart.set(key, { start: w.start, end: w.end, lines: [] });
    const group = byStart.get(key);
    group.end = Math.max(group.end, w.end);
    group.lines.push({ text: w.text, character: w.character });
  }

  return [...byStart.values()]
    .sort((a, b) => a.start - b.start)
    .map((g) => ({ start: g.start, end: g.end, lines: g.lines }));
}

/**
 * The caption due at `time`, or null between lines.
 *
 * Computed live rather than from a cache: durations arrive as audio decodes
 * and offsets change as you nudge lines, so a cached copy is stale exactly
 * when it matters. Twenty six items scanned once a frame costs nothing.
 */
function activeCaption(time) {
  const items = player.items;

  // The line on screen is the latest one to have started.
  let bestStart = -Infinity;
  for (const item of items) {
    if (!item.caption) continue;
    const start = item.time + item.offset;
    if (start <= time && start > bestStart) bestStart = start;
  }
  if (bestStart === -Infinity) return null;

  // Packs really do put two clips at the same timestamp when two characters
  // talk over each other. Jax's Crashout has three such pairs, and showing
  // only one of them means the other caption is never seen at all.
  const together = items.filter((i) => i.caption && (i.time + i.offset) === bestStart);

  let nextStart = Infinity;
  for (const item of items) {
    const start = item.time + item.offset;
    if (item.caption && start > bestStart && start < nextStart) nextStart = start;
  }

  // Cut off when the next line begins, so a long take cannot run over it.
  // No minimum is applied: a floor would claim time this caption cannot
  // actually hold, because the next line supersedes it the moment it starts.
  const longest = Math.max(...together.map((i) => i.duration || 0), 0.9);
  const end = Math.min(bestStart + longest, nextStart);
  if (time >= end) return null;

  return {
    start: bestStart,
    end,
    items: together,
    lines: together.map((i) => ({ text: i.caption, character: i.character || '' })),
  };
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

    // The same two-part gain the preview uses, so what was heard is what comes
    // out. Turning the setting off exports the line volumes on their own.
    const perCharacter = state.settings.useCharacterVolumes !== false
      ? characterVolume(item.character)
      : 1;

    tracks.push({
      path,
      time: item.time,
      offset: item.offset,
      volume: item.volume * perCharacter,
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
  el.optCharacterVolumes.checked = state.settings.useCharacterVolumes !== false;
  renderCharacterVolumeNote();
  renderMixReadout();
}

/**
 * Says what the per character volumes actually are, in the export dialog.
 *
 * A switch for "use the volumes I set" is no use without showing what they are,
 * since they were set on another screen and there is no other way to check them
 * before committing to an export.
 */
function renderCharacterVolumeNote() {
  const note = el.characterVolumeNote;
  if (!note) return;
  const changed = characterVolumesUsed();
  if (!changed.length) {
    note.textContent = 'No character has been changed from 100%. Set these in Settings.';
    return;
  }
  note.textContent = changed
    .map(([name, value]) => `${name} ${Math.round(value * 100)}%`)
    .join(' · ');
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
  syncCaptionControls();
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
  // Not awaited: it asks GitHub whether the stored sign-in still works, and the
  // rest of the panel should not wait on the network to appear.
  renderGithubLink();
  el.setGameDir.value = state.settings.gameDir || '';
  el.setOutDir.value = state.settings.outputDir || '';
  el.setFfmpeg.value = state.settings.ffmpegPath || '';
  el.setTheme.value = state.settings.theme || 'system';
  el.setSplash.checked = state.settings.showSplash !== false;
  el.setPreviewCaptions.checked = state.settings.showPreviewCaptions !== false;
  el.setEditorCaptions.checked = state.settings.showEditorCaptions !== false;
  renderFfmpegStatus();
  el.settingsDialog.showModal();
}

// Events

/**
 * Ties a range input to a number input so either can drive the value.
 * The slider updates live while dragging; the box commits on blur or Enter.
 */
/**
 * Ties a slider and its number box together, and to any other controls showing
 * the same value.
 *
 * The music and dub balance appears twice, under the player and in the export
 * window, because a freestyle session has no per-line controls and the export
 * window was the one place it could not be set. Both have to move together or
 * the preview and the export disagree about what was asked for.
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

/**
 * Shows the music and dub balance in the export window.
 *
 * Set on the sliders under the player, where the change can be heard as it is
 * made, and only reported here so it is clear what is about to be exported. A
 * freestyle recording has no per-line controls, so the dub figure is the only
 * thing describing how loud it will be.
 */
function renderMixReadout() {
  if (!el.expVolBackingRead) return;
  el.expVolBackingRead.textContent = `${Math.round(Number(el.volBacking.value))}%`;
  el.expVolDubRead.textContent = `${Math.round(Number(el.volDub.value))}%`;
}

function wireEvents() {
  el.splash.addEventListener('click', dismissSplash);

  for (const button of el.themeButtons) {
    button.addEventListener('click', () => setTheme(button.dataset.themeSet));
  }
  el.setTheme.addEventListener('change', () => setTheme(el.setTheme.value));
  el.setPreviewCaptions.addEventListener('change', async () => {
    state.settings = await window.api.settings.set({ showPreviewCaptions: el.setPreviewCaptions.checked });
  });
  el.setEditorCaptions.addEventListener('change', async () => {
    state.settings = await window.api.settings.set({ showEditorCaptions: el.setEditorCaptions.checked });
    if (editor) editor.setCaptionsVisible(el.setEditorCaptions.checked);
  });
  el.setSplash.addEventListener('change', async () => {
    state.settings = await window.api.settings.set({ showSplash: el.setSplash.checked });
  });

  // The setup overlay. It has no close button of its own beyond Skip, and Esc
  // is cancelled, because dismissing it by accident leaves an app that cannot
  // do anything and gives no hint why.
  el.setupDialog.addEventListener('cancel', (event) => event.preventDefault());
  el.setupBrowse.addEventListener('click', async () => {
    const picked = await window.api.game.pickFolder();
    if (picked && picked.picked) await useGameDir(picked.resolved || picked.picked);
  });
  el.setupUseDefault.addEventListener('click', async () => {
    await useGameDir(state.info.defaultGameDir);
  });
  el.setupHelp.addEventListener('click', () => {
    el.setupDialog.close();
    openHelpTab('start');
  });
  el.setupLater.addEventListener('click', () => {
    state.setupSkipped = true;
    el.setupDialog.close();
  });

  for (const event of ['dragenter', 'dragover']) {
    el.setupDrop.addEventListener(event, (e) => {
      e.preventDefault();
      el.setupDrop.classList.add('over');
    });
  }
  for (const event of ['dragleave', 'drop']) {
    el.setupDrop.addEventListener(event, () => el.setupDrop.classList.remove('over'));
  }
  el.setupDrop.addEventListener('drop', async (e) => {
    e.preventDefault();
    const dropped = [...(e.dataTransfer.files || [])]
      .map((f) => window.api.pathForFile(f))
      .filter(Boolean);
    if (dropped.length) await useGameDir(dropped[0]);
  });

  // Help always opens at the beginning, whatever tab was last read.
  el.btnAbout.addEventListener('click', () => openHelpTab('start'));
  // Clicking the version asks what is in this version, so it opens the list of
  // changes rather than the front of the help. An available update is still
  // offered, in the note beside the version inside the dialog and in the bar at
  // the top of the window, so nothing is lost by not jumping straight to GitHub.
  el.versionBadge.addEventListener('click', () => openHelpTab('whatsnew'));
  el.btnAboutClose.addEventListener('click', () => el.aboutDialog.close());

  // Everything that leaves the app asks first, so a click never dumps you into
  // a browser without warning.
  const links = (state.info && state.info.links) || {};
  const leaveFor = (url, what) => () => openOutside(url, what);

  el.btnAboutPage.addEventListener('click', leaveFor(links.game, 'the game on itch.io'));
  el.btnAboutDiscord.addEventListener('click', leaveFor(links.discord, "jojozagjos's Discord"));
  el.btnAboutRepo.addEventListener('click', leaveFor(links.releases, 'the updates page on GitHub'));

  // Donation links stay hidden entirely until a page is configured.
  if (links.donate) {
    el.btnAboutDonate.hidden = false;
    el.donateBlurb.hidden = false;
    el.btnAboutDonate.addEventListener('click', leaveFor(links.donate, 'the donation page'));
  }

  for (const tab of el.helpTabs) {
    tab.addEventListener('click', () => {
      for (const other of el.helpTabs) other.classList.toggle('on', other === tab);
      for (const panel of document.querySelectorAll('[data-help-panel]')) {
        panel.hidden = panel.dataset.helpPanel !== tab.dataset.help;
      }
      if (tab.dataset.help === 'whatsnew') loadChangelog();
    });
  }

  // Caption appearance lives on the export dialog's Captions tab, since it
  // only affects what an export looks like.
  for (const tab of el.exportTabs) {
    tab.addEventListener('click', () => {
      for (const other of el.exportTabs) other.classList.toggle('on', other === tab);
      for (const panel of document.querySelectorAll('[data-export-panel]')) {
        panel.hidden = panel.dataset.exportPanel !== tab.dataset.exportTab;
      }
    });
  }

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
    renderLines();
  });

  el.btnCaptionReset.addEventListener('click', async () => {
    state.settings = await window.api.settings.set({
      captionStyle: { ...DEFAULT_CAPTION_STYLE },
      characterColors: {},
      replaceCharacterColors: true,
    });
    applyCaptionStyle();
    syncCaptionControls();
  });

  el.packSearch.addEventListener('input', (e) => {
    state.filter = e.target.value;
    renderPacks();
  });

  el.btnRefresh.addEventListener('click', async () => {
    // A scan of a small library finishes faster than a person can perceive,
    // so without this the button looks like it did nothing at all.
    el.btnRefresh.classList.add('spinning');
    el.btnRefresh.disabled = true;
    const started = Date.now();

    try {
      // Packs are cached between scans, so a rescan has to throw that away
      // first. This is the one thing that catches edits made outside the app.
      await window.api.content.forget();
      await rescan(state.settings.gameDir);

      // Rescan is reachable from the top bar with an editor open, where it used
      // to reload the library behind it and leave the editor showing the pack as
      // it was when it opened. Files changed outside the app are a normal reason
      // to press it, so the open pack is reloaded too.
      if (!el.editorView.hidden && editor.pack) {
        await editor.onChanged(editor.pack.id, { keepEditor: true });
      } else if (state.tab === 'content') {
        await refreshContent();
      }
    } finally {
      // Held briefly so the spin reads as a spin rather than a flicker.
      const left = 550 - (Date.now() - started);
      if (left > 0) await new Promise((r) => setTimeout(r, left));
      el.btnRefresh.classList.remove('spinning');
      el.btnRefresh.disabled = false;
    }
    toast('Rescanned.', 'ok', 1800);
  });
  // Saved as a setting rather than an export option, because the preview obeys
  // it too and the two must not be able to disagree.
  el.optCharacterVolumes.addEventListener('change', async () => {
    state.settings = await window.api.settings.set({
      useCharacterVolumes: el.optCharacterVolumes.checked,
    });
    applyCharacterVolumes();
    renderCharacterVolumeNote();
  });

  /**
   * Picks up changes made to the game folder outside the app.
   *
   * The main process has already forgotten the folders that changed, so this
   * only has to reread. The editor is only reloaded when the change was to the
   * pack being edited, since reloading it rebuilds the line list and there is no
   * reason to disturb someone over a different pack.
   */
  window.api.content.onChangedOnDisk(scheduleDiskRefresh);

  el.btnOrphanOpen.addEventListener('click', () => {
    const dir = state.settings.gameDir;
    if (dir) window.api.shell.openPath(`${dir}/recordings/dub_recordings`);
  });

  el.btnSettings.addEventListener('click', openSettings);
  el.btnReport.addEventListener('click', reportIssue);

  for (const button of el.tabButtons) {
    button.addEventListener('click', () => switchTab(button.dataset.tab));
  }

  // Home
  el.cardExport.addEventListener('click', () => switchTab('export'));
  el.cardManage.addEventListener('click', () => switchTab('content'));
  el.cardCreate.addEventListener('click', () => openCreateDialog());

  // Creating
  el.btnContentNew.addEventListener('click', () => openCreateDialog(state.contentType));
  el.btnCreateCancel.addEventListener('click', () => el.createDialog.close());
  el.btnCreateBack.addEventListener('click', () => openCreateDialog());
  el.btnCreateGo.addEventListener('click', runCreate);
  el.createBrowse.addEventListener('click', async () => {
    const picked = await window.api.dialog.pickFiles({
      title: 'Choose files to add',
      kind: createState.type ? createState.type.accepts : 'all',
    });
    addCreateFiles(picked);
  });

  // Drag and drop onto the create dialog.
  for (const event of ['dragenter', 'dragover']) {
    el.createDrop.addEventListener(event, (e) => {
      e.preventDefault();
      el.createDrop.classList.add('over');
    });
  }
  for (const event of ['dragleave', 'drop']) {
    el.createDrop.addEventListener(event, () => el.createDrop.classList.remove('over'));
  }
  el.createDrop.addEventListener('drop', (e) => {
    e.preventDefault();
    const paths = [...(e.dataTransfer.files || [])]
      .map((f) => window.api.pathForFile(f))
      .filter(Boolean);
    addCreateFiles(paths);
  });

  // Dropping an unzipped pack onto the list installs it, working out which
  // folder it belongs in from what is inside.
  for (const event of ['dragenter', 'dragover']) {
    el.contentGrid.addEventListener(event, (e) => {
      e.preventDefault();
      el.contentGrid.classList.add('drop-target');
    });
  }
  for (const event of ['dragleave', 'drop']) {
    el.contentGrid.addEventListener(event, () => el.contentGrid.classList.remove('drop-target'));
  }
  el.contentGrid.addEventListener('drop', async (e) => {
    e.preventDefault();
    const paths = [...(e.dataTransfer.files || [])]
      .map((f) => window.api.pathForFile(f))
      .filter(Boolean);
    if (paths.length) await installPacks(paths);
  });

  el.btnContentFolder.addEventListener('click', () => {
    const type = currentContentType();
    if (type) window.api.shell.openPath(type.dir);
  });

  el.sessionSelect.addEventListener('change', () => {
    const session = state.pack.sessions.find((s) => s.id === el.sessionSelect.value);
    loadSession(session || null);
  });

  // Nothing may drive the player while a pack is still being prepared: the
  // element still holds the last pack's video, so playing it plays the wrong
  // thing behind the overlay.
  el.btnPlay.addEventListener('click', () => {
    if (state.loading) return;
    player.toggle();
    // Pressing play is what "listened to" means, so the new mark comes off here
    // rather than on merely selecting the session in the list.
  });

  el.btnSessionDelete.addEventListener('click', removeCurrentSession);

  el.contentSearch.addEventListener('input', () => {
    state.contentSearch = el.contentSearch.value.trim();
    renderContentGrid();
  });
  // Escape clears rather than only blurring, which is what the box being empty
  // again is usually meant to achieve.
  el.contentSearch.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    el.contentSearch.value = '';
    state.contentSearch = '';
    renderContentGrid();
  });
  // One box, three lists. Which one it filters follows whichever view is open,
  // so it does not need three boxes that are hidden most of the time.
  const searchAgain = () => {
    if (state.modsShow === 'publishers') showPublishers();
    else if (state.modsShow === 'inbox') drawInbox();
    else renderMods();
  };
  el.modsSearch.addEventListener('input', searchAgain);
  el.modsSearch.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    el.modsSearch.value = '';
    searchAgain();
  });
  // Refresh reloads whichever view is open, through showMods so the view is set
  // up before it is drawn. Calling refreshMods directly from here reloaded the
  // packs whatever was on screen, and drawing them un-hid the pack type rail,
  // so refreshing on Publishers or Your submissions grew a rail belonging to a
  // list that was not being shown.
  el.btnModsRefresh.addEventListener('click', () => {
    if (state.modsShow === 'inbox') { renderInbox(); return; }
    directoryChanged();
    showMods(state.modsShow === 'publisher' ? 'browse' : (state.modsShow || 'browse'));
  });
  el.btnModsBrowse.addEventListener('click', () => showMods('browse'));
  el.btnModsPublishers.addEventListener('click', () => showMods('publishers'));
  el.btnModsInstalled.addEventListener('click', () => showMods('installed'));
  el.btnModsInbox.addEventListener('click', () => showMods('inbox'));

  el.modsSort.innerHTML = MOD_SORTS
    .map((s) => `<option value="${s.id}">${escapeHtml(s.label)}</option>`).join('');
  el.modsSort.value = state.modsSort;
  el.modsSort.addEventListener('change', () => {
    state.modsSort = el.modsSort.value;
    renderMods();
  });

  el.btnBack.addEventListener('click', () => {
    if (!state.loading) player.seek(el.video.currentTime - 5);
  });
  el.btnFwd.addEventListener('click', () => {
    if (!state.loading) player.seek(el.video.currentTime + 5);
  });
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
  bindMixControl(el.volBacking, el.volBackingVal, 150, (v) => {
    player.setBackingVolume(v / 100);
    renderMixReadout();
    saveAdjustments();
  });
  bindMixControl(el.volDub, el.volDubVal, 200, (v) => {
    player.setDubVolume(v / 100);
    renderMixReadout();
    saveAdjustments();
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
    saveAdjustments();
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

  el.btnGithubLink.addEventListener('click', linkGithub);
  el.btnGithubUnlink.addEventListener('click', unlinkGithub);
  el.btnAdminRefresh.addEventListener('click', () => showAdmin(state.adminShow, { force: true }));
  el.adminSearch.addEventListener('input', () => {
    showAdmin(state.adminShow);
  });

  el.adminSort.innerHTML = REPORT_SORTS
    .map((s) => `<option value="${s.id}">${escapeHtml(s.label)}</option>`).join('');
  el.adminSort.value = state.adminSort;
  el.adminSort.addEventListener('change', () => {
    state.adminSort = el.adminSort.value;
    // Redrawn from what is already held rather than fetched again: ordering is
    // a question about the list on screen, not about GitHub.
    drawAdminQueue(state.adminItems || []);
  });
  el.adminSearch.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    el.adminSearch.value = '';
    el.adminSearch.dispatchEvent(new Event('input'));
  });
  for (const button of el.adminTabs) {
    button.addEventListener('click', () => showAdmin(button.dataset.admin));
  }
  // Asked once at start-up. Signing in or out asks again, since that is the
  // only thing that can change the answer.
  refreshAdminAccess();

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

  // Conversion progress lands on the tile of the pack it belongs to.
  window.api.content.onImportProgress(({ destDir, dir, phase, percent, done, total, jobId }) => {
    // Trimming a video and building a backing track report through the same
    // channel, but against the pack folder rather than an import job, so this
    // handler never matched them and both ran with no progress shown at all.
    if (phase === 'trim' || phase === 'backing') {
      // The job id is what keeps an abandoned job from driving this. The editor
      // ignores anything that is not the job its overlay is showing.
      if (!el.editorView.hidden) editor.setBusyProgress(percent, jobId);
      return;
    }

    const job = state.converting.get(destDir || dir);
    if (!job) return;
    if (percent != null) job.percent = percent;
    if (done != null && total > 1) job.label = `Converting ${done} of ${total}…`;
    if (state.tab === 'content') {
      renderContentGrid();
      // The detail panel carries the same notice, so it has to move too, or it
      // sits there with a stale figure while the tile behind it counts up.
      const shown = state.content && state.content.types
        .flatMap((t) => t.packs).find((p) => p.id === state.contentPackId);
      if (shown && shown.dir === (destDir || dir)) renderContentDetail(shown);
    }
  });

  // First open of a pack transcodes its video; show how far along that is.
  // Ignore progress from a pack you have already clicked away from.
  window.api.media.onProxyProgress(({ videoPath, percent }) => {
    if (percent == null || videoPath !== state.loadingVideoPath) return;

    // The editor's own overlay when it is up, the export player's otherwise.
    if (!el.prepOverlay.hidden) {
      el.prepPct.textContent = `${percent.toFixed(0)}%`;
      return;
    }
    // A figure, not a bar. The bar carried no number, so all it said was that
    // something was happening, which the spinner beside it already said.
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

  /**
   * The mouse's back button. Browsers map it to history, which this app has
   * none of, so it did nothing at all. It now means what it looks like it
   * should mean: back out of whatever is open, innermost first.
   */
  window.addEventListener('mouseup', (event) => {
    if (event.button !== 3) return;
    event.preventDefault();

    const openDialog = document.querySelector('dialog[open]');
    if (openDialog && openDialog !== el.setupDialog) { openDialog.close(); return; }

    const sheet = document.querySelector('.viewer-sheet, .picker-sheet');
    if (sheet) { sheet.remove(); return; }

    if (!el.editorView.hidden) { editor.close(); return; }
    if (state.tab !== 'home') switchTab('home');
  });
  // Chromium fires its own navigation on these; without this the window can
  // try to go back in history and blank itself.
  window.addEventListener('mousedown', (event) => {
    if (event.button === 3 || event.button === 4) event.preventDefault();
  });

  document.addEventListener('keydown', (event) => {
    if (event.target.matches('input, select, textarea') || document.querySelector('dialog[open]')) return;
    // The editor has its own shortcuts. Without this, Space reached both and
    // started the export preview playing behind the editor.
    if (!el.editorView.hidden || state.tab !== 'export') return;
    // Same reason the transport buttons check it: mid-load the element still
    // holds the previous pack.
    const busy = state.loading;
    if (event.code === 'Space') { event.preventDefault(); if (!busy) player.toggle(); }
    else if (event.code === 'ArrowLeft') { if (!busy) player.seek(el.video.currentTime - (event.shiftKey ? 1 : 5)); }
    else if (event.code === 'ArrowRight') { if (!busy) player.seek(el.video.currentTime + (event.shiftKey ? 1 : 5)); }
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
  saveAdjustments();
}

async function pickGameDir() {
  const picked = await window.api.game.pickFolder();
  if (!picked || !picked.picked) return;

  if (!picked.resolved) {
    toast(
      'That folder has no packs_voice inside it. Pick the folder that contains packs_voice, '
      + 'not packs_voice itself.',
      'warn', 9000
    );
    return;
  }

  state.settings = await window.api.settings.set({ gameDir: picked.resolved });
  state.pack = null;
  state.session = null;
  el.workspace.hidden = true;
  el.emptyState.hidden = false;
  el.setGameDir.value = picked.resolved;
  await rescan(picked.resolved);
}

boot().catch((err) => {
  console.error(err);
  toast(`Startup failed: ${err.message}`, 'error', 12000);
});
