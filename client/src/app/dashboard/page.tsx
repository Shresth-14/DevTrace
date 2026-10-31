"use client";

import React from "react";
import Link from "next/link";
import { useDashboard } from "@/context/DashboardContext";
import {
  ArrowRight,
  Plus,
  Lock,
  Globe,
  Sparkles,
} from "lucide-react";

export default function DashboardOverviewPage() {
  const { user, projects, integrations, openAddProject } = useDashboard();

  // Derived values from current dashboard state
  const totalDecisions = projects.reduce(
    (acc, p) => acc + p.decisionsCount,
    0
  );
  const activeSourcesCount = integrations.filter((i) => i.connected).length;
  const recentProjects = projects.slice(0, 3);

  // Sample recent architectural decisions across connected projects
  const recentDecisions = [
    {
      id: "DEC-084",
      title: "PostgreSQL on Supabase as primary datastore",
      project: projects[0]?.name || "Dev-Trace",
      slug: projects[0]?.slug || "dev-trace",
      status: "ACCEPTED",
      date: "Oct 14, 2026",
      rationale:
        "Selected PostgreSQL with Prisma ORM to guarantee relational consistency and foreign key constraints across decision evidence graphs.",
    },
    {
      id: "DEC-042",
      title: "Supabase Session Pooler on Port 5432",
      project: projects[0]?.name || "Dev-Trace",
      slug: projects[0]?.slug || "dev-trace",
      status: "ACCEPTED",
      date: "Oct 18, 2026",
      rationale:
        "Enforced port 5432 session pooling to support Prisma prepared statements and prevent connection spikes during automated migrations.",
    },
    {
      id: "DEC-061",
      title: "Isolated Go Collector without Monorepo Tooling",
      project: projects[1]?.name || "discrawl",
      slug: projects[1]?.slug || "discrawl",
      status: "ACCEPTED",
      date: "Oct 22, 2026",
      rationale:
        "Kept the Discord collector independently buildable to minimize dependency coupling and keep deployment targets lightweight.",
    },
  ];

  return (
    <div className="space-y-12 animate-in fade-in duration-150">
      {/* Top Banner / Heading */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-[#EAE4D5]">
        <div>
          <span className="text-[11px] font-mono uppercase tracking-wider text-[#5A684E] font-semibold">
            Maintainer Overview
          </span>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#2D3327] mt-1">
            Welcome back, {user.name}
          </h1>
          <p className="text-xs sm:text-sm text-[#77796F] mt-1">
            Your connected repositories, architectural memory coverage, and active telemetry.
          </p>
        </div>

        <button
          type="button"
          onClick={openAddProject}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#35432C] hover:bg-[#283421] active:bg-[#1E2718] text-[#FAF8F3] text-xs font-semibold transition-colors shadow-xs self-start sm:self-auto cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5 text-[#C5D6B4]" />
          <span>Add project</span>
        </button>
      </div>

      {/* Creative Typography-Led Telemetry Section (Distinctive, informative, non-boxy) */}
      <div className="relative pt-2 pb-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-end">
          {/* Main Hero Stat: Decisions Preserved (7 cols) */}
          <div className="lg:col-span-7 space-y-4">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#DCE6D3] text-[#2D3728] text-[11px] font-mono font-semibold">
                <span className="w-1.5 h-1.5 rounded-full bg-[#4E673D] animate-pulse" />
                Live Decision Coverage
              </span>
              <span className="text-xs font-mono text-[#77796F]">
                · Across all codebases
              </span>
            </div>

            <div className="flex items-baseline gap-4">
              <div className="text-6xl sm:text-7xl font-extralight tracking-tight text-[#2D3327] font-mono">
                {totalDecisions}
              </div>
              <div className="space-y-1">
                <div className="text-sm font-bold text-[#2D3327] tracking-tight">
                  Architectural Decisions
                </div>
                <div className="text-xs text-[#77796F] font-mono flex items-center gap-1.5">
                  <span className="text-[#35432C] font-semibold">100% verified</span>
                  <span>with verbatim discussion traces</span>
                </div>
              </div>
            </div>

            <p className="text-xs sm:text-sm text-[#6F7365] leading-relaxed max-w-xl">
              Historical engineering trade-offs extracted from PRs, discussions, and Discord threads, protected from regression in code reviews.
            </p>
          </div>

          {/* Secondary Stats Grid (5 cols) */}
          <div className="lg:col-span-5 grid grid-cols-1 sm:grid-cols-2 gap-6 pt-6 lg:pt-0 lg:pl-8 lg:border-l border-[#EAE4D5]">
            {/* Secondary 1: Repositories */}
            <div className="space-y-2">
              <span className="text-[10px] font-mono uppercase tracking-wider text-[#77796F] font-semibold">
                Repositories
              </span>
              <div className="text-4xl font-light text-[#2D3327] font-mono">
                {projects.length}
              </div>
              <p className="text-xs text-[#6F7365]">
                Authorized repositories under active invariant protection.
              </p>
              <div className="pt-1 flex items-center gap-1.5 text-[11px] font-mono text-[#5A684E]">
                <span className="w-1.5 h-1.5 rounded-full bg-[#4E673D]" />
                <span>Webhooks active</span>
              </div>
            </div>

            {/* Secondary 2: Ingestion Sources */}
            <div className="space-y-2">
              <span className="text-[10px] font-mono uppercase tracking-wider text-[#77796F] font-semibold">
                Ingestion Sources
              </span>
              <div className="text-4xl font-light text-[#2D3327] font-mono">
                {activeSourcesCount}
                <span className="text-lg text-[#77796F] font-normal">/{integrations.length}</span>
              </div>
              <p className="text-xs text-[#6F7365]">
                {activeSourcesCount === integrations.length
                  ? "GitHub & Discord streams synchronized."
                  : "GitHub active, Discord collector available."}
              </p>
              <div className="pt-1 flex items-center gap-1.5 text-[11px] font-mono text-[#77796F]">
                <span>2-way sync enabled</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Connected Repositories (Card-based showcase) */}
      <div className="space-y-5 pt-4 border-t border-[#EAE4D5]">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base sm:text-lg font-bold text-[#2D3327]">
              Connected Repositories
            </h2>
            <p className="text-xs text-[#77796F]">
              Repositories synchronized into your architectural memory layer.
            </p>
          </div>

          <Link
            href="/dashboard/projects"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#35432C] hover:underline"
          >
            <span>View all projects ({projects.length})</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        {recentProjects.length === 0 ? (
          <div className="p-10 rounded-2xl bg-white border border-[#DDD8CC] text-center space-y-3">
            <p className="text-xs text-[#77796F]">No connected projects yet.</p>
            <button
              type="button"
              onClick={openAddProject}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#35432C] text-white text-xs font-semibold"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add your first project</span>
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {recentProjects.map((project) => (
              <div
                key={project.id}
                className="bg-white rounded-2xl border border-[#DDD8CC] p-5 flex flex-col justify-between hover:border-[#9BAF8B] hover:shadow-[0_6px_20px_-4px_rgba(45,51,39,0.08)] transition-all duration-200 group"
              >
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs text-[#77796F] truncate">
                      {project.owner}
                    </span>
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-medium ${
                        project.isPrivate
                          ? "bg-[#EAE6D8] text-[#5A6052]"
                          : "bg-[#DCE6D3] text-[#2D3728]"
                      }`}
                    >
                      {project.isPrivate ? (
                        <Lock className="w-2.5 h-2.5" />
                      ) : (
                        <Globe className="w-2.5 h-2.5" />
                      )}
                      <span>{project.isPrivate ? "Private" : "Public"}</span>
                    </span>
                  </div>

                  <Link
                    href={`/p/${project.slug}`}
                    className="text-sm font-bold text-[#2D3327] group-hover:underline block truncate"
                  >
                    {project.name}
                  </Link>

                  <p className="text-xs text-[#6F7365] line-clamp-2 leading-relaxed min-h-[2rem]">
                    {project.description}
                  </p>
                </div>

                <div className="pt-4 mt-4 border-t border-[#F2ECE0] flex items-center justify-between text-xs">
                  <span className="flex items-center gap-1.5 text-[11px] font-medium text-[#2D3327]">
                    <span
                      className="w-2 h-2 rounded-full"
                      style={{ backgroundColor: project.languageColor }}
                    />
                    {project.primaryLanguage}
                  </span>

                  <Link
                    href={`/p/${project.slug}`}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-[#35432C] hover:text-[#283421]"
                  >
                    <span>{project.decisionsCount} decisions</span>
                    <ArrowRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Recent Architectural Decision Discoveries */}
      <div className="space-y-4 pt-4 border-t border-[#EAE4D5]">
        <div>
          <h2 className="text-base sm:text-lg font-bold text-[#2D3327]">
            Recent Decision Discoveries
          </h2>
          <p className="text-xs text-[#77796F]">
            High-confidence technical trade-offs extracted from PR discussions & RFCs.
          </p>
        </div>

        <div className="rounded-2xl bg-white border border-[#DDD8CC] divide-y divide-[#EAE4D5] overflow-hidden">
          {recentDecisions.map((dec) => (
            <div
              key={dec.id}
              className="p-5 hover:bg-[#FAF8F3] transition-colors space-y-2.5"
            >
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-bold text-[#5A684E]">
                    {dec.id}
                  </span>
                  <span className="text-xs font-bold text-[#2D3327]">
                    {dec.title}
                  </span>
                  <span className="text-[10px] font-mono bg-[#DCE6D3] text-[#2D3728] px-1.5 py-0.5 rounded font-bold">
                    {dec.status}
                  </span>
                </div>
                <span className="text-[11px] font-mono text-[#77796F]">
                  {dec.date}
                </span>
              </div>

              <p className="text-xs text-[#6F7365] leading-relaxed">
                {dec.rationale}
              </p>

              <div className="flex items-center justify-between pt-1 text-[11px] font-mono text-[#77796F]">
                <span>Repository: {dec.project}</span>
                <Link
                  href={`/p/${dec.slug}`}
                  className="text-[#35432C] font-semibold hover:underline inline-flex items-center gap-1"
                >
                  <span>Explore decision trace</span>
                  <ArrowRight className="w-3 h-3" />
                </Link>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Multi-source banner */}
      <div className="p-6 rounded-2xl bg-[#EAE6D8]/50 border border-[#DDD8CC] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-start gap-3.5">
          <div className="w-9 h-9 rounded-xl bg-white border border-[#DDD8CC] flex items-center justify-center shrink-0 text-[#35432C] shadow-2xs">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <h4 className="text-xs font-bold text-[#2D3327]">
              Multi-source Architectural Graph
            </h4>
            <p className="text-xs text-[#77796F] mt-0.5 max-w-xl">
              Connect Discord alongside GitHub to catch architectural debates and trade-offs before they disappear into chat scrollback.
            </p>
          </div>
        </div>

        <Link
          href="/dashboard/integrations"
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white hover:bg-[#FAF8F3] border border-[#DDD8CC] text-xs font-semibold text-[#2D3327] transition-colors shrink-0 self-start sm:self-auto shadow-2xs"
        >
          <span>Manage Integrations</span>
          <ArrowRight className="w-3 h-3 text-[#77796F]" />
        </Link>
      </div>
    </div>
  );
}
