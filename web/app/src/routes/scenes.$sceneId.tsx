import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";

import {
  fetchScene,
  type CharacterState,
  type FatalRisk,
  type Scene,
  type Segment,
} from "@/lib/api";

interface RiskTypeLegendEntry {
  code: FatalRisk["type"];
  label: string;
  description: string;
}

const RISK_TYPE_LEGEND: RiskTypeLegendEntry[] = [
  {
    code: "KL",
    description: "話者が知らない事実や世界状態を翻訳で漏らさない。",
    label: "Knowledge Leak",
  },
  {
    code: "FB",
    description: "話者の誤信を保ち、暗黙的に訂正しない。",
    label: "False Belief",
  },
  {
    code: "REF",
    description: "代名詞・照応の指示対象を正しく保つ。",
    label: "Reference",
  },
  {
    code: "IMPL",
    description: "含意・ぼかしを保ち、明示化しない。",
    label: "Implicature",
  },
  {
    code: "LEX",
    description: "語彙選択・用語選択・用語集違反。",
    label: "Lexical",
  },
  {
    code: "CONS",
    description: "形式/スタイル/制約の違反。",
    label: "Constraint",
  },
];

const RiskLegend = () => (
  <div className="mb-3 rounded border bg-muted/30 p-3 text-xs">
    <div className="font-medium text-foreground">Type legend</div>
    <div className="mt-2 grid gap-2 sm:grid-cols-2">
      {RISK_TYPE_LEGEND.map((entry) => (
        <div key={entry.code} className="flex items-start gap-2">
          <span className="rounded bg-muted px-1.5 py-0.5 text-xs font-semibold text-foreground">
            {entry.code}
          </span>
          <div>
            <div className="text-foreground">{entry.label}</div>
            <div className="text-muted-foreground">{entry.description}</div>
          </div>
        </div>
      ))}
    </div>
  </div>
);

