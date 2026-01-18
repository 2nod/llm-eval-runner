import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  type ChangeEvent,
  type FormEvent,
  useCallback,
  useReducer,
} from "react";

import {
  createExperiment,
  fetchScenes,
  type CreateExperimentInput,
  type Scene,
} from "@/lib/api";

const CONDITION_OPTIONS = ["A0", "A1", "A2", "A3"] as const;
const MODEL_PROVIDERS = ["openai", "anthropic", "mock"] as const;
const DEFAULT_MODEL_NAME = "gpt-5-mini";

type Condition = (typeof CONDITION_OPTIONS)[number];
type ModelProvider = (typeof MODEL_PROVIDERS)[number];
type SceneSplit = "train" | "dev" | "test" | "";

type FormField =
  | "description"
  | "modelName"
  | "name"
  | "provider"
  | "sceneSearch"
  | "sceneSplit"
  | "temperature";

interface FormState {
  description: string;
  modelName: string;
  name: string;
  provider: ModelProvider;
  sceneSearch: string;
  sceneSplit: SceneSplit;
  selectedConditions: Condition[];
  selectedSceneIds: string[];
  temperature: string;
}

type FormAction =
  | { type: "clearScenes" }
  | { type: "setField"; field: FormField; value: string }
  | { type: "toggleCondition"; condition: Condition }
  | { type: "toggleScene"; sceneId: string };

const DEFAULT_FORM_STATE: FormState = {
  description: "",
  modelName: DEFAULT_MODEL_NAME,
  name: "",
  provider: "openai",
  sceneSearch: "",
  sceneSplit: "",
  selectedConditions: [...CONDITION_OPTIONS],
  selectedSceneIds: [],
  temperature: "1",
};

const updateField = <K extends FormField>(
  state: FormState,
  field: K,
  value: string
): FormState => ({
  ...state,
  [field]: value as FormState[K],
});

const formReducer = (state: FormState, action: FormAction): FormState => {
  switch (action.type) {
    case "clearScenes": {
      return { ...state, selectedSceneIds: [] };
    }
    case "setField": {
      return updateField(state, action.field, action.value);
    }
    case "toggleCondition": {
      const selectedConditions = state.selectedConditions.includes(
        action.condition
      )
        ? state.selectedConditions.filter((value) => value !== action.condition)
        : [...state.selectedConditions, action.condition];

      return { ...state, selectedConditions };
    }
    case "toggleScene": {
      const selectedSceneIds = state.selectedSceneIds.includes(action.sceneId)
        ? state.selectedSceneIds.filter((value) => value !== action.sceneId)
        : [...state.selectedSceneIds, action.sceneId];

      return { ...state, selectedSceneIds };
    }
    default: {
      return state;
    }
  }
};

const buildExperimentConfig = ({
  description,
  modelName,
  name,
  provider,
  temperature,
}: {
  description?: string;
  modelName: string;
  name: string;
  provider: ModelProvider;
  temperature: number;
}): Record<string, unknown> => {
  const config: Record<string, unknown> = {
    components: {
      translator: {
        model: {
          name: modelName,
          provider,
          temperature,
        },
      },
    },
    name,
  };

  if (description) {
    config["description"] = description;
  }

  return config;
};

const buildSceneFilter = (
  sceneSplit: SceneSplit,
  selectedSceneIds: string[]
): CreateExperimentInput["sceneFilter"] | undefined => {
  const sceneIds = selectedSceneIds.length > 0 ? selectedSceneIds : undefined;
  const split = sceneSplit || undefined;

  if (!sceneIds && !split) {
    return undefined;
  }

  return { sceneIds, split };
};

const getTemperatureState = (temperature: string) => {
  const value = Number.parseFloat(temperature);
  const isValid = Number.isFinite(value) && value >= 0 && value <= 2;

  return { isValid, value };
};

const getOrderedConditions = (selectedConditions: Condition[]) =>
  CONDITION_OPTIONS.filter((condition) =>
    selectedConditions.includes(condition)
  );

const getSceneSelectionSummary = (
  selectedSceneIds: string[],
  sceneSplit: SceneSplit
) => {
  const selectedSceneCount = selectedSceneIds.length;
  const previewSceneIds = selectedSceneIds.slice(0, 3);

  return {
    previewSceneIds,
    remainingSceneCount: selectedSceneCount - previewSceneIds.length,
    selectedSceneCount,
    splitLabel: sceneSplit || "All",
  };
};

