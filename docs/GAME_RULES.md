# Game Rules & Board Encoding

## Classic rules implemented

- 4 tokens per player; 2–4 players. Turn order red → green → yellow → blue (clockwise).
- Roll a **6 to leave base** (token enters its start cell).
- **Extra roll on 6**; three consecutive 6s forfeit the turn (roll discarded).
- **Capture**: landing on a cell with opponent tokens sends _all_ of them back to base —
  unless the cell is safe. No captures on safe cells; tokens co-exist there.
- **Safe cells**: the 4 start cells + 4 star cells (one per board arm).
- **Home column**: after a full lap a token turns into its color's 5-cell home column;
  an **exact roll** is needed to reach the center home.
- Overshoot is illegal (token immobile for that roll). No legal move ⇒ auto-pass.
- A player finishing all 4 tokens gets the next placement rank and is skipped; the game
  continues until one unfinished player remains (placements 1st–4th).
- **Blockades: excluded from MVP** (two-token walls stall games and fight the pacing goal).
  The engine keeps a seam (`rules.blockades`) for a future variant toggle.

## Board geometry (verified against the design mock)

15×15 grid. Main path = **52 cells**, indexed 0–51 (see `packages/engine/src/constants.ts`
`PATH_GRID`). Bases: red top-left, green top-right, blue bottom-left, yellow bottom-right.

| Color  | Start cell (abs idx / grid) | Home-column entry | Home column       |
| ------ | --------------------------- | ----------------- | ----------------- |
| red    | 1 → (7,2)                   | (8,1)             | row 8, cols 2–6   |
| green  | 14 → (2,9)                  | (1,8)             | col 8, rows 2–6   |
| yellow | 27 → (9,14)                 | (8,15)            | row 8, cols 14–10 |
| blue   | 40 → (14,7)                 | (15,8)            | col 8, rows 14–10 |

Safe cells (abs indices): `{1, 14, 27, 40}` (starts) + `{9, 22, 35, 48}` (stars at
(3,7), (7,13), (13,9), (9,3)).

## Position encoding (the core engine trick)

One integer per token, **relative to its own color**:

| `pos`    | Meaning                                                                |
| -------- | ---------------------------------------------------------------------- |
| `-1`     | In base                                                                |
| `0..50`  | Main-path progress; absolute cell = `(START_OFFSET[color] + pos) % 52` |
| `51..55` | Home-column cell `pos − 51`                                            |
| `56`     | Finished (center home)                                                 |

`START_OFFSET = { red: 1, green: 14, yellow: 27, blue: 40 }`. Home-entry math is automatic:
a token's last main-path cell is `pos = 50` (one cell before its entry), so `pos + dice > 56`
is the single overshoot rule and colors can never wrap into each other's home columns.

## Dynamic dice (casual mode only)

Per roll, start with uniform weights `[1,1,1,1,1,1]`, then:

1. **Drought breaker**: if the player hasn't rolled a 6 in ≥5 rolls (≥3 if all tokens are
   based): `w[6] *= 1 + 0.25 × (rollsSinceSix − 4)`.
2. **Comeback**: last place and trailing the leader by ≥20 progress: `w[4..6] *= 1.15`.
3. **Anti-runaway**: leading by ≥25 progress: `w[6] *= 0.85`.
4. **Hard clamp**: every weight into `[0.7, 2.5]` ⇒ per-roll P(6) ∈ **[12.3%, 33.3%]**
   (fair = 16.7%). This bound is the fairness guarantee and is unit-tested over 10k rolls.

Sampling uses injected `crypto.randomInt` — entropy stays cryptographic; only the
distribution is shaped. Fair mode (`FairDice`) is plain `crypto.randomInt(1,7)` and is the
only mode allowed in any future ranked play.

## Move scorer (powers auto-move + bots)

`score(move) = capture×40 + victimProgress×0.5 + finish×50 + enterHome×25 + exitBase×20
(8 if ≥2 tokens out) + landSafe×12 + escapeThreat×18 − 8×Σ threat×(7−dist)/6

- to×0.3 ± 0.5 jitter`. Timeout auto-move takes argmax; `normal`bots take argmax;`easy` bots sample softmax over the top 3.
