# DevTrace — Technical Overview and Q&A

> Written from the code on branch `prod` (server 157 tests passing, client 36 passing).
> Where something is **not verified** or is a **known weakness**, it is marked as such. Read section 14 before a demo or judging round.

---

## 1. What DevTrace is (the 30-second version)

**Problem 6 — "Recover the decisions nobody wrote down."** DevTrace connects to a GitHub repository, reads its issues, pull requests, reviews and comments, and uses an AI model to rebuild **structured, evidence-backed decision records**: what was decided, why, which alternatives were rejected, and which exact GitHub comments prove it. Every claim links back to the original message.

Two ways to use it:

1. **Repository view** — import a repo, analyse its threads, browse decisions, rejected approaches, sources, code relationships and PR intelligence.
2. **On-demand investigation** — paste one issue/PR link; DevTrace fetches only that thread (plus the threads it links to), shows the full conversation, an evidence-cited summary, and any decisions found.

**Model:** `qwen2.5-coder:7b`, an open-weight model (Apache 2.0), run **locally through Ollama**. No third-party inference API is called.

---

## 2. Tech stack

| Layer | Technology | Notes |
|---|---|---|
| Runtime | Node.js 26 (`.nvmrc`) | CI uses the same file |
| Frontend | Next.js 16.4.3 (App Router), React 19.3, TypeScript 5, Tailwind CSS v4, `lucide-react` | Only 4 runtime dependencies |
| Backend | Express 4.21, TypeScript 5.7, ES modules, run with `tsx` | `"type": "module"` |
| Database | PostgreSQL on Supabase via **Prisma 6.19** | Session pooler (port 5432) |
| GitHub | Official **Octokit 5** (`octokit` package: REST + GraphQL + throttling + retry) | GitHub App + OAuth |
| Rate limiting | `bottleneck` (pooled GraphQL limiter) + Octokit throttling plugin | |
| Auth | GitHub OAuth (GitHub App user-to-server tokens) → signed JWT session | `jsonwebtoken` |
| Crypto | AES-256-GCM (Node `crypto`) for stored GitHub tokens | |
| AI | **Ollama** local runtime, model `qwen2.5-coder:7b`, context 4096 | Provider interface allows swapping |
| Tests | Node's built-in test runner + `tsx` + Supertest (server); Vitest + Testing Library + jsdom (client) | |
| CI | GitHub Actions, two parallel jobs | |

Deliberately **not** used: Redis, queues, microservices, GraphQL server, an ORM other than Prisma, any closed AI API.

---

## 3. Repository layout

```
DevTrace/
├── client/                      Next.js app
│   └── src/
│       ├── app/                 pages: landing, /dashboard/*, /import, /p/[slug]
│       ├── components/          marketing components, dashboard, project/* (sections, panels)
│       ├── context/             DashboardContext (user, projects, repos; module-level cache)
│       └── lib/                 api.ts (typed API client), format.ts
├── server/
│   ├── prisma/schema.prisma     24 models
│   ├── src/
│   │   ├── app.ts / index.ts    Express app factory, server start/shutdown
│   │   ├── config/env.ts        all configuration (one validated place)
│   │   ├── database/            Prisma client + pool limit
│   │   ├── middleware/auth.ts   requireAuth / optionalAuth
│   │   ├── utils/               jwt, crypto (AES-GCM, OAuth state), github-url, http-error
│   │   └── modules/
│   │       ├── github/          OAuth, installations, repositories, Octokit, sync/
│   │       ├── project/         add/list/delete repos, public + private access
│   │       ├── decisions/       extraction pipeline, store, read models
│   │       ├── investigation/   on-demand issue/PR investigation + questions
│   │       └── ai/              provider interface, Ollama service, chat API
│   └── tests/                   integration and unit tests (+ helpers/fake GitHub)
├── .github/workflows/ci.yml
├── HACKATHON.MD                 problem statement, model disclosure, team
└── docs/
```

---

## 4. System architecture

