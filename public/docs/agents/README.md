# Your Shoe Smells — Agent Docs

These docs let an LLM, script, or curl user drive the Your Shoe Smells HTTP API end-to-end without reading the source.

| Doc | What it covers |
| --- | --- |
| [conventions.md](./conventions.md) | Base URL, content-type, error shape, CORS, status codes. |
| [auth.md](./auth.md) | Creating a username, setting a password, minting API tokens, using them as `Authorization: Bearer`, listing, revoking. |
| [api.md](./api.md) | Every endpoint — gyms, votes, utilities, feedback, auth — with request body, query params, and response shape. |

Start with [auth.md](./auth.md) to mint a token, then use [api.md](./api.md) as the reference.

Machine-readable entry point: [/llms.txt](/llms.txt).
