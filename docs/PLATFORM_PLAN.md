# Pack sharing — how it works

This describes what is built, not what was once planned. An earlier version of
this file described a different design and was left behind by the code; a design
document that disagrees with the software is worse than no document, because
people believe it.

Four constraints shaped everything below:

1. **No money.** No paid database, no object storage, no egress bill.
2. **Limited time.** Moderation cannot depend on someone being available.
3. **No trust.** Strangers upload files that other people run.
4. **No liability.** Someone will eventually upload something they should not.

---

## The shape

```
  PUBLISH                                          INSTALL
  ┌────────────────┐                            ┌────────────────┐
  │ Share this pack│                            │   Mods tab     │
  └───────┬────────┘                            └───────┬────────┘
          │ shrink, zip, checksum                       │ reads
          ▼                                             ▼
  ┌────────────────────────┐                  ┌──────────────────────┐
  │ the author's own       │◄─────────────────│  index.json          │
  │ GitHub release         │   links to       │  (directory repo)    │
  └───────┬────────────────┘                  └──────────┬───────────┘
          │ opens a submission issue                     ▲
          ▼                                              │
  ┌────────────────────────┐   validates, then           │
  │ GitHub Actions         │─────────────────────────────┘
  └────────────────────────┘   updates
```

Nothing in that diagram costs anything or needs to stay running. A GitHub
repository is the database and GitHub Actions is the backend.

## Where pack files live

**On their author's own GitHub account**, as a release asset. The directory
stores only a record: id, title, author, type, tags, download address, SHA-256
and size.

Object storage was considered and rejected. Cloudflare R2 would be free at this
size with no egress charge — but the moment the files sit in your bucket you are
a host, every takedown is yours to action, and a maintainer who cannot be on call
has acquired an obligation to be. Storage was never the expensive part.

## Identity

Two rules, and the second is the one that matters.

**Sign in with GitHub**, via the device flow — the only OAuth flow suitable for a
desktop app, because it uses no client secret. There is nothing in the shipped
binary to extract. The token is stored by the OS keychain, and if the OS cannot
encrypt it, it is not stored at all.

**A pack's author must match the account hosting it.** A record claiming to be by
`jojozagjos` must download from `github.com/jojozagjos/...`, and only that person
can put a file there. This holds even if a token leaks, even for a record
submitted by hand, and even if sign-in is bypassed entirely — it is checked
against something GitHub already enforces rather than something this code has to
be trusted to have done.

Sign-in makes publishing easy. That rule makes impersonation hard.

## Where a pack may be hosted

Only somewhere that returns the file to a program with no browser and no
session: **GitHub, GitLab, Codeberg releases, or Dropbox.**

Google Drive, MEGA, MediaFire and itch.io all answer with a page rather than the
file, so a download from them cannot work. They are refused at submission with an
explanation rather than accepted and left to fail at install.

## Getting in

The app opens an **issue** containing the record. An Action validates it with the
same `directory.js` the app uses, and opens a pull request.

An issue rather than a pull request directly, because the app would otherwise
have to fork the directory, keep the fork in step and branch inside it — three
things to go wrong before anyone has read the submission.

**A first pack is always read by a person.** After an author has one merged,
later submissions are listed automatically. The rule is one human look per
publisher, not per pack: reviewing every update sounds safer but makes the
maintainer the bottleneck, and a queue nobody can get to is how a directory dies.
`/hide` and `/ban` make a wrong call cheap to undo.

## Reviewing

The **Admin tab** appears only for an account GitHub says can write to the
directory repository. Hiding it is a courtesy, not a defence: revealing it
achieves nothing, because approving and rejecting are GitHub API calls made with
that person's own token and GitHub refuses them for anybody else.

Reviewing downloads the pack into a **temporary sandbox** — never the game folder
— and plays the video, plays each clip, shows the pictures and the captions and
the file list. Approving merges; refusing closes the issue with a reason, which
is required rather than optional.

Every check that guards installing runs here too. A pack being judged is the
least trusted file the app ever opens, not the most.

## Moderation

Comment commands on any issue, acted on only for a repository collaborator:

| Command | Effect |
| --- | --- |
| `/hide <pack-id>` | Stop listing it; the record is kept |
| `/restore <pack-id>` | List it again |
| `/ban <handle>` | Refuse anything further, and hide what they have |
| `/unban <handle>` | Reverse it |
| `/trust <handle>` | Their submissions list without review |
| `/untrust <handle>` | Back to being reviewed |

Everything is reversible on purpose. The cost of a wrong call should be one more
comment.

## Dead links remove themselves

A daily job asks whether every listed pack still downloads. Three answers are
possible and only one of them counts:

| Answer | Counts against the pack |
| --- | --- |
| It is there | no — clears the strikes |
| 404 / 410 / 401 / 403 | **yes** |
| Timeout, 429, 5xx | **never** |

Three confirmed failures on three separate days and the pack is unlisted. If the
link comes back it relists itself with nobody involved. After 90 unbroken days
the record is archived.

That last row is the point: a rate limit or a bad night must never be able to
take somebody's work off the directory.

## Shrinking

Packing a pack re-encodes it, measured across a real 18-pack library:

| | Before | After |
| --- | --- | --- |
| Library | 664 MB | **374 MB** |
| Average pack | 37 MB | 21 MB |

Only video above 3 Mbps is re-encoded. Below that a re-encode makes the file
*bigger* — one 1512 kbps video came back 44% larger — so the rule is to compress
the wasteful ones and leave the rest alone. WAV becomes Vorbis, which is the
cheapest win on the list.

It never touches the author's own copy, and a result larger than its source is
discarded.

## What is not built

- **Reports.** There is no report button in the app yet. The moderation queue
  reads issues labelled `report`, so the plumbing is there and the button is not.
- **A publishers list.** `publishers.json`, generated from the index after each
  merge, would answer "who has published what". Nothing generates it yet.
- **Download counts.** The record carries the field; nothing counts.

## The weakest part, named plainly

**The directory is only as good as other people's hosting.** Authors delete
releases and make repositories private. §"Dead links" is what stops that rotting
the directory quietly, and it is why that job matters more than it looks.

The fallback, if it ever becomes intolerable, is hosting pack files as release
assets on the platform's own repository. That costs nothing in money and gives up
the legal distance above, so it is a deliberate later decision rather than a
drift.
