"use client";

import React from "react";
import { X, GitBranch } from "lucide-react";
import { useDashboard } from "@/context/DashboardContext";
import { RepoUrlForm } from "./RepoUrlForm";

export function AddProjectModal() {
  const { isAddProjectOpen, closeAddProject } = useDashboard();
  if (!isAddProjectOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto p-4 sm:p-6">
      <div
        className="fixed inset-0 bg-[#2C3325]/40 backdrop-blur-xs"
        onClick={closeAddProject}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Add a repository"
        onKeyDown={(e) => {
          if (e.key === "Escape") closeAddProject();
        }}
        className="relative w-full max-w-lg overflow-hidden rounded-2xl border border-[#D8D2C2] bg-white shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-[#EAE4D5] bg-[#FAF8F3] px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#38462F]">
              <GitBranch
                className="h-4 w-4 text-[#C5D6B4]"
                aria-hidden="true"
              />
            </div>
            <h3 className="text-sm font-bold tracking-tight text-[#41463B]">
              Add a repository
            </h3>
          </div>
          <button
            type="button"
            onClick={closeAddProject}
            aria-label="Close"
            className="rounded-lg p-1.5 text-[#77796F] transition-colors hover:bg-[#EAE4D5] hover:text-[#41463B]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="px-6 py-5">
          <RepoUrlForm onDone={closeAddProject} />
        </div>
      </div>
    </div>
  );
}
