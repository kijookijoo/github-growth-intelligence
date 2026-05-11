import React, { useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import ReactECharts from "echarts-for-react";
import type { EChartsOption } from "echarts";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertCircle,
  BarChart3,
  BookOpenText,
  CheckCircle2,
  GitCommitHorizontal,
  Github,
  GitPullRequest,
  Loader2,
  Search,
  Star,
  Tag,
} from "lucide-react";
import type {
  DailyCommitPoint,
  DailyPullRequestPoint,
  DailyReadmeChangePoint,
  DailyReleasePoint,
  DailyStarPoint,
  GrowthSignals,
} from "./types";
import "./styles.css";

const DEFAULT_MCP_URL = "http://127.0.0.1:8001/mcp";
const MCP_PROTOCOL_VERSION = "2025-11-25";

const EASE = [0.22, 1, 0.36, 1] as const;

const fadeUp = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: EASE } },
  exit: { opacity: 0, y: -8, transition: { duration: 0.25, ease: EASE } },
};

const stagger = {
  visible: { transition: { staggerChildren: 0.06, delayChildren: 0.05 } },
};

function App() {
  const [owner, setOwner] = useState("psf");
  const [repo, setRepo] = useState("requests");
  const [repoUrl, setRepoUrl] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signals, setSignals] = useState<GrowthSignals | null>(null);

  async function fetchData(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const parsedRepo = repoUrl.trim() ? parseGitHubRepository(repoUrl) : { owner, repo };
      if (!parsedRepo) {
        throw new Error("Enter a GitHub repository URL like https://github.com/owner/repo.");
      }

      const nextOwner = parsedRepo.owner.trim();
      const nextRepo = parsedRepo.repo.trim();
      if (!nextOwner || !nextRepo) {
        throw new Error("Enter a repository owner and name.");
      }

      setOwner(nextOwner);
      setRepo(nextRepo);

      const payload = await callMcpTool<GrowthSignals>("get_growth_signals", {
        owner: nextOwner,
        repo: nextRepo,
        max_pages: 250,
        max_commit_pages: 5,
        max_activity_pages: 3,
      });
      setSignals(payload);
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : "Request failed");
      setSignals(null);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <main className="app-shell">
      <section className="hero">
        <nav className="hero-nav">
          <div className="brand-mark">
            <span className="brand-icon">
              <Github size={16} aria-hidden="true" strokeWidth={1.6} />
            </span>
            <span>RepoCharts</span>
          </div>
        </nav>

        <motion.div
          className="hero-content"
          initial="hidden"
          animate="visible"
          variants={stagger}
        >
          <motion.div className="hero-copy" variants={fadeUp}>
            <span className="hero-kicker">Open source growth intelligence</span>
            <h1>RepoCharts.</h1>
            <p>
              Learn from successful, high-traffic open source projects by connecting star growth
              to the work behind it — commits, README updates, pull requests, and releases.
            </p>
          </motion.div>

          <motion.form
            className="lookup-panel"
            onSubmit={fetchData}
            variants={fadeUp}
          >
            <Field label="Repository URL">
              <input
                value={repoUrl}
                onChange={(event) => setRepoUrl(event.target.value)}
                placeholder="https://github.com/owner/repo"
                spellCheck={false}
              />
            </Field>

            <div className="lookup-divider">
              <span>or</span>
            </div>

            <div className="repo-grid">
              <Field label="Owner">
                <input
                  value={owner}
                  onChange={(event) => {
                    setOwner(event.target.value);
                    setRepoUrl("");
                  }}
                  spellCheck={false}
                />
              </Field>
              <Field label="Repository">
                <input
                  value={repo}
                  onChange={(event) => {
                    setRepo(event.target.value);
                    setRepoUrl("");
                  }}
                  spellCheck={false}
                />
              </Field>
            </div>

            <motion.button
              className="primary-action"
              type="submit"
              disabled={isLoading || (!repoUrl.trim() && (!owner || !repo))}
              whileHover={{ y: -1 }}
              whileTap={{ scale: 0.985 }}
              transition={{ duration: 0.18, ease: EASE }}
            >
              {isLoading ? (
                <Loader2 className="spin" size={16} aria-hidden="true" strokeWidth={1.8} />
              ) : (
                <Search size={16} aria-hidden="true" strokeWidth={1.8} />
              )}
              {isLoading ? "Looking up" : "Look up repository"}
            </motion.button>
          </motion.form>
        </motion.div>
      </section>

      <section className="dashboard" aria-label="Repository star trend results">
        <section className="results">
          <AnimatePresence mode="wait" initial={false}>
            {error && (
              <motion.div
                key="error"
                className="notice error"
                variants={fadeUp}
                initial="hidden"
                animate="visible"
                exit="exit"
              >
                <AlertCircle size={16} aria-hidden="true" strokeWidth={1.6} />
                <span>{error}</span>
              </motion.div>
            )}

            {!signals && !error && (
              <motion.div
                key="empty"
                className="empty-state"
                variants={fadeUp}
                initial="hidden"
                animate="visible"
                exit="exit"
              >
                <BarChart3 size={28} aria-hidden="true" strokeWidth={1.2} />
                <p>Search a repository to see what helped it earn attention.</p>
              </motion.div>
            )}

            {signals && (
              <motion.div
                key={`signals-${signals.star_history.repo.owner}/${signals.star_history.repo.name}`}
                style={{ display: "grid", gap: 24 }}
                variants={stagger}
                initial="hidden"
                animate="visible"
                exit="exit"
              >
                <SummaryStrip signals={signals} />
                <StarTrend signals={signals} />
              </motion.div>
            )}
          </AnimatePresence>
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

