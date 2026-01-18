import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { fetchScene } from "@/lib/api";
import type { Scene, Segment, FatalRisk, CharacterState } from "@/lib/api";

export const Route = createFileRoute("/scenes/$sceneId")({
  component: SceneDetailPage,
});

function SceneDetailPage() {
  const { sceneId } = Route.useParams();

  const { data, isLoading, error } = useQuery({
    queryKey: ["scene", sceneId],
    queryFn: () => fetchScene(sceneId),
  });

  if (isLoading) {
    return <div className="text-muted-foreground">Loading...</div>;
  }

  if (error || !data) {
    return <div className="text-destructive">Failed to load scene</div>;
  }

  const scene = data.data;

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
              {scene.segments.map((segment) => (
                <SegmentCard
                  key={segment.t}
                  segment={segment}
                  risks={scene.evalTargets.fatal_risks.filter(
                    (r) => r.t === segment.t,
                  )}
                />
              ))}
            </div>
          </Section>

          <Section title="Fatal Risks">
            {scene.evalTargets.fatal_risks.length === 0 ? (
              <div className="text-sm text-muted-foreground">
                No fatal risks defined
              </div>
            ) : (
              <div className="space-y-2">
                {scene.evalTargets.fatal_risks.map((risk, i) => (
                  <RiskCard key={i} risk={risk} />
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
              {Object.entries(scene.characterStates).map(([name, state]) => (
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
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border p-4">
      <h2 className="mb-3 font-semibold">{title}</h2>
      {children}
    </div>
  );
}

function SegmentCard({
  segment,
  risks,
}: {
  segment: Segment;
  risks: FatalRisk[];
}) {
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
}

function RiskCard({ risk }: { risk: FatalRisk }) {
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
      {risk.linked_state.length > 0 && (
        <div className="mt-2 text-xs text-muted-foreground">
          Linked: {risk.linked_state.join(", ")}
        </div>
      )}
    </div>
  );
}

function WorldStateView({ worldState }: { worldState: Scene["worldState"] }) {
  return (
    <div className="space-y-3 text-sm">
      {worldState.facts.length > 0 && (
        <div>
          <div className="font-medium text-muted-foreground">Facts</div>
          <div className="mt-1 space-y-1">
            {worldState.facts.map((fact) => (
              <div key={fact.fact_id} className="rounded bg-muted/50 px-2 py-1">
                <span className="text-xs text-muted-foreground">
                  [{fact.fact_id}]
                </span>{" "}
                {fact.proposition}
                <span className="ml-2 text-xs text-muted-foreground">
                  t={fact.valid_from}
                  {fact.valid_to !== null ? `→${fact.valid_to}` : "+"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {worldState.entities.length > 0 && (
        <div>
          <div className="font-medium text-muted-foreground">Entities</div>
          <div className="mt-1 flex flex-wrap gap-1">
            {worldState.entities.map((entity) => (
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

      {worldState.events.length > 0 && (
        <div>
          <div className="font-medium text-muted-foreground">Events</div>
          <div className="mt-1 space-y-1">
            {worldState.events.map((event) => (
              <div key={event.event_id} className="text-xs">
                t={event.t}: {event.type} ({event.participants.join(", ")})
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function CharacterStateCard({
  name,
  state,
}: {
  name: string;
  state: CharacterState;
}) {
  return (
    <div className="rounded border p-3">
      <div className="font-medium">{name}</div>
      <div className="mt-2 space-y-2 text-sm">
        {state.beliefs.length > 0 && (
          <div>
            <span className="text-xs text-muted-foreground">Beliefs:</span>
            {state.beliefs.map((b, i) => (
              <div key={i} className="text-xs">
                t={b.t}: {b.about} = {JSON.stringify(b.value)} (
                {(b.confidence * 100).toFixed(0)}%)
              </div>
            ))}
          </div>
        )}
        {state.goals.length > 0 && (
          <div>
            <span className="text-xs text-muted-foreground">Goals:</span>
            {state.goals.map((g, i) => (
              <div key={i} className="text-xs">
                t={g.t}: {g.content}
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
}

function ConstraintsView({
  constraints,
}: {
  constraints: Scene["constraints"];
}) {
  return (
    <div className="space-y-2 text-sm">
      {constraints.glossary.length > 0 && (
        <div>
          <div className="font-medium text-muted-foreground">Glossary</div>
          <div className="mt-1 space-y-1">
            {constraints.glossary.map((entry, i) => (
              <div key={i} className="text-xs">
                {entry.ja} → {entry.en}
                {entry.strict && (
                  <span className="ml-1 text-destructive">*</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
      {constraints.tone && (
        <div className="text-xs">
          <span className="text-muted-foreground">Tone:</span>{" "}
          {constraints.tone}
        </div>
      )}
      {constraints.register && (
        <div className="text-xs">
          <span className="text-muted-foreground">Register:</span>{" "}
          {constraints.register}
        </div>
      )}
    </div>
  );
}
