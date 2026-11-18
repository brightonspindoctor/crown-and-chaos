# Card actions, animations and sounds

Every change on the board is animated together with its cause, so a player can always see why something happened. The rules engine records each effect as an event (`st.events`). Screens play those events back in order and never work out effects for themselves, so an animation can't show something the rules didn't do. `sim/events-check.mjs` plays 1,500 random fights and fails if the events and the real state ever disagree.

Two screens use this: the prototype (`game/index.html`, the tutorial and fights) and the playtest table (`play/index.html`). Both share one player, `play/fx.js` with its styles in `play/fx.css`. Each page makes its own copy with `makeFX(adapter)`, where the adapter says where that page keeps its cards (see the end of `play/fx.js`).

In the prototype, each caption under the board is shown first. Its events then play out on the board as it was, and the board is redrawn as it is now. Every event carries `n`, the number of log lines written before it. An event explains the log line just before it, except `phase`, `skip` and a front-rank card's `act`, which open what follows. That is how the prototype puts each animation with its caption, and `sim/events-check.mjs` checks the pairing. The ×1/×2 button sets the animation speed, Skip stops it, the speaker button mutes the sounds, and the Menu has switches for sound and for card animations.

## How a round plays out

1. **The plan is locked.** The engine resolves the whole round at once, and the board keeps showing the state from before the round.
2. **Items:** "Items first, then cards in Speed order" flashes on the centre line, and each item flies in from its owner's side of the board.
3. **Cards, in Speed order:** the acting card lifts and glows gold, and its action name appears above it. Front-rank cards show a smaller tag with their own name.
4. **Effects:** each effect plays from its source to its target, and the card's health number updates as the hit lands.
5. **End of round:** the centre line reads "End of round: poison, Nightfall and Crown passives", and those effects play.
6. **The board redraws** from the final state, which the animation has just finished showing.

## Attacks

