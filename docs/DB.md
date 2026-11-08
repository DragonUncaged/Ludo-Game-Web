# Database

Postgres (Neon in production). Live game state never goes to the database, only results,
profiles and coins.

Migrations are plain SQL in `packages/db/migrations/`, applied in order by a small runner that
records each file in `schema_migrations`. Run them with `pnpm --filter @ludo/db migrate`. No ORM.

## Connections

- One `pg.Pool` per process, 5 connections. On Neon use the pooled (`-pooler`) host.
- The realtime server is a long-running process, so it's plain `pg`, not a serverless driver.
  It also means Neon never scales to zero while the server is up.

## Tables

```
guest_users       id, device_token (unique), nickname, coin_balance, last_bonus_at,
                  created_at, last_seen_at
matches           id, room_id, join_code, dice_mode, seats, status, bet_amount, total_pool,
                  started_at, ended_at, snapshot (jsonb)
match_players     (match_id, seat), user_id (null for bots), nickname, color, is_bot,
                  final_rank, captures, tokens_home
user_stats        user_id, games_played, wins, captures_made, tokens_finished
coin_transactions every balance change: user_id, match_id, type, amount, balance_after
cosmetics         the shop catalog (seeded by 003)
player_cosmetics  what each player owns and has equipped
cosmetics_transactions  purchase log
```

`coin_accounts` exists from migration 002 but nothing writes to it yet.

## When things get written

| When                   | What                                       | How             |
| ---------------------- | ------------------------------------------ | --------------- |
| Nickname entered       | Guest row upserted, free cosmetics granted | api             |
| Host starts the game   | `matches` + `match_players`                | fire-and-forget |
| After every move       | `matches.snapshot`                         | fire-and-forget |
| Game over              | Ranks, `user_stats`, then bet settlement   | transactions    |
| Room closes unfinished | `matches.status = 'abandoned'`             | fire-and-forget |
| Daily bonus, purchase  | Balance + audit row                        | transaction     |

Fire-and-forget writes log their errors and never hold up the game. Every coin change happens
inside a transaction with the user's row locked, and settlement only pays the winner what was
actually collected from the losers, so coins are never created by a race.
