import { DubPlayer } from './player.js';
import { PackEditor } from './editor.js';

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
  btnModsBrowse: $('#btn-mods-browse'),
  btnModsInbox: $('#btn-mods-inbox'),
  tabAdmin: $('#tab-admin'),
  adminView: $('#admin-view'),
  adminList: $('#admin-list'),
  adminMain: $('#admin-main'),
  btnAdminRefresh: $('#btn-admin-refresh'),
  adminTabs: document.querySelectorAll('[data-admin]'),
  adminSearch: $('#admin-search'),
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
  modsShow: 'browse',
  // Whether GitHub says this account can moderate. Decides what is drawn, never
  // what is allowed — GitHub refuses the actions themselves.
  moderator: false,
  adminItems: [],
  adminShow: 'submissions',
  // Issues decided in this session, so a slow refetch cannot resurrect one.
  adminDecided: new Set(),
  publishers: [],
  adminOpen: null,
};

const player = new DubPlayer(el.video);
const editor = new PackEditor(el.editorView, window.api, toast, askConfirm);

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

function friendlySessionName(session) {
  if (!session) return 'No recordings';
  const date = session.date ? new Date(session.date) : null;
  const label = date
    ? date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
    : session.name;
  const kind = session.isFreestyle ? 'freestyle' : `${session.takeCount} takes`;
  // Recording in the game and then not knowing which of six sessions was the new
  // one is the whole reason for this mark.
  const fresh = sessionIsNew(session) ? '• NEW  ' : '';
  return `${fresh}${label} (${kind})`;
}

/**
 * Whether a session has never been played here.
 *
 * The game does not record this, so the app keeps its own list of the sessions
 * it has played. Anything not in that list is new, which after a run of
 * recording is the only way to tell which one was just made.
 */
function sessionIsNew(session) {
  if (!session || !session.id) return false;
  const heard = state.settings.playedSessions || {};
  return !heard[session.id];
}

/** Remembers that a session has been played, so it stops being marked new. */
async function markSessionPlayed(session) {
  if (!session || !session.id || !sessionIsNew(session)) return;
  state.settings = await window.api.settings.set({
    playedSessions: { ...(state.settings.playedSessions || {}), [session.id]: Date.now() },
  });
  renderSessionOptions();
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

const TYPE_ICONS = {
  voice: '🎬', player: '🧍', host: '🎤', judges: '⚖️',
  studio: '🏛️', menu: '🖼️', chatter: '💬',
};

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
    window.api.review.close();
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
    await refreshMods();
  }
  if (tab === 'admin') await showAdmin(state.adminShow || 'submissions');
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
    row.innerHTML = `
      <strong>${escapeHtml(pack.title)}</strong>
      <span class="muted">${escapeHtml(friendlySessionName(session))}</span>`;
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
async function showAdmin(which = 'submissions', { force = false } = {}) {
  state.adminShow = which;
  state.adminOpen = null;
  for (const button of el.adminTabs) {
    button.classList.toggle('on', button.dataset.admin === which);
  }
  el.adminMain.innerHTML = '';
  el.adminSearch.placeholder = which === 'publishers' ? 'Search people…' : 'Search…';

  // Both of these read the directory, which is otherwise held for the session.
  if (force && (which === 'publishers' || which === 'listed')) state.mods = null;

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
  if (!state.mods) state.mods = await window.api.mods.index().catch(() => null);
  const data = state.mods;

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
    </div>`;

  el.adminMain.querySelector('#listed-open')
    .addEventListener('click', () => window.api.shell.openExternal(pack.downloadUrl));
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

  // The Mods tab may never have been opened, so the index is fetched rather
  // than assumed.
  if (!state.mods) state.mods = await window.api.mods.index().catch(() => null);
  const data = state.mods;

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
    button.addEventListener('click', () => showPublisher(who));
    el.adminList.append(button);
  }
}

/** Everything known about one publisher. */
function showPublisher(who) {
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
      <button class="btn btn-small" id="admin-open-profile">Open on GitHub</button>
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
      detail: 'It stops appearing in the Mods tab. The record is kept and the file stays '
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

  toast(listed ? 'Listed again.' : 'Unlisted.', 'ok');
  // The directory changes when the workflow runs, which is not instant, so what
  // is held here is stale either way.
  state.mods = null;
  await refreshAdminPublishers();
}

/** Everything waiting to be looked at. */
async function refreshAdminQueue() {
  const wantReports = state.adminShow === 'reports';
  el.adminList.innerHTML = '<p class="muted small">Looking…</p>';

  const said = await window.api.review.queue().catch((e) => ({ ok: false, error: e.message }));
  if (!said.ok) {
    el.adminList.innerHTML = `<p class="muted small">${escapeHtml(said.error)}</p>`;
    return;
  }

  // Anything decided in this session stays gone even if GitHub still reports it
  // as open, which it does for a few seconds after closing.
  state.adminItems = said.items.filter((i) => !state.adminDecided.has(i.number));

  // Uploads and reports are separate jobs. Kept in one fetch because they are
  // one list on GitHub, but never shown together — a report about a pack that
  // is already listed gets lost among packs waiting to be read.
  const mine = state.adminItems.filter((i) => (i.kind === 'report') === wantReports);

  if (!mine.length) {
    const nothing = wantReports ? 'No reports.' : 'Nothing waiting to be looked at.';
    el.adminList.innerHTML = `<p class="muted small">${nothing}</p>`;
    el.adminMain.innerHTML = `<div class="mods-empty"><h3>All clear</h3>
      <p class="muted">${nothing}</p></div>`;
    return;
  }

  drawAdminQueue(mine);
}

/** Draws the queue rail from a list of items, narrowed by the search box. */
function drawAdminQueue(items) {
  const shown = matchingAdmin(items,
    (i) => `${i.record ? i.record.title : i.title} ${i.author || ''} #${i.number}`);
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
      <span class="admin-kind ${item.kind === 'report' ? 'is-report' : ''}">
        ${item.kind === 'report' ? 'Report' : 'Pack'}
      </span>
      <span class="admin-item-title">${escapeHtml(item.record ? item.record.title : item.title)}</span>
      <span class="muted small">#${item.number} by ${escapeHtml(item.author || 'someone')}</span>`;
    button.addEventListener('click', () => openForReview(item));
    el.adminList.append(button);
  }
}

