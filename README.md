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
cd web
npm install
npm run dev          # http://localhost:5173, proxies /ask /api /health to http://localhost:8000
# elsewhere:  VITE_PROXY_TARGET=http://host:8000 npm run dev
```

No stack handy? `node mock/server.mjs` stands in for the API with the same response shapes and a real
hash chain (`MOCK_AUTH=oidc` for token mode, `MOCK_DEMO=1` for hosted-demo limits, `MOCK_PORT` to move it).
`POST /__tamper` on the mock edits a ledger row so you can watch **Verify chain** fail.

## Ship it

Same origin, no CORS (recommended). Build, then mount beside the existing console in `api.py`:

```bash
npm run build        # -> web/dist, relative asset paths
```

```python
from fastapi.staticfiles import StaticFiles
from pathlib import Path

app.mount("/ui", StaticFiles(directory=Path(__file__).parents[2] / "web" / "dist", html=True), name="ui")
```

Mount it after the routes. Separate origin: build with `VITE_API_BASE=https://api.example.com` and add
`CORSMiddleware` to the API (allow the `Authorization` and `Content-Type` headers).

## Known gaps

- `/api/usage` returns totals and by-rule only. Budgets, steering and provider health live in `make usage`
  and need an endpoint before the UI can show them.
- `/api/policy` returns `rules` as the YAML dicts. The page renders their fields generically, so it keeps
  working if the rule schema changes, but it does not interpret them.
- The ledger is shown newest first, last N entries. There is no paging or filtering by principal yet.
