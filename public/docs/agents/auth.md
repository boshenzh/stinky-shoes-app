# Authentication

The Your Shoe Smells API supports two credential styles. Pick based on what you're building:

- **API tokens** (`Authorization: Bearer yss_live_…`) — recommended for scripts, agents, and CLIs. Long-lived, revocable, scoped to one user.
- **Body credentials** (`{ "username": "...", "password": "..." }`) — used by the browser web app. Works without an extra setup step but exposes your real password on every write.

> **Easiest path if you have a browser:** log into [yourshoesmells.com](https://yourshoesmells.com), open the account menu, find the **🔑 API Token** section. Click **Create**, give your token a name, copy the value, paste it into your agent. Use **Rotate** to replace it, **Revoke** to kill it. The curl flow below covers the same thing for headless setups.

**Policy:** each account has at most **one active token at a time.** If you already have one, `POST /api/auth/tokens` returns `409 { "error": "token_exists" }` — use `POST /api/auth/tokens/rotate` to replace it, or revoke first.

This guide walks through the token flow end to end.

## 1. Create a username (and optionally set a password)

`POST /api/auth/register`

```sh
curl -X POST https://yourshoesmells.com/api/auth/register \
  -H 'content-type: application/json' \
  -d '{"username":"alice","password":"correct-horse-battery"}'
```

Body fields:

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `username` | string | yes | 3–20 chars, `[a-zA-Z0-9_-]` only. |
| `password` | string | no | If omitted, the user has no password and anyone can vote as them — fine for casual use, but you'll need a password to mint API tokens. Minimum 6 chars if provided. |

Response (200):
```json
{ "ok": true, "user_id": "…uuid…", "username": "alice", "message": "..." }
```

If the username already exists with a different password you get `401`; with no password and you pass one, the password is set; with a matching password you're "logged in" — all return 200 in their own way. See [api.md](./api.md#post-apiauthregister) for the full matrix.

## 2. Mint an API token

`POST /api/auth/tokens`

```sh
curl -X POST https://yourshoesmells.com/api/auth/tokens \
  -H 'content-type: application/json' \
  -d '{"username":"alice","password":"correct-horse-battery","name":"laptop"}'
```

Body fields:

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `username` | string | yes | Existing user. |
| `password` | string | yes | The account's password. You can't mint a token without one. |
| `name` | string | yes | Human-readable label (≤ 64 chars). Shown in the token list. |

Response (201):
```json
{
  "id": "…uuid…",
  "name": "laptop",
  "token_prefix": "yss_live_a1b2c3d4",
  "created_at": "2026-05-13T…",
  "token": "yss_live_a1b2c3d4e5f6…"
}
```

**`token` is shown exactly once.** Store it now; the database only keeps the SHA-256 hash, so the value cannot be recovered later. If you lose it, revoke and mint a new one.

## 3. Use the token

Send it in the `Authorization` header on any write endpoint:

```sh
curl -X POST https://yourshoesmells.com/api/gyms/<gym-uuid>/vote \
  -H 'Authorization: Bearer yss_live_a1b2c3d4e5f6…' \
  -H 'content-type: application/json' \
  -d '{"smell":80,"difficulty":1}'
```

When a Bearer token is present, the server ignores any `username`/`password` fields in the body — the token already identifies the actor.

Bad/unknown/revoked tokens get `401 { "error": "invalid_token" }`. Sending no `Authorization` header is fine; the server then falls back to body credentials.

## 4. List your tokens

`GET /api/auth/tokens` (Bearer required)

```sh
curl -H 'Authorization: Bearer yss_live_…' \
  https://yourshoesmells.com/api/auth/tokens
```

Response: an array of `{ id, name, token_prefix, last_used_at, created_at }`. The raw token is never returned — only the prefix (e.g. `yss_live_a1b2c3d4`) so you can recognize entries.

## 5. Revoke a token

`DELETE /api/auth/tokens/:id` (Bearer required; the token used to authenticate may be the one being revoked or any other token on the same account)

```sh
curl -X DELETE -H 'Authorization: Bearer yss_live_…' \
  https://yourshoesmells.com/api/auth/tokens/<token-id>
```

Response: `{ "ok": true }`. After revocation, any request bearing that token returns 401.

## 6. Rotate a token

Replaces the existing active token with a new one in a single transaction. Use this when you suspect your token leaked, or when the current one is going to a different agent.

`POST /api/auth/tokens/rotate`

```sh
curl -X POST https://yourshoesmells.com/api/auth/tokens/rotate \
  -H 'content-type: application/json' \
  -d '{"username":"alice","password":"correct-horse-battery","name":"new-agent"}'
```

`name` is optional; if omitted, the new token inherits the old token's name. Response shape matches mint — the new raw token is shown once. The old token is dead the instant this call returns.

## Threat model and design notes

- Tokens are 128 bits of cryptographic randomness, hex-encoded. Server-side only the SHA-256 hash is stored; no bcrypt, because the entropy is already far above brute-force range.
- Revocation flips `revoked_at`; the partial unique index on `token_hash` allows minting a fresh token without colliding with an old one.
- A partial unique index on `(user_id) WHERE revoked_at IS NULL` keeps the "one active token per user" rule at the DB layer — a stuck retry can never produce a duplicate.
- `last_used_at` is updated fire-and-forget on each successful request so it never blocks the response.
- Per-user write rate limit: 60 requests / rolling hour, combined across vote / utility-vote / smell. See [conventions.md](./conventions.md#rate-limit) for details.
