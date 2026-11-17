# Crown & Chaos

A 1-vs-1 digital card battler built from European folklore. Previously called Crown & Fable; the repository keeps its old name.

Every card is earned by playing, never bought, and every painting on a card is in the public domain.

The design reasoning lives in the design doc; this repository holds the data the game reads.

## Play it on your phone

The game is published to GitHub Pages by the **Publish the game** workflow on every push to `main`:
**https://brightonspindoctor.github.io/crown-and-fable/**

- **iPhone (Safari):** open the link, tap Share, then **Add to Home Screen**.
- **Android (Chrome):** open the link, tap the menu, then **Install app** (or **Add to Home screen**).

It then opens full screen from its own icon and works offline. Progress is saved on that phone only.

The icon is drawn in `game/icons/icon.svg`. To change it, replace that file and run
`python3 scripts/build-icons.py && node scripts/build-game.mjs`.

## What's here

| Path | What it holds |
| --- | --- |
| `cards/heroes/` | One JSON file per hero: realm, tale, Aspect, stats, Vulnerability (switched off for now; kept in the data), Renown, Crown passive, Bond, actions and art |
| `cards/front-rank/` | Front-rank cards, including set cards such as the Grandmother and Koschei's Needle |
| `cards/items/` | Single-use items |
| `art/manifest.json` | Every image: artist, title, date, source and why it's public domain |
| `art/images/` | Downloaded images (filled by the Fetch art workflow) |
| `CREDITS.md` | Art credits, generated from the manifest |
| `scripts/` | `validate.mjs`, `fetch-art.mjs`, `build-credits.mjs` |

## Rules for art

- Everything must be public domain in the UK (the artist died more than 70 years ago) and the US (published before 1931).
- Every image is credited in-game by artist, title, date and source.
- Stand-in paintings, such as the Bride's, are credited by their own title, never as the character.
- An image marked `to-confirm` or `open` must not ship.

## Variants

A card can have more than one artwork. The main artwork is number 1; each extra public-domain picture is a numbered variant (Robin Hood 1, Robin Hood 2 and so on), stored in the manifest with `use: "variant"` and its `variant` number.

- A player who owns a variant can field it as a separate copy of the hero, or make it the main look of the card.
- Every variant passes the same rights rule as a main artwork and carries its own credit.
- When a better public-domain picture turns up, keep the old one as a variant; don't delete it.

## Cropping

Each downloaded image has `size` and `crops` in the manifest. Crops are keyed by card id, because two cards can share one painting (Victor and the Creature) and need different cuts.

- `window`: the 17:10 art window on a framed card.
- `full`: the 5:7 full-bleed card. The subject sits in the top half, clear of the text panel.
- `board`: the 16:10 battle backdrop.

Each crop is `[x, y, width, height]` as fractions of the image. To show one in CSS on an element of the right shape:

```css
background-size: calc(100% / width) calc(100% / height);
background-position: calc(100% * x / (1 - width)) calc(100% * y / (1 - height));
```

Use `0` for a position whose width or height is 1. `art/crop-preview/` shows every crop in a card frame. An image downloaded later has no `size` or `crops` until someone has looked at it and added them. Once `size` is set, `validate.mjs` fails on a missing or misshapen crop and warns when a crop is too small to be sharp.

## Hero status

- `reviewed`: stats and abilities agreed.
- `draft`: written but not yet reviewed.
- `sketch`: an idea with no stats yet (the Norse heroes).

All numbers are first drafts until playtested.

## Commands

```sh
node scripts/validate.mjs       # check cards and art
node scripts/build-credits.mjs  # rebuild CREDITS.md
node scripts/fetch-art.mjs      # download images (normally run by GitHub Actions)
```

To download art, run the **Fetch art** workflow from the Actions tab. It also runs whenever `art/manifest.json` changes on `main`. Only images with a `commonsFile` or `downloadUrl` can be fetched automatically.

## Playtesting

| Path | What it is |
|---|---|
| `engine/engine.mjs` | The rules engine, shared by the simulator and the playable page. Its `ASSUMPTIONS` list names every rule detail it had to guess |
| `sim/run.mjs` | Plays bot-vs-bot fights between random legal line-ups and writes `sim/results.md`. Run `node sim/run.mjs 100000` |
| `sim/checks.mjs` | Small rule checks. Run `node sim/checks.mjs` |
| `play/index.html` | A two-player page for one device, or one player against a bot. Rebuild it with `node scripts/build-play.mjs` after changing cards or the engine |
| `play/fx.js`, `play/fx.css` | The animations and sounds that play each round back, shared by the prototype and the playtest table. See `design/animations.md` |
| `sim/events-check.mjs` | Plays 1,500 random fights and fails if the events the animations use ever disagree with the real state |

Card numbers are read from the JSON files, but each card's effect is coded by hand in the engine, so a change to a card's text needs the matching change in `engine/engine.mjs`.

## Playable prototype

| Path | What it is |
|---|---|
| `game/template.html` | The prototype: the scripted tutorial fight ("The Field at Silene"), "Are you ready?", the 20-card first pack, your collection, line-up building within 50 Renown, fights against the computer that pay gold, and the shop. The `TUTORIAL` list near the top holds every tutorial step and the Dragon's fixed moves |
| `game/img/` | Every card's painting and every battle board, cropped from `art/images/` using the crops in the manifest. Rebuild with `python3 scripts/crop-game-art.py` |
| `game/index.html` | The built page. Rebuild with `node scripts/build-game.mjs` |

Progress (gold, cards, line-up) is saved in the player's browser only. The page runs on the same engine as everything else: the engine calls `st.onLog` after every log line and sets `st.acting`, which is how the page replays a round card by card.

## Cover art

`design/cover-art.jpg` is the front of the game (shown on the home screen as `game/img/cover.jpg`): Red Riding Hood, crowned, with the wolf at her feet. It is new artwork, not a public-domain painting, so the art manifest's checks don't cover it. **To do:** record who made it and the licence it is used under before it ships.
