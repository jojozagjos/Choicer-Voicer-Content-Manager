# Changelog

## 1.0.3

Working with a pack that has been recorded several times over.

### Recording sessions

- A session can be deleted, with the button beside the take session list. It
  removes that session's recordings and nothing else, leaving the pack and every
  other session untouched.
- A session that has not been listened to yet is marked NEW in the list. After a
  run of takes, the one just recorded is the one that stands out rather than the
  one that has to be worked out from the names.
- The mark comes off as soon as the session is opened.

### Content

- The content list has a search box, narrowing the packs shown as a name is
  typed.

## 1.0.2

Fixes throughout, found while building packs with 1.0.1.

### Editing a line

- Typing a caption or a character saves shortly after typing stops, and anything
  still unsaved is written before the list is rebuilt. Editing a line and then
  clicking the timeline used to throw the typing away and put the old wording
  back.
- A line that fails to save says so, rather than showing the new wording until
  something reads the pack again and replaces it.
- The character box offers every name in the pack, whatever has been typed, with
  the closest matches sorted to the top. It draws one arrow rather than two, and
  opens upwards when there is no room below instead of running off the screen.

### Volume

- Each character has their own volume, set beside their colour in Settings. It
  multiplies every line that character speaks, on top of the volume already set
  for each individual line, so one quiet performer can be lifted without
  disturbing the balance between their own lines.
- The preview follows it as soon as it changes, so it can be heard rather than
  taken on trust.
- Exporting has a setting for whether to use these, listing what each character
  is currently set to.
- The export window shows the music and dub balance the sliders under the player
  are set to, so what is about to be exported is clear without leaving it. A
  freestyle recording follows the dub slider too, which is the only control it
  has.

### The timeline

- Clicking the empty space under a line moves the playhead instead of selecting
  that line.
- Starting a drag below a clip no longer takes hold of the clip above it.
- Playing the video after leaving the editor idle for a while no longer starts
  silent for a second.

### Keeping up with the game folder

- Packs changed outside the app appear on their own: a pack unzipped into the
  folder, a recording made in the game, a picture replaced in another program.
  Rescan is still there for anything a watch cannot see.
- The pack being edited is reloaded only when the change was to that pack.
- Rereads are spaced out, so a stream of changes no longer becomes a stream of
  rescans.
- Pictures no longer reload across the whole library when one pack changes. Only
  the pack that changed is fetched again, so the grid no longer fills back in
  from the top down.

### Packs

- Deleting a line asks what to do with the dub recordings of it, and can delete
  them alongside. Keeping them is the other option, and undo puts back whichever
  was taken.
- Deleting a pack offers the same choice for its recorded sessions, which live
  outside the pack folder and were left behind.
- Recordings whose pack is no longer installed are listed on the Content tab.
  Nothing mentioned them before, so they were invisible.
- Muffling a backing track is quieter again: about 19 dB under the original where
  it was 12, with the roll-off moved from 900 Hz down to 600.
- Evening out the volume of takes now levels each take rather than the finished
  mix, so a take recorded far quieter than the rest is brought into line with
  them. It previously left the difference between lines untouched.
- Pictures of a character are brought down to the size the game draws one at,
  whether they arrive as a pack's standing art, a clip picture, or a frame
  grabbed from the video. Backgrounds, overlays and pack icons are left alone.

### Around the app

- A pack whose conversion fails no longer stays locked for the rest of the
  session. While one is converting its panel says so and shows how far along it
  is, rather than offering an Edit button that refuses.
- Confirmation dialogs are easier to read: narrower, with room around the
  question and larger buttons.
- The undo bin no longer grows without limit. Older entries are cleared once it
  passes a few hundred megabytes, and nothing from the last hour is removed, so
  an open editor keeps everything it can still undo.

### Safety

- Opening a pack folder refuses anything that is not a folder inside the game
  folder. It previously opened whatever path it was given, which on Windows means
  handing a file to whichever program claims it.

## 1.0.1

Fixes for trimming, undo and pack audio, fuller editors for menu and studio
packs, and a list of what each version changed.

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

### The dub editor

- Building a backing track and then immediately building another works. The lane
  also appears as soon as a track is built, rather than after leaving the pack
  and opening it again.
- Muffling a backing track sits further under the original audio, and rolls off
  lower, so the original dialogue can no longer be followed through it.
- The pause before dragging out a new clip is shorter, and no longer feels like
  waiting.
- A line's picture options open to the left of its thumbnail, where they are no
  longer cut off by the edge of the list, and stay open while the pointer moves
  onto them.
- The prompt about not having recorded any dubs stays out of the Content tab,
  where it was appearing while building unrelated packs.

### Menu and studio packs

- The menu editor offers every setting in `config_menu.json`: background mode and
  scrolling, circles, waves, both gradients, the overlay, the letterbox, the clip
  disc, button colours and the music loop point. It previously offered two of
  them. Colours are picked from a swatch, with an alpha slider where the setting
  takes one.
- The studio editor offers its two settings, the built in lighting and the music
  loop point. It previously offered neither.
- Menu and session music is saved as OGG rather than WAV, which was turning a few
  minutes of music into a file of well over a hundred megabytes. This applies
  however the music arrives: through the slot that names it, dropped onto the
  pack, or in a folder added whole.

### Packs

- A clip with both a `.txt` and an `.ini` beside it is no longer listed twice, or
  exported twice.
- Retiming a clip replaces its audio rather than leaving a second file beside it.
  A clip with two audio files could be played twice by the game.
- A clip that already has more than one audio file is reported, with the names of
  the files.
- Recording over a slot's sound replaces it, as the prompt says it will. It was
  being saved alongside as a second file, with the old one left in the pack.
- Replacing a slot's sound clears out what was there even when the new one is a
  different format, so a slot never holds two files.
- Recording a take no longer fades in at the start.
- The cardboard cutout only stands in for packs that are a person on screen. A
  menu or studio pack with no picture shows its own symbol instead.
- An interrupted conversion no longer leaves a part finished file in a pack
  folder.

### Around the app

- Messages no longer block anything. They sit in the corner as before, but take
  no clicks at all, so the buttons under them stay usable, and they fade almost
  out of sight when the pointer reaches them.
- Rescan reloads the pack being edited, rather than only the library behind the
  editor.

### Help

- A What's New tab lists what changed in each version, with the installed one
  marked. Clicking the version in the corner of the window opens it.
- Help opens at Getting Started whatever tab was last read, and its tabs sit on
  one row rather than wrapping.
- The editor help matches the editor again. It describes the backing track lane's
  Listening to switch, trimming, undo and redo, and what happens while a job is
  running.
- The keyboard list in the editor names the buttons that pan the timeline.

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
