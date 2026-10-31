"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";
import { useDashboard } from "@/context/DashboardContext";
import {
  Search,
  Plus,
  Lock,
  Globe,
  ExternalLink,
  ArrowRight,
  Filter,
  Trash2,
  FolderGit2,
  GitBranch,
} from "lucide-react";

export default function DashboardProjectsPage() {
  const { projects, openAddProject, removeProject } = useDashboard();

  const [searchQuery, setSearchQuery] = useState("");
  const [visibilityFilter, setVisibilityFilter] = useState<
    "all" | "public" | "private"
  >("all");
  const [sortBy, setSortBy] = useState<"updated" | "name" | "decisions">(
    "updated"
  );
  const [activeDeleteId, setActiveDeleteId] = useState<string | null>(null);

  // Filter and sort projects
  const filteredProjects = useMemo(() => {
    let result = projects.filter((project) => {
      const query = searchQuery.toLowerCase();
      const matchesSearch =
        project.name.toLowerCase().includes(query) ||
        project.owner.toLowerCase().includes(query) ||
        project.description.toLowerCase().includes(query) ||
        project.primaryLanguage.toLowerCase().includes(query);

      const matchesVisibility =
        visibilityFilter === "all"
          ? true
          : visibilityFilter === "private"
            ? project.isPrivate
            : !project.isPrivate;

      return matchesSearch && matchesVisibility;
    });

    result = [...result].sort((a, b) => {
      if (sortBy === "name") {
        return a.name.localeCompare(b.name);
      }
      if (sortBy === "decisions") {
        return b.decisionsCount - a.decisionsCount;
      }
      return 0;
    });

    return result;
  }, [projects, searchQuery, visibilityFilter, sortBy]);

  return (
    <div className="space-y-8 animate-in fade-in duration-150">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-[#EAE4D5]">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#2D3327]">
            Your projects
          </h1>
          <p className="text-xs sm:text-sm text-[#77796F] mt-1">
            Manage your connected repositories and explore the technical knowledge behind them.
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

      {/* Sleek Filter & Search Bar */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        {/* Search Input */}
        <div className="relative flex-1 max-w-md">
          <Search className="w-3.5 h-3.5 text-[#77796F] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search repositories by name, owner, or language..."
            className="w-full pl-9 pr-3.5 py-2 rounded-xl bg-white border border-[#DDD8CC] focus:border-[#9BAF8B] text-xs text-[#2D3327] placeholder-[#77796F] focus:outline-none transition-all shadow-2xs"
          />
        </div>

        <div className="flex items-center gap-2.5 flex-wrap sm:flex-nowrap">
          {/* Visibility Filter Buttons */}
          <div className="flex items-center rounded-xl bg-white p-0.5 text-xs font-medium border border-[#DDD8CC] shadow-2xs">
            {(["all", "public", "private"] as const).map((filter) => (
              <button
                key={filter}
                type="button"
                onClick={() => setVisibilityFilter(filter)}
                className={`px-3 py-1 rounded-lg capitalize transition-colors ${
                  visibilityFilter === filter
                    ? "bg-[#DCE6D3] text-[#2D3728] font-bold"
                    : "text-[#77796F] hover:text-[#2D3327]"
                }`}
              >
                {filter}
              </button>
            ))}
          </div>

          {/* Sort Selector */}
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white border border-[#DDD8CC] text-xs shadow-2xs">
            <Filter className="w-3 h-3 text-[#77796F]" />
            <select
              value={sortBy}
              onChange={(e) =>
                setSortBy(e.target.value as "updated" | "name" | "decisions")
              }
              className="bg-transparent text-[#2D3327] font-medium focus:outline-none cursor-pointer pr-1"
            >
              <option value="updated">Recently updated</option>
              <option value="name">Name (A-Z)</option>
              <option value="decisions">Most decisions</option>
            </select>
          </div>
        </div>
      </div>

      {/* Filter Status Count */}
      <div className="flex items-center justify-between text-xs text-[#77796F] px-1">
        <span>
          Showing{" "}
          <strong className="text-[#2D3327] font-semibold">
            {filteredProjects.length}
          </strong>{" "}
          of {projects.length} connected repository
          {projects.length === 1 ? "" : "ies"}
        </span>

        {(searchQuery || visibilityFilter !== "all") && (
          <button
            type="button"
            onClick={() => {
              setSearchQuery("");
              setVisibilityFilter("all");
            }}
            className="text-[#35432C] hover:underline font-semibold"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Premium Repository Card Grid */}
      {filteredProjects.length === 0 ? (
        <div className="p-12 rounded-2xl bg-white border border-[#DDD8CC] text-center space-y-3">
          <div className="w-10 h-10 rounded-xl bg-[#F7F5ED] text-[#77796F] flex items-center justify-center mx-auto border border-[#EAE4D5]">
            <FolderGit2 className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-[#2D3327]">
              No repositories found
            </h3>
            <p className="text-xs text-[#77796F] mt-1 max-w-sm mx-auto">
              No repositories matched your current query or visibility filters.
            </p>
          </div>
          <div className="pt-2">
            <button
              type="button"
              onClick={() => {
                setSearchQuery("");
                setVisibilityFilter("all");
              }}
              className="px-3.5 py-1.5 rounded-xl border border-[#DDD8CC] text-xs font-semibold text-[#2D3327] hover:bg-[#F7F5ED] transition-colors"
            >
              Reset filters
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredProjects.map((project) => (
            <div
              key={project.id}
              className="bg-white rounded-2xl border border-[#DDD8CC] p-5 sm:p-6 flex flex-col justify-between hover:border-[#9BAF8B] hover:shadow-[0_6px_24px_-4px_rgba(45,51,39,0.09)] transition-all duration-200 group"
            >
              {/* Card Top: Owner & Visibility Badge */}
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <svg
                      className="w-4 h-4 text-[#2D3327] shrink-0"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                    >
                      <path
                        fillRule="evenodd"
                        clipRule="evenodd"
                        d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
                      />
                    </svg>
                    <span className="font-mono text-xs text-[#77796F] truncate">
                      {project.owner}
                    </span>
                  </div>

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

                <div>
                  <Link
                    href={`/p/${project.slug}`}
                    className="text-base font-bold text-[#2D3327] group-hover:text-[#1F271B] group-hover:underline transition-colors truncate block"
                  >
                    {project.name}
                  </Link>
                  <p className="text-xs text-[#6F7365] leading-relaxed line-clamp-2 mt-1.5 min-h-[2rem]">
                    {project.description}
                  </p>
                </div>
              </div>

              {/* Card Middle: Metadata strip */}
              <div className="pt-4 mt-4 border-t border-[#F2ECE0] space-y-2.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="flex items-center gap-1.5 text-[11px] font-medium text-[#2D3327]">
                    <span
                      className="w-2 h-2 rounded-full"
                      style={{ backgroundColor: project.languageColor }}
                    />
                    {project.primaryLanguage}
                  </span>

                  <span className="font-mono text-[11px] bg-[#DCE6D3]/60 text-[#2D3728] px-2 py-0.5 rounded font-semibold">
                    {project.decisionsCount} decisions
                  </span>
                </div>

                <div className="flex items-center justify-between text-[11px] font-mono text-[#77796F]">
                  <span className="flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#4E673D]" />
                    Synced {project.lastSyncedAt}
                  </span>

                  <span className="flex items-center gap-1 text-[10px] text-[#77796F]">
                    <GitBranch className="w-3 h-3" />
                    {project.defaultBranch}
                  </span>
                </div>
              </div>

              {/* Card Footer: Action Buttons */}
              <div className="pt-4 mt-3 border-t border-[#F2ECE0] flex items-center justify-between gap-2">
                <a
                  href={project.githubUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-2 rounded-lg text-[#77796F] hover:text-[#2D3327] hover:bg-[#F7F5ED] transition-colors"
                  title="View on GitHub"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>

                <div className="flex items-center gap-2">
                  {activeDeleteId === project.id ? (
                    <div className="flex items-center gap-1 bg-red-50 p-1 rounded-lg border border-red-200">
                      <span className="text-[10px] text-red-700 font-semibold px-1">
                        Disconnect?
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          removeProject(project.id);
                          setActiveDeleteId(null);
                        }}
                        className="px-2 py-0.5 rounded bg-red-600 text-white text-[10px] font-bold hover:bg-red-700"
                      >
                        Yes
                      </button>
                      <button
                        type="button"
                        onClick={() => setActiveDeleteId(null)}
                        className="px-1.5 py-0.5 rounded text-[10px] text-zinc-600 hover:bg-red-100"
                      >
                        No
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setActiveDeleteId(project.id)}
                      className="p-1.5 rounded-lg text-[#77796F] hover:text-red-700 hover:bg-red-50 transition-colors"
                      title="Disconnect project"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}

                  <Link
                    href={`/p/${project.slug}`}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#35432C] hover:bg-[#283421] text-[#FAF8F3] text-xs font-semibold transition-colors shadow-xs"
                  >
                    <span>Open project</span>
                    <ArrowRight className="w-3 h-3 text-[#C5D6B4]" />
                  </Link>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
