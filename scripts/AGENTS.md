# Scripts

Start/stop scripts for running the app in Docker.

- `start.sh` / `stop.sh` — Mac and Linux (bash).
- `start.bat` / `stop.bat` — Windows.

`start` builds the image from the root `Dockerfile`, removes any existing
container of the same name, and runs a new one with `.env` passed via
`--env-file` (so `OPENROUTER_API_KEY` is available at runtime without baking
secrets into the image), publishing port 8000. `stop` removes the running
container.

- `test-e2e-full.sh` — builds and runs its own container (`pm-app-e2e`,
  separate name from `start.sh`'s so the two don't collide), waits for
  `/api/hello` to respond, runs `frontend`'s full-stack Playwright suite
  against it (`npm run test:e2e:full` calls this script), and always removes
  the container on exit via a `trap` (pass or fail). See
  `frontend/AGENTS.md`'s Testing section for what that suite covers.