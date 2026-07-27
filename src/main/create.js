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

module.exports = { createPack, TYPE_DIRS, writeIni, safeFolderName };
