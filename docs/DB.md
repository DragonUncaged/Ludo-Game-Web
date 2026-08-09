# Database (Neon Postgres)

SQL over NoSQL — match history, stats, and progression are relational and benefit from
transactions and aggregates. **Live game state never touches the DB** (see ARCHITECTURE.md).

Plain SQL migrations in `packages/db/migrations/`, applied by a tiny runner
(`schema_migrations` version table). No ORM — the MVP has 4 tables and ~8 queries.

## Connections

- App queries: **pooled** connection string (`-pooler` host), `pg.Pool({ max: 5 })`.
- Migrations: same pooled string is fine at this scale (session-mode features unused).
- The realtime server is a long-lived Node process → plain `pg`, not the serverless driver.
- Note: a persistent server keeps Neon warm — scale-to-zero will not kick in.

## Tables

```sql
guest_users   (id BIGSERIAL PK, device_token UUID UNIQUE, nickname,
               created_at, last_seen_at)
matches       (id BIGSERIAL PK, room_id, join_code, dice_mode fair|dynamic,
               seats 2..4, status active|completed|abandoned,
               started_at, ended_at, snapshot JSONB)
match_players (match_id FK CASCADE, seat, user_id FK NULL for bots, nickname,
               color, is_bot, final_rank, captures, tokens_home,
               PK(match_id, seat))
user_stats    (user_id PK FK, games_played, wins, captures_made,
               tokens_finished, updated_at)
```

## Write points

| When | What | Mode |
|---|---|---|
| Player joins room | `guest_users` upsert (nickname + last_seen refresh) | fire-and-forget |
| Host starts game | insert `matches` + `match_players` | fire-and-forget |
| After each move | `matches.snapshot = <serialized engine state>` | fire-and-forget |
| Game over | complete match + ranks + `user_stats` increments | one transaction |
| Room disposed unfinished | `matches.status = 'abandoned'` | fire-and-forget |

Fire-and-forget writes log errors but never block the game loop.
