# Releasing

Everything needed to put a version out, in order.

## 1. Before you build

- [ ] `package.json` version is what you are releasing (`1.0.0` right now)
- [ ] `CHANGELOG.md` describes this version
- [ ] Screenshots exist in `docs/screenshots/`, or the README's image table is removed
- [ ] Everything is committed and pushed

## 2. Build it

```bash
npm run build:zip
```

You get two things in `dist/`:

| | |
| --- | --- |
| `Choicer Voicer Content Manager/` | The app folder. This is what people run. |
| `Choicer_Voicer_Content_Manager_v1.0.0_win32_x64.zip` | ~167 MB. **This is what you upload.** |

**Yes, you need the zip.** The app is a folder of 115 files, not a single exe,
and GitHub rejects any file over 100 MB anyway. The zip is the only sensible
way to hand it over.

Check the zip before uploading: extract it somewhere else and run the exe from
there. If it starts and finds your packs, it is good.

## 3. The release form, field by field

Go to **Releases → Draft a new release** on the repo.

### Tag

Type `v1.0.0` and pick **Create new tag: v1.0.0 on publish**. The `v` prefix is
the convention, and the app's update check strips it, so it must be there.

### Target

`main`. Leave it.

### Release title

```
v1.0.0 — first release
```

### Release notes

Press **Generate release notes** first if you want the commit list, then put
this above it:

```markdown
The first release of Choicer Voicer Content Manager: an unofficial fan tool for
The Choicer Voicer. It turns the dubs you record into video files, and it builds
the content packs you record them with.

**Not made by, affiliated with, or endorsed by Yeah Maybe.** Please report
problems here rather than to them.

## Getting started

1. Download the zip below and **unzip the whole folder**. Running the exe from
   inside the zip will fail.
2. Run `Choicer Voicer Content Manager.exe`.
3. Point it at your game folder when it asks. It never goes looking on its own.

## What it does

**Export your dubs.** Plays your takes back over the pack's video and backing
track, then renders it to MP4, MKV, MOV or WebM. Per line you can swap between
your take and the original, change the volume, or nudge the timing. Vertical
9:16 for Shorts and TikTok, burned-in captions or a `.srt` alongside.

**Build packs.** A timeline editor for dub packs: scrub the video, mark a range,
and the clip and its timestamp come out together, instead of cutting audio in
another program and typing timestamps in by hand. Backing tracks are built from
the video's own audio. Editors for all seven pack types. Anything you drop in is
converted to a format the game accepts.

**Check packs.** Every pack is measured against what the game will actually
load, so you find out before the game quietly ignores it.

## Windows will warn you

You will see **"Windows protected your PC"**. Click **More info**, then
**Run anyway**.

This happens because the app is not signed with a paid code-signing
certificate. It also reads and writes files it was not explicitly given
permission to, which is the entire job: the packs and recordings belong to the
game. Nothing leaves your computer. The one time it uses the network is to ask
GitHub whether a newer version exists.

The source is here if you want to read it or build it yourself.

## Licensing

The app is MIT. The download also carries FFmpeg, which is GPL v3; its licence
and a written offer for its source are in the `licenses` folder inside the zip.
```

### Attach binaries

Drag in `Choicer_Voicer_Content_Manager_v1.0.0_win32_x64.zip`.

### Release label

**None.** Pre-release is for something you do not want people using yet.

### Set as latest release

Leave it ticked. The app's update check reads
`/releases/latest`, so an unticked release is invisible to it.

## 4. After publishing

- [ ] Download your own zip from the release page and run it once
- [ ] Check the version badge in the app's top bar reads `1.0.0`

## Later versions

Bump `package.json`, add to `CHANGELOG.md`, rebuild, tag the next number.
Anyone on an older build sees the version badge in their top bar turn into
`1.0.0 → 1.1.0`, and clicking it brings them to the release page.
