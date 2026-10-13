# ControlPlane web

A React + Vite front end for the ControlPlane API: an **Ask** view for users and an admin console for the
ledger, spend and policy. It renders only what the API returns; nothing on the page is mocked.

| View | Calls | Who |
|---|---|---|
| Ask | `POST /ask`, `/api/models`, `/api/demo`, `/api/personas` | anyone |
| Ledger | `GET /api/evidence`, `GET /api/verify` | admin (open in persona mode) |
| Usage | `GET /api/usage` | admin (open in persona mode) |
| Models and policy | `GET /api/models`, `GET /api/policy` | anyone |

## Auth modes (discovered, not configured)

- **Persona mode** (`AUTH_MODE=persona`): `/api/personas` exists, so the page shows an "Ask as" picker and
  sends `user` in the body. Development only; the header says so.
- **Token mode** (`AUTH_MODE=oidc`): `/api/personas` is a 404, so the page shows a bearer-token field and
  never sends `user` (the server rejects it). The token is kept in `sessionStorage` for the tab only.
  A 401 asks for a token; a 403 on admin views shows the server's message.

The page never decides what a caller may see. Entitlements come from Postgres RLS on the server.

## Run it

```bash
npm install
npm run dev          # http://localhost:5173, proxies /ask /api /health to http://localhost:8000
# elsewhere:  VITE_PROXY_TARGET=http://host:8000 npm run dev
```

No stack handy? `node mock/server.mjs` stands in for the API with the same response shapes and a real
hash chain (`MOCK_AUTH=oidc` for token mode, `MOCK_DEMO=1` for hosted-demo limits, `MOCK_PORT` to move it).
`POST /__tamper` on the mock edits a ledger row so you can watch **Verify chain** fail.

## Run it against ControlPlane

The real API lives in [ControlPlane](https://github.com/Lanier-Developments/ControlPlane). Bring it up,
then start the dev server here — the proxy already points at `http://localhost:8000`:

```bash
git clone https://github.com/Lanier-Developments/ControlPlane
cd ControlPlane
cp .env.example .env     # defaults: persona auth, Ollama on localhost
make up                  # Postgres via docker compose (or up-local-llm to run Ollama in compose too)
make pull-models         # nomic-embed-text + llama3.1:8b into Ollama
make migrate ingest      # schema, then the seed corpus
make api                 # uvicorn on http://localhost:8000
```

The UI discovers the server's mode on its own: with the default `AUTH_MODE=persona` the "Ask as" picker
appears; set `AUTH_MODE=oidc` in ControlPlane's `.env` for the bearer-token flow. Leave `DEMO_MODE`
unset for unrestricted local asking — setting it to `true` restricts the instance to the canned example
questions, and the UI will say so.

## Ship it

Same origin, no CORS (recommended). Build, then mount the output in ControlPlane's `api.py`:

```bash
npm run build        # -> dist/, relative asset paths
```

```python
from fastapi.staticfiles import StaticFiles

# point this at your checkout's dist/ (or copy dist/ into the ControlPlane repo)
app.mount("/ui", StaticFiles(directory="/path/to/control-plane-web/dist", html=True), name="ui")
```

Mount it after the routes. Separate origin: build with `VITE_API_BASE=https://api.example.com` and add
`CORSMiddleware` to the API (allow the `Authorization` and `Content-Type` headers).

## Known gaps

- `/api/usage` returns totals and by-rule only. Budgets, steering and provider health live in `make usage`
  and need an endpoint before the UI can show them.
- `/api/policy` returns `rules` as the YAML dicts. The page renders their fields generically, so it keeps
  working if the rule schema changes, but it does not interpret them.
- The ledger is shown newest first, last N entries. There is no paging or filtering by principal yet.
