<div align="center">

<img src="assets/app/icon.png" width="128" alt="" />

# Choicer Voicer Content Manager

[![Download](https://img.shields.io/badge/Download-latest%20release-5ecdf5?style=for-the-badge)](https://github.com/jojozagjos/Choicer-Voicer-Content-Manager/releases/latest)

An unofficial fan tool for [The Choicer Voicer](https://yeahmaybe.itch.io/the-choicer-voicer).

</div>

---

The game records your dub takes and then leaves them sitting there as loose `.wav` files, with no
way to get them out. This finds them, lays each one back over the pack's video and backing track
exactly where it belongs, and renders the result as a video you can actually post.

It also builds packs. All seven kinds the game reads, with a proper timeline editor for dub packs,
and it checks every pack against what the game will really load so you find out before the game
quietly ignores it.

## Screenshots

|  |  |
| --- | --- |
| ![The dub timeline editor](docs/images/editor.png) | ![Exporting a finished dub](docs/images/export.png) |
| **The dub editor.** Mark a range on the video and the clip and its timestamp come out together. | **Exporting.** Every line keeps its own take, volume and timing. |
| ![The content library](docs/images/library.png) | ![The help screen](docs/images/help.png) |
| **Your library.** Everything installed, of every type, with whatever needs fixing. | **Built-in help.** How everything works, without leaving the app. |
| ![Packs other people have shared](docs/images/mods.png) | ![One pack's page, before installing it](docs/images/mods-pack.png) |
| **Packs.** What other people have shared, by kind, sorted however you like. | **Before you install.** Everything the listing says, and a button that plays the pack so you can hear it first. |

## Getting it

1. **[Download the latest release](https://github.com/jojozagjos/Choicer-Voicer-Content-Manager/releases/latest)**
   and unzip it. Unzip the *whole folder*, because running the `.exe` from inside the zip
   will fail: the app needs the files sitting next to it.
2. Run **Choicer Voicer Content Manager.exe**.
3. Point it at your game folder when it asks.

Nothing else to install. ffmpeg comes with it.

> **Windows will show a blue "Windows protected your PC" box.** Click **More info**, then
> **Run anyway**. This happens because the app is not signed with a paid certificate, and because
> it reads and writes files it was not explicitly handed, which is the entire job: the packs and
> recordings belong to the game. Nothing leaves your computer. The source is right here if you
> would rather read it first.

**You need the game**, or at least a copy of its `game` folder, since everything here works on the
files the game wrote.

## Turning a dub into a video

Open **Export**, pick a pack, and choose which recording session to use if you dubbed it more than
once. Press play to hear your takes over the original video, fix anything that sounds off, then
export.

Per line you can:

- swap between **your take** and the **original audio**, or silence it
- change its **volume**
- **nudge its timing** in 50 ms steps, if a take lands slightly early or late

Each **character** also has their own volume, in **Settings** beside their colour. It applies to
every line that character speaks, on top of whatever each line is set to, so one quiet performer
can be lifted without disturbing the balance between their own lines.

| Export option | What it is for |
| --- | --- |
| **MP4 / MKV / MOV / WebM** | MP4 works everywhere. The rest are there if you need them. |
| **Vertical 9:16 or square 1:1** | Shorts, TikTok and Reels. Fills the sides with a blurred copy of the video rather than black bars. |
| **Burn captions in** | Draws the script onto the picture, speaker name included. |
| **`.srt` alongside** | Subtitles as a separate file, to style in your own editor. |
| **Even out the volume** | Levels each take, so one recorded far quieter than the rest is brought into line. |
| **Use character volumes** | Applies the per-character volumes above, and lists what they are set to. |
| **Selected line only** | Exports one line as its own short clip. |

Exports queue up and run one at a time, so you can set several going.

## Building packs

**Content → Create new**, pick a type, name it. Then open it and fill it in.

### Dub packs get a timeline editor

The official route is to cut audio in a separate program, name each export with its timestamp by
hand, then type those timestamps back into the game. Here you scrub the video, mark a range, and
the clip and its timestamp come out together.

- **Cut clips from the video.** Hold still, then drag across empty timeline.
- **Move and retime** by dragging a clip's grip or its edges. The audio is recut to match.
- **Captions over the video** as it plays, so you can check wording and timing without leaving.
- **Pictures** from the frame showing right now, from a file, or reused from elsewhere in the pack.
- **Trim the video** in time, with every clip shifted to stay in sync.
- **Undo everything**, including deletions. Deleted clips are moved aside, not destroyed.

### Backing tracks, built from the video

A dub pack wants the scene's music and atmosphere without the original voices. The pack already
knows exactly when every line speaks, so the video's own audio is taken and quietened across those
ranges.

**Muffle** removes the original voices and leaves the music. Dialogue is mixed dead centre in
almost everything, so where the audio is properly stereo it subtracts one channel from the other,
which cancels whatever is centred and leaves the music spread around it. Where both channels carry
the same signal there is no centre to cancel, so it falls back to cutting the range speech occupies
and those packs sound duller underneath a line. This is usually the better option.

**Silence** removes it completely, which is cleaner but can sound like the audio dropped out.

How well any of this works depends on how the scene was mixed, so building a backing track asks
how hard to press and plays a few seconds of the real result before committing to it. A sample
takes a second or two; the whole track takes minutes.

*Muffle cannot tell a singer from a speaker, so a song with vocals loses those along with the
dialogue. Separating them properly needs a trained model far too large to ship in an app like this.*

### Every other pack type

Players, hosts, judges, studios, menus and chatter each get an editor built from the files that
type actually uses, so you are never guessing at a filename. Host dialogue and chatter keywords are
edited in the app rather than in a text file, and every setting a pack's config file holds has a
control: menu backgrounds, gradients, the letterbox, button colours, studio lighting and the rest.
Colours get a swatch, with an alpha slider where the setting takes one.

### It fixes your files for you

Drop in an `.mp4` where the game wants `.ogv`, or an `.m4a` where it wants `.wav`, and it converts
and renames it. That mismatch is the single most common reason a pack silently does nothing.

Pictures of a character are brought down to the size the game draws one at, so a render straight
out of an art program does not turn up several times too big. Backgrounds and overlays are left at
whatever size they were.

Got a pack someone sent you? Unzip it and drag the folder onto the library. It works out what kind
it is and installs it.

Changes made outside the app show up on their own, so a pack unzipped into the folder or a
recording made in the game appears without asking for it. **Rescan** is still in the top bar for
anything a watch cannot see.

## Sharing packs

**Packs** lists what other people have made. Pick one and press **Install**; it
downloads, checks it against the checksum it was published with, refuses
anything malformed, and adds it to your library. Browsing and installing never
ask you to sign in.

Sort by most downloaded, newest, recently updated, name or size. **Publishers**
lists everyone with packs listed, and each of them has a page showing what they
have made and how it has been received.

Selecting a pack opens its own page, with everything the listing says: what it
may be reused for, where it is hosted, its size, and when it was published and
last updated. **Preview pack** on that page plays it before you install it,
every line with what it says, so you can hear whether it is what you want
without putting anything into your game folder.

A pack is only ever downloaded once. Previewing one, installing it afterwards
and opening it again next week all use the copy already on your machine.

**Installed** lists everything you have taken from the directory and tells you
which of them the author has changed since, with the count on the button. Packs
are never replaced without being asked, because yours may have been recorded
over; updating is a button you press when you want it.

### Sharing one of yours

Open a pack in **Content** and press **Share this pack**. That alone gives you a
single zip in your exports folder, shrunk on the way, ready to send to anyone.
They drop it on their own library and it installs.

**Publish it** goes further and puts it on the list everyone sees. It needs a
GitHub account, which you sign into once with a short code. Then:

- the pack is uploaded to **your own GitHub account**, not somebody else's
- you are asked how it should be listed: name, one line about it, tags, and
  whether other people may reuse it
- it appears in Packs once its checks pass, which takes a minute or two

Your pack stays yours. It lives on your account, you can take it down whenever
you like, and **Your submissions** shows everything you have published along
with the files it left behind, so you can clear out anything you have abandoned.

A pack needs a name and an icon before it can be shared, because a listing
without either is a blank square nobody installs.

### What is and is not allowed

Nobody approves uploads. A pack that passes its checks is listed straight away,
and the checks are rules rather than opinions: the record has to be valid, you
have to be the account hosting the file, the file has to pass a malware check,
and your account must not be blocked.

If something should not be listed, report it. Every pack has a report button,
and so does every publisher. Reports are not anonymous: they are opened under
your GitHub account, because asking for somebody's work to be taken down is
something they should be able to see the source of.

Packs can be marked as containing strong language, graphic violence, drug or
alcohol references, or flashing images, and that shows on the listing. Sexual
content and nudity are not listed at all.

## Where your files live

Will be adding Linux support eventally.

| OS | Path |
| --- | --- |
| Windows | `%APPDATA%\YeahMaybe\ChoicerVoicer\game` |
| Linux | `~/.local/share/YeahMaybe/ChoicerVoicer/game` |

If yours is somewhere else, a portable install or a copied save folder, set it in **Settings**.
Any folder containing `packs_voice` works.

Your settings, preview cache and undo bin live in your own user profile, not in the app folder, so
replacing the app with a newer version keeps them. On Windows that is
`%APPDATA%\Choicer Voicer Content Manager`. Both the preview cache and the undo bin are kept to a
size limit on their own; deleting either only costs the time to rebuild a preview.

## If something goes wrong

| | |
| --- | --- |
| **No packs listed** | The game folder is wrong, or you have not recorded a dub yet. Check **Settings**. |
| **A pack says "no dubs yet"** | It is installed, but you have not recorded for it. Do that in the game first. |
| **A pack will not open** | It is still converting. Its panel says so and shows how far along it is. |
| **The preview is black** | Switch packs and back to rebuild it. If it keeps happening, say so on Discord. |
| **Export failed** | Usually a full disk or a folder you cannot write to. Try your Videos folder. |

There is a **Help** button in the app covering all of this in more detail, including what every
file in every pack type is for.

## Credits

Made by **[@jojozagjos](https://discord.com/users/jojozagjos)**.

**This is an unofficial fan tool.** It is not made by, affiliated with, endorsed by or supported by
**Yeah Maybe**, who made *The Choicer Voicer*. Please report problems here rather than to them.

*The Choicer Voicer*, its name and its artwork belong to Yeah Maybe. No part of the game is
included in or redistributed by this repository or its releases.

Content packs, and the audio, art and captions inside them, belong to whoever made them. Check with
a pack's author before publishing anything built from their work, and credit them when you do.
Whatever you record is yours.
