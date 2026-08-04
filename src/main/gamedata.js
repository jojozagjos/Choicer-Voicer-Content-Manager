'use strict';

/**
 * Reads The Choicer Voicer's game folder and builds the project model the rest
 * of the app works with.
 *
 * Layout the game writes (under %APPDATA%/YeahMaybe/ChoicerVoicer/game):
 *
 *   packs_voice/<Pack Name>/
 *     _pack_info.ini            title/subtitle/authors/icon/readme
 *     _backing_track.{mp3,MP3,ogg,wav}   music + SFX bed, no dialogue
 *     dub_video.ogv             the video itself (Theora/Vorbis)
 *     NN_<name>.ini             one dialogue line
 *     NN_<name>.{mp3,ogg}       the original dialogue for that line
 *     <portrait>.png            character art referenced by a line's image=
 *
 *   recordings/dub_recordings/<Pack Name>/<session>/
 *     _dubrecord_<NN_name>.wav  your take for that line
 *     _dubrecord_freestyle.wav  (sessions suffixed _F) one continuous take
 *
 * A line's `dub_timestamps` is its absolute start time on the video timeline,
 * which is the whole trick to reassembling a dub: lay each take down at that
 * offset over the backing track.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const AUDIO_EXTS = ['.mp3', '.MP3', '.ogg', '.OGG', '.wav', '.WAV', '.opus'];
const RECORD_PREFIX = '_dubrecord_';

// The game reads clip metadata from `.ini` or `.cfg`. Some packs in the wild
// ship the identical content as `.txt` instead, so that is read too; a file
// only counts as a line if it actually carries a `dub_timestamps` key.
const LINE_META_EXTS = ['.ini', '.cfg', '.txt'];

// A `.txt` beside a clip that is *not* ini content is the game's shorthand for
// a caption, and it wins over whatever the config says.
const CAPTION_EXT = '.txt';

const IMAGE_EXTS = ['.png', '.jpg', '.jpeg', '.webp', '.gif'];

// Godot-flavoured INI parsing

/**
 * Parses a Godot-serialised scalar: quoted string, number, bool, or array of
 * those. Captions routinely contain escaped quotes (`"\"Im.. sorry\""`), so a
 * naive split on `"` mangles them, so walk the string instead.
 */
function parseValue(raw) {
  const src = raw.trim();
  const { value } = readValue(src, 0);
  return value;
}

function readValue(src, i) {
  i = skipSpace(src, i);
  const ch = src[i];

  if (ch === '"') return readString(src, i);
  if (ch === '[') return readArray(src, i);

  // Bare token: number, bool, null, or unquoted leftover.
  let j = i;
  while (j < src.length && !',]'.includes(src[j])) j++;
  const token = src.slice(i, j).trim();
  if (token === 'true') return { value: true, next: j };
  if (token === 'false') return { value: false, next: j };
  if (token === 'null') return { value: null, next: j };
  const num = Number(token);
  return { value: Number.isNaN(num) ? token : num, next: j };
}

function readString(src, i) {
  let out = '';
  i++; // opening quote
  while (i < src.length) {
    const ch = src[i];
    if (ch === '\\') {
      const esc = src[i + 1];
      if (esc === 'n') out += '\n';
      else if (esc === 't') out += '\t';
      else if (esc === 'r') out += '\r';
      else out += esc;
      i += 2;
      continue;
    }
    if (ch === '"') return { value: out, next: i + 1 };
    out += ch;
    i++;
  }
  return { value: out, next: i };
}

function readArray(src, i) {
  const out = [];
  i++; // opening bracket
  while (i < src.length) {
    i = skipSpace(src, i);
    if (src[i] === ']') return { value: out, next: i + 1 };
    if (src[i] === ',') { i++; continue; }
    const { value, next } = readValue(src, i);
    out.push(value);
    if (next <= i) break; // guard against a malformed file spinning forever
    i = next;
  }
  return { value: out, next: i };
}

