# Crown & Fable

A 1-vs-1 digital card battler built from European folklore. Every card is earned by playing, never bought, and every painting on a card is in the public domain.

The design reasoning lives in the design doc; this repository holds the data the game reads.

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
