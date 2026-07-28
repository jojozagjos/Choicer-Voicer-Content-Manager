# Changelog

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
