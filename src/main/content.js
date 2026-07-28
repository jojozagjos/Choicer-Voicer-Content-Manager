'use strict';

/**
 * Reads and checks every kind of content pack the game supports.
 *
 * `gamedata.js` deals with dubs specifically, because exporting a dub needs
 * timings and takes. This module is broader and shallower: it walks all seven
 * pack folders, works out what each pack is, and reports what is missing or
 * wrong so the app can tell you before the game silently ignores it.
 *
 * Every rule here comes from docs/PACK_FORMATS.md, which in turn comes from
 * the official content guide plus reading real packs. Where a pack type is
 * undocumented upstream (host, menu) the rules come from real examples, so
 * they are deliberately lenient: warn, never fail.
 */

const fs = require('fs');
const path = require('path');

const AUDIO_EXTS = ['.wav', '.mp3', '.ogg', '.opus'];
const IMAGE_EXTS = ['.png', '.jpg', '.jpeg', '.webp'];
const VIDEO_EXTS = ['.ogv'];
const MODEL_EXTS = ['.glb', '.gltf'];

// What the game will not load, but people drop in anyway.
const FOREIGN_VIDEO = ['.mp4', '.webm', '.mov', '.avi', '.mkv', '.m4v', '.wmv', '.flv'];
const FOREIGN_AUDIO = ['.m4a', '.aac', '.flac', '.wma', '.aiff', '.aif'];

const MAX_DUB_CLIP_SECONDS = 6;
const MAX_VOICE_CLIP_SECONDS = 60;

// Levels, worst first. `error` means the game will not use it as intended.
const ERROR = 'error';
const WARN = 'warn';
const INFO = 'info';

// ---------------------------------------------------------------------------
// Small filesystem helpers
// ---------------------------------------------------------------------------

function listFiles(dir) {
  try {
    return fs.readdirSync(dir, { withFileTypes: true }).filter((e) => e.isFile()).map((e) => e.name);
  } catch {
    return [];
  }
}

function listDirs(dir) {
  try {
    return fs.readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name);
  } catch {
    return [];
  }
}

/** Case-insensitive lookup of `base` with any of `exts`, or `base` verbatim. */
function findFile(files, base, exts = []) {
  const lower = new Map(files.map((f) => [f.toLowerCase(), f]));
  const direct = lower.get(String(base).toLowerCase());
  if (direct) return direct;
  for (const ext of exts) {
    const hit = lower.get(`${base}${ext}`.toLowerCase());
    if (hit) return hit;
  }
  return null;
}

const extOf = (name) => path.extname(name).toLowerCase();
const baseOf = (name) => path.basename(name, path.extname(name));

