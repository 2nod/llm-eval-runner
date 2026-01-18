import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  type ChangeEvent,
  type MouseEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  fetchExperiment,
  fetchExperimentResults,
  startExperiment,
  type Experiment,
  type ExperimentResults,
  type Run,
  type Scene,
} from "@/lib/api";

const CONDITION_ORDER = ["A0", "A1", "A2", "A3"] as const;
const CONDITION_INDEX = new Map(
  CONDITION_ORDER.map((condition, index) => [condition, index])
);
const STATUS_COLORS = {
  completed: "bg-green-100 text-green-700",
  draft: "bg-muted text-muted-foreground",
  failed: "bg-red-100 text-red-700",
  running: "bg-blue-100 text-blue-700",
};

const ExperimentDetailPage = () => {
  const { experimentId } = Route.useParams();

  const { data, isLoading, error } = useQuery({
    queryFn: () => fetchExperiment(experimentId),
    queryKey: ["experiment", experimentId],
  });

  const startMutation = useStartExperimentMutation(experimentId);
  const handleStart = useCallback(() => {
    startMutation.mutate();
  }, [startMutation]);

  if (isLoading) {
    return <div className="text-muted-foreground">Loading...</div>;
  }

  if (error || data === undefined) {
    return <div className="text-destructive">Failed to load experiment</div>;
  }

  const experiment = data.data;

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
          className={`rounded px-2 py-0.5 text-sm ${STATUS_COLORS[experiment.status]}`}
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
              onClick={handleStart}
              disabled={startMutation.isPending}
              className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {startMutation.isPending ? "Starting..." : "Start Experiment"}
            </button>
            <button
              type="button"
              className="rounded-md border px-4 py-2 text-sm hover:bg-muted"
            >
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
};

type Condition = (typeof CONDITION_ORDER)[number];

interface RunGroup {
  key: string;
  sceneIdLabel: string;
  segmentT: number | null;
  segmentText: string | null;
  speaker: string | null;
  runs: Run[];
}

type ComparisonGroup = RunGroup & {
  baselineRun: Run;
  compareRun: Run;
  scoreDelta: number | null;
  issueDelta: number | null;
  statusDelta: number;
  improved: boolean;
};

interface ConditionSummary {
  condition: Condition;
  totalRuns: number;
  avgOverall: number | null;
  avgAdequacy: number | null;
  avgFluency: number | null;
  avgConstraintCompliance: number | null;
  needsReviewRate: number | null;
  avgIssues: number | null;
}

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
  error: 2,
  needs_review: 1,
  ok: 0,
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

const isNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

const average = (values: number[]): number | null => {
  if (values.length === 0) {
    return null;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
};

const getOverallScore = (run: Run | null | undefined): number | null => {
  if (!run?.scores) {
    return null;
  }
  const value = run.scores["overall"];
  return isNumber(value) ? value : null;
};

const getJudgeScore = (
  run: Run | null | undefined,
  key: "adequacy" | "fluency" | "constraintCompliance"
): number | null => {
  if (!run?.scores) {
    return null;
  }
  const { judge } = run.scores;
  if (!isRecord(judge)) {
    return null;
  }
  const value = judge[key];
  return isNumber(value) ? value : null;
};

const getIssueCount = (run: Run | null | undefined): number | null => {
  if (!run?.issues || !Array.isArray(run.issues)) {
    return null;
  }
  return run.issues.length;
};

const getHardFailCount = (run: Run | null | undefined): number | null => {
  if (!run?.hardChecks || !Array.isArray(run.hardChecks)) {
    return null;
  }
  return run.hardChecks.filter(
    (check) => isRecord(check) && check["passed"] === false
  ).length;
};

const getStatus = (run: Run | null | undefined): NonNullable<Run["status"]> =>
  run?.status ?? "ok";

const getStatusRank = (run: Run | null | undefined): number => {
  const status = getStatus(run);
  return STATUS_ORDER[status] ?? 0;
};

const summarizeCondition = (
  runs: Run[],
  condition: Condition
): ConditionSummary => {
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
    (run) => getStatus(run) !== "ok"
  ).length;

  return {
    avgAdequacy: average(adequacyScores),
    avgConstraintCompliance: average(constraintScores),
    avgFluency: average(fluencyScores),
    avgIssues: average(issueCounts),
    avgOverall: average(overallScores),
    condition,
    needsReviewRate: filtered.length
      ? needsReviewCount / filtered.length
      : null,
    totalRuns: filtered.length,
  };
};

