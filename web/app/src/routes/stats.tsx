import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";

import { fetchStats } from "@/lib/api";

const StatsPage = () => {
  const { data, isLoading } = useQuery({
    queryFn: fetchStats,
    queryKey: ["stats", "overview"],
  });

  if (isLoading) {
    return <div className="text-muted-foreground">Loading...</div>;
  }

  const stats = data?.data;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Statistics</h1>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Total Scenes" value={stats?.totalScenes ?? 0} />
        <StatCard
          title="Total Experiments"
          value={stats?.totalExperiments ?? 0}
        />
        <StatCard title="Total Runs" value={stats?.totalRuns ?? 0} />
        <StatCard
          title="Total Annotations"
          value={stats?.totalAnnotations ?? 0}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-lg border p-4">
          <h2 className="mb-4 font-semibold">Scenes by Split</h2>
          {stats?.scenesBySplit &&
          Object.keys(stats.scenesBySplit).length > 0 ? (
            <div className="space-y-2">
              {Object.entries(stats.scenesBySplit).map(([split, count]) => (
                <div key={split} className="flex items-center justify-between">
                  <span className="capitalize">{split}</span>
                  <div className="flex items-center gap-2">
                    <div
                      className="h-2 rounded bg-primary"
                      style={{
                        maxWidth: "200px",
                        minWidth: "20px",
                        width: `${(count / (stats.totalScenes || 1)) * 100}%`,
                      }}
                    />
                    <span className="text-sm text-muted-foreground w-12 text-right">
                      {count}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">
              No scenes with splits assigned
            </div>
          )}
        </div>

        <div className="rounded-lg border p-4">
          <h2 className="mb-4 font-semibold">Quick Actions</h2>
          <div className="space-y-2">
            <ActionButton label="Import Scenes from JSONL" />
            <ActionButton label="Create New Experiment" />
            <ActionButton label="Export Results" />
          </div>
        </div>
      </div>
    </div>
  );
};

const StatCard = ({ title, value }: { title: string; value: number }) => (
  <div className="rounded-lg border p-4">
    <div className="text-sm text-muted-foreground">{title}</div>
    <div className="text-3xl font-bold">{value}</div>
  </div>
);

const ActionButton = ({ label }: { label: string }) => (
  <button
    className="w-full rounded-md border px-4 py-2 text-left text-sm hover:bg-muted transition-colors"
    type="button"
  >
    {label}
  </button>
);

export const Route = createFileRoute("/stats")({
  component: StatsPage,
});
