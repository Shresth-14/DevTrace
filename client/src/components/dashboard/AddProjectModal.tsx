"use client";

import React, { useState, useMemo } from "react";
import { useDashboard } from "@/context/DashboardContext";
import { AvailableRepository } from "@/data/mock-projects";
import {
  X,
  Search,
  Lock,
  Globe,
  CheckCircle2,
  GitBranch,
  ShieldCheck,
  ArrowRight,
  ArrowLeft,
  Loader2,
  Sparkles,
} from "lucide-react";

export function AddProjectModal() {
  const {
    isAddProjectOpen,
    closeAddProject,
    availableRepositories,
    user,
    addProjectFromRepo,
  } = useDashboard();

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [selectedRepo, setSelectedRepo] = useState<AvailableRepository | null>(
    null
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [filterPrivacy, setFilterPrivacy] = useState<
    "all" | "public" | "private"
  >("all");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Filtered repositories for step 2
  const filteredRepos = useMemo(() => {
    return availableRepositories.filter((repo) => {
      const matchesSearch =
        repo.fullName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        repo.description.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesPrivacy =
        filterPrivacy === "all"
          ? true
          : filterPrivacy === "private"
            ? repo.isPrivate
            : !repo.isPrivate;
      return matchesSearch && matchesPrivacy;
    });
  }, [availableRepositories, searchQuery, filterPrivacy]);

  if (!isAddProjectOpen) return null;

  const handleResetAndClose = () => {
    setStep(1);
    setSelectedRepo(null);
    setSearchQuery("");
    closeAddProject();
  };

  const handleConfirmConnect = () => {
    if (!selectedRepo) return;
    setIsSubmitting(true);
    setTimeout(() => {
      addProjectFromRepo(selectedRepo);
      setIsSubmitting(false);
      handleResetAndClose();
    }, 450);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 overflow-y-auto">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-[#2C3325]/40 backdrop-blur-xs transition-opacity"
        onClick={handleResetAndClose}
      />

      {/* Modal Dialog */}
      <div className="relative w-full max-w-2xl bg-[#FFFFFF] rounded-2xl border border-[#D8D2C2] shadow-2xl overflow-hidden transition-all flex flex-col max-h-[90vh]">
        {/* Top Header */}
        <div className="px-6 py-4.5 bg-[#FAF8F3] border-b border-[#EAE4D5] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-[#38462F] text-[#FAF8F3] flex items-center justify-center text-xs font-semibold">
              <GitBranch className="w-4 h-4 text-[#C5D6B4]" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-[#41463B] tracking-tight">
                Connect New Repository
              </h3>
              <p className="text-xs text-[#77796F]">
                Step {step} of 3 —{" "}
                {step === 1
                  ? "Select GitHub Account"
                  : step === 2
                    ? "Choose Repository"
                    : "Confirm & Connect"}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleResetAndClose}
            className="p-1.5 rounded-lg text-[#77796F] hover:text-[#41463B] hover:bg-[#EAE4D5] transition-colors"
            aria-label="Close modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Step Progress Indicator */}
        <div className="grid grid-cols-3 border-b border-[#EAE4D5] bg-[#F7F5ED]/50 text-xs">
          <div
            className={`px-4 py-2 font-medium flex items-center justify-center gap-2 border-r border-[#EAE4D5] transition-colors ${
              step >= 1
                ? "text-[#38462F] bg-[#DCE6D3]/40 font-semibold"
                : "text-[#77796F]"
            }`}
          >
            <span className="w-4 h-4 rounded-full bg-[#38462F] text-white text-[10px] flex items-center justify-center font-bold">
              1
            </span>
            <span className="hidden sm:inline">Account</span>
          </div>
          <div
            className={`px-4 py-2 font-medium flex items-center justify-center gap-2 border-r border-[#EAE4D5] transition-colors ${
              step >= 2
                ? "text-[#38462F] bg-[#DCE6D3]/40 font-semibold"
                : "text-[#77796F]"
            }`}
          >
            <span
              className={`w-4 h-4 rounded-full text-[10px] flex items-center justify-center font-bold ${
                step >= 2 ? "bg-[#38462F] text-white" : "bg-[#DDD7C7] text-[#77796F]"
              }`}
            >
              2
            </span>
            <span className="hidden sm:inline">Repository</span>
          </div>
          <div
            className={`px-4 py-2 font-medium flex items-center justify-center gap-2 transition-colors ${
              step === 3
                ? "text-[#38462F] bg-[#DCE6D3]/40 font-semibold"
                : "text-[#77796F]"
            }`}
          >
            <span
              className={`w-4 h-4 rounded-full text-[10px] flex items-center justify-center font-bold ${
                step === 3 ? "bg-[#38462F] text-white" : "bg-[#DDD7C7] text-[#77796F]"
              }`}
            >
              3
            </span>
            <span className="hidden sm:inline">Connect</span>
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto flex-1 bg-[#FFFFFF]">
          {/* STEP 1: Select GitHub Account */}
          {step === 1 && (
            <div className="space-y-4">
              <div>
                <h4 className="text-sm font-semibold text-[#41463B]">
                  Select authorized GitHub installation
                </h4>
                <p className="text-xs text-[#77796F] mt-0.5">
                  Choose the GitHub organization or personal profile where your
                  target repository lives.
                </p>
              </div>

              {/* Active Account Card */}
              <div
                onClick={() => setStep(2)}
                className="group p-4 rounded-xl border-2 border-[#9BAF8B] bg-[#F7F5ED] hover:bg-[#FAF8F3] transition-all cursor-pointer flex items-center justify-between shadow-xs"
              >
                <div className="flex items-center gap-3.5">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={user.avatarUrl}
                    alt={user.username}
                    className="w-11 h-11 rounded-full ring-2 ring-[#9BAF8B]/50"
                  />
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-[#41463B]">
                        {user.name}
                      </span>
                      <span className="px-2 py-0.5 rounded-full bg-[#DCE6D3] text-[#38462F] text-[10px] font-semibold flex items-center gap-1">
                        <ShieldCheck className="w-3 h-3 text-[#38462F]" />
                        Authorized App
                      </span>
                    </div>
                    <p className="text-xs text-[#77796F]">
                      github.com/{user.username} (Personal)
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 text-xs font-semibold text-[#38462F] group-hover:translate-x-0.5 transition-transform">
                  <span>Continue</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </div>
              </div>

              {/* Additional Mock Organization option */}
              <div
                onClick={() => setStep(2)}
                className="group p-4 rounded-xl border border-[#DDD8CC] bg-[#FFFFFF] hover:border-[#9BAF8B] hover:bg-[#FAF8F3] transition-all cursor-pointer flex items-center justify-between"
              >
                <div className="flex items-center gap-3.5">
                  <div className="w-11 h-11 rounded-xl bg-[#41463B] text-[#FAF8F3] flex items-center justify-center font-bold text-sm">
                    DT
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-[#41463B]">
                        Dev Trace Labs
                      </span>
                      <span className="px-2 py-0.5 rounded-full bg-[#EAE6D8] text-[#77796F] text-[10px] font-medium">
                        Organization
                      </span>
                    </div>
                    <p className="text-xs text-[#77796F]">
                      github.com/dev-trace-org
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 text-xs font-semibold text-[#77796F] group-hover:text-[#38462F] transition-colors">
                  <span>Select</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </div>
              </div>

              <div className="pt-2">
                <p className="text-[11px] text-[#77796F] flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#9BAF8B]" />
                  Need to connect another GitHub account? You can install Dev
                  Trace on any additional organization anytime.
                </p>
              </div>
            </div>
          )}

          {/* STEP 2: Choose Repository */}
          {step === 2 && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h4 className="text-sm font-semibold text-[#41463B]">
                    Select a repository to index
                  </h4>
                  <p className="text-xs text-[#77796F]">
                    Showing repositories accessible via Dev Trace GitHub App.
                  </p>
                </div>

                {/* Filter toggle */}
                <div className="flex items-center rounded-lg bg-[#EAE6D8] p-0.5 text-xs font-medium self-start sm:self-auto">
                  {(["all", "public", "private"] as const).map((filter) => (
                    <button
                      key={filter}
                      type="button"
                      onClick={() => setFilterPrivacy(filter)}
                      className={`px-2.5 py-1 rounded-md capitalize transition-colors ${
                        filterPrivacy === filter
                          ? "bg-white text-[#38462F] font-semibold shadow-xs"
                          : "text-[#77796F] hover:text-[#41463B]"
                      }`}
                    >
                      {filter}
                    </button>
                  ))}
                </div>
              </div>

              {/* Search Bar */}
              <div className="relative">
                <Search className="w-4 h-4 text-[#77796F] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search repositories by name or description..."
                  className="w-full pl-9 pr-4 py-2 rounded-xl bg-[#F7F5ED] border border-[#DDD8CC] text-xs text-[#41463B] placeholder-[#77796F] focus:outline-none focus:ring-1 focus:ring-[#9BAF8B] focus:bg-white transition-all"
                />
              </div>

              {/* Repositories List */}
              <div className="space-y-2 max-h-[320px] overflow-y-auto pr-1">
                {filteredRepos.length === 0 ? (
                  <div className="p-8 text-center bg-[#F7F5ED] rounded-xl border border-dashed border-[#DDD8CC]">
                    <p className="text-xs font-medium text-[#41463B]">
                      No repositories found
                    </p>
                    <p className="text-[11px] text-[#77796F] mt-1">
                      Try adjusting your search terms or visibility filter.
                    </p>
                  </div>
                ) : (
                  filteredRepos.map((repo) => {
                    const isSelected = selectedRepo?.id === repo.id;
                    return (
                      <div
                        key={repo.id}
                        onClick={() => setSelectedRepo(repo)}
                        className={`p-3.5 rounded-xl border transition-all cursor-pointer flex items-start justify-between gap-3 ${
                          isSelected
                            ? "border-[#38462F] bg-[#DCE6D3]/35 shadow-xs"
                            : "border-[#E5DFCF] bg-[#FFFFFF] hover:border-[#9BAF8B] hover:bg-[#FAF8F3]"
                        }`}
                      >
                        <div className="space-y-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-bold text-[#41463B] truncate">
                              {repo.fullName}
                            </span>

                            <span
                              className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium ${
                                repo.isPrivate
                                  ? "bg-[#EAE6D8] text-[#5A6052]"
                                  : "bg-[#DCE6D3] text-[#38462F]"
                              }`}
                            >
                              {repo.isPrivate ? (
                                <Lock className="w-2.5 h-2.5" />
                              ) : (
                                <Globe className="w-2.5 h-2.5" />
                              )}
                              <span>
                                {repo.isPrivate ? "Private" : "Public"}
                              </span>
                            </span>

                            <span className="flex items-center gap-1 text-[11px] text-[#77796F]">
                              <span
                                className="w-2 h-2 rounded-full"
                                style={{ backgroundColor: repo.languageColor }}
                              />
                              {repo.primaryLanguage}
                            </span>
                          </div>

                          <p className="text-[11px] text-[#77796F] line-clamp-2">
                            {repo.description}
                          </p>

                          <div className="flex items-center gap-3 text-[10px] text-[#77796F] pt-0.5">
                            <span>branch: {repo.defaultBranch}</span>
                            <span>•</span>
                            <span>★ {repo.stars}</span>
                            <span>•</span>
                            <span>updated {repo.updatedAt}</span>
                          </div>
                        </div>

                        <div className="pt-1">
                          <div
                            className={`w-4.5 h-4.5 rounded-full border flex items-center justify-center transition-colors ${
                              isSelected
                                ? "border-[#38462F] bg-[#38462F] text-white"
                                : "border-[#DDD8CC] bg-white"
                            }`}
                          >
                            {isSelected && <CheckCircle2 className="w-3.5 h-3.5" />}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {/* STEP 3: Confirm & Connect */}
          {step === 3 && selectedRepo && (
            <div className="space-y-5">
              <div>
                <h4 className="text-sm font-semibold text-[#41463B]">
                  Confirm repository connection
                </h4>
                <p className="text-xs text-[#77796F]">
                  Dev Trace will start indexing historical pull requests, issues,
                  and architectural decisions.
                </p>
              </div>

              {/* Repository Summary Card */}
              <div className="p-4 rounded-xl border border-[#DDD8CC] bg-[#F7F5ED] space-y-3">
                <div className="flex items-start justify-between">
                  <div>
                    <span className="text-xs font-mono text-[#77796F]">
                      Target Repository
                    </span>
                    <h5 className="text-sm font-bold text-[#41463B] mt-0.5">
                      {selectedRepo.fullName}
                    </h5>
                  </div>
                  <span
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold ${
                      selectedRepo.isPrivate
                        ? "bg-[#EAE6D8] text-[#5A6052]"
                        : "bg-[#DCE6D3] text-[#38462F]"
                    }`}
                  >
                    {selectedRepo.isPrivate ? (
                      <Lock className="w-3 h-3" />
                    ) : (
                      <Globe className="w-3 h-3" />
                    )}
                    {selectedRepo.isPrivate ? "Private" : "Public"}
                  </span>
                </div>

                <p className="text-xs text-[#77796F]">
                  {selectedRepo.description}
                </p>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-2 border-t border-[#E5DFCF] text-xs">
                  <div>
                    <span className="text-[10px] text-[#77796F] uppercase tracking-wider">
                      Language
                    </span>
                    <p className="font-semibold text-[#41463B]">
                      {selectedRepo.primaryLanguage}
                    </p>
                  </div>
                  <div>
                    <span className="text-[10px] text-[#77796F] uppercase tracking-wider">
                      Default Branch
                    </span>
                    <p className="font-semibold text-[#41463B]">
                      {selectedRepo.defaultBranch}
                    </p>
                  </div>
                  <div>
                    <span className="text-[10px] text-[#77796F] uppercase tracking-wider">
                      Project Slug
                    </span>
                    <p className="font-mono text-[#38462F] font-semibold text-[11px]">
                      /p/{selectedRepo.name}
                    </p>
                  </div>
                </div>
              </div>

              {/* What happens next */}
              <div className="p-3.5 rounded-xl bg-[#DCE6D3]/40 border border-[#9BAF8B]/40 flex items-start gap-3">
                <Sparkles className="w-4 h-4 text-[#38462F] shrink-0 mt-0.5" />
                <div className="text-xs space-y-1">
                  <p className="font-semibold text-[#38462F]">
                    Automatic Decision Synthesis
                  </p>
                  <p className="text-[#5A6052]">
                    Dev Trace creates a dedicated project slug and connects
                    GitHub pull requests, reviews, and linked Discord
                    conversations into an immutable decision log.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer Controls */}
        <div className="px-6 py-4 bg-[#FAF8F3] border-t border-[#EAE4D5] flex items-center justify-between">
          <div>
            {step > 1 && (
              <button
                type="button"
                onClick={() => setStep((prev) => (prev - 1) as 1 | 2)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-[#77796F] hover:text-[#41463B] hover:bg-[#EAE4D5] transition-colors"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Back</span>
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleResetAndClose}
              className="px-3.5 py-2 rounded-lg text-xs font-semibold text-[#77796F] hover:text-[#41463B] hover:bg-[#EAE4D5] transition-colors"
            >
              Cancel
            </button>

            {step === 1 && (
              <button
                type="button"
                onClick={() => setStep(2)}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#38462F] hover:bg-[#2B3724] text-[#FAF8F3] text-xs font-semibold transition-all shadow-xs"
              >
                <span>Continue</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}

            {step === 2 && (
              <button
                type="button"
                disabled={!selectedRepo}
                onClick={() => setStep(3)}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#38462F] hover:bg-[#2B3724] disabled:opacity-40 disabled:cursor-not-allowed text-[#FAF8F3] text-xs font-semibold transition-all shadow-xs"
              >
                <span>Review Connection</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}

            {step === 3 && (
              <button
                type="button"
                disabled={isSubmitting}
                onClick={handleConfirmConnect}
                className="inline-flex items-center gap-1.5 px-5 py-2 rounded-xl bg-[#38462F] hover:bg-[#2B3724] text-[#FAF8F3] text-xs font-semibold transition-all shadow-xs"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Connecting repository...</span>
                  </>
                ) : (
                  <>
                    <span>Connect Repository</span>
                    <CheckCircle2 className="w-3.5 h-3.5 text-[#C5D6B4]" />
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

