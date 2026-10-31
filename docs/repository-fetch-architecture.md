# Repository fetch architecture

## Flow

1. **Dashboard mount** (`client/src/context/DashboardContext.tsx` ~L135): calls `GET /api/github/repositories?perPage=100`.
2. **Controller** (`server/src/modules/github/github.controller.ts` L241): reads `page`, `perPage`, `search`, `visibility`, `installationId`, then calls the service.
3. **Service** (`github.repository.service.ts`, `listRepositories`):
   - Refreshes the GitHub token if expired (`github.auth.service.ts` L278).
   - Loads the user's installations from the DB (`github.installation.service.ts` `getUserInstallations`). If none are found, it calls GitHub to sync them.
   - Loads all of the user's connected projects from the DB.
   - **For each installation, sequentially**, calls `octokit.paginate(listInstallationReposForAuthenticatedUser, per_page 100)`. This fetches every repo the installation exposes.
   - Filters by visibility and search, sorts by `updatedAt`, then slices to one page.
4. **Response**: one page plus `totalCount` and `hasMore`.

## Findings

| # | Problem | Where | Effect |
|---|---|---|---|
| 1 | **Every request fetches all repos from GitHub.** Pagination happens on the server before the slice. | service `paginate` | Cost grows with repo count, not page size. Page 1 costs as much as page N. |
| 2 | **No cache.** Nothing is stored between requests. | whole path | Each dashboard load repeats the full GitHub crawl. |
| 3 | **Installations are fetched one at a time**, in a `for` loop with `await`. | service loop | Latency is the sum of all installation calls, not the slowest one. |
| 4 | **Sync on the read path.** `getUserInstallations` and `verifyUserInstallationAccess` call GitHub when the DB has no rows, and a user with zero installations triggers a sync on every request. | installation service | Extra GitHub round-trips on reads. The catch returns `[]` silently. |
| 5 | **Dashboard always asks for 100.** The client requests `perPage: 100` once on each mount and never pages. | DashboardContext L135 | Large payload every load. The `/dashboard/projects` search and filters run only on the client, over what was already loaded. |
| 6 | **Connected-project lookup is a DB query on every request.** | service `findMany` | Small, but it runs even when nothing changed. |
| 7 | **Sync module exists but is not on this path.** `server/src/modules/github/sync/` handles ingestion, yet repo listing never reads from the DB. | sync module | The data needed for a fast read is already stored by a separate path; listing ignores it. |
| 8 | **Octokit is rebuilt per request** (`createUserOctokit`). | github.client.ts | Minor cost; no connection reuse across requests. |

## Likely cause of "very slow"

Findings 1, 2 and 3 compound each other. Each dashboard load makes a fresh, sequential crawl of every installation, and the response is sliced only after the crawl finishes. Finding 5 makes it worse by always requesting 100 repos. Finding 4 adds GitHub calls when installations are missing.

I have not measured this. Confirm with timing before optimizing:

```bash
time curl -s -b "devtrace_session=<token>" "http://localhost:5001/api/github/repositories?perPage=100" -o /dev/null
```

Run it twice, using your session cookie from the browser. The second run shows whether anything is cached (nothing should be).

## Recommended fixes, in order of impact

1. **Store repos in the DB and serve reads from it.** The sync module already ingests data. Listing should read a `repositories` table with `ORDER BY updated_at DESC LIMIT/OFFSET`, which makes page cost independent of total repos. Sync in the background on a schedule or webhook.
2. **Fetch installations in parallel** (`Promise.all`) as a stopgap if (1) is delayed.
3. **Move installation sync out of the read path.** Reads should never call GitHub. Sync on connect and on webhook.
4. **Page from the client.** Request `perPage=20` and load more on scroll or button.
5. **Cache the Octokit client per user** and keep a short TTL cache on the repo list as a stopgap for (1).

Fixes 1 and 4 together should be the main gain. Fix 3 is a safe quick win that needs no schema change.