/** Opens one queue item, downloading its pack into the sandbox. */
async function openForReview(item) {
  state.adminOpen = item.number;
  await window.api.review.close();
  refreshAdminQueue();

  if (item.kind === 'report' || !item.record) {
    // A report is words, not a pack. Shown as written, escaped.
    el.adminMain.innerHTML = `
      <header class="admin-head">
        <div>
          <h2>${escapeHtml(item.title)}</h2>
          <p class="muted small">Report #${item.number} by ${escapeHtml(item.author || 'someone')}</p>
        </div>
        <a class="btn btn-small" id="admin-open-github">Open on GitHub</a>
      </header>
      <pre class="admin-body">${escapeHtml(item.body || '(nothing written)')}</pre>`;
    el.adminMain.querySelector('#admin-open-github')
      .addEventListener('click', () => window.api.shell.openExternal(item.url));
    return;
  }

  const record = item.record;
  el.adminMain.innerHTML = `<div class="mods-empty"><h3>Fetching the pack…</h3>
    <p class="muted small" id="admin-progress"></p></div>`;
  const progress = el.adminMain.querySelector('#admin-progress');

  const stop = window.api.review.onProgress(({ stage, percent }) => {
    if (!progress) return;
    progress.textContent = stage ? `${stage}…`
      : percent != null ? `downloading ${Math.round(percent)}%` : '';
  });

  let pack;
  try {
    pack = await window.api.review.open(record);
  } finally {
    stop();
  }

  if (!pack.ok) {
    el.adminMain.innerHTML = `<div class="mods-empty"><h3>Could not open it</h3>
      <p class="muted">${escapeHtml(pack.error)}</p></div>`;
    return;
  }

  renderReview(item, record, pack);
}

