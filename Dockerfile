FROM node:22-slim AS frontend-build

WORKDIR /app/frontend

COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

COPY frontend/ ./
RUN npm run build

FROM python:3.13-slim

RUN pip install --no-cache-dir uv

WORKDIR /app

COPY backend/pyproject.toml backend/uv.lock ./
RUN uv sync

COPY backend/app ./app
COPY --from=frontend-build /app/frontend/out ./app/static

EXPOSE 8000

CMD ["uv", "run", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
