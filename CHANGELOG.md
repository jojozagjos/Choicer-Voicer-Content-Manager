# Changelog

## 1.0.1

Fixes, mostly around trimming a dub pack's video. Anyone who trimmed a video in
1.0.0 should read the last section.

### Trimming is no longer slow

- **Trimming a long video took minutes and now takes seconds.** A four minute
  1080p video took six and a half minutes and now takes about two, because the
  picture is copied rather than re-encoded wherever that is possible.
- The cut lands on the nearest whole frame at or just before the chosen point,
  never after it, so a trim cannot remove a moment that was meant to be kept.
  Every line still moves with the picture.
- Videos that cannot be cut this way are unaffected and take the old route.

### Trimming is safer

- **A trim is checked before it replaces the video.** If the result cannot be read
  back, the original is left exactly as it was rather than replaced by something
  broken.
- **Leaving the editor now stops the work.** Switching tabs part way through a
  trim left it running out of sight, where it would still overwrite the video on
  finishing, and its progress competed with whatever was started next. That is
  also why the percentage could jump around.
- Two jobs on the same pack can no longer collide. This is the cause of the
  problem described at the end.
- An interrupted conversion no longer leaves a part finished file behind in a pack
  folder.

### Undo, redo and the preview

- **Redo works after a trim.** Undo and Redo both appeared greyed out once the
  editor reopened, although the history was still there.
- Undo and Redo now show progress while they work rather than appearing frozen,
  and a step that fails stays available to try again instead of disappearing.
- **The video no longer plays underneath the trim panel or a job in progress.** It
  carried on behind the overlay, which made the overlay look wrong, and during a
  job the file playing was the one being rewritten.
- The play button now always matches what the video is doing.

### Packs

- **A line no longer appears twice.** A clip with both a `.txt` and an `.ini`
  beside it was counted once per file, so the pack listed every one of those lines
  twice and an export placed each of them twice. Packs shipped with `.txt` files
  reach this state as soon as they are edited, because the editor saves `.ini`.

### Recovering a video damaged by 1.0.0

Two trims running at once could damage a pack's video. The only sign was the next
trim failing with *"could not read how long the video is"*. The video from before
the trim is kept, so it can be recovered. In

    %APPDATA%\Choicer Voicer Content Manager\deleted-clips

find the most recent folder ending in `_trim` and copy the video inside it back
into the pack folder. 1.0.1 cannot get into this state.

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
