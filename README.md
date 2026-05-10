# GitHub Growth Intelligence

Open-source growth intelligence MVP for GitHub repositories. The product reconstructs
historical star timelines from GitHub's own stargazer timestamps, detects abnormal
growth days, and fetches nearby repository activity that may explain a spike.

## Architecture

```text
GitHub API
  -> backend ingestion and transformation
  -> backend analytics services
  -> FastAPI HTTP API
  -> React UI
```

The GitHub API is the source of truth. The MVP uses live fetches and intentionally
limits stargazer pagination with `max_pages` so large repositories do not consume
thousands of API calls during exploration.

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
  main.py                  Existing MCP demo server, kept separate from GitHub layer
pyproject.toml             Python project metadata and scripts
README.md
```

## Backend

Set a GitHub token for authenticated rate limits:

```powershell
$env:GITHUB_TOKEN = "github_pat_..."
uv run python -m backend.main
```

The API defaults to:

```text
http://127.0.0.1:8001
```

Interactive docs:

```text
http://127.0.0.1:8001/docs
```

Endpoints:

```text
GET /health
GET /repos/{owner}/{repo}/star-history?max_pages=50
GET /repos/{owner}/{repo}/growth-spikes?max_pages=50&window_days=14&min_z_score=3
GET /repos/{owner}/{repo}/growth-profile?max_pages=50&include_context=true
```

Example:

```text
http://127.0.0.1:8001/repos/psf/requests/growth-profile?max_pages=5
```

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
