# Choicer Voicer Content Manager

> **Unofficial fan tool.** Made by [@jojozagjos](https://discord.com/users/jojozagjos). Not made by,
> affiliated with, endorsed by, or supported by **Yeah Maybe**, who made *The Choicer Voicer*.
> Please do not ask them for help with it.

A desktop companion for [The Choicer Voicer](https://yeahmaybe.itch.io/the-choicer-voicer).
It does two jobs: it turns the dubs you record into video files, and it builds the content packs
you record them with.

The game saves your takes as loose `.wav` files but gives you no way to get them out. This app
finds them, lays each take back over the pack's video and backing track exactly where it belongs,
lets you preview the result, and renders it to MP4 (or MKV / MOV / WebM).

It also manages all seven kinds of content pack the game reads, checking each one against what the
game will actually load and telling you what is wrong before the game quietly ignores it.

Made by **@jojozagjos** — [Discord](https://discord.com/users/jojozagjos)

---

## What it does

### Turning a dub into a video

- **Finds your dubs automatically.** Locates the game's data folder on startup, lists every voice
  pack and every recording session you've made.
- **Previews the finished dub.** Plays the video with your takes mixed over the backing track,
  with live captions and character portraits, which is the same thing you'll get on export.
- **Exports video.** H.264/AAC MP4 by default, plus MKV, MOV and VP9/Opus WebM.
- **Fixes takes without re-recording.** Per line, swap between your take and the original audio,
  silence it, change its volume, or nudge its timing in 50 ms steps.
- **Handles freestyle sessions** (one continuous take over the whole video) as well as
  line-by-line ones.

### Building packs

- **A timeline editor for dub packs.** The official route is to cut audio in another program, name
  each export with its timestamp by hand, then type those timestamps back into the game. Here you
  scrub the video, mark a range, and the clip and its timestamp come out together.
- **Backing tracks from the video itself.** The pack already knows when every line speaks, so the
  video's own audio is quietened under those ranges. Muffled by default, so the scene keeps its
  atmosphere; silenced if you prefer.
- **Editors for every other type** — players, hosts, judges, studios, menus and chatter — each
  built from the file structure that type actually uses.
- **Converts anything you drop in.** An `.mp4` where the game wants `.ogv` is the single most
  common reason a pack silently does nothing, and it is always fixable.
- **Installs packs by drag and drop.** Unzip and drop the folder on the library; the type is
  worked out from what is inside.
- **Undo everywhere**, including deletions, which move files aside rather than removing them.

### Extras

| Option | What it's for |
| --- | --- |
| **Vertical 9:16 / Square 1:1** | Shorts, TikTok and Reels. Letterboxes over a blurred, zoomed copy of the video instead of black bars. |
| **Burn captions in** | Renders the pack's script onto the video, speaker name included. |
| **`.srt` sidecar** | Writes subtitles as a separate file so you can style them in your own editor. |
| **Normalise dub loudness** | Evens out takes recorded at wildly different levels (EBU R128, −16 LUFS). |
| **Selected line only** | Exports a single line as its own short clip. |
| **Include original audio** | Lays the video's original dialogue underneath yours, for reference. |
| **Light / dark / system theme** | Set in the top bar or in Settings. |

---

## Running it

### The easy way: a standalone app

Build it once, then just double-click the `.exe` forever after. No Node, no npm, no terminal.

```bash
npm install
npm run build
```

That writes a self-contained folder to `dist/`:

```
dist/Choicer Voicer Content Manager/
  Choicer Voicer Content Manager.exe   <- double-click this
  resources/ ...
```

The whole folder **is** the app, so move it, zip it, or drop it on another machine as one piece.
ffmpeg is bundled inside it, so nothing else needs installing. Make a desktop shortcut to the
`.exe` and you never have to touch the repo again.

> **Building inside OneDrive, Dropbox or Google Drive?** The build is around 400 MB. Your sync
> client will try to upload all of it, and can lock files mid-build and fail it. Send the output
> somewhere else instead:
>
> ```bash
> CV_BUILD_OUT=%LOCALAPPDATA%\ChoicerVoicerExport npm run build
> ```
>
> The same goes for `node_modules`: thousands of small files in a synced folder makes for a
> miserable time. Keeping the repo itself outside your synced folders is the tidier option.

### Rebuilding after a change

Run `npm run build` again. Your settings, theme and cached previews live in your user profile,
not the app folder, so they survive. **Close the app first** or Windows will not let the folder be
replaced.

### From source

Requires [Node.js](https://nodejs.org/) 18 or newer.

```bash
npm install
npm start
```

If you'd rather use your own ffmpeg than the bundled one, point at it under
**Settings → ffmpeg**.

---

## Sharing it with other people

**Send them the zip, not the repo.** Most people who want to use this do not want to install
Node and run npm.

### Making the zip

```bash
npm run build:zip
```

That produces the app folder plus a zip ready to attach to a release, around 155 MB.

### Putting it on GitHub

The build cannot live in the repository. GitHub rejects any single file over 100 MB, and the
`.exe` alone is 188 MB. That is what **Releases** are for, and they allow up to 2 GB per file.

1. Push the source as normal. `.gitignore` already keeps builds out.
2. On your repo page, go to **Releases** then **Draft a new release**.
3. Create a tag such as `v1.0.0` and give it a title.
4. Drag the zip into the attachments box.
5. Publish.

People then download the zip straight from the release page. Send them that link.

### What to tell whoever you send it to

- **Unzip the whole folder before running it.** Windows lets you run an `.exe` from inside a zip,
  and it will fail, because the app needs the files sitting next to it.
- **Windows will show a blue "Windows protected your PC" warning.** That is SmartScreen reacting
  to an app without a paid code-signing certificate, not a virus warning. They click **More info**
  then **Run anyway**. Some antivirus software is also suspicious of unsigned Electron apps.
- **They need the game installed**, or at least a copy of its `game` folder, since the app reads
  the packs and recordings the game wrote.

### Licensing, briefly

The source here is MIT. The packaged app also bundles ffmpeg, which is GPL v3, so the build
includes ffmpeg's licence text and the source is linked from `LICENSE`. Since ffmpeg is run as a
separate program rather than linked into the app, this is the same arrangement plenty of other
tools that ship `ffmpeg.exe` use. Not legal advice, but it is the normal way to do this.

Voice packs belong to whoever made them, so check with the authors before publishing videos made
from their work.

---

## Where your dubs live

The app looks here by default:

| OS | Path |
| --- | --- |
| Windows | `%APPDATA%\YeahMaybe\ChoicerVoicer\game` |
| macOS | `~/Library/Application Support/YeahMaybe/ChoicerVoicer/game` |
| Linux | `~/.local/share/YeahMaybe/ChoicerVoicer/game` |

If yours is somewhere else (a portable install, a different drive, a copied save folder), open
**Settings → Game folder** and pick it. Any folder containing
`packs_voice` works, and it will also accept the `ChoicerVoicer` or `YeahMaybe` folder above it
and find the rest itself. The choice is remembered.

---

## How it works

Each voice pack is a folder under `packs_voice/`:

```
packs_voice/<Pack Name>/
  _pack_info.ini          title, subtitle, authors
  _backing_track.mp3      music and SFX bed, no dialogue
  dub_video.ogv           the video (Theora/Vorbis)
  01_caine.ini            one dialogue line
  01_caine.mp3            the original dialogue for that line
  cainenormal.png         character portrait
```

A line's `.ini` holds the piece that makes everything else possible:

```ini
[data]
caption="I- I don't understand Bubble."
image="cainenormal.png"
dub_timestamps=[1.866]
dub_characters=["Caine"]
```

`dub_timestamps` is the line's **absolute start time on the video timeline**. Your recordings sit
in `recordings/dub_recordings/<Pack Name>/<session>/` as `_dubrecord_<line>.wav`, and each one is
the same length as the line it replaces. So rebuilding a dub is just: take the video, lay the
backing track under it, and drop each take in at its timestamp.

Export does exactly that with a single ffmpeg pass. Every take gets `adelay`'d to its position
and mixed with `amix=normalize=0` (the default would divide everything by the input count and
make a 30-line dub inaudible), then run through a limiter.

Preview does the same thing live in the browser engine: the `<video>` element is the master clock
and every take is scheduled against the Web Audio clock relative to it, with a watchdog that
resyncs if the two drift more than 120 ms apart.

### Why the first open of a pack takes a moment

Pack videos are Ogg Theora. Chromium removed Theora decoding in version 123, so the video element
loads these files, reports the correct duration, and then draws nothing: `videoWidth` stays `0`.

ffmpeg still decodes Theora, so the first time you open a pack the app transcodes its video into a
small 720p MP4 and previews that. It's cached, so it only happens once per pack. **Exports always
read the original `.ogv` at full quality**. The proxy is only ever used for on-screen preview.

### Pack format quirks it handles

Packs in the wild are inconsistent, so the reader copes with all of these:

- Line metadata as either `.ini` or `.txt`
- Backing tracks named `_backing_track` with `.mp3`, `.MP3`, `.ogg` or `.wav`
- Timestamps as seconds (`[12.966]`) or as a timecode (`[00:00]`)
- Portraits named outright (`image="Light.png"`), without an extension (`image="_icon"`), or not
  declared at all, in which case it looks for a `.png` matching the clip name

---

## Keyboard shortcuts

| Key | Action |
| --- | --- |
| `Space` | Play / pause |
| `←` / `→` | Seek 5 s (hold `Shift` for 1 s) |
| `E` | Export |
| `R` | Rescan the game folder |

---

## Notes

**This is an unofficial fan tool.** It is not made by, affiliated with, endorsed by or supported by
Yeah Maybe. Bugs here are mine; please report them on this repo rather than to them.

*The Choicer Voicer*, its name and its artwork belong to **Yeah Maybe**. No part of the game is
included in or redistributed by this repo or its releases.

This tool only reads and writes files beside the game on your own computer. It does not modify the
game itself, and it sends nothing anywhere; the one time it uses the network is to ask GitHub
whether a newer version of this app exists.

Content packs, and the audio, art and captions inside them, belong to whoever made them. Check with
a pack's author before publishing anything built from their work, and credit them when you do.

## Licensing

The app is MIT licensed, see [LICENSE](LICENSE).

The **download** also carries [FFmpeg](https://ffmpeg.org/), which does the video and audio work.
The build bundled here is compiled with `--enable-gpl --enable-version3`, so it is under the
**GPL v3**, not the LGPL a default FFmpeg build uses. Every release ships the GPL text and a
written offer for its corresponding source in a `licenses/` folder next to the app.

FFmpeg runs as a separate program rather than being linked in, which is why the two licences sit
side by side. If you plan to redistribute builds yourself, read
[THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md) first. It is not legal advice.

## Also in this repo

| File | What's in it |
| --- | --- |
| [CHANGELOG.md](CHANGELOG.md) | What changed between releases |
| [docs/PACK_FORMATS.md](docs/PACK_FORMATS.md) | Every pack type the game reads, and exactly what goes in one |
| [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md) | Licences of everything the build carries |
