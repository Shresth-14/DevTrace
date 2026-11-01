# DevTrace

**Recover the technical decisions nobody wrote down.**

DevTrace reads a GitHub repository's issues, pull requests, reviews and comments, and uses an **open-source AI model running locally** to rebuild structured, evidence-backed **decision records**: what was decided, why, which alternatives were rejected, and the exact GitHub comments that prove it.

> Built for Hacktoberfest Hack Day 2026 — *Problem 6: Recover the Decisions Nobody Wrote Down.* See [HACKATHON.MD](HACKATHON.MD).

---

## Contents

- [Why DevTrace](#why-devtrace)
- [Features](#features)
- [The AI model](#the-ai-model)
- [How it works](#how-it-works)
- [Tech stack](#tech-stack)
- [Project structure](#project-structure)
- [Getting started](#getting-started)
- [Configuration](#configuration)
- [API overview](#api-overview)
- [Testing and CI](#testing-and-ci)
- [Security](#security)
- [Known limitations](#known-limitations)
- [Roadmap](#roadmap)
- [Team and licence](#team-and-licence)

---

## Why DevTrace

The reasoning behind a codebase lives in long discussion threads. When people move on, the *why* is lost, and new contributors repeat old debates or undo past decisions by accident.

DevTrace turns those unstructured conversations into records you can search and trust, and every claim links back to the original comment.

## Features

**Investigate any issue or pull request**
Paste a GitHub link (or `#123`). DevTrace fetches that thread and the threads it links to, then shows:
- the full conversation, with author, date and a link for every message
- a summary of what happened, where every point is tied to a quoted comment
- the decisions found: status, reasoning, rejected alternatives, open questions and evidence quotes

**Explore a whole repository**
Import a repository and browse six views: *Overview*, *Decisions*, *Rejected approaches*, *Sources*, *Code relationships* and *PR intelligence* (which past decisions matter for an open PR).

**Ask a repository question**
Discovery uses stored data only, so it costs no GitHub requests. Answers come only from stored decisions and their evidence.

**Honest by design**
- Every claim has a source link and a verbatim quote, checked against the real message.
- Conservative status rules: a closed issue is not an acceptance, a merged PR is not proof of every suggestion, an objection is not a rejection, and silence is not consensus. When unsure, the status is `unresolved`.
- Failures (rate limit, missing access, model unavailable) are reported as such. A partial result is never shown as complete.

---

## The AI model

DevTrace uses **one** model, and it is open-source and runs entirely on your own machine.

| | |
|---|---|
| **Model** | **Qwen 2.5 Coder 7B** — model tag `qwen2.5-coder:7b` (7 billion parameters) |
| **Made by** | Qwen team, Alibaba Cloud |
| **Licence** | Apache 2.0 (open-weight, permissive) |
| **Runtime** | [Ollama](https://ollama.com) — a local, offline inference server |
| **Where it runs** | On the user's own computer, at `http://localhost:11434` |
| **Third-party AI APIs** | **None.** No OpenAI, Anthropic, Gemini or other hosted API is called |
| **Size** | About 4.7 GB (4-bit quantised) |

### What the model does

Two jobs, both on one thread at a time:
1. **Decision extraction** — find technical decisions, their status and reasoning, rejected alternatives and the messages that prove them.
2. **Thread summary** — describe what happened in chronological order, with every point cited.

### Why we chose it

- **Open-source and open-weight.** Apache 2.0 licence, so anyone can inspect, run and redistribute it. It meets the hackathon's open-model rule.
- **Strong at code and technical text.** Pull-request and issue discussions are full of code, APIs and architecture terms, which is what Qwen 2.5 Coder is trained for.
- **Reliable structured output.** DevTrace needs strict JSON (decisions, evidence, statuses). Ollama's JSON mode plus a schema in the prompt works well with this model, and the server validates everything it returns.
- **Small enough to run locally.** About 4.7 GB runs comfortably on a modern laptop (for example Apple Silicon with unified memory), with no GPU server and no usage costs.
- **Privacy.** Repository text never leaves the machine. There are no API keys to leak, no per-request billing and no rate limits from a model vendor.

### How we use it safely

- Thread text is wrapped in `<thread>…</thread>` and declared **untrusted data**, so instructions written inside an issue are never followed.
- The model has no tools and cannot take actions. Its output is only data, and the server validates it.
- Settings: temperature `0.1`, JSON output, a context window set by `OLLAMA_CONTEXT_LENGTH` (default 4096 tokens), a call timeout, up to 3 attempts with backoff on timeouts and server errors, and one automatic repair retry if the JSON is invalid.
- Clear errors when Ollama is not running or the model is not installed, with the exact command to fix it.

### Set it up

```bash
# 1. Install Ollama from https://ollama.com, then:
ollama pull qwen2.5-coder:7b
ollama serve            # skip if the Ollama desktop app is already running
```

DevTrace reads `OLLAMA_BASE_URL` and `OLLAMA_MODEL` from `server/.env`. To try a different local model, change `OLLAMA_MODEL` (and `ollama pull` it); no code change is needed. The AI layer sits behind a small provider interface, so another runtime can be added without touching the rest of the app.

---

## How it works

```
Browser (Next.js)  ──►  Express API  ──►  GitHub (Octokit: REST + GraphQL)
                             │
                             ├──►  PostgreSQL (Prisma): cache + results
                             └──►  Ollama (local): qwen2.5-coder:7b
```

1. **Connect** a repository: through a GitHub App installation (private repos), or a public repository by URL using your own GitHub sign-in.
2. **Import** with bulk GraphQL, caching conversations in PostgreSQL. Later runs fetch only what changed.
3. **Analyse** each relevant thread. The model's JSON is validated, de-duplicated and stored with its evidence.
4. **Read** the results in the web app, or **investigate** a single thread on demand.

### How claims are verified

- The model must cite messages (`S1`, `S2`, …). The server **drops any source that does not exist** in the thread.
- A quote counts as verified only if it appears (whitespace-normalised) in the cited message. Otherwise the real start of the message is stored instead and flagged.
- The same decision found in several threads is **merged** using a title fingerprint and similarity matching, not duplicated.
- Results are cached by a content hash, so an unchanged thread is never analysed again.

### Built for GitHub's rate limits

Bulk GraphQL with a REST fallback, incremental sync, a bounded request queue, and honoured `retry-after` headers. On the project's test GitHub simulator, a 600-thread import takes **48 requests** through bulk GraphQL versus **1,025** through REST. These figures come from the simulator, not live GitHub. Set `ANALYSIS_TIMING=1` to log every real GitHub request with its rate-limit headers.

---

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS v4, `lucide-react` |
| Backend | Node.js 26, Express 4, TypeScript, ES modules (run with `tsx`) |
| Database | PostgreSQL (Supabase) through Prisma 6 |
| GitHub | Official Octokit 5 (REST, GraphQL, throttling, retry), GitHub App and OAuth |
| AI | **Ollama** running **Qwen 2.5 Coder 7B** locally |
| Tests | Node's built-in test runner and Supertest (server); Vitest and Testing Library (client) |
| CI | GitHub Actions |

Deliberately not used: Redis, message queues, microservices, or any hosted AI API.

## Project structure

```
DevTrace/
├── client/                    Next.js app (pages, components, typed API client)
├── server/
│   ├── prisma/schema.prisma   24 models: GitHub content, decisions, evidence, runs
│   ├── src/
│   │   ├── config/            all configuration in one validated place
│   │   ├── middleware/        authentication
│   │   ├── utils/             JWT, token encryption, URL parsing
│   │   └── modules/
│   │       ├── github/        OAuth, installations, repositories, import (sync)
│   │       ├── project/       connect, list and delete repositories
│   │       ├── decisions/     extraction pipeline, store, read models
│   │       ├── investigation/ on-demand issue / PR investigation
│   │       └── ai/            provider interface and the Ollama service
│   └── tests/                 unit and integration tests, plus a fake GitHub
├── .github/workflows/ci.yml   CI: backend and frontend jobs
├── HACKATHON.MD               problem statement, model disclosure, team
└── LICENSE
```

---

## Getting started

### Prerequisites

- **Node.js 26** (see `.nvmrc`; `nvm use` works) and npm
- **PostgreSQL** — a [Supabase](https://supabase.com) project is what we use
- **Ollama** with the model pulled (see [The AI model](#the-ai-model))
- A **GitHub App** (see below) for sign-in and private repositories

### 1. Clone and install

```bash
git clone https://github.com/Shresth-14/DevTrace.git
cd DevTrace
cd server && npm ci && cd ..
cd client && npm ci && cd ..
```

### 2. Create the GitHub App

In GitHub: *Settings → Developer settings → GitHub Apps → New GitHub App*.

- **Callback URL:** `http://localhost:5001/api/github/callback`
- **Setup URL** (after installation): `http://localhost:5001/api/github/setup`
- **Permissions:** read-only access to *Issues*, *Pull requests*, *Discussions*, *Contents* and *Metadata*. DevTrace only reads from GitHub; it never writes.
- Generate a **private key** (`.pem`) and a **client secret**, and note the **App ID**, **Client ID** and **slug**.

### 3. Configure the server

```bash
cd server
cp .env.example .env
```

Fill in `server/.env`: the database URLs, the GitHub App values, and two long random secrets for `SESSION_SECRET` and `ENCRYPTION_SECRET`. Save the `.pem` file inside `server/` and set `GITHUB_PRIVATE_KEY_PATH="./your-key-file.pem"`. Keys and `.env` files are git-ignored. **Never commit them.**

### 4. Create the database tables

```bash
cd server
npx prisma generate
npx prisma db push      # creates the tables from prisma/schema.prisma
```

For an existing database created before the decision tables were added, the same change is available as SQL in `server/prisma/manual-migrations/`.

### 5. Configure the client

```bash
cd client
cp .env.example .env.local     # defaults point at http://localhost:5001
```

### 6. Run

Start Ollama (see above), then in two terminals:

```bash
cd server && npm run dev       # API on http://localhost:5001
cd client && npm run dev       # app on http://localhost:3000
```

Open http://localhost:3000, sign in with GitHub, and add a repository.

### First run, step by step

1. Sign in, then add a public repository by URL (or install your GitHub App on a repository).
2. Open the project. Imports run in the background.
3. Click **Run analysis** to run the model over the imported threads (**Re-analyse all** repeats it for unchanged threads too), or use **Investigate an issue or pull request** and paste a single issue or PR link. **Sync now** re-imports from GitHub.

> Automatic analysis after an import is **off by default**, because analysis is the expensive step. Set `AUTO_ANALYSE_ON_SYNC=true` to turn it on.

---

## Configuration

All server settings are read from `server/.env`. The full list with comments is in [`server/.env.example`](server/.env.example).

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `5001` | API port |
| `CLIENT_ORIGIN` | `http://localhost:3000` | Allowed browser origin and sign-in redirect |
| `DATABASE_URL`, `DIRECT_URL` | — | PostgreSQL connection strings |
| `GITHUB_APP_ID`, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `GITHUB_APP_SLUG` | — | GitHub App |
| `GITHUB_PRIVATE_KEY_PATH` (or `GITHUB_PRIVATE_KEY`) | — | App private key |
| `SESSION_SECRET`, `ENCRYPTION_SECRET` | built-in dev defaults | **Set your own** in any real deployment |
| `OLLAMA_BASE_URL` | `http://localhost:11434` | Ollama server |
| `OLLAMA_MODEL` | `qwen2.5-coder:7b` | Model tag |
| `OLLAMA_CONTEXT_LENGTH` | `4096` | Model context window (tokens) |
| `OLLAMA_TIMEOUT_MS` | `120000` | Model call timeout |
| `IMPORT_MAX_ITEMS` | `500` | Issues and PRs kept on a first import |
| `EXTRACTION_MAX_UNITS` | `40` | Threads sent to the model per analysis run |
| `AUTO_ANALYSE_ON_SYNC` | off | Start analysis automatically after an import |
| `GITHUB_MAX_CONCURRENCY` | `4` | Concurrent GitHub work for investigations |
| `REPO_LIST_CACHE_TTL_SECONDS` | `60` | Repository-list cache lifetime |
| `ANALYSIS_TIMING` | off | Log every GitHub request |

Client (`client/.env.local`): `NEXT_PUBLIC_API_URL` (default `http://localhost:5001`) and `NEXT_PUBLIC_GITHUB_APP_SLUG`.

---

## API overview

| Area | Endpoints |
|---|---|
| Health | `GET /health` |
| Sign-in | `GET /api/github/auth`, `/callback`, `/setup`, `/user`, `POST /disconnect` |
| Repositories | `GET /api/github/installations`, `GET /api/github/repositories` |
| Projects | `POST/GET /api/projects`, `GET/DELETE /api/projects/:slug`, `POST/GET …/sync`, `POST …/extract` |
| Read models | `GET /api/projects/:slug/overview`, `/decisions`, `/pr-intelligence`, `/source-feed` |
| Investigation | `POST /api/projects/:slug/investigations`, `GET …/investigations/:id`, `POST …/investigations/questions` |
| Dashboard | `GET /api/dashboard/summary` |

Most routes require sign-in (cookie or Bearer token). Reading a **public** project does not.

---

## Testing and CI

```bash
cd server && npm test && npm run typecheck && npm run lint && npm run build
cd client && npm test && npm run typecheck && npm run lint && npm run build
```

- **Server:** 161 tests. GitHub and the model are simulated, including rate limits, failures and latency. Tests marked `*.db.test.ts` skip themselves unless `TEST_DATABASE_URL` points at a local, disposable PostgreSQL database.
- **Client:** 36 tests.
- **Repository hygiene:** a test fails the build if credentials, key files, or files that instruct AI agents are committed.
- **CI** (`.github/workflows/ci.yml`) runs on pull requests and pushes to `main`. Backend: install, typecheck, lint, Prisma schema validation, tests, build. Frontend: install, lint, typecheck, tests, build.

## Security

- GitHub tokens are encrypted at rest with **AES-256-GCM**.
- Sessions are signed JWTs (7 days) in an **httpOnly** cookie, with a Bearer-token fallback. OAuth uses a signed `state` value against CSRF.
- Secrets live only in environment variables. `.env` and `*.pem` files are git-ignored.
- Private repositories are visible only to their owner.

## Known limitations

- **Accuracy is not yet measured.** Evidence links make every claim traceable, but we have not run a labelled evaluation of decision quality. A 7B model will miss or mislabel some decisions.
- An investigation reads the requested thread and the threads it links to. It does not yet analyse follow-up PRs that point back to an issue.
- A single GitHub Discussion cannot be investigated on its own yet.
- Search is keyword-based, not semantic.
- Long threads are analysed in windows. If analysis of very long threads looks cut off, raise `OLLAMA_CONTEXT_LENGTH` (for example to `8192`).
- Investigation status is kept in memory, so it is lost on a server restart. Decisions are stored in the database.
- Set your own `SESSION_SECRET` and `ENCRYPTION_SECRET` before any deployment. The built-in defaults are for local development only.

## Roadmap

1. A labelled evaluation of decision accuracy.
2. Bring related and follow-up threads into the analysis context.
3. Semantic search across decisions.
4. Investigate individual GitHub Discussions.

---

## Team and licence

**Team DevTrace:** Shresth Juyal, Arpit Tripathi, Arpit Goyal.

Released under the [MIT License](LICENSE).
