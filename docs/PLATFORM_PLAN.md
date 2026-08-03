# Mod sharing platform — design

Nothing here is built. This is the plan to argue with first.

The whole design is shaped by four constraints, and every decision below traces
back to one of them:

1. **No money.** No paid database, no paid object storage, no paid egress.
2. **No time.** Moderation cannot depend on someone being available.
3. **No trust.** Anonymous strangers upload binaries that other people run.
4. **No liability.** Someone will upload copyrighted audio. That has to be
   survivable rather than fatal.

---

## 1. The shape that solves the money problem

The instinct is a server with a database and a storage bucket. That fails
constraint 1 immediately: storage and bandwidth for video and audio packs is the
one cost that scales with success, and it is the cost that arrives before any
revenue ever could.

**So the platform stores no pack files at all.**

A pack lives wherever its author already put it — a GitHub release, an itch.io
page, a Google Drive link. The platform stores a small record *about* the pack,
and the download button sends the user to the author's own hosting.

```
  record (a few hundred bytes)          the pack itself (hundreds of MB)
  ┌──────────────────────────┐          ┌─────────────────────────────┐
  │ id, title, author,       │  links   │  author's GitHub release,   │
  │ type, description, tags, │ ───────► │  itch.io page, or similar   │
  │ download url, checksum   │          │                             │
  └──────────────────────────┘          └─────────────────────────────┘
        hosted free                          hosted by the author
```

This is the single decision that makes the rest affordable, and it has a second
benefit that matters more than the money: **the platform never possesses the
infringing file.** See §7.

### Where the records live

A Git repository, as flat JSON files, served by GitHub Pages or similar.

- Free, for any plausible size. Ten thousand packs of ~500 bytes is 5 MB.
- Every change is a commit, so the moderation history is the Git history: who
  approved what, when, and what it looked like before.
- No database to hack, flood, or run up a bill on. There is no query interface
  to abuse because there is no query engine.
- Reverting a bad decision is `git revert`.

The app fetches a single generated index file, not individual records.

**Open question 1:** are you willing to require that authors host their own
files? It is the difference between free forever and a bill that grows with
popularity. The cost is that some authors will find it harder than a drag and
drop, and dead links become a real failure mode (§9 covers that).

---

## 2. How something gets in

Uploading is a **pull request**, but nobody should have to know that.

```
  in the app                    the bridge                    the repo
  ┌─────────────┐   fills in   ┌──────────────┐   opens a   ┌──────────┐
  │ Share this  │ ───────────► │ a web form   │ ──────────► │    PR    │
  │ pack        │              │ on the site  │             │          │
  └─────────────┘              └──────────────┘             └──────────┘
                                                                 │
                                                          you or an admin
                                                              approves
                                                                 ▼
                                                            merged, live
```

The app has a **Share this pack** button. It:

- checks the pack against the same rules the library already applies, so broken
  packs never reach the queue
- computes a checksum of the zip
- collects title, type, description, tags, and the author's own download link
- opens the web form with all of it prefilled

The form is the only thing a human sees. Behind it, a serverless function opens
the pull request using a bot account's token. **The user never has a GitHub
account, never sees Git, and never gets write access to anything.**

**Open question 2:** should submission require the app, or should the web form
stand alone? Requiring the app means every submission has passed the format
checks, which removes a whole class of broken uploads. Allowing the web alone is
friendlier to someone who found the site first.

---

## 3. Identity, without accounts

A full account system means passwords, resets, email, and breach liability.
Avoid all of it.

**Sign in with GitHub or Discord (OAuth), and nothing else.** Neither password
nor email is ever stored. The platform keeps only:

```
  handle          chosen once, immutable, 3–20 chars, [a-z0-9_-]
  provider id     the opaque id from GitHub/Discord
  joined          date
  status          active | restricted | banned
  strikes         count, with reasons
```

The **handle is permanent**, as you asked. This is the right call and worth
being explicit about why: an author's name appears on every pack they have
published and in the credit of every video made from one. If handles could
change or be reused, credit becomes unreliable and impersonation becomes easy.

Consequences to accept:

- Reserve a blocklist at creation: `admin`, `mod`, `staff`, `official`,
  `yeahmaybe`, the game's name, and homoglyph variants.
- Publish a policy that a handle can be *retired* (freed from display, never
  reissued) but not transferred.

**Open question 3:** GitHub only, Discord only, or both? Discord matches the
community; GitHub matches the hosting model and filters out drive-by accounts.
Both means two integrations to maintain.

---

## 4. Stopping a flood

There is no database to flood, but the review queue can be. Layered, cheapest
first:

