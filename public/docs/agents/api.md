# API Reference

Base URL and conventions: see [conventions.md](./conventions.md). Authentication: see [auth.md](./auth.md).

Field validation rules in summary:

- `smell`: integer 0–100 (higher = stinkier).
- `difficulty`: integer −3 to 3 (negative = easy, positive = hard).
- `parking_availability`, `pet_friendly`: integer 0–100.
- `style_percentages`: object with optional keys `crimpy`, `dynos`, `overhang`, `slab`; values 0–100 summing to 100 (±1 tolerance).
- `utility_name`: free-form short string (e.g. `"showers"`, `"campus_board"`).
- `vote` (utility): exactly `1` (upvote) or `-1` (downvote).
- `username` (when supplied in body): 3–20 chars, `[a-zA-Z0-9_-]`.

## Gyms

### `GET /api/gyms`

List gyms. Public, no auth.

Query params:

| Param | Type | Notes |
| --- | --- | --- |
| `bbox` | `minLng,minLat,maxLng,maxLat` | Optional. Restricts to a geographic bounding box. |

Response: array of gyms with rolled-up vote stats (averages over the last 100 votes per gym), utility usage counts, and style distribution.

```sh
curl 'https://yourshoesmells.com/api/gyms?bbox=-74.05,40.65,-73.85,40.85'
```

### `GET /api/gyms/:id`

Single gym by UUID. Public.

```sh
curl https://yourshoesmells.com/api/gyms/<gym-uuid>
```

### `GET /api/gyms/by-region`

Query params (all strings):

| Param | Required | Notes |
| --- | --- | --- |
| `country` | yes | ISO country code (e.g. `US`, `CN`). |
| `state` | no | Narrows to a state/province. |
| `city` | no | Narrows further. |

```sh
curl 'https://yourshoesmells.com/api/gyms/by-region?country=US&state=NY&city=New%20York'
```

### `GET /api/gyms/voted-gyms`

List the gym IDs the caller has voted on.

Query params: `username` (string). Returns `[]` if the username isn't provided or doesn't exist.

```sh
curl 'https://yourshoesmells.com/api/gyms/voted-gyms?username=alice'
```

### `GET /api/gyms/user/:user_id/stats`

User stats: regions, farthest pair of gyms visited, stinkiest visited, total count. Public, but you need the user's `user_id` (UUID, obtained from registration response).

```sh
curl https://yourshoesmells.com/api/gyms/user/<user-uuid>/stats
```

### `GET /api/gyms/:id/my-vote`

Most recent vote for `username` on the given gym, or `null`.

Query params: `username` (string, required).

```sh
curl 'https://yourshoesmells.com/api/gyms/<gym-uuid>/my-vote?username=alice'
```

### `GET /api/gyms/:id/my-utility-votes`

Map of `utility_name → vote` for the given user on this gym.

Query params: `username` (string, required).

```sh
curl 'https://yourshoesmells.com/api/gyms/<gym-uuid>/my-utility-votes?username=alice'
```

### `POST /api/gyms/:id/vote`

Cast or update a vote. **Write — auth required.** Accepts either Bearer token or body username/password (see [auth.md](./auth.md)).

Body fields (all optional except auth):

| Field | Type | Notes |
| --- | --- | --- |
| `smell` | int 0–100 | |
| `difficulty` | int −3..3 | |
| `parking_availability` | int 0–100 | |
| `pet_friendly` | int 0–100 | |
| `style_percentages` | `{crimpy, dynos, overhang, slab}` | Each 0–100, must sum to 100 (±1). |
| `styles` | `string[]` | Legacy. Stored in `gym_style_votes` for backwards compatibility. |
| `username` | string | Required if not using Bearer auth. |
| `password` | string | Required if the account has a password set and not using Bearer auth. |

Each value provided overwrites the previous one; omitted fields stay at their previous value (COALESCE behavior). Voting again as the same user updates that user's existing row rather than creating a new one.

```sh
# With Bearer
curl -X POST https://yourshoesmells.com/api/gyms/<gym-uuid>/vote \
  -H 'Authorization: Bearer yss_live_…' \
  -H 'content-type: application/json' \
  -d '{"smell":80,"difficulty":1,"style_percentages":{"crimpy":40,"dynos":10,"overhang":30,"slab":20}}'

# With body credentials
curl -X POST https://yourshoesmells.com/api/gyms/<gym-uuid>/vote \
  -H 'content-type: application/json' \
  -d '{"username":"alice","password":"correct-horse-battery","smell":80}'
```

