# The Project Management MVP web app

## Business Requirements

This project is building a Project Management App. Key features:
- Users can create an account, sign in, change their password and delete
  their account
- Each user has any number of Kanban boards, and can create, rename, describe,
  switch between and delete them
- Boards have columns that can be added, renamed, reordered and deleted
- Cards can be added, edited (title, details, priority, due date, labels),
  moved with drag and drop (mouse or keyboard), searched and deleted
- Each board has its own colored labels; cards have checklists with progress
- Cards can be filtered by priority, label and due date
- There is an AI chat feature in a sidebar; the AI can create / edit / move
  cards, apply labels and manage checklist items on the current board

## Limitations

A demo account (`user` / `password`) is seeded on first run.

This runs locally in a single Docker container; the SQLite database is not
persisted across container rebuilds.

Boards are private to their owner; there is no sharing or collaboration yet.

The full board (all column/card titles and details) is sent to the LLM as context on
every chat turn, and the AI's proposed operations are applied directly with no
confirmation step. Since card text is user-editable free text, this is a known prompt-injection
surface (a card title could contain adversarial instructions read back by the model
on a later turn). Operations are confined to the chat's own board and the
signed-in user's data, so an injection cannot reach another user; revisit
before adding shared boards.

## Technical Decisions

- NextJS frontend
- Python FastAPI backend, including serving the static NextJS site at /
- Everything packaged into a Docker container
- Use "uv" as the package manager for python in the Docker container
- Use OpenRouter for the AI calls. An OPENROUTER_API_KEY is in .env in the project root
  (see `.env.example`; boards and accounts work without it, only AI chat
  requires it, and an optional SESSION_SECRET keeps sign-ins across restarts)
- Use `openai/gpt-oss-120b` as the model
- Use SQLLite local database for the database, creating a new db if it doesn't exist
- Start and Stop server scripts for Mac, PC, Linux in scripts/

## Starting Point

A working MVP of the frontend has been built and is already in frontend. This is not yet designed for the Docker setup. It's a pure frontend-only demo.

## Color Scheme

- Accent Yellow: `#ecad0a` - accent lines, highlights
- Blue Primary: `#209dd7` - links, key sections
- Purple Secondary: `#753991` - submit buttons, important actions
- Dark Navy: `#032147` - main headings
- Gray Text: `#888888` - supporting text, labels

## Coding standards

1. Use latest versions of libraries and idiomatic approaches as of today
2. Keep it simple - NEVER over-engineer, ALWAYS simplify, NO unnecessary defensive programming. No extra features - focus on simplicity.
3. Be concise. Keep README minimal. IMPORTANT: no emojis ever
4. When hitting issues, always identify root cause before trying a fix. Do not guess. Prove with evidence, then fix the root cause.

## Working documentation

All documents for planning and executing this project will be in the docs/ directory.
Please review the docs/PLAN.md document before proceeding.