| Layer | Effect |
| --- | --- |
| OAuth required | No anonymous submissions at all. |
| Account age gate | The provider account must be older than ~30 days. |
| Rate limit | 3 submissions per account per day; 10 per week. |
| Duplicate checksum | A zip already submitted is rejected before review. |
| Duplicate link | The same download URL cannot be claimed twice. |
| Similarity check | Title and description compared against existing entries. |
| Auto-close on edit | A PR whose files were touched by hand is closed unread. |

That last one matters: the bot writes the record, so **any PR modified by a
human is by definition tampered with** and can be closed without a person
reading it. This removes the main attack of "submit something that looks fine
and edit it after approval".

**Open question 4:** what should happen to a submission from a brand new account
— rejected outright, or held in a slower queue? Rejecting is simpler; holding is
kinder to someone who genuinely just arrived.

---

## 5. Stopping the dangerous parts

A pack is data, not code — but the app has to treat it as hostile input anyway.

- **Nothing executable, ever.** The allowed extensions are exactly what the game
  reads: `.ogv .wav .mp3 .ogg .png .jpg .glb .gltf .ini .cfg .json .txt`.
  Anything else fails validation, on both the submitting and installing side.
- **Zip-slip.** A zip entry named `../../Windows/System32/...` must be refused.
  Every path is resolved and checked to be inside the destination before a
  single byte is written. This is the single most important check in the whole
  design, because it is the one that can damage a machine.
- **Zip bombs.** Cap the entry count, the uncompressed total, and the
  compression ratio. Refuse before extracting, not during.
- **Checksum.** The record carries the zip's SHA-256. The app verifies it after
  download and refuses on mismatch. This is what makes third-party hosting safe:
  the author cannot swap the file for something else after approval without the
  checksum failing.
- **Install into a staging folder**, validate, then move into the game folder.
  A pack never lands half-written where the game will read it.
- **Never trust the record's display text.** Titles and descriptions are
  attacker-controlled and must be escaped wherever they are drawn.

**Open question 5:** should the app refuse a checksum mismatch outright, or warn
and let the user proceed? Refusing is safer and I would default to it; the cost
is that an author who re-uploads a fixed file breaks their own link until the
record is updated.

---

## 6. Moderation that survives you being busy

The core problem: you cannot be the bottleneck, and you also cannot let
everything through unreviewed.

### Roles

| Role | Can |
| --- | --- |
| **Owner** (you) | Everything. Appoint and remove admins. Cannot be removed. |
| **Admin** | Approve, reject, take down, resolve reports, strike and ban. |
| **Reviewer** | Approve and reject submissions. Cannot ban or take down. |
| **Author** | Submit, edit their own records, withdraw their own packs. |

Roles live in a file in the repo, so granting and revoking is a commit — which
means it is auditable and revertible, and there is no permissions database.

**Reviewer exists deliberately**: it lets you hand out the tedious work without
handing out the power to hurt anyone. Promote to admin only when trusted.

### The queue

Every submission is a PR with a checklist. Automated checks run first, so a
human only ever sees submissions that already passed:

```
  ✓ schema valid          ✓ download link reachable
  ✓ extensions allowed    ✓ checksum recorded
  ✓ no path traversal     ✓ size within limits
  ✓ account in good standing
  — needs a human: is this what it says it is?
```

The human question is short on purpose. Everything mechanical is already done.

### If nobody is available

Two options, and I would like your call:

- **Closed by default.** Nothing is public until approved. Safe, but a queue with
  nobody watching means the platform looks dead.
- **Open with a delay.** Submissions from accounts in good standing go live after
  N days if nobody has objected, and are removed instantly on the first report.

**Open question 6:** which? The second keeps the platform alive when you are
busy, at the cost of a window where something bad is visible. It can be limited
to authors who already have an approved pack, which makes the first one always
reviewed and later ones faster.

---

## 7. Reporting, takedowns, and the law

Someone will upload copyrighted audio. Plan for it as routine.

### Reporting

A **Report** button on every pack, in the app and on the site. Reasons:

- Copyright — I own this and did not upload it
- Stolen — someone else made this pack
- Broken or malicious
- Sexual content involving minors *(see below)*
- Other

A report creates a ticket. Two reports on one pack, or any report in the
copyright or CSAM categories, hides the pack immediately pending review. Hiding
is cheap and reversible; leaving it up is neither.

**CSAM is not a moderation category.** It is a legal reporting obligation. If
one arrives, the correct action is to preserve the record, report to NCMEC (US)
or the IWF (UK), and not to "handle it internally". Write that into the policy
before launch, not after.

### Why hosting elsewhere protects you