const getCanSubmit = ({
  hasValidTemperature,
  orderedConditions,
  trimmedModelName,
  trimmedName,
}: {
  hasValidTemperature: boolean;
  orderedConditions: Condition[];
  trimmedModelName: string;
  trimmedName: string;
}) =>
  trimmedName.length > 0 &&
  trimmedModelName.length > 0 &&
  orderedConditions.length > 0 &&
  hasValidTemperature;

const getExperimentDerivedState = (state: FormState) => {
  const trimmedName = state.name.trim();
  const trimmedDescription = state.description.trim();
  const trimmedModelName = state.modelName.trim();
  const trimmedSceneSearch = state.sceneSearch.trim();
  const temperatureState = getTemperatureState(state.temperature);
  const orderedConditions = getOrderedConditions(state.selectedConditions);
  const sceneSummary = getSceneSelectionSummary(
    state.selectedSceneIds,
    state.sceneSplit
  );
  const canSubmit = getCanSubmit({
    hasValidTemperature: temperatureState.isValid,
    orderedConditions,
    trimmedModelName,
    trimmedName,
  });

  return {
    canSubmit,
    hasValidTemperature: temperatureState.isValid,
    orderedConditions,
    previewSceneIds: sceneSummary.previewSceneIds,
    remainingSceneCount: sceneSummary.remainingSceneCount,
    selectedSceneCount: sceneSummary.selectedSceneCount,
    splitLabel: sceneSummary.splitLabel,
    temperatureValue: temperatureState.value,
    trimmedDescription,
    trimmedModelName,
    trimmedName,
    trimmedSceneSearch,
  };
};

type DerivedState = ReturnType<typeof getExperimentDerivedState>;

interface CreateExperimentHandlerOptions {
  canSubmit: boolean;
  createMutation: ReturnType<typeof useCreateExperimentMutation>;
  derived: DerivedState;
  formState: FormState;
}

interface ExperimentFormProps {
  createMutation: ReturnType<typeof useCreateExperimentMutation>;
  derived: DerivedState;
  form: ReturnType<typeof useExperimentFormState>;
  handleCreate: (event: FormEvent<HTMLFormElement>) => void;
  sceneOptions: ReturnType<typeof useSceneOptions>;
}

interface ExperimentSummaryProps {
  derived: DerivedState;
  formState: FormState;
}

const useExperimentFormState = () => {
  const [state, dispatch] = useReducer(formReducer, DEFAULT_FORM_STATE);

  const handleInputChange = useCallback(
    (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      dispatch({
        field: event.target.name as FormField,
        type: "setField",
        value: event.target.value,
      });
    },
    []
  );

  const handleSelectChange = useCallback(
    (event: ChangeEvent<HTMLSelectElement>) => {
      dispatch({
        field: event.target.name as FormField,
        type: "setField",
        value: event.target.value,
      });
    },
    []
  );

  const handleConditionToggle = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      dispatch({
        condition: event.target.value as Condition,
        type: "toggleCondition",
      });
    },
    []
  );

  const handleSceneToggle = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      dispatch({ sceneId: event.target.value, type: "toggleScene" });
    },
    []
  );

  const handleClearScenes = useCallback(() => {
    dispatch({ type: "clearScenes" });
  }, []);

  return {
    handleClearScenes,
    handleConditionToggle,
    handleInputChange,
    handleSceneToggle,
    handleSelectChange,
    state,
  };
};

const useSceneOptions = (sceneSplit: SceneSplit, sceneSearch: string) => {
  const query = useQuery({
    queryFn: () =>
      fetchScenes({
        limit: 50,
        search: sceneSearch || undefined,
        split: sceneSplit || undefined,
      }),
    queryKey: ["scenes", { search: sceneSearch, split: sceneSplit || "all" }],
  });
  const scenes = query.data?.data ?? [];
  const total = query.data?.pagination.total ?? 0;

  return { query, scenes, total };
};

const useCreateExperimentMutation = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createExperiment,
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ["experiments"] });
      navigate({
        params: { experimentId: response.data.id },
        to: "/experiments/$experimentId",
      });
    },
  });
};

