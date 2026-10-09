<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="./public/evaly-logo-dark.svg" />
    <source media="(prefers-color-scheme: light)" srcset="./public/evaly-logo.svg" />
    <img src="./public/evaly-logo.svg" alt="Evaly" width="280" />
  </picture>
</p>

<h1 align="center">Evaluate Your Business Wisely</h1>

<p align="center">
  Explore customer context. Discover expansion opportunities. Trace the evidence behind every result.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/React-19-149ECA?style=flat-square&logo=react&logoColor=white" alt="React 19" />
  <img src="https://img.shields.io/badge/TypeScript-5-3178C6?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript 5" />
  <img src="https://img.shields.io/badge/Bun-1.4-14151A?style=flat-square&logo=bun&logoColor=white" alt="Bun 1.4" />
  <img src="https://img.shields.io/badge/FastAPI-009688?style=flat-square&logo=fastapi&logoColor=white" alt="FastAPI" />
  <img src="https://img.shields.io/badge/MySQL-8-4479A1?style=flat-square&logo=mysql&logoColor=white" alt="MySQL 8" />
</p>

<p align="center">
  <a href="#features">Features</a> ·
  <a href="#how-it-works">Workflow</a> ·
  <a href="#getting-started">Getting started</a> ·
  <a href="#documentation">Documentation</a> ·
  <a href="#testing">Testing</a>
</p>

---

## About Evaly

Evaly helps account management and sales teams answer **“Where can we grow revenue from existing customers?”** through a context graph connecting conversations, contacts, contracts, product usage, and support tickets.

Jev through OpenRouter evaluates expansion signals and customer intent. Code calculates estimated value, while the graph makes the underlying sources accessible. Results bring together opportunities, questions to confirm, and next steps.

The KasirNusa dataset covers **40 customers, 5 prospects, and 620 outlets**, with a snapshot date of October 1, 2026. Account Expansion is available for existing customers; four other tracks remain locked. The dashboard interface and source dataset are in Indonesian.

## Features

| Feature                   | What you can do                                                                                          |
| ------------------------- | -------------------------------------------------------------------------------------------------------- |
| **Context graph**         | Search accounts, explore relationships, and open customer context while preserving your canvas position. |
| **Account Expansion**     | Classify interactions, assess intent, review tickets, and get recommended actions.                       |
| **Traceable evidence**    | Distinguish evaluated data from supporting evidence; inspect original messages, contracts, and quotes.   |
| **Readable results**      | Review conclusions, reasons for review, next steps, and value calculations.                              |
| **History and exports**   | Replay saved snapshots, export Markdown/CSV, or delete an individual result with confirmation.           |
| **Light and dark themes** | Follow your device theme or choose a preference, with matching logos and evidence colors.                |

## How it works

**Select an account → Run analysis → Explore evidence → Take action**

1. Click an account in the graph and choose **Account Expansion**. Opening the panel does not call Jev.
2. Choose **Run new analysis** (`Jalankan analisis baru`) or **View saved results** (`Lihat hasil tersimpan`). Replay shows the original evaluation time without a new model request.
3. Follow the workflow, then open **Analysis results** (`Hasil analisis`) for conclusions, review reasons, estimated value, and next steps.
4. Click evidence to open its record and highlight the graph. Use **Focus evidence** (`Fokus bukti`) to center the canvas, then export a summary for follow-up.

<details>
<summary><strong>Inside the workflow: context, Jev, and calculations</strong></summary>

| Stage                       | Role                                                                                                                                |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| **Collect context**         | Retrieve account records and usage summaries from the active MySQL dataset.                                                         |
| **Choice — classification** | Categorize interactions as expansion, complaint, renewal, other, or unclear.                                                        |
| **Score — intent**          | Assess customer expansion messages and related threads: no explicit intent, exploration, concrete plan, or request for quotation.   |
| **Noul — tickets**          | Check whether evidence explicitly requires an issue to be resolved before expansion. An open ticket is not automatically a blocker. |
| **Code + Choice — results** | Extract candidate outlet counts, select a count supported by context, calculate value, and choose a next action.                    |

Purple marks expansion evidence and related threads, blue marks calculation inputs, and yellow marks context or information to confirm. Highlights show the role of sources in the workflow, not the model's internal reasoning.

Each run stores evidence snapshots, Jev responses, the actual model, gateway, rubric version, timestamps, and dataset hash. Older results use the information originally saved and show provenance limitations where applicable.

</details>

## Getting started

**Requirements:** Bun 1.4.2+, Node.js 22+, Python 3.12+, and MySQL 8+ with an application schema and user already created.

Run commands from the Evaly repository root. In the parent workspace, enter `03 Dashboard` first. The following examples use PowerShell on Windows.

### 1. Install dependencies

```powershell
python -m venv .venv
.venv/Scripts/python.exe -m pip install -r requirements.txt
bun install --frozen-lockfile
Copy-Item .env.example .env
```

### 2. Configure the backend

Set your MySQL connection and OpenRouter key in `.env`:

```dotenv
DATABASE_URL=mysql+pymysql://USER:PASSWORD@127.0.0.1:3306/evaly?charset=utf8mb4
OPENROUTER_API_KEY=
OPENROUTER_MODEL=~typesafe/jev-latest
```

Replace `USER` and `PASSWORD`; URL-encode special characters in the password. The key is read only by the backend, and `.env` is excluded from Git. Restart the backend after changing configuration.

