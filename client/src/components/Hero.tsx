"use client";

import { useSyncExternalStore, useState } from "react";
import Link from "next/link";
import { api, getStoredSession } from "@/lib/api";
import { ArrowRight, GitBranch, FileCode2, GitPullRequest, MessageSquare } from "lucide-react";
import { GithubMark } from "@/components/GithubMark";

function subscribeSession(callback: () => void) {
  if (typeof window === "undefined") return () => {};
  window.addEventListener("storage", callback);
  return () => window.removeEventListener("storage", callback);
}

function getSessionSnapshot() {
  return Boolean(getStoredSession());
}

function getServerSnapshot() {
  return false;
}

type Tab = "decision" | "evidence" | "code";
const TABS: { id: Tab; label: string }[] = [
  { id: "decision", label: "Decision" },
  { id: "evidence", label: "Evidence" },
  { id: "code", label: "Code" },
];

const EVIDENCE = [
  {
    icon: MessageSquare,
    source: "Issue #142",
    quote: "Mongo seemed easier at first, but with decision graphs we'd end up hand-writing joins.",
    by: "@maya-k",
  },
  {
    icon: GitPullRequest,
    source: "PR #89 · merged",
    quote: "Prisma schema committed with User, Project, Decision and Evidence models.",
    by: "@sam-dev",
  },
  {
    icon: MessageSquare,
    source: "PR #89 review",
    quote: "Approved. Foreign key cascades keep repository cleanup simple.",
    by: "@alex-r",
  },
];

