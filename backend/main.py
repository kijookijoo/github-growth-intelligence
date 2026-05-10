from __future__ import annotations

import os
from collections.abc import Generator
from typing import Annotated

import uvicorn
from fastapi import Depends, FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from backend.github_growth.client import GitHubApiError, GitHubHttpClient, GitHubRateLimitError
from backend.github_growth.models import RepoRef, to_jsonable
from backend.github_growth.service import GitHubGrowthService


app = FastAPI(
    title="GitHub Growth Intelligence MVP",
    version="0.1.0",
    description="Live GitHub ingestion and growth-spike analysis backend.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["GET"],
    allow_headers=["*"],
)


def get_growth_service() -> Generator[GitHubGrowthService, None, None]:
    client = GitHubHttpClient()
    try:
        yield GitHubGrowthService(client)
    finally:
        client.close()


ServiceDependency = Annotated[GitHubGrowthService, Depends(get_growth_service)]
MaxPagesQuery = Annotated[int, Query(ge=1, description="Maximum GitHub stargazer pages to fetch live.")]
WindowDaysQuery = Annotated[int, Query(ge=1, description="Baseline window size for spike detection.")]
MinZScoreQuery = Annotated[float, Query(ge=0, description="Minimum z-score required for a spike.")]
MinStarsQuery = Annotated[int, Query(ge=1, description="Minimum stars on a day required for a spike.")]
LimitQuery = Annotated[int, Query(ge=1, le=100, description="Maximum number of spikes to return.")]
LookbackDaysQuery = Annotated[int, Query(ge=1, description="Days of context to fetch before a spike.")]


@app.exception_handler(GitHubRateLimitError)
async def github_rate_limit_handler(_: Request, exc: GitHubRateLimitError) -> JSONResponse:
    return JSONResponse(
        status_code=429,
        content={
            "error": "github_rate_limited",
            "message": str(exc),
            "rate_limit": to_jsonable(exc.rate_limit),
        },
    )


@app.exception_handler(GitHubApiError)
async def github_api_error_handler(_: Request, exc: GitHubApiError) -> JSONResponse:
    status_code = exc.status_code if 400 <= exc.status_code < 600 else 502
    return JSONResponse(
        status_code=status_code,
        content={
            "error": "github_api_error",
            "message": str(exc),
            "rate_limit": to_jsonable(exc.rate_limit),
        },
    )


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/repos/{owner}/{repo}/star-history")
def get_star_history(
    owner: str,
    repo: str,
    service: ServiceDependency,
    max_pages: MaxPagesQuery = 50,
) -> object:
    return to_jsonable(service.get_star_history(RepoRef(owner=owner, name=repo), max_pages=max_pages))


@app.get("/repos/{owner}/{repo}/growth-spikes")
def get_growth_spikes(
    owner: str,
    repo: str,
    service: ServiceDependency,
    max_pages: MaxPagesQuery = 50,
    window_days: WindowDaysQuery = 14,
    min_z_score: MinZScoreQuery = 3.0,
    min_stars: MinStarsQuery = 10,
    limit: LimitQuery = 10,
) -> object:
    history, spikes = service.detect_growth_spikes(
        RepoRef(owner=owner, name=repo),
        max_pages=max_pages,
        window_days=window_days,
        min_z_score=min_z_score,
        min_stars=min_stars,
        limit=limit,
    )
    return to_jsonable({"star_history": history, "spikes": spikes})


@app.get("/repos/{owner}/{repo}/growth-profile")
def get_growth_profile(
    owner: str,
    repo: str,
    service: ServiceDependency,
    max_pages: MaxPagesQuery = 50,
    window_days: WindowDaysQuery = 14,
    min_z_score: MinZScoreQuery = 3.0,
    min_stars: MinStarsQuery = 10,
    spike_limit: LimitQuery = 5,
    include_context: bool = True,
    lookback_days: LookbackDaysQuery = 14,
) -> object:
    return to_jsonable(
        service.get_repository_growth_profile(
            RepoRef(owner=owner, name=repo),
            max_pages=max_pages,
            window_days=window_days,
            min_z_score=min_z_score,
            min_stars=min_stars,
            spike_limit=spike_limit,
            include_context=include_context,
            lookback_days=lookback_days,
        )
    )


@app.get("/")
def route_index() -> object:
    raise HTTPException(
        status_code=404,
        detail={
            "error": "not_found",
            "routes": [
                "/health",
                "/docs",
                "/repos/{owner}/{repo}/star-history",
                "/repos/{owner}/{repo}/growth-spikes",
                "/repos/{owner}/{repo}/growth-profile",
            ],
        },
    )


def main() -> None:
    host = os.getenv("HOST", "127.0.0.1")
    port = int(os.getenv("PORT", "8001"))
    uvicorn.run("backend.main:app", host=host, port=port, reload=False)


if __name__ == "__main__":
    main()