Because the platform stores only a link, a copyright complaint is mostly about
*delisting*, not deletion — you remove the record; the file was never yours. That
is a materially better position than hosting the file.

You still need:

- **A takedown route.** A published contact address that a rights holder can use.
- **A counter-notice route.** The accused author can dispute it.
- **A repeat infringer policy.** Required to keep safe harbour in the US
  (DMCA §512) — you must terminate accounts that repeatedly infringe. Three
  upheld copyright strikes → permanent upload ban is a defensible line.
- **Records.** Keep what was taken down, when, and why.

**This is the part I would not launch without.** Everything else can be added
later; the legal posture has to exist on day one.

**Open question 7:** are you in the US or the UK? DMCA safe harbour and the UK's
equivalent differ in the details, and the policy text should match one of them
rather than being vaguely international.

### Licensing

Every pack must declare a licence at submission, from a fixed list, plus a
required tick: *"I made this, or I have the right to share it."*

The bigger question is the source material. Packs are built from clips of other
people's videos — that is what the game is for. The honest position is that this
is the author's responsibility and the platform is a link directory, and the
policy should say so plainly rather than pretending the question does not exist.

---

## 8. What the app shows

- **Browse** by type, with search and tags.
- **Sort** by newest, most downloaded, recently updated.
- **A pack page**: description, author handle, licence, size, download count,
  when it was published and last updated, and a report button.
- **Install**, which downloads, verifies the checksum, validates, and installs
  into the right folder. The app already does the last two parts.
- **Installed and update-available markers**, using the checksum the app already
  keeps.

### Download counts, without a database

Counting requires a write on every download, which is the one thing a static
host cannot do. Options:

- A serverless counter with a free tier, writing to a lightweight key-value
  store. Simplest, small ongoing dependency.
- The link points at a redirect endpoint that counts and forwards.
- Rely on GitHub's own release download counts where the pack is hosted there,
  and show nothing where it is not.

**Open question 8:** is an approximate count acceptable? Exact counting invites
inflation and needs abuse handling of its own; "1.2k" that is roughly right is
usually as useful and much cheaper.

---

## 9. Things you did not ask about, that will bite

These are the ones I would want decided before any code:

- **Dead links.** Authors delete their hosting. A weekly automated check that
  marks records unreachable, and hides them after a grace period, is essential —
  otherwise the library slowly fills with things that cannot be installed.
- **Updates.** A new version of a pack: a new record, or a version list on the
  existing one? A version list is better for users and means the download count
  survives, but it complicates the record.
- **The game changing.** If the game changes its pack format, existing records
  may describe packs that no longer load. Record which game version a pack was
  made for.
- **Author disappears, pack is loved.** Allow a pack to be marked abandoned and
  adopted, with the original credit preserved.
- **Someone reports their own pack to hide a rival's.** Report abuse needs its
  own strike counter.
- **Bulk deletion by a compromised account.** Withdrawals should be soft and
  reversible for a period, not immediate and permanent.
- **You get bored.** The whole thing is a Git repo. Publish that fact so the
  community can fork and continue it if you stop. This costs nothing and is the
  difference between a dead platform and a transferred one.
- **Privacy notice.** Even storing only a handle and a provider id, you are
  processing personal data and need a short, honest privacy page.
- **Age.** If under-18s can submit, that carries obligations. Consider requiring
  13+ or 16+ in the terms and doing nothing more elaborate than asking.

---

## 10. What I would build, in order

1. The record format and the validator. Everything depends on the shape.
2. The install path in the app, with checksum and safe extraction. Useful even
   with records added by hand.
3. Browse and install in the app, reading a static index.
4. The submission form and the PR bot.
5. Reports and the ticket queue.
6. Roles, strikes, bans.
7. Download counts.

Stages 1–3 are useful on their own: you could seed twenty packs by hand and have
a working directory before any submission machinery exists.

---

## Questions, gathered

1. Are authors hosting their own files acceptable? (§1 — the decision everything
   else rests on.)
2. Submission through the app only, or the web too? (§2)
3. GitHub, Discord, or both for sign-in? (§3)
4. Brand new accounts: rejected, or slow queue? (§4)
5. Checksum mismatch: refuse, or warn? (§5)
6. Closed by default, or open-with-delay for trusted authors? (§6)
7. Which country's law is this operating under? (§7)
8. Are approximate download counts acceptable? (§8)

And three I would add:

9. Is the platform's name and branding separate from the game's? It should be,
   for the same reason the app is labelled unofficial.
10. Do you want a way to feature or curate packs, or is that a moderation burden
    you would rather not have?
11. Should the app work fully offline if the platform is down? (It should — the
    directory must never become a dependency of the editor.)
