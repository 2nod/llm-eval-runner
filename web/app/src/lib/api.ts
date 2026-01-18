const API_BASE = "/api";

const fetchJson = async <T>(url: string, options?: RequestInit): Promise<T> => {
  const response = await fetch(`${API_BASE}${url}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error ?? `HTTP ${response.status}`);
  }

  return response.json();
};

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  };
}

export interface Scene {
  id: string;
  sceneId: string;
  langSrc: string;
  langTgt: string;
  segments: Segment[];
  worldState: WorldState;
  characterStates: Record<string, CharacterState>;
  constraints: Constraints;
  evalTargets: EvalTargets;
  split: "train" | "dev" | "test" | null;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface Segment {
  t: number;
  type: "narration" | "dialogue" | "sfx";
  speaker?: string;
  text: string;
}

export interface WorldState {
  entities: Entity[];
  events: Event[];
  facts: Fact[];
  relations: Relation[];
}

export interface Entity {
  id: string;
  type: string;
  canonical_name: string;
  aliases: string[];
}

export interface Event {
  event_id: string;
  t: number;
  type: string;
  participants: string[];
  status: string;
}

export interface Fact {
  fact_id: string;
  proposition: string;
  valid_from: number;
  valid_to: number | null;
  confidence: number;
  evidence_span: number[];
}

export interface Relation {
  a: string;
  b: string;
  type: string;
  valid_from: number;
  valid_to: number | null;
  confidence?: number;
}

export interface CharacterState {
  observations: Observation[];
  beliefs: Belief[];
  goals: Goal[];
  voice_profile?: VoiceProfile;
}

export interface Observation {
  t: number;
  source: string;
  content: string;
  certainty: number;
  evidence_span: number[];
}

export interface Belief {
  t: number;
  about: string;
  value: unknown;
  confidence: number;
  derived_from: string[];
}

export interface Goal {
  t: number;
  content: string;
  urgency?: number;
  confidence: number;
}

export interface VoiceProfile {
  register: string;
  politeness: string;
  catchphrases?: string[];
  taboo_words?: string[];
  snark?: string;
}

export interface Constraints {
  glossary: GlossaryEntry[];
  tone?: string;
  register?: string;
  format?: FormatConstraint;
  bannedPatterns: string[];
  allowJapaneseTokens: string[];
  style_guide?: StyleGuide;
  layout?: LayoutConstraint;
  rating?: string;
  publisher_rules: string[];
}

export interface GlossaryEntry {
  ja: string;
  en: string;
  strict?: boolean;
}

export interface FormatConstraint {
  keepLineBreaks?: boolean;
  maxChars?: number;
  noExtraPrefixSuffix?: boolean;
}

export interface StyleGuide {
  target?: string;
  keep_vagueness?: boolean;
  keep_uncertainty_markers?: boolean;
}

export interface LayoutConstraint {
  max_chars?: number;
  max_lines?: number;
}

export interface EvalTargets {
  fatal_risks: FatalRisk[];
}

export interface FatalRisk {
  t: number;
  type: "KL" | "FB" | "REF" | "IMPL" | "LEX" | "CONS";
  severity: "fatal" | "major" | "minor";
  description: string;
  linked_state: string[];
  evidence_span?: number[];
}

export interface Experiment {
  id: string;
  name: string;
  description?: string;
  config: Record<string, unknown>;
  conditions: string[];
  sceneFilter?: Record<string, unknown>;
  status: "draft" | "running" | "completed" | "failed";
  createdAt: string;
  updatedAt: string;
}

export interface CreateExperimentInput {
  name: string;
  description?: string;
  config: Record<string, unknown>;
  conditions: ("A0" | "A1" | "A2" | "A3")[];
  sceneFilter?: {
    split?: "train" | "dev" | "test";
    tags?: string[];
    sceneIds?: string[];
  };
}

export interface StartExperimentResponse {
  message: string;
  data: {
    id: string;
    status: Experiment["status"];
    runId: string;
  };
}

export interface Run {
  id: string;
  experimentId?: string | null;
  runId: string;
  sceneId?: string | null;
  condition: "A0" | "A1" | "A2" | "A3";
  segmentT?: number | null;
  draftEn?: string | null;
  finalEn?: string | null;
  issues?: unknown[] | null;
  hardChecks?: unknown[] | null;
  scores?: Record<string, unknown> | null;
  usage?: Record<string, unknown> | null;
  timingMs?: Record<string, unknown> | null;
  state?: Record<string, unknown> | null;
  status?: "ok" | "needs_review" | "error" | null;
  createdAt?: string | null;
}

export interface ExperimentResults {
  experiment: Experiment;
  runs: Run[];
  aggregated: Record<string, unknown>[];
  scenes?: Scene[];
}

export interface StatsOverview {
  totalScenes: number;
  totalExperiments: number;
  totalRuns: number;
  totalAnnotations: number;
  scenesBySplit: Record<string, number>;
}

export interface SceneListParams {
  split?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

const buildSceneQuery = (params: SceneListParams): string => {
  const entries: [string, string][] = [];

  if (params.limit) {
    entries.push(["limit", String(params.limit)]);
  }
  if (params.offset) {
    entries.push(["offset", String(params.offset)]);
  }
  if (params.search) {
    entries.push(["search", params.search]);
  }
  if (params.split) {
    entries.push(["split", params.split]);
  }

  return new URLSearchParams(entries).toString();
};

export const fetchScenes = (
  params: SceneListParams = {}
): Promise<PaginatedResponse<Scene>> => {
  const query = buildSceneQuery(params);
  return fetchJson(`/scenes${query ? `?${query}` : ""}`);
};

export const fetchScene = (id: string): Promise<{ data: Scene }> =>
  fetchJson(`/scenes/${id}`);

export const fetchExperiments = (): Promise<PaginatedResponse<Experiment>> =>
  fetchJson("/experiments");

export const createExperiment = (
  payload: CreateExperimentInput
): Promise<{ data: Experiment }> =>
  fetchJson("/experiments", {
    body: JSON.stringify(payload),
    method: "POST",
  });

export const fetchExperiment = (id: string): Promise<{ data: Experiment }> =>
  fetchJson(`/experiments/${id}`);

export const fetchExperimentResults = (
  id: string
): Promise<{ data: ExperimentResults }> =>
  fetchJson(`/experiments/${id}/results`);

export const startExperiment = (id: string): Promise<StartExperimentResponse> =>
  fetchJson(`/experiments/${id}/start`, { method: "POST" });

export const fetchStats = (): Promise<{ data: StatsOverview }> =>
  fetchJson("/stats/overview");
