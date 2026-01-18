import {
  createFileRoute,
  Link,
  Outlet,
  useMatchRoute,
} from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { fetchExperiments } from "@/lib/api";
import type { Experiment } from "@/lib/api";

export const Route = createFileRoute("/experiments")({
  component: ExperimentsPage,
});

function ExperimentsPage() {
  const matchRoute = useMatchRoute();
  const isDetailRoute = !!matchRoute({
    to: "/experiments/$experimentId",
    fuzzy: false,
  });
  const { data, isLoading } = useQuery({
    queryKey: ["experiments"],
    queryFn: fetchExperiments,
    enabled: !isDetailRoute,
  });

  if (isDetailRoute) {
    return <Outlet />;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Experiments</h1>
        <button className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary/90">
          New Experiment
        </button>
      </div>

      {isLoading ? (
        <div className="text-muted-foreground">Loading...</div>
      ) : (
        <div className="space-y-2">
          {data?.data?.map((experiment) => (
            <ExperimentCard key={experiment.id} experiment={experiment} />
          ))}
          {data?.data?.length === 0 && (
            <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
              No experiments yet. Create one to get started.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ExperimentCard({ experiment }: { experiment: Experiment }) {
  const conditions = experiment.conditions ?? [];
  const statusColors = {
    draft: "bg-muted text-muted-foreground",
    running: "bg-blue-100 text-blue-700",
    completed: "bg-green-100 text-green-700",
    failed: "bg-red-100 text-red-700",
  };

  return (
    <Link
      to="/experiments/$experimentId"
      params={{ experimentId: experiment.id }}
      className="block rounded-lg border p-4 hover:bg-muted/50 transition-colors"
    >
      <div className="flex items-start justify-between">
        <div>
          <div className="font-medium">{experiment.name}</div>
          {experiment.description && (
            <div className="text-sm text-muted-foreground">
              {experiment.description}
            </div>
          )}
        </div>
        <span
          className={`rounded px-2 py-0.5 text-xs ${statusColors[experiment.status]}`}
        >
          {experiment.status}
        </span>
      </div>

      <div className="mt-2 flex gap-2">
        {conditions.map((condition) => (
          <span
            key={condition}
            className="rounded bg-secondary px-2 py-0.5 text-xs"
          >
            {condition}
          </span>
        ))}
      </div>

      <div className="mt-2 text-xs text-muted-foreground">
        Created: {new Date(experiment.createdAt).toLocaleDateString()}
      </div>
    </Link>
  );
}
