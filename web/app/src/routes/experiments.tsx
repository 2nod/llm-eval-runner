import { useQuery } from "@tanstack/react-query";
import {
  createFileRoute,
  Link,
  Outlet,
  useMatchRoute,
} from "@tanstack/react-router";

import { fetchExperiments, type Experiment } from "@/lib/api";

const ExperimentsPage = () => {
  const matchRoute = useMatchRoute();
  const isChildRoute =
    !!matchRoute({
      fuzzy: false,
      to: "/experiments/$experimentId",
    }) ||
    !!matchRoute({
      fuzzy: false,
      to: "/experiments/new",
    });
  const { data, isLoading } = useQuery({
    enabled: !isChildRoute,
    queryFn: fetchExperiments,
    queryKey: ["experiments"],
  });

  if (isChildRoute) {
    return <Outlet />;
  }

  const total = data?.pagination.total ?? 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Experiments</h1>
          <div className="text-sm text-muted-foreground">
            {total} experiments
          </div>
        </div>
        <Link
          to="/experiments/new"
          className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary/90"
        >
          New Experiment
        </Link>
      </div>

      {isLoading ? (
        <div className="text-muted-foreground">Loading...</div>
      ) : (
        <div className="space-y-2">
          {data?.data?.map((experiment) => (
            <ExperimentCard key={experiment.id} experiment={experiment} />
          ))}
          {data?.data?.length === 0 && (
            <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground space-y-3">
              <div>No experiments yet.</div>
              <Link
                to="/experiments/new"
                className="inline-flex rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary/90"
              >
                Create your first experiment
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const ExperimentCard = ({ experiment }: { experiment: Experiment }) => {
  const conditions = experiment.conditions ?? [];
  const statusColors = {
    completed: "bg-green-100 text-green-700",
    draft: "bg-muted text-muted-foreground",
    failed: "bg-red-100 text-red-700",
    running: "bg-blue-100 text-blue-700",
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
};

export const Route = createFileRoute("/experiments")({
  component: ExperimentsPage,
});