function SummaryStrip({ signals }: { signals: GrowthSignals }) {
  const history = signals.star_history;
  const first = history.daily[0];
  const latest = history.daily.at(-1);
  const totalCommits = sumMetric(signals.commit_frequency, "commits");
  const totalReadmeChanges = sumMetric(signals.readme_change_frequency, "readme_changes");
  const totalPullRequests = sumMetric(signals.pull_request_frequency, "pull_requests");
  const totalReleases = sumMetric(signals.release_frequency, "releases");
  const rangeDays = first && latest ? getInclusiveDayCount(first.date, latest.date) : null;
  const rangeLabel =
    first && latest ? `${formatDateShort(first.date)} → ${formatDateShort(latest.date)}` : "No data";

  return (
    <motion.section
      className="overview-panel"
      aria-label="Repository metrics"
      variants={fadeUp}
    >
      <div className="overview-header">
        <div>
          <span className="eyebrow">Repository</span>
          <h2>
            {history.repo.owner}/{history.repo.name}
          </h2>
        </div>
      </div>

      <motion.div className="overview-main" variants={stagger}>
        <Metric
          accent="primary"
          icon={<Star size={14} strokeWidth={1.6} />}
          label="Total stars"
          value={formatNumber(history.total_stars)}
          detail={`${formatNumber(history.metadata.pages_fetched)} GitHub page(s) fetched`}
        />
        <Metric
          icon={<CheckCircle2 size={14} strokeWidth={1.6} />}
          label="Observed range"
          value={rangeLabel}
          detail={rangeDays !== null ? `${formatNumber(rangeDays)} day window` : undefined}
        />
      </motion.div>

      <motion.div className="activity-grid" variants={stagger} aria-label="Activity metrics">
        <Metric
          icon={<GitCommitHorizontal size={14} strokeWidth={1.6} />}
          label="Commits"
          value={formatNumber(totalCommits)}
        />
        <Metric
          icon={<BookOpenText size={14} strokeWidth={1.6} />}
          label="README"
          value={formatNumber(totalReadmeChanges)}
        />
        <Metric
          icon={<GitPullRequest size={14} strokeWidth={1.6} />}
          label="Pull requests"
          value={formatNumber(totalPullRequests)}
        />
        <Metric
          icon={<Tag size={14} strokeWidth={1.6} />}
          label="Releases"
          value={formatNumber(totalReleases)}
        />
      </motion.div>
    </motion.section>
  );
}

function Metric({
  icon,
  label,
  value,
  detail,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  detail?: string;
  accent?: "primary";
}) {
  return (
    <motion.div
      className={`metric ${accent === "primary" ? "metric-primary" : ""}`}
      variants={fadeUp}
    >
      <div className="metric-head">
        {icon}
        <span>{label}</span>
      </div>
      <strong>{value}</strong>
      {detail && <small>{detail}</small>}
    </motion.div>
  );
}

