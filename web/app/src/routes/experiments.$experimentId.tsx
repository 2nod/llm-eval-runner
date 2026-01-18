import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { fetchExperiment } from "@/lib/api";

export const Route = createFileRoute("/experiments/$experimentId")({
  component: ExperimentDetailPage,
});

function ExperimentDetailPage() {
  const { experimentId } = Route.useParams();

  const { data, isLoading, error } = useQuery({
    queryKey: ["experiment", experimentId],
    queryFn: () => fetchExperiment(experimentId),
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
        <div className="flex gap-2">
          <button className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary/90">
            Start Experiment
          </button>
          <button className="rounded-md border px-4 py-2 text-sm hover:bg-muted">
            Edit
          </button>
        </div>
      )}
    </div>
  );
}
