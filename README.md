# RepoCharts

Open-source growth intelligence MVP for GitHub repositories. The product reconstructs
historical star timelines from GitHub's own stargazer timestamps, detects abnormal
growth days, and fetches nearby repository activity that may explain a spike.

## Architecture

```text
GitHub API
  -> backend ingestion and transformation
  -> backend analytics services
  -> GitHub MCP server over Streamable HTTP
  -> React UI MCP client
```

The GitHub API is the source of truth. The MVP uses live fetches and intentionally
limits stargazer pagination with `max_pages` so large repositories do not consume
thousands of API calls during exploration. For partial results, RepoCharts fetches
the newest available stargazer pages and anchors cumulative counts against the
repository's current star total.

## Repository Layout

```text
backend/
  main.py                  FastAPI app and HTTP routes
  github_growth/           GitHub client, ingestion, models, analytics, services
  tests/                   Backend unit tests
frontend/
  src/                     React UI
  package.json             Frontend scripts and dependencies
mcp_server/
  main.py                  GitHub MCP server for RepoCharts
pyproject.toml             Python project metadata and scripts
README.md
```

## GitHub MCP Server

Set a GitHub token for authenticated rate limits:

```powershell
$env:GITHUB_TOKEN = "github_pat_..."
uv run python -m mcp_server.main
```

The MCP server defaults to:

```text
http://127.0.0.1:8002/mcp
```

Available MCP tools:

```text
get_growth_signals
get_star_history
get_growth_profile
```

`get_growth_signals` defaults to requesting up to 250 stargazer pages, then caps
the actual page count from the current GitHub rate-limit budget. The cap keeps an
8-request safety buffer and reserves roughly 25% of the remaining budget for
activity overlays. With unauthenticated GitHub's 60 requests/hour, that usually
means about 35-40 recent stargazer pages plus a small activity sample. With an
authenticated token, it can return the full requested 250-page window when quota
is available.

If this machine has local certificate-chain issues when calling GitHub, use:

```powershell
$env:GITHUB_SSL_VERIFY = "false"
uv run python -m mcp_server.main
```

The legacy FastAPI backend remains available for development, but the frontend now
uses the MCP server instead of REST endpoints.


## Frontend

Install dependencies and run the React UI:

```powershell
cd frontend
npm install
npm run dev
```

The UI defaults to:

```text
http://127.0.0.1:5173
```

The frontend calls:

```text
http://127.0.0.1:8002/mcp
```

If npm fails on this machine with local certificate verification errors, install with:

```powershell
npm install --strict-ssl=false
```

## Development Checks

Backend tests:

```powershell
uv run python -m unittest discover -s backend/tests
```

Python compile check:

```powershell
uv run python -m compileall backend mcp_server
```

Frontend production build:

```powershell
cd frontend
npm run build
```

## MVP Notes

- Star history is reconstructed from GitHub stargazer events using the special
  stargazer media type that includes `starred_at`.
- Daily star counts are aggregated into a cumulative growth timeline.
- Spike detection uses a rolling baseline and z-score threshold.
- Spike context currently includes commits, releases, and README changes near the
  spike window.
- Production should add persistent caching, background ingestion jobs, incremental
  updates, and periodic reconciliation for large repositories.
