'use strict';

/**
 * Makes new content packs.
 *
 * Every type gets a folder plus a config the game will actually load, filled
 * with sensible defaults rather than left blank. A pack made here should open
 * in the game's Customize menu straight away, even before any art or audio is
 * added, so people can see it working and then fill it in.
 *
 * Field names and structures come from docs/PACK_FORMATS.md.
 */

const fs = require('fs');
const path = require('path');

const TYPE_DIRS = {
  voice: 'packs_voice',
  player: 'packs_player',
  host: 'packs_host',
  judges: 'packs_judges',
  studio: 'packs_studio',
  menu: 'packs_menu',
  chatter: 'packs_chatter',
};

/** Folder names have to survive Windows, but should still read as the title. */
function safeFolderName(name) {
  const cleaned = String(name || '')
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned || 'New Pack';
}

function uniqueDir(parent, name) {
  let candidate = path.join(parent, name);
  for (let n = 2; fs.existsSync(candidate) && n < 500; n++) {
    candidate = path.join(parent, `${name} ${n}`);
  }
  return candidate;
}

function writeJson(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, '\t'), 'utf8');
}

// ---------------------------------------------------------------------------
// Godot-flavoured ini writing
// ---------------------------------------------------------------------------

function iniString(value) {
  return `"${String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function iniValue(value) {
  if (Array.isArray(value)) return `[${value.map(iniValue).join(', ')}]`;
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  return iniString(value);
}

function writeIni(file, data) {
  const lines = ['[data]', ''];
  for (const [key, value] of Object.entries(data)) {
    if (value === undefined || value === null) continue;
    lines.push(`${key}=${iniValue(value)}`);
  }
  fs.writeFileSync(file, `${lines.join('\n')}\n`, 'utf8');
}

/**
 * Writes a multi-section ini, which chatter configs need: they carry `[data]`
 * alongside `[exact_keywords]` and `[broad_keywords]`. Empty sections are kept
 * so the file still shows what it is for once every keyword is cleared out.
 *
 * Chatter keys are full filenames, extension included. The game writes those
 * bare, dot and all (`lets_go.wav = [...]`), so they are written bare here
 * too. Quoting them makes the quotes part of the key name, which then matches
 * no file on disk. Only a key holding something that would genuinely break
 * parsing gets quoted.
 */
const BARE_KEY = /^[A-Za-z0-9_.\-+#]+$/;

function writeIniSections(file, sections) {
  const chunks = [];
  for (const [name, entries] of Object.entries(sections)) {
    const lines = [`[${name}]`, ''];
    for (const [key, value] of Object.entries(entries || {})) {
      if (value === undefined || value === null) continue;
      lines.push(`${BARE_KEY.test(key) ? key : iniString(key)}=${iniValue(value)}`);
    }
    chunks.push(lines.join('\n'));
  }
  fs.writeFileSync(file, `${chunks.join('\n\n')}\n`, 'utf8');
}

// ---------------------------------------------------------------------------
// Default configs
// ---------------------------------------------------------------------------

/** All nine reaction slots, blank so the game plays nothing until filled. */
function emptyAudioAssignment() {
  return {
    intro_greet: '',
    score_0: '',
    score_1: '',
    score_2: '',
    score_3: '',
    score_4: '',
    score_5: '',
    game_winner: '',
    game_loser: '',
  };
}

/**
 * A host needs lines for every beat of a match or it goes quiet, so this is a
 * complete, playable script written to be obviously placeholder.
 */
function defaultHostDialogue(name) {
  const single = {
    intro: {
      a_welcome: [`Welcome to the show! I'm ${name}.`],
      b_contestant: ['Give it up for <player>!'],
      c_judges: ['And here are tonight\'s judges.'],
      d_explanation: ['You\'ll hear a clip, then give us your best impression.'],
    },
    round: {
      a_get_ready: ['Round <round>. Get ready...'],
      b_post_record: ['Let\'s hear that back.'],
      c_post_listen: ['Judges, what did you think?'],
      round_next: ['On to the next one!'],
      round_final: ['This is the last one. Make it count.'],
    },
    judging: {
      score_0: ['Ouch. Nothing from the judges.'],
      score_1: ['One point.'],
      score_2: ['Two points.'],
      score_3: ['Three points, not bad.'],
      score_4: ['Four points!'],
      score_5: ['A perfect five!'],
      score_6: ['Six?! That isn\'t even possible!'],
    },
    end: {
      final_score: ['<player> finished with <points> points.'],
      win_100: ['A flawless run. Incredible.'],
      win_standard: ['A win! Nicely done.'],
      win_barely: ['Squeaked through, but a win is a win.'],
      lose_barely: ['So close. Next time.'],
      lose_standard: ['Not tonight, I\'m afraid.'],
      lose_0: ['Well. That happened.'],
    },
  };

  const multi = {
    intro: {
      a_welcome: [`Welcome back! ${name} here.`],
      b_contestants: ['Our contestants tonight: <player>!'],
      c_judges: ['You know the judges.'],
      d_explanation: ['Best impression wins. Simple as that.'],
    },
    round: {
      a_get_ready: ['Round <round>. <player>, you\'re up.'],
      b_post_record: ['Let\'s hear it.'],
      c_post_listen: ['Judges?'],
      round_next: ['Next contestant!'],
      round_final: ['Final round, everyone.'],
    },
    judging: {
      judged_player: ['<player> gets <points>.'],
      post_judging: ['Onwards!'],
    },
    end: {
      final_score: ['<player> ends on <points>.'],
      winner: ['Tonight\'s winner is <player>!'],
      tie_win: ['We have a tie!'],
      tie_win_start: ['Between'],
      tie_win_end: ['what a finish!'],
      congrats_goodbye: ['Thanks for playing. See you next time!'],
    },
  };

  return { match_singleplayer: single, match_multiplayer: multi };
}

