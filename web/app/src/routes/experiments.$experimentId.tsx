import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import {
  fetchExperiment,
  fetchExperimentResults,
  startExperiment,
  type Experiment,
  type Run,
} from "@/lib/api";

export const Route = createFileRoute("/experiments/$experimentId")({
  component: ExperimentDetailPage,
});

const CONDITION_ORDER = ["A0", "A1", "A2", "A3"] as const;

function ExperimentDetailPage() {
  const { experimentId } = Route.useParams();
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ["experiment", experimentId],
    queryFn: () => fetchExperiment(experimentId),
  });

  const startMutation = useMutation({
    mutationFn: () => startExperiment(experimentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["experiment", experimentId] });
      queryClient.invalidateQueries({ queryKey: ["experiments"] });
      queryClient.invalidateQueries({
        queryKey: ["experiment", experimentId, "results"],
      });
    },
  });

  if (isLoading) {
    return <div className="text-muted-foreground">Loading...</div>;
  }

  if (error || !data) {
    return <div className="text-destructive">Failed to load experiment</div>;
  }

  const experiment = data.data;

  const statusColors = {
    draft: "bg-muted text-muted-foreground",
    running: "bg-blue-100 text-blue-700",
    completed: "bg-green-100 text-green-700",
    failed: "bg-red-100 text-red-700",
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link
          to="/experiments"
          className="text-muted-foreground hover:text-foreground"
        >
          ← Experiments
        </Link>
        <h1 className="text-2xl font-bold">{experiment.name}</h1>
        <span
          className={`rounded px-2 py-0.5 text-sm ${statusColors[experiment.status]}`}
        >
          {experiment.status}
        </span>
      </div>

      {experiment.description && (
        <p className="text-muted-foreground">{experiment.description}</p>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-lg border p-4">
          <h2 className="mb-3 font-semibold">Conditions</h2>
          <div className="flex flex-wrap gap-2">
            {experiment.conditions.map((condition) => (
              <span
                key={condition}
                className="rounded bg-secondary px-3 py-1 text-sm"
              >
                {condition}
              </span>
            ))}
          </div>
        </div>

        <div className="rounded-lg border p-4">
          <h2 className="mb-3 font-semibold">Scene Filter</h2>
          {experiment.sceneFilter ? (
            <pre className="text-xs text-muted-foreground">
              {JSON.stringify(experiment.sceneFilter, null, 2)}
            </pre>
          ) : (
            <div className="text-sm text-muted-foreground">All scenes</div>
          )}
        </div>

        <div className="rounded-lg border p-4 lg:col-span-2">
          <h2 className="mb-3 font-semibold">Config</h2>
          <pre className="text-xs text-muted-foreground overflow-auto max-h-64">
            {JSON.stringify(experiment.config, null, 2)}
          </pre>
        </div>
      </div>

      {experiment.status === "draft" && (
        <div className="space-y-3">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => startMutation.mutate()}
              disabled={startMutation.isPending}
              className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {startMutation.isPending ? "Starting..." : "Start Experiment"}
            </button>
            <button className="rounded-md border px-4 py-2 text-sm hover:bg-muted">
              Edit
            </button>
          </div>
          {startMutation.error && (
            <div className="text-sm text-destructive">
              {startMutation.error instanceof Error
                ? startMutation.error.message
                : "Failed to start experiment"}
            </div>
          )}
        </div>
      )}

      <ResultsSection
        experimentId={experimentId}
        status={experiment.status}
        conditions={experiment.conditions}
      />
    </div>
  );
}

type Condition = (typeof CONDITION_ORDER)[number];

type RunGroup = {
  key: string;
  sceneIdLabel: string;
  segmentT: number | null;
  segmentText: string | null;
  speaker: string | null;
  runs: Run[];
};

type ComparisonGroup = RunGroup & {
  baselineRun: Run;
  compareRun: Run;
  scoreDelta: number | null;
  issueDelta: number | null;
  statusDelta: number;
  improved: boolean;
};

type ConditionSummary = {
  condition: Condition;
  totalRuns: number;
  avgOverall: number | null;
  avgAdequacy: number | null;
  avgFluency: number | null;
  avgConstraintCompliance: number | null;
  needsReviewRate: number | null;
  avgIssues: number | null;
};

