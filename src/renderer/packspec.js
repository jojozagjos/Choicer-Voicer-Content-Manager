/**
 * What file goes where, for every pack type the game reads.
 *
 * This is the file structure from the game's own in-app documentation, written
 * down once so the editors can be built from it rather than each hard-coding
 * its own idea of what a pack contains. Every entry is a file the game looks
 * for by a fixed name; the editor's job is to put the right thing there under
 * the right name, converted to a format the game accepts.
 *
 * `kind` decides how a slot is presented and what a dropped file is converted
 * to: images become PNG, audio becomes WAV, video becomes OGV. `n` expands a
 * slot into a numbered family, so `judge{n}` with `n: 5` becomes judge1
 * through judge5.
 */

/** Expands `{n}` families into one entry per number. */
function expand(slots) {
  const out = [];
  for (const slot of slots) {
    if (!slot.n) { out.push(slot); continue; }
    for (let i = 1; i <= slot.n; i++) {
      out.push({
        ...slot,
        n: null,
        key: slot.key.replace('{n}', i),
        label: slot.label.replace('{n}', i),
        index: i,
        family: slot.key,
      });
    }
  }
  return out;
}

const SPECS = {
  host: {
    blurb: 'The character who introduces players, explains the rounds, and reacts to scores.',
    groups: [
      {
        title: 'Picture',
        slots: [
          {
            key: 'host',
            label: 'Host picture',
            kind: 'image',
            required: true,
            note: 'Rescaled to the height of the game window, keeping its shape. Leave empty '
              + 'space in the image if you do not want it touching the edges. Falls back to '
              + 'Shae if it cannot be loaded.',
          },
        ],
      },
    ],
    config: 'config_host.json',
  },

  judges: {
    blurb: 'The five judges who score each performance, left to right.',
    groups: [
      {
        title: 'Judges',
        note: 'Pictures are not scaled, so a small image stays small. Around 1000 pixels tall '
          + 'suits a standing character. Short judges are hidden by their podium unless you '
          + 'add empty space below them.',
        slots: [{ key: 'judge{n}', n: 5, label: 'Judge {n}', kind: 'image' }],
      },
      {
        title: 'Score blips',
        note: 'These are not one per judge. They play in sequence for however many points were '
          + 'earned, so three points plays blips 1, 2 and 3. A gap in the middle of the run is '
          + 'worse than having none at all.',
        slots: [{ key: 'scoreblip{n}', n: 5, label: 'Blip {n}', kind: 'audio' }],
      },
      {
        title: 'Judge voices',
        note: 'Optional, one per judge, played alongside the blips when that judge gives a point.',
        slots: [{ key: 'judge{n}_voice', n: 5, label: 'Judge {n} voice', kind: 'audio' }],
      },
      {
        title: 'Success panels',
        note: 'What appears on a judge\'s podium when they give a point. Set one for everyone, '
          + 'or give a judge their own to override it. Transparency is not supported on the '
          + 'per judge ones.',
        slots: [
          { key: 'success', label: 'All judges', kind: 'image' },
          { key: 'judge{n}_success', n: 5, label: 'Judge {n} only', kind: 'image' },
        ],
      },
    ],
    config: 'config_judges.json',
  },

  studio: {
    blurb: 'The set a session takes place in.',
    groups: [
      {
        title: 'The set',
        slots: [
          {
            key: 'model',
            label: '3D model',
            kind: 'model',
            note: 'Replaces the whole studio. Larger files take longer to load when a session '
              + 'starts. Some lighting effects can tint a custom studio blue.',
          },
          {
            key: 'screen',
            label: 'Progress screen video',
            kind: 'video',
            note: 'Plays on the rightmost screen, behind the player\'s progress. Muted in game.',
          },
          {
            key: 'absolute_image',
            label: 'Rare score panel',
            kind: 'image',
            note: 'Shows on the screen above the judges when a player gets a very rare result.',
          },
        ],
      },
      {
        title: 'Music',
        slots: [
          {
            key: 'music_studio',
            label: 'Session music',
            kind: 'audio',
            audioFormat: 'ogg',
            note: 'Loops for the whole session.',
          },
        ],
      },
    ],
    config: 'config_studio.json',
  },

  menu: {
    blurb: 'The look and sound of the game\'s menus. Everything here is optional; anything you '
      + 'leave out keeps the game\'s own.',
    groups: [
      {
        title: 'Background',
        slots: [
          {
            key: 'background',
            label: 'Background image',
            kind: 'image',
            note: 'Sits beneath every other menu element. Whether it tiles or stretches is set '
              + 'in the pack selection menu.',
          },
          {
            key: 'video',
            label: 'Background video',
            kind: 'video',
            note: 'Replaces the background image and loops. Its own audio replaces the menu '
              + 'music unless audio.use_video is turned off. It can drift out of sync with its '
              + 'audio if the game stutters.',
          },
          {
            key: 'overlay',
            label: 'Overlay',
            kind: 'image',
            note: 'Drawn over everything except the letterbox, always stretched to the window.',
          },
        ],
      },
      {
        title: 'Clip placeholders',
        slots: [
          {
            key: 'unseen_image',
            label: 'Unseen clip',
            kind: 'image',
            note: 'Stands in for clips you have not heard yet when previewing a pack.',
          },
          {
            key: 'no_image',
            label: 'Clip with no picture',
            kind: 'image',
            note: 'Stands in for any clip that has no picture of its own.',
          },
        ],
      },
      {
        title: 'Sound',
        slots: [
          { key: 'music_menu', label: 'Menu music', kind: 'audio', audioFormat: 'ogg', note: 'Loops.' },
          { key: 'button_sfx_select', label: 'Button press', kind: 'audio' },
          { key: 'button_sfx_back', label: 'Back button', kind: 'audio' },
          { key: 'button_sfx_hover', label: 'Button hover', kind: 'audio' },
          {
            key: 'button_sfx_decrease',
            label: 'Other buttons',
            kind: 'audio',
            note: 'The name is a leftover; it covers assorted other buttons.',
          },
        ],
      },
    ],
    config: 'config_menu.json',
    // Every setting config_menu.json holds. Written out rather than inferred
    // from the file, so a pack missing a setting still offers it and a pack
    // carrying something unexpected does not turn into a mystery control.
    settings: [
      {
        title: 'Sound',
        fields: [
          {
            path: 'audio.use_video',
            label: "Use the background video's own audio",
            kind: 'bool',
            fallback: true,
            note: 'Off plays the menu music instead and mutes the video. Only has an effect once '
              + 'this pack has a background video.',
          },
          {
            path: 'audio.music_menu_loop_start',
            label: 'Music loop start',
            kind: 'number',
            fallback: 0,
            step: 'any',
            note: 'Where the music jumps back to when it loops. A sample count if the music is a '
              + 'WAV, a time in seconds if it is an OGG or MP3.',
          },
        ],
      },
      {
        title: 'Background',
        fields: [
          {
            path: 'stretch_background',
            label: 'Background fitting',
            kind: 'choice',
            fallback: false,
            options: [[false, 'Tile at its own size'], [true, 'Stretch to the window']],
          },
          {
            path: 'background.image.use_type',
            label: 'Image mode',
            kind: 'number',
            fallback: 1,
            note: 'Which of the game\'s background modes to draw the image with. The game does not '
              + 'document what each number does, so this is worth trying a few values on.',
          },
          {
            path: 'background.image.scroll.x',
            label: 'Scroll across',
            kind: 'number',
            fallback: 0,
            step: 'any',
          },
          {
            path: 'background.image.scroll.y',
            label: 'Scroll down',
            kind: 'number',
            fallback: 0,
            step: 'any',
          },
          { path: 'background.overlay.on', label: 'Draw the overlay image', kind: 'bool', fallback: false },
        ],
      },
      {
        title: 'Background effects',
        fields: [
          { path: 'background.circles.on', label: 'Circles', kind: 'bool', fallback: false },
          { path: 'background.circles.color', label: 'Circle colour', kind: 'rgba' },
          { path: 'background.waves.on', label: 'Waves', kind: 'bool', fallback: false },
          { path: 'background.waves.color', label: 'Wave colour', kind: 'rgba' },
          { path: 'background.top_gradient.on', label: 'Gradient at the top', kind: 'bool', fallback: false },
          { path: 'background.top_gradient.color', label: 'Top gradient colour', kind: 'rgba' },
          { path: 'background.bottom_gradient.on', label: 'Gradient at the bottom', kind: 'bool', fallback: false },
          { path: 'background.bottom_gradient.color', label: 'Bottom gradient colour', kind: 'rgba' },
        ],
      },
      {
        title: 'Clip disc',
        fields: [
          {
            path: 'background.clip_disc.state',
            label: 'Disc state',
            kind: 'number',
            fallback: 0,
            note: 'The game does not document what each number does.',
          },
          { path: 'background.clip_disc.color', label: 'Disc colour', kind: 'rgba' },
        ],
      },
      {
        title: 'Letterbox',
        fields: [
          { path: 'background.letterbox.on', label: 'Letterbox', kind: 'bool', fallback: false },
          // Six digits here where everything else uses eight. The game's own
          // packs are written that way, so this follows them.
          { path: 'background.letterbox.color', label: 'Letterbox colour', kind: 'rgb' },
          { path: 'background.letterbox.accent', label: 'Letterbox accent', kind: 'rgb' },
        ],
      },
      {
        title: 'Buttons',
        fields: [
          { path: 'ui.button.color1', label: 'Button colour 1', kind: 'rgba' },
          { path: 'ui.button.color2', label: 'Button colour 2', kind: 'rgba' },
          { path: 'ui.button.invert', label: 'Swap the two colours', kind: 'bool', fallback: false },
        ],
      },
    ],
  },

  chatter: {
    blurb: 'Sounds triggered by words in Twitch chat during a session. The first word of a '
      + 'message is checked against your keywords.',
    groups: [],
    config: 'config_chatter.ini',
  },
};

export function specFor(type) {
  const spec = SPECS[type];
  if (!spec) return null;
  return {
    ...spec,
    groups: spec.groups.map((g) => ({ ...g, slots: expand(g.slots) })),
  };
}

/** Every slot a type defines, flattened. */
export function slotsFor(type) {
  const spec = specFor(type);
  return spec ? spec.groups.flatMap((g) => g.slots) : [];
}

/** What a slot's file may be, for the file picker and the drop zone. */
export const KIND_ACCEPTS = {
  image: 'image',
  audio: 'audio',
  video: 'video',
  model: 'all',
};