| Effect | Animation | Sound |
| --- | --- | --- |
| Melee hit | The attacker winds back, lunges about 70% of the way to the target, thumps it and springs back. The target shakes and flashes red, a red damage number floats up, and red sparks scatter | Low thump |
| Beast melee (Beasts, the Mere-beast) | The same lunge, plus three claw slashes across the target | Tearing claw |
| Ranged hit | An arrow flies in an arc, turning to follow its path, and sticks in the target | Bow draw, whistle, thunk |
| Crossbowman | A short, heavy bolt flies flat and fast | Bolt, thunk |
| Spell (Hex, and any Witch's ranged attack) | A violet beam extends from the caster with a glowing orb at its source, then flashes and bursts on the target | Rising shimmer, zap |
| Little Mermaid's Sea Magic | A sea-green wave beam | Wave, splash |
| Damage from an effect (Lancelot's chip, Rumpelstiltskin's guess) | Red sparks travel from the source to the target | Spark |
| Poison damage | Green bubbles rise from the card | Bubbling |
| Nightfall damage | The board darkens once, then every card takes its hit | Low drone |

## When a hit is changed

| Effect | Animation | Sound |
| --- | --- | --- |
| Absorbed by Guard | A blue shield pops up, and "−2 Guard" or "Blocked" floats up | Metal clang |
| Shield Brother | A blue shield, and "Shielded" | Clang |
| St George blocks | A blue shield, and "St George blocks 3" | Clang |
| Redirect (Little John, Renfield, the Tin Soldier, the Leshy) | The interceptor dashes towards the card it's protecting, and "Intercepts!" appears. The hit then lands on the interceptor | Whoosh |
| Miss (Rhiannon) | The target sidesteps, and "Miss!" appears | Whiff |
| Survives (Vasilisa, Red Riding Hood) | The damage lands, then "Survives!" appears in gold | Thump |
| The Dragon swaps in | The two cards slide past each other into each other's places, and "Swaps in!" appears | Whoosh |

## Healing, support and status

| Effect | Animation | Sound |
| --- | --- | --- |
| Heal | Green lights travel from the healer to the card, which glows green, and a green "+2" floats up | Soft three-note chime |
| Guard gain | Blue lights travel from the source, and a shield pops with "+2 Guard" | Bright ping |
| Attack gain | Gold lights travel to the card, and "+3 Attack" appears | Sword ring |
| Poisoned | Green lights travel from the source, bubbles rise, and "+2 Poison" appears | Bubbling |
| Stopped | A beam from the caster, then grey stripes cover the card and "Stopped" appears | Chain rattle |
| Frozen | An ice-blue beam, then frost covers the card and "Frozen" appears | Ice crackle |
| A card skips its action | "Stopped: skips", "Frozen: skips" or "Cancelled" appears | Dull knock |
| Wasted action | "Wasted: no target" appears | Dull knock |
| Death | The card flashes pale, tips over, drops and fades to grey, and its name is struck through | Falling tone and thud |
| Revive | A column of light rises in the empty slot and the card fades back in, with "Revived" | Rising four-note arpeggio |
| Summon | A puff of smoke in the slot, then the card appears, with "Summoned" | Whoosh and two notes |

## Themed effects

Some actions and heroes have their own effect in place of the plain lunge, arrow or beam. The player picks it from the action being taken, then from the card acting (see `ACTION_FX` and `CARD_FX` in `play/fx.js`).

| Effect | Used by | Animation | Sound |
| --- | --- | --- | --- |
| Fire | Fire Breath, Skull fire, Baba Yaga's other attacks | A widening gout of flame and smoke from the caster; flames lick up the target, which glows and scorches, and embers rise | Roar and crackle, then a whoomph |
| Green fire | The Skull Lantern | The same, in green | Roar and crackle |
| The Pyre | The Creature | A flash and a ring of fire round him, the board shakes, and every enemy card is engulfed | Roar |
| Into the oven | Gretel | Her lunge sets the target alight | Whoomph |
| Hex | Merlin, Morgan le Fay, Gwydion | A rune circle turns under the caster, a beam crosses, and a second circle flares on the target (blue-violet, purple or green) | Shimmer and zap |
| Ice | The Snow Queen | A spray of ice shards; the target is ringed in frost | Ice crackle |
| Sea magic | The Little Mermaid | A wave beam, then a splash and a ripple ring | Wave and splash |
| Drag under | Grendel's Mother | A lunge and a splash of water | Splash |
| Lightning | The Bride | A forked bolt with a flash of the screen, then sparks and a ring | Thunder |
| Excalibur | King Arthur | A shaft of golden light falls on the target, with a starburst and ring | A chord and a ring of steel |
| Charges | Lance Charge, Champion's charge, Betrayal | A longer lunge, a dust ring and a board shake | Thump |
| Smashes | Pestle, Arm-wrench, Break their spirit | A heavy blow, a ring, flying splinters and a big board shake | Deep smash |
| Bite | Dracula | Jaws snap shut and blood drips; if he heals, red light drains back to him | Crunch |
| Sweeps | Tail Sweep, Rampage, Quarterstaff, the Berserker | A crescent swipe across the target | Swoosh |
| Whirlwind | Koschei | Spinning rings of wind and leaves; the target spins round | Howling wind |
| Split the Arrow | Robin Hood | A golden arrow with a sparkling trail and a gold ring | Bow and thunk |
| Stones in the belly | The Huntsman | A tumbling stone on an arc | Whoosh and crack |
| Girdle Leash | The Princess | Gold lights travel to the Beast, then golden cords loop round it and pull tight: "Leashed" | Rattle |
| Enchanted sleep | Merlin | A violet beam, then drifting mist and "z z z": "Asleep" | Ice crackle |
| Petrify, Medusa's head | Medusa, Perseus | A yellow-green gaze beam; the card turns to grey, cracked stone in a puff of dust: "Petrified" / "Turned to stone" | Rising gaze tone, grinding stone |
| Stony gaze | Medusa as Crown | Her gaze beam back at the hero that struck her, a flash of stone: "Stony gaze: −1 Speed" | Grinding stone |
| Serpent hair | Medusa | A snake darts across to each card, jaws snap and green poison drips | Hiss, crunch |
| Mirrored shield | Perseus | A silver shield and glow when chosen; when struck, a white flash, "Reflected!" and a silver beam back at the attacker | Glassy chime; a ringing ricochet |
| Nobody | Odysseus | He fades almost to nothing when chosen; the attack passes through him: "Nobody!" | Whisper |
| Hurl the boulder | Polyphemus | He heaves, a great rock tumbles on a high arc, a dust ring and a big board shake; "−1 Speed next round" | Heave, then a crashing rock-fall |
| Hex, Transfigure | Circe | Pink runes; for Transfigure, pink lights to the target, which puffs pink: "Transfigured: Attack 1" | Shimmer; a pig's grunt |
| Aiaia (Circe's Crown) | Circe | Pink puffs over each enemy front-rank card: "Swine" | Grunt |
| Royal decree | King Minos | A red wax seal with a gold crown stamps down by the enemy's ranks: "Royal decree: +1 AP per action next round" | A three-note horn call and a stamp |
| Athenian tribute | King Minos | His heals travel as gold lights | Chime |
| Growl | The Minotaur | Three red shockwaves roll out from him, the board shakes and every enemy card trembles: "−1 Guard −1 Speed" | A long low growl |
| Gore | The Minotaur | A long charge, two bone-white horn sweeps, a red ring and a board shake | Bellow and smash |

Every other melee hit now shows a sword streak at the moment of impact. Any hit for 5 or more shakes the board and sends out a ring. Heals send up green crosses, and the Monk's heal adds a gold halo. A falling card gives off rising ash, and a falling hero shakes the board. Poison runs down the card in green drips. When night falls the moon rises and stars come out over the board, and night damage sends up shadow wisps.

## Items

Every item first flies in from its owner's side (Blue from below, Red from above). It flips over to show its painting and name, and a glint crosses the painting. Then:

| Item | What happens next | Sound |
| --- | --- | --- |
| Golden Apple | Flies to the hero and bursts into gold sparks, then the heal plays | Chime |
| Gingerbread | Bursts into brown crumbs, then the heal plays | Pop |
| Water of Life | Bursts into blue droplets, then the big heal plays | Splash |
| Mead of Heorot | Bursts in the centre, then gold lights travel to each hero and heal them | Chime |
| Mead of Poetry | Bursts in the centre, and "+2 action points" floats up | Ping |
| Poisoned Apple | Flies to the enemy and bursts into dark green drops, then the poison plays | Bubbling |
| Skull Lantern | Stays in the centre and sends a beam of green fire at the target | Zap |
| Spindle | Bursts into threads, and "z z z" drifts up as the card is stopped | Rattle |
| The Giant's Sword | A sword drops onto the hero, and "+3 Attack" appears | Sword ring |
| Dragon's Blood | Bursts into red drops, then "+3 Guard" appears | Clang |
| Draught of the Cauldron | Bursts in the centre, then light rises as the hero is revived | Arpeggio |

## The end of the fight

A short rising fanfare plays for a win and a falling phrase for a draw. The result banner then appears.

## Sound

- **No sound files.** Every sound is made in the browser with Web Audio from tones and filtered noise, so there is nothing to license. That fits the rule that everything in the game is public domain.
- **When it starts:** browsers only allow sound after the player has done something, so sound starts on the first "Lock in" press.
- **Muting:** the Sound button turns all sound off, and the choice is remembered on that device.

## Speed and accessibility

- **Animations:** Normal, Fast (less than half the time) or Off. The choice is remembered.
- **Skip:** a "Skip animation" button jumps to the end of the round.
- **Reduced motion:** for players who have asked their device for reduced motion, cards flash instead of lunging and nothing flies across the screen. Numbers, glows and sounds still play.
- **Screen readers:** each step is announced in a hidden live region, for example "Robin Hood hits Berserker for 3".
- **Reading time:** each step pauses briefly before the next, so the cause and effect can be read.

## Events, for anyone building a screen

Every event has `t` (its type) and `r` (the round). Cards are referred to by `uid`.

| `t` | Fields | Meaning |
| --- | --- | --- |
| `phase` | `name`: `resolve` or `upkeep` | A stage of the round begins |
| `act` | `uid`, `side`, `name`, `tgt`, `auto`, `standard` | A card takes its action |
| `item` | `side`, `item`, `name`, `tgt` | An item is used |
| `hit` | `src`, `item`, `tgt`, `style`, `dmg`, `hp`, `guarded`, `saved`, `shielded`, `survived` | Damage. `style` is `melee`, `ranged`, `spell`, `effect`, `poison` or `night`; `hp` is the health after the hit |
| `heal` | `src`, `item`, `tgt`, `amt`, `hp` | Healing |
| `hp` | `src`, `tgt`, `delta`, `hp` | A health change set directly by a rule (Baba Yaga's Mortar Ride, for example) |
| `miss`, `redirect`, `swap` | see the engine | A hit is changed |
| `guardUp`, `attackUp`, `poison` | `src`, `item`, `tgt`, `amt` | A stat is raised |
| `stop`, `freeze`, `skip`, `wasted` | `tgt` or `uid` | Lost actions |
| `death`, `revive`, `appear` | `uid`, `side`, `slot` | Cards leave or join the board |
| `debuff` | `kind`, `src`, `tgt` or `tgts`, `side`, `text` | A stat lowered without damage. `kind` is `gaze`, `slow`, `transfig`, `swine`, `growl` or `decree` |
| `over` | `winner` | The fight ends |