function StarTrend({ signals }: { signals: GrowthSignals }) {
  const history = signals.star_history;
  const points = history.daily;
  const option = useMemo(
    () =>
      buildTrendOption(points, {
        commitFrequency: signals.commit_frequency,
        readmeChangeFrequency: signals.readme_change_frequency,
        pullRequestFrequency: signals.pull_request_frequency,
        releaseFrequency: signals.release_frequency,
      }),
    [
      points,
      signals.commit_frequency,
      signals.pull_request_frequency,
      signals.readme_change_frequency,
      signals.release_frequency,
    ],
  );

  const handleChartClick = (params: any) => {
    if (params.seriesType === "bar" && params.dataIndex !== undefined) {
      const date = points[params.dataIndex]?.date;
      const seriesName = params.seriesName;
      if (date && ["Commits", "Pull requests", "README changes", "Releases"].includes(seriesName)) {
        const repoUrl = `https://github.com/${history.repo.owner}/${history.repo.name}`;
        const nextDay = new Date(`${date}T00:00:00Z`);
        nextDay.setDate(nextDay.getDate() + 1);
        const until = nextDay.toISOString().split("T")[0];
        window.open(`${repoUrl}/commits?since=${date}T00:00:00Z&until=${until}T00:00:00Z`, "_blank");
      }
    }
  };

  return (
    <motion.div className="panel" variants={fadeUp}>
      <div className="panel-heading">
        <div>
          <h2>Stars & activity</h2>
          <p>
            {history.repo.owner}/{history.repo.name}
          </p>
        </div>
        <span className={history.metadata.complete ? "status complete" : "status partial"}>
          {history.metadata.complete ? "complete" : history.metadata.reason || "partial"}
        </span>
      </div>

      {points.length === 0 ? (
        <div className="empty-chart">No star events returned.</div>
      ) : (
        <div className="chart-wrap">
          <ReactECharts
            className="chart"
            option={option}
            notMerge
            lazyUpdate
            onChartClick={handleChartClick}
            style={{ cursor: "pointer" }}
          />
          <div className="chart-meta">
            <span>{formatDateShort(points[0].date)}</span>
            <span>Cumulative stars · activity overlay · Click bars to explore</span>
            <span>{points.at(-1) ? formatDateShort(points.at(-1)!.date) : ""}</span>
          </div>
        </div>
      )}
    </motion.div>
  );
}

type ActivityFrequency = {
  commitFrequency: DailyCommitPoint[];
  readmeChangeFrequency: DailyReadmeChangePoint[];
  pullRequestFrequency: DailyPullRequestPoint[];
  releaseFrequency: DailyReleasePoint[];
};

