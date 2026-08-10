# Changelog

## 1.1.0

Sharing packs, and working with a pack that has been recorded several times over.

### Sharing a pack

- Any pack can be packaged into a single zip from Content, ready to send to
  anyone. The zip carries its own description inside it, so it is one file rather
  than two and needs nothing filled in before it can be handed over.
- Packing shrinks the pack on the way, usually to about half the size. Video
  above 3 Mbps is re-encoded to 720p and lossless audio becomes Vorbis; anything
  already efficient is left alone, since re-encoding it would make it larger.
  The pack in the game folder is never touched.
- A pack can be published to a shared directory instead, which uploads it to the
  author's own GitHub account and offers it for listing. Signing in is asked for
  once and only when publishing.
- Publishing a pack that is already listed offers to update it instead. The
  listing keeps its place, its first published date and its download count, and
  the button says so rather than offering to publish something twice.
- Publishing asks how the pack should be listed: its name, one line about it, a
  longer description if there is one, tags, and whether other people may reuse
  it. Updating a listing starts from what that listing already says rather than
  from blank.
- Publishing asks whether the pack contains strong language, graphic violence,
  drug or alcohol references, or flashing images. Anything marked is shown on the
  listing, so nobody installs something they did not expect. The directory does
  not list sexual content or nudity at all, so there is nothing to mark.
- A pack that has not changed since it was last packaged is not re-encoded
  again, so packaging one a second time is instant rather than another few
  minutes.
- Packaging shows how far along it is.
- A pack cannot be published without a name or without a picture. Both are asked
  for before anything is uploaded rather than after.

### The Packs tab

- A new tab listing packs other people have shared, by kind, with a search box.
  Installing one checks it against the checksum it was published with, refuses
  anything malformed, and adds it to the library.
- Browsing and installing never ask for an account.
- Listings show the pack's own icon. The icon is checked against the checksum it
  was published with before it is shown, so a pack cannot be accepted with one
  image and quietly given another afterwards.
- A Publishers view lists everyone with packs listed, searchable by name.
  Selecting one, or selecting an author's name on any pack, opens their page:
  how many packs they have, total downloads and size, when they started, when
  they last updated something, everything of theirs, and a button to open their
  repository on GitHub.
- Selecting a listed pack opens its own page: everything the listing says, what
  it may be reused for, where it is hosted, its size, how many times it has been
  downloaded, and when it was published and last updated.
- That page can play the pack before it is installed. Every line is listed with
  what it says, alongside the pack's video and pictures, so a pack can be heard
  without putting anything into the game folder first. The download is kept, so
  installing straight afterwards does not fetch it a second time.
- A previewed pack goes through the same checks as an installed one: its
  checksum has to match the listing, and the archive has to pass every shape
  check before anything is unpacked.
- An Installed view lists every pack taken from the directory and says which of
  them the author has changed since. Updating is a button and never happens on
  its own, because a pack in the game folder may have been recorded over. The
  number of packs waiting sits on the button.
- Download counts are real. They are read from the number GitHub already keeps
  for each file and refreshed daily, rather than sitting at zero forever. An
  update does not reset a pack's total.
- A pack is only ever downloaded once. Previewing one, installing it afterwards
  and opening it again later all use the copy already on the machine, so a
  listing's count reflects people rather than button presses.
- Sharing a pack says up front that it can be published to the Packs tab once it
  is packaged. It read as making a zip and nothing else, which left the way to
  list a pack reachable only by pressing something that looked unrelated.
- A pack that uploads but cannot be listed says whether the problem is something
  in the listing details, which can be changed and published again, or a fault
  in the app, which cannot. It used to give the same wording for both.
- The sign-in code is set large enough to read off the screen and copy.
- Packs that have been taken off the list no longer appear anywhere in browsing,
  and no longer count towards a publisher's total.
- Packs are listed as soon as they pass their checks. Nobody approves uploads:
  the record has to be valid, the author has to be the account hosting the file,
  the file has to pass a malware check, and the account must not be blocked.
  Anything failing one of those is refused with the reason.
