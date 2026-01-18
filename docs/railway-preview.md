# Railway Preview Deployments

This repo is set up to deploy the API (`web`) and serve the UI (`web/app`)
from a single Railway service with PR preview URLs.

## Build & Start Commands

Use these at the repo root:

- Build: `bun run build`
- Start: `bun run start`

Under the hood:

- `build` runs `deploy:build` which installs `web` + `web/app` deps and builds
  the Vite UI into `web/app/dist`.
- `start` runs `deploy:start` which starts the API in `web` (it serves the UI
  from `web/app/dist`).

## Preview Environments

1. Connect the GitHub repo in Railway.
2. Enable Preview Environments for the project/service.
3. On each PR, Railway creates a preview deployment and a URL.

The preview URL is shown:

- Railway UI → Deployments → Preview
- GitHub PR → Checks/Deployments

## Environment Variables

- `PORT`: set by Railway. Do not override unless required by Railway UI.
- `DATABASE_URL`: SQLite file path. Recommended for previews: `/tmp/eval.db`.
- `SEED_DATABASE`: if `true` or `1`, force seeding on boot.
- `SEED_SCENES_PATH`: JSONL path for seed data (default:
  `datasets/synth.scenes.jsonl`).
- `SEED_SCENES_SPLIT`: split name for seeded scenes (default: `dev`).
- `OPENAI_API_KEY`: required to run the seeded preview experiment (OpenAI).

## Database Behavior (Preview)

- The API creates tables on startup if they do not exist.
- If the DB is empty, it auto-seeds with `datasets/synth.scenes.jsonl` when:
  - `DATABASE_URL` starts with `/tmp/`, or
  - `SEED_DATABASE=true` is set.
- When seeding is enabled and no experiments exist, a sample experiment is
  inserted for the preview UI.

Preview DBs are ephemeral when stored under `/tmp`.

## UI vs API Paths

- `/` serves the UI.
- `/api` shows API metadata.
- `/api/*` serves JSON endpoints (e.g. `/api/scenes`).
