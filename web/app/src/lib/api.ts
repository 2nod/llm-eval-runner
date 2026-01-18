const API_BASE = "/api";

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
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
}

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
  conditions: Array<"A0" | "A1" | "A2" | "A3">;
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
  aggregated: Array<Record<string, unknown>>;
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

export async function fetchScenes(
  params: SceneListParams = {},
): Promise<PaginatedResponse<Scene>> {
  const searchParams = new URLSearchParams();
  if (params.split) searchParams.set("split", params.split);
  if (params.search) searchParams.set("search", params.search);
  if (params.limit) searchParams.set("limit", String(params.limit));
  if (params.offset) searchParams.set("offset", String(params.offset));

  const query = searchParams.toString();
  return fetchJson(`/scenes${query ? `?${query}` : ""}`);
}

export async function fetchScene(id: string): Promise<{ data: Scene }> {
  return fetchJson(`/scenes/${id}`);
}

export async function fetchExperiments(): Promise<
  PaginatedResponse<Experiment>
> {
  return fetchJson("/experiments");
}

export async function createExperiment(
  payload: CreateExperimentInput,
): Promise<{ data: Experiment }> {
  return fetchJson("/experiments", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function fetchExperiment(
  id: string,
): Promise<{ data: Experiment }> {
  return fetchJson(`/experiments/${id}`);
}

export async function fetchExperimentResults(
  id: string,
): Promise<{ data: ExperimentResults }> {
  return fetchJson(`/experiments/${id}/results`);
}

export async function startExperiment(
  id: string,
): Promise<StartExperimentResponse> {
  return fetchJson(`/experiments/${id}/start`, { method: "POST" });
}

export async function fetchStats(): Promise<{ data: StatsOverview }> {
  return fetchJson("/stats/overview");
}
