# Dev Trace

Dev Trace is a developer workflow and activity tracking platform architected with an independent Next.js frontend and Express.js TypeScript backend backed by PostgreSQL (Supabase) and Prisma ORM.

---

## Architecture Overview

The repository consists of two decoupled applications:

- **`client/`**: Modern Next.js application with App Router, TypeScript, Tailwind CSS, and ESLint.
- **`server/`**: Robust Node.js and Express backend with TypeScript, PostgreSQL via Supabase, Prisma ORM, CORS support, and health checks.

Each application maintains its own `package.json`, TypeScript configuration, linting rules, Prettier settings, and environment management—without monorepo tooling or workspaces.

---

## Directory Structure

```text
Dev-Trace/
├── .gitignore
├── README.md
├── client/
│   ├── .env.example
│   ├── .env.local
│   ├── .gitignore
│   ├── .prettierignore
│   ├── .prettierrc.json
│   ├── eslint.config.mjs
│   ├── next.config.ts
│   ├── package.json
│   ├── tsconfig.json
│   ├── public/
│   └── src/
│       └── app/
│           ├── globals.css
│           ├── layout.tsx
│           └── page.tsx
└── server/
    ├── .env
    ├── .env.example
    ├── .gitignore
    ├── .prettierignore
    ├── .prettierrc.json
    ├── eslint.config.mjs
    ├── package.json
    ├── tsconfig.json
    ├── prisma/
    │   └── schema.prisma
    └── src/
        ├── app.ts
        ├── index.ts
        ├── config/
        │   └── env.ts
        ├── db/
        │   └── prisma.ts
        └── routes/
            └── health.ts
```

---

## Prerequisites

- **Node.js**: v18.0.0 or higher (v20+ recommended)
- **npm**: v9.0.0 or higher
- **PostgreSQL Database**: Supabase account and project connection strings

---

## Quick Start

### 1. Backend Setup (`server`)

Open a terminal and navigate to the `server` directory:

```bash
cd server
npm install
```

Set up environment variables:

```bash
# If .env doesn't exist, copy from .env.example
cp .env.example .env
```

Configure your Supabase PostgreSQL connection strings in `server/.env`:
- `DATABASE_URL`: Transaction pooler connection URL (port `6543`)
- `DIRECT_URL`: Direct connection URL (port `5432` for running migrations)

Generate the Prisma Client:

```bash
npm run db:generate
```

Apply migrations (once connected to your Supabase PostgreSQL instance):

```bash
npm run db:migrate
```

Start the backend in development mode (runs on port `5001`):

```bash
npm run dev
```

The Express server will start on `http://localhost:5001`.

Verify the health check endpoint:

```bash
curl http://localhost:5001/api/health
```

Expected JSON response:

```json
{
  "status": "ok",
  "timestamp": "2026-10-31T04:08:57.100Z",
  "uptime": 9.44,
  "service": "Dev Trace Backend API",
  "version": "1.0.0"
}
```

### 2. Frontend Setup (`client`)

Open a second terminal and navigate to the `client` directory:

```bash
cd client
npm install
```

Set up environment variables:

```bash
# If .env.local doesn't exist, copy from .env.example
cp .env.example .env.local
```

Start the Next.js development server (runs on port `3000`):

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser. The frontend includes a live backend status card that communicates directly with the Express API via CORS.

---

## Environment Variables

### Client (`client/.env.example`)

| Variable | Default Value | Description |
| :--- | :--- | :--- |
| `NEXT_PUBLIC_API_URL` | `http://localhost:5001` | Express backend base URL accessible by the browser |

### Server (`server/.env.example`)

| Variable | Default Value | Description |
| :--- | :--- | :--- |
| `PORT` | `5001` | Express server listen port *(Port 5001 is default to prevent macOS AirPlay port 5000 collision)* |
| `NODE_ENV` | `development` | Application runtime environment (`development` / `production`) |
| `CLIENT_ORIGIN` | `http://localhost:3000` | Allowed CORS origin for the frontend application |
| `DATABASE_URL` | *Supabase pooler URL* | PostgreSQL connection string with transaction pooler (port `6543`) |
| `DIRECT_URL` | *Supabase direct URL* | PostgreSQL direct connection string for Prisma migrations (port `5432`) |

---

## Available Scripts

### Client (`client/`)

- `npm run dev` — Starts Next.js development server with Turbopack on port 3000.
- `npm run build` — Creates an optimized production build.
- `npm run start` — Runs the compiled Next.js production server.
- `npm run lint` — Runs ESLint checks.
- `npm run typecheck` — Runs TypeScript compiler checks without emitting files.
- `npm run format` — Formats files with Prettier.
- `npm run format:check` — Checks file formatting with Prettier.

### Server (`server/`)

- `npm run dev` — Starts Express development server with live reload via `tsx watch`.
- `npm run build` — Compiles TypeScript to `dist/`.
- `npm run start` — Runs the compiled production server from `dist/index.js`.
- `npm run lint` — Runs ESLint checks.
- `npm run typecheck` — Runs TypeScript compiler checks without emitting files.
- `npm run format` — Formats files with Prettier.
- `npm run format:check` — Checks file formatting with Prettier.
- `npm run db:validate` — Validates the Prisma schema.
- `npm run db:generate` — Generates the Prisma Client.
- `npm run db:migrate` — Runs Prisma migrations in development (`prisma migrate dev`).
- `npm run db:studio` — Opens Prisma Studio GUI to inspect database records.

---

## API Endpoints

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/` | API status and metadata |
| `GET` | `/health` | Server health check (uptime, status, timestamp) |
| `GET` | `/api/health` | Canonical API health check endpoint used by the frontend |