A key is required for **new analyses**. The graph, account context, and saved results are accessible without a key once the database is ready.

### 3. Prepare the database and dataset

```powershell
.venv/Scripts/python.exe -m alembic upgrade head
.venv/Scripts/python.exe -m backend.seed
```

The seeder reads 17 files from `data/dataset_kasirnusa`. Runtime reads the active version from MySQL, without SQLite. Imports are transactional and idempotent: the same version is not duplicated, history is preserved, and a newly active dataset is recognized without restarting.

### 4. Start the application

First terminal — backend:

```powershell
.venv/Scripts/python.exe -m uvicorn backend.app:app --host 127.0.0.1 --port 8000
```

Second terminal — frontend:

```powershell
bun run dev
```

Open **[localhost:5173](http://127.0.0.1:5173)**. Vite forwards `/api` requests to the backend. Check database readiness at **[backend readiness](http://127.0.0.1:8000/api/health/ready)**.

Separate frontend/backend images and CI/CD are available for deployment. See the [deployment guide](DEPLOYMENT.md) for server configuration and manual migrations/seeding inside the backend container.

<details>
<summary><strong>Serving a production build and exploring the API</strong></summary>

To serve the frontend build through FastAPI:

```powershell
bun run build
.venv/Scripts/python.exe -m uvicorn backend.app:app --host 127.0.0.1 --port 8000
```

If the backend is already running, restart it after the first build so that `dist` is mounted. Open [localhost:8000](http://127.0.0.1:8000).

| Endpoint                                      | Purpose                                                                                  |
| --------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `GET /api/health`                             | Gateway/model configuration and key availability; does not test OpenRouter connectivity. |
| `GET /api/health/live`                        | Backend process liveness; does not access MySQL or OpenRouter.                           |
| `GET /api/health/ready`                       | MySQL, migrations, and active dataset readiness: `200` when ready, otherwise `503`.      |
| `GET /api/graph?account_id=C02`               | Global graph or account context.                                                         |
| `GET /api/accounts/{id}/context`              | Account sources and context summary.                                                     |
| `POST /api/accounts/{id}/expansion-runs`      | Start analysis; returns `202` with a run ID.                                             |
| `GET /api/accounts/{id}/expansion-runs`       | Account analysis history.                                                                |
| `GET /api/expansion-runs/{run_id}`            | Stage status, results, and errors.                                                       |
| `DELETE /api/expansion-runs/{run_id}`         | Delete one result: `204`; not found: `404`; active run: `409`.                           |
| `GET /api/expansion-runs/{run_id}/export/md`  | Export a Markdown summary.                                                               |
| `GET /api/expansion-runs/{run_id}/export/csv` | Export opportunities as CSV.                                                             |

The frontend polls while analysis is active. The backend runs as one worker/instance; runs interrupted by a restart are marked as failed. OpenRouter requests use a 60-second timeout and up to three attempts for HTTP `429` and `5xx`. Failures are displayed without simulated results.

</details>

## Example analyses

Search for **C02** or **C06** to explore opportunities from the dataset.

|                           | C02 · TB Sinar Jaya                                                    | C06 · Saiyo Group                                                            |
| ------------------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| **Conversation evidence** | I0253: six planned branches; I0255: initial account owner reply.       | I0300: quotation/timeline request for ten outlets; no direct reply recorded. |
| **Contract**              | K-C02 · Growth · 25 outlets · 5% discount.                             | K-C06 · Enterprise · 30 outlets · 10% discount.                              |
| **Additional → target**   | 6 → **31 outlets**.                                                    | 10 → **40 outlets**.                                                         |
| **Annual gross value**    | **IDR 25,200,000**                                                     | **IDR 42,000,000**                                                           |
| **Annual net scenario**   | **IDR 23,940,000**                                                     | **IDR 37,800,000**                                                           |
| **To confirm**            | Timeline, feature needs, and package capacity beyond the Growth limit. | Quotation follow-up, stakeholders, and implementation timeline.              |

Formula: **additional outlets × IDR 350,000 × 12 months**. The net scenario assumes the existing contract discount continues. These values apply when the additional outlet count is supported by sufficient evidence; they are neither final quotations nor prepared Jev results. The sources contain no account-specific deal or decision records for C02/C06. New-customer pipeline is displayed separately.

## Documentation

The detailed guides below are currently in Indonesian.

| Guide                                                      | Contents                                                                                          |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| [Deployment and MySQL](DEPLOYMENT.md)                      | Docker images, environment configuration, container migrations/seeding, health checks, and CI/CD. |
| [Data guide](docs/DATA_GUIDE.md)                           | Dataset sources, relationships, business rules, and calculation inputs.                           |
| [Jev and Account Expansion](docs/JEV_ACCOUNT_EXPANSION.md) | Choice, Score, Noul, confidence, and analysis traceability.                                       |

## Testing

The frontend uses **Oxlint** and **Oxfmt**. Run lint, format checks, and the build with:

```powershell
bun run check
```

Backend and browser tests require a dedicated test database. Follow the [testing setup](DEPLOYMENT.md#pengujian), then run:

```powershell
.venv/Scripts/python.exe -m pytest backend/tests -q
bunx playwright install chromium
bun run test:e2e
```

Tests use controlled Jev responses without paid API calls. Point `TEST_DATABASE_URL` and `DATABASE_URL` to a schema ending in `_test`, and leave the OpenRouter key empty for the Playwright backend.