const CONDITION_FEATURES: Record<
  Condition,
  { state: boolean; verify: boolean }
> = {
  A0: { state: false, verify: false },
  A1: { state: true, verify: false },
  A2: { state: false, verify: true },
  A3: { state: true, verify: true },
};

const STATUS_ORDER: Record<NonNullable<Run["status"]>, number> = {
  ok: 0,
  needs_review: 1,
  error: 2,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function getOverallScore(run: Run | null | undefined): number | null {
  if (!run?.scores) return null;
  const value = run.scores["overall"];
  return isNumber(value) ? value : null;
}

function getJudgeScore(
  run: Run | null | undefined,
  key: "adequacy" | "fluency" | "constraintCompliance",
): number | null {
  if (!run?.scores) return null;
  const judge = run.scores["judge"];
  if (!isRecord(judge)) return null;
  const value = judge[key];
  return isNumber(value) ? value : null;
}

function getIssueCount(run: Run | null | undefined): number | null {
  if (!run?.issues || !Array.isArray(run.issues)) return null;
  return run.issues.length;
}

function getHardFailCount(run: Run | null | undefined): number | null {
  if (!run?.hardChecks || !Array.isArray(run.hardChecks)) return null;
  return run.hardChecks.filter(
    (check) => isRecord(check) && check["passed"] === false,
  ).length;
}

function getStatus(run: Run | null | undefined): NonNullable<Run["status"]> {
  return run?.status ?? "ok";
}

function getStatusRank(run: Run | null | undefined): number {
  const status = getStatus(run);
  return STATUS_ORDER[status] ?? 0;
}

function summarizeCondition(
  runs: Run[],
  condition: Condition,
): ConditionSummary {
  const filtered = runs.filter((run) => run.condition === condition);
  const overallScores = filtered.map(getOverallScore).filter(isNumber);
  const adequacyScores = filtered
    .map((run) => getJudgeScore(run, "adequacy"))
    .filter(isNumber);
  const fluencyScores = filtered
    .map((run) => getJudgeScore(run, "fluency"))
    .filter(isNumber);
  const constraintScores = filtered
    .map((run) => getJudgeScore(run, "constraintCompliance"))
    .filter(isNumber);
  const issueCounts = filtered.map(getIssueCount).filter(isNumber);
  const needsReviewCount = filtered.filter(
    (run) => getStatus(run) !== "ok",
  ).length;

  return {
    condition,
    totalRuns: filtered.length,
    avgOverall: average(overallScores),
    avgAdequacy: average(adequacyScores),
    avgFluency: average(fluencyScores),
    avgConstraintCompliance: average(constraintScores),
    needsReviewRate: filtered.length
      ? needsReviewCount / filtered.length
      : null,
    avgIssues: average(issueCounts),
  };
}

function formatScore(value: number | null): string {
  return value === null ? "—" : value.toFixed(3);
}

function formatRate(value: number | null): string {
  return value === null ? "—" : `${Math.round(value * 100)}%`;
}

function formatDelta(value: number | null, digits = 3): string {
  if (value === null) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(digits)}`;
}

function formatDeltaRate(value: number | null): string {
  if (value === null) return "—";
  const percent = value * 100;
  const sign = percent > 0 ? "+" : "";
  return `${sign}${percent.toFixed(1)}%`;
}

function deltaClass(delta: number | null, invert = false): string {
  if (delta === null || delta === 0) {
    return "bg-muted text-muted-foreground";
  }
  const adjusted = invert ? -delta : delta;
  return adjusted > 0
    ? "bg-green-100 text-green-700"
    : "bg-red-100 text-red-700";
}

function describeConditionDiff(base: Condition, compare: Condition): string[] {
  const baseFeatures = CONDITION_FEATURES[base];
  const compareFeatures = CONDITION_FEATURES[compare];
  const changes: string[] = [];
  if (baseFeatures.state !== compareFeatures.state) {
    changes.push(compareFeatures.state ? "+state context" : "-state context");
  }
  if (baseFeatures.verify !== compareFeatures.verify) {
    changes.push(compareFeatures.verify ? "+verify/repair" : "-verify/repair");
  }
  return changes.length > 0 ? changes : ["same pipeline features"];
}

function pickComparisonPair(available: Condition[]): [Condition, Condition] {
  if (available.includes("A0") && available.includes("A3")) {
    return ["A0", "A3"];
  }
  if (available.includes("A0") && available.includes("A1")) {
    return ["A0", "A1"];
  }
  if (available.includes("A2") && available.includes("A3")) {
    return ["A2", "A3"];
  }
  if (available.length >= 2) {
    return [available[0], available[1]];
  }
  if (available.length === 1) {
    return [available[0], available[0]];
  }
  return ["A0", "A1"];
}

function ResultsSection({
  experimentId,
  status,
  conditions,
}: {
  experimentId: string;
  status: Experiment["status"];
  conditions: string[];
}) {
  const [conditionFilter, setConditionFilter] = useState<"all" | Condition>(
    "all",
  );
  const availableConditions = useMemo(
    () => CONDITION_ORDER.filter((condition) => conditions.includes(condition)),
    [conditions],
  );
  const comparisonEnabled = availableConditions.length > 1;
  const [viewMode, setViewMode] = useState<"runs" | "compare">(
    comparisonEnabled ? "compare" : "runs",
  );
  const [baselineCondition, setBaselineCondition] = useState<Condition>(
    () => pickComparisonPair(availableConditions)[0],
  );
  const [compareCondition, setCompareCondition] = useState<Condition>(
    () => pickComparisonPair(availableConditions)[1],
  );
  const [showImprovedOnly, setShowImprovedOnly] = useState(false);

  useEffect(() => {
    if (!comparisonEnabled) {
      setViewMode("runs");
      return;
    }
    const [defaultBase, defaultCompare] =
      pickComparisonPair(availableConditions);
    if (
      !availableConditions.includes(baselineCondition) ||
      !availableConditions.includes(compareCondition) ||
      baselineCondition === compareCondition
    ) {
      setBaselineCondition(defaultBase);
      setCompareCondition(defaultCompare);
    }
  }, [
    availableConditions,
    baselineCondition,
    compareCondition,
    comparisonEnabled,
  ]);

  useEffect(() => {
    if (
      conditionFilter !== "all" &&
      !availableConditions.includes(conditionFilter)
    ) {
      setConditionFilter("all");
    }
  }, [availableConditions, conditionFilter]);

  const resultsQuery = useQuery({
    queryKey: ["experiment", experimentId, "results"],
    queryFn: () => fetchExperimentResults(experimentId),
    enabled: !!experimentId,
    refetchInterval: status === "running" ? 5000 : false,
  });

  const results = resultsQuery.data?.data;
  const groupedAll = useMemo(() => {
    if (!results) return [];

    const scenesById = new Map(
      (results.scenes ?? []).map((scene) => [scene.id, scene]),
    );

    const groups = new Map<string, RunGroup>();

    for (const run of results.runs) {
      const scene = run.sceneId ? scenesById.get(run.sceneId) : undefined;
      const segmentT = typeof run.segmentT === "number" ? run.segmentT : null;
      const segment = scene?.segments?.find((s) => s.t === segmentT);
      const sceneIdLabel = scene?.sceneId ?? run.sceneId ?? "Unknown scene";
      const key = `${run.sceneId ?? "unknown"}:${segmentT ?? "unknown"}`;

      const existing = groups.get(key);
      const target = existing ?? {
        key,
        sceneIdLabel,
        segmentT,
        segmentText: segment?.text ?? null,
        speaker: segment?.speaker ?? null,
        runs: [],
      };
      target.runs.push(run);
      if (!existing) {
        groups.set(key, target);
      }
    }

    const conditionIndex = new Map(
      CONDITION_ORDER.map((condition, index) => [condition, index]),
    );

    const list = Array.from(groups.values())
      .map((group) => ({
        ...group,
        runs: [...group.runs].sort((a, b) => {
          const aIndex = conditionIndex.get(a.condition) ?? 99;
          const bIndex = conditionIndex.get(b.condition) ?? 99;
          return aIndex - bIndex;
        }),
      }))
      .sort((a, b) => {
        if (a.sceneIdLabel === b.sceneIdLabel) {
          return (a.segmentT ?? 0) - (b.segmentT ?? 0);
        }
        return a.sceneIdLabel.localeCompare(b.sceneIdLabel);
      });

    return list;
  }, [results]);

  const grouped = useMemo(() => {
    if (conditionFilter === "all") return groupedAll;
    return groupedAll.filter((group) =>
      group.runs.some((run) => run.condition === conditionFilter),
    );
  }, [conditionFilter, groupedAll]);

  const comparisonSummary = useMemo(() => {
    if (!results) return null;
    return {
      baseline: summarizeCondition(results.runs, baselineCondition),
      compare: summarizeCondition(results.runs, compareCondition),
    };
  }, [baselineCondition, compareCondition, results]);

  const comparisonGroups = useMemo(() => {
    const list = groupedAll
      .map((group) => {
        const baselineRun = group.runs.find(
          (run) => run.condition === baselineCondition,
        );
        const compareRun = group.runs.find(
          (run) => run.condition === compareCondition,
        );
        if (!baselineRun || !compareRun) return null;
        const baselineScore = getOverallScore(baselineRun);
        const compareScore = getOverallScore(compareRun);
        const baselineIssues = getIssueCount(baselineRun);
        const compareIssues = getIssueCount(compareRun);
        const scoreDelta =
          baselineScore !== null && compareScore !== null
            ? compareScore - baselineScore
            : null;
        const issueDelta =
          baselineIssues !== null && compareIssues !== null
            ? compareIssues - baselineIssues
            : null;
        const statusDelta =
          getStatusRank(compareRun) - getStatusRank(baselineRun);
        const improved =
          (scoreDelta !== null && scoreDelta > 0.01) ||
          (issueDelta !== null && issueDelta < 0) ||
          statusDelta < 0;

        return {
          ...group,
          baselineRun,
          compareRun,
          scoreDelta,
          issueDelta,
          statusDelta,
          improved,
        };
      })
      .filter((group): group is ComparisonGroup => !!group);

    if (!showImprovedOnly) return list;
    return list.filter((group) => group.improved);
  }, [baselineCondition, compareCondition, groupedAll, showImprovedOnly]);

  const runCount = results?.runs.length ?? 0;
  const segmentCount = grouped.length;
  const comparisonCount = comparisonGroups.length;
  const isDraft = status === "draft";
  const showingCompare = viewMode === "compare" && comparisonEnabled;
  const comparisonLabels = describeConditionDiff(
    baselineCondition,
    compareCondition,
  );

  return (
    <div className="rounded-lg border p-4 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Results</h2>
          <div className="text-sm text-muted-foreground">
            {isDraft
              ? "Run the experiment to see results."
              : showingCompare
                ? `${comparisonCount} segment pairs`
                : `${runCount} runs across ${segmentCount} segments`}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          {comparisonEnabled && (
            <div className="flex rounded-md border p-0.5 text-xs">
              <button
                type="button"
                onClick={() => setViewMode("runs")}
                className={`rounded-sm px-2 py-1 font-medium ${viewMode === "runs" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
              >
                Runs
              </button>
              <button
                type="button"
                onClick={() => setViewMode("compare")}
                className={`rounded-sm px-2 py-1 font-medium ${viewMode === "compare" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
              >
                Compare
              </button>
            </div>
          )}
          {showingCompare ? (
            <>
              <label
                className="text-muted-foreground"
                htmlFor="baselineCondition"
              >
                Baseline
              </label>
              <select
                id="baselineCondition"
                value={baselineCondition}
                onChange={(event) =>
                  setBaselineCondition(event.target.value as Condition)
                }
                className="h-9 rounded-md border border-input bg-transparent px-2 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                {availableConditions.map((condition) => (
                  <option key={condition} value={condition}>
                    {condition}
                  </option>
                ))}
              </select>
              <label
                className="text-muted-foreground"
                htmlFor="compareCondition"
              >
                Compare
              </label>
              <select
                id="compareCondition"
                value={compareCondition}
                onChange={(event) =>
                  setCompareCondition(event.target.value as Condition)
                }
                className="h-9 rounded-md border border-input bg-transparent px-2 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                {availableConditions.map((condition) => (
                  <option key={condition} value={condition}>
                    {condition}
                  </option>
                ))}
              </select>
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  checked={showImprovedOnly}
                  onChange={(event) =>
                    setShowImprovedOnly(event.target.checked)
                  }
                  className="h-4 w-4"
                />
                Improved only
              </label>
            </>
          ) : (
            <>
              <label
                className="text-muted-foreground"
                htmlFor="conditionFilter"
              >
                Condition
              </label>
              <select
                id="conditionFilter"
                value={conditionFilter}
                onChange={(event) =>
                  setConditionFilter(event.target.value as "all" | Condition)
                }
                className="h-9 rounded-md border border-input bg-transparent px-2 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="all">All</option>
                {availableConditions.map((condition) => (
                  <option key={condition} value={condition}>
                    {condition}
                  </option>
                ))}
              </select>
            </>
          )}
          <button
            type="button"
            onClick={() => resultsQuery.refetch()}
            className="h-9 rounded-md border px-3 text-xs hover:bg-muted"
          >
            Refresh
          </button>
        </div>
      </div>

      {showingCompare && comparisonSummary && (
        <ComparisonSummary
          baseline={comparisonSummary.baseline}
          compare={comparisonSummary.compare}
          labels={comparisonLabels}
        />
      )}

      {resultsQuery.isLoading && (
        <div className="text-sm text-muted-foreground">Loading results...</div>
      )}
      {resultsQuery.error && (
        <div className="text-sm text-destructive">
          {resultsQuery.error instanceof Error
            ? resultsQuery.error.message
            : "Failed to load results"}
        </div>
      )}
      {!resultsQuery.isLoading &&
        !resultsQuery.error &&
        !isDraft &&
        runCount === 0 && (
          <div className="text-sm text-muted-foreground">No runs yet.</div>
        )}
      {!resultsQuery.isLoading &&
        !resultsQuery.error &&
        !isDraft &&
        showingCompare &&
        comparisonCount === 0 && (
          <div className="text-sm text-muted-foreground">
            No paired runs found for the selected conditions.
          </div>
        )}

      {!resultsQuery.isLoading &&
        !resultsQuery.error &&
        !showingCompare &&
        grouped.length > 0 && (
          <div className="space-y-4">
            {grouped.map((group) => (
              <div key={group.key} className="rounded-lg border p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <div className="font-medium">
                    {group.sceneIdLabel}
                    {group.segmentT !== null ? ` · t=${group.segmentT}` : ""}
                  </div>
                  {group.speaker && (
                    <div className="text-xs text-muted-foreground">
                      Speaker: {group.speaker}
                    </div>
                  )}
                </div>
                <div className="rounded bg-muted/30 p-3 text-sm whitespace-pre-wrap">
                  {group.segmentText ?? "Source segment not found"}
                </div>
                <div className="grid gap-3 lg:grid-cols-2">
                  {group.runs
                    .filter((run) =>
                      conditionFilter === "all"
                        ? true
                        : run.condition === conditionFilter,
                    )
                    .map((run) => (
                      <RunCard key={run.id} run={run} />
                    ))}
                </div>
              </div>
            ))}
          </div>
        )}

      {!resultsQuery.isLoading &&
        !resultsQuery.error &&
        showingCompare &&
        comparisonGroups.length > 0 && (
          <div className="space-y-4">
            {comparisonGroups.map((group) => (
              <ComparisonGroupCard key={group.key} group={group} />
            ))}
          </div>
        )}
    </div>
  );
}

function ComparisonSummary({
  baseline,
  compare,
  labels,
}: {
  baseline: ConditionSummary;
  compare: ConditionSummary;
  labels: string[];
}) {
  const overallDelta =
    compare.avgOverall !== null && baseline.avgOverall !== null
      ? compare.avgOverall - baseline.avgOverall
      : null;
  const adequacyDelta =
    compare.avgAdequacy !== null && baseline.avgAdequacy !== null
      ? compare.avgAdequacy - baseline.avgAdequacy
      : null;
  const constraintDelta =
    compare.avgConstraintCompliance !== null &&
    baseline.avgConstraintCompliance !== null
      ? compare.avgConstraintCompliance - baseline.avgConstraintCompliance
      : null;
  const needsReviewDelta =
    compare.needsReviewRate !== null && baseline.needsReviewRate !== null
      ? compare.needsReviewRate - baseline.needsReviewRate
      : null;
  const issuesDelta =
    compare.avgIssues !== null && baseline.avgIssues !== null
      ? compare.avgIssues - baseline.avgIssues
      : null;

  return (
    <div className="rounded-lg border p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-sm font-semibold">Condition comparison</div>
          <div className="text-xs text-muted-foreground">
            {baseline.condition} -&gt; {compare.condition}
          </div>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          {labels.map((label) => (
            <span key={label} className="rounded bg-muted px-2 py-0.5 text-xs">
              {label}
            </span>
          ))}
        </div>
      </div>
      <div className="text-xs text-muted-foreground">
        State uses world/character context; verify adds reviewer + repair loop.
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        <SummaryColumn title="Baseline" summary={baseline} />
        <SummaryColumn title="Compare" summary={compare} />
        <div className="rounded-md border border-dashed p-3 text-xs space-y-2">
          <div className="text-muted-foreground">
            Delta (compare - baseline)
          </div>
          <DeltaRow label="Overall" delta={overallDelta} />
          <DeltaRow label="Adequacy" delta={adequacyDelta} />
          <DeltaRow label="Constraint" delta={constraintDelta} />
          <DeltaRow
            label="Needs review"
            delta={needsReviewDelta}
            invert
            formatter={formatDeltaRate}
          />
          <DeltaRow
            label="Avg issues"
            delta={issuesDelta}
            invert
            formatter={(value) => formatDelta(value, 2)}
          />
        </div>
      </div>
    </div>
  );
}

function SummaryColumn({
  title,
  summary,
}: {
  title: string;
  summary: ConditionSummary;
}) {
  const features = CONDITION_FEATURES[summary.condition];
  return (
    <div className="rounded-md bg-muted/30 p-3 text-xs space-y-2">
      <div className="text-muted-foreground">{title}</div>
      <div className="flex flex-wrap items-center gap-1">
        <span className="rounded bg-secondary px-2 py-0.5 text-xs">
          {summary.condition}
        </span>
        {features.state && (
          <span className="rounded bg-muted px-2 py-0.5 text-xs">State</span>
        )}
        {features.verify && (
          <span className="rounded bg-muted px-2 py-0.5 text-xs">
            Verify/Repair
          </span>
        )}
      </div>
      <MetricRow label="Overall" value={formatScore(summary.avgOverall)} />
      <MetricRow label="Adequacy" value={formatScore(summary.avgAdequacy)} />
      <MetricRow label="Fluency" value={formatScore(summary.avgFluency)} />
      <MetricRow
        label="Constraint"
        value={formatScore(summary.avgConstraintCompliance)}
      />
      <MetricRow
        label="Needs review"
        value={formatRate(summary.needsReviewRate)}
      />
      <MetricRow
        label="Avg issues"
        value={summary.avgIssues === null ? "—" : summary.avgIssues.toFixed(2)}
      />
      <MetricRow label="Runs" value={summary.totalRuns.toString()} />
    </div>
  );
}

function MetricRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span>{value}</span>
    </div>
  );
}

function DeltaRow({
  label,
  delta,
  invert = false,
  formatter = formatDelta,
}: {
  label: string;
  delta: number | null;
  invert?: boolean;
  formatter?: (value: number | null) => string;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span
        className={`rounded px-2 py-0.5 text-xs ${deltaClass(delta, invert)}`}
      >
        {formatter(delta)}
      </span>
    </div>
  );
}

function ComparisonGroupCard({ group }: { group: ComparisonGroup }) {
  const baselineStatus = getStatus(group.baselineRun);
  const compareStatus = getStatus(group.compareRun);
  const statusClass =
    group.statusDelta === 0
      ? "bg-muted text-muted-foreground"
      : group.statusDelta < 0
        ? "bg-green-100 text-green-700"
        : "bg-red-100 text-red-700";
  const translationChanged =
    group.baselineRun.finalEn &&
    group.compareRun.finalEn &&
    group.baselineRun.finalEn !== group.compareRun.finalEn;

  return (
    <div className="rounded-lg border p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <div className="font-medium">
          {group.sceneIdLabel}
          {group.segmentT !== null ? ` · t=${group.segmentT}` : ""}
        </div>
        {group.speaker && (
          <div className="text-xs text-muted-foreground">
            Speaker: {group.speaker}
          </div>
        )}
      </div>
      <div className="rounded bg-muted/30 p-3 text-sm whitespace-pre-wrap">
        {group.segmentText ?? "Source segment not found"}
      </div>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span
          className={`rounded px-2 py-0.5 text-xs ${deltaClass(group.scoreDelta)}`}
        >
          overall {formatDelta(group.scoreDelta)}
        </span>
        <span
          className={`rounded px-2 py-0.5 text-xs ${deltaClass(group.issueDelta, true)}`}
        >
          issues {formatDelta(group.issueDelta, 0)}
        </span>
        <span className={`rounded px-2 py-0.5 text-xs ${statusClass}`}>
          status {baselineStatus} -&gt; {compareStatus}
        </span>
        {group.improved && (
          <span className="rounded bg-green-100 px-2 py-0.5 text-xs text-green-700">
            improved
          </span>
        )}
        {translationChanged && (
          <span className="rounded bg-muted px-2 py-0.5 text-xs">
            translation changed
          </span>
        )}
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        <ComparisonRunCard
          run={group.baselineRun}
          label={`Baseline ${group.baselineRun.condition}`}
        />
        <ComparisonRunCard
          run={group.compareRun}
          label={`Compare ${group.compareRun.condition}`}
        />
      </div>
    </div>
  );
}

function ComparisonRunCard({ run, label }: { run: Run; label: string }) {
  const statusClasses = {
    ok: "bg-green-100 text-green-700",
    needs_review: "bg-amber-100 text-amber-700",
    error: "bg-red-100 text-red-700",
  };
  const status = getStatus(run);
  const overall = formatScore(getOverallScore(run));
  const final = run.finalEn ?? "—";
  const issueCount = getIssueCount(run);
  const hardFailCount = getHardFailCount(run);
  const changed =
    run.draftEn !== undefined &&
    run.draftEn !== null &&
    run.finalEn !== undefined &&
    run.finalEn !== null &&
    run.draftEn !== run.finalEn;

  return (
    <div className="rounded border p-3 space-y-2">
      <div className="flex items-center justify-between text-xs">
        <div className="font-medium">{label}</div>
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`rounded px-2 py-0.5 text-xs ${statusClasses[status] ?? statusClasses.ok}`}
          >
            {status}
          </span>
          <span className="text-muted-foreground">overall {overall}</span>
          {issueCount !== null && (
            <span className="text-muted-foreground">issues {issueCount}</span>
          )}
          {hardFailCount !== null && hardFailCount > 0 && (
            <span className="text-destructive">hard fails {hardFailCount}</span>
          )}
        </div>
      </div>
      <div>
        <div className="text-xs text-muted-foreground">Final</div>
        <div className="text-sm whitespace-pre-wrap">{final}</div>
      </div>
      {changed && (
        <div className="text-xs text-amber-600">
          Translation changed after verification/repair.
        </div>
      )}
    </div>
  );
}

function RunCard({ run }: { run: Run }) {
  const statusClasses = {
    ok: "bg-green-100 text-green-700",
    needs_review: "bg-amber-100 text-amber-700",
    error: "bg-red-100 text-red-700",
  };
  const status = getStatus(run);
  const overall = formatScore(getOverallScore(run));
  const draft = run.draftEn ?? "—";
  const final = run.finalEn ?? "—";
  const issueCount = getIssueCount(run);
  const hardFailCount = getHardFailCount(run);
  const changed =
    run.draftEn !== undefined &&
    run.draftEn !== null &&
    run.finalEn !== undefined &&
    run.finalEn !== null &&
    run.draftEn !== run.finalEn;

  return (
    <div className="rounded border p-3 space-y-2">
      <div className="flex items-center justify-between text-xs">
        <div className="font-medium">{run.condition}</div>
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`rounded px-2 py-0.5 text-xs ${statusClasses[status] ?? statusClasses.ok}`}
          >
            {status}
          </span>
          <span className="text-muted-foreground">overall {overall}</span>
          {issueCount !== null && (
            <span className="text-muted-foreground">issues {issueCount}</span>
          )}
          {hardFailCount !== null && hardFailCount > 0 && (
            <span className="text-destructive">hard fails {hardFailCount}</span>
          )}
        </div>
      </div>
      <div>
        <div className="text-xs text-muted-foreground">Draft</div>
        <div className="text-sm whitespace-pre-wrap">{draft}</div>
      </div>
      <div>
        <div className="text-xs text-muted-foreground">Final</div>
        <div className="text-sm whitespace-pre-wrap">{final}</div>
      </div>
      {changed && (
        <div className="text-xs text-amber-600">
          Translation changed after verification/repair.
        </div>
      )}
    </div>
  );
}