/** Matches the shape of a real menu pack, with the game's own defaults. */
function defaultMenuConfig() {
  return {
    audio: {
      music_menu_loop_start: 0.0,
      music_menu_loop_start_README:
        'For WAV, the start must be the SAMPLE. For MP3 and OGG, it must be the TIME, in seconds.',
      use_video: false,
    },
    background: {
      bottom_gradient: { color: 'ffffff72', on: true },
      circles: { color: '8add88ff', on: true },
      clip_disc: { color: '4651dbff', state: 0 },
      image: { scroll: { x: 0.3, y: 0.5 }, use_type: 1 },
      letterbox: { accent: '6abcd4', color: '909090', on: false },
      overlay: { on: false },
      top_gradient: { color: 'ffffffff', on: false },
      waves: { color: '0032db7a', on: true },
    },
    ui: { button: { color1: '91c5deff', color2: '98c297ff', invert: false } },
  };
}

// ---------------------------------------------------------------------------
// Creators
// ---------------------------------------------------------------------------

const CREATORS = {
  voice(dir, options) {
    writeIni(path.join(dir, '_pack_info.ini'), {
      title: options.title || path.basename(dir),
      subtitle: options.subtitle || '',
      authors: options.authors && options.authors.length ? options.authors : [],
      readme: options.readme || '',
    });
    return {
      next: options.isDub
        ? 'Add dub_video.ogv, a backing track, then your clips.'
        : 'Add audio clips. Each one can have an image with the same name.',
    };
  },

  player(dir, options) {
    writeJson(path.join(dir, 'config_player.json'), {
      audio_assignment: emptyAudioAssignment(),
      color1: (options.color1 || 'accbd1').replace('#', ''),
      color2: (options.color2 || 'ffffff').replace('#', ''),
      introduction: options.introduction || 'Our next contestant:',
      name: options.name || path.basename(dir),
    });
    return { next: 'Add player.png, then reaction sounds and assign them.' };
  },

  host(dir, options) {
    const name = options.name || path.basename(dir);
    writeJson(path.join(dir, 'config_host.json'), {
      name,
      host_type: options.hostType || 'basic',
      ...defaultHostDialogue(name),
    });
    return { next: 'Add host.png, then rewrite the placeholder lines.' };
  },

  judges(dir) {
    writeJson(path.join(dir, 'config_judges.json'), { play_voices_with_blips: true });
    return { next: 'Add judge1 through judge5 images, plus voices and score blips.' };
  },

  studio(dir) {
    writeJson(path.join(dir, 'config_studio.json'), {
      use_builtin_light: true,
      music_studio_loop_start: 0.0,
    });
    return { next: 'Add model.glb, music_studio, or a screen.ogv.' };
  },

  menu(dir) {
    writeJson(path.join(dir, 'config_menu.json'), defaultMenuConfig());
    return { next: 'Add Background.png, music_menu, and the button sounds.' };
  },

  chatter(dir) {
    fs.writeFileSync(
      path.join(dir, 'config_chatter.ini'),
      [
        '[broad_keywords]',
        '; Matches anywhere in the first word, ignoring case.',
        '; clap.ogg = ["clap", "👏"]',
        '',
        '[exact_keywords]',
        '; Must match exactly, and is case sensitive.',
        '; gunshot.ogg = ["Kappa"]',
        '',
      ].join('\n'),
      'utf8'
    );
    return { next: 'Add .ogg sounds, then map keywords to them in config_chatter.ini.' };
  },
};

