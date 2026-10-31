"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useDashboard } from "@/context/DashboardContext";
import { api, type DashboardSummary } from "@/lib/api";
import { AI_LABEL, SYNC_LABEL, formatDate, relativeTime } from "@/lib/format";
import { ArrowRight, Plus, Lock, Globe } from "lucide-react";

export default function DashboardOverviewPage() {
  const { user, projects, projectsLoading, projectsError, openAddProject } =
    useDashboard();

  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [summaryError, setSummaryError] = useState<string | null>(null);

  // Re-read the summary whenever project counts change (e.g. after an extraction finishes).
  const signature = projects
    .map((p) => `${p.id}:${p.decisionsCount}:${p.aiStatus}`)
    .join("|");
  useEffect(() => {
    let live = true;
    api
      .getDashboardSummary()
      .then((s) => {
        if (live) {
          setSummary(s);
          setSummaryError(null);
        }
      })
      .catch((err: unknown) => {
        if (live) {
          setSummaryError(
            err instanceof Error ? err.message : "Could not load recent decisions."
          );
        }
      });
    return () => {
      live = false;
    };
  }, [signature]);

  const totalDecisions = projects.reduce((n, p) => n + p.decisionsCount, 0);
  const analysing = projects.filter(
    (p) => p.syncStatus === "running" || p.aiStatus === "running"
  ).length;
  const recentProjects = projects.slice(0, 3);

  return (
    <div className="space-y-12 animate-in fade-in duration-150">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-[#EAE4D5]">
        <div>
          <span className="text-[11px] font-mono uppercase tracking-wider text-[#5A684E] font-semibold">
            Overview
          </span>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#2D3327] mt-1">
            Welcome back, {user.name}
          </h1>
          <p className="text-xs sm:text-sm text-[#77796F] mt-1">
            Your connected repositories and the decisions recovered from them.
          </p>
        </div>

        <button
          type="button"
          onClick={openAddProject}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#35432C] hover:bg-[#283421] text-[#FAF8F3] text-xs font-semibold transition-colors shadow-xs self-start sm:self-auto cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5 text-[#C5D6B4]" />
          <span>Add project</span>
        </button>
      </div>

      {projectsError ? (
        <div role="alert" className="p-4 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700">
          Could not load your projects: {projectsError}
        </div>
      ) : null}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-end pt-2 pb-6">
        <div className="lg:col-span-7 space-y-3">
          <div className="flex items-baseline gap-4">
            <div className="text-6xl sm:text-7xl font-extralight tracking-tight text-[#2D3327] font-mono">
              {projectsLoading ? "–" : totalDecisions}
            </div>
            <div className="text-sm font-bold text-[#2D3327] tracking-tight">
              Decisions recovered
            </div>
          </div>
          <p className="text-xs sm:text-sm text-[#6F7365] leading-relaxed max-w-xl">
            {totalDecisions === 0 && !projectsLoading
              ? "Nothing has been recovered yet. Decisions appear after a repository has been imported and its discussions analysed."
              : "Counted from the decision records stored for your repositories, each linked to its original GitHub discussion."}
          </p>
        </div>

        <div className="lg:col-span-5 grid grid-cols-2 gap-6 pt-6 lg:pt-0 lg:pl-8 lg:border-l border-[#EAE4D5]">
          <div className="space-y-1">
            <span className="text-[10px] font-mono uppercase tracking-wider text-[#77796F] font-semibold">
              Repositories
            </span>
            <div className="text-4xl font-light text-[#2D3327] font-mono">
              {projectsLoading ? "–" : projects.length}
            </div>
          </div>
          <div className="space-y-1">
            <span className="text-[10px] font-mono uppercase tracking-wider text-[#77796F] font-semibold">
              In progress
            </span>
            <div className="text-4xl font-light text-[#2D3327] font-mono">
              {projectsLoading ? "–" : analysing}
            </div>
            <p className="text-[11px] text-[#77796F]">importing or analysing</p>
          </div>
        </div>
      </div>

      <div className="space-y-5 pt-4 border-t border-[#EAE4D5]">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base sm:text-lg font-bold text-[#2D3327]">Connected repositories</h2>
            <p className="text-xs text-[#77796F]">Most recently updated first.</p>
          </div>
          <Link href="/dashboard/projects" className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#35432C] hover:underline">
            <span>View all projects ({projects.length})</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        {projectsLoading ? (
          <p role="status" className="text-xs text-[#77796F]">Loading your projects…</p>
        ) : recentProjects.length === 0 ? (
          <div className="p-10 rounded-2xl bg-white border border-dashed border-[#DDD8CC] text-center space-y-3">
            <p className="text-xs text-[#77796F]">No repositories added yet.</p>
            <button
              type="button"
              onClick={openAddProject}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#35432C] text-white text-xs font-semibold"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add your first repository</span>
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {recentProjects.map((project) => (
              <div key={project.id} className="bg-white rounded-2xl border border-[#DDD8CC] p-5 flex flex-col justify-between hover:border-[#9BAF8B] transition-colors group">
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs text-[#77796F] truncate">
                      {project.githubRepoFullName.split("/")[0]}
                    </span>
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-medium ${project.isPrivate ? "bg-[#EAE6D8] text-[#5A6052]" : "bg-[#DCE6D3] text-[#2D3728]"}`}>
                      {project.isPrivate ? <Lock className="w-2.5 h-2.5" /> : <Globe className="w-2.5 h-2.5" />}
                      <span>{project.isPrivate ? "Private" : "Public"}</span>
                    </span>
                  </div>
                  <Link href={`/p/${project.slug}`} className="text-sm font-bold text-[#2D3327] group-hover:underline block truncate">
                    {project.name}
                  </Link>
                  <p className="text-xs text-[#6F7365] line-clamp-2 leading-relaxed min-h-[2rem]">
                    {project.description || "No description on GitHub."}
                  </p>
                </div>
                <div className="pt-4 mt-4 border-t border-[#F2ECE0] space-y-2 text-xs">
                  <p className="text-[11px] text-[#77796F]">
                    {SYNC_LABEL[project.syncStatus] ?? project.syncStatus}
                    {project.lastSyncedAt ? ` · ${relativeTime(project.lastSyncedAt)}` : ""}
                    {" · "}
                    {AI_LABEL[project.aiStatus] ?? project.aiStatus}
                  </p>
                  <Link href={`/p/${project.slug}`} className="inline-flex items-center gap-1 font-semibold text-[#35432C] hover:text-[#283421]">
                    <span>{project.decisionsCount} decision{project.decisionsCount === 1 ? "" : "s"}</span>
                    <ArrowRight className="w-3 h-3" />
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-4 pt-4 border-t border-[#EAE4D5]">
        <div>
          <h2 className="text-base sm:text-lg font-bold text-[#2D3327]">Recent decisions</h2>
          <p className="text-xs text-[#77796F]">The latest decision records across your repositories.</p>
        </div>

        {summaryError ? (
          <p role="alert" className="text-xs text-red-700">{summaryError}</p>
        ) : !summary ? (
          <p role="status" className="text-xs text-[#77796F]">Loading…</p>
        ) : summary.recentDecisions.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[#DDD8CC] bg-white p-8 text-center text-xs text-[#77796F]">
            No decisions yet. Once a repository has been analysed, its most recent decisions are listed here.
          </div>
        ) : (
          <div className="rounded-2xl bg-white border border-[#DDD8CC] divide-y divide-[#EAE4D5] overflow-hidden">
            {summary.recentDecisions.map((dec) => (
              <div key={`${dec.slug}-${dec.id}`} className="p-5 hover:bg-[#FAF8F3] transition-colors space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-bold text-[#5A684E]">{dec.id}</span>
                    <span className="text-xs font-bold text-[#2D3327]">{dec.title}</span>
                    <span className="text-[10px] font-mono bg-[#DCE6D3] text-[#2D3728] px-1.5 py-0.5 rounded font-bold">
                      {dec.status}
                    </span>
                  </div>
                  <span className="text-[11px] font-mono text-[#77796F]">{formatDate(dec.date)}</span>
                </div>
                <p className="text-xs text-[#6F7365] leading-relaxed">{dec.summary}</p>
                <div className="flex items-center justify-between pt-1 text-[11px] font-mono text-[#77796F]">
                  <span>Repository: {dec.projectName}</span>
                  <Link href={`/p/${dec.slug}`} className="text-[#35432C] font-semibold hover:underline inline-flex items-center gap-1">
                    <span>Open project</span>
                    <ArrowRight className="w-3 h-3" />
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
