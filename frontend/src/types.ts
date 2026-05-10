export type DailyStarPoint = {
  date: string;
  stars: number;
  cumulative: number;
};

export type FetchMetadata = {
  fetched_at: string;
  complete: boolean;
  pages_fetched: number;
  estimated_total_pages: number | null;
  reason: string | null;
  rate_limit: {
    limit: number | null;
    remaining: number | null;
    reset_epoch: number | null;
    resource: string | null;
  };
};

export type StarHistory = {
  repo: {
    owner: string;
    name: string;
  };
  total_stars: number;
  daily: DailyStarPoint[];
  metadata: FetchMetadata;
  source: string;
};

export type GrowthSpike = {
  date: string;
  stars: number;
  baseline: number;
  z_score: number;
  cumulative: number;
  window_days: number;
};

export type RepositoryIdentity = {
  id: number;
  owner: string;
  name: string;
  full_name: string;
  default_branch: string;
  stars: number;
  forks: number;
  open_issues: number;
  created_at: string;
  pushed_at: string | null;
  html_url: string;
};

export type CommitSummary = {
  sha: string;
  message: string;
  committed_at: string;
  author_login: string | null;
  html_url: string;
};

export type ReleaseSummary = {
  id: number;
  tag_name: string;
  name: string | null;
  published_at: string | null;
  prerelease: boolean;
  html_url: string;
};

export type ReadmeChangeSummary = {
  sha: string;
  committed_at: string;
  message: string;
  author_login: string | null;
  html_url: string;
};

export type SpikeContext = {
  spike: GrowthSpike;
  commits_before: CommitSummary[];
  releases_before: ReleaseSummary[];
  readme_changes_before: ReadmeChangeSummary[];
};

export type GrowthProfile = {
  repository: RepositoryIdentity;
  star_history: StarHistory;
  spikes: GrowthSpike[];
  contexts: SpikeContext[];
};

export type GrowthSpikesResponse = {
  star_history: StarHistory;
  spikes: GrowthSpike[];
};
