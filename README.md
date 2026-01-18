# LLM Evaluation Runner

TypeScript/Bun toolkit for executing A0–A3 translation experiments on a shared
JSONL dataset. The runtime focuses on reproducible CLI workflows, JSONL logging,
promptfoo-based CI gates, and offline DSPy optimizations that ship artifacts back
to the TypeScript pipeline.

## Features

- **A0–A3 orchestration**: run baseline, stateful, verify/repair, and combined
  pipelines from a single CLI on the same dataset.
- **State + constraints** builders: normalize constraints and optionally derive
  state facts for downstream components.
- **Verify → repair loop**: configurable `maxRepairs`, hard check failures, and
  LLM-driven issues feed directly into the repairer.
- **Evaluation & logging**: hard checks + judge scores, per-sample JSONL logs,
  and summary/extraction utilities.
- **promptfoo integration**: Custom Script Provider bridges the runtime so CI
  can gate on regressions.
- **DSPy handoff**: Python stub illustrates how to export prompt artifacts that
  the TypeScript runtime can consume.
- **Langfuse hooks**: lightweight tracer façade you can wire to real Langfuse
  creds when available.

## Project Layout

```
configs/          YAML runtime configs (e.g., `configs/mock.yaml`)
datasets/         Sample JSONL datasets
promptfoo/        promptfoo config + provider script
python/           DSPy optimizer stub emitting artifacts
src/cli/          CLI entrypoints (run, aggregate, extract, run-one)
src/pipeline/     State, translator, verifier, repairer, judge, runner
src/llm/          Provider abstraction, cache, rate limiter
runs/             Output JSONL + resolved prompts (gitignored)
```

## Quick Paths

- **Configs**: `configs/*.yaml` (e.g., `configs/mock.yaml`, `configs/openai-dev.yaml`)
- **Datasets**: `datasets/*.jsonl` (e.g., `datasets/dev.sample.jsonl`, `datasets/dev.complex.jsonl`)
- **Run outputs**: `runs/*.jsonl` (the `--output` file you pass to `run.ts`)
- **Prompt dumps**: `runs/prompts/<runId>/*.txt` (resolved templates per run)
- **Summaries**: `runs/*.csv` (from `src/cli/aggregate.ts`)
- **Failure buckets**: `runs/*failures*.jsonl` (from `src/cli/extract-failures.ts`)
- **Prompt artifacts**: `artifacts/dspy/**` (DSPy-exported prompt JSON)
- **Error type glossary**: `docs/error-types.md`
- **API keys**: `.env` (e.g., `OPENAI_API_KEY`)

## Setup

```bash
cd llm-eval-runner
bun install
```

> Bun writes caches outside the repo; if sandboxing blocks it, re-run commands
> with the provided approval flow.

## Deployment (Railway Preview)

See `docs/railway-preview.md` for the auto-deploy and preview environment
behavior.

## Running Experiments

### Conditions (A0–A3)

- **A0**: translate only (no state, no verify/repair)
- **A1**: state + translate (no verify/repair)
- **A2**: translate + verify/repair (no state)
- **A3**: state + translate + verify/repair

Execute all A0–A3 conditions on the sample dataset:

```bash
bun run tsx src/cli/run.ts \
  --config configs/mock.yaml \
  --input datasets/dev.sample.jsonl \
  --output runs/mock-dev.jsonl \
  --overwrite
```

Outputs:

- `runs/mock-dev.jsonl`: per-sample × condition run records.
- `runs/prompts/<runId>/*.txt`: fully resolved prompts for reproduction.

### Aggregation & Failure Extraction

Summaries (CSV by default):

```bash
bun run tsx src/cli/aggregate.ts \
  --runs runs/mock-dev.jsonl \
  --output runs/summary.csv
```

Failure buckets for follow-up or Langfuse dataset ingestion:

```bash
bun run tsx src/cli/extract-failures.ts \
  --runs runs/mock-dev.jsonl \
  --threshold 0.88 \
  --output runs/failures.jsonl
```

### Single-sample Runner (promptfoo hook)

`run-one` executes a single dataset sample for a given condition and prints the
final translation (or the entire JSON record):

```bash
cat <<'JSON' > /tmp/sample.json
{"id":"debug","ja":{"text":"テストです。"}}
JSON

bun run tsx src/cli/run-one.ts \
  --config configs/mock.yaml \
  --condition A3 \
  --sample /tmp/sample.json \
  --output-format json
```

When `--sample` points to a JSON file containing one dataset entry (or when the
record is piped via stdin), the command runs fully in-memory without touching
the run logs.

## Config & Data Schemas

- **Input JSONL** (`datasets/*.jsonl`): each line is a dataset sample with
  `id`, `ja.text`, optional `ja.context`, optional `constraints`, and optional
  `reference.en`.
- **Output JSONL**: matches the spec from the requirements doc
  (`draft/final/verifier/scores/usage/timing/state/...`).
- **Configuration** (`configs/mock.yaml`):
  - `runSettings`: concurrency, rate limits, cache dir, prompt dump dir.
  - `defaults.constraints`: fallback constraint structure merged with each
    sample.
  - `components.*.model`: provider + model metadata (`mock`, `openai`, ...).
  - `components.*.prompt`: inline text/file/artifact reference overrides.
  - `promptArtifacts`: map of artifact identifiers to JSON paths (consumed via
    `prompt.artifact`).

See `src/config/schema.ts` for the full Zod schema.

## promptfoo Integration

The repo includes a ready-to-run promptfoo config that drives the runtime via a
Custom Script Provider.

```bash
bunx promptfoo@latest eval -c promptfoo/promptfooconfig.yaml
```

- `promptfoo/provider.ts` reads `PROMPTFOO_VARS.sample`, invokes the TypeScript
  runner in-memory, and prints the final translation.
- `promptfoo/tests.dev.jsonl` stores test cases + assertions (JavaScript
  predicates are evaluated by promptfoo).
- Adjust `RUNTIME_CONFIG`/`RUNTIME_CONDITION` env vars in the config to target
  different experiment setups.

## DSPy Artifact Workflow

1. Optimize prompts/offline strategies in Python (see `python/optimizer.py`).
2. Export JSON artifacts to `artifacts/dspy/<runId>/translator.json` with
   fields such as `systemPrompt`, `template`, `fewShots`, `params`, and
   `provenance`.
3. Reference the artifact path from the TypeScript config via
   `components.translator.prompt.artifact`.
4. The runtime stores `artifactHash` implicitly via the resolved prompt dumps
   so A/B diffs stay reviewable.

## Langfuse Hooks

Set `langfuse.enabled: true` in the config and provide environment variables
(e.g., `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`, `LANGFUSE_HOST`) to forward
trace/span metadata. The current tracer writes structured logs via the CLI, so
wiring an actual Langfuse SDK later only requires swapping the implementation in
`src/logging/langfuse.ts`.

## Future Modeling Plan (Draft)

See `docs/future-modeling.md`.

## Next Steps / Ideas

1. Implement real LLM providers (OpenAI, Anthropic) by supplying API keys and
   toggling `provider` in the config.
2. Extend hard checks and verify/repair heuristics with richer constraint IDs so
   downstream Langfuse datasets can focus on a subset of failure modes.
3. Teach the judge to blend reference-based metrics (BLEU, COMET) with the LLM
   median for hybrid scoring.
4. Replace `python/optimizer.py` with a DSPy `MIPROv2` program and wire the
   resulting artifact to the translator/repairer prompts.
5. Add GitHub Actions workflow that runs `bun run build` + `bunx promptfoo eval`
   to gate PRs on regression thresholds.
