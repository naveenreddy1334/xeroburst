# API

Base `/api/v1`. JSON in, JSON out. Errors always look like `{"error":{"code","message","details?"}}` with the codes in `packages/shared/src/errors.ts` (for example 401 `INVALID_CREDENTIALS`, 403 `FORBIDDEN`, `GAME_LOCKED`, `OUT_OF_SCOPE`, 409 `BOARD_BUSY`, 422 `VALIDATION` with `details.fields`).

Every request runs the same pipeline: authenticate (JWT, user and token version re-checked each time, so deactivation and resets act at once) -> permission -> scope and rank -> validate -> handler in a transaction -> audit.

## Roles and permissions

| Permission | Super Admin | Admin | Coach | Player |
|---|:-:|:-:|:-:|:-:|
| MANAGE_SYSTEM (settings, backup, devices) | yes | | | |
| MANAGE_ADMINS | yes | | | |
| MANAGE_COACHES | yes | yes | | |
| CREATE_COACHES | yes | yes | grant only | |
| MANAGE_PLAYERS, GAME_ACCESS, GAME_PROGRESS, PROGRAMS | yes | yes | all players | |
| VIEW_RESULTS | yes | yes | all players | |
| VIEW_AUDIT | yes | yes | | |
| PLAY_GAME, VIEW_OWN_RESULTS | yes | yes | yes | yes |
| VIEW_OWN_PROGRESS | yes | | | yes |

Hierarchy: Super Admin (complete control, system and operational) > Coach (every operational module, every player) > Player (own data). A Coach is not limited to assigned players: list, search, read and edit work for all of them. System administration (users, settings, audit) stays with Super Admin / Admin. Admin is a legacy tier kept for existing accounts. Every role sees every game; only starting a game depends on unlock state, and that is enforced in `POST /sessions`.

Rank rules: you can only manage someone of strictly lower rank. Nobody creates or modifies a Super Admin through the API. Only a Super Admin changes a role (Admin <-> Coach).

## Endpoints

Auth: `POST /auth/login`, `/auth/refresh` (rotating, reuse revokes the chain), `/auth/logout`; `GET /me`; `POST /me/password`; `GET /me/sessions`; `DELETE /me/sessions/:id`.

Staff: `GET|POST /users`, `GET|PATCH /users/:id`, `POST /users/:id/reset-credentials`, `PUT /users/:id/permissions`, `POST /users/:id/revoke-sessions`.

Players: `GET|POST /players`, `GET|PATCH /players/:id`, `POST /players/:id/reset-credentials`, `PUT /players/:id/coach`, `GET /players/:id/access`, `PUT /players/:id/access/:game`, `GET|PUT /players/:id/program`, `POST /players/:id/program/advance`, `PUT /players/:id/program/stage`.

Programs: `GET|POST /programs`, `GET|PATCH|DELETE /programs/:id`.

Modules: `GET /modules` returns every module enabled for staff (Super Admin, Admin, Coach); a Player keeps the module switch as configured (nBase, nCourt and nPad stay "coming soon"). `POST /sessions` takes an optional `module_key` (`nboard` default, `nbase`, `ncourt`, `npad`); only staff may use a module other than `nboard` (a Player gets 403), and the round is stored and returned with it.

Mandatory fields (one set of zod rules in `packages/shared/src/schemas.ts`, used by the server and the app forms): a new Player needs a real name (2+ characters with a letter), age 3-100 and weight 10-300 kg; a new Coach or Admin needs a real name, email, phone and age 18-80 (no weight). Edits are validated with the same rules. Invalid input returns 422 with `error.details.fields`. Records created before these rules (no age, weight or contact details) stay valid and readable; the edit form asks for the missing values.

Play: `GET /modules`, `GET /games`, `GET /games/:slug`, `GET /games/:slug/howto`, `POST /sessions`, `POST /sessions/:id/finish`, `POST /sessions/:id/abort`, `GET /sessions/:id`, `GET /board/status`, WebSocket `/board?ticket=`.

Results: `GET /me/results`, `/me/analytics`, `/me/progress`, `/players/:id/results`, `/players/:id/analytics`, `/analytics/overview`, `/activity`.

Performance and insights (rule-based, from stored summaries, no external service): `GET /me/performance`, `GET /players/:id/performance` (VIEW_RESULTS), `GET /sessions/:id/insights` (own round, or any player's for staff), `GET /analytics/performance` (roster figures and players needing attention across all players).

System: `GET /health`, `/system/info` (public), `/audit`, `GET|PUT /system/settings`, `POST /system/backup`, `GET /system/devices`.

Lists are paged with `limit` and `cursor`; analytics take `range=day|week|month`, `offset` and optional `game`. The time zone and week start come from system settings (default Asia/Kolkata, weeks start Monday).

## Rules worth knowing

- A program stage unlocks the games of that stage and every earlier stage. Advancing is always manual. A game set by hand (`manual`) is never touched by a program change.
- Meeting a game's target marks it Completed. It stays playable and nothing else unlocks by itself.
- Interrupted and aborted rounds are saved but never count for bests, streaks, analytics or targets.
- Failed sign-ins lock the account: 5 tries, 5 minutes, doubling up to 1 hour. A reset by someone with rights unlocks it.
- The audit log is append-only (database triggers refuse edits and deletes) and never holds secrets.


## Hubs (new)

| Method | Path | Who | Notes |
|---|---|---|---|
| GET | /hubs | staff | A coach with a hub sees only theirs |
| POST | /hubs | MANAGE_HUBS | `{name, city?}` |
| PATCH | /hubs/:id | MANAGE_HUBS | `{name?, city?, is_active?}` |
| GET | /hubs/:id/summary?days=30 | MANAGE_HUBS | players active/inactive, attendance, rounds, accuracy, people, per-day series |
| GET | /hubs/compare?days=30 | MANAGE_HUBS | one row per active hub |
| POST | /hubs/:id/assign-unassigned | MANAGE_HUBS | puts everyone with no hub into this hub |

`hub_id` is accepted when creating or editing players (`POST/PATCH /players`) and coaches (`POST/PATCH /users`), and returned as `hub` in the player and user objects. `GET /players?hub=<id>` filters. `GET /players/:id/results?status=played` returns completed and stopped rounds.
