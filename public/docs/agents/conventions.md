# Conventions

## Base URL

- Production: `https://yourshoesmells.com`
- Local dev (Express): `http://localhost:3000`
- Local dev (Vite): `http://localhost:5173` (proxies `/api/*` and `/config` to `:3000`)

All API paths in [api.md](./api.md) are relative to this base.

## Content type

Every POST and DELETE request that takes a body must use `Content-Type: application/json`. Responses are always JSON.

## Authentication

Two paths are accepted on write endpoints. Reads are open and require neither.

1. **Bearer token (preferred for agents/scripts):**

   ```
   Authorization: Bearer yss_live_<32 hex chars>
   ```

   See [auth.md](./auth.md) for how to mint one.

2. **Body credentials (preferred for the browser app):** include `username` (and `password`, if the user has one set) in the JSON body. See per-endpoint docs.

If an `Authorization` header is present but malformed, unknown, or revoked, the server responds `401 { "error": "invalid_token" }`. If the header is absent, the body-credential path is tried instead.

## Error shape

All errors return JSON `{ "error": "<machine-readable code or message>" }`. Common codes:

| Status | Typical `error` | Meaning |
| --- | --- | --- |
| `400` | `username is required`, `smell must be 0..100`, ... | Validation failure. |
| `401` | `invalid_token`, `Invalid username or password`, `Password required for this account` | Auth failure. |
| `404` | `Gym not found`, `not_found` | Resource not found. |
| `409` | `You have already voted for this gym` | Unique-constraint conflict. |
| `500` | `server_error` | Unexpected server error. |

Successful responses do not have an `error` field. Many endpoints return `{ "ok": true, ... }`.

## CORS

The API serves `Access-Control-Allow-Origin: *` and explicitly allows the `Authorization` and `Content-Type` headers, so browser-side fetches with bearer tokens work cross-origin.

## IDs

All entity IDs (`gym_id`, `user_id`, `token id`) are UUIDs.