/** The pack itself, laid out to be judged. */
function renderReview(item, record, pack) {
  // Whatever the check found, worst first. Nothing at all is the normal
  // outcome and deliberately shows as nothing rather than as a green tick —
  // a reassurance on every pack is a reassurance nobody reads.
  const report = pack.report || { findings: [] };
  const warn = report.findings.map((f) => `
    <p class="admin-finding is-${f.level}">
      <b>${escapeHtml(f.what)}</b>
      <span>${escapeHtml(f.detail)}</span>
    </p>`).join('');

  el.adminMain.innerHTML = `
    <header class="admin-head">
      <div>
        <h2>${escapeHtml(record.title)}</h2>
        <p class="muted small">
          ${escapeHtml(record.type)} pack by ${escapeHtml(record.author)} ·
          ${formatBytes(pack.totalBytes)} · ${pack.files.length} files ·
          submission #${item.number}
        </p>
      </div>
      <button class="btn btn-small" id="admin-open-github">Open on GitHub</button>
    </header>

    ${warn}
    <p class="admin-summary">${escapeHtml(record.summary || '')}</p>

    ${pack.video ? (pack.video.playable === false
      ? `<p class="admin-warn">The video could not be prepared for playing, so it cannot be
         checked here: ${escapeHtml(pack.video.why || 'no reason given')}</p>`
      : `<video class="admin-video" src="${pack.video.url}" controls preload="metadata"></video>`)
      : '<p class="muted small">This pack has no video.</p>'}

    ${pack.images.length ? `<h4 class="admin-h">Pictures</h4>
      <div class="admin-images">
        ${pack.images.map((i) => `<figure>
          <img src="${i.url}" alt="${escapeHtml(i.name)}" loading="lazy"
               onerror="this.closest('figure').classList.add('broken')" />
          <span class="admin-broken">could not be shown</span>
          <figcaption class="muted small">${escapeHtml(i.name)}</figcaption></figure>`).join('')}
      </div>` : ''}

    ${pack.audio.length ? `<h4 class="admin-h">Audio (${pack.audio.length})</h4>
      <div class="admin-audio">
        ${pack.audio.map((a) => `<div class="admin-clip">
          <span class="muted small">${escapeHtml(a.name)}</span>
          <audio src="${a.url}" controls preload="none"></audio></div>`).join('')}
      </div>` : ''}

    ${(pack.lines || []).length ? `<h4 class="admin-h">
        Everything said in this pack (${pack.lines.length} lines)</h4>
      <div class="admin-script">
        ${pack.lines.map((l) => `<div class="script-line">
          <span class="script-at">${formatClock(l.time)}</span>
          <span class="script-who">${escapeHtml(l.character || 'nobody set')}</span>
          <span class="script-said${l.caption ? '' : ' is-empty'}">${
            l.caption ? escapeHtml(l.caption) : 'nothing written'}</span>
        </div>`).join('')}
      </div>` : '<p class="muted small">This pack has no spoken lines.</p>'}

    <h4 class="admin-h">Everything in it</h4>
    <div class="admin-files">
      ${pack.files.map((f) => `<div><span>${escapeHtml(f.name)}</span>
        <span class="muted small">${formatBytes(f.bytes)}</span></div>`).join('')}
    </div>

    <div class="admin-decide">
      <div class="admin-decide-what">
        <b>${escapeHtml(record.title)}</b>
        <span class="muted small">by ${escapeHtml(record.author)} ·
          ${escapeHtml(record.licence || 'unstated')} licence ·
          ${(record.tags || []).length ? escapeHtml((record.tags || []).join(', ')) : 'no tags'}</span>
      </div>
      <div class="admin-decide-buttons">
        <button class="btn btn-primary" id="admin-approve">✓ List it</button>
        <button class="btn" id="admin-setaside">↩ Send back</button>
        <button class="btn btn-danger" id="admin-reject">✕ Refuse it</button>
        <button class="btn btn-danger" id="admin-ban">⨂ Refuse and ban</button>
      </div>
    </div>`;

  el.adminMain.querySelector('#admin-open-github')
    .addEventListener('click', () => window.api.shell.openExternal(item.url));
  el.adminMain.querySelector('#admin-approve')
    .addEventListener('click', () => decideReview(item, 'approve'));
  el.adminMain.querySelector('#admin-reject')
    .addEventListener('click', () => decideReview(item, 'reject'));
  el.adminMain.querySelector('#admin-setaside')
    .addEventListener('click', () => decideReview(item, 'setaside'));
  el.adminMain.querySelector('#admin-ban')
    .addEventListener('click', () => decideReview(item, 'ban', record.author));
}