const useCreateExperimentHandler = ({
  canSubmit,
  createMutation,
  derived,
  formState,
}: CreateExperimentHandlerOptions) =>
  useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!canSubmit) {
        return;
      }

      const sceneFilter = buildSceneFilter(
        formState.sceneSplit,
        formState.selectedSceneIds
      );
      const description = derived.trimmedDescription || undefined;

      const payload: CreateExperimentInput = {
        conditions: derived.orderedConditions,
        config: buildExperimentConfig({
          description,
          modelName: derived.trimmedModelName,
          name: derived.trimmedName,
          provider: formState.provider,
          temperature: derived.temperatureValue,
        }),
        description,
        name: derived.trimmedName,
        sceneFilter,
      };

      createMutation.mutate(payload);
    },
    [
      canSubmit,
      createMutation,
      derived.orderedConditions,
      derived.temperatureValue,
      derived.trimmedDescription,
      derived.trimmedModelName,
      derived.trimmedName,
      formState.provider,
      formState.sceneSplit,
      formState.selectedSceneIds,
    ]
  );

const getSceneListContent = ({
  isError,
  isLoading,
  onToggle,
  scenes,
  selectedSceneIds,
}: {
  isError: boolean;
  isLoading: boolean;
  onToggle: (event: ChangeEvent<HTMLInputElement>) => void;
  scenes: Scene[];
  selectedSceneIds: string[];
}) => {
  if (isLoading) {
    return (
      <div className="p-3 text-sm text-muted-foreground">Loading scenes...</div>
    );
  }

  if (isError) {
    return (
      <div className="p-3 text-sm text-destructive">Failed to load scenes.</div>
    );
  }

  if (scenes.length === 0) {
    return (
      <div className="p-3 text-sm text-muted-foreground">No scenes found.</div>
    );
  }

  return (
    <ul className="divide-y">
      {scenes.map((scene) => (
        <li
          key={scene.sceneId}
          className="flex items-center gap-2 px-3 py-2 text-sm"
        >
          <input
            type="checkbox"
            value={scene.sceneId}
            checked={selectedSceneIds.includes(scene.sceneId)}
            onChange={onToggle}
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
  );
};

const getConditionsLabel = (orderedConditions: Condition[]) =>
  orderedConditions.length > 0 ? orderedConditions.join(", ") : "Not set";

const getModelLabel = (provider: ModelProvider, trimmedModelName: string) =>
  trimmedModelName ? `${provider} · ${trimmedModelName}` : "Not set";

const getScenePreviewLabel = (
  previewSceneIds: string[],
  remainingSceneCount: number
) => {
  if (previewSceneIds.length === 0) {
    return null;
  }

  const suffix = remainingSceneCount > 0 ? ` +${remainingSceneCount} more` : "";

  return `${previewSceneIds.join(", ")}${suffix}`;
};

const getSceneSelectionLabel = (selectedSceneCount: number) =>
  selectedSceneCount > 0
    ? `${selectedSceneCount} scenes selected.`
    : "No scenes selected. The experiment will use all scenes.";

const getSceneTotalLabel = (scenesLength: number, scenesTotal: number) => {
  if (scenesTotal <= scenesLength) {
    return null;
  }

  return `Showing ${scenesLength} of ${scenesTotal} scenes.`;
};

const getScenesLabel = (selectedSceneCount: number) =>
  selectedSceneCount > 0 ? `${selectedSceneCount} selected` : "All scenes";

const getTemperatureLabel = (
  hasValidTemperature: boolean,
  temperatureValue: number
) => (hasValidTemperature ? temperatureValue : "Not set");

const ExperimentForm = ({
  createMutation,
  derived,
  form,
  handleCreate,
  sceneOptions,
}: ExperimentFormProps) => {
  const sceneListContent = getSceneListContent({
    isError: sceneOptions.query.isError,
    isLoading: sceneOptions.query.isLoading,
    onToggle: form.handleSceneToggle,
    scenes: sceneOptions.scenes,
    selectedSceneIds: form.state.selectedSceneIds,
  });
  const selectionLabel = getSceneSelectionLabel(derived.selectedSceneCount);
  const totalLabel = getSceneTotalLabel(
    sceneOptions.scenes.length,
    sceneOptions.total
  );

  return (
    <form onSubmit={handleCreate} className="rounded-lg border p-4 space-y-4">
      <div className="space-y-1">
        <label className="text-sm font-medium" htmlFor="experiment-name">
          Name
        </label>
        <input
          id="experiment-name"
          name="name"
          type="text"
          value={form.state.name}
          onChange={form.handleInputChange}
          placeholder="New experiment"
          className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          required
        />
      </div>

      <div className="space-y-1">
        <label className="text-sm font-medium" htmlFor="experiment-description">
          Description
        </label>
        <textarea
          id="experiment-description"
          name="description"
          value={form.state.description}
          onChange={form.handleInputChange}
          placeholder="Optional summary for this experiment"
          className="min-h-[90px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-1">
          <label className="text-sm font-medium" htmlFor="experiment-provider">
            Provider
          </label>
          <select
            id="experiment-provider"
            name="provider"
            value={form.state.provider}
            onChange={form.handleSelectChange}
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
            name="modelName"
            type="text"
            value={form.state.modelName}
            onChange={form.handleInputChange}
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
            name="temperature"
            type="number"
            min="0"
            max="2"
            step="0.1"
            value={form.state.temperature}
            onChange={form.handleInputChange}
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
                value={condition}
                checked={form.state.selectedConditions.includes(condition)}
                onChange={form.handleConditionToggle}
                className="h-4 w-4"
              />
              {condition}
            </label>
          ))}
        </div>
        {derived.orderedConditions.length === 0 && (
          <div className="text-xs text-destructive">
            Select at least one condition.
          </div>
        )}
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="text-sm font-medium">Scenes</div>
          {derived.selectedSceneCount > 0 && (
            <button
              type="button"
              onClick={form.handleClearScenes}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Clear selection
            </button>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <input
            type="text"
            name="sceneSearch"
            value={form.state.sceneSearch}
            onChange={form.handleInputChange}
            placeholder="Search by scene id..."
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring md:w-64"
          />
          <select
            name="sceneSplit"
            value={form.state.sceneSplit}
            onChange={form.handleSelectChange}
            className="flex h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            <option value="">All splits</option>
            <option value="train">Train</option>
            <option value="dev">Dev</option>
            <option value="test">Test</option>
          </select>
        </div>
        <div className="max-h-56 overflow-auto rounded-md border">
          {sceneListContent}
        </div>
        <div className="text-xs text-muted-foreground">{selectionLabel}</div>
        {totalLabel && (
          <div className="text-xs text-muted-foreground">{totalLabel}</div>
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
          disabled={!derived.canSubmit || createMutation.isPending}
          className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {createMutation.isPending ? "Creating..." : "Create Experiment"}
        </button>
        <Link
          to="/experiments"
          className="rounded-md border px-4 py-2 text-sm hover:bg-muted"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
};

const ExperimentSummary = ({ derived, formState }: ExperimentSummaryProps) => {
  const conditionsLabel = getConditionsLabel(derived.orderedConditions);
  const modelLabel = getModelLabel(
    formState.provider,
    derived.trimmedModelName
  );
  const previewLabel = getScenePreviewLabel(
    derived.previewSceneIds,
    derived.remainingSceneCount
  );
  const scenesLabel = getScenesLabel(derived.selectedSceneCount);
  const temperatureLabel = getTemperatureLabel(
    derived.hasValidTemperature,
    derived.temperatureValue
  );

  return (
    <aside className="rounded-lg border p-4 space-y-4">
      <div>
        <h2 className="text-sm font-semibold">Summary</h2>
        <div className="mt-2 space-y-2 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Name</span>
            <span>{derived.trimmedName || "Not set"}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Status</span>
            <span>Draft</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Model</span>
            <span>{modelLabel}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Temperature</span>
            <span>{temperatureLabel}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Conditions</span>
            <span>{conditionsLabel}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Scenes</span>
            <span>{scenesLabel}</span>
          </div>
          {previewLabel && (
            <div className="text-xs text-muted-foreground">{previewLabel}</div>
          )}
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Split filter</span>
            <span>{derived.splitLabel}</span>
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
  );
};

const NewExperimentPage = () => {
  const form = useExperimentFormState();
  const derived = getExperimentDerivedState(form.state);
  const sceneOptions = useSceneOptions(
    form.state.sceneSplit,
    derived.trimmedSceneSearch
  );
  const createMutation = useCreateExperimentMutation();
  const handleCreate = useCreateExperimentHandler({
    canSubmit: derived.canSubmit,
    createMutation,
    derived,
    formState: form.state,
  });

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
        <ExperimentForm
          createMutation={createMutation}
          derived={derived}
          form={form}
          handleCreate={handleCreate}
          sceneOptions={sceneOptions}
        />
        <ExperimentSummary derived={derived} formState={form.state} />
      </div>
    </div>
  );
};

export const Route = createFileRoute("/experiments/new")({
  component: NewExperimentPage,
});