Response: `{ "ok": true, "user_id": "…" }`.

### `POST /api/gyms/:id/utility-vote`

Upvote / downvote whether a utility (`showers`, `campus_board`, etc.) exists at this gym. **Write — auth required.**

Body fields:

| Field | Type | Notes |
| --- | --- | --- |
| `utility_name` | string | Required. |
| `vote` | `1` or `-1` | Required. |
| `username` / `password` | string | Required when not using Bearer auth. |

```sh
curl -X POST https://yourshoesmells.com/api/gyms/<gym-uuid>/utility-vote \
  -H 'Authorization: Bearer yss_live_…' \
  -H 'content-type: application/json' \
  -d '{"utility_name":"showers","vote":1}'
```

Casting a new vote for `(gym, user, utility_name)` overwrites the previous one.

### `POST /api/gyms/:id/smell` (legacy)

Single-field smell vote. Kept for backwards compatibility with older clients — prefer `/vote`. Same auth rules as `/vote`.

Body: `{ "smell": <0-100>, "username": "...", "password": "..." (optional) }` or use Bearer.

## Feedback

### `POST /api/feedback`

Submit free-form product feedback. Public — no auth.

Body:

| Field | Type | Notes |
| --- | --- | --- |
| `feedbackType` | string | Optional, e.g. `"idea"`, `"bug"`. |
| `message` | string | Required. |
| `timestamp` | ISO string | Optional. Defaults to server time. |
| `user` | `{ id?, name?, email? }` | Optional attribution. |

```sh
curl -X POST https://yourshoesmells.com/api/feedback \
  -H 'content-type: application/json' \
  -d '{"feedbackType":"idea","message":"add EU gyms","user":{"name":"alice"}}'
```

### `GET /api/feedback`

List feedback. Query params: `limit` (default 50), `offset` (default 0). Intended for admin viewing.

## Auth & tokens

### `POST /api/auth/register`

See [auth.md → step 1](./auth.md#1-create-a-username-and-optionally-set-a-password).

### `POST /api/auth/login`

Body: `{ "username", "password" }`. Returns `{ "ok": true, "user_id", "username" }` on success. Useful for verifying credentials without minting a token.

### `GET /api/auth/check`

Query param `username`. Returns `{ exists, has_password, user_id? }`. Use this before calling register/login to decide which flow to follow.

### `POST /api/auth/tokens`

Mint an API token. Requires body credentials (no token can mint a token).

Body: `{ "username", "password", "name" }`. Response: `{ id, name, token_prefix, created_at, token }`. The `token` is the raw value — **store it now**. See [auth.md → step 2](./auth.md#2-mint-an-api-token).

**At most one active token per user.** If you already have one, this returns `409 { "error": "token_exists" }`. Use rotate (below) to replace it, or revoke first.

### `POST /api/auth/tokens/rotate`

Atomically revoke the existing active token (if any) and mint a new one. The same as calling revoke then mint, but in one transaction so there's never a moment where you have two active tokens.

Body: `{ "username", "password", "name"? }`. If `name` is omitted, the new token inherits the previous one's name (or defaults to `"api-token"` if there was none). Response: identical shape to mint, including the raw `token` shown once.

### `GET /api/auth/tokens`

List your active tokens. **Bearer required** — use this from a CLI / agent that already has a token. Returns `[{ id, name, token_prefix, last_used_at, created_at }]` (0 or 1 element). The raw token is never returned.

### `POST /api/auth/tokens/list`

Same as GET above but takes body credentials instead of Bearer — used by the browser web app. Body: `{ "username", "password" }`.

### `DELETE /api/auth/tokens/:id`

Revoke a token you own. **Bearer required.** Returns `{ "ok": true }` or `404 not_found`.

### `POST /api/auth/tokens/:id/revoke`

Same as DELETE above but takes body credentials — used by the browser web app. Body: `{ "username", "password" }`. Returns `{ "ok": true }` or `404 not_found`.

## Notes

- Read endpoints accept anonymous traffic. The "my-vote", "my-utility-votes", and "voted-gyms" reads currently take `username` as a query param; future versions may also accept the Bearer-authenticated caller implicitly.
- Style and utility aggregation uses the most recent 100 votes per gym to keep the data fresh.