export function Hero() {
  const isAuthenticated = useSyncExternalStore(
    subscribeSession,
    getSessionSnapshot,
    getServerSnapshot
  );
  const [tab, setTab] = useState<Tab>("decision");

  const primary =
    "group inline-flex w-full items-center justify-center gap-2.5 rounded-full bg-lp-glow px-7 py-3.5 text-sm font-semibold text-lp-bg transition-all hover:brightness-110 hover:shadow-[0_0_40px_-4px_rgb(211_240_138/0.6)] sm:w-auto";
  const ghost =
    "inline-flex w-full items-center justify-center rounded-full border border-lp-line px-6 py-3.5 text-sm font-medium text-lp-ink transition-colors hover:border-lp-glow/50 hover:bg-white/5 sm:w-auto";

  return (
    <section className="relative px-6 pt-20 pb-24 sm:px-8 md:pt-32 md:pb-36">
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-col items-center text-center">
          <div className="lp-rise inline-flex items-center gap-2.5 rounded-full border border-lp-line bg-white/5 px-4 py-1.5 font-mono text-[11px] uppercase tracking-[0.18em] text-lp-mute">
            <span className="lp-ping relative h-1.5 w-1.5 rounded-full bg-lp-glow" />
            Open-weight AI · runs on your machine
          </div>

          <h1 className="lp-rise lp-rise-2 mt-8 text-[clamp(2.75rem,9vw,8rem)] font-semibold leading-[0.95] tracking-[-0.04em] text-lp-ink">
            Every codebase
            <br />
            has a story.{" "}
            <span className="lp-display lp-shine pr-2">Never lose the why.</span>
          </h1>

          <p className="lp-rise lp-rise-3 mt-8 max-w-xl text-base leading-relaxed text-lp-mute sm:text-lg">
            Dev Trace reads your GitHub issues and pull requests, recovers the decisions
            behind your code, and ties each one to the evidence.
          </p>

          <div className="lp-rise lp-rise-4 mt-10 flex w-full flex-col items-center justify-center gap-3 sm:w-auto sm:flex-row">
            {isAuthenticated ? (
              <>
                <Link href="/dashboard" className={primary}>
                  <GitBranch className="h-4 w-4" />
                  <span>Go to Dashboard</span>
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                </Link>
                <Link href="/dashboard/projects" className={ghost}>
                  View Connected Projects
                </Link>
              </>
            ) : (
              <>
                <a href={api.getAuthUrl("/dashboard")} className={primary}>
                  <GithubMark />
                  <span>Continue with GitHub</span>
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                </a>
                <Link href="/dashboard" className={ghost}>
                  Explore Dashboard
                </Link>
              </>
            )}
          </div>
        </div>

        {/* A decision, with its evidence */}
        <div className="lp-rise lp-rise-4 lp-float lp-card mx-auto mt-20 max-w-4xl overflow-hidden text-left md:mt-28">
          <div className="flex flex-col gap-3 border-b border-lp-line px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3 font-mono text-xs text-lp-mute">
              <span className="flex gap-1.5" aria-hidden="true">
                <i className="h-2.5 w-2.5 rounded-full bg-white/15" />
                <i className="h-2.5 w-2.5 rounded-full bg-white/15" />
                <i className="h-2.5 w-2.5 rounded-full bg-white/15" />
              </span>
              <span>core-repo · DEC-084 · illustrative example</span>
            </div>
            <div className="flex gap-1 self-start rounded-full bg-white/5 p-1 font-mono text-xs sm:self-auto">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  aria-pressed={tab === t.id}
                  onClick={() => setTab(t.id)}
                  className={`rounded-full px-3.5 py-1 transition-colors ${
                    tab === t.id
                      ? "bg-lp-glow font-semibold text-lp-bg"
                      : "text-lp-mute hover:text-lp-ink"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-6 p-6 sm:p-8">
            <div className="space-y-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-lp-glow/15 px-2.5 py-0.5 font-mono text-[11px] font-semibold uppercase tracking-wider text-lp-glow">
                <span className="h-1.5 w-1.5 rounded-full bg-lp-glow" />
                Accepted
              </span>
              <h2 className="text-xl font-semibold tracking-tight text-lp-ink sm:text-2xl">
                Why PostgreSQL on Supabase as the primary datastore?
              </h2>
            </div>

            {tab === "decision" && (
              <div className="dt-fade grid gap-6 md:grid-cols-2">
                <div>
                  <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-lp-mute">
                    Resolution
                  </p>
                  <p className="mt-2 text-sm leading-relaxed text-lp-ink">
                    Adopt PostgreSQL with Prisma as the single source of truth for projects,
                    decisions and evidence, because the evidence graph needs real foreign keys.
                  </p>
                </div>
                <div className="rounded-xl border border-lp-rust/30 bg-lp-rust/5 p-4">
                  <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-lp-rust">
                    Rejected
                  </p>
                  <p className="mt-2 text-sm font-semibold text-lp-ink">MongoDB</p>
                  <p className="mt-1 text-sm leading-relaxed text-lp-mute">
                    No native relational guarantees across evidence links; joins would live in
                    application code.
                  </p>
                </div>
              </div>
            )}

            {tab === "evidence" && (
              <div className="dt-fade grid gap-3 md:grid-cols-3">
                {EVIDENCE.map(({ icon: Icon, source, quote, by }) => (
                  <figure key={source + by} className="lp-panel p-4">
                    <figcaption className="flex items-center gap-2 font-mono text-xs text-lp-glow">
                      <Icon className="h-3.5 w-3.5" />
                      {source}
                    </figcaption>
                    <blockquote className="mt-3 text-sm italic leading-relaxed text-lp-ink">
                      “{quote}”
                    </blockquote>
                    <p className="mt-3 font-mono text-[11px] text-lp-mute">{by}</p>
                  </figure>
                ))}
              </div>
            )}

            {tab === "code" && (
              <div className="dt-fade divide-y divide-lp-line rounded-xl border border-lp-line">
                {[
                  ["server/prisma/schema.prisma", "Project, Decision, DecisionEvidence and User models"],
                  ["server/src/database/index.ts", "PrismaClient singleton on the Supabase pooler"],
                ].map(([file, note]) => (
                  <div
                    key={file}
                    className="flex flex-col gap-1 p-4 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <span className="flex items-center gap-2 font-mono text-xs text-lp-ink">
                      <FileCode2 className="h-4 w-4 text-lp-glow" />
                      {file}
                    </span>
                    <span className="text-sm text-lp-mute">{note}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
