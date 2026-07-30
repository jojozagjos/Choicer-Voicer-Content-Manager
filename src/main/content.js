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

// The game reads clip metadata from .ini or .cfg. Some packs use .txt for the
// same content, so it is accepted too.
const CLIP_META_EXTS = ['.ini', '.cfg', '.txt'];

/**
 * A clip's caption. A plain `.txt` beside the clip beats the config, which is
 * how the game resolves it. A `.txt` holding ini content is that clip's config
 * rather than its caption, so it is left alone.
 */
function readClipCaption(dir, files, base, data) {
  const lowered = new Map(files.map((n) => [n.toLowerCase(), n]));
  const name = lowered.get(`${base}.txt`);

  if (name) {
    try {
      const raw = fs.readFileSync(path.join(dir, name), 'utf8');
      const looksLikeConfig = /^\s*\[[^\]]+\]/m.test(raw) || /^\s*\w+\s*=/m.test(raw);
      if (!looksLikeConfig && raw.trim()) return raw.trim();
    } catch { /* unreadable, fall through to the config */ }
  }

  return typeof data.caption === 'string' ? data.caption : '';
}

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
 * A cheap fingerprint of a folder: when it last changed, and how many files
 * are in it. Adding, removing or renaming a file moves the folder's own
 * modified time, so this catches the ordinary ways a pack changes without
 * having to stat every file inside it.
 */