/** Approves or refuses, and says why. */
async function decideReview(item, decision, author) {
  const approving = decision === 'approve';
  const banning = decision === 'ban';
  const setting = decision === 'setaside';

  const asked = {
    approve: {
      title: 'List this pack?',
      detail: 'It will be listed in the Mods tab and the author told. Anything you write here '
        + 'is added to that message.',
      placeholder: 'Anything to add (optional)',
      go: 'List it',
    },
    reject: {
      title: 'Refuse this pack?',
      detail: 'The author will be told it was not listed, along with what you write here. Say '
        + 'what would need to change. Being refused with no explanation is the worst version '
        + 'of this for somebody who made something.',
      placeholder: 'Why it was not listed',
      go: 'Refuse it',
    },
    // Neither yes nor no. For a pack that is nearly right, where the author only
    // needs to change something and try again — refusing it says the pack was
    // unacceptable, which is a different and harsher message.
    setaside: {
      title: 'Send this back?',
      detail: 'The submission is closed without listing the pack, and the author is told what '
        + 'to change so they can publish it again.\n\n'
        + 'Nothing is held against them. This is for a pack that is nearly right.',
      placeholder: 'What to change before trying again',
      go: 'Send it back',
    },
    ban: {
      title: `Refuse this and ban ${author || 'this account'}?`,
      detail: 'The pack is refused and the account is blocked from publishing anything else. '
        + 'Anything already listed by them is hidden.\n\n'
        + 'For packs that should never have been sent. It can be undone later with '
        + '/unban, but the author is not told anything beyond the refusal.',
      placeholder: 'Why (the author sees this)',
      go: 'Refuse and ban',
    },
  }[decision];

  const reason = await askText({
    ...asked,
    buttons: [asked.go, 'Cancel'],
    // Only approving can go through without a word. Every other outcome leaves
    // somebody wondering what happened to their pack.
    required: !approving,
    mark: banning ? '⨂' : setting ? '↩' : approving ? '✓' : '✕',
  });
  if (reason === null) return;

  const said = await window.api.review.decide(item.number, decision, reason, author);
  if (!said.ok) {
    toast(`Could not do that: ${said.error}`, 'error', 10000);
    return;
  }

  toast({
    approve: 'Listed.',
    reject: 'Refused, and the author told.',
    setaside: 'Sent back. They can publish it again once it is changed.',
    ban: `Refused, and ${author || 'that account'} is blocked from publishing.`,
  }[decision], 'ok');
  state.adminOpen = null;
  el.adminMain.innerHTML = '';

  // Dropped from the list here rather than waiting for the refetch to notice.
  // GitHub does not always report an issue as closed the instant it is closed,
  // so refreshing alone left a decided pack sitting in the queue looking like
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

/** How each submission outcome is shown. */
const INBOX_STATES = {
  waiting: { label: 'Waiting to be looked at', tone: 'muted' },
  listed: { label: 'Listed', tone: 'ok' },
  refused: { label: 'Not listed', tone: 'bad' },
  closed: { label: 'Closed', tone: 'muted' },
};

/** Switches the Mods tab between browsing and your own submissions. */
async function showMods(which = 'browse') {
  state.modsShow = which;
  el.btnModsBrowse.classList.toggle('on', which === 'browse');
  el.btnModsInbox.classList.toggle('on', which === 'inbox');
  // Searching the whole directory makes no sense while looking at your own few.
  el.modsSearch.hidden = which !== 'browse';

  if (which === 'inbox') await renderInbox();
  else await refreshMods();
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
  el.modsSubtitle.textContent = '';
  el.modsGrid.innerHTML = '<p class="muted small">Looking…</p>';

  const said = await window.api.mods.inbox().catch((e) => ({ ok: false, error: e.message }));

  if (!said.ok) {
    el.modsGrid.innerHTML = `<div class="mods-empty"><h3>Could not be read</h3>
      <p class="muted">${escapeHtml(said.error)}</p></div>`;
    return;
  }
  if (!said.configured || !said.signedIn) {
    el.modsGrid.innerHTML = `<div class="mods-empty"><h3>Not signed in</h3>
      <p class="muted">Link a GitHub account in Settings to publish packs and to see what
         happened to them.</p></div>`;
    return;
  }

  const standing = said.standing || {};
  const note = standing.banned
    ? '<p class="admin-warn">This account cannot publish to the directory.</p>'
    : standing.trusted
      ? '<p class="inbox-standing is-ok">Trusted. Your packs are listed without waiting.</p>'
      : '<p class="inbox-standing">Your first pack is looked at by a person. After that they '
        + 'are listed straight away.</p>';

  el.modsSubtitle.textContent = `Signed in as ${said.login}`;

  if (!said.items.length) {
    el.modsGrid.innerHTML = `${note}<div class="mods-empty"><h3>Nothing submitted yet</h3>
      <p class="muted">Packs you publish from Content show up here, with what happened to
         them.</p></div>`;
    return;
  }

  // What was already known last time this was opened. Anything whose outcome
  // has moved since then is marked, so a decision made days ago is not just
  // another row in a list that all looks the same.
  const seen = JSON.parse(localStorage.getItem('inboxSeen') || '{}');
  const nowSeen = {};
  let changed = 0;

  el.modsGrid.innerHTML = note + said.items.map((item) => {
    const shown = INBOX_STATES[item.outcome] || INBOX_STATES.closed;
    nowSeen[item.number] = item.outcome;
    const isNew = seen[item.number] !== undefined && seen[item.number] !== item.outcome;
    if (isNew) changed++;

    return `<article class="inbox-item${isNew ? ' is-changed' : ''}">
      <div class="inbox-head">
        <b>${isNew ? '<i class="inbox-dot" title="This changed since you last looked"></i>' : ''}${
          escapeHtml(item.title)}</b>
        <span class="inbox-state is-${shown.tone}">${shown.label}</span>
      </div>
      ${item.reason ? `<p class="inbox-reason">${escapeHtml(item.reason)}</p>` : ''}
      <div class="inbox-foot">
        <span class="muted small">Sent ${formatWhen(item.openedAt)}</span>
        <button class="btn btn-small" data-url="${escapeHtml(item.url)}">Open on GitHub</button>
      </div>
    </article>`;
  }).join('');

  // Written after drawing, so the marks survive until they have been seen.
  localStorage.setItem('inboxSeen', JSON.stringify(nowSeen));
  if (changed) {
    el.modsSubtitle.textContent
      = `Signed in as ${said.login} · ${changed} update${changed === 1 ? '' : 's'}`;
  }

  for (const button of el.modsGrid.querySelectorAll('[data-url]')) {
    button.addEventListener('click', () => window.api.shell.openExternal(button.dataset.url));
  }
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
  const result = await window.api.mods.index().catch((err) => ({ ok: false, error: err.message }));
  state.mods = result;
  renderModTypes();
  renderMods();
}

function renderModTypes() {
  el.modsTypes.innerHTML = '';
  const packs = (state.mods && state.mods.packs) || [];

  for (const type of MOD_TYPES) {
    const count = type.id === 'all'
      ? packs.length
      : packs.filter((p) => p.type === type.id).length;

    const button = document.createElement('button');
    button.className = 'type-btn';
    button.dataset.type = type.id;
    button.classList.toggle('on', type.id === (state.modsType || 'all'));
    button.innerHTML = `
      <span>${type.id === 'all' ? '✦' : TYPE_ICONS[type.id] || '📦'}</span>
      <span>${escapeHtml(type.label)}</span>
      <span class="count">${count}</span>`;
    button.addEventListener('click', () => {
      state.modsType = type.id;
      renderModTypes();
      renderMods();
    });
    el.modsTypes.append(button);
  }
}

/** Download counts are approximate, so they are shown that way. */
function formatDownloads(count) {
  if (!count) return 'new';
  if (count >= 1000) return `${(count / 1000).toFixed(1)}k downloads`;
  return `${count} download${count === 1 ? '' : 's'}`;
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
  let packs = data.packs;
  if (chosen.id !== 'all') packs = packs.filter((p) => p.type === chosen.id);
  if (query) {
    packs = packs.filter((p) => `${p.title} ${p.author} ${(p.tags || []).join(' ')}`
      .toLowerCase().includes(query));
  }

  el.modsSubtitle.textContent = query
    ? `${packs.length} of ${data.packs.length} matching "${query}"`
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

/** A time as m:ss, for reading a script against the video. */
function formatClock(seconds) {
  const whole = Math.max(0, Math.floor(Number(seconds) || 0));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
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
      <span class="mod-icon">${TYPE_ICONS[pack.type] || '📦'}</span>
      <div class="mod-card-name">
        <h3>${escapeHtml(pack.title)}</h3>
        <p class="muted small">by ${escapeHtml(pack.author)}</p>
      </div>
    </div>
    <p class="mod-summary">${escapeHtml(pack.summary || '')}</p>
    ${contentFlagsHtml(pack.content)}
    <div class="mod-card-foot">
      <span class="muted small">${formatBytes(pack.bytes)} · ${formatDownloads(pack.downloads)}</span>
      <span class="mod-actions">
        <span class="mod-status muted small"></span>
        <button class="btn btn-small ${installed ? '' : 'btn-primary'}">
          ${installed ? 'Installed' : 'Install'}
        </button>
      </span>
    </div>`;

  const button = card.querySelector('button');
  const status = card.querySelector('.mod-status');
  if (installed) button.disabled = true;
  else button.addEventListener('click', () => installMod(pack, button, status));

  return card;
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
async function sharePack(pack) {
  const go = await askConfirm({
    title: `Share "${pack.title}"?`,
    detail: 'This makes one zip in your exports folder, ready to send to anyone.\n\n'
      + 'It is shrunk on the way, usually to about half the size, which is worth a few '
      + 'minutes for a pack with video in it. Your own copy is not touched.\n\n'
      + 'Nothing is uploaded and nothing leaves this machine.',
    buttons: ['Make the zip', 'Cancel'],
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
      + 'Send it to anyone. They open the Mods tab and pick it.'
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
    await publishPack(result, pack, Boolean(already));
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
async function ensureSignedIn({ force = false } = {}) {
  const who = await window.api.mods.whoAmI();
  if (!who.configured) {
    toast('This build cannot sign in to GitHub.', 'error', 7000);
    return null;
  }
  // `force` is for linking a different account from Settings, where already
  // being signed in is the reason you pressed the button.
  if (who.signedIn && !force) return who;

  const go = await askConfirm({
    title: 'Sign in to GitHub',
    detail: 'Publishing puts the pack on your own GitHub account, so it stays yours and you '
      + 'can take it down whenever you like.\n\n'
      + 'You will get a short code to type on github.com. It is only asked for once.\n\n'
      + 'The app can create one repository for your packs and add releases to it. It cannot '
      + 'read your other repositories.',
    buttons: ['Sign in', 'Cancel'],
    mark: '🔑',
  });
  if (go !== 0) return null;

  // Arrives while signIn is still waiting, which is the only moment it is
  // useful, so it is shown from here rather than returned.
  const stop = window.api.mods.onDeviceCode(({ userCode, verificationUri }) => {
    window.api.shell.openExternal(verificationUri);
    askConfirm({
      title: 'Your code',
      detail: `Type this on ${verificationUri}, which should have just opened:\n\n`
        + `        ${userCode}\n\n`
        + 'Leave this open until it is done.',
      buttons: ['Done'],
      mark: '🔑',
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
    mark: '🔑',
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
  if (!state.mods) state.mods = await window.api.mods.index().catch(() => null);
  const data = state.mods;
  if (!data || !data.ok || !data.configured) return null;

  const id = packIdFor(pack.title);
  return data.packs.find((p) => p.id === id
    && (p.author || '').toLowerCase() === login.toLowerCase()) || null;
}

async function publishPack(packaged, pack, updating = false) {
  // A listing with no picture is a grey box in a grid of pictures, and nobody
  // installs it. Refused here rather than after the upload, so the work is not
  // wasted on something that would look broken in the directory.
  if (!pack.iconPath && !pack.iconUrl) {
    await askConfirm({
      title: 'This pack needs a picture first',
      detail: 'Packs in the directory are shown as a grid of pictures, and one without a '
        + 'picture is a blank space nobody clicks.\n\n'
        + 'Add one by opening the pack and setting its picture, then publish it again. '
        + 'Packaging it as a zip to send to somebody works without one.',
      buttons: ['Done'],
      mark: '🖼',
    });
    return;
  }

  const me = await ensureSignedIn();
  if (!me) return;

  // Asked before the upload, because it belongs to the listing rather than to
  // the file, and because a question after several minutes of uploading is a
  // question nobody reads properly.
  const flags = await askChecklist({
    title: 'Does this pack contain any of these?',
    detail: 'Anything ticked is shown on the listing so people know what they are '
      + 'installing. Nothing here stops a pack being listed.\n\n'
      + 'Leave them all clear if none apply.',
    options: (state.info && state.info.contentFlags) || [],
    buttons: ['Publish it', 'Cancel'],
    mark: '⚠',
  });
  if (flags === null) return;

  const stop = window.api.mods.onPublishProgress((p) => showPublishProgress(p, updating));
  showPublishProgress({ stage: 'checking' }, updating);

  let result;
  try {
    result = await window.api.mods.publish(packaged.zipPath, {
      id: packIdFor(pack.title),
      type: pack.type,
      title: pack.title,
      summary: pack.subtitle || `A ${pack.type} pack.`,
      sha256: packaged.sha256,
      content: flags,
      // So the main process can check this pack was not somebody else's.
      packDir: pack.dir,
      licence: 'unstated',
    });
  } finally {
    stop();
    showProgress(false);
    el.btnProgressCancel.hidden = false;
  }

  if (!result.ok) {
    toast(`Could not publish it: ${result.error}`, 'error', 10000);
    return;
  }

  // The directory has changed, so the copy held for this session is stale.
  state.mods = null;

  const where = await askConfirm({
    title: result.submitted ? (updating ? 'Update sent' : 'Published') : 'Uploaded',
    detail: result.submitted
      ? `"${pack.title}" is on your GitHub account and has been ${updating ? 'offered as an update' : 'offered to the directory'}.\n\n`
        + (updating
          ? 'The listing keeps its place and its download count. Nothing else is needed from you.'
          : 'It will appear in the Mods tab once it has been looked over. Nothing else is '
            + 'needed from you.')
      : `"${pack.title}" is on your GitHub account and anyone with the address can install `
        + 'it.\n\nThere is no pack directory set up yet, so it has not been listed anywhere. '
        + 'The address works regardless.',
    buttons: [result.submitted ? 'See the submission' : 'See the release', 'Done'],
    mark: '✓',
    cancelIndex: 1,
  });

  if (where === 0) window.api.shell.openExternal(result.issueUrl || result.releaseUrl);
}

function renderContentTypes() {
  el.contentTypes.innerHTML = '';
  if (!state.content) return;

  for (const type of state.content.types) {
    const errors = type.packs.reduce((n, p) => n + p.counts.error, 0);
    const button = document.createElement('button');
    button.className = 'type-btn';
    button.dataset.type = type.id;
    button.classList.toggle('on', type.id === state.contentType);
    button.innerHTML = `
      <span>${TYPE_ICONS[type.id] || '📦'}</span>
      <span>${escapeHtml(type.label)}</span>
      <span class="count">${errors ? `<b class="badge badge-error">${errors}</b> ` : ''}${type.packs.length}</span>`;
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
        ? '<img class="tile-icon" src="../../assets/placeholder.png" alt="No picture yet" />'
        : `<div class="tile-icon tile-icon-blank">${TYPE_ICONS[type.id] || '📦'}</div>`;

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
      ? '<img src="../../assets/placeholder.png" alt="No picture yet" />'
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

    <div class="detail-actions">
      <button type="button" class="btn btn-primary" id="btn-detail-edit"
              ${converting ? 'disabled' : ''}>✎ Edit this pack</button>
      <button type="button" class="btn" id="btn-detail-share"
              ${converting ? 'disabled' : ''}>↗ Share this pack</button>
      <button type="button" class="btn" id="btn-detail-open">📂 Open folder</button>
      <button type="button" class="btn btn-danger" id="btn-detail-delete"
              ${converting ? 'disabled' : ''}>✕ Delete</button>
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
    id: 'voice', icon: '🎬', label: 'Dub or voice pack',
    blurb: 'Clips to dub over. Add a video and cut it up in the editor.',
    accepts: 'video',
    // Name and a video is all it takes; captions, clips and pictures are all
    // made in the editor afterwards.
    dropHint: 'Drop the video. Any format works, it is converted to .ogv for you.',
    fields: [],
    opensEditor: true,
  },
  {
    id: 'player', icon: '🧍', label: 'Player',
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
    id: 'host', icon: '🎤', label: 'Host',
    blurb: 'Presents the show. Starts with a full script you can rewrite.',
    accepts: 'image',
    dropHint: 'Drop a picture for the host. It becomes host.png.',
    fields: [],
  },
  {
    id: 'judges', icon: '⚖️', label: 'Judge panel',
    blurb: 'Five judges who score each round.',
    accepts: 'all',
    dropHint: 'Drop five pictures, plus voices and score blips if you have them.',
    fields: [],
  },
  {
    id: 'studio', icon: '🏛️', label: 'Studio',
    blurb: 'The set the show is filmed on.',
    accepts: 'all',
    dropHint: 'Drop music, a screen video, or a .glb model.',
    fields: [],
  },
  {
    id: 'menu', icon: '🖼️', label: 'Menu theme',
    blurb: 'Background, music and button sounds for the menus.',
    accepts: 'all',
    dropHint: 'Drop a background image, music, and button sounds.',
    fields: [],
  },
  {
    id: 'chatter', icon: '💬', label: 'Chatter pack',
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
      <span>${type.icon}</span>
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
    '♥ Donate',
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
  if (chosen) el.sessionSelect.value = chosen;
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
function askConfirm({ title, detail, buttons, mark = '?', danger = false, cancelIndex = -1 }) {
  return new Promise((resolve) => {
    el.confirmMark.textContent = mark;
    el.confirmMark.classList.toggle('danger', danger);
    el.confirmTitle.textContent = title;
    el.confirmDetail.textContent = detail || '';
    el.confirmDetail.hidden = !detail;
    el.confirmButtons.innerHTML = '';

    let settled = false;
    const finish = (index) => {
      if (settled) return;
      settled = true;
      el.confirmDialog.removeEventListener('close', onClose);
      el.confirmDialog.close();
      resolve(index);
    };
    // Esc, or anything else that dismisses it, counts as declining.
    const onClose = () => finish(cancelIndex);

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

    el.confirmDialog.addEventListener('close', onClose);
    el.confirmDialog.showModal();
    const first = el.confirmButtons.querySelector('button');
    if (first) first.focus();
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

    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      el.confirmDialog.removeEventListener('close', onClose);
      field.remove();
      el.confirmDialog.close();
      resolve(value);
    };
    const onClose = () => finish(null);

    const go = document.createElement('button');
    go.type = 'button';
    go.className = 'btn btn-small btn-primary';
    go.textContent = buttons[0];
    go.addEventListener('click', () => {
      const said = field.value.trim();
      if (required && !said) {
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
function askChecklist({ title, detail, options, mark = '?', buttons }) {
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
        <input type="checkbox" value="${escapeHtml(o.id)}" />
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
    const onClose = () => finish(null);

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
    markSessionPlayed(state.session);
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
  el.modsSearch.addEventListener('input', () => renderMods());
  el.modsSearch.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    el.modsSearch.value = '';
    renderMods();
  });
  el.btnModsRefresh.addEventListener('click', () => (state.modsShow === 'inbox' ? renderInbox() : refreshMods({ force: true })));
  el.btnModsBrowse.addEventListener('click', () => showMods('browse'));
  el.btnModsInbox.addEventListener('click', () => showMods('inbox'));

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
  });
  bindMixControl(el.volDub, el.volDubVal, 200, (v) => {
    player.setDubVolume(v / 100);
    renderMixReadout();
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
