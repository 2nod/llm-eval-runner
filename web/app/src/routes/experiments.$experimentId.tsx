import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
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

      <ResultsSection experimentId={experimentId} status={experiment.status} />
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

function ResultsSection({
  experimentId,
  status,
}: {
  experimentId: string;
  status: Experiment["status"];
}) {
  const [conditionFilter, setConditionFilter] = useState<"all" | Condition>(
    "all",
  );

  const resultsQuery = useQuery({
    queryKey: ["experiment", experimentId, "results"],
    queryFn: () => fetchExperimentResults(experimentId),
    enabled: !!experimentId,
    refetchInterval: status === "running" ? 5000 : false,
  });

  const results = resultsQuery.data?.data;
  const grouped = useMemo(() => {
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
      .filter((group) => {
        if (conditionFilter === "all") return true;
        return group.runs.some((run) => run.condition === conditionFilter);
      })
      .sort((a, b) => {
        if (a.sceneIdLabel === b.sceneIdLabel) {
          return (a.segmentT ?? 0) - (b.segmentT ?? 0);
        }
        return a.sceneIdLabel.localeCompare(b.sceneIdLabel);
      });

    return list;
  }, [conditionFilter, results]);

  const runCount = results?.runs.length ?? 0;
  const segmentCount = grouped.length;
  const isDraft = status === "draft";

  return (
    <div className="rounded-lg border p-4 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Results</h2>
          <div className="text-sm text-muted-foreground">
            {isDraft
              ? "Run the experiment to see results."
              : `${runCount} runs across ${segmentCount} segments`}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <label className="text-muted-foreground" htmlFor="conditionFilter">
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
            {CONDITION_ORDER.map((condition) => (
              <option key={condition} value={condition}>
                {condition}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => resultsQuery.refetch()}
            className="h-9 rounded-md border px-3 text-xs hover:bg-muted"
          >
            Refresh
          </button>
        </div>
      </div>

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

      {!resultsQuery.isLoading && !resultsQuery.error && grouped.length > 0 && (
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
    </div>
  );
}

function RunCard({ run }: { run: Run }) {
  const statusClasses = {
    ok: "bg-green-100 text-green-700",
    needs_review: "bg-amber-100 text-amber-700",
    error: "bg-red-100 text-red-700",
  };
  const status = run.status ?? "ok";
  const overall =
    run.scores && typeof run.scores["overall"] === "number"
      ? run.scores["overall"].toFixed(3)
      : "—";
  const draft = run.draftEn ?? "—";
  const final = run.finalEn ?? "—";
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
        <div className="flex items-center gap-2">
          <span
            className={`rounded px-2 py-0.5 text-xs ${statusClasses[status] ?? statusClasses.ok}`}
          >
            {status}
          </span>
          <span className="text-muted-foreground">overall {overall}</span>
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