function folderStamp(dir, fileCount) {
  try {
    return `${Math.round(fs.statSync(dir).mtimeMs)}:${fileCount}`;
  } catch {
    return null;
  }
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

  const info = findFile(files, '_pack_info', ['.ini', '.cfg', '.txt']);
  const meta = info ? parseIni(path.join(dir, info)) : {};
  const backingName = findFile(files, '_backing_track', AUDIO_EXTS);

  // Any clip without a picture of its own falls back to this one. It covers
  // the immediate folder only, and doubles as the pack icon when none is set.
  const fillerImage = findFile(files, '_pack_filler_image', IMAGE_EXTS);

  /**
   * Reads the clips in one folder.
   *
   * A voice pack may sort its clips into child folders, which is why the game
   * documents the filler image as covering only the folder it sits in. Each
   * folder therefore gets read on its own terms: its own clips, its own filler
   * image, and clip names qualified by the folder so two folders can both hold
   * a clip called the same thing.
   */
  const readFolder = (folderDir, folderFiles, prefix) => {
    const found = [];
    const folderFiller = prefix
      ? findFile(folderFiles, '_pack_filler_image', IMAGE_EXTS)
      : fillerImage;

    // Which file speaks for each clip. A clip can easily carry more than one:
    // packs are often shipped with .txt and the editor writes .ini when it saves,
    // so a clip that has been edited ends up with both. Counting one clip per
    // file listed every one of those lines twice, and an export would have placed
    // each of them twice too. CLIP_META_EXTS is in the order the game prefers, so
    // the earliest extension wins.
    const chosen = new Map();
    for (const file of folderFiles) {
      if (!CLIP_META_EXTS.includes(extOf(file))) continue;
      if (file.startsWith('_')) continue;
      const data = parseIni(path.join(folderDir, file));
      if (!('dub_timestamps' in data)) continue;

      const key = baseOf(file).toLowerCase();
      const rank = CLIP_META_EXTS.indexOf(extOf(file));
      const held = chosen.get(key);
      if (!held || rank < held.rank) chosen.set(key, { file, rank, data });
    }

    // Walked in the folder's own order rather than the order they were chosen
    // in, so clips stay listed the way they are named.
    for (const file of folderFiles) {
      const picked = chosen.get(baseOf(file).toLowerCase());
      if (!picked || picked.file !== file) continue;
      const data = picked.data;

      const base = baseOf(file);
      const times = Array.isArray(data.dub_timestamps) ? data.dub_timestamps : [];
      found.push({
        base,
        // Where it actually lives, so the editor can find and rewrite it.
        folder: prefix || '',
        id: prefix ? `${prefix}/${base}` : base,
        time: typeof times[0] === 'number' ? times[0] : parseFloat(times[0]) || 0,
        caption: readClipCaption(folderDir, folderFiles, base, data),
        character: Array.isArray(data.dub_characters) ? data.dub_characters[0] || '' : '',
        image: typeof data.image === 'string' ? data.image : '',
        audio: findAudioSibling(folderDir, base, folderFiles),
        fillerImage: folderFiller ? path.join(folderDir, folderFiller) : null,
      });
    }
    return found;
  };

  const clips = readFolder(dir, files, '');

  // One level down only. Nothing in the game's documentation suggests deeper
  // nesting, and walking arbitrarily deep would make a scan of a large library
  // unpredictable.
  const childFolders = [];
  for (const child of listDirs(dir)) {
    const childDir = path.join(dir, child);
    const childFiles = listFiles(childDir);
    const childClips = readFolder(childDir, childFiles, child);
    if (childClips.length) {
      childFolders.push({ name: child, count: childClips.length });
      clips.push(...childClips);
    }
  }

  const orphanAudio = files.filter((f) =>
    AUDIO_EXTS.includes(extOf(f))
    && !f.startsWith('_')
    && !clips.some((c) => !c.folder && c.base.toLowerCase() === baseOf(f).toLowerCase()));

  // A clip holding two audio files is the worst kind of wrong, because nothing
  // looks wrong. This app plays one of them and the game finds the other, so a
  // line comes out twice in the game while the editor shows it once. Retiming a
  // clip used to cause it, by cutting to .wav beside a clip stored as .ogg.
  const doubledAudio = [];
  for (const clip of clips) {
    if (clip.folder) continue; // subfolder clips are checked by their own folder
    const matches = files.filter((f) =>
      AUDIO_EXTS.includes(extOf(f)) && baseOf(f).toLowerCase() === clip.base.toLowerCase());
    if (matches.length > 1) doubledAudio.push({ base: clip.base, files: matches });
  }

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

  for (const doubled of doubledAudio) {
    issues.push(issue(ERROR,
      `"${doubled.base}" has ${doubled.files.length} audio files (${doubled.files.join(', ')}). `
      + 'The game may play the line more than once. Delete all but the one you want.',
      'doubled-audio'));
  }
  if (!findFile(files, '_icon', IMAGE_EXTS) && !meta.icon && !fillerImage) {
    issues.push(issue(INFO, 'No pack icon. Add _icon, or _pack_filler_image which doubles as one'));
  }

  const withoutPicture = clips.filter((c) =>
    !c.image && !findFile(files, c.base, IMAGE_EXTS)).length;
  if (withoutPicture && !fillerImage) {
    issues.push(issue(INFO,
      `${withoutPicture} clip${withoutPicture > 1 ? 's have' : ' has'} no picture. `
      + 'Add _pack_filler_image to cover them all at once'));
  }

  return {
    kind: isDub ? 'dub' : 'voice',
    title: typeof meta.title === 'string' && meta.title ? meta.title : null,
    subtitle: typeof meta.subtitle === 'string' ? meta.subtitle : '',
    authors: Array.isArray(meta.authors) ? meta.authors
      : typeof meta.authors === 'string' && meta.authors ? [meta.authors] : [],
    readme: typeof meta.readme === 'string' ? meta.readme : '',
    // The filler image is the game's last resort for the pack icon too.
    icon: findFile(files, meta.icon || '_icon', IMAGE_EXTS)
      || findFile(files, 'icon', IMAGE_EXTS)
      || fillerImage,
    fillerImage,
    video,
    // The editor needs the real file to cut clips out of.
    videoPath: video ? path.join(dir, video) : null,
    backingPath: backingName ? path.join(dir, backingName) : null,
    // Sorted, so the editor lists them in the order they play.
    clips: clips.sort((a, b) => a.time - b.time),
    clipCount: clips.length,
    childFolders,
    characters: [...new Set(clips.map((c) => c.character).filter(Boolean))],
    summary: (isDub ? `${clips.length} lines` : `${clips.length} clips`)
      + (childFolders.length ? ` in ${childFolders.length + 1} folders` : ''),
    issues,
    maxClipSeconds: isDub ? MAX_DUB_CLIP_SECONDS : MAX_VOICE_CLIP_SECONDS,
  };
}

