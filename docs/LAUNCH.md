# Launch plan

Written for: **free release with optional donations**, author based in the **USA**.

Not legal advice. Where something needs a lawyer or an official source, it says so.

---

## Executive summary

Releasing free with donations is the right call, and it removes most of the risk that would
have come with selling.

| Question | Answer | Confidence |
| --- | --- | --- |
| What kind of software is this? | Companion utility | High |
| Does it modify the game? | No | High, verified in code |
| Does it need the developer's permission? | Almost certainly not | Medium |
| Does bundling ffmpeg cause a problem? | No, now that it is free | High |
| Does a donation model create tax duties? | Yes, but small ones | Medium |
| Biggest real risk | Support load and reputation, not law | High |

The short version: this app reads files the game already wrote to the user's own computer, and
writes new video files. It does not change the game, does not include any of the game's content,
and does not need anything from Yeah Maybe to function.

---

## 1. What kind of product this is

**Companion software.** It sits beside the game and reads its output.

| Category | Does it fit? | Why |
| --- | --- | --- |
| Companion / utility software | **Yes** | Reads the game's saved files, produces new files |
| Standalone utility | Partly | Useless without the game, but runs independently |
| Mod | No | Nothing about the game changes. No files patched, replaced or added |
| Add-on | No | The game cannot see it and does not load it |
| Reverse-engineered software | No | See below |
| Derivative work | No | No game code or assets are copied |

**On reverse engineering.** The app reads the game's `.ini`, `.wav`, `.mp3` and `.ogv` files
and works out what they mean. That is *file format inspection*, not reverse engineering in the
sense that gets people in trouble. It never decompiles the game, never touches its executable,
and never defeats any protection. The formats are plain text and standard media, and the game's
own content guide documents the folder layout publicly.

**Why this matters:** the safest category is the one you are already in. Do not accidentally
leave it by adding features that write into the game's folders.

---

## 2. Legal considerations

### 2.1 The game's copyright and terms

The in-game notice reads *The Choicer Voicer, Yeah Maybe © 2024–2025, made with Godot 4.4.1*.
That is a **copyright notice and engine credit, not a licence agreement**. It grants nothing and
restricts nothing beyond default copyright.

| | |
| --- | --- |
| **Why it matters** | If a EULA banned third-party tools, everything below changes |
| **Risk level** | Low |
| **What to verify** | Whether an EULA/ToS exists anywhere: the itch.io page, a text file in the game folder, an in-game menu, or the game's Discord rules |
| **How to reduce risk** | Keep not modifying the game. Say plainly that you are unaffiliated |

Default copyright stops you copying their work. It does not stop you writing a program that
reads files on your own computer.

### 2.2 Copyright in the packs

You are right that the packs are user-made mods, not base game content. The app never copies,
bundles or redistributes any of it. Users point it at files they already have.

The only place this touches you is **your own marketing**. A screenshot or demo video showing
someone else's pack puts their audio and art on your storefront.

| | |
| --- | --- |
| **Risk level** | Very low for the product, low for promotion |
| **How to reduce risk** | Record demos using a pack you made yourself, or one whose author gave you the OK |

### 2.3 ffmpeg and the GPL

ffmpeg-static ships **GPL-3.0** binaries, which the app runs as a separate program.

Free distribution is exactly what the GPL is for. Your obligations:

- Include ffmpeg's licence text in the download (**already done** — it ships inside the build)
- Point at where the ffmpeg source can be obtained (**already done** in `LICENSE`)
- Do not add terms that restrict what people can do with the ffmpeg part

| | |
| --- | --- |
| **Risk level** | Low, and lower still because it is free |
| **What to verify** | Nothing, unless you later charge money. If you ever sell it, get advice or switch to an LGPL ffmpeg build |

Your own code stays MIT. That is fine: MIT and GPL coexist here because ffmpeg is invoked as a
separate process rather than compiled in.

### 2.4 Trademark and naming