function skipSpace(src, i) {
  while (i < src.length && /\s/.test(src[i])) i++;
  return i;
}

/** Reads an .ini into a flat key/value object (section headers are ignored). */
function parseIni(file) {
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch {
    return {};
  }
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1); // strip BOM

  const data = {};
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith(';') || trimmed.startsWith('#')) continue;
    if (trimmed.startsWith('[')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    try {
      data[key] = parseValue(trimmed.slice(eq + 1));
    } catch {
      data[key] = trimmed.slice(eq + 1).trim();
    }
  }
  return data;
}

/**
 * Like parseIni, but keeps the section headers. Chatter packs need this:
 * their `[broad_keywords]` and `[exact_keywords]` sections mean different
 * things, so flattening them would lose the distinction.
 */
function parseIniSections(file) {
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch {
    return {};
  }
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

  const sections = {};
  let current = '';
  sections[current] = {};

  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith(';') || trimmed.startsWith('#')) continue;

    const header = /^\[(.+)\]$/.exec(trimmed);
    if (header) {
      current = header[1].trim();
      sections[current] = sections[current] || {};
      continue;
    }

    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    try {
      sections[current][key] = parseValue(trimmed.slice(eq + 1));
    } catch {
      sections[current][key] = trimmed.slice(eq + 1).trim();
    }
  }

  // Drop the unnamed section when nothing sat above the first header.
  if (!Object.keys(sections['']).length) delete sections[''];
  return sections;
}

/**
 * Timestamps are normally plain seconds (`[12.966]`), but at least one pack
 * writes a timecode instead (`[00:00]`), so accept `MM:SS` and `HH:MM:SS` too.
 */
function toSeconds(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value !== 'string') return 0;

  const text = value.trim();
  if (text.includes(':')) {
    const parts = text.split(':').map((p) => parseFloat(p) || 0);
    return parts.reduce((total, part) => total * 60 + part, 0);
  }
  const num = parseFloat(text);
  return Number.isFinite(num) ? num : 0;
}

// Filesystem helpers

function exists(p) {
  try { fs.accessSync(p); return true; } catch { return false; }
}

function listDirs(dir) {
  try {
    return fs.readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name);
  } catch {
    return [];
  }
}

function listFiles(dir) {
  try {
    return fs.readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isFile())
      .map((e) => e.name);
  } catch {
    return [];
  }
}

/** Finds `<base>.<ext>` for any known audio extension, case variants included. */
function findAudioSibling(dir, base, files) {
  const names = files || listFiles(dir);
  const lowered = new Map(names.map((n) => [n.toLowerCase(), n]));
  for (const ext of AUDIO_EXTS) {
    const hit = lowered.get((base + ext).toLowerCase());
    if (hit) return path.join(dir, hit);
  }
  return null;
}

/**
 * Resolves a line's portrait. Packs are inconsistent here: most name the file
 * outright (`image="Light.png"`), one drops the extension (`image="_icon"`),
 * and one omits the key entirely and just puts `<clip>.png` beside the audio.
 */
/**
 * A clip's caption.
 *
 * A plain `.txt` beside the clip beats whatever the config carries, which is
 * how the game resolves it. The same `.txt` can also *be* the config in packs
 * that use it that way, so a file holding ini content is not treated as a
 * caption or the caption would come out as the raw file.
 */
function readCaption(dir, files, base, data) {
  const lowered = new Map(files.map((n) => [n.toLowerCase(), n]));
  const name = lowered.get(`${base}${CAPTION_EXT}`.toLowerCase());

  if (name) {
    try {
      const raw = fs.readFileSync(path.join(dir, name), 'utf8');
      const looksLikeConfig = /^\s*\[[^\]]+\]/m.test(raw) || /^\s*\w+\s*=/m.test(raw);
      if (!looksLikeConfig && raw.trim()) return raw.trim();
    } catch { /* unreadable, fall through to the config */ }
  }

  return typeof data.caption === 'string' ? data.caption : '';
}