const formatScore = (value: number | null): string =>
  value === null ? "—" : value.toFixed(3);

const formatRate = (value: number | null): string =>
  value === null ? "—" : `${Math.round(value * 100)}%`;

const formatDelta = (value: number | null, digits = 3): string => {
  if (value === null) {
    return "—";
  }
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(digits)}`;
};

const formatDeltaRate = (value: number | null): string => {
  if (value === null) {
    return "—";
  }
  const percent = value * 100;
  const sign = percent > 0 ? "+" : "";
  return `${sign}${percent.toFixed(1)}%`;
};

const deltaClass = (delta: number | null, invert = false): string => {
  if (delta === null || delta === 0) {
    return "bg-muted text-muted-foreground";
  }
  const adjusted = invert ? -delta : delta;
  return adjusted > 0
    ? "bg-green-100 text-green-700"
    : "bg-red-100 text-red-700";
};

const formatDeltaTwo = (value: number | null) => formatDelta(value, 2);

const getStatusDeltaClass = (statusDelta: number): string => {
  if (statusDelta === 0) {
    return "bg-muted text-muted-foreground";
  }
  if (statusDelta < 0) {
    return "bg-green-100 text-green-700";
  }
  return "bg-red-100 text-red-700";
};

const describeConditionDiff = (
  base: Condition,
  compare: Condition
): string[] => {
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
};

const pickComparisonPair = (available: Condition[]): [Condition, Condition] => {
  const preferredPairs: [Condition, Condition][] = [
    ["A0", "A3"],
    ["A0", "A1"],
    ["A2", "A3"],
  ];
  const match = preferredPairs.find(
    ([baseline, compare]) =>
      available.includes(baseline) && available.includes(compare)
  );
  if (match) {
    return match;
  }
  if (available.length >= 2) {
    return [available[0], available[1]];
  }
  if (available.length === 1) {
    return [available[0], available[0]];
  }
  return ["A0", "A1"];
};

const formatSegmentSuffix = (segmentT: number | null) =>
  segmentT === null ? "" : ` · t=${segmentT}`;

const getResultsSummaryText = ({
  comparisonCount,
  isDraft,
  runCount,
  segmentCount,
  showingCompare,
}: {
  comparisonCount: number;
  isDraft: boolean;
  runCount: number;
  segmentCount: number;
  showingCompare: boolean;
}) => {
  if (isDraft) {
    return "Run the experiment to see results.";
  }
  if (showingCompare) {
    return `${comparisonCount} segment pairs`;
  }
  return `${runCount} runs across ${segmentCount} segments`;
};

const getResultsVisibility = ({
  comparisonCount,
  groupedCount,
  hasError,
  isDraft,
  isLoading,
  runCount,
  showingCompare,
}: {
  comparisonCount: number;
  groupedCount: number;
  hasError: boolean;
  isDraft: boolean;
  isLoading: boolean;
  runCount: number;
  showingCompare: boolean;
}) => {
  const ready = !isLoading && !hasError && !isDraft;

  return {
    showComparisons: ready && showingCompare && comparisonCount > 0,
    showNoPairs: ready && showingCompare && comparisonCount === 0,
    showNoRuns: ready && runCount === 0,
    showRuns: ready && !showingCompare && groupedCount > 0,
  };
};

const getDelta = (baseline: number | null, compare: number | null) =>
  baseline !== null && compare !== null ? compare - baseline : null;

const isImprovedComparison = (
  scoreDelta: number | null,
  issueDelta: number | null,
  statusDelta: number
) =>
  (scoreDelta !== null && scoreDelta > 0.01) ||
  (issueDelta !== null && issueDelta < 0) ||
  statusDelta < 0;

const buildSceneMap = (scenes: Scene[] | undefined) =>
  new Map((scenes ?? []).map((scene) => [scene.id, scene]));

const getSegmentT = (run: Run) =>
  typeof run.segmentT === "number" ? run.segmentT : null;

const getRunGroupKey = (run: Run, segmentT: number | null) =>
  `${run.sceneId ?? "unknown"}:${segmentT ?? "unknown"}`;

const getSceneLabel = (scene: Scene | undefined, run: Run) =>
  scene?.sceneId ?? run.sceneId ?? "Unknown scene";

const getSegmentForRun = (scene: Scene | undefined, segmentT: number | null) =>
  scene?.segments?.find((segment) => segment.t === segmentT);

const createRunGroup = ({
  key,
  sceneIdLabel,
  segment,
  segmentT,
}: {
  key: string;
  sceneIdLabel: string;
  segment: Scene["segments"][number] | undefined;
  segmentT: number | null;
}): RunGroup => ({
  key,
  runs: [],
  sceneIdLabel,
  segmentT,
  segmentText: segment?.text ?? null,
  speaker: segment?.speaker ?? null,
});

const getOrCreateRunGroup = (
  groups: Map<string, RunGroup>,
  run: Run,
  scenesById: Map<string, Scene>
) => {
  const segmentT = getSegmentT(run);
  const scene = run.sceneId ? scenesById.get(run.sceneId) : undefined;
  const key = getRunGroupKey(run, segmentT);
  const existing = groups.get(key);
  if (existing) {
    return existing;
  }
  const group = createRunGroup({
    key,
    sceneIdLabel: getSceneLabel(scene, run),
    segment: getSegmentForRun(scene, segmentT),
    segmentT,
  });
  groups.set(key, group);
  return group;
};

const buildRunGroups = (runs: Run[], scenesById: Map<string, Scene>) => {
  const groups = new Map<string, RunGroup>();

  for (const run of runs) {
    const group = getOrCreateRunGroup(groups, run, scenesById);
    group.runs.push(run);
  }

  return groups;
};

const sortRunGroups = (groups: Map<string, RunGroup>) => {
  const list = [...groups.values()].map((group) => ({
    ...group,
    runs: [...group.runs].toSorted((a, b) => {
      const aIndex = CONDITION_INDEX.get(a.condition) ?? 99;
      const bIndex = CONDITION_INDEX.get(b.condition) ?? 99;
      return aIndex - bIndex;
    }),
  }));

  return list.toSorted((a, b) => {
    if (a.sceneIdLabel === b.sceneIdLabel) {
      return (a.segmentT ?? 0) - (b.segmentT ?? 0);
    }
    return a.sceneIdLabel.localeCompare(b.sceneIdLabel);
  });
};

const buildGroupedRuns = (results: ExperimentResults | undefined) => {
  if (!results) {
    return [];
  }

  const scenesById = buildSceneMap(results.scenes);
  const groups = buildRunGroups(results.runs, scenesById);

  return sortRunGroups(groups);
};

const filterGroupedRuns = (
  groupedAll: RunGroup[],
  conditionFilter: "all" | Condition
) =>
  conditionFilter === "all"
    ? groupedAll
    : groupedAll.filter((group) =>
        group.runs.some((run) => run.condition === conditionFilter)
      );

const buildComparisonGroup = (
  group: RunGroup,
  baselineCondition: Condition,
  compareCondition: Condition
): ComparisonGroup | null => {
  const baselineRun = group.runs.find(
    (run) => run.condition === baselineCondition
  );
  const compareRun = group.runs.find(
    (run) => run.condition === compareCondition
  );
  if (!baselineRun || !compareRun) {
    return null;
  }
  const scoreDelta = getDelta(
    getOverallScore(baselineRun),
    getOverallScore(compareRun)
  );
  const issueDelta = getDelta(
    getIssueCount(baselineRun),
    getIssueCount(compareRun)
  );
  const statusDelta = getStatusRank(compareRun) - getStatusRank(baselineRun);
  const improved = isImprovedComparison(scoreDelta, issueDelta, statusDelta);

  return {
    ...group,
    baselineRun,
    compareRun,
    improved,
    issueDelta,
    scoreDelta,
    statusDelta,
  };
};

const buildComparisonGroups = (
  groupedAll: RunGroup[],
  baselineCondition: Condition,
  compareCondition: Condition,
  showImprovedOnly: boolean
) => {
  const list = groupedAll
    .map((group) =>
      buildComparisonGroup(group, baselineCondition, compareCondition)
    )
    .filter((group): group is ComparisonGroup => !!group);

  if (!showImprovedOnly) {
    return list;
  }

  return list.filter((group) => group.improved);
};

const getComparisonSummary = (
  results: ExperimentResults | undefined,
  baselineCondition: Condition,
  compareCondition: Condition
) => {
  if (!results) {
    return null;
  }
  return {
    baseline: summarizeCondition(results.runs, baselineCondition),
    compare: summarizeCondition(results.runs, compareCondition),
  };
};

interface ResultsSectionProps {
  experimentId: string;
  status: Experiment["status"];
  conditions: string[];
}

const useResultsControls = (conditions: string[]) => {
  const [conditionFilter, setConditionFilter] = useState<"all" | Condition>(
    "all"
  );
  const availableConditions = useMemo(
    () => CONDITION_ORDER.filter((condition) => conditions.includes(condition)),
    [conditions]
  );
  const [viewMode, setViewMode] = useState<"runs" | "compare">(
    availableConditions.length > 1 ? "compare" : "runs"
  );
  const [baselineCondition, setBaselineCondition] = useState<Condition>(
    () => pickComparisonPair(availableConditions)[0]
  );
  const [compareCondition, setCompareCondition] = useState<Condition>(
    () => pickComparisonPair(availableConditions)[1]
  );
  const [showImprovedOnly, setShowImprovedOnly] = useState(false);

  useEffect(() => {
    if (availableConditions.length <= 1) {
      setViewMode("runs");
      return;
    }
    const [defaultBase, defaultCompare] =
      pickComparisonPair(availableConditions);
    const baselineValid = availableConditions.includes(baselineCondition);
    const compareValid = availableConditions.includes(compareCondition);
    if (
      !baselineValid ||
      !compareValid ||
      baselineCondition === compareCondition
    ) {
      setBaselineCondition(defaultBase);
      setCompareCondition(defaultCompare);
    }
  }, [availableConditions, baselineCondition, compareCondition]);

  useEffect(() => {
    if (conditionFilter === "all") {
      return;
    }
    if (!availableConditions.includes(conditionFilter)) {
      setConditionFilter("all");
    }
  }, [availableConditions, conditionFilter]);

  const showingCompare =
    viewMode === "compare" && availableConditions.length > 1;

  return {
    availableConditions,
    baselineCondition,
    compareCondition,
    conditionFilter,
    setBaselineCondition,
    setCompareCondition,
    setConditionFilter,
    setShowImprovedOnly,
    setViewMode,
    showImprovedOnly,
    showingCompare,
    viewMode,
  };
};

const useResultsData = ({
  baselineCondition,
  compareCondition,
  conditionFilter,
  experimentId,
  showImprovedOnly,
  status,
}: {
  baselineCondition: Condition;
  compareCondition: Condition;
  conditionFilter: "all" | Condition;
  experimentId: string;
  showImprovedOnly: boolean;
  status: Experiment["status"];
}) => {
  const resultsQuery = useQuery({
    enabled: !!experimentId,
    queryFn: () => fetchExperimentResults(experimentId),
    queryKey: ["experiment", experimentId, "results"],
    refetchInterval: status === "running" ? 5000 : false,
  });
  const results = resultsQuery.data?.data;
  const groupedAll = useMemo(() => buildGroupedRuns(results), [results]);
  const grouped = useMemo(
    () => filterGroupedRuns(groupedAll, conditionFilter),
    [conditionFilter, groupedAll]
  );
  const comparisonSummary = useMemo(
    () => getComparisonSummary(results, baselineCondition, compareCondition),
    [baselineCondition, compareCondition, results]
  );
  const comparisonGroups = useMemo(
    () =>
      buildComparisonGroups(
        groupedAll,
        baselineCondition,
        compareCondition,
        showImprovedOnly
      ),
    [baselineCondition, compareCondition, groupedAll, showImprovedOnly]
  );
  const runCount = results?.runs.length ?? 0;
  const segmentCount = grouped.length;
  const comparisonCount = comparisonGroups.length;

  return {
    comparisonCount,
    comparisonGroups,
    comparisonSummary,
    grouped,
    resultsQuery,
    runCount,
    segmentCount,
  };
};

type ResultsControlsState = ReturnType<typeof useResultsControls>;
type ResultsDataState = ReturnType<typeof useResultsData>;

const ResultsControls = ({
  controls,
  onRefresh,
}: {
  controls: ResultsControlsState;
  onRefresh: () => void;
}) => {
  const comparisonEnabled = controls.availableConditions.length > 1;
  const {
    setBaselineCondition,
    setCompareCondition,
    setConditionFilter,
    setShowImprovedOnly,
    setViewMode,
  } = controls;
  const handleViewModeClick = useCallback(
    (event: MouseEvent<HTMLButtonElement>) => {
      setViewMode(event.currentTarget.value as "runs" | "compare");
    },
    [setViewMode]
  );
  const handleSelectChange = useCallback(
    (event: ChangeEvent<HTMLSelectElement>) => {
      const { name, value } = event.target;
      if (name === "baselineCondition") {
        setBaselineCondition(value as Condition);
        return;
      }
      if (name === "compareCondition") {
        setCompareCondition(value as Condition);
        return;
      }
      setConditionFilter(value as "all" | Condition);
    },
    [setBaselineCondition, setCompareCondition, setConditionFilter]
  );
  const handleShowImprovedChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      setShowImprovedOnly(event.target.checked);
    },
    [setShowImprovedOnly]
  );

  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      {comparisonEnabled && (
        <div className="flex rounded-md border p-0.5 text-xs">
          <button
            type="button"
            value="runs"
            onClick={handleViewModeClick}
            className={`rounded-sm px-2 py-1 font-medium ${controls.viewMode === "runs" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
          >
            Runs
          </button>
          <button
            type="button"
            value="compare"
            onClick={handleViewModeClick}
            className={`rounded-sm px-2 py-1 font-medium ${controls.viewMode === "compare" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
          >
            Compare
          </button>
        </div>
      )}
      {controls.showingCompare ? (
        <>
          <label className="text-muted-foreground" htmlFor="baselineCondition">
            Baseline
          </label>
          <select
            id="baselineCondition"
            name="baselineCondition"
            value={controls.baselineCondition}
            onChange={handleSelectChange}
            className="h-9 rounded-md border border-input bg-transparent px-2 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            {controls.availableConditions.map((condition) => (
              <option key={condition} value={condition}>
                {condition}
              </option>
            ))}
          </select>
          <label className="text-muted-foreground" htmlFor="compareCondition">
            Compare
          </label>
          <select
            id="compareCondition"
            name="compareCondition"
            value={controls.compareCondition}
            onChange={handleSelectChange}
            className="h-9 rounded-md border border-input bg-transparent px-2 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            {controls.availableConditions.map((condition) => (
              <option key={condition} value={condition}>
                {condition}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={controls.showImprovedOnly}
              onChange={handleShowImprovedChange}
              className="h-4 w-4"
            />
            Improved only
          </label>
        </>
      ) : (
        <>
          <label className="text-muted-foreground" htmlFor="conditionFilter">
            Condition
          </label>
          <select
            id="conditionFilter"
            name="conditionFilter"
            value={controls.conditionFilter}
            onChange={handleSelectChange}
            className="h-9 rounded-md border border-input bg-transparent px-2 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            <option value="all">All</option>
            {controls.availableConditions.map((condition) => (
              <option key={condition} value={condition}>
                {condition}
              </option>
            ))}
          </select>
        </>
      )}
      <button
        type="button"
        onClick={onRefresh}
        className="h-9 rounded-md border px-3 text-xs hover:bg-muted"
      >
        Refresh
      </button>
    </div>
  );
};

const ResultsHeader = ({
  controls,
  onRefresh,
  summaryText,
}: {
  controls: ResultsControlsState;
  onRefresh: () => void;
  summaryText: string;
}) => (
  <div className="flex flex-wrap items-center justify-between gap-3">
    <div>
      <h2 className="text-lg font-semibold">Results</h2>
      <div className="text-sm text-muted-foreground">{summaryText}</div>
    </div>
    <ResultsControls controls={controls} onRefresh={onRefresh} />
  </div>
);

const ResultsPanel = ({
  comparisonLabels,
  controls,
  data,
  status,
}: {
  comparisonLabels: string[];
  controls: ResultsControlsState;
  data: ResultsDataState;
  status: Experiment["status"];
}) => {
  const handleRefresh = useCallback(() => {
    data.resultsQuery.refetch();
  }, [data.resultsQuery]);
  const isDraft = status === "draft";
  const summaryText = getResultsSummaryText({
    comparisonCount: data.comparisonCount,
    isDraft,
    runCount: data.runCount,
    segmentCount: data.segmentCount,
    showingCompare: controls.showingCompare,
  });
  const visibility = getResultsVisibility({
    comparisonCount: data.comparisonCount,
    groupedCount: data.grouped.length,
    hasError: !!data.resultsQuery.error,
    isDraft,
    isLoading: data.resultsQuery.isLoading,
    runCount: data.runCount,
    showingCompare: controls.showingCompare,
  });

  return (
    <div className="rounded-lg border p-4 space-y-4">
      <ResultsHeader
        controls={controls}
        onRefresh={handleRefresh}
        summaryText={summaryText}
      />

      {controls.showingCompare && data.comparisonSummary && (
        <ComparisonSummary
          baseline={data.comparisonSummary.baseline}
          compare={data.comparisonSummary.compare}
          labels={comparisonLabels}
        />
      )}

      {data.resultsQuery.isLoading && (
        <div className="text-sm text-muted-foreground">Loading results...</div>
      )}
      {data.resultsQuery.error && (
        <div className="text-sm text-destructive">
          {data.resultsQuery.error instanceof Error
            ? data.resultsQuery.error.message
            : "Failed to load results"}
        </div>
      )}
      {visibility.showNoRuns && (
        <div className="text-sm text-muted-foreground">No runs yet.</div>
      )}
      {visibility.showNoPairs && (
        <div className="text-sm text-muted-foreground">
          No paired runs found for the selected conditions.
        </div>
      )}

      {visibility.showRuns && (
        <div className="space-y-4">
          {data.grouped.map((group) => (
            <div key={group.key} className="rounded-lg border p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <div className="font-medium">
                  {group.sceneIdLabel}
                  {formatSegmentSuffix(group.segmentT)}
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
                    controls.conditionFilter === "all"
                      ? true
                      : run.condition === controls.conditionFilter
                  )
                  .map((run) => (
                    <RunCard key={run.id} run={run} />
                  ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {visibility.showComparisons && (
        <div className="space-y-4">
          {data.comparisonGroups.map((group) => (
            <ComparisonGroupCard key={group.key} group={group} />
          ))}
        </div>
      )}
    </div>
  );
};

const ResultsSection = ({
  experimentId,
  status,
  conditions,
}: ResultsSectionProps) => {
  const controls = useResultsControls(conditions);
  const data = useResultsData({
    baselineCondition: controls.baselineCondition,
    compareCondition: controls.compareCondition,
    conditionFilter: controls.conditionFilter,
    experimentId,
    showImprovedOnly: controls.showImprovedOnly,
    status,
  });
  const comparisonLabels = useMemo(
    () =>
      describeConditionDiff(
        controls.baselineCondition,
        controls.compareCondition
      ),
    [controls.baselineCondition, controls.compareCondition]
  );

  return (
    <ResultsPanel
      comparisonLabels={comparisonLabels}
      controls={controls}
      data={data}
      status={status}
    />
  );
};

const useStartExperimentMutation = (experimentId: string) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => startExperiment(experimentId),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["experiment", experimentId],
      });
      queryClient.invalidateQueries({ queryKey: ["experiments"] });
      queryClient.invalidateQueries({
        queryKey: ["experiment", experimentId, "results"],
      });
    },
  });
};

const ComparisonSummary = ({
  baseline,
  compare,
  labels,
}: {
  baseline: ConditionSummary;
  compare: ConditionSummary;
  labels: string[];
}) => {
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
            formatter={formatDeltaTwo}
          />
        </div>
      </div>
    </div>
  );
};

const SummaryColumn = ({
  title,
  summary,
}: {
  title: string;
  summary: ConditionSummary;
}) => {
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
};

const MetricRow = ({ label, value }: { label: string; value: string }) => (
  <div className="flex items-center justify-between">
    <span className="text-muted-foreground">{label}</span>
    <span>{value}</span>
  </div>
);

const DeltaRow = ({
  label,
  delta,
  invert = false,
  formatter = formatDelta,
}: {
  label: string;
  delta: number | null;
  invert?: boolean;
  formatter?: (value: number | null) => string;
}) => (
  <div className="flex items-center justify-between">
    <span className="text-muted-foreground">{label}</span>
    <span
      className={`rounded px-2 py-0.5 text-xs ${deltaClass(delta, invert)}`}
    >
      {formatter(delta)}
    </span>
  </div>
);

const ComparisonGroupCard = ({ group }: { group: ComparisonGroup }) => {
  const baselineStatus = getStatus(group.baselineRun);
  const compareStatus = getStatus(group.compareRun);
  const statusClass = getStatusDeltaClass(group.statusDelta);
  const translationChanged =
    group.baselineRun.finalEn &&
    group.compareRun.finalEn &&
    group.baselineRun.finalEn !== group.compareRun.finalEn;

  return (
    <div className="rounded-lg border p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <div className="font-medium">
          {group.sceneIdLabel}
          {formatSegmentSuffix(group.segmentT)}
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
};

const ComparisonRunCard = ({ run, label }: { run: Run; label: string }) => {
  const statusClasses = {
    error: "bg-red-100 text-red-700",
    needs_review: "bg-amber-100 text-amber-700",
    ok: "bg-green-100 text-green-700",
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
};

const RunCard = ({ run }: { run: Run }) => {
  const statusClasses = {
    error: "bg-red-100 text-red-700",
    needs_review: "bg-amber-100 text-amber-700",
    ok: "bg-green-100 text-green-700",
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
};

export const Route = createFileRoute("/experiments/$experimentId")({
  component: ExperimentDetailPage,
});
