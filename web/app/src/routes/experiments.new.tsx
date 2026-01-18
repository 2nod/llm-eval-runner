import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import type { FormEvent } from "react";
import { createExperiment, fetchScenes } from "@/lib/api";
import type { CreateExperimentInput } from "@/lib/api";

export const Route = createFileRoute("/experiments/new")({
  component: NewExperimentPage,
});

const CONDITION_OPTIONS = ["A0", "A1", "A2", "A3"] as const;
const MODEL_PROVIDERS = ["openai", "anthropic", "mock"] as const;
const DEFAULT_MODEL_NAME = "gpt-5-mini";

type Condition = (typeof CONDITION_OPTIONS)[number];
type ModelProvider = (typeof MODEL_PROVIDERS)[number];
type SceneSplit = "train" | "dev" | "test" | "";

function buildExperimentConfig({
  name,
  description,
  provider,
  modelName,
  temperature,
}: {
  name: string;
  description?: string;
  provider: ModelProvider;
  modelName: string;
  temperature: number;
}): Record<string, unknown> {
  const config: Record<string, unknown> = {
    name,
    components: {
      translator: {
        model: {
          provider,
          name: modelName,
          temperature,
        },
      },
    },
  };

  if (description) {
    config["description"] = description;
  }

  return config;
}

function NewExperimentPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [provider, setProvider] = useState<ModelProvider>("openai");
  const [modelName, setModelName] = useState(DEFAULT_MODEL_NAME);
  const [temperature, setTemperature] = useState("1");
  const [selectedConditions, setSelectedConditions] = useState<Condition[]>(
    () => [...CONDITION_OPTIONS],
  );
  const [sceneSearch, setSceneSearch] = useState("");
  const [sceneSplit, setSceneSplit] = useState<SceneSplit>("");
  const [selectedSceneIds, setSelectedSceneIds] = useState<string[]>([]);

  const trimmedName = name.trim();
  const trimmedDescription = description.trim();
  const trimmedModelName = modelName.trim();
  const trimmedSceneSearch = sceneSearch.trim();
  const temperatureValue = Number.parseFloat(temperature);
  const hasValidTemperature =
    Number.isFinite(temperatureValue) &&
    temperatureValue >= 0 &&
    temperatureValue <= 2;
  const orderedConditions = CONDITION_OPTIONS.filter((condition) =>
    selectedConditions.includes(condition),
  );
  const canSubmit =
    trimmedName.length > 0 &&
    trimmedModelName.length > 0 &&
    orderedConditions.length > 0 &&
    hasValidTemperature;
  const selectedSceneCount = selectedSceneIds.length;
  const previewSceneIds = selectedSceneIds.slice(0, 3);
  const remainingSceneCount = selectedSceneCount - previewSceneIds.length;
  const splitLabel = sceneSplit || "All";

  const scenesQuery = useQuery({
    queryKey: [
      "scenes",
      { split: sceneSplit || "all", search: trimmedSceneSearch },
    ],
    queryFn: () =>
      fetchScenes({
        split: sceneSplit || undefined,
        search: trimmedSceneSearch || undefined,
        limit: 50,
      }),
  });
  const scenes = scenesQuery.data?.data ?? [];
  const scenesTotal = scenesQuery.data?.pagination.total ?? 0;

  const createMutation = useMutation({
    mutationFn: createExperiment,
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ["experiments"] });
      navigate({
        to: "/experiments/$experimentId",
        params: { experimentId: response.data.id },
      });
    },
  });

  const handleCreate = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSubmit) return;

    const sceneFilter = {
      split: sceneSplit || undefined,
      sceneIds: selectedSceneIds.length > 0 ? selectedSceneIds : undefined,
    };
    const hasSceneFilter =
      !!sceneFilter.split || (sceneFilter.sceneIds?.length ?? 0) > 0;

    const payload: CreateExperimentInput = {
      name: trimmedName,
      description: trimmedDescription || undefined,
      config: buildExperimentConfig({
        name: trimmedName,
        description: trimmedDescription || undefined,
        provider,
        modelName: trimmedModelName,
        temperature: temperatureValue,
      }),
      conditions: orderedConditions,
      sceneFilter: hasSceneFilter ? sceneFilter : undefined,
    };

    createMutation.mutate(payload);
  };

  const toggleCondition = (condition: Condition) => {
    setSelectedConditions((prev) =>
      prev.includes(condition)
        ? prev.filter((value) => value !== condition)
        : [...prev, condition],
    );
  };

  const toggleScene = (sceneId: string) => {
    setSelectedSceneIds((prev) =>
      prev.includes(sceneId)
        ? prev.filter((value) => value !== sceneId)
        : [...prev, sceneId],
    );
  };

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <Link
          to="/experiments"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← Experiments
        </Link>
        <h1 className="text-2xl font-bold">New Experiment</h1>
        <p className="text-sm text-muted-foreground">
          Create a draft experiment and head to the detail page to start it.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <form
          onSubmit={handleCreate}
          className="rounded-lg border p-4 space-y-4"
        >
          <div className="space-y-1">
            <label className="text-sm font-medium" htmlFor="experiment-name">
              Name
            </label>
            <input
              id="experiment-name"
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="New experiment"
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              required
            />
          </div>

          <div className="space-y-1">
            <label
              className="text-sm font-medium"
              htmlFor="experiment-description"
            >
              Description
            </label>
            <textarea
              id="experiment-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Optional summary for this experiment"
              className="min-h-[90px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1">
              <label
                className="text-sm font-medium"
                htmlFor="experiment-provider"
              >
                Provider
              </label>
              <select
                id="experiment-provider"
                value={provider}
                onChange={(event) =>
                  setProvider(event.target.value as ModelProvider)
                }
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                {MODEL_PROVIDERS.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium" htmlFor="experiment-model">
                Model name
              </label>
              <input
                id="experiment-model"
                type="text"
                value={modelName}
                onChange={(event) => setModelName(event.target.value)}
                placeholder="gpt-5-mini"
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                required
              />
            </div>

            <div className="space-y-1">
              <label
                className="text-sm font-medium"
                htmlFor="experiment-temperature"
              >
                Temperature
              </label>
              <input
                id="experiment-temperature"
                type="number"
                min="0"
                max="2"
                step="0.1"
                value={temperature}
                onChange={(event) => setTemperature(event.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <div className="text-sm font-medium">Conditions</div>
            <div className="flex flex-wrap gap-2">
              {CONDITION_OPTIONS.map((condition) => (
                <label
                  key={condition}
                  className="flex items-center gap-2 rounded-md border px-2 py-1 text-sm"
                >
                  <input
                    type="checkbox"
                    checked={selectedConditions.includes(condition)}
                    onChange={() => toggleCondition(condition)}
                    className="h-4 w-4"
                  />
                  {condition}
                </label>
              ))}
            </div>
            {orderedConditions.length === 0 && (
              <div className="text-xs text-destructive">
                Select at least one condition.
              </div>
            )}
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium">Scenes</div>
              {selectedSceneCount > 0 && (
                <button
                  type="button"
                  onClick={() => setSelectedSceneIds([])}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  Clear selection
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <input
                type="text"
                value={sceneSearch}
                onChange={(event) => setSceneSearch(event.target.value)}
                placeholder="Search by scene id..."
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring md:w-64"
              />
              <select
                value={sceneSplit}
                onChange={(event) =>
                  setSceneSplit(event.target.value as SceneSplit)
                }
                className="flex h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="">All splits</option>
                <option value="train">Train</option>
                <option value="dev">Dev</option>
                <option value="test">Test</option>
              </select>
            </div>
            <div className="max-h-56 overflow-auto rounded-md border">
              {scenesQuery.isLoading ? (
                <div className="p-3 text-sm text-muted-foreground">
                  Loading scenes...
                </div>
              ) : scenesQuery.isError ? (
                <div className="p-3 text-sm text-destructive">
                  Failed to load scenes.
                </div>
              ) : scenes.length === 0 ? (
                <div className="p-3 text-sm text-muted-foreground">
                  No scenes found.
                </div>
              ) : (
                <ul className="divide-y">
                  {scenes.map((scene) => (
                    <li
                      key={scene.sceneId}
                      className="flex items-center gap-2 px-3 py-2 text-sm"
                    >
                      <input
                        type="checkbox"
                        checked={selectedSceneIds.includes(scene.sceneId)}
                        onChange={() => toggleScene(scene.sceneId)}
                        className="h-4 w-4"
                      />
                      <span className="font-medium">{scene.sceneId}</span>
                      {scene.split && (
                        <span className="ml-auto text-xs text-muted-foreground">
                          {scene.split}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="text-xs text-muted-foreground">
              {selectedSceneCount > 0
                ? `${selectedSceneCount} scenes selected.`
                : "No scenes selected. The experiment will use all scenes."}
            </div>
            {scenesTotal > scenes.length && (
              <div className="text-xs text-muted-foreground">
                Showing {scenes.length} of {scenesTotal} scenes.
              </div>
            )}
          </div>

          {createMutation.error && (
            <div className="text-sm text-destructive">
              {createMutation.error instanceof Error
                ? createMutation.error.message
                : "Failed to create experiment"}
            </div>
          )}

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={!canSubmit || createMutation.isPending}
              className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {createMutation.isPending ? "Creating..." : "Create Experiment"}
            </button>
            <button
              type="button"
              onClick={() => navigate({ to: "/experiments" })}
              className="rounded-md border px-4 py-2 text-sm hover:bg-muted"
            >
              Cancel
            </button>
          </div>
        </form>

        <aside className="rounded-lg border p-4 space-y-4">
          <div>
            <h2 className="text-sm font-semibold">Summary</h2>
            <div className="mt-2 space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Name</span>
                <span>{trimmedName || "Not set"}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Status</span>
                <span>Draft</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Model</span>
                <span>
                  {trimmedModelName
                    ? `${provider} · ${trimmedModelName}`
                    : "Not set"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Temperature</span>
                <span>
                  {hasValidTemperature ? temperatureValue : "Not set"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Conditions</span>
                <span>
                  {orderedConditions.length > 0
                    ? orderedConditions.join(", ")
                    : "Not set"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Scenes</span>
                <span>
                  {selectedSceneCount > 0
                    ? `${selectedSceneCount} selected`
                    : "All scenes"}
                </span>
              </div>
              {selectedSceneCount > 0 && (
                <div className="text-xs text-muted-foreground">
                  {previewSceneIds.join(", ")}
                  {remainingSceneCount > 0
                    ? ` +${remainingSceneCount} more`
                    : ""}
                </div>
              )}
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Split filter</span>
                <span>{splitLabel}</span>
              </div>
            </div>
          </div>

          <div>
            <h2 className="text-sm font-semibold">What happens next</h2>
            <div className="mt-2 space-y-2 text-sm text-muted-foreground">
              <p>Experiments are created in draft status.</p>
              <p>After creation, you can start the run from the detail page.</p>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