function findImage(dir, files, imageName, base) {
  const lowered = new Map(files.map((n) => [n.toLowerCase(), n]));

  const tryName = (name) => {
    if (!name) return null;
    const direct = lowered.get(String(name).toLowerCase());
    if (direct) return path.join(dir, direct);
    for (const ext of IMAGE_EXTS) {
      const hit = lowered.get(`${name}${ext}`.toLowerCase());
      if (hit) return path.join(dir, hit);
    }
    return null;
  };

  // `_pack_filler_image` is the game's own fallback: any clip without a picture
  // of its own uses it. It only covers the immediate pack folder, never child
  // folders, which is why it is looked for in `dir` rather than walked up.
  return tryName(imageName) || tryName(base) || tryName('_pack_filler_image');
}

/** Default install location of the game's user data, per platform. */
function defaultGameDir() {
  const home = os.homedir();
  if (process.platform === 'win32') {
    const appData = process.env.APPDATA || path.join(home, 'AppData', 'Roaming');
    return path.join(appData, 'YeahMaybe', 'ChoicerVoicer', 'game');
  }
  if (process.platform === 'darwin') {
    return path.join(home, 'Library', 'Application Support', 'YeahMaybe', 'ChoicerVoicer', 'game');
  }
  return path.join(home, '.local', 'share', 'YeahMaybe', 'ChoicerVoicer', 'game');
}

/** A folder counts as the game dir if it has voice packs under it. */
function isGameDir(dir) {
  return exists(path.join(dir, 'packs_voice'));
}

/**
 * Accepts the game dir itself, or any of its usual ancestors
 * (…/ChoicerVoicer, …/YeahMaybe), and resolves down to the real one.
 */
function resolveGameDir(dir) {
  if (!dir) return null;
  if (isGameDir(dir)) return dir;

  const candidates = [
    path.join(dir, 'game'),
    path.join(dir, 'ChoicerVoicer', 'game'),
    path.join(dir, 'YeahMaybe', 'ChoicerVoicer', 'game'),
  ];
  for (const c of candidates) if (isGameDir(c)) return c;
  return null;
}

// Model building

/** Turns `2026-07-25T21_26_13` / `2026-07-25 22_11_51_F` into a real Date. */
function parseSessionDate(name) {
  const m = name.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2})[_:](\d{2})[_:](\d{2})/);
  if (!m) return null;
  const [, y, mo, d, h, mi, s] = m.map(Number);
  const date = new Date(y, mo - 1, d, h, mi, s);
  return Number.isNaN(date.getTime()) ? null : date;
}

function readSessions(recordingsRoot, packName) {
  const packRecordings = path.join(recordingsRoot, packName);
  if (!exists(packRecordings)) return [];

  const sessions = [];
  for (const name of listDirs(packRecordings)) {
    const dir = path.join(packRecordings, name);
    const files = listFiles(dir).filter((f) => f.startsWith(RECORD_PREFIX));
    if (!files.length) continue;

    const takes = {};
    let freestylePath = null;
    for (const file of files) {
      const base = path.basename(file, path.extname(file)).slice(RECORD_PREFIX.length);
      if (base.toLowerCase() === 'freestyle') freestylePath = path.join(dir, file);
      else takes[base] = path.join(dir, file);
    }

    const date = parseSessionDate(name);
    sessions.push({
      id: `${packName}::${name}`,
      name,
      dir,
      date: date ? date.toISOString() : null,
      isFreestyle: Boolean(freestylePath),
      freestylePath,
      takes,
      takeCount: Object.keys(takes).length,
    });
  }

  // Newest first, since that's almost always the take you just recorded.
  sessions.sort((a, b) => {
    if (a.date && b.date) return b.date.localeCompare(a.date);
    return b.name.localeCompare(a.name);
  });
  return sessions;
}

