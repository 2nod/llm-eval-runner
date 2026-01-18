import {
  createFileRoute,
  Link,
  Outlet,
  useMatchRoute,
  useNavigate,
} from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import type { FormEvent } from "react";
import { createExperiment, fetchExperiments } from "@/lib/api";
import type { CreateExperimentInput, Experiment } from "@/lib/api";

export const Route = createFileRoute("/experiments")({
  component: ExperimentsPage,
});

const CONDITION_OPTIONS = ["A0", "A1", "A2", "A3"] as const;
const MODEL_PROVIDERS = ["openai", "anthropic", "mock"] as const;
const DEFAULT_MODEL_NAME = "gpt-5-mini";

type Condition = (typeof CONDITION_OPTIONS)[number];
type ModelProvider = (typeof MODEL_PROVIDERS)[number];

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

function ExperimentsPage() {
  const matchRoute = useMatchRoute();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isDetailRoute = !!matchRoute({
    to: "/experiments/$experimentId",
    fuzzy: false,
  });
  const [isCreating, setIsCreating] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [provider, setProvider] = useState<ModelProvider>("openai");
  const [modelName, setModelName] = useState(DEFAULT_MODEL_NAME);
  const [temperature, setTemperature] = useState("1");
  const [selectedConditions, setSelectedConditions] = useState<Condition[]>(
    () => [...CONDITION_OPTIONS],
  );
  const { data, isLoading } = useQuery({
    queryKey: ["experiments"],
    queryFn: fetchExperiments,
    enabled: !isDetailRoute,
  });

  const resetForm = () => {
    setName("");
    setDescription("");
    setProvider("openai");
    setModelName(DEFAULT_MODEL_NAME);
    setTemperature("1");
    setSelectedConditions([...CONDITION_OPTIONS]);
  };

  const createMutation = useMutation({
    mutationFn: createExperiment,
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ["experiments"] });
      resetForm();
      setIsCreating(false);
      navigate({
        to: "/experiments/$experimentId",
        params: { experimentId: response.data.id },
      });
    },
  });

  if (isDetailRoute) {
    return <Outlet />;
  }

  const trimmedName = name.trim();
  const trimmedDescription = description.trim();
  const trimmedModelName = modelName.trim();
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

  const handleCreate = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSubmit) return;

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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Experiments</h1>
        <button
          type="button"
          onClick={() => setIsCreating((prev) => !prev)}
          className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary/90"
        >
          {isCreating ? "Close" : "New Experiment"}
        </button>
      </div>

      {isCreating && (
        <form
          onSubmit={handleCreate}
          className="rounded-lg border p-4 space-y-4"
        >
          <div className="grid gap-4 md:grid-cols-2">
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

            <div className="space-y-1 md:col-span-2">
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
                className="min-h-[80px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
            </div>

            <div className="space-y-2 md:col-span-2">
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
              onClick={() => {
                resetForm();
                setIsCreating(false);
              }}
              className="rounded-md border px-4 py-2 text-sm hover:bg-muted"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

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
