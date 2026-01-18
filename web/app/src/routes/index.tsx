import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { fetchStats } from "@/lib/api";

export const Route = createFileRoute("/")({
  component: HomePage,
});

function HomePage() {
  const { data, isLoading } = useQuery({
    queryKey: ["stats", "overview"],
    queryFn: fetchStats,
  });

  if (isLoading) {
    return <div className="text-muted-foreground">Loading...</div>;
  }

  const stats = data?.data;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Dashboard</h1>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Scenes" value={stats?.totalScenes ?? 0} />
        <StatCard title="Experiments" value={stats?.totalExperiments ?? 0} />
        <StatCard title="Runs" value={stats?.totalRuns ?? 0} />
        <StatCard title="Annotations" value={stats?.totalAnnotations ?? 0} />
      </div>

      {stats?.scenesBySplit && Object.keys(stats.scenesBySplit).length > 0 && (
        <div className="rounded-lg border p-4">
          <h2 className="mb-3 font-semibold">Scenes by Split</h2>
          <div className="flex gap-4">
            {Object.entries(stats.scenesBySplit).map(([split, count]) => (
              <div key={split} className="text-sm">
                <span className="font-medium">{split}:</span>{" "}
                <span className="text-muted-foreground">{count}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ title, value }: { title: string; value: number }) {
  return (
    <div className="rounded-lg border p-4">
      <div className="text-sm text-muted-foreground">{title}</div>
      <div className="text-2xl font-bold">{value}</div>
    </div>
  );
}