/**
 * Creates a pack of `type` under the game folder.
 * Returns the folder made and a hint about what to add next.
 */
function createPack(gameDir, type, options = {}) {
  const dirName = TYPE_DIRS[type];
  if (!dirName) throw new Error(`Unknown pack type: ${type}`);

  const parent = path.join(gameDir, dirName);
  fs.mkdirSync(parent, { recursive: true });

  const folder = uniqueDir(parent, safeFolderName(options.name || options.title));
  fs.mkdirSync(folder, { recursive: true });

  try {
    const result = CREATORS[type](folder, options) || {};
    return { dir: folder, name: path.basename(folder), type, ...result };
  } catch (err) {
    // Do not leave a half-made pack behind for the game to trip over.
    fs.rmSync(folder, { recursive: true, force: true });
    throw err;
  }
}

/**
 * Writes a clip's metadata beside its audio. This is the file the game reads
 * to know when a clip belongs on the video timeline, so a dub pack is only
 * functional once every clip has one.
 */
function writeClipMeta(packDir, base, meta = {}) {
  const data = {
    caption: meta.caption || '',
    image: meta.image || '',
    dub_timestamps: Array.isArray(meta.timestamps) ? meta.timestamps : [Number(meta.timestamp) || 0],
    dub_characters: Array.isArray(meta.characters)
      ? meta.characters
      : (meta.character ? [meta.character] : []),
  };
  const file = path.join(packDir, `${base}.ini`);
  writeIni(file, data);
  return file;
}

/** Saves a PNG captured from the video as a clip's image. */
function saveImage(packDir, base, dataUrl) {
  const match = /^data:image\/\w+;base64,(.+)$/.exec(String(dataUrl));
  if (!match) throw new Error('That is not an image');
  const file = path.join(packDir, `${base}.png`);
  fs.writeFileSync(file, Buffer.from(match[1], 'base64'));
  return file;
}

/**
 * Works out what kind of pack a folder is by what is inside it, so a download
 * can be dropped in without being told where it belongs.
 */