function readPack(packsRoot, recordingsRoot, packName) {
  const dir = path.join(packsRoot, packName);
  const files = listFiles(dir);

  const videoPath = path.join(dir, 'dub_video.ogv');
  if (!exists(videoPath)) return null;

  const info = parseIni(path.join(dir, '_pack_info.ini'));

  // Backing track: extension varies by pack (.MP3, .mp3, .ogg, .wav).
  const backingName = files.find((f) => f.toLowerCase().startsWith('_backing_track.'));
  const backingPath = backingName ? path.join(dir, backingName) : null;

  // Icon: whatever _pack_info points at, else the conventional filenames.
  let iconPath = null;
  for (const candidate of [info.icon, '_icon.png', 'icon.png'].filter(Boolean)) {
    const p = path.join(dir, candidate);
    if (exists(p)) { iconPath = p; break; }
  }

  const lines = [];
  for (const file of files) {
    const ext = path.extname(file).toLowerCase();
    if (!LINE_META_EXTS.includes(ext)) continue;
    if (file.startsWith('_')) continue; // _pack_info and friends

    const data = parseIni(path.join(dir, file));
    // Distinguishes a real line from a stray readme that happens to be .txt.
    if (!('dub_timestamps' in data)) continue;

    const base = path.basename(file, path.extname(file));
    const timestamps = Array.isArray(data.dub_timestamps) ? data.dub_timestamps : [];
    const characters = Array.isArray(data.dub_characters) ? data.dub_characters : [];

    lines.push({
      id: base,
      base,
      time: toSeconds(timestamps[0]),
      character: characters[0] || '',
      caption: readCaption(dir, files, base, data),
      imagePath: findImage(dir, files, data.image, base),
      sourceAudioPath: findAudioSibling(dir, base, files),
    });
  }

  // Numerically, or `10_clip` sorts above `2_clip` and a long pack reads as
  // shuffled from the tenth line onwards.
  lines.sort((a, b) => a.time - b.time
    || String(a.base).localeCompare(String(b.base), undefined, { numeric: true }));

  return {
    id: packName,
    name: packName,
    dir,
    title: typeof info.title === 'string' && info.title ? info.title : packName,
    subtitle: typeof info.subtitle === 'string' ? info.subtitle : '',
    authors: Array.isArray(info.authors) ? info.authors : [],
    readme: typeof info.readme === 'string' ? info.readme : '',
    iconPath,
    videoPath,
    backingPath,
    lines,
    sessions: readSessions(recordingsRoot, packName),
  };
}

/**
 * Scans a game directory into the full model. Packs with no recordings are
 * kept, since you may still want to preview them or dub over the original audio.
 */
function scanGame(gameDir) {
  const resolved = resolveGameDir(gameDir);
  if (!resolved) {
    const err = new Error(`No Choicer Voicer game data found at: ${gameDir}`);
    err.code = 'ENOTGAMEDIR';
    throw err;
  }

  const packsRoot = path.join(resolved, 'packs_voice');
  const recordingsRoot = path.join(resolved, 'recordings', 'dub_recordings');

  const packs = [];
  for (const name of listDirs(packsRoot)) {
    try {
      const pack = readPack(packsRoot, recordingsRoot, name);
      if (pack) packs.push(pack);
    } catch (err) {
      console.error(`Skipping pack "${name}":`, err.message);
    }
  }

  // Packs you've actually dubbed float to the top.
  packs.sort((a, b) => {
    const diff = b.sessions.length - a.sessions.length;
    return diff !== 0 ? diff : a.title.localeCompare(b.title);
  });

  return { gameDir: resolved, packs };
}

module.exports = {
  scanGame,
  resolveGameDir,
  defaultGameDir,
  isGameDir,
  parseIni,
  parseIniSections,
  parseValue,
  toSeconds,
  findAudioSibling,
};
