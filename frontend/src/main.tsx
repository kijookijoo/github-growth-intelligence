import React, { useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  AlertCircle,
  BarChart3,
  CheckCircle2,
  ExternalLink,
  GitCommitHorizontal,
  Github,
  Loader2,
  RefreshCw,
  Rocket,
  Search,
  Star,
} from "lucide-react";
import type {
  DailyStarPoint,
  GrowthProfile,
  GrowthSpike,
  GrowthSpikesResponse,
  SpikeContext,
  StarHistory,
} from "./types";
import "./styles.css";

type FetchMode = "profile" | "star-history" | "growth-spikes";
type ResultState =
  | { kind: "profile"; data: GrowthProfile }
  | { kind: "star-history"; data: StarHistory }
  | { kind: "growth-spikes"; data: GrowthSpikesResponse };

const DEFAULT_API_BASE = "http://127.0.0.1:8001";

function App() {
  const [apiBase, setApiBase] = useState(DEFAULT_API_BASE);
  const [owner, setOwner] = useState("psf");
  const [repo, setRepo] = useState("requests");
  const [mode, setMode] = useState<FetchMode>("profile");
  const [maxPages, setMaxPages] = useState(5);
  const [includeContext, setIncludeContext] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ResultState | null>(null);

  const endpoint = useMemo(() => {
    const cleanBase = apiBase.replace(/\/$/, "");
    const path = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/${mode}`;
    const params = new URLSearchParams({
      max_pages: String(maxPages),
    });
    if (mode === "profile") {
      params.set("include_context", String(includeContext));
    }
    return `${cleanBase}${path}?${params.toString()}`;
  }, [apiBase, owner, repo, mode, maxPages, includeContext]);

  async function fetchData(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setIsLoading(true);
    try {
      const response = await fetch(endpoint);
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.message || payload.detail?.error || `HTTP ${response.status}`);
      }
      setResult({ kind: mode, data: payload });
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : "Request failed");
    } finally {
      setIsLoading(false);
    }
  }

  const starHistory = getStarHistory(result);
  const spikes = getSpikes(result);
  const contexts = result?.kind === "profile" ? result.data.contexts : [];

  return (
    <main className="app-shell">
      <section className="topbar">
        <div>
          <div className="product-mark">
            <Github size={22} aria-hidden="true" />
            <span>GitHub Growth Intelligence</span>
          </div>
          <h1>Repository Growth Explorer</h1>
        </div>
        <a className="docs-link" href={`${apiBase.replace(/\/$/, "")}/docs`} target="_blank" rel="noreferrer">
          API Docs
          <ExternalLink size={16} aria-hidden="true" />
        </a>
      </section>

      <section className="workspace">
        <form className="controls" onSubmit={fetchData}>
          <Field label="Backend URL">
            <input value={apiBase} onChange={(event) => setApiBase(event.target.value)} spellCheck={false} />
          </Field>

          <div className="repo-grid">
            <Field label="Owner">
              <input value={owner} onChange={(event) => setOwner(event.target.value)} spellCheck={false} />
            </Field>
            <Field label="Repository">
              <input value={repo} onChange={(event) => setRepo(event.target.value)} spellCheck={false} />
            </Field>
          </div>

          <Field label="Dataset">
            <div className="segmented">
              <SegmentButton active={mode === "profile"} onClick={() => setMode("profile")}>
                Profile
              </SegmentButton>
              <SegmentButton active={mode === "star-history"} onClick={() => setMode("star-history")}>
                Stars
              </SegmentButton>
              <SegmentButton active={mode === "growth-spikes"} onClick={() => setMode("growth-spikes")}>
                Spikes
              </SegmentButton>
            </div>
          </Field>

          <div className="repo-grid">
            <Field label="Max pages">
              <input
                type="number"
                min={1}
                max={200}
                value={maxPages}
                onChange={(event) => setMaxPages(Number(event.target.value))}
              />
            </Field>
            <label className={`check-row ${mode !== "profile" ? "disabled" : ""}`}>
              <input
                type="checkbox"
                checked={includeContext}
                disabled={mode !== "profile"}
                onChange={(event) => setIncludeContext(event.target.checked)}
              />
              <span>Fetch spike context</span>
            </label>
          </div>

          <button className="primary-action" type="submit" disabled={isLoading || !owner || !repo}>
            {isLoading ? <Loader2 className="spin" size={18} aria-hidden="true" /> : <Search size={18} aria-hidden="true" />}
            Fetch repository data
          </button>

          <div className="endpoint-box">
            <span>Request</span>
            <code>{endpoint}</code>
          </div>
        </form>

        <section className="results">
          {error && (
            <div className="notice error">
              <AlertCircle size={18} aria-hidden="true" />
              <span>{error}</span>
            </div>
          )}

          {!result && !error && (
            <div className="empty-state">
              <BarChart3 size={34} aria-hidden="true" />
              <p>Enter a repository and fetch growth data.</p>
            </div>
          )}

          {result && starHistory && (
            <>
              <SummaryStrip result={result} starHistory={starHistory} spikes={spikes} />
              <StarTimeline history={starHistory} />
              <SpikeList spikes={spikes} contexts={contexts} />
            </>
          )}
        </section>
      </section>
    </main>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}

function SegmentButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button type="button" className={active ? "active" : ""} onClick={onClick}>
      {children}
    </button>
  );
}

function SummaryStrip({
  result,
  starHistory,
  spikes,
}: {
  result: ResultState;
  starHistory: StarHistory;
  spikes: GrowthSpike[];
}) {
  const repository = result.kind === "profile" ? result.data.repository : null;
  const latest = starHistory.daily.at(-1);

  return (
    <div className="summary-grid">
      <Metric icon={<Star size={18} />} label="Stars" value={formatNumber(repository?.stars ?? starHistory.total_stars)} />
      <Metric icon={<BarChart3 size={18} />} label="Fetched days" value={formatNumber(starHistory.daily.length)} />
      <Metric icon={<Rocket size={18} />} label="Spikes" value={formatNumber(spikes.length)} />
      <Metric
        icon={starHistory.metadata.complete ? <CheckCircle2 size={18} /> : <RefreshCw size={18} />}
        label="Ingestion"
        value={starHistory.metadata.complete ? "Complete" : "Partial"}
        detail={
          latest
            ? `${formatNumber(starHistory.metadata.pages_fetched)} page(s), latest ${latest.date}`
            : `${formatNumber(starHistory.metadata.pages_fetched)} page(s)`
        }
      />
    </div>
  );
}

function Metric({
  icon,
  label,
  value,
  detail,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  detail?: string;
}) {
  return (
    <div className="metric">
      <div className="metric-icon">{icon}</div>
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
        {detail && <small>{detail}</small>}
      </div>
    </div>
  );
}

function StarTimeline({ history }: { history: StarHistory }) {
  const points = history.daily;
  const path = useMemo(() => buildSparklinePath(points), [points]);
  const maxDaily = Math.max(...points.map((point) => point.stars), 0);

  return (
    <div className="panel">
      <div className="panel-heading">
        <div>
          <h2>Star Timeline</h2>
          <p>{history.repo.owner}/{history.repo.name}</p>
        </div>
        <span className={history.metadata.complete ? "status complete" : "status partial"}>
          {history.metadata.complete ? "complete" : history.metadata.reason || "partial"}
        </span>
      </div>

      {points.length === 0 ? (
        <div className="empty-chart">No star events returned for this page limit.</div>
      ) : (
        <div className="chart-wrap">
          <svg className="chart" viewBox="0 0 600 220" role="img" aria-label="Daily star timeline">
            <defs>
              <linearGradient id="lineGradient" x1="0" x2="1" y1="0" y2="0">
                <stop offset="0%" stopColor="#2563eb" />
                <stop offset="100%" stopColor="#059669" />
              </linearGradient>
            </defs>
            <path d={path.area} className="chart-area" />
            <path d={path.line} className="chart-line" />
          </svg>
          <div className="chart-meta">
            <span>{points[0].date}</span>
            <span>Max daily stars: {formatNumber(maxDaily)}</span>
            <span>{points.at(-1)?.date}</span>
          </div>
        </div>
      )}
    </div>
  );
}

function SpikeList({ spikes, contexts }: { spikes: GrowthSpike[]; contexts: SpikeContext[] }) {
  const contextByDate = new Map(contexts.map((context) => [context.spike.date, context]));

  return (
    <div className="panel">
      <div className="panel-heading">
        <div>
          <h2>Growth Spikes</h2>
          <p>Days that exceeded the rolling baseline.</p>
        </div>
      </div>

      {spikes.length === 0 ? (
        <div className="empty-chart">No spikes found with the current parameters.</div>
      ) : (
        <div className="spike-list">
          {spikes.map((spike) => (
            <article className="spike-card" key={spike.date}>
              <div className="spike-topline">
                <div>
                  <strong>{spike.date}</strong>
                  <span>{formatNumber(spike.stars)} stars, z-score {spike.z_score}</span>
                </div>
                <span className="baseline">baseline {spike.baseline}</span>
              </div>
              <SpikeContextView context={contextByDate.get(spike.date)} />
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

function SpikeContextView({ context }: { context?: SpikeContext }) {
  if (!context) {
    return null;
  }

  return (
    <div className="context-grid">
      <ContextColumn
        icon={<GitCommitHorizontal size={16} />}
        title="Commits"
        items={context.commits_before.map((commit) => ({
          key: commit.sha,
          title: commit.message || commit.sha.slice(0, 7),
          subtitle: formatDate(commit.committed_at),
          href: commit.html_url,
        }))}
      />
      <ContextColumn
        icon={<Rocket size={16} />}
        title="Releases"
        items={context.releases_before.map((release) => ({
          key: String(release.id),
          title: release.name || release.tag_name,
          subtitle: release.published_at ? formatDate(release.published_at) : "No publish date",
          href: release.html_url,
        }))}
      />
      <ContextColumn
        icon={<Github size={16} />}
        title="README"
        items={context.readme_changes_before.map((change) => ({
          key: change.sha,
          title: change.message || change.sha.slice(0, 7),
          subtitle: formatDate(change.committed_at),
          href: change.html_url,
        }))}
      />
    </div>
  );
}

function ContextColumn({
  icon,
  title,
  items,
}: {
  icon: React.ReactNode;
  title: string;
  items: Array<{ key: string; title: string; subtitle: string; href: string }>;
}) {
  return (
    <div className="context-column">
      <h3>
        {icon}
        {title}
      </h3>
      {items.length === 0 ? (
        <p className="muted">None found.</p>
      ) : (
        <ul>
          {items.slice(0, 5).map((item) => (
            <li key={item.key}>
              <a href={item.href} target="_blank" rel="noreferrer">
                {item.title}
              </a>
              <span>{item.subtitle}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function getStarHistory(result: ResultState | null): StarHistory | null {
  if (!result) {
    return null;
  }
  if (result.kind === "profile") {
    return result.data.star_history;
  }
  if (result.kind === "growth-spikes") {
    return result.data.star_history;
  }
  return result.data;
}

function getSpikes(result: ResultState | null): GrowthSpike[] {
  if (!result || result.kind === "star-history") {
    return [];
  }
  return result.data.spikes;
}

function buildSparklinePath(points: DailyStarPoint[]) {
  if (points.length === 0) {
    return { line: "", area: "" };
  }

  const width = 600;
  const height = 220;
  const padding = 18;
  const values = points.map((point) => point.stars);
  const max = Math.max(...values, 1);
  const xStep = points.length > 1 ? (width - padding * 2) / (points.length - 1) : 0;

  const coords = values.map((value, index) => {
    const x = padding + index * xStep;
    const y = height - padding - (value / max) * (height - padding * 2);
    return [x, y] as const;
  });

  const line = coords.map(([x, y], index) => `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`).join(" ");
  const first = coords[0];
  const last = coords.at(-1) ?? first;
  const area = `${line} L ${last[0].toFixed(2)} ${height - padding} L ${first[0].toFixed(2)} ${height - padding} Z`;
  return { line, area };
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
