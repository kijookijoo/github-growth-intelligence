from __future__ import annotations

from datetime import datetime, time, timedelta, timezone

from .analytics import detect_growth_spikes
from .client import GitHubHttpClient
from .ingestion import (
    CommitTimelineIngestor,
    ReadmeTimelineIngestor,
    ReleaseTimelineIngestor,
    RepositoryIngestor,
    StarHistoryIngestor,
)
from .models import (
    GrowthSpike,
    RepoRef,
    RepositoryGrowthProfile,
    SpikeContext,
    StarHistory,
)


class GitHubGrowthService:
    def __init__(self, client: GitHubHttpClient) -> None:
        self.client = client
        self.repositories = RepositoryIngestor(client)
        self.stars = StarHistoryIngestor(client)
        self.commits = CommitTimelineIngestor(client)
        self.releases = ReleaseTimelineIngestor(client)
        self.readmes = ReadmeTimelineIngestor(client)

    def get_star_history(self, repo: RepoRef, max_pages: int = 50) -> StarHistory:
        identity, rate_limit = self.repositories.get_repository_identity(repo)
        history = self.stars.get_star_history(
            repo=RepoRef(identity.owner, identity.name),
            total_stars=identity.stars,
            max_pages=max_pages,
        )
        if history.metadata.rate_limit.limit is None:
            history.metadata.rate_limit = rate_limit
        return history

    def detect_growth_spikes(
        self,
        repo: RepoRef,
        max_pages: int = 50,
        window_days: int = 14,
        min_z_score: float = 3.0,
        min_stars: int = 10,
        limit: int = 10,
    ) -> tuple[StarHistory, list[GrowthSpike]]:
        history = self.get_star_history(repo, max_pages=max_pages)
        spikes = detect_growth_spikes(
            history.daily,
            window_days=window_days,
            min_z_score=min_z_score,
            min_stars=min_stars,
            limit=limit,
        )
        return history, spikes

    def get_context_for_spike(
        self,
        repo: RepoRef,
        spike: GrowthSpike,
        lookback_days: int = 14,
        lookahead_days: int = 1,
    ) -> SpikeContext:
        spike_day = datetime.combine(
            datetime.fromisoformat(spike.date).date(),
            time.min,
            tzinfo=timezone.utc,
        )
        since = spike_day - timedelta(days=lookback_days)
        until = spike_day + timedelta(days=lookahead_days)
        return SpikeContext(
            spike=spike,
            commits_before=self.commits.get_commits_between(repo, since=since, until=until),
            releases_before=self.releases.get_releases_between(repo, since=since, until=until),
            readme_changes_before=self.readmes.get_readme_changes_between(repo, since=since, until=until),
        )

    def get_repository_growth_profile(
        self,
        repo: RepoRef,
        max_pages: int = 50,
        window_days: int = 14,
        min_z_score: float = 3.0,
        min_stars: int = 10,
        spike_limit: int = 5,
        include_context: bool = True,
        lookback_days: int = 14,
    ) -> RepositoryGrowthProfile:
        identity, _ = self.repositories.get_repository_identity(repo)
        normalized_repo = RepoRef(identity.owner, identity.name)
        history = self.stars.get_star_history(
            repo=normalized_repo,
            total_stars=identity.stars,
            max_pages=max_pages,
        )
        spikes = detect_growth_spikes(
            history.daily,
            window_days=window_days,
            min_z_score=min_z_score,
            min_stars=min_stars,
            limit=spike_limit,
        )
        contexts = [
            self.get_context_for_spike(normalized_repo, spike, lookback_days=lookback_days)
            for spike in spikes
        ] if include_context else []
        return RepositoryGrowthProfile(
            repository=identity,
            star_history=history,
            spikes=spikes,
            contexts=contexts,
        )
