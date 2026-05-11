from __future__ import annotations

from dataclasses import asdict, dataclass, field
from datetime import datetime
from typing import Any, Literal


@dataclass(frozen=True)
class RepoRef:
    owner: str
    name: str

    @property
    def full_name(self) -> str:
        return f"{self.owner}/{self.name}"


@dataclass
class RateLimitSnapshot:
    limit: int | None = None
    remaining: int | None = None
    reset_epoch: int | None = None
    resource: str | None = None


@dataclass
class FetchMetadata:
    fetched_at: datetime
    complete: bool
    pages_fetched: int = 0
    estimated_total_pages: int | None = None
    reason: str | None = None
    rate_limit: RateLimitSnapshot = field(default_factory=RateLimitSnapshot)


@dataclass
class RepositoryIdentity:
    id: int
    owner: str
    name: str
    full_name: str
    default_branch: str
    stars: int
    forks: int
    open_issues: int
    created_at: datetime
    pushed_at: datetime | None
    html_url: str


@dataclass
class DailyStarPoint:
    date: str
    stars: int
    cumulative: int


@dataclass
class StarHistory:
    repo: RepoRef
    total_stars: int
    daily: list[DailyStarPoint]
    metadata: FetchMetadata
    source: Literal["github_live"] = "github_live"


@dataclass
class GrowthSpike:
    date: str
    stars: int
    baseline: float
    z_score: float
    cumulative: int
    window_days: int


@dataclass
class CommitSummary:
    sha: str
    message: str
    committed_at: datetime
    author_login: str | None
    html_url: str


@dataclass
class ReleaseSummary:
    id: int
    tag_name: str
    name: str | None
    published_at: datetime | None
    prerelease: bool
    html_url: str


@dataclass
class ReadmeChangeSummary:
    sha: str
    committed_at: datetime
    message: str
    author_login: str | None
    html_url: str


@dataclass
class SpikeContext:
    spike: GrowthSpike
    commits_before: list[CommitSummary]
    releases_before: list[ReleaseSummary]
    readme_changes_before: list[ReadmeChangeSummary]


@dataclass
class RepositoryGrowthProfile:
    repository: RepositoryIdentity
    star_history: StarHistory
    spikes: list[GrowthSpike]
    contexts: list[SpikeContext]


def to_jsonable(value: Any) -> Any:
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, list):
        return [to_jsonable(item) for item in value]
    if isinstance(value, dict):
        return {key: to_jsonable(item) for key, item in value.items()}
    if hasattr(value, "__dataclass_fields__"):
        return to_jsonable(asdict(value))
    return value