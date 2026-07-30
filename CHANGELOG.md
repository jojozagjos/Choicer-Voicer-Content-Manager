# Changelog

## 1.0.1

Fixes for trimming, undo and pack audio.

### Trimming

- Trimming a long video takes seconds rather than minutes.
- The cut lands on the nearest frame at or before the chosen point, so a trim
  never removes a moment that was meant to be kept. Lines still move with the
  picture.
- A trim is checked before it replaces the video. If the result cannot be read
  back, the original is kept.
- Leaving the editor or switching tabs cancels a trim that is still running,
  instead of letting it finish out of sight.
- The progress figure no longer jumps around when more than one job has been
  started.

### Undo and redo

- Redo works after trimming a video. Both buttons now match the history when the
  editor reopens.
- Both show progress while they work, and a step that fails stays available to
  try again.

### The preview

- The video no longer plays underneath the trim panel or a job in progress.
- The play button always matches what the video is doing.

### Menu and studio packs

- The menu editor offers every setting in `config_menu.json`: background mode and
  scrolling, circles, waves, both gradients, the overlay, the letterbox, the clip
  disc, button colours and the music loop point. It previously offered two of
  them. Colours are picked from a swatch, with an alpha slider where the setting
  takes one.
- Menu and session music is saved as OGG rather than WAV, which was turning a few
  minutes of music into a file of well over a hundred megabytes.

### Packs

- A clip with both a `.txt` and an `.ini` beside it is no longer listed twice, or
  exported twice.
- Retiming a clip replaces its audio rather than leaving a second file beside it.
  A clip with two audio files could be played twice by the game.
- A clip that already has more than one audio file is reported, with the names of
  the files.
- Recording a take no longer fades in at the start.
- An interrupted conversion no longer leaves a part finished file in a pack
  folder.

### Recovering a video damaged by 1.0.0

In 1.0.0, two trims running at once could damage a pack's video. The sign is a
trim failing with *"could not read how long the video is"*.

The video from before a trim is always kept. To put it back, look in

    %APPDATA%\Choicer Voicer Content Manager\deleted-clips

for the most recent folder ending in `_trim`, and copy the video inside it into
the pack folder. 1.0.1 cannot get into this state.

## 1.0.0

First release.

### Exporting a dub

- Reads the dubs already recorded in *The Choicer Voicer* and plays them back
  over the original video.
- Per line: which take to use, how loud it is, and how far to nudge its timing.
- Exports to MP4 or WebM, at source size or reformatted to 9:16 for Shorts,
  TikTok and Reels, filling the sides with a blurred copy rather than black bars.
- Captions can be burned into the picture or written out as a `.srt`.
- Character colours carry through from the line list to the captions.
- Exports queue and run one at a time.

### Building packs

All seven pack types the game reads can be created, checked and edited.

- **Voice and dub packs** get a timeline editor. Mark a range against the video
  and the clip and its timestamp come out together, rather than cutting audio in
  another program and typing timestamps in by hand.
  - Captions drawn over the video while editing.
  - A backing track built from the video's own audio, quietened under each line.
  - Trimming the video in time, with every clip shifted to stay in sync.
  - Pictures from a video frame, a file, or reused from elsewhere in the pack.
  - Undo covers all of it, including deletions.
- **Players, hosts, judges, studios and menus** each get an editor built from the
  file structure that type actually uses.
- **Chatter packs** get a keyword table, with exact and broad matching kept
  apart because they behave differently.
- Anything dropped in is converted to a format the game accepts. Dropping an
  `.mp4` is the most common reason a pack silently does nothing, and it is
  always fixable.
- Unzipped packs can be dropped straight onto the library; the type is worked
  out from what is inside.
- Every pack is checked against what the game actually loads, and anything wrong
  is listed with what to do about it.

### Notes

- The game stores video as Ogg Theora, which browsers stopped decoding in 2024.
  A preview copy is made the first time a pack is opened, once per pack.
- The app only reads and writes files beside the game. It does not modify the
  game itself.
- Ships FFmpeg under the GPL v3. See `THIRD-PARTY-NOTICES.md`.
