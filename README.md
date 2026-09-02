# Migration AI Platform

AI-Assisted SAP Business Objects → Power BI Migration Platform (MVP).

## Overview

This platform demonstrates an end-to-end migration pipeline:

```
Business Objects Export → Parser → MSpec → AI Semantic Mapping → Human Review → Power BI Generator → Validation
```

The core differentiator is **AI-powered semantic mapping** between legacy BO reports and the existing Pluto Gold Layer / Power BI semantic model.

## Quick Start

### Prerequisites

- Docker & Docker Compose
- Node.js 20+ (for local frontend dev)
- Python 3.12+ (for local backend dev)

### Run with Docker Compose

```bash
cp .env.example .env
docker compose up --build
```

- Frontend: http://localhost:5173
- Backend API: http://localhost:8000
- API Docs: http://localhost:8000/docs

### Local Development

**Backend:**
```bash
cd backend
pip install -r requirements.txt
# Start PostgreSQL with pgvector (or use docker compose up postgres)
alembic upgrade head
uvicorn app.main:app --reload --port 8000
```

**Frontend:**
```bash
cd frontend
npm install
npm run dev
```

## Demo Workflow

1. **Create Project** — Projects → Create Migration Project
2. **Upload BO Export** — Upload `sample-data/fixed-telco-orders.zip`
3. **Parse** — Parsing tab → Start Parsing
4. **Import Pluto Model** — Semantic Mapping tab → Import Pluto Model (`sample-data/pluto/pluto-model.json`)
5. **Import Glossary** — Import Glossary (`sample-data/pluto/glossary.json`)
6. **Run AI Mapping** — Run AI Mapping (`AI_MODE=mock` by default; set `live` + API key for real LLM)
7. **Review Mappings** — Approve/reject/modify in the Semantic Mapping Workbench
8. **Generate PBI** — Validation tab → Generate PBI
9. **Validate** — Run Validation
10. **Download** — Results tab → Download Power BI Package

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `AI_MODE` | `mock` | `mock` (offline) or `live` (Cursor Cloud Agents API) |
| `CURSOR_API_KEY` | — | Your `crsr_...` key from [Cursor Dashboard → API Keys](https://cursor.com/dashboard) |
| `CURSOR_MODEL` | `auto` | Model id (`auto`, `composer-2.5`, etc.) |
| `CURSOR_API_BASE_URL` | `https://api.cursor.com` | Cursor API base URL |
| `CURSOR_AGENT_POOL` | — | Optional sandbox pool name for cloud agents |
| `OPENAI_API_KEY` | — | Optional; only used if `CURSOR_API_KEY` is empty |
| `DATABASE_URL` | postgres URL | PostgreSQL connection |
| `STORAGE_PATH` | `/data/artifacts` | Runtime per-project storage (uploads, extracted source, generated output) |

### Per-project storage layout

Runtime uploads mirror the `sample-data/projects/{template}/` structure:

```
{STORAGE_PATH}/{project_id}/
  uploads/{artifact_id}/{filename}   ← uploaded BO exports (only these are parsed)
  source/extracted/                  ← unpacked ZIP (parser input)
  generated/                         ← Power BI output
```

`sample-data/` is read-only demo templates — parsing never reads from it directly.

### Enable live LLM

**Recommended:** edit **`secrets/cursor.env`** (gitignored — safe for your key):

```bash
./scripts/setup-secrets.sh   # first time only
```

Then open **`secrets/cursor.env`**:

```bash
AI_MODE=live
CURSOR_API_KEY=crsr_your-key-here
CURSOR_MODEL=auto
```

Restart: `docker compose up -d --build backend`

Live mode uses the **Cursor Python SDK** (`cursor-sdk`) with your `crsr_` key — no OpenAI key required. Responses typically take 5–15 seconds per request.

## Architecture

- **Backend:** FastAPI modular monolith with async SQLAlchemy
- **Frontend:** React + TypeScript + Vite + Tailwind
- **Database:** PostgreSQL with JSONB and pgvector
- **AI:** Configurable LLM abstraction (mock + OpenAI-compatible live mode)
- **Storage:** Local filesystem with S3-ready abstraction

## Sample Data

- `sample-data/business-objects/` — Synthetic BO export (Fixed Telco Orders)
- `sample-data/pluto/pluto-model.json` — Pluto semantic model
- `sample-data/pluto/glossary.json` — Business glossary
- `sample-data/fixed-telco-orders.zip` — Packaged demo upload

## Tests

```bash
cd backend
pytest
```

```bash
cd frontend
npm run build
```

## API Documentation

- Swagger UI: http://localhost:8000/docs
- See [docs/api.md](docs/api.md) for endpoint reference