function readJson(file) {
  try {
    return { ok: true, data: JSON.parse(fs.readFileSync(file, 'utf8')) };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

// ---------------------------------------------------------------------------
// Issues
// ---------------------------------------------------------------------------

function issue(level, message, fix) {
  return fix ? { level, message, fix } : { level, message };
}

/**
 * Flags media the game cannot read. This is the single most common reason a
 * pack silently does nothing, and it is always fixable by converting.
 */
function checkForeignMedia(files, issues) {
  for (const file of files) {
    const ext = extOf(file);
    if (FOREIGN_VIDEO.includes(ext)) {
      issues.push(issue(ERROR, `${file} is not a format the game can play`, 'convert-video'));
    } else if (FOREIGN_AUDIO.includes(ext)) {
      issues.push(issue(ERROR, `${file} is not a format the game can play`, 'convert-audio'));
    }
  }
}

// ---------------------------------------------------------------------------
// Per-type inspectors
// ---------------------------------------------------------------------------

/** Voice packs and dub packs share packs_voice; the video decides which. */
function inspectVoice(dir, files, { parseIni, findAudioSibling }) {
  const issues = [];
  const video = findFile(files, 'dub_video', VIDEO_EXTS);
  const isDub = Boolean(video);

  const info = findFile(files, '_pack_info', ['.ini', '.txt']);
  const meta = info ? parseIni(path.join(dir, info)) : {};
  const backingName = findFile(files, '_backing_track', AUDIO_EXTS);

  // Clips are metadata files that actually declare a timestamp.
  const clips = [];
  for (const file of files) {
    if (!['.ini', '.txt'].includes(extOf(file))) continue;
    if (file.startsWith('_')) continue;
    const data = parseIni(path.join(dir, file));
    if (!('dub_timestamps' in data)) continue;

    const base = baseOf(file);
    const times = Array.isArray(data.dub_timestamps) ? data.dub_timestamps : [];
    clips.push({
      base,
      time: typeof times[0] === 'number' ? times[0] : parseFloat(times[0]) || 0,
      caption: typeof data.caption === 'string' ? data.caption : '',
      character: Array.isArray(data.dub_characters) ? data.dub_characters[0] || '' : '',
      image: typeof data.image === 'string' ? data.image : '',
      audio: findAudioSibling(dir, base, files),
    });
  }

  const orphanAudio = files.filter((f) =>
    AUDIO_EXTS.includes(extOf(f))
    && !f.startsWith('_')
    && !clips.some((c) => c.base.toLowerCase() === baseOf(f).toLowerCase()));

  checkForeignMedia(files, issues);

  if (isDub) {
    if (!backingName) {
      issues.push(issue(WARN, 'No backing track, so the video will be silent behind your dub'));
    }
  } else if (files.some((f) => FOREIGN_VIDEO.includes(extOf(f)))) {
    issues.push(issue(INFO, 'Convert the video to .ogv to turn this into a dub pack', 'convert-video'));
  }

  if (!clips.length) {
    issues.push(issue(WARN, 'No clips yet. Add audio files and give each one a timestamp'));
  }
  for (const clip of clips) {
    if (!clip.audio) issues.push(issue(ERROR, `${clip.base} has metadata but no audio file`));
  }
  if (orphanAudio.length) {
    issues.push(issue(INFO,
      `${orphanAudio.length} audio file${orphanAudio.length > 1 ? 's have' : ' has'} no metadata yet`));
  }
  if (!findFile(files, '_icon', IMAGE_EXTS) && !meta.icon) {
    issues.push(issue(INFO, 'No pack icon'));
  }

  return {
    kind: isDub ? 'dub' : 'voice',
    title: typeof meta.title === 'string' && meta.title ? meta.title : null,
    subtitle: typeof meta.subtitle === 'string' ? meta.subtitle : '',
    authors: Array.isArray(meta.authors) ? meta.authors
      : typeof meta.authors === 'string' && meta.authors ? [meta.authors] : [],
    readme: typeof meta.readme === 'string' ? meta.readme : '',
    icon: findFile(files, meta.icon || '_icon', IMAGE_EXTS) || findFile(files, 'icon', IMAGE_EXTS),
    video,
    // The editor needs the real file to cut clips out of.
    videoPath: video ? path.join(dir, video) : null,
    backingPath: backingName ? path.join(dir, backingName) : null,
    // Sorted, so the editor lists them in the order they play.
    clips: clips.sort((a, b) => a.time - b.time),
    clipCount: clips.length,
    characters: [...new Set(clips.map((c) => c.character).filter(Boolean))],
    summary: isDub ? `${clips.length} lines` : `${clips.length} clips`,
    issues,
    maxClipSeconds: isDub ? MAX_DUB_CLIP_SECONDS : MAX_VOICE_CLIP_SECONDS,
  };
}

/** Contestant packs: an image, a config, and up to nine reaction sounds. */
function inspectPlayer(dir, files) {
  const issues = [];
  const image = findFile(files, 'player', IMAGE_EXTS);
  const configName = findFile(files, 'config_player', ['.json']);
  const config = configName ? readJson(path.join(dir, configName)) : null;

  checkForeignMedia(files, issues);

  if (!image) issues.push(issue(ERROR, 'No player.png, so this contestant has no picture'));
  if (!configName) issues.push(issue(ERROR, 'No config_player.json'));
  else if (!config.ok) issues.push(issue(ERROR, `config_player.json is not valid JSON: ${config.error}`));

  const data = (config && config.ok && config.data) || {};
  const assignment = data.audio_assignment || {};

  // Every slot points at a filename without its extension.
  let assigned = 0;
  for (const [slot, name] of Object.entries(assignment)) {
    if (!name) continue;
    assigned++;
    if (!findFile(files, name, AUDIO_EXTS)) {
      issues.push(issue(ERROR, `"${slot}" points at "${name}", which is not in this folder`));
    }
  }

  if (!data.name) issues.push(issue(WARN, 'No name set, so the game will show the folder name'));
  for (const key of ['color1', 'color2']) {
    const value = data[key];
    if (value && !/^[0-9a-fA-F]{6,8}$/.test(String(value))) {
      issues.push(issue(WARN, `${key} should be a hex colour without a "#", like "aabbcc"`));
    }
  }

  // Every audio file in the pack, keyed by the name a slot would reference it
  // by, so the editor can play a slot back without guessing the extension.
  const slots = {};
  for (const file of files) {
    if (AUDIO_EXTS.includes(extOf(file))) slots[baseOf(file)] = path.join(dir, file);
  }

  return {
    kind: 'player',
    title: data.name || null,
    subtitle: data.introduction || '',
    // The editor reads this to show what each reaction slot points at.
    config: data,
    slotFiles: slots,
    icon: image,
    summary: `${assigned} of 9 sounds`,
    colors: [data.color1, data.color2].filter(Boolean),
    issues,
  };
}

/** Host packs are undocumented, so the checks stay gentle. */
function inspectHost(dir, files) {
  const issues = [];
  const image = findFile(files, 'host', IMAGE_EXTS);
  const configName = findFile(files, 'config_host', ['.json']);
  const config = configName ? readJson(path.join(dir, configName)) : null;

  checkForeignMedia(files, issues);

  if (!image) issues.push(issue(WARN, 'No host.png, so the host has no picture'));
  if (!configName) issues.push(issue(ERROR, 'No config_host.json'));
  else if (!config.ok) issues.push(issue(ERROR, `config_host.json is not valid JSON: ${config.error}`));

  const data = (config && config.ok && config.data) || {};

  // Count the lines of dialogue across every mode, which is the useful measure.
  let lines = 0;
  const walk = (node) => {
    if (Array.isArray(node)) lines += node.filter((v) => typeof v === 'string').length;
    else if (node && typeof node === 'object') Object.values(node).forEach(walk);
  };
  for (const key of ['match_singleplayer', 'match_multiplayer', 'twitch_standard']) walk(data[key]);

  if (!data.name) issues.push(issue(WARN, 'No name set'));
  if (!data.match_singleplayer && !data.match_multiplayer) {
    issues.push(issue(WARN, 'No dialogue for either single player or multiplayer'));
  }

  return {
    kind: 'host',
    title: data.name || null,
    subtitle: data.host_type ? `${data.host_type} host` : '',
    icon: image,
    summary: `${lines} lines of dialogue`,
    issues,
  };
}

/** Judge packs want five of everything. */
function inspectJudges(dir, files) {
  const issues = [];
  checkForeignMedia(files, issues);

  let portraits = 0;
  let voices = 0;
  let blips = 0;
  for (let n = 1; n <= 5; n++) {
    if (findFile(files, `judge${n}`, IMAGE_EXTS)) portraits++;
    if (findFile(files, `judge${n}_voice`, AUDIO_EXTS)) voices++;
    if (findFile(files, `scoreblip${n}`, AUDIO_EXTS)) blips++;
  }

  if (!portraits) issues.push(issue(ERROR, 'No judge pictures. They should be judge1 through judge5'));
  else if (portraits < 5) issues.push(issue(WARN, `Only ${portraits} of 5 judge pictures`));

  if (voices && voices < 5) issues.push(issue(WARN, `Only ${voices} of 5 judge voices`));
  if (blips && blips < 5) issues.push(issue(WARN, `Only ${blips} of 5 score blips`));
  if (!voices && !blips) issues.push(issue(INFO, 'No judge voices or score blips'));

  const configName = findFile(files, 'config_judges', ['.json']);
  if (configName) {
    const config = readJson(path.join(dir, configName));
    if (!config.ok) issues.push(issue(ERROR, `config_judges.json is not valid JSON: ${config.error}`));
  }

  return {
    kind: 'judges',
    title: null,
    subtitle: '',
    icon: findFile(files, 'judge1', IMAGE_EXTS),
    summary: `${portraits} of 5 judges`,
    issues,
  };
}

/** Studio packs are all optional parts, so almost everything is a hint. */
function inspectStudio(dir, files) {
  const issues = [];
  checkForeignMedia(files, issues);

  const model = findFile(files, 'model', MODEL_EXTS);
  const music = findFile(files, 'music_studio', AUDIO_EXTS);
  const screen = findFile(files, 'screen', VIDEO_EXTS);

  if (!model && !music && !screen) {
    issues.push(issue(WARN, 'Nothing here yet. A studio needs a model, music or a screen video'));
  }
  if (files.some((f) => FOREIGN_VIDEO.includes(extOf(f)))) {
    issues.push(issue(ERROR, 'The screen video must be screen.ogv', 'convert-video'));
  }

  const configName = findFile(files, 'config_studio', ['.json']);
  if (configName) {
    const config = readJson(path.join(dir, configName));
    if (!config.ok) issues.push(issue(ERROR, `config_studio.json is not valid JSON: ${config.error}`));
  }

  const parts = [model && '3D model', music && 'music', screen && 'screen video'].filter(Boolean);
  return {
    kind: 'studio',
    title: null,
    subtitle: '',
    icon: findFile(files, 'absolute_image', IMAGE_EXTS),
    summary: parts.length ? parts.join(', ') : 'empty',
    issues,
  };
}

/**
 * Menu packs, from the one real example available. The config is a deep tree
 * of background and UI settings, so this only checks it parses and that the
 * pieces it references exist.
 */
function inspectMenu(dir, files) {
  const issues = [];
  checkForeignMedia(files, issues);

  const configName = findFile(files, 'config_menu', ['.json']);
  const config = configName ? readJson(path.join(dir, configName)) : null;

  if (!configName) issues.push(issue(ERROR, 'No config_menu.json'));
  else if (!config.ok) issues.push(issue(ERROR, `config_menu.json is not valid JSON: ${config.error}`));

  const background = findFile(files, 'Background', IMAGE_EXTS);
  const music = findFile(files, 'music_menu', AUDIO_EXTS);

  const SFX = ['button_sfx_back', 'button_sfx_decrease', 'button_sfx_hover', 'button_sfx_select'];
  const missingSfx = SFX.filter((s) => !findFile(files, s, AUDIO_EXTS));

  if (!background) issues.push(issue(WARN, 'No Background image'));
  if (!music) issues.push(issue(INFO, 'No menu music'));
  if (missingSfx.length && missingSfx.length < SFX.length) {
    issues.push(issue(WARN, `Missing button sounds: ${missingSfx.join(', ')}`));
  }

  return {
    kind: 'menu',
    title: null,
    subtitle: '',
    icon: background,
    summary: [background && 'background', music && 'music',
      missingSfx.length < SFX.length && 'button sounds'].filter(Boolean).join(', ') || 'empty',
    issues,
  };
}

/** Chatter packs map keywords to sounds through an ini. */
function inspectChatter(dir, files, { parseIniSections }) {
  const issues = [];
  checkForeignMedia(files, issues);

  const configName = findFile(files, 'config_chatter', ['.ini', '.cfg']);
  if (!configName) {
    issues.push(issue(ERROR, 'No config_chatter.ini'));
    return { kind: 'chatter', title: null, subtitle: '', icon: null, summary: 'empty', issues };
  }

  const sections = parseIniSections(path.join(dir, configName));
  let mappings = 0;
  for (const [name, entries] of Object.entries(sections)) {
    if (!['broad_keywords', 'exact_keywords'].includes(name)) {
      issues.push(issue(WARN, `Unknown section [${name}] in config_chatter`));
      continue;
    }
    for (const key of Object.keys(entries)) {
      mappings++;
      // Keys here are filenames including the extension.
      if (!findFile(files, key, []) && !findFile(files, baseOf(key), AUDIO_EXTS)) {
        issues.push(issue(ERROR, `${key} is listed but not in this folder`));
      }
    }
  }

  if (!mappings) issues.push(issue(WARN, 'No keywords mapped to sounds yet'));

  return {
    kind: 'chatter',
    title: null,
    subtitle: '',
    icon: null,
    summary: `${mappings} keyword${mappings === 1 ? '' : 's'}`,
    issues,
  };
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

const PACK_TYPES = [
  { id: 'voice', dir: 'packs_voice', label: 'Voice & dub packs', singular: 'voice pack', inspect: inspectVoice },
  { id: 'player', dir: 'packs_player', label: 'Contestants', singular: 'contestant', inspect: inspectPlayer },
  { id: 'host', dir: 'packs_host', label: 'Hosts', singular: 'host', inspect: inspectHost },
  { id: 'judges', dir: 'packs_judges', label: 'Judges', singular: 'judge panel', inspect: inspectJudges },
  { id: 'studio', dir: 'packs_studio', label: 'Studios', singular: 'studio', inspect: inspectStudio },
  { id: 'menu', dir: 'packs_menu', label: 'Menus', singular: 'menu theme', inspect: inspectMenu },
  { id: 'chatter', dir: 'packs_chatter', label: 'Chatter', singular: 'chatter pack', inspect: inspectChatter },
];

/**
 * Walks every pack folder. `helpers` carries the ini parsing and audio lookup
 * from gamedata.js so the two modules cannot drift apart on format details.
 */
function scanContent(gameDir, helpers) {
  const types = [];

  for (const type of PACK_TYPES) {
    const root = path.join(gameDir, type.dir);
    const packs = [];

    for (const name of listDirs(root)) {
      const dir = path.join(root, name);
      const files = listFiles(dir);

      let detail;
      try {
        detail = type.inspect(dir, files, helpers);
      } catch (err) {
        detail = {
          kind: type.id,
          title: null,
          summary: 'could not be read',
          issues: [issue(ERROR, `Could not read this pack: ${err.message}`)],
        };
      }

      const counts = { error: 0, warn: 0, info: 0 };
      for (const i of detail.issues || []) counts[i.level] = (counts[i.level] || 0) + 1;

      packs.push({
        ...detail,
        id: `${type.id}::${name}`,
        type: type.id,
        name,
        dir,
        // After the spread, so a pack with no declared title falls back to its
        // folder name rather than showing "null".
        title: detail.title || name,
        fileCount: files.length,
        iconPath: detail.icon ? path.join(dir, detail.icon) : null,
        counts,
      });
    }

    packs.sort((a, b) => a.title.localeCompare(b.title));
    types.push({
      id: type.id,
      label: type.label,
      singular: type.singular,
      dir: root,
      exists: fs.existsSync(root),
      packs,
    });
  }

  const all = types.flatMap((t) => t.packs);
  return {
    gameDir,
    types,
    totals: {
      packs: all.length,
      errors: all.reduce((n, p) => n + p.counts.error, 0),
      warnings: all.reduce((n, p) => n + p.counts.warn, 0),
    },
  };
}

module.exports = {
  scanContent,
  PACK_TYPES,
  AUDIO_EXTS,
  IMAGE_EXTS,
  VIDEO_EXTS,
  FOREIGN_VIDEO,
  FOREIGN_AUDIO,
  MAX_DUB_CLIP_SECONDS,
  MAX_VOICE_CLIP_SECONDS,
};
