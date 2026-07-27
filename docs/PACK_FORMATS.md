# Pack formats

Consolidated from the official [content guide](https://thechoicervoicer.neocities.org/v2/content_guide)
and from reading real packs on disk. Where the two disagree, the real packs win, because that is
what the game actually loads.

Host packs and menu packs are **not documented** on the site (they appear as unlinked list items),
so those entries come entirely from inspecting real packs.

All pack folders live under the game data directory:

| OS | Path |
| --- | --- |
| Windows | `%APPDATA%\YeahMaybe\ChoicerVoicer\game` |
| macOS | `~/Library/Application Support/YeahMaybe/ChoicerVoicer/game` |
| Linux | `~/.local/share/YeahMaybe/ChoicerVoicer/game` |

**On a fresh install every `packs_*` folder is empty.** The "Default" entry shown in the game's
Customize menu is built into the game, not a folder on disk.

---

## packs_voice — voice packs and dub packs

Both kinds share one folder. A pack is a **dub pack** if it has `dub_video.ogv`, and a plain
**voice pack** otherwise.

```
packs_voice/<Pack Name>/
  _pack_info.ini              title, subtitle, authors, icon, readme
  _icon.png                   pack icon (also the fallback clip image)
  _pack_filler_image.png      default image for clips with no image of their own
  dub_video.ogv               dub packs only. OGV/Theora ONLY
  _backing_track.{mp3,ogg,wav}  optional, music and SFX with the dialogue removed
  01_clip.{mp3,ogg,wav}       one audio sample
  01_clip.{ini,txt}           that sample's metadata
  01_clip.png                 optional image, matched by filename
```

| Rule | Voice pack | Dub pack |
| --- | --- | --- |
| Max sample length | under 60 s | **6 s** |
| Audio formats | WAV, MP3, OGG | WAV, MP3, OGG |
| Video | none | `dub_video.ogv`, **OGV only** (Godot supports no other format) |
| Numbering prefix | not required | required, e.g. `01_`, `02_` |

Clip naming for dub packs is `[number]_[name]_[timestamp]`, e.g. `07_MyClip_44-048`, where the
timestamp uses `-` as the decimal point (44.048 s). Not every pack does this; the metadata file is
what actually counts.

### Clip metadata (`.ini` or `.txt`, same content either way)

```ini
[data]

caption="I- I don't understand Bubble."
image="cainenormal.png"
dub_timestamps=[1.866]
dub_characters=["Caine"]
```

| Key | Type | Notes |
| --- | --- | --- |
| `caption` | string | Shown on screen. Quotes inside are escaped `\"` |
| `image` | string | Filename. May omit the extension. If absent, `<clipname>.png` is used |
| `dub_timestamps` | array of number | **Absolute** position on the video timeline, in seconds. Also accepts `MM:SS` |
| `dub_characters` | array of string | Speaker name, used for captions and colours |

### Pack info (`_pack_info.ini`)

```ini
[data]

title="Caine's Crashout"
subtitle="Humans... They only think about modding choicer voicer..."
icon="cainehumans.png"
authors=["Randaj", "Randayo"]
readme="obviously made by glitch"
```

### Real-world variations the reader must tolerate

- Metadata as `.ini` **or** `.txt`
- Backing track as `.MP3`, `.mp3`, `.ogg` or `.wav`
- Timestamps as seconds (`[12.966]`) or timecode (`[00:00]`)
- Images named outright, without an extension (`image="_icon"`), or not declared at all

---

## packs_player — contestant packs

```
packs_player/<Name>/
  player.png                  ~500 x 1000. Bottom edge sits on the studio floor
  config_player.json
  talk_greet.wav              optional, up to 9 clips. Names are arbitrary
  talk_cheer.wav
  talk_upset.wav
```

```json
{
  "name": "JoJo",
  "introduction": "The best voicer in the land:",
  "color1": "accbd1",
  "color2": "ffffff",
  "audio_assignment": {
    "intro_greet": "talk_greet",
    "game_winner": "talk_cheer",
    "game_loser":  "talk_upset",
    "score_0": "talk_upset",
    "score_1": "talk_upset",
    "score_2": "",
    "score_3": "",
    "score_4": "talk_cheer",
    "score_5": "talk_cheer"
  }
}
```

Colours are hex **without** a leading `#`. An empty string in `audio_assignment` means silence.
Audio filenames are referenced without their extension.

---

## packs_host — host packs (undocumented)

```
packs_host/<Name>/
  host.png
  config_host.json
```

```json
{
  "name": "Rouxls Kaard",
  "host_type": "basic",
  "match_singleplayer": { "intro": {...}, "round": {...}, "judging": {...}, "end": {...} },
  "match_multiplayer":  { "intro": {...}, "round": {...}, "judging": {...}, "end": {...} },
  "twitch_standard":    { ... }
}
```

Every leaf is an **array of strings**; the game picks one at random. Placeholders that appear in
real packs: `<player>`, `<host_name>`, `<round>`, `<points>`, `<character_introduction>`.
`\n` inside a string is a line break.

Section keys observed, in the order the game uses them:

| Section | Keys |
| --- | --- |
| `intro` | `a_welcome`, `b_contestants` / `b_contestant`, `c_judges`, `d_explanation` |
| `round` | `a_get_ready`, `b_post_record`, `c_post_listen`, `round_next`, `round_final` |
| `judging` (multiplayer) | `judged_player`, `post_judging` |
| `judging` (singleplayer) | `score_0` … `score_6` |
| `end` (multiplayer) | `final_score`, `winner`, `tie_win`, `tie_win_start`, `tie_win_end`, `congrats_goodbye` |
| `end` (singleplayer) | `final_score`, `win_100`, `win_standard`, `win_barely`, `lose_barely`, `lose_standard`, `lose_0` |
| `twitch_standard` | `intro_audience`, `a_audience_turn_1`, `b_audience_turn_2`, `c_polls_closed` |

---

## packs_judges — judge packs

```
packs_judges/<Name>/
  judge1.png … judge5.png     ~500 x 1000, PNG or JPG
  judge1_voice.*  … judge5_voice.*
  scoreblip1.*    … scoreblip5.*
  success.png                 optional, 2:1 ratio, default 512 x 256
  judge1_success.png          optional, per-judge override
  config_judges.json          optional
```

Config supports `play_voices_with_blips: false` to suppress score blips. Judge names are set in
the game's Customization menu.

---

## packs_studio — studio packs

```
packs_studio/<Name>/
  model.glb                   or .gltf. Optional, replaces the studio environment
  music_studio.{wav,mp3,ogg}  optional
  screen.ogv                  optional. Loops, plays muted, on the score screen
  absolute_image.{png,jpg}    optional. Shown for a rare 6/5 score
  config_studio.json          optional
```

| Key | Type | Notes |
| --- | --- | --- |
| `use_builtin_light` | boolean | `false` when the model brings its own lighting |
| `music_studio_loop_start` | number | Sample count for WAV, seconds for MP3/OGG |

Creating a studio folder in-game generates a template `.glb` showing judge and contestant
positions. Judge pack images override studio pack ones.

---

## packs_chatter — chatter packs

```
packs_chatter/<Name>/
  config_chatter.ini          or .cfg
  clap.ogg
  laugh.ogg
```

```ini
[broad_keywords]
clap.ogg = ["clap", "👏"]
xdx.ogg = ["xdx"]

[exact_keywords]
gunshot.ogg = ["mychannel13Gun"]
oh1.ogg = ["oh", "Oh", "OH"]
oh2.ogg = ["oh", "Oh", "OH"]
```

`broad_keywords` match anywhere in the first word and ignore case, so `clap` also fires on
"clapping" and "CLAPS". `exact_keywords` must match exactly and are case sensitive. When several
files share a keyword the game picks one at random.

---

## packs_menu — menu packs (undocumented)

No public specification and no example on this machine. Needs a real pack to inspect before the
app can safely manage these.

---

## Formats the game accepts

| Media | Accepted | Notes |
| --- | --- | --- |
| Video | **OGV (Theora) only** | Godot supports nothing else. MP4, WebM, AVI and MOV must be converted |
| Audio | WAV, MP3, OGG | OGG is required for chatter clips |
| Images | PNG, JPG | PNG recommended for transparency |
| 3D | GLB, GLTF | Studio packs only |