const Section = ({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) => (
  <div className="rounded-lg border p-4">
    <h2 className="mb-3 font-semibold">{title}</h2>
    {children}
  </div>
);

const SegmentCard = ({
  segment,
  risks,
}: {
  segment: Segment;
  risks: FatalRisk[];
}) => {
  const hasRisk = risks.length > 0;

  return (
    <div
      className={`rounded border p-3 ${hasRisk ? "border-destructive/50 bg-destructive/5" : ""}`}
    >
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span>t={segment.t}</span>
        <span className="rounded bg-muted px-1.5">{segment.type}</span>
        {segment.speaker && (
          <span className="font-medium">{segment.speaker}</span>
        )}
        {hasRisk && (
          <span className="ml-auto text-destructive">
            {risks.map((r) => r.type).join(", ")}
          </span>
        )}
      </div>
      <div className="mt-1 text-sm">{segment.text}</div>
    </div>
  );
};

const RiskCard = ({ risk }: { risk: FatalRisk }) => {
  const linkedState = risk.linked_state ?? [];

  return (
    <div className="rounded border border-destructive/30 bg-destructive/5 p-3">
      <div className="flex items-center gap-2 text-xs">
        <span className="font-medium text-destructive">{risk.type}</span>
        <span className="text-muted-foreground">t={risk.t}</span>
        <span className="rounded bg-destructive/20 px-1.5 text-destructive">
          {risk.severity}
        </span>
      </div>
      <div className="mt-1 text-sm">{risk.description}</div>
      {linkedState.length > 0 && (
        <div className="mt-2 text-xs text-muted-foreground">
          Linked: {linkedState.join(", ")}
        </div>
      )}
    </div>
  );
};

const WorldStateView = ({
  worldState,
}: {
  worldState: Scene["worldState"];
}) => {
  const facts = worldState?.facts ?? [];
  const entities = worldState?.entities ?? [];
  const events = worldState?.events ?? [];

  return (
    <div className="space-y-3 text-sm">
      {facts.length > 0 && (
        <div>
          <div className="font-medium text-muted-foreground">Facts</div>
          <div className="mt-1 space-y-1">
            {facts.map((fact) => (
              <div key={fact.fact_id} className="rounded bg-muted/50 px-2 py-1">
                <span className="text-xs text-muted-foreground">
                  [{fact.fact_id}]
                </span>{" "}
                {fact.proposition}
                <span className="ml-2 text-xs text-muted-foreground">
                  t={fact.valid_from}
                  {fact.valid_to === null ? "+" : `→${fact.valid_to}`}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {entities.length > 0 && (
        <div>
          <div className="font-medium text-muted-foreground">Entities</div>
          <div className="mt-1 flex flex-wrap gap-1">
            {entities.map((entity) => (
              <span
                key={entity.id}
                className="rounded bg-muted px-2 py-0.5 text-xs"
              >
                {entity.canonical_name} ({entity.type})
              </span>
            ))}
          </div>
        </div>
      )}

      {events.length > 0 && (
        <div>
          <div className="font-medium text-muted-foreground">Events</div>
          <div className="mt-1 space-y-1">
            {events.map((event) => (
              <div key={event.event_id} className="text-xs">
                t={event.t}: {event.type} ({event.participants.join(", ")})
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

const CharacterStateCard = ({
  name,
  state,
}: {
  name: string;
  state: CharacterState;
}) => {
  const beliefs = state.beliefs ?? [];
  const goals = state.goals ?? [];

  return (
    <div className="rounded border p-3">
      <div className="font-medium">{name}</div>
      <div className="mt-2 space-y-2 text-sm">
        {beliefs.length > 0 && (
          <div>
            <span className="text-xs text-muted-foreground">Beliefs:</span>
            {beliefs.map((belief) => (
              <div key={`${belief.t}-${belief.about}`} className="text-xs">
                t={belief.t}: {belief.about} = {JSON.stringify(belief.value)} (
                {(belief.confidence * 100).toFixed(0)}%)
              </div>
            ))}
          </div>
        )}
        {goals.length > 0 && (
          <div>
            <span className="text-xs text-muted-foreground">Goals:</span>
            {goals.map((goal) => (
              <div key={`${goal.t}-${goal.content}`} className="text-xs">
                t={goal.t}: {goal.content}
              </div>
            ))}
          </div>
        )}
        {state.voice_profile && (
          <div className="text-xs text-muted-foreground">
            Voice: {state.voice_profile.register},{" "}
            {state.voice_profile.politeness}
          </div>
        )}
      </div>
    </div>
  );
};

const ConstraintsView = ({
  constraints,
}: {
  constraints: Scene["constraints"];
}) => {
  const glossary = constraints?.glossary ?? [];

  return (
    <div className="space-y-2 text-sm">
      {glossary.length > 0 && (
        <div>
          <div className="font-medium text-muted-foreground">Glossary</div>
          <div className="mt-1 space-y-1">
            {glossary.map((entry) => (
              <div key={`${entry.ja}-${entry.en}`} className="text-xs">
                {entry.ja} → {entry.en}
                {entry.strict && (
                  <span className="ml-1 text-destructive">*</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
      {constraints?.tone && (
        <div className="text-xs">
          <span className="text-muted-foreground">Tone:</span>{" "}
          {constraints.tone}
        </div>
      )}
      {constraints?.register && (
        <div className="text-xs">
          <span className="text-muted-foreground">Register:</span>{" "}
          {constraints.register}
        </div>
      )}
    </div>
  );
};

const SceneDetailContent = ({ scene }: { scene: Scene }) => {
  const segments = scene.segments ?? [];
  const fatalRisks = scene.evalTargets?.fatal_risks ?? [];
  const characterStates = scene.characterStates ?? {};

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link
          to="/scenes"
          className="text-muted-foreground hover:text-foreground"
        >
          ← Scenes
        </Link>
        <h1 className="text-2xl font-bold">{scene.sceneId}</h1>
        {scene.split && (
          <span className="rounded bg-secondary px-2 py-0.5 text-sm">
            {scene.split}
          </span>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-4">
          <Section title="Segments">
            <div className="space-y-2">
              {segments.map((segment) => (
                <SegmentCard
                  key={segment.t}
                  segment={segment}
                  risks={fatalRisks.filter((risk) => risk.t === segment.t)}
                />
              ))}
            </div>
          </Section>

          <Section title="Fatal Risks">
            <RiskLegend />
            {fatalRisks.length === 0 ? (
              <div className="text-sm text-muted-foreground">
                No fatal risks defined
              </div>
            ) : (
              <div className="space-y-2">
                {fatalRisks.map((risk) => (
                  <RiskCard
                    key={`${risk.type}-${risk.t}-${risk.severity}`}
                    risk={risk}
                  />
                ))}
              </div>
            )}
          </Section>
        </div>

        <div className="space-y-4">
          <Section title="World State">
            <WorldStateView worldState={scene.worldState} />
          </Section>

          <Section title="Character States">
            <div className="space-y-3">
              {Object.entries(characterStates).map(([name, state]) => (
                <CharacterStateCard key={name} name={name} state={state} />
              ))}
            </div>
          </Section>

          <Section title="Constraints">
            <ConstraintsView constraints={scene.constraints} />
          </Section>
        </div>
      </div>
    </div>
  );
};

const SceneDetailPage = () => {
  const { sceneId } = Route.useParams();

  const { data, isLoading, error } = useQuery({
    queryFn: () => fetchScene(sceneId),
    queryKey: ["scene", sceneId],
  });

  if (isLoading) {
    return <div className="text-muted-foreground">Loading...</div>;
  }

  if (error || data === undefined) {
    return <div className="text-destructive">Failed to load scene</div>;
  }

  return <SceneDetailContent scene={data.data} />;
};

export const Route = createFileRoute("/scenes/$sceneId")({
  component: SceneDetailPage,
});
