from __future__ import annotations

import os
from pathlib import Path
from typing import Any

import uvicorn
from mcp.server.fastmcp import FastMCP
from starlette.middleware.cors import CORSMiddleware
from starlette.types import ASGIApp

from backend.github_growth.client import GitHubHttpClient
from backend.github_growth.models import RepoRef, to_jsonable
from backend.github_growth.service import GitHubGrowthService


def load_dotenv(path: Path | None = None) -> None:
    env_path = path or Path(__file__).resolve().parent.parent / ".env"
    if not env_path.exists():
        return

    for raw_line in env_path.read_text(encoding="utf-8-sig").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue

        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip()
        if key.startswith("export "):
            key = key[7:].strip()
        if not key or key in os.environ:
            continue
        if len(value) >= 2 and value[0] == value[-1] and value[0] in {'"', "'"}:
            value = value[1:-1]
        os.environ[key] = value


load_dotenv()


mcp = FastMCP(
    "repocharts-github",
    instructions=(
        "Analyze public GitHub repositories for open-source growth intelligence. "
        "Tools return JSON-serializable repository identity, star history, and activity timelines."
    ),
    host=os.getenv("MCP_HOST", "127.0.0.1"),
    port=int(os.getenv("MCP_PORT", "8001")),
    streamable_http_path="/mcp",
    json_response=True,
)


def _with_service(callback: Any) -> Any:
    client = GitHubHttpClient()
    try:
        return callback(GitHubGrowthService(client))
    finally:
        client.close()


@mcp.tool()
def get_growth_signals(
    owner: str,
    repo: str,
    max_pages: int = 250,
    max_commit_pages: int = 5,
    max_activity_pages: int = 3,
) -> dict[str, Any]:
    """Fetch star growth and repository activity timelines for a GitHub repository."""

    def run(service: GitHubGrowthService) -> object:
        return service.get_growth_signals(
            RepoRef(owner=owner, name=repo),
            max_pages=max_pages,
            max_commit_pages=max_commit_pages,
            max_activity_pages=max_activity_pages,
        )

    return to_jsonable(_with_service(run))


@mcp.tool()
def get_star_history(owner: str, repo: str, max_pages: int = 50) -> dict[str, Any]:
    """Fetch daily and cumulative star history for a GitHub repository."""

    def run(service: GitHubGrowthService) -> object:
        return service.get_star_history(RepoRef(owner=owner, name=repo), max_pages=max_pages)

    return to_jsonable(_with_service(run))


@mcp.tool()
def get_growth_profile(
    owner: str,
    repo: str,
    max_pages: int = 250,
    window_days: int = 14,
    min_z_score: float = 3.0,
    min_stars: int = 10,
    spike_limit: int = 5,
    include_context: bool = True,
    lookback_days: int = 14,
) -> dict[str, Any]:
    """Fetch star history, growth spikes, and optional context around spike windows."""

    def run(service: GitHubGrowthService) -> object:
        return service.get_repository_growth_profile(
            RepoRef(owner=owner, name=repo),
            max_pages=max_pages,
            window_days=window_days,
            min_z_score=min_z_score,
            min_stars=min_stars,
            spike_limit=spike_limit,
            include_context=include_context,
            lookback_days=lookback_days,
        )

    return to_jsonable(_with_service(run))


@mcp.resource("github://repos/{owner}/{repo}/growth-signals")
def growth_signals_resource(owner: str, repo: str) -> dict[str, Any]:
    """Expose default growth signals as an MCP resource."""
    return get_growth_signals(owner, repo)


def create_app() -> ASGIApp:
    app = mcp.streamable_http_app()
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[
            "http://127.0.0.1:5173",
            "http://localhost:5173",
            "http://127.0.0.1:5180",
            "http://localhost:5180",
        ],
        allow_credentials=False,
        allow_methods=["GET", "POST", "OPTIONS"],
        allow_headers=["*"],
        expose_headers=["mcp-session-id", "mcp-protocol-version"],
    )
    return app


app = create_app()


def main() -> None:
    uvicorn.run(
        app,
        host=os.getenv("MCP_HOST", "127.0.0.1"),
        port=int(os.getenv("MCP_PORT", "8001")),
        log_level=os.getenv("MCP_LOG_LEVEL", "info"),
    )


if __name__ == "__main__":
    main()