function buildTrendOption(points: DailyStarPoint[], activity: ActivityFrequency): EChartsOption {
  const dates = points.map((point) => point.date);
  const commitsByDate = new Map(activity.commitFrequency.map((point) => [point.date, point.commits]));
  const readmeChangesByDate = new Map(
    activity.readmeChangeFrequency.map((point) => [point.date, point.readme_changes]),
  );
  const pullRequestsByDate = new Map(
    activity.pullRequestFrequency.map((point) => [point.date, point.pull_requests]),
  );
  const releasesByDate = new Map(activity.releaseFrequency.map((point) => [point.date, point.releases]));

  const mono = '"JetBrains Mono", ui-monospace, monospace';
  const sans = 'Inter, system-ui, sans-serif';

  const colors = {
    commits: "#3b82f6",
    pullRequests: "#ef4444",
    readme: "#10b981",
    releases: "#f59e0b",
    stars: "#0a0a0a",
  };

  return {
    color: [colors.commits, colors.pullRequests, colors.readme, colors.releases, colors.stars],
    textStyle: { fontFamily: sans },
    grid: { left: 56, right: 36, top: 56, bottom: 56 },
    legend: {
      top: 0,
      right: 0,
      icon: "square",
      itemWidth: 14,
      itemHeight: 14,
      itemGap: 18,
      selected: {
        "README changes": false,
        Releases: false,
      },
      textStyle: {
        color: "#525252",
        fontWeight: 500,
        fontSize: 12,
        fontFamily: sans,
      },
    },
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "line", lineStyle: { color: "#0a0a0a", width: 1, type: "dashed" } },
      backgroundColor: "#0a0a0a",
      borderWidth: 0,
      padding: [10, 12],
      textStyle: { color: "#ffffff", fontFamily: mono, fontSize: 11, fontWeight: 400 },
      valueFormatter: (value) => formatNumber(Number(value)),
      formatter: (params: any) => {
        if (!Array.isArray(params)) return "";
        const hasClickableBar = params.some(
          (p: any) => p.seriesType === "bar" && ["Commits", "Pull requests", "README changes", "Releases"].includes(p.seriesName)
        );
        let tooltip = params
          .map((p: any) => `<div>${p.marker} ${p.seriesName}: ${p.value}</div>`)
          .join("");
        if (hasClickableBar) {
          tooltip += `<div style="margin-top: 6px; font-size: 10px; opacity: 0.8;">Click bar to view commits</div>`;
        }
        return `<div>${tooltip}</div>`;
      },
    },
    dataZoom: [
      { type: "inside", throttle: 50 },
      {
        type: "slider",
        height: 16,
        bottom: 0,
        borderColor: "transparent",
        backgroundColor: "#fafafa",
        fillerColor: "rgba(10, 10, 10, 0.08)",
        handleStyle: { color: "#0a0a0a", borderColor: "#0a0a0a" },
        moveHandleStyle: { color: "#0a0a0a", opacity: 0.6 },
        emphasis: { handleStyle: { borderColor: "#0a0a0a" } },
        handleSize: "100%",
        handleIcon: "M-1,0 a1,1 0 1,0 2,0 a1,1 0 1,0 -2,0",
        showDetail: false,
        textStyle: { color: "transparent" },
      },
    ],
    xAxis: {
      type: "category",
      data: dates,
      boundaryGap: false,
      axisLabel: { color: "#737373", hideOverlap: true, fontFamily: mono, fontSize: 10 },
      axisLine: { lineStyle: { color: "#ebebeb" } },
      axisTick: { lineStyle: { color: "#ebebeb" } },
    },
    yAxis: [
      {
        type: "value",
        name: "STARS",
        nameTextStyle: { color: "#a3a3a3", fontWeight: 500, fontSize: 10, fontFamily: sans, padding: [0, 0, 6, 0] },
        nameGap: 14,
        axisLabel: { color: "#737373", fontFamily: mono, fontSize: 10 },
        splitLine: { lineStyle: { color: "#f4f4f4" } },
      },
      {
        type: "value",
        name: "ACTIVITY",
        nameTextStyle: { color: "#a3a3a3", fontWeight: 500, fontSize: 10, fontFamily: sans, padding: [0, 0, 6, 0] },
        nameGap: 14,
        axisLabel: { color: "#737373", fontFamily: mono, fontSize: 10 },
        splitLine: { show: false },
      },
    ],
    series: [
      {
        name: "Commits",
        type: "bar",
        yAxisIndex: 1,
        data: dates.map((date) => commitsByDate.get(date) ?? 0),
        barMaxWidth: 8,
        itemStyle: { color: colors.commits },
        emphasis: { focus: "series", itemStyle: { color: colors.commits, opacity: 0.7 } },
      },
      {
        name: "Pull requests",
        type: "bar",
        yAxisIndex: 1,
        data: dates.map((date) => pullRequestsByDate.get(date) ?? 0),
        barMaxWidth: 8,
        itemStyle: { color: colors.pullRequests },
        emphasis: { focus: "series", itemStyle: { color: colors.pullRequests, opacity: 0.7 } },
      },
      {
        name: "README changes",
        type: "bar",
        yAxisIndex: 1,
        data: dates.map((date) => readmeChangesByDate.get(date) ?? 0),
        barMaxWidth: 8,
        itemStyle: { color: colors.readme },
        emphasis: { focus: "series", itemStyle: { color: colors.readme, opacity: 0.7 } },
      },
      {
        name: "Releases",
        type: "bar",
        yAxisIndex: 1,
        data: dates.map((date) => releasesByDate.get(date) ?? 0),
        barMaxWidth: 8,
        itemStyle: { color: colors.releases },
        emphasis: { focus: "series", itemStyle: { color: colors.releases, opacity: 0.7 } },
      },
      {
        name: "Stars",
        type: "line",
        yAxisIndex: 0,
        data: points.map((point) => point.cumulative),
        smooth: true,
        showSymbol: false,
        lineStyle: { width: 1.5, color: colors.stars },
        areaStyle: {
          color: {
            type: "linear",
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: "rgba(10, 10, 10, 0.12)" },
              { offset: 1, color: "rgba(10, 10, 10, 0)" },
            ],
          },
        },
        emphasis: { focus: "series" },
        z: 4,
      },
    ],
  };
}

