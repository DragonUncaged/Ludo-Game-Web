# Game rules and board encoding

## Rules

- 2 to 4 players, 4 tokens each. Turn order is red, green, yellow, blue (clockwise).
- Roll a 6 to bring a token out of base onto its start cell.
- A 6 earns another roll. Three 6s in a row and the third roll is thrown away and the turn ends.
- Landing on opponents sends all of them on that cell back to base, unless it's a safe cell.
- Safe cells are the four start cells and the four stars. Tokens of any color can share them.
- After a full lap a token turns into its home column and needs an exact roll to finish.
  A move that would overshoot isn't allowed. With no legal move the turn passes.
- Players who finish all four tokens get the next placement and are skipped. The game ends when
  one player is left.
- No blockades. Two-token walls slow the game down too much.

## Board geometry

A 15×15 grid. The main path is 52 cells, indexed 0 to 51 (`PATH_GRID` in
`packages/engine/src/constants.ts`). Bases: red top-left, green top-right, blue bottom-left,
yellow bottom-right.

| Color  | Start cell (index, grid) | Home column entry | Home column          |
| ------ | ------------------------ | ----------------- | -------------------- |
| red    | 1, (7,2)                 | (8,1)             | row 8, cols 2 to 6   |
| green  | 14, (2,9)                | (1,8)             | col 8, rows 2 to 6   |
| yellow | 27, (9,14)               | (8,15)            | row 8, cols 14 to 10 |
| blue   | 40, (14,7)               | (15,8)            | col 8, rows 14 to 10 |

Safe cells by index: 1, 14, 27, 40 (starts) and 9, 22, 35, 48 (stars).

## Position encoding

Each token is a single integer, relative to its own color:

| `pos`    | Meaning                                                              |
| -------- | -------------------------------------------------------------------- |
| `-1`     | In base                                                              |
| `0..50`  | On the main path. Absolute cell = `(START_OFFSET[color] + pos) % 52` |
| `51..55` | Home column, cell `pos - 51`                                         |
| `56`     | Finished                                                             |

With `START_OFFSET = { red: 1, green: 14, yellow: 27, blue: 40 }`, a token's last shared cell is
always `pos = 50`. So `pos + dice > 56` is the only overshoot check needed, and one color can
never wander into another's home column.

## Dice

**Fair** is `crypto.randomInt(1, 7)`.

**Exciting** (the casual default) starts every roll from equal weights and then adjusts them:

1. Drought breaker. After 5 rolls without a 6 (3 if all your tokens are in base), the six's
   weight grows by 0.25 for each further roll.
2. Comeback. If you're last and at least 20 steps of progress behind the leader, 4, 5 and 6 get
   ×1.15.
3. Anti-runaway. If you lead everyone by 25 or more, the six gets ×0.85.
4. Every weight is then clamped to [0.7, 2.5], which keeps P(6) between 12.3% and 33.3% (fair is
   16.7%). `dice.spec.ts` checks the bounds.

Only the distribution changes. Sampling still uses `crypto.randomInt`.

## Move scorer

Bots and timeout auto-moves rank moves with one scoring function:

```
capture × 40 + victim progress × 0.5 + finish × 50 + enter home × 25
+ leave base × 20 (8 if two or more tokens are already out)
+ land on safe cell × 12 + escape a threat × 18
- 8 × Σ (7 - distance) / 6 over opponents that could hit the destination
+ destination × 0.3, ± 0.5 jitter
```

Timeout auto-moves and `normal` bots take the top move. `easy` bots pick from the top three with
a softmax.
