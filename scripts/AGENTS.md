# Scripts

Start/stop scripts for running the app in Docker.

- `start.sh` / `stop.sh` — Mac and Linux (bash).
- `start.bat` / `stop.bat` — Windows.

`start` builds the image from the root `Dockerfile`, removes any existing
container of the same name, and runs a new one with `.env` passed via
`--env-file` (so `OPENROUTER_API_KEY` is available at runtime without baking
secrets into the image), publishing port 8000. `stop` removes the running
container.