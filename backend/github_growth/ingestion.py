from __future__ import annotations

import math
from collections import Counter
from datetime import date, datetime, timedelta, timezone

from .client import GitHubHttpClient, now_utc, parse_github_datetime
from .models import (
    CommitSummary,
    DailyStarPoint,
    FetchMetadata,
    ReadmeChangeSummary,
    ReleaseSummary,
    RepoRef,
    RepositoryIdentity,
    StarHistory,
)


STAR_ACCEPT_HEADER = "application/vnd.github.star+json"


class RepositoryIngestor:
    def __init__(self, client: GitHubHttpClient) -> None:
        self.client = client

    def get_repository_identity(self, repo: RepoRef) -> tuple[RepositoryIdentity, object]:
        payload, rate_limit = self.client.get_json(f"/repos/{repo.owner}/{repo.name}")
        identity = RepositoryIdentity(
            id=payload["id"],
            owner=payload["owner"]["login"],
            name=payload["name"],
            full_name=payload["full_name"],
            default_branch=payload["default_branch"],
            stars=payload["stargazers_count"],
            forks=payload["forks_count"],
            open_issues=payload["open_issues_count"],
            created_at=parse_github_datetime(payload["created_at"]) or now_utc(),
            pushed_at=parse_github_datetime(payload.get("pushed_at")),
            html_url=payload["html_url"],
        )
        return identity, rate_limit


class StarHistoryIngestor:
    def __init__(self, client: GitHubHttpClient) -> None:
        self.client = client

    def get_star_history(
        self,
        repo: RepoRef,
        total_stars: int,
        max_pages: int = 50,
        per_page: int = 100,
    ) -> StarHistory:
        estimated_pages = math.ceil(total_stars / per_page) if total_stars else 0
        pages_to_fetch = min(max_pages, estimated_pages or max_pages)
        page_url: str | None = f"/repos/{repo.owner}/{repo.name}/stargazers"
        params = {"per_page": per_page, "page": 1}
        starred_dates: list[date] = []
        pages_fetched = 0
        latest_rate_limit = None
        last_page: int | None = estimated_pages or None

        while page_url and pages_fetched < pages_to_fetch:
            page = self.client.get_page(page_url, params=params, accept=STAR_ACCEPT_HEADER)
            params = None
            latest_rate_limit = page.rate_limit
            last_page = page.last_page or last_page
            pages_fetched += 1

            for item in page.data:
                starred_at = parse_github_datetime(item.get("starred_at"))
                if starred_at is not None:
                    starred_dates.append(starred_at.astimezone(timezone.utc).date())

            page_url = page.next_url

        complete = page_url is None
        reason = None if complete else "max_pages_reached"
        daily = self._to_daily_history(starred_dates)
        metadata = FetchMetadata(
            fetched_at=now_utc(),
            complete=complete,
            pages_fetched=pages_fetched,
            estimated_total_pages=last_page or estimated_pages,
            reason=reason,
            rate_limit=latest_rate_limit,
        )
        return StarHistory(repo=repo, total_stars=total_stars, daily=daily, metadata=metadata)

    def _to_daily_history(self, starred_dates: list[date]) -> list[DailyStarPoint]:
        if not starred_dates:
            return []

        counts = Counter(starred_dates)
        cursor = min(counts)
        end = max(counts)
        cumulative = 0
        points: list[DailyStarPoint] = []
        while cursor <= end:
            stars = counts[cursor]
            cumulative += stars
            points.append(
                DailyStarPoint(
                    date=cursor.isoformat(),
                    stars=stars,
                    cumulative=cumulative,
                )
            )
            cursor += timedelta(days=1)
        return points