```
 Browser (Next.js)
   │  fetch + cookie (devtrace_session) / Bearer token
   ▼
 Express API ─────────────────────────────────────────────────────────────┐
   │ requireAuth / optionalAuth (JWT)                                     │
   ├─ /api/github       OAuth, installations, repository listing (cached)  │
   ├─ /api/projects     add/list/delete, sync, extract, overview,          │
   │                    decisions, pr-intelligence, source-feed            │
   ├─ /api/projects/:slug/investigations   on-demand investigation          │
   ├─ /api/dashboard    summary                                             │
   └─ /api/ai           provider chat/status                                │
        │                    │                    │                         │
        ▼                    ▼                    ▼                         │
   GitHub (Octokit)     PostgreSQL (Prisma)   Ollama (local, :11434)  ◀─────┘
   REST + GraphQL       cache + results        qwen2.5-coder:7b
```

**Core idea:** GitHub is the source of truth for conversations; PostgreSQL is a **persistent cache and the store for results**; the model only ever sees text we fetched, and everything it returns is validated against that text.

### Data flow, end to end

1. **Connect** a repo (GitHub App installation, or a public repo by URL using the owner's own GitHub sign-in).
2. **Import (sync)**: bulk GraphQL fetch of open issues/PRs with comments, reviews, files, commits; follows explicit links to older threads. Stored in Postgres.
3. **Analyse (extraction)**: each relevant thread becomes a *unit*; the model returns structured JSON; the server validates, de-duplicates, and stores `Decision` + evidence + alternatives + code links.
4. **Read**: API read models build the Overview, Decisions, Rejected, Sources, Code and PR-intelligence views from stored rows.
5. **Investigate (on demand)**: fetch one thread live, store it, analyse only that thread, return a result with conversation, summary and decisions.

---

## 5. Data model (Prisma, 24 models)

| Group | Models | Purpose |
|---|---|---|
| Identity | `User`, `GithubAccountToken`, `GithubInstallation` | GitHub user, **encrypted** access/refresh tokens, App installations |
| Projects | `Project`, `SyncJob` | A connected repo (`slug`, visibility, sync/AI status, cursor); one row per import run |
| GitHub content | `GithubIssue`, `GithubIssueComment`, `GithubPullRequest`, `GithubPrComment`, `GithubPrReview`, `GithubReviewComment`, `GithubPrFile`, `GithubPrCommit`, `GithubCommit`, `GithubDiscussion`, `GithubDiscussionComment`, `GithubRepoFile` | Cached conversations, keyed by `(projectId, number)` / GitHub id |
| Graph | `ThreadReference` | Explicit links between threads (`reference_in_body`, `reference_in_comment`, `closing_reference`) |
| Analysis | `ExtractionRun`, `ExtractionUnit` | Run progress; per-thread `contentHash` + `version` + status (the analysis cache) |
| Results | `Decision`, `DecisionEvidence`, `DecisionAlternative`, `AlternativeEvidence`, `DecisionCodeLink` | The product: decisions with status, reasoning (JSON), confidence, evidence quotes + URLs, rejected alternatives, linked files |

Key design points:
- GitHub ids are **BigInt** and stable; threads also keyed by number per project.
- `fetchReason` on issues/PRs (`open` | `referenced` | `legacy`) records *why* a thread was stored.
- `Decision` is unique on `(projectId, seq)` and `(projectId, fingerprint)`; the same decision seen twice is merged, not duplicated.
- `DecisionEvidence` stores `threadKind` + `threadNumber` + `url` + the verified quote.

---

## 6. API surface

Auth column: **R** = `requireAuth`, **O** = `optionalAuth` (public repos readable without login), **—** = public.

| Method & path | Auth | Purpose |
|---|---|---|
| `GET /health`, `/api/health` | — | Liveness |
| `GET /api/github/auth` | — | Start OAuth (signed state) |
| `GET /api/github/callback` | — | OAuth callback; sets session cookie, redirects to client |
| `GET /api/github/setup` | — | GitHub App post-install redirect |
| `GET /api/github/user` | R | Current user |
| `GET /api/github/installations` | R | User's App installations |
| `GET /api/github/repositories` | R | Repositories (filters, paging; **cached per user**) |
| `POST /api/github/disconnect` | R | Clear session and tokens |
| `POST /api/projects` | R | Connect repo (installation) **or** by public URL |
| `GET /api/projects`, `DELETE /api/projects/:slug` | R | List / delete |
| `GET /api/projects/:slug` | O | Project details (private only for owner) |
| `POST/GET /api/projects/:slug/sync` | R | Start import / status |
| `POST /api/projects/:slug/extract` | R | Start AI analysis |
| `GET /api/projects/:slug/overview`, `/decisions`, `/pr-intelligence`, `/source-feed` | O | Read models |
| `GET /api/projects/:slug/sources/:resource` | R | Raw stored source rows |
| `POST /api/projects/:slug/investigations` | R | Start an on-demand investigation (202 + id) |
| `GET /api/projects/:slug/investigations/:id` | R | Poll status / result |
| `POST /api/projects/:slug/investigations/questions` | R | Ask a repo question (DB-only discovery) |
| `GET /api/projects/:slug/investigations/questions/:id` | R | Poll question |
| `GET /api/dashboard/summary` | R | Totals across the user's projects |
| `POST /api/ai/chat`, `/chat/stream`, `GET /api/ai/status` | — | Direct provider access (see §14 risk) |

---

## 7. Authentication and security

**Login flow**
1. Client opens `/api/github/auth?redirect=…`; server issues a redirect to GitHub with a **signed `state`** (CSRF protection; verified on callback).
2. Callback exchanges the code for a **user access token + refresh token**, upserts the `User`, stores tokens **encrypted with AES-256-GCM** (`iv:authTag:ciphertext`).
3. Server signs a **JWT** (HS256 by default, **7-day** expiry; payload: user id, GitHub id, username, avatar) and sets cookie `devtrace_session`: `httpOnly`, `secure` in production, `sameSite=none` in production / `lax` in development.
4. It also redirects to the client with `?session=<token>`; the client stores it in `localStorage` and sends `Authorization: Bearer` (needed when cross-site cookies are blocked).
5. `requireAuth` accepts cookie **or** Bearer token, verifies the JWT, then loads the user from the DB (a deleted user is rejected even with a valid JWT).

**Token refresh:** `getValidAccessToken` refreshes the GitHub token when it is within 2 minutes of expiry.

**Authorisation:** projects are owner-scoped (`requireOwnedProject`); private projects are visible only to the owner; investigation records are only returned to the project they belong to.

**Other controls:** CORS allow-list (configured client origin + `localhost:3000`), body-size limit via `express.json()` (tested: oversized body → 413, malformed JSON → 400), secrets only from env, `*.pem` and `.env*` git-ignored.

---

## 8. GitHub integration

- **Two credential modes:** GitHub **App installation** token (private repos; created and refreshed by `@octokit/auth-app`) and the **user's own OAuth token** (public repos added by URL).
- **One shared, throttled Octokit class** (`DevTraceOctokit`): throttling plugin (waits on primary and secondary rate limits, bounded retries), retry plugin (skips permanent 4xx), and a **Bottleneck pool for GraphQL** (4 concurrent, 100 ms apart) instead of Octokit's default one-per-second queue.
- **Repository listing** is cached per user (TTL `REPO_LIST_CACHE_TTL_SECONDS`), installations are fetched in parallel (bounded by `GITHUB_MAX_CONCURRENCY`), identical concurrent requests share one fetch.
- **Request diagnostics:** `ANALYSIS_TIMING=1` logs every request (method, route, status, duration, `x-ratelimit-*`, `retry-after`) and a per-endpoint summary after each sync. Credentials are never logged.

---

## 9. Import (sync) pipeline

- **Bulk GraphQL first**: threads are fetched in pages with comments/reviews/files/commits in the same query; REST only completes what GraphQL cannot carry (long threads, renamed files) or when bulk fails (automatic fallback).
- **Relevance filter** (`isRelevantThread`): a thread's full conversation is stored if it has ≥2 messages (≥1 reply for discussions) or a body ≥400 characters. Cheap and shared by the importer and the analyser.
- **Follows explicit references only** (`#123`, `owner/repo#123`, github.com URLs; code blocks ignored): older linked threads are fetched with `fullConversation` and recorded in `ThreadReference`.
- **Incremental sync:** cursors per resource with a 60-second skew; later runs fetch only what changed (closed/merged items included so outcomes are noticed).
- **Limits** (`IMPORT_MAX_ITEMS`, default 500 issues and 500 PRs; discussions ≤100; commits 300; linked history 60) keep a first import of a huge repo quick.
- **Concurrency gate** (default 6) bounds thread-level requests; failures are counted per thread (one bad thread never hides the rest) and reported as `ok` / `partial` / `error`.
- **Measured (project's fake GitHub):** 60+60 threads → 24 requests cold, 8 on an incremental re-run; 300+300 → 48 requests via bulk versus 1,025 via the REST fallback (about 21×).
- **Auto-analysis after import is OFF by default.** Set `AUTO_ANALYSE_ON_SYNC=true` to start AI extraction automatically; otherwise analysis is manual or on demand.

---

## 10. AI decision extraction

**Unit of work:** one thread (issue / PR / discussion). The conversation is flattened into ordered messages, each with a local ref (`S1`, `S2`, …), author, type (issue body, comment, review, inline review comment…), URL and timestamp. Bot accounts (`[bot]`, `*-bot`, `vercel`, `github-actions`, `dependabot`, …) are removed.

**Prompt rules** (system prompt, JSON-only output):
- Find **technical decisions** only (a choice between approaches); ignore bug chatter and status updates.
- Statuses: `accepted`, `rejected`, `proposed`, `withdrawn`, `unresolved` — **be conservative**; default to `unresolved`/`proposed`.
- Never infer acceptance from a closed issue or merged PR alone; an objection is not a rejection; silence is not consensus; never invent reasons.
- Older threads are context; do not present an old proposal as a current decision.
- Every claim must cite message refs and a **verbatim quote** (≤300 chars).
- **Prompt-injection defence:** thread text is wrapped in `<thread>…</thread>` and declared untrusted data; instructions inside are never followed.

**Validation (server side, never trust the model):**
- JSON extracted tolerantly (fences/prose stripped); one automatic **repair retry** if the reply is invalid.
- Refs must exist in the messages shown; invented sources are dropped.
- A quote is flagged `quoteVerified` only if it appears (whitespace-normalised) in the cited message; otherwise the real message start is stored instead.
- Status vocabularies, reasoning categories (performance, scalability, security, compatibility, maintainability, developer experience, complexity, resource consumption, architecture, backward compatibility, other) and code-link paths are validated; code links are marked `direct` (PR files / review comments) or `inferred`.

**Dedupe and merge:** decisions are matched by a title **fingerprint**, then by token **similarity** against existing decisions; matches are merged (status merged conservatively, participants unioned) rather than duplicated. Saves are serialised so `DEC-001…` numbers are allocated without races.

**Caching and cost control:**
- `ExtractionUnit` stores `contentHash`, `version` (`EXTRACTION_VERSION`) and status; an unchanged, already-done thread is **skipped**.
- Per run: 4 workers, at most 40 threads sent to the model (`EXTRACTION_MAX_UNITS`; re-running continues).
- Long threads are split into windows of **14,000 characters** at message boundaries, each window repeating the opening post; each message is clipped to 2,500 characters.
- Model calls: temperature 0.1, max 4,000 output tokens, 3 attempts with 1 s / 2 s backoff on timeout / 429 / 5xx. A **daily-limit** 429 is not retried, and a **circuit breaker** stops the whole run after one such call (remaining units are left untouched; the run ends `partial`).
- Progress writes to the DB are throttled; the final write is guaranteed.

**Ollama service specifics:** `POST /api/chat` with `format: "json"` when asked (falls back to prompt-based JSON if the model rejects it), `num_ctx` from `OLLAMA_CONTEXT_LENGTH` (default 4096), default timeout 120 s, health check on `/api/tags`, distinct errors for "Ollama not running" and "model not pulled".

---

## 11. On-demand investigation (the main user-facing feature)

**Input:** a github.com issue/PR URL, `owner/repo#N`, `#N` or `N` (same repository only; other repos → 400; discussion URLs → 422 "not supported yet").

**Flow** (returns `202` + an investigation id immediately; the work runs in the background):
1. **Fetch** the thread with one GraphQL request by number (comments, reviews, inline comments, changed files, commits), completing partial pages with REST.
2. **Follow explicit references one level deep**, up to 10 threads, visited-set de-duplicated, never by title similarity. Fetched threads are stored.
3. **Hash** the thread content; if the stored analysis has the same hash and version → reuse it (no model call).
4. Otherwise run the **decision extraction** and a separate **summary** call.
5. Return a **result**: the full conversation (every message with author, date, link), an **AI summary** (overview + chronological points, each with a quote and links to the exact comments), and **decisions** (status, reasoning, alternatives, open questions, evidence quotes with links).

**Summary grounding:** a point with no real source is dropped (and counted); a quote not found in a cited message is replaced by the start of that message and flagged in the UI. The overview sentence is labelled as AI-written, not evidence.

**Statuses:** `queued → fetching → analysing → done`, or `partial` (something failed but results exist), `rate_limited` (with GitHub's wait time), `forbidden`, `not_found`, `network`, `failed`. A rate-limited or partial run is **never** reported as done.

**Rate-limit safety:** one shared Octokit per installation (or per user token), in-flight de-duplication of the same thread, a concurrency gate (`GITHUB_MAX_CONCURRENCY`, default 4), no retry loops on 401/403/404/422.

**Repository questions** (`/questions`): discovery uses **only the database** (title, body, labels, changed-file paths, threads cited by matching decisions), scores candidates (title 3, decision-cited 3, label 2, body 1, file 1), investigates the **top 5**, and answers only from stored decisions and their evidence. A decision without evidence is reported `unresolved`, never as a decision. If nothing matches, it says so.

---

## 12. Frontend

- **Pages:** landing; `/dashboard` (+ projects, integrations, settings); `/import` (add by URL); `/p/[slug]` (project workspace).
- **Project workspace tabs:** Overview, Decisions, Rejected approaches, Sources, Code relationships, PR intelligence — plus a status panel (import/analysis state and manual actions) and the **Investigate** panel.
- **Design system:** warm ivory + sage palette as CSS tokens (`dt-*`) in `globals.css`; typography-led layout; accessible tabs (keyboard arrows/Home/End), visible focus, reduced-motion support, responsive down to 375 px.
- **State:** React state + a typed `api` client (`lib/api.ts`) with a 45 s timeout on every request; `DashboardContext` keeps a module-level cache of projects/repos across mounts.
- **Honesty rules in the UI:** loading, empty and error states for every section; status, cache-reuse and rate-limit waits are shown as reported by the server; no fake progress percentages.

---

## 13. Testing and CI

**Server — 157 tests, all passing:** unit and HTTP tests (Supertest) covering API behaviour (404, malformed JSON → 400, oversized → 413), GitHub App auth/config, bulk vs REST fetching, incremental sync, reference extraction, URL parsing, decision validation/merging, investigation (parsing, rate-limit classification, de-duplication, concurrency cap, cache reuse, partial results, summary validation), Ollama service, request timing, and the optimisation phases (repo-list cache, throttled progress writes, auto-analysis flag, circuit breaker). DB-backed tests (`*.db.test.ts`) **skip themselves** unless `TEST_DATABASE_URL` points at a local disposable Postgres.

**Client — 36 tests (Vitest + Testing Library):** page, API client, repo URL form, project sections, investigate panel, investigation result view.

**Fakes, not production data:** `tests/helpers/fake-github.ts` simulates REST + GraphQL (pagination, failures, rate-limit headers, latency); a fake model returns scripted JSON.

**CI (`.github/workflows/ci.yml`)** runs on PRs and pushes to `main`, two parallel jobs on Node 26:
- *Backend:* `npm ci` → typecheck → **lint** → **Prisma validate** (placeholder DB URLs; validation never connects) → tests → build.
- *Frontend:* `npm ci` → lint → **typecheck** → tests → build.

---

## 14. Known limitations and risks (be upfront about these)

1. **Context-size mismatch (verify before demo).** The extractor builds windows of up to **14,000 characters** (~3,500 tokens) plus a ~800-token system prompt, but Ollama's `num_ctx` defaults to **4,096**. Long threads may be silently truncated by the runtime. Fix: raise `OLLAMA_CONTEXT_LENGTH` (e.g. 8192) and/or lower `CHUNK_CHAR_BUDGET`. *Not measured.*
2. **Extractor timeout of 60 s** per model call is passed by the extractor, shorter than the Ollama default of 120 s; a 7B model on large prompts may time out. *Not measured.*
3. **Investigation reads only the requested thread.** Linked threads are fetched and stored but their text is **not** given to the model; threads that point *to* the issue (a PR that "fixes #12") are **not discovered**. The panel label "Linked threads fetched for context" overstates this. A design for fixing it exists (timeline cross-references + a combined, size-capped context).
4. **Model quality is unmeasured.** No precision/recall evaluation of decisions on real repositories has been done; validation guarantees *traceability*, not *correctness*. A 7B model will miss or mislabel some decisions.
5. **GitHub Discussions** are imported but cannot be investigated individually yet.
6. **Investigation and question status are in memory** (lost on restart; not shared across multiple server instances). Decisions and the extraction cache are in the database.
7. **Session token in `localStorage`** (via the redirect `?session=` parameter) is exposed to XSS and appears in a URL once; the cookie is httpOnly. Trade-off made for cross-site cookie compatibility.
8. **Default secrets exist in code** (`SESSION_SECRET`, `ENCRYPTION_SECRET` fall back to built-in strings if unset). They must be set in any deployed environment.
9. **`/api/ai/*` endpoints are unauthenticated** (`chat`, `chat/stream`, `status`). Anyone who can reach the server can use the local model. Should be protected or removed before deployment.
10. **GitHub App private key** was pasted into a chat during development; rotate it.
11. **Docs drift:** `PROJECT_STATUS.md` and `README copy.md` describe an older state (Express 5, TypeScript 7, older branch). `HACKATHON.MD` correctly states the local Ollama model.
12. **Search is keyword-based** (case-insensitive substring over title/body/labels/paths), not semantic: "Postgres" will not match "PostgreSQL".
13. **Single-process assumptions:** in-flight de-duplication, repo-list cache and summary cache are per process.

---

## 15. Configuration (environment variables)

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | 5001 | API port |
| `CLIENT_ORIGIN` | `http://localhost:3000` | CORS + OAuth redirect target |
| `DATABASE_URL`, `DIRECT_URL`, `DB_PASSWORD` | — | Postgres (Supabase session pooler) |
| `DATABASE_POOL_SIZE` | 5 | Prisma connection limit |
| `GITHUB_APP_ID`, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `GITHUB_APP_SLUG` | — / `dev-trace2607` | GitHub App |
| `GITHUB_PRIVATE_KEY` or `GITHUB_PRIVATE_KEY_PATH` | — | App private key (inline or file) |
| `GITHUB_CALLBACK_URL` | `http://localhost:5001/api/github/callback` | OAuth callback |
| `SESSION_SECRET`, `ENCRYPTION_SECRET` | insecure built-in defaults | JWT signing, AES key derivation |
| `OLLAMA_BASE_URL` / `OLLAMA_MODEL` | `http://localhost:11434` / `qwen2.5-coder:7b` | Local model |
| `OLLAMA_CONTEXT_LENGTH` / `OLLAMA_TIMEOUT_MS` | 4096 / 120000 | Model context and timeout |
| `GITHUB_MAX_CONCURRENCY` | 4 | Concurrent GitHub work (investigation, repo listing) |
| `IMPORT_MAX_ITEMS` | 500 | Import cap for issues and PRs |
| `EXTRACTION_MAX_UNITS` | 40 | Threads analysed per run |
| `AUTO_ANALYSE_ON_SYNC` | off | Start analysis automatically after import |
| `REPO_LIST_CACHE_TTL_SECONDS` | 60 | Repository-list cache lifetime |
| `ANALYSIS_TIMING` | off | Log every GitHub request + summary |
| `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_GITHUB_APP_SLUG` | `http://localhost:5001`, `dev-trace2607` | Client |

---

## 16. How to run

```bash
# prerequisites: Node 26, a Postgres URL, a GitHub App (see env table), Ollama
ollama pull qwen2.5-coder:7b && ollama serve        # local model

cd server && npm ci && npx prisma generate && npm run dev      # API on :5001
cd client && npm ci && npm run dev                              # UI on :3000

# checks
cd server && npm test && npm run typecheck && npm run lint && npm run build
cd client && npm test && npm run typecheck && npm run lint && npm run build
```

---

## 17. Questions you may be asked (and the honest answers)

### Product and approach

**Q: What problem does DevTrace solve?**
Teams lose the *why* behind technical choices because it lives in scattered issue and PR threads. DevTrace recovers decisions, reasoning, rejected alternatives and evidence automatically, with a link to the original comment for every claim.

**Q: What is a "decision" in your system?**
A choice between technical approaches (architecture, library, data model, API shape, process), stored as a `Decision` with a status (`accepted`, `rejected`, `proposed`, `withdrawn`, `unresolved`), reasoning by category, rejected alternatives, evidence quotes and optional code links. Bug reports and chit-chat are ignored.

**Q: How do you avoid hallucinated decisions?**
Four layers: (1) the prompt forbids inferring outcomes and demands verbatim quotes; (2) the server rejects any cited source that does not exist in the thread; (3) quotes are checked against the real message and flagged if they do not match; (4) the UI shows the source link next to every claim. This guarantees *traceability*; it does not guarantee the model's interpretation is right.

**Q: How do you handle "objection vs. rejection"?**
The prompt states an objection is not a rejection, a closed issue is not acceptance, a merged PR does not mean every suggestion was accepted, and silence is not consensus. When unsure the model must choose `unresolved` or `proposed`.

**Q: What makes this different from asking ChatGPT to summarise a thread?**
Structured output with a fixed schema, per-claim evidence validated against the source, de-duplication of the same decision across threads, links to code files, persistence and search across the whole repository, and an explicit rejected-alternatives view.

**Q: Why does importing not run the AI automatically?**
Analysis is the expensive step. It is manual (or on demand per issue) by default; `AUTO_ANALYSE_ON_SYNC=true` restores automatic analysis. This came from a real incident where bulk analysis on connect used up a free model quota.

### Architecture and design

**Q: Why a monorepo with Express instead of Next.js API routes?**
The backend does long-running work (imports, analysis), holds GitHub credentials, and runs background jobs; keeping it a separate service keeps secrets off the client and lets it scale and deploy independently.

**Q: Why PostgreSQL + Prisma?**
Decisions form a relational graph (decision → evidence → thread → comments; alternatives; code links; references). Foreign keys, unique constraints (e.g. `(projectId, number)`, decision fingerprint) and transactions are what keep that graph consistent. Prisma gives typed queries and schema validation (also run in CI).

**Q: Why no Redis or message queue?**
Not needed at this scale. Background work runs in-process with explicit concurrency gates, and durable state (sync jobs, extraction runs/units) lives in Postgres. The trade-off is single-process caches and status (see §14).

**Q: Why cache GitHub data in the database?**
Rate limits (5,000 requests/hour per installation) and latency. Stored threads allow incremental sync, re-analysis without refetching, search, and analysis only when content hashes change.

**Q: How do you detect that a thread changed and needs re-analysis?**
A SHA-1 over the thread title, every message (type, key, text, time), changed files, state and incoming links. If the stored `ExtractionUnit` has the same hash and `EXTRACTION_VERSION`, the thread is skipped; bumping the version re-analyses everything.

**Q: How do two analyses of the same decision not create duplicates?**
A normalised title fingerprint plus token-similarity matching; matches are merged (conservative status merge, union of participants and evidence). Decision numbers (`DEC-001`) are assigned under a serialised queue to avoid races.

### GitHub and rate limits

**Q: GitHub App or OAuth app? Why both credentials?**
A GitHub App is needed for private repositories (installation tokens, fine-grained permissions). Public repositories can be added by URL using only the owner's user token, so no installation is required.

**Q: How do you stay within GitHub rate limits?**
Bulk GraphQL (many threads per request), incremental cursors, a thread-level gate, a pooled GraphQL limiter, Octokit's throttling plugin (honours `retry-after` and reset headers, bounded retries), per-user caching of the repository list, in-flight de-duplication, and a per-investigation fetch of just one thread plus at most 10 links. We measured 48 requests for 600 threads via bulk versus 1,025 via REST.

**Q: What happens when GitHub rate-limits an investigation?**
It ends as `rate_limited` with GitHub's wait time; it is never shown as done, and no retry loop runs.

**Q: What does the REST fallback cost?**
About 21× more requests in our measurement, so it is only used when bulk GraphQL fails or for the few parts GraphQL cannot carry.

### AI

**Q: Which model, and why local?**
`qwen2.5-coder:7b` through Ollama: open-weight (Apache 2.0), strong at code and structured JSON, ~4.7 GB quantised, runs fully offline on a laptop. This satisfies the hackathon's open-model rule and avoids API quotas and data leaving the machine.

**Q: How do you get reliable JSON from a 7B model?**
Ollama's `format: "json"` mode, a strict schema in the prompt, tolerant JSON extraction, one automatic repair retry, and server-side validation that drops anything malformed.

**Q: What if the thread is longer than the context window?**
It is split into windows at message boundaries (each window repeats the opening post) and analysed window by window, then merged. *Caveat:* the window budget (14,000 characters) is large relative to the default 4,096-token context; this needs tuning (§14.1).

**Q: How do you defend against prompt injection in issue text?**
Thread text is wrapped in tags and declared untrusted; the model is told never to follow instructions inside it. Because output is validated against the source text and constrained to a schema, an injection can at worst produce a wrong decision, not execute an action or leak secrets (the model has no tools).

**Q: How accurate is it?**
Not measured yet. We can show every claim's evidence, but we have not run a labelled evaluation. That is the main next step.

**Q: Does the model ever see secrets?**
No. It receives only public or already-fetched thread text; credentials stay in the server process and are never put in prompts or logs.

### Security

**Q: How are GitHub tokens stored?**
Encrypted with AES-256-GCM (random IV, auth tag) using a key derived from `ENCRYPTION_SECRET`; refresh happens server-side.

**Q: How are sessions handled?**
A 7-day signed JWT in an httpOnly cookie, with a Bearer-token fallback; every request re-loads the user from the database. OAuth uses a signed `state` to prevent CSRF.

**Q: What are the known security weaknesses?**
Token in `localStorage`, built-in fallback secrets, and unauthenticated `/api/ai/*` routes (§14).

### Quality and operations

**Q: How is it tested?**
157 server tests and 36 client tests. GitHub and the model are always faked in automated tests, including rate limits, failures and latency. DB-backed tests run only against a disposable local database.

**Q: What does CI check?**
Install, typecheck, lint, tests and build for both apps, plus Prisma schema validation (with placeholder URLs) on the backend.

**Q: What did you measure and optimise?**
GitHub request counts per sync (bulk vs REST, cold vs warm), a repository-list cache (second call within the TTL makes zero GitHub requests), throttled progress writes, a circuit breaker for model quota errors, and auto-analysis turned off by default.

**Q: What would you do next?**
(1) Fix the context-size/timeouts mismatch and measure model quality on labelled threads; (2) include related threads (follow-up PRs/issues, including links pointing *to* the issue) in the analysis context; (3) protect or remove `/api/ai/*`; (4) persist investigation status; (5) semantic search over decisions.

### Scope and honesty

**Q: What does it NOT do?**
It does not analyse private repositories without a GitHub App installation, does not investigate a single Discussion yet, does not read code diffs (only file paths), and does not claim correctness beyond showing the evidence.

**Q: Is any closed-model API used?**
No. The only model call goes to a local Ollama instance (`HACKATHON.MD` documents this).

**Q: Who built what with AI assistance?**
Claude Code was used for substantial parts (investigation module, tests, UI redesign, optimisation); scope, requirements and review were by the team. The PR templates disclose this as the hackathon requires.

---

## 18. Ten-minute demo script

1. Landing page → sign in with GitHub (OAuth, cookie set).
2. Add a repository by URL (shows instant return; import runs in the background).
3. Open the project: Overview (counts and status), then Decisions → open a record: status, reasoning, rejected alternative, **evidence quote → click through to the GitHub comment**.
4. Investigate panel: paste an issue/PR link → show live status, then **What happened** (each point linked to a comment), **Decisions found**, and the full conversation.
5. Show an honest failure: stop Ollama and re-run → status `partial`, real conversation still displayed.
6. Close with limitations (§14) and the next steps.