- Any listed pack, or the account behind it, can be reported from the button on
  it. Reporting asks what is wrong and needs nothing else filled in.
- A submissions list shows what happened to every pack offered to the directory,
  and why. A pack that was not listed carries the reason with it, rather than the
  explanation sitting somewhere nobody looks. Each one opens on its own, so a
  list of several stays readable.
- A submission waiting to be looked at says how long it has left before it
  closes on its own, once that is near. The list can be searched, and each entry
  opens to show what was said about it.
- Sharing a pack requires it to have an icon, and the Share button says so
  before it is pressed.
- Publishing says which repository it will create on the author's account, and
  asks, before creating anything.
- Publishing always says how it ended: listed, uploaded with nowhere to list it,
  uploaded but not offered, or not published at all with the reason.
- A pack installed from the directory keeps its author. It can still be packaged
  and passed on, but not published under a different name.

### Working on a dub

- What is set on a session is kept: which take each line uses, how loud it is,
  how far its timing was nudged, and the music and dub balance. Reopening a pack
  picks up where it was left, and closing the app no longer throws an evening of
  levelling away.
- Kept per pack and per session, because the same pack recorded twice is two
  performances. A take lifted in one is not the take in the other.
- A line whose recording has since been deleted falls back rather than pointing
  at a file that is gone.
- The take session box no longer empties when switching packs. It was being
  handed the session chosen on the pack just left, which showed as blank while a
  session was in fact loaded and playing.

### Recording sessions

- A session can be deleted, with the button beside the take session list. It
  removes that session's recordings and nothing else, leaving the pack and every
  other session untouched.
- Sessions are listed newest first and each is named by when it was recorded, so
  the one just made is the one at the top.

### The editor

- Setting a pack icon from the video, or from a file, no longer jumps back to
  the Clips list. Whichever side panel is open stays open.
- The playhead can be moved by pressing the backing track lane, and dragged
  along it to find the moment a duck starts. It draws the same playhead as the
  timeline above it and did nothing when pressed.
- The backing track's muffle removes the original voices instead of quietening
  the whole scene. Where the video's audio is properly stereo it cancels
  whatever sits dead centre, which is where dialogue is mixed, leaving the music
  around it almost untouched. Where both channels carry the same signal there is
  no centre to cancel, so it cuts the range speech occupies instead. On a real
  pack the voice now drops 18 dB further than the music, against 6 dB before.
- The character box opens as a name is typed, and the arrow keys move through
  the matches with Enter to take one.
- Each character's clips are drawn in that character's own colour, so who speaks
  when can be read off the timeline without reading any labels.
- Playing a line pauses the video first, moves the playhead to that line, and
  brings it into view. Two takes of the same line no longer play at once.
- Clicking a line's time scrolls the timeline to it instead of moving the
  playhead somewhere off screen.
- A newly added line is scrolled to, rather than left below the fold where
  nothing appeared to happen.
- Lines are ordered by name when they share a time, so a pack no longer looks
  shuffled the moment it is made. Numbers sort as numbers, so line 10 follows
  line 9 rather than line 1.
- A stray space around a character's name is ignored, instead of quietly making
  a second character with the same name.

### Content

- The content list has a search box, narrowing the packs shown as a name is
  typed.
- Opening the exports folder works from the buttons that offer it. It was being
  refused for being outside the game folder, and the refusal was not shown.

### Content

- A pack type whose packs have warnings is marked on the rail, in amber, beside
  the red used for errors. Warnings were counted and then thrown away, so a type
  containing nothing but warnings looked as clean as one containing nothing.
- The mark sits in the corner of the type's button rather than on top of its
  picture, where it obscured the thing it was pointing at.
- The buttons on a selected pack have their labels back, laid out in even
  columns rather than bunched at one end.

### Under the hood

- Updated to a current Chromium, and the window that displays packs now runs
  sandboxed. Both matter more than they used to, because the app now opens files
  that came from other people.
- The download is about 48 MB smaller. Chromium ships a translation of its own
  interface in each of 55 languages, and this app is only in English.

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