class CommitTimelineIngestor:
    def __init__(self, client: GitHubHttpClient) -> None:
        self.client = client

    def get_commits_between(
        self,
        repo: RepoRef,
        since: datetime,
        until: datetime,
        max_pages: int = 3,
    ) -> list[CommitSummary]:
        page_url: str | None = f"/repos/{repo.owner}/{repo.name}/commits"
        params = {
            "per_page": 100,
            "since": since.astimezone(timezone.utc).isoformat().replace("+00:00", "Z"),
            "until": until.astimezone(timezone.utc).isoformat().replace("+00:00", "Z"),
        }
        commits: list[CommitSummary] = []
        pages = 0

        while page_url and pages < max_pages:
            page = self.client.get_page(page_url, params=params)
            params = None
            pages += 1
            for item in page.data:
                commit = item.get("commit", {})
                author = item.get("author") or {}
                committed_at = parse_github_datetime(
                    commit.get("committer", {}).get("date")
                    or commit.get("author", {}).get("date")
                )
                if committed_at is None:
                    continue
                commits.append(
                    CommitSummary(
                        sha=item["sha"],
                        message=(commit.get("message") or "").splitlines()[0],
                        committed_at=committed_at,
                        author_login=author.get("login"),
                        html_url=item.get("html_url", ""),
                    )
                )
            page_url = page.next_url

        return sorted(commits, key=lambda item: item.committed_at, reverse=True)


class ReleaseTimelineIngestor:
    def __init__(self, client: GitHubHttpClient) -> None:
        self.client = client

    def get_releases_between(
        self,
        repo: RepoRef,
        since: datetime,
        until: datetime,
        max_pages: int = 3,
    ) -> list[ReleaseSummary]:
        page_url: str | None = f"/repos/{repo.owner}/{repo.name}/releases"
        params = {"per_page": 100}
        releases: list[ReleaseSummary] = []
        pages = 0

        while page_url and pages < max_pages:
            page = self.client.get_page(page_url, params=params)
            params = None
            pages += 1
            for item in page.data:
                published_at = parse_github_datetime(item.get("published_at"))
                if published_at is None or published_at < since or published_at > until:
                    continue
                releases.append(
                    ReleaseSummary(
                        id=item["id"],
                        tag_name=item["tag_name"],
                        name=item.get("name"),
                        published_at=published_at,
                        prerelease=item.get("prerelease", False),
                        html_url=item.get("html_url", ""),
                    )
                )
            page_url = page.next_url

        return sorted(
            releases,
            key=lambda item: item.published_at or datetime.min.replace(tzinfo=timezone.utc),
            reverse=True,
        )


class ReadmeTimelineIngestor:
    def __init__(self, client: GitHubHttpClient) -> None:
        self.client = client

    def get_readme_changes_between(
        self,
        repo: RepoRef,
        since: datetime,
        until: datetime,
        max_pages: int = 2,
    ) -> list[ReadmeChangeSummary]:
        page_url: str | None = f"/repos/{repo.owner}/{repo.name}/commits"
        params = {
            "per_page": 100,
            "path": "README.md",
            "since": since.astimezone(timezone.utc).isoformat().replace("+00:00", "Z"),
            "until": until.astimezone(timezone.utc).isoformat().replace("+00:00", "Z"),
        }
        changes: list[ReadmeChangeSummary] = []
        pages = 0

        while page_url and pages < max_pages:
            page = self.client.get_page(page_url, params=params)
            params = None
            pages += 1
            for item in page.data:
                commit = item.get("commit", {})
                author = item.get("author") or {}
                committed_at = parse_github_datetime(
                    commit.get("committer", {}).get("date")
                    or commit.get("author", {}).get("date")
                )
                if committed_at is None:
                    continue
                changes.append(
                    ReadmeChangeSummary(
                        sha=item["sha"],
                        committed_at=committed_at,
                        message=(commit.get("message") or "").splitlines()[0],
                        author_login=author.get("login"),
                        html_url=item.get("html_url", ""),
                    )
                )
            page_url = page.next_url

        return sorted(changes, key=lambda item: item.committed_at, reverse=True)