function identifyPack(dir) {
  let files;
  try {
    files = fs.readdirSync(dir);
  } catch {
    return null;
  }

  const has = (name) => files.some((f) => f.toLowerCase() === name.toLowerCase());
  const hasPrefix = (prefix) => files.some((f) => f.toLowerCase().startsWith(prefix));
  const hasExt = (ext) => files.some((f) => f.toLowerCase().endsWith(ext));
  const hasBase = (base) =>
    files.some((f) => f.slice(0, f.lastIndexOf('.')).toLowerCase() === base);
  const countMatching = (re) => files.filter((f) => re.test(f)).length;

  // A config settles it outright.
  if (has('config_player.json')) return 'player';
  if (has('config_host.json')) return 'host';
  if (has('config_menu.json')) return 'menu';
  if (has('config_chatter.ini') || has('config_chatter.cfg')) return 'chatter';
  if (has('config_judges.json')) return 'judges';
  if (has('config_studio.json')) return 'studio';

  // Without one, go by the filenames the game looks for. These are checked
  // before voice packs because a voice pack is the loosest shape of all, and
  // anything with audio in it used to fall through and be called one.
  if (countMatching(/^judge[1-5](_voice|_success)?\.[a-z0-9]+$/i)
    || countMatching(/^scoreblip[1-5]\.[a-z0-9]+$/i)) return 'judges';

  if (hasBase('model') || hasBase('music_studio') || hasBase('screen')
    || hasBase('absolute_image')) return 'studio';

  if (hasBase('host')) return 'host';
  if (hasBase('player')) return 'player';

  if (hasBase('background') || hasBase('overlay') || hasBase('music_menu')
    || hasBase('unseen_image') || hasBase('no_image')
    || countMatching(/^button_sfx_/i)) return 'menu';

  // A voice pack is the loosest shape, so it is checked last: a video, a pack
  // info file, or clip metadata alongside audio.
  if (hasPrefix('dub_video') || has('_pack_info.ini') || has('_pack_info.cfg')
    || has('_pack_info.txt')) return 'voice';
  if ((hasExt('.ini') || hasExt('.cfg')) && files.some((f) => /\.(wav|mp3|ogg)$/i.test(f))) {
    return 'voice';
  }

  return null;
}

/**
 * Copies a pack folder into the right place. Refuses anything it cannot
 * identify rather than dumping a stray folder the game will ignore.
 */
function installPack(gameDir, sourceDir) {
  const stat = fs.statSync(sourceDir);
  if (!stat.isDirectory()) throw new Error('Drop the unzipped folder, not a file');

  const type = identifyPack(sourceDir);
  if (!type) {
    throw new Error('That folder does not look like a pack. It needs a config file, a dub video, or clips.');
  }

  const parent = path.join(gameDir, TYPE_DIRS[type]);
  fs.mkdirSync(parent, { recursive: true });

  const target = uniqueDir(parent, safeFolderName(path.basename(sourceDir)));
  fs.cpSync(sourceDir, target, { recursive: true });
  return { type, dir: target, name: path.basename(target) };
}

/**
 * Moves a clip's files out of a pack into a holding folder, so deleting one is
 * undoable. Anything the game would load goes: the audio, the metadata and the
 * picture that shares its name.
 */
// What the undo bin is allowed to grow to, and how long anything is kept no
// matter what. Undo only ever reaches back into the current session, so older
// entries are dead weight; they were being kept forever, and a few trims of a
// long video is all it takes to reach hundreds of megabytes.
// A trimmed video of a few minutes is around a hundred megabytes on its own, so
// the cap is set to hold a couple of them rather than a history nobody can reach.
const TRASH_CAP_BYTES = 250 * 1024 * 1024;
const TRASH_KEEP_MS = 3 * 24 * 60 * 60 * 1000;
// Nothing recent is ever removed, whatever the total, because an editor session
// open right now may still undo it.
const TRASH_SAFE_MS = 60 * 60 * 1000;

function sizeOf(target) {
  let total = 0;
  const stat = fs.statSync(target);
  if (!stat.isDirectory()) return stat.size;
  for (const name of fs.readdirSync(target)) {
    try { total += sizeOf(path.join(target, name)); } catch { /* vanished */ }
  }
  return total;
}

