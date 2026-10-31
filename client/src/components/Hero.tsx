"use client";

import { useSyncExternalStore, useState } from "react";
import Link from "next/link";
import { api, getStoredSession } from "@/lib/api";
import {
  ArrowRight,
  GitBranch,
  FileCode2,
  GitPullRequest,
  MessageSquare,
  ShieldCheck,
  CheckCircle2,
  ExternalLink,
} from "lucide-react";

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

export function Hero() {
  const isAuthenticated = useSyncExternalStore(
    subscribeSession,
    getSessionSnapshot,
    getServerSnapshot
  );

  const [activeTab, setActiveTab] = useState<"decision" | "evidence" | "code">(
    "decision"
  );

  return (
    <section className="relative pt-16 pb-20 md:pt-24 md:pb-28 overflow-hidden">
      <div className="max-w-6xl mx-auto px-6 sm:px-8">
        {/* Main Pitch */}
        <div className="max-w-3xl mx-auto text-center flex flex-col items-center">
          {/* Subtle Pill Tag */}
          <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-[#EAE4D5] text-[#2D3327] text-[11px] font-mono uppercase tracking-wider font-semibold mb-6 border border-[#DDD8CC] shadow-2xs">
            <span className="w-1.5 h-1.5 rounded-full bg-[#4E673D] animate-pulse" />
            <span>The Architectural Memory Layer for Engineering Teams</span>
          </div>

          {/* Impactful Headline */}
          <h1 className="text-4xl sm:text-6xl md:text-7xl font-extrabold tracking-tight text-[#283022] leading-[1.08]">
            Every codebase has a story.{" "}
            <span className="text-[#4E673D]">Never lose the why.</span>
          </h1>

          {/* Subtitle with better spacing */}
          <p className="mt-6 text-base sm:text-lg text-[#6F7365] leading-relaxed max-w-2xl font-normal">
            Dev Trace preserves the technical decisions behind your code, connecting pull requests, RFC debates, and Discord discussions directly to the files they shaped.
          </p>

          {/* Action CTAs */}
          <div className="mt-9 flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto">
            {isAuthenticated ? (
              <>
                <Link
                  href="/dashboard"
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-[#35432C] hover:bg-[#283421] active:bg-[#1E2718] text-[#FAF8F3] font-semibold text-xs transition-all shadow-xs group"
                >
                  <GitBranch className="w-4 h-4 text-[#C5D6B4]" />
                  <span>Go to Dashboard</span>
                  <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
                </Link>
                <Link
                  href="/dashboard/projects"
                  className="w-full sm:w-auto inline-flex items-center justify-center px-5 py-3 rounded-xl text-[#35432C] hover:bg-[#EAE4D5] font-semibold text-xs transition-colors border border-transparent hover:border-[#DDD8CC]"
                >
                  View Connected Projects
                </Link>
              </>
            ) : (
              <>
                <a
                  href={api.getAuthUrl("/dashboard")}
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2.5 px-6 py-3 rounded-xl bg-[#35432C] hover:bg-[#283421] active:bg-[#1E2718] text-[#FAF8F3] font-semibold text-xs transition-all shadow-xs group"
                >
                  <svg
                    className="w-4 h-4 fill-current"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <path
                      fillRule="evenodd"
                      clipRule="evenodd"
                      d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
                    />
                  </svg>
                  <span>Continue with GitHub</span>
                  <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
                </a>
                <Link
                  href="/dashboard"
                  className="w-full sm:w-auto inline-flex items-center justify-center px-5 py-3 rounded-xl text-[#35432C] hover:bg-[#EAE4D5] font-semibold text-xs transition-colors border border-transparent hover:border-[#DDD8CC]"
                >
                  Explore Dashboard
                </Link>
              </>
            )}
          </div>

          {/* Micro-proof indicators */}
          <div className="mt-8 flex flex-wrap items-center justify-center gap-5 text-xs text-[#77796F] font-mono">
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-[#4E673D]" />
              Zero code modification
            </span>
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-[#4E673D]" />
              Official GitHub App
            </span>
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-[#4E673D]" />
              Discord collector sync
            </span>
          </div>
        </div>

        {/* Compelling Product Visualization: Technical Decision History, Evidence & Code Relationships */}
        <div className="mt-16 max-w-5xl mx-auto rounded-2xl bg-white border border-[#DDD8CC] shadow-[0_12px_40px_-8px_rgba(45,51,39,0.12)] overflow-hidden font-sans">
          {/* Top Console Bar */}
          <div className="px-5 py-3.5 bg-[#FAF8F3] border-b border-[#EAE4D5] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-[#EAE4D5] border border-[#DDD8CC]" />
                <span className="w-2.5 h-2.5 rounded-full bg-[#EAE4D5] border border-[#DDD8CC]" />
                <span className="w-2.5 h-2.5 rounded-full bg-[#EAE4D5] border border-[#DDD8CC]" />
              </div>
              <span className="text-[#DDD8CC] text-xs">|</span>
              <div className="flex items-center gap-1.5 text-xs font-mono text-[#77796F]">
                <span className="text-[#2D3327] font-semibold">dev-trace / core-repo</span>
                <span>/</span>
                <span>DEC-084</span>
              </div>
            </div>

            {/* Interactive Tabs */}
            <div className="flex items-center gap-1 bg-[#EAE4D5]/60 p-1 rounded-xl text-xs font-mono self-start sm:self-auto">
              <button
                type="button"
                onClick={() => setActiveTab("decision")}
                className={`px-3 py-1 rounded-lg transition-colors ${
                  activeTab === "decision"
                    ? "bg-white text-[#2D3327] font-bold shadow-2xs"
                    : "text-[#77796F] hover:text-[#2D3327]"
                }`}
              >
                ADR Document
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("evidence")}
                className={`px-3 py-1 rounded-lg transition-colors ${
                  activeTab === "evidence"
                    ? "bg-white text-[#2D3327] font-bold shadow-2xs"
                    : "text-[#77796F] hover:text-[#2D3327]"
                }`}
              >
                Evidence Trace (3)
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("code")}
                className={`px-3 py-1 rounded-lg transition-colors ${
                  activeTab === "code"
                    ? "bg-white text-[#2D3327] font-bold shadow-2xs"
                    : "text-[#77796F] hover:text-[#2D3327]"
                }`}
              >
                Code References (2)
              </button>
            </div>
          </div>

          {/* Interactive Visualizer Canvas */}
          <div className="p-6 sm:p-8 space-y-6">
            {/* Header row */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-6 border-b border-[#F2ECE0]">
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-bold text-[#5A684E]">
                    DEC-084
                  </span>
                  <span className="text-[#DDD8CC]">·</span>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-[#DCE6D3] text-[#2D3728]">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#4E673D]" />
                    ACCEPTED INVARIANT
                  </span>
                  <span className="text-[#DDD8CC] hidden sm:inline">·</span>
                  <span className="text-xs font-mono text-[#77796F] hidden sm:inline">
                    Oct 14, 2026
                  </span>
                </div>
                <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-[#283022]">
                  Why did we choose PostgreSQL on Supabase as the primary datastore?
                </h2>
              </div>

              <div className="flex items-center gap-2 self-start sm:self-center">
                <span className="flex items-center gap-1.5 text-xs font-mono text-[#5A684E] bg-[#FAF8F3] px-3 py-1.5 rounded-lg border border-[#DDD8CC]">
                  <FileCode2 className="w-3.5 h-3.5" />
                  <span>schema.prisma:L1-188</span>
                </span>
              </div>
            </div>

            {/* Tab 1: ADR Document View */}
            {activeTab === "decision" && (
              <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-start animate-in fade-in duration-150">
                <div className="md:col-span-7 space-y-5">
                  <div>
                    <span className="text-[11px] font-mono uppercase tracking-wider text-[#77796F] font-bold">
                      Resolution
                    </span>
                    <p className="text-sm text-[#283022] font-semibold mt-1 leading-relaxed">
                      Adopt PostgreSQL on Supabase with Prisma ORM as the single source of truth for all project, decision, and evidence records.
                    </p>
                  </div>

                  <div>
                    <span className="text-[11px] font-mono uppercase tracking-wider text-[#77796F] font-bold">
                      Consensus Context & Rationale
                    </span>
                    <p className="text-xs text-[#6F7365] leading-relaxed mt-1">
                      Relational consistency and strong foreign key cascades were required to model multi-entity evidence graphs linking commits, pull requests, and chat threads. Supabase offers managed connection pooling and seamless auth integration.
                    </p>
                  </div>

                  <div className="pt-3 border-t border-[#F2ECE0]">
                    <span className="text-[11px] font-mono uppercase tracking-wider text-[#9E3426] font-bold">
                      Rejected Alternative
                    </span>
                    <div className="mt-1.5 p-3 rounded-xl bg-red-50/60 border border-red-100 text-xs space-y-1">
                      <div className="font-bold text-[#8A2417]">
                        MongoDB / Document DB
                      </div>
                      <p className="text-[#6E2B20] text-[11px] leading-relaxed">
                        Lacked native relational consistency across evidence graphs, requiring fragile application-level joins and risking orphaned citations.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Right: Quick Evidence Mini-panel */}
                <div className="md:col-span-5 bg-[#FAF8F3] p-5 rounded-xl border border-[#EAE4D5] space-y-4">
                  <div className="flex items-center justify-between text-xs font-mono">
                    <span className="text-[11px] uppercase tracking-wider text-[#77796F] font-bold">
                      Supporting Citations
                    </span>
                    <span className="text-[#5A684E] flex items-center gap-1 font-semibold text-[10px]">
                      <ShieldCheck className="w-3.5 h-3.5" />
                      Cryptographically Linked
                    </span>
                  </div>

                  <div className="space-y-3 text-xs">
                    <div className="p-3 bg-white rounded-lg border border-[#DDD8CC] space-y-1">
                      <div className="flex items-center justify-between text-[10px] font-mono text-[#77796F]">
                        <span className="font-bold text-[#283022]">Discord #architecture</span>
                        <span>Oct 14</span>
                      </div>
                      <p className="italic text-[#41463B] text-[11px]">
                        &quot;Postgres + Prisma gives us strict foreign keys and zero manual join errors.&quot;
                      </p>
                    </div>

                    <div className="p-3 bg-white rounded-lg border border-[#DDD8CC] space-y-1">
                      <div className="flex items-center justify-between text-[10px] font-mono text-[#77796F]">
                        <span className="font-bold text-[#283022]">PR #89: Schema Review</span>
                        <span>Merged</span>
                      </div>
                      <p className="italic text-[#41463B] text-[11px]">
                        &quot;Approved. Foreign key cascading handles repository cleanups cleanly.&quot;
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Tab 2: Full Evidence Trace View */}
            {activeTab === "evidence" && (
              <div className="space-y-4 animate-in fade-in duration-150">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="p-4 rounded-xl bg-[#FAF8F3] border border-[#EAE4D5] space-y-2">
                    <div className="flex items-center gap-2 text-xs font-mono text-[#5A684E] font-bold">
                      <MessageSquare className="w-3.5 h-3.5" />
                      <span>Discord #architecture</span>
                    </div>
                    <p className="text-xs italic text-[#41463B] leading-relaxed">
                      &quot;Mongo seemed easier at first, but with decision graphs, we’ll end up writing manual joins. Postgres + Prisma is the clear winner.&quot;
                    </p>
                    <div className="text-[10px] font-mono text-[#77796F] pt-1">
                      By Hannes Rudolph · Oct 14, 15:42
                    </div>
                  </div>

                  <div className="p-4 rounded-xl bg-[#FAF8F3] border border-[#EAE4D5] space-y-2">
                    <div className="flex items-center gap-2 text-xs font-mono text-[#5A684E] font-bold">
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span>Discussion #142 (Storage)</span>
                    </div>
                    <p className="text-xs italic text-[#41463B] leading-relaxed">
                      &quot;Agreed on PostgreSQL. Schema migrations via Prisma give us type safety and reproducible staging environments.&quot;
                    </p>
                    <div className="text-[10px] font-mono text-[#77796F] pt-1">
                      By @sarah-tech · Oct 14, 17:10
                    </div>
                  </div>

                  <div className="p-4 rounded-xl bg-[#FAF8F3] border border-[#EAE4D5] space-y-2">
                    <div className="flex items-center gap-2 text-xs font-mono text-[#5A684E] font-bold">
                      <GitPullRequest className="w-3.5 h-3.5" />
                      <span>Pull Request #89 (Merged)</span>
                    </div>
                    <p className="text-xs italic text-[#41463B] leading-relaxed">
                      &quot;Prisma schema committed with User, Project, Decision, and Evidence models with foreign keys.&quot;
                    </p>
                    <div className="text-[10px] font-mono text-[#77796F] pt-1">
                      Merged by @alex-tech · 2 approvals
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Tab 3: Code References View */}
            {activeTab === "code" && (
              <div className="space-y-4 animate-in fade-in duration-150">
                <div className="divide-y divide-[#EAE4D5] rounded-xl border border-[#EAE4D5] overflow-hidden">
                  <div className="p-4 bg-[#FAF8F3] flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs font-mono">
                    <div className="flex items-center gap-2">
                      <FileCode2 className="w-4 h-4 text-[#5A684E]" />
                      <span className="font-bold text-[#2D3327]">server/prisma/schema.prisma</span>
                      <span className="text-[#77796F] text-[10px]">:L1-L188</span>
                    </div>
                    <span className="text-[11px] font-sans text-[#77796F]">
                      Models for Project, Decision, DecisionEvidence, and User
                    </span>
                  </div>

                  <div className="p-4 bg-[#FAF8F3] flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs font-mono">
                    <div className="flex items-center gap-2">
                      <FileCode2 className="w-4 h-4 text-[#5A684E]" />
                      <span className="font-bold text-[#2D3327]">server/src/database/index.ts</span>
                      <span className="text-[#77796F] text-[10px]">:L12-L64</span>
                    </div>
                    <span className="text-[11px] font-sans text-[#77796F]">
                      PrismaClient singleton with Supabase session pooling
                    </span>
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-[#FFFBEB] border border-[#FDE68A] flex items-center justify-between text-xs text-[#92400E]">
                  <span className="flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-[#D97706]" />
                    <span>Protected by Dev Trace PR Invariant Bot: Any PR modifying this pooler triggers historical context check.</span>
                  </span>
                  <span className="font-mono text-[10px] font-bold uppercase">Shield Active</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
