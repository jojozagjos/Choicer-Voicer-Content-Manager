# Third party notices

Choicer Voicer Content Manager is MIT licensed (see `LICENSE`). The **downloadable
build** is not only this app: it carries other people's software alongside it, and
some of that is under stricter terms than MIT. Those terms travel with the build,
so they are set out here in full.

If you only ever clone this repository and run it with `npm start`, none of the
binaries below are yours to redistribute and this file is informational. It
matters when you hand someone a build.

---

## FFmpeg — GPL v3, and this is the important one

The build includes `ffmpeg.exe`, supplied by the [`ffmpeg-static`][ffmpeg-static]
package. That package ships a **gyan.dev "essentials" build of FFmpeg 6.1.1**,
configured with `--enable-gpl --enable-version3`.

Those two flags matter. An FFmpeg built that way is licensed under the
**GNU General Public License, version 3 or later**, not the LGPL that a default
FFmpeg build uses. Distributing it brings obligations with it.

**What this app does to satisfy them**

- The GPL v3 text is included with every build, at `licenses/FFmpeg-GPLv3.txt`.
- This notice ships with every build, at `licenses/THIRD-PARTY-NOTICES.md`.
- Corresponding source is identified below, along with a written offer.

**Written offer for the corresponding source**

The complete corresponding source for the FFmpeg binary in this build, and the
scripts used to configure and build it, are available from:

- FFmpeg source: <https://ffmpeg.org/releases/> (version 6.1.1)
- The exact build and its build scripts: <https://github.com/GyanD/codexffmpeg>
  (release `6.1.1`, "essentials" variant)
- The packaging that placed it here: <https://github.com/eugeneware/ffmpeg-static>

If those become unreachable, open an issue on
<https://github.com/jojozagjos/Choicer-Voicer-Content-Manager> and I will provide
the corresponding source directly, at no charge, for at least three years from the
date you received the build.

**Why the app itself can still be MIT**

This app never links against FFmpeg. It runs `ffmpeg.exe` as a separate process
and talks to it over the command line and its output, the same way you would from
a terminal. The two are aggregated on one disk rather than combined into one
program, so the app's own source stays under its own licence while the FFmpeg
binary stays under the GPL and carries the obligations above.

That is the common reading and the one this project relies on. It is not legal
advice. If you plan to redistribute builds of this yourself, especially
commercially, read the GPL v3 and decide for yourself. Replacing the bundled
binary with an LGPL FFmpeg build would remove the question entirely, at the cost
of some encoders.

## ffprobe-static — MIT

`ffprobe.exe` comes from [`ffprobe-static`][ffprobe-static], MIT licensed. The
FFmpeg project's own terms still apply to the `ffprobe` binary itself on the same
basis as above.

## demucs-rs and HTDemucs — optional downloads

AI backing-track separation downloads [`demucs-rs`][demucs-rs] v0.3.4 on first
use. It is licensed under Apache License 2.0. The standard HTDemucs model is
downloaded separately from the [`audio_separation`][audio-separation] model
repository and is licensed under MIT. Neither is included in the app installer.

The app pins and verifies both downloads before accepting their output. Media is
processed locally and is not sent to either project.

## Electron — MIT, plus Chromium and Node

The app runs on [Electron][electron] 43, MIT licensed. Electron embeds Chromium
and Node.js, which carry a large collection of their own licences. Electron ships
the full set as `LICENSES.chromium.html`; that file is included in the build
folder as Electron itself places it.

## The game

*The Choicer Voicer* is a game by **Yeah Maybe**. This app is not affiliated with
it or endorsed by it. No part of the game is included, copied, or redistributed
here. The app reads and writes files the game has already put on your own machine.

Content packs, and the audio, art and captions inside them, belong to whoever made
them. Check with a pack's author before publishing videos built from their work.

[ffmpeg-static]: https://github.com/eugeneware/ffmpeg-static
[ffprobe-static]: https://github.com/joshwnj/ffprobe-static
[electron]: https://github.com/electron/electron
[demucs-rs]: https://github.com/nikhilunni/demucs-rs
[audio-separation]: https://huggingface.co/set-soft/audio_separation