/** Player packs: an image, a config, and up to nine reaction sounds. */
function inspectPlayer(dir, files) {
  const issues = [];
  const image = findFile(files, 'player', IMAGE_EXTS);
  const configName = findFile(files, 'config_player', ['.json']);
  const config = configName ? readJson(path.join(dir, configName)) : null;

  checkForeignMedia(files, issues);

  if (!image) issues.push(issue(ERROR, 'No player.png, so this player has no picture'));
  if (!configName) issues.push(issue(ERROR, 'No config_player.json'));
  else if (!config.ok) issues.push(issue(ERROR, `config_player.json is not valid JSON: ${config.error}`));

  const data = (config && config.ok && config.data) || {};
  const assignment = data.audio_assignment || {};

  // Every slot points at a filename without its extension.
  const REACTIONS = [
    'intro_greet', 'score_0', 'score_1', 'score_2', 'score_3', 'score_4', 'score_5',
    'game_winner', 'game_loser',
  ];

  let assigned = 0;
  for (const [slot, name] of Object.entries(assignment)) {
    if (!name) continue;
    assigned++;
    if (!findFile(files, name, AUDIO_EXTS)) {
      issues.push(issue(ERROR, `"${slot}" points at "${name}", which is not in this folder`));
    }
  }

  // Worth knowing about, but not a fault: the game itself leaves score_2 and
  // score_3 empty by default, so a perfectly ordinary pack has gaps here. It
  // is only an error when there is nothing at all.
  const silent = REACTIONS.filter((slot) => !assignment[slot]);
  if (silent.length === REACTIONS.length) {
    issues.push(issue(ERROR, 'No reaction sounds at all, so this contestant never speaks'));
  } else if (silent.length) {
    issues.push(issue(WARN,
      `${silent.length} reaction${silent.length > 1 ? 's have' : ' has'} no sound, so `
      + `${silent.length > 1 ? 'those moments are' : 'that moment is'} silent: ${silent.join(', ')}`));
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
    // The editor edits this in place, so it needs the whole thing.
    config: data,
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
  let panels = 0;
  for (let n = 1; n <= 5; n++) {
    if (findFile(files, `judge${n}`, IMAGE_EXTS)) portraits++;
    if (findFile(files, `judge${n}_voice`, AUDIO_EXTS)) voices++;
    if (findFile(files, `judge${n}_success`, IMAGE_EXTS)) panels++;
    if (findFile(files, `scoreblip${n}`, AUDIO_EXTS)) blips++;
  }
  const success = findFile(files, 'success', IMAGE_EXTS);

  if (!portraits) issues.push(issue(ERROR, 'No judge pictures. They should be judge1 through judge5'));
  else if (portraits < 5) issues.push(issue(WARN, `Only ${portraits} of 5 judge pictures`));

  if (voices && voices < 5) issues.push(issue(INFO, `${voices} of 5 judges have their own voice`));
  // Blips play in sequence for however many points were earned, so a partial
  // set means silence partway through a good round.
  if (!blips) {
    issues.push(issue(ERROR, 'No score blips, so awarding points makes no sound'));
  } else if (blips < 5) {
    issues.push(issue(ERROR,
      `Only ${blips} of 5 score blips. They play in sequence, so a 5 point round runs out of sound`));
  }
  if (panels && !success) {
    issues.push(issue(INFO, `${panels} judge${panels > 1 ? 's have' : ' has'} their own success panel`));
  }

  const configName = findFile(files, 'config_judges', ['.json']);
  let config = null;
  if (configName) {
    const read = readJson(path.join(dir, configName));
    if (!read.ok) issues.push(issue(ERROR, `config_judges.json is not valid JSON: ${read.error}`));
    else config = read.data;
  }

  return {
    kind: 'judges',
    title: null,
    subtitle: '',
    icon: findFile(files, 'judge1', IMAGE_EXTS),
    config: config || {},
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
  let studioConfig = {};
  if (configName) {
    const config = readJson(path.join(dir, configName));
    if (!config.ok) issues.push(issue(ERROR, `config_studio.json is not valid JSON: ${config.error}`));
    else studioConfig = config.data || {};
  }

  const parts = [model && '3D model', music && 'music', screen && 'screen video'].filter(Boolean);
  return {
    kind: 'studio',
    config: studioConfig,
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

  // Everything a menu pack can override. All of it is optional: the game falls
  // back to its own for anything missing.
  const background = findFile(files, 'background', IMAGE_EXTS);
  const overlay = findFile(files, 'overlay', IMAGE_EXTS);
  const unseen = findFile(files, 'unseen_image', IMAGE_EXTS);
  const noImage = findFile(files, 'no_image', IMAGE_EXTS);
  const music = findFile(files, 'music_menu', AUDIO_EXTS);
  const video = findFile(files, 'video', VIDEO_EXTS);

  const SFX = ['button_sfx_select', 'button_sfx_back', 'button_sfx_hover', 'button_sfx_decrease'];
  const presentSfx = SFX.filter((s) => findFile(files, s, AUDIO_EXTS));

  if (!background && !video) {
    issues.push(issue(WARN, 'No background image or video, so the menu keeps the default one'));
  }
  if (presentSfx.length && presentSfx.length < SFX.length) {
    issues.push(issue(INFO,
      `${SFX.length - presentSfx.length} button sound${SFX.length - presentSfx.length > 1 ? 's' : ''} `
      + 'not set, so those keep the default'));
  }
  // A video replaces the music by default, so having both is worth mentioning.
  if (video && music) {
    issues.push(issue(INFO,
      'Both a video and music_menu are here. The video\'s own audio wins unless '
      + 'audio.use_video is false in config_menu'));
  }
  if (files.some((f) => FOREIGN_VIDEO.includes(extOf(f)))) {
    issues.push(issue(ERROR, 'The menu video must be video.ogv', 'convert-video'));
  }

  const parts = [
    video && 'video', background && 'background', overlay && 'overlay',
    music && 'music', presentSfx.length && `${presentSfx.length} button sounds`,
  ].filter(Boolean);

  return {
    kind: 'menu',
    title: null,
    subtitle: '',
    config: (config && config.ok && config.data) || {},
    icon: background || unseen || noImage,
    background,
    overlay,
    unseenImage: unseen,
    noImage,
    video,
    music,
    summary: parts.length ? parts.join(', ') : 'empty',
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

  // Three sections, none of them required for the pack to work:
  //   [data]            title, icon, authors, volume
  //   [exact_keywords]  case-sensitive whole-word matches
  //   [broad_keywords]  case-insensitive substring matches
  const KNOWN = ['data', 'exact_keywords', 'broad_keywords'];
  const sections = parseIniSections(path.join(dir, configName));
  const data = sections.data || {};

  const samples = files.filter((f) => AUDIO_EXTS.includes(extOf(f)));
  const mapped = new Set();
  let mappings = 0;

  for (const [name, entries] of Object.entries(sections)) {
    if (name === 'data') continue;
    if (!KNOWN.includes(name)) {
      issues.push(issue(WARN, `Unknown section [${name}] in config_chatter`));
      continue;
    }
    for (const [key, words] of Object.entries(entries)) {
      mappings++;
      mapped.add(key.toLowerCase());
      // Keys here are full filenames, extension included, unlike every other
      // config in the game.
      if (!findFile(files, key, []) && !findFile(files, baseOf(key), AUDIO_EXTS)) {
        issues.push(issue(ERROR, `${key} is listed in config_chatter but not in this folder`));
      }
      const list = Array.isArray(words) ? words : [words];
      if (!list.filter((w) => typeof w === 'string' && w.trim()).length) {
        issues.push(issue(WARN, `${key} has no keywords, so nothing will trigger it`));
      }
    }
  }

  const unmapped = samples.filter((f) => !mapped.has(f.toLowerCase()));
  if (unmapped.length) {
    issues.push(issue(INFO,
      `${unmapped.length} sound${unmapped.length > 1 ? 's have' : ' has'} no keyword yet`));
  }
  if (!mappings) issues.push(issue(WARN, 'No keywords mapped to sounds yet'));

  const volume = typeof data.volume === 'number' ? data.volume : 1;
  if (volume < 0 || volume > 4) {
    issues.push(issue(WARN, `Volume of ${volume} looks wrong. 1.0 is normal`));
  }

  return {
    kind: 'chatter',
    title: typeof data.title === 'string' && data.title ? data.title : null,
    subtitle: '',
    authors: Array.isArray(data.authors) ? data.authors
      : typeof data.authors === 'string' && data.authors ? [data.authors] : [],
    icon: findFile(files, data.icon || '_icon', IMAGE_EXTS),
    volume,
    sampleCount: samples.length,
    config: { file: configName, sections },
    summary: `${samples.length} sound${samples.length === 1 ? '' : 's'}, `
      + `${mappings} keyword${mappings === 1 ? '' : 's'}`,
    issues,
  };
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

const PACK_TYPES = [
  { id: 'voice', dir: 'packs_voice', label: 'Voice & dub packs', singular: 'voice pack', inspect: inspectVoice },
  // Named for the folder the game reads, packs_player, so what you see here
  // and what is on disk are the same word.
  { id: 'player', dir: 'packs_player', label: 'Players', singular: 'player', inspect: inspectPlayer },
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
function scanContent(gameDir, helpers, cache = null) {
  const types = [];

  for (const type of PACK_TYPES) {
    const root = path.join(gameDir, type.dir);
    const packs = [];

    for (const name of listDirs(root)) {
      const dir = path.join(root, name);
      const files = listFiles(dir);

      // Inspecting a pack means parsing every config in it, which on a big
      // library is the whole cost of a scan. A pack whose folder has not been
      // touched since it was last read cannot have changed, so it is reused.
      // Writes go through handlers that drop the entry for the folder they
      // touched, which covers edits that leave the file count alone.
      const stamp = cache ? folderStamp(dir, files.length) : null;
      const hit = cache && stamp ? cache.get(dir) : null;

      let detail;
      if (hit && hit.stamp === stamp) {
        detail = hit.detail;
      } else {
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
        if (cache && stamp) cache.set(dir, { stamp, detail });
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
        // Every file in the pack, so an editor can resolve a named slot to
        // whatever extension it happens to use without another scan.
        fileNames: files,
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