/**
 * Keeps the undo bin from growing without limit.
 *
 * Entries go by age first, then oldest-first until the total is under the cap.
 * Anything from the last hour is left alone regardless, so an undo that is still
 * reachable cannot have its files taken out from under it.
 */
function pruneTrash(trashRoot) {
  let names;
  try {
    names = fs.readdirSync(trashRoot);
  } catch {
    return { removed: 0, freed: 0 };
  }

  const now = Date.now();
  const entries = [];
  for (const name of names) {
    const full = path.join(trashRoot, name);
    try {
      const stat = fs.statSync(full);
      entries.push({ full, age: now - stat.mtimeMs, bytes: sizeOf(full) });
    } catch { /* vanished */ }
  }

  let total = entries.reduce((sum, e) => sum + e.bytes, 0);
  let removed = 0;
  let freed = 0;

  const drop = (entry) => {
    try {
      fs.rmSync(entry.full, { recursive: true, force: true });
      removed++;
      freed += entry.bytes;
      total -= entry.bytes;
    } catch { /* in use, leave it */ }
  };

  for (const entry of entries) {
    if (entry.age > TRASH_SAFE_MS && entry.age > TRASH_KEEP_MS) drop(entry);
  }

  const rest = entries
    .filter((e) => fs.existsSync(e.full) && e.age > TRASH_SAFE_MS)
    .sort((a, b) => b.age - a.age);
  for (const entry of rest) {
    if (total <= TRASH_CAP_BYTES) break;
    drop(entry);
  }

  return { removed, freed };
}

/** Where a pack's recorded sessions live. */
function sessionRoot(gameDir, packName) {
  return path.join(gameDir, 'recordings', 'dub_recordings', packName);
}

/** The recorded sessions of a pack, with how many takes each holds. */
function packSessions(gameDir, packName) {
  const root = sessionRoot(gameDir, packName);
  const out = [];
  let names;
  try {
    names = fs.readdirSync(root);
  } catch {
    return out;
  }

  for (const name of names) {
    const dir = path.join(root, name);
    try {
      if (!fs.statSync(dir).isDirectory()) continue;
      const takes = fs.readdirSync(dir).filter((f) => /\.(wav|mp3|ogg)$/i.test(f));
      out.push({ name, dir, takes: takes.length });
    } catch { /* skip */ }
  }
  return out;
}

/**
 * Sessions recorded for packs that are no longer installed.
 *
 * These are invisible otherwise: the recordings sit outside the pack folders, so
 * removing a pack left its takes behind with nothing pointing at them.
 */
function orphanSessions(gameDir) {
  const root = path.join(gameDir, 'recordings', 'dub_recordings');
  const packsDir = path.join(gameDir, 'packs_voice');

  let recorded = [];
  try {
    recorded = fs.readdirSync(root);
  } catch {
    return [];
  }

  const out = [];
  for (const name of recorded) {
    const dir = path.join(root, name);
    try {
      if (!fs.statSync(dir).isDirectory()) continue;
      if (fs.existsSync(path.join(packsDir, name))) continue; // its pack is still here
      const sessions = packSessions(gameDir, name);
      out.push({
        name,
        dir,
        sessions: sessions.length,
        takes: sessions.reduce((sum, s) => sum + s.takes, 0),
      });
    } catch { /* skip */ }
  }
  return out;
}

/** Removes every recorded session of a pack. */
function deleteSessions(gameDir, packName) {
  const root = sessionRoot(gameDir, packName);
  try {
    if (!fs.existsSync(root)) return { removed: 0 };
    const count = packSessions(gameDir, packName).length;
    fs.rmSync(root, { recursive: true, force: true });
    return { removed: count };
  } catch (err) {
    return { removed: 0, error: err.message };
  }
}

/**
 * The takes recorded against one clip, across every session of a pack.
 *
 * The game writes them as `_dubrecord_<clip>.wav` under a folder per session,
 * with a `-2`, `-3` and so on when a line was recorded more than once. They live
 * outside the pack, so deleting a clip never touched them and left recordings
 * behind for a line that no longer exists.
 */
