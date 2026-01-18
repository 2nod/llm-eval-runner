import { useQuery } from "@tanstack/react-query";
import {
  createFileRoute,
  Link,
  Outlet,
  useMatchRoute,
} from "@tanstack/react-router";
import { type ChangeEvent, useCallback, useState } from "react";

import { fetchScenes, type Scene } from "@/lib/api";

const ScenesPage = () => {
  const matchRoute = useMatchRoute();
  const isDetailRoute = !!matchRoute({ fuzzy: false, to: "/scenes/$sceneId" });
  const [split, setSplit] = useState<string>("");
  const [search, setSearch] = useState("");

  const handleSearchChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      setSearch(event.target.value);
    },
    []
  );

  const handleSplitChange = useCallback(
    (event: ChangeEvent<HTMLSelectElement>) => {
      setSplit(event.target.value);
    },
    []
  );

  const { data, isLoading } = useQuery({
    enabled: !isDetailRoute,
    queryFn: () =>
      fetchScenes({ search: search || undefined, split: split || undefined }),
    queryKey: ["scenes", { search, split }],
  });

  if (isDetailRoute) {
    return <Outlet />;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Scenes</h1>
        <div className="text-sm text-muted-foreground">
          {data?.pagination.total ?? 0} scenes
        </div>
      </div>

      <div className="flex gap-4">
        <input
          type="text"
          placeholder="Search scenes..."
          value={search}
          onChange={handleSearchChange}
          className="flex h-9 w-64 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        />
        <select
          value={split}
          onChange={handleSplitChange}
          className="flex h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          <option value="">All splits</option>
          <option value="train">Train</option>
          <option value="dev">Dev</option>
          <option value="test">Test</option>
        </select>
      </div>

      {isLoading ? (
        <div className="text-muted-foreground">Loading...</div>
      ) : (
        <div className="space-y-2">
          {data?.data?.map((scene) => (
            <SceneCard key={scene.id} scene={scene} />
          ))}
          {data?.data?.length === 0 && (
            <div className="text-muted-foreground">No scenes found</div>
          )}
        </div>
      )}
    </div>
  );
};

const SceneCard = ({ scene }: { scene: Scene }) => {
  const segments = scene.segments ?? [];
  const characterStates = scene.characterStates ?? {};
  const fatalRisks = scene.evalTargets?.fatal_risks ?? [];
  const riskCounts: Record<string, number> = {};
  for (const risk of fatalRisks) {
    riskCounts[risk.type] = (riskCounts[risk.type] ?? 0) + 1;
  }

  return (
    <Link
      to="/scenes/$sceneId"
      params={{ sceneId: scene.sceneId }}
      className="block rounded-lg border p-4 hover:bg-muted/50 transition-colors"
    >
      <div className="flex items-start justify-between">
        <div>
          <div className="font-medium">{scene.sceneId}</div>
          <div className="text-sm text-muted-foreground">
            {segments.length} segments
            {" · "}
            {Object.keys(characterStates).length} characters
          </div>
        </div>
        <div className="flex items-center gap-2">
          {scene.split && (
            <span className="rounded bg-secondary px-2 py-0.5 text-xs">
              {scene.split}
            </span>
          )}
          {fatalRisks.length > 0 && (
            <span className="rounded bg-destructive/10 px-2 py-0.5 text-xs text-destructive">
              {fatalRisks.length} risks
            </span>
          )}
        </div>
      </div>

      <div className="mt-2 text-sm text-muted-foreground line-clamp-2">
        {segments
          .slice(0, 2)
          .map((s) => s.text)
          .join(" · ")}
      </div>

      {Object.keys(riskCounts).length > 0 && (
        <div className="mt-2 flex gap-2">
          {Object.entries(riskCounts).map(([type, count]) => (
            <span
              key={type}
              className="rounded bg-muted px-1.5 py-0.5 text-xs font-medium"
            >
              {type}: {count}
            </span>
          ))}
        </div>
      )}
    </Link>
  );
};

export const Route = createFileRoute("/scenes")({
  component: ScenesPage,
});
