# Choicer Voicer Export

A desktop companion for [The Choicer Voicer](https://yeahmaybe.itch.io/the-choicer-voicer) that
rebuilds the dubs you record in the game and exports them as real video files.

The game saves your takes as loose `.wav` files but gives you no way to get them out. This app
finds them, lays each take back over the pack's video and backing track exactly where it belongs,
lets you preview the result, and renders it to MP4 (or MKV / MOV / WebM).

Made by **Joseph Slade**.

---

## What it does

- **Finds your dubs automatically.** Locates the game's data folder on startup, lists every voice
  pack and every recording session you've made.
- **Previews the finished dub.** Plays the video with your takes mixed over the backing track,
  with live captions and character portraits, which is the same thing you'll get on export.
- **Exports video.** H.264/AAC MP4 by default, plus MKV, MOV and VP9/Opus WebM.
- **Fixes takes without re-recording.** Per line, swap between your take and the original audio,
  silence it, change its volume, or nudge its timing in 50 ms steps.
- **Handles freestyle sessions** (one continuous take over the whole video) as well as
  line-by-line ones.

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
npm run package
```

That writes a self-contained folder to `dist/`:

```
dist/Choicer Voicer Export-win32-x64/
  Choicer Voicer Export.exe     <- double-click this
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
> CV_BUILD_OUT=%LOCALAPPDATA%\ChoicerVoicerExport npm run package
> ```
>
> The same goes for `node_modules`: thousands of small files in a synced folder makes for a
> miserable time. Keeping the repo itself outside your synced folders is the tidier option.

### Updating it after a code change

```bash
npm run update-app
```

That rebuilds and replaces the installed app in place. Your shortcut keeps working, and your
settings, chosen theme and cached previews are all untouched, since those live in your user
profile rather than in the app folder.

**Close the app first.** Windows will not let the folder be replaced while the exe is running,
and the script says so rather than leaving you with a half-written app.

By default it installs to a folder named `Choicer Voicer Export` beside this repo. Point it
somewhere else with `CV_INSTALL_DIR`:

```bash
CV_INSTALL_DIR=D:\Apps\ChoicerVoicerExport npm run update-app
```

The build is staged in a temp folder and only swapped in at the end, so a sync client holding a
lock cannot leave you with a broken install.

### From source

Requires [Node.js](https://nodejs.org/) 18 or newer.

```bash
npm install
npm start
```

If you'd rather use your own ffmpeg than the bundled one, point at it under
**Settings → ffmpeg**.

### Installers

`npm run dist` uses electron-builder to produce a proper installer. On Windows it needs symlink
privileges to unpack its code-signing bundle, so it only works with Developer Mode enabled or from
an admin shell. `npm run package` has no such requirement, which is why it's the recommended route.

---

## Sharing it with other people

**Send them the zip, not the repo.** Most people who want to use this do not want to install
Node and run npm.

### Making the zip

```bash
npm run package
```

Then compress the folder it produced. The result is around 155 MB.

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

If yours is somewhere else (a portable install, a different drive, a copied save folder), click
the path in the top bar (or **Settings → Game folder**) and pick it. Any folder containing
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

This tool only reads files the game has already written to your own computer. It is not
affiliated with or endorsed by the developers of The Choicer Voicer. Voice packs belong to their
respective authors, so check with them before publishing anything made from their work.

Video encoding by [ffmpeg](https://ffmpeg.org/).