function clipRecordings(gameDir, packName, base) {
  const root = path.join(gameDir, 'recordings', 'dub_recordings', packName);
  const found = [];
  let sessions = [];
  try {
    sessions = fs.readdirSync(root);
  } catch {
    return found; // this pack has never been dubbed
  }

  const wanted = `_dubrecord_${base}`.toLowerCase();
  for (const session of sessions) {
    const dir = path.join(root, session);
    let files = [];
    try {
      if (!fs.statSync(dir).isDirectory()) continue;
      files = fs.readdirSync(dir);
    } catch { continue; }

    for (const file of files) {
      const stem = path.basename(file, path.extname(file)).toLowerCase();
      // The take suffix is part of the name, so an exact match is not enough.
      if (stem === wanted || stem.startsWith(`${wanted}-`)) {
        found.push({ path: path.join(dir, file), session, name: file });
      }
    }
  }
  return found;
}

function trashClip(packDir, base, trashRoot, alsoMove = []) {
  const stamp = `${Date.now()}_${base}`;
  const bin = path.join(trashRoot, stamp);
  fs.mkdirSync(bin, { recursive: true });

  const moved = [];
  for (const file of fs.readdirSync(packDir)) {
    if (path.basename(file, path.extname(file)) !== base) continue;
    const from = path.join(packDir, file);
    if (!fs.statSync(from).isFile()) continue;
    const to = path.join(bin, file);
    fs.renameSync(from, to);
    moved.push({ from, to });
  }

  // Recordings go into their own folder inside the same bin, because two
  // sessions can hold a take under exactly the same name.
  for (const take of alsoMove) {
    try {
      if (!fs.existsSync(take.path)) continue;
      const holder = path.join(bin, 'recordings', take.session);
      fs.mkdirSync(holder, { recursive: true });
      const to = path.join(holder, take.name);
      fs.renameSync(take.path, to);
      moved.push({ from: take.path, to });
    } catch { /* left where it is */ }
  }

  if (!moved.length) {
    fs.rmSync(bin, { recursive: true, force: true });
    throw new Error('Nothing to delete');
  }
  return { bin, moved };
}

/** Puts a trashed clip back where it came from. */
function restoreClip(moved) {
  for (const { from, to } of moved) {
    if (!fs.existsSync(to)) continue;
    fs.mkdirSync(path.dirname(from), { recursive: true });
    fs.renameSync(to, from);

    // Taking the file back out leaves its holding folder behind, and undoing a
    // few trims left a row of empty ones sitting in the app's data folder.
    try {
      const bin = path.dirname(to);
      if (!fs.readdirSync(bin).length) fs.rmdirSync(bin);
    } catch { /* not empty, or not ours to remove */ }
  }
  return { restored: moved.length };
}

/**
 * Removes a pack. Refuses anything outside the game folder, since this deletes
 * recursively and a wrong path would be unrecoverable.
 */
function deletePack(gameDir, packDir) {
  const root = path.resolve(gameDir);
  const target = path.resolve(packDir);

  const rel = path.relative(root, target);
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error('That folder is not inside the game folder');
  }
  // Must be exactly <gameDir>/packs_*/<name>, never a packs_ root itself.
  const parts = rel.split(/[\\/]/);
  if (parts.length !== 2 || !parts[0].startsWith('packs_')) {
    throw new Error('That does not look like a pack folder');
  }
  if (!fs.existsSync(target)) throw new Error('It is already gone');

  fs.rmSync(target, { recursive: true, force: true });
  return { removed: target };
}

module.exports = {
  clipRecordings,
  packSessions,
  orphanSessions,
  deleteSessions,
  pruneTrash,
  createPack,
  installPack,
  identifyPack,
  deletePack,
  trashClip,
  restoreClip,
  writeClipMeta,
  saveImage,
  TYPE_DIRS,
  writeIni,
  writeIniSections,
  safeFolderName,
};