function parseGitHubRepository(value: string): { owner: string; repo: string } | null {
  const input = value.trim();
  const sshMatch = input.match(/^git@github\.com:([^/\s]+)\/([^/\s]+?)(?:\.git)?$/i);
  if (sshMatch) {
    return { owner: sshMatch[1], repo: cleanRepoName(sshMatch[2]) };
  }

  const normalized = /^https?:\/\//i.test(input) ? input : `https://${input}`;
  try {
    const url = new URL(normalized);
    if (url.hostname.toLowerCase() !== "github.com") {
      return null;
    }
    const [owner, repo] = url.pathname.split("/").filter(Boolean);
    if (!owner || !repo) {
      return null;
    }
    return { owner, repo: cleanRepoName(repo) };
  } catch {
    return null;
  }
}

function cleanRepoName(value: string) {
  return value.replace(/\.git$/i, "");
}

async function callMcpTool<T>(name: string, args: Record<string, unknown>): Promise<T> {
  const session = await createMcpSession();
  const response = await mcpRequest(session, {
    jsonrpc: "2.0",
    id: crypto.randomUUID(),
    method: "tools/call",
    params: {
      name,
      arguments: args,
    },
  });

  if (response.error) {
    throw new Error(response.error.message || "MCP tool call failed");
  }

  const result = response.result;
  if (result?.isError) {
    const message = readMcpTextContent(result) || "MCP tool returned an error";
    throw new Error(message);
  }

  if (result?.structuredContent) {
    return result.structuredContent as T;
  }

  const text = readMcpTextContent(result);
  if (!text) {
    throw new Error("MCP tool returned an empty response");
  }
  return JSON.parse(text) as T;
}

type McpSession = {
  sessionId: string | null;
  protocolVersion: string;
};

type McpResponse = {
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
};

async function createMcpSession(): Promise<McpSession> {
  const response = await mcpRequest(
    { sessionId: null, protocolVersion: MCP_PROTOCOL_VERSION },
    {
      jsonrpc: "2.0",
      id: crypto.randomUUID(),
      method: "initialize",
      params: {
        protocolVersion: MCP_PROTOCOL_VERSION,
        capabilities: {},
        clientInfo: {
          name: "repocharts-web",
          version: "0.1.0",
        },
      },
    },
  );

  if (response.error) {
    throw new Error(response.error.message || "MCP initialization failed");
  }

  const session = {
    sessionId: response.__sessionId ?? null,
    protocolVersion: response.result?.protocolVersion ?? MCP_PROTOCOL_VERSION,
  };

  await mcpNotify(session, {
    jsonrpc: "2.0",
    method: "notifications/initialized",
    params: {},
  });

  return session;
}

async function mcpNotify(session: McpSession, payload: Record<string, unknown>): Promise<void> {
  await fetch(DEFAULT_MCP_URL, {
    method: "POST",
    headers: buildMcpHeaders(session),
    body: JSON.stringify(payload),
  });
}

async function mcpRequest(
  session: McpSession,
  payload: Record<string, unknown>,
): Promise<McpResponse & { __sessionId?: string | null }> {
  const response = await fetch(DEFAULT_MCP_URL, {
    method: "POST",
    headers: buildMcpHeaders(session),
    body: JSON.stringify(payload),
  });

  const sessionId = response.headers.get("mcp-session-id");
  const text = await response.text();
  if (!response.ok) {
    throw new Error(text || `MCP HTTP ${response.status}`);
  }
  const body = text ? JSON.parse(text) : {};
  return { ...body, __sessionId: sessionId };
}

function buildMcpHeaders(session: McpSession): HeadersInit {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    accept: "application/json, text/event-stream",
    "mcp-protocol-version": session.protocolVersion,
  };
  if (session.sessionId) {
    headers["mcp-session-id"] = session.sessionId;
  }
  return headers;
}

function readMcpTextContent(result: any): string | null {
  const textPart = result?.content?.find((part: any) => part?.type === "text" && typeof part.text === "string");
  return textPart?.text ?? null;
}

function sumMetric<T extends Record<K, number>, K extends keyof T>(points: T[], key: K) {
  return points.reduce((total, point) => total + point[key], 0);
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

function formatDateShort(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00Z`));
}

function getInclusiveDayCount(start: string, end: string) {
  const startTime = Date.parse(`${start}T00:00:00Z`);
  const endTime = Date.parse(`${end}T00:00:00Z`);
  return Math.max(1, Math.round((endTime - startTime) / 86_400_000) + 1);
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
