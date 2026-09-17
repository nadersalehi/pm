# Scripts

Start/stop scripts for running the app in Docker.

- `start.sh` / `stop.sh` — Mac and Linux (bash).
- `start.bat` / `stop.bat` — Windows.

`start` builds the image from the root `Dockerfile`, removes any existing
container of the same name, and runs a new one on port 8000. If a `.env` file
exists in the repo root it is passed with `--env-file` (see `.env.example`:
`OPENROUTER_API_KEY` for AI chat, optional `SESSION_SECRET` so sign-ins
survive restarts); without one the app still runs, minus AI chat. Secrets are
never baked into the image. `stop` removes the running container.

- `test-e2e-full.sh` — builds and runs its own container (`pm-app-e2e`),
  waits up to 30s for `GET /api/health` (failing with the container logs if
  it never becomes ready), runs the frontend's full-stack Playwright suite
  against it (`npm run test:e2e:full` calls this script), and always removes
  the container on exit via a `trap`. It publishes port 8000 like `start.sh`,
  so stop a running `pm-app` container first. See `frontend/AGENTS.md`'s
  Testing section for what the suite covers.