"The Choicer Voicer" is Yeah Maybe's name for their game. You are using it in your app's title.

Two different uses:

- **Nominative use** — naming a product to say what yours works with. Generally allowed. "A
  companion tool for The Choicer Voicer" is this.
- **Implying endorsement** — a name or logo that makes people think the developer made or backs
  it. This is the one to avoid.

| | |
| --- | --- |
| **Risk level** | Low to medium. Medium because your app's *name starts with theirs* |
| **What to verify** | Whether "The Choicer Voicer" is a registered trademark ([USPTO TESS](https://tmsearch.uspto.gov) is free) |
| **How to reduce risk** | Put "not affiliated with or endorsed by Yeah Maybe" on the download page and in the app (**already in the Credits tab**). Do not use their logo or art. Do not use their colours in a way that mimics their branding |

The strongest single risk reducer is the next section: just ask them.

### 2.5 Distribution and DMCA

Hosting on GitHub Releases means GitHub's terms apply and a takedown would go through them.
Since you are distributing only your own code plus unmodified GPL binaries, there is very
little to take down.

| | |
| --- | --- |
| **Risk level** | Very low |
| **How to reduce risk** | Keep the repo public and the history clean. Never commit game files, pack audio, or recordings, even for testing |

### 2.6 Free versus paid, in plain terms

| | Free + donations | Paid |
| --- | --- | --- |
| ffmpeg GPL obligations | Light | Heavier, and needs care |
| Trademark scrutiny | Lower | Higher, commercial use invites more attention |
| Consumer law (refunds, warranties) | Barely applies | Applies |
| Tax | Report income, that is mostly it | Sales tax, possibly VAT, merchant of record |
| Relationship with the developer | Reads as a gift to the community | Reads as profiting from their game |
| Expectation of support | "It's free" | "I paid for this" |

Free is materially less risk for a first release. You can always add a paid tier later once
you know people want it.

---

## 3. Should you contact the developer?

**Yes.** You already thought of this, and it is the single highest-value thing you can do.

### What you gain

- Goodwill, and a much lower chance of ever getting a complaint
- Possible signal boost. The game's own page says it "requires getting content from elsewhere",
  so a tool that helps people share what they make is genuinely useful to them
- A clear answer on trademark and naming, in writing
- Early warning if a future update changes the file formats and breaks your app

### What you risk

- They say no. Unlikely for a free, non-modifying companion tool, but possible
- They ignore you. Most likely outcome, and harmless
- You put yourself on their radar. Only a downside if you planned something they would dislike,
  which you did not

### The asymmetry

Asking while it is **free** is the best possible time. You are not asking for a licence or a
revenue split, you are telling them about something helpful you made for their players. If you
were selling it, the same message becomes a negotiation.

### A message you could send

> Hi! I've been playing The Choicer Voicer and made a free companion app that lets people export
> the dubs they record as video files, so they can share them on YouTube and TikTok.
>
> It doesn't modify the game at all. It just reads the recordings the game already saves and
> renders them over the pack's video with ffmpeg. Free, no ads, source is on GitHub.
>
> Two things:
>
> 1. Are you okay with it existing, and with the name "Choicer Voicer Content Manager"? Happy to
>    rename if you'd prefer something that doesn't lead with your game's title.
> 2. If you think your players would find it useful, feel free to link it anywhere. No obligation.
>
> Either way, thanks for making the game. Happy to take it down or change anything you're not
> comfortable with.
>
> [link]

**Why this wording:** it leads with what it is, states plainly that the game is untouched, offers
to rename before they have to ask, and gives them an easy exit. Offering to take it down costs
you nothing and removes almost all reason for them to react badly.

### Licensing or revenue sharing?

Not worth pursuing right now. A licence agreement is paperwork neither of you needs for a free
tool, and revenue sharing is meaningless when there is no revenue. If donations ever become
significant, or the developer wants to bundle it, revisit then.

---

## 4. Market

**Realistically small, and that is fine.** The game is a niche indie title on itch.io that
depends on community-made content. The people who install custom packs and record dubs are
exactly the people who want to post the results.

| | |
| --- | --- |
| Who buys/uses it | People who dub with friends and want to post clips; content creators; pack authors showing off their packs |
| Realistic audience | Low hundreds initially. **Uncertain** — itch.io does not publish sales figures |
| Competing products | None found. **Verify** by searching the game's Discord and itch community |
| Substitutes | OBS or a screen recorder. Free, already installed, but no per-line control, no clean audio, and quality loss |

**What makes yours stand out:** it rebuilds the dub from the original files rather than
re-recording the screen, so the video is clean. Per-line fixes without re-dubbing, and vertical
export for Shorts, are things a screen recorder cannot do.

**Weaknesses:** unsigned app triggers SmartScreen; a 155 MB download for a simple job; Windows
only in practice; and it breaks if the game changes its file formats.

---

## 5. Donations: platform choice

| Platform | Fee | Setup | Payout | Best for |
| --- | --- | --- | --- | --- |
| **Ko-fi** | 0% on one-off donations (Stripe/PayPal fees apply) | Very easy | Direct to your account | **Recommended** |
| GitHub Sponsors | 0%, GitHub covers fees | Medium, needs identity + bank verification | Monthly | Good second link |
| itch.io | ~10% if you also list the app there | Easy | Via PayPal | Only if listing on itch |
| Patreon | 8–12% | Medium | Monthly | Recurring, needs ongoing output |
| PayPal.me | PayPal fees | Easiest | Instant | Fallback, looks least professional |

**Recommendation: Ko-fi as the primary, GitHub Sponsors as a second link in the README.** Ko-fi
takes nothing from one-off tips, is instantly recognisable to this audience, and needs no
approval process. Patreon is the wrong shape: it implies a subscription and a content schedule.

**On listing on itch.io:** worth doing purely for discovery, since that is where the game lives
and where its players already are. Set it to free with an optional donation.

---

## 6. US tax, briefly

**Not tax advice. Confirm with a CPA or the IRS if amounts get meaningful.**

- Donations to an individual for software are generally **taxable income**, not tax-free gifts,
  because people are giving in response to something you provided
- If it is casual, it is likely hobby income; if it is regular and you intend to profit, it is
  self-employment income, potentially with self-employment tax
- Ko-fi and GitHub Sponsors may issue a **1099-K** once thresholds are met. Thresholds have
  changed repeatedly, so **verify the current year's rule at irs.gov**
- **No sales tax to worry about.** Donations are not sales of goods, and you are not selling a
  product
- Keep a simple record of what comes in and any expenses, from day one

**Why this matters:** the admin is genuinely small at donation scale, but "I didn't know" is not
a defence. A spreadsheet is enough to start.

---

## 7. Marketing

### Where your people actually are

| Channel | Approach | Priority |
| --- | --- | --- |
| The game's Discord | Post once in the right channel. Ask a mod first | **Highest** |
| itch.io page comments | A short, friendly comment on the game's page | High |
| itch.io listing | List the tool itself, free | High |
| r/IndieGaming, r/SideProject | One post each, honest framing | Medium |
| YouTube/TikTok creators | Reach out to people already posting Choicer Voicer clips | Medium |
| Twitter/X | Short demo clip, tag the game | Low |

### Doing it without being a nuisance

- **Ask a moderator before posting in someone else's Discord.** This alone avoids most bad
  outcomes
- Post **once** per community. No reposting, no DMing members
- Lead with a 20-second clip showing a dub exported to video. Show, do not describe
- Be upfront: free, open source, not affiliated with the developer
- Answer every question, including the annoyed ones
- Never argue with someone who does not like it

### Timing

Contact the developer **first**, wait about a week, then launch. If they reply positively you
can say so, which is worth more than any other marketing you can do. If they do not reply,
launch anyway — you asked in good faith.

---

## 8. Positioning

**Value proposition:** *The Choicer Voicer saves your dubs but gives you no way to get them out.
This gets them out, as real video, ready to post.*

**Key points, in benefit order:**

1. Turn a dub into a shareable video in about a minute
2. Clean quality, rebuilt from the original files rather than screen-recorded
3. Fix a bad line without re-recording the whole thing
4. Vertical export for Shorts, TikTok and Reels
5. Free, no ads, no account, open source

**Objections and honest answers:**

| Objection | Answer |
| --- | --- |
| "Windows says it's dangerous" | It is unsigned. A certificate costs a few hundred dollars a year for a free tool. Source is public; build it yourself if you prefer |
| "Why is it 155 MB?" | It bundles ffmpeg so nothing else needs installing |
| "Can't I just screen record?" | You can, but you get compression artefacts, mixed audio you cannot fix, and no per-line control |
| "Is this allowed?" | It does not modify the game or include any of its content. It only reads files already on your computer |
| "Will it break my game?" | It only ever reads. Nothing is written to the game's folders |

**Landing page order:** demo clip → one-sentence description → download button → three
screenshots → how it works in three steps → FAQ → disclaimer.

---

## 9. Risk matrix

| Risk | Likelihood | Impact | Mitigation | Severity |
| --- | --- | --- | --- | --- |
| Support load exceeds your time | **High** | Medium | Good Help docs (done), pin an FAQ, set expectations | **Medium** |
| Game update changes file formats | Medium | High | Parser already tolerates several variants; watch for game updates | **Medium** |
| SmartScreen scares users off | **High** | Low | Explain it on the download page and in Help (done) | **Low–Medium** |
| Developer objects | Low | High | Ask first, offer to rename or remove | **Low** |
| Antivirus false positive | Medium | Medium | Publish checksums, keep source public | **Low–Medium** |
| Trademark complaint | Low | Medium | Disclaimer, no logos, offer to rename | **Low** |
| GPL complaint | Very low | Low | Licence already shipped, source linked | **Very low** |
| Tax mistake | Low | Low–Medium | Track income from day one, ask a CPA if it grows | **Low** |
| Someone posts a copyrighted dub and blames you | Low | Low | Terms say the user is responsible for what they export | **Very low** |

**The honest headline: your real risks are practical, not legal.** Support burden and the game
changing format are far more likely to hurt than any lawyer.

---

## 10. Launch checklist

### Before launch
- [x] ~~Make the repo public~~ (done)
- [x] ~~Set up Ko-fi and wire `DONATE_URL`~~ (done: https://ko-fi.com/jojozagjos)
- [ ] Search USPTO for "The Choicer Voicer"
- [ ] Look for any EULA in the game folder or on itch.io
- [ ] Message the developer, then wait about a week
- [ ] Test on a machine that has never run the app, ideally not yours
- [ ] Record a 20–30 second demo using a pack you made yourself
- [ ] Write the release notes and the SmartScreen explanation

### Launch
- [ ] Tag `v1.1.0`, attach the zip from `npm run build:zip`
- [ ] Publish, with clear "unaffiliated" wording
- [ ] List on itch.io as free with optional donation
- [ ] Ask a moderator, then post in the game's Discord
- [ ] Comment on the game's itch page

### After
- [ ] Answer everything for the first week
- [ ] Collect bugs into GitHub issues
- [ ] Ship a fix release quickly; it signals the project is alive
- [ ] Only then start the content manager

---

## Next steps, in order

1. **Message the developer.** Draft is in section 3.
2. **While you wait: test on a clean machine and record the demo.**
3. **Launch.**
4. **Content manager** as the v1.2 headline feature.

---

## Questions that still need answers

1. **Did you find any EULA** in the game folder or on itch.io?
3. **Do you want to be listed on itch.io** as well as GitHub?
4. **What name do you want if the developer asks you to change it?** Worth deciding in advance so
   you can answer immediately.
