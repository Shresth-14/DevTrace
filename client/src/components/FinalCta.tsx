"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import { ArrowRight, Check, GitBranch } from "lucide-react";
import { api, getStoredSession } from "@/lib/api";

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

export function FinalCta() {
  const isAuthenticated = useSyncExternalStore(
    subscribeSession,
    getSessionSnapshot,
    getServerSnapshot
  );

  return (
    <section className="py-20 md:py-28 bg-[#F7F5ED] border-t border-[#EAE4D5]">
      <div className="max-w-4xl mx-auto px-6 sm:px-8 text-center space-y-6">
        <span className="text-[11px] font-mono tracking-wider uppercase text-[#5A684E] font-bold">
          Start Preserving Context
        </span>

        <h2 className="text-3xl sm:text-4xl md:text-5xl font-extrabold tracking-tight text-[#2D3327] leading-[1.15] max-w-2xl mx-auto">
          Your architecture deserves more than scattered conversations.
        </h2>

        <p className="text-sm sm:text-base text-[#6F7365] max-w-xl mx-auto leading-relaxed">
          Keep the technical reasoning behind your code instantly accessible to every present and future maintainer.
        </p>

        <div className="pt-4 flex flex-col sm:flex-row items-center justify-center gap-3">
          {isAuthenticated ? (
            <Link
              href="/dashboard"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-[#35432C] hover:bg-[#283421] active:bg-[#1E2718] text-[#FAF8F3] font-semibold text-xs transition-colors shadow-xs group"
            >
              <GitBranch className="w-4 h-4 text-[#C5D6B4]" />
              <span>Go to Dashboard</span>
              <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
            </Link>
          ) : (
            <a
              href={api.getAuthUrl("/dashboard")}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-[#35432C] hover:bg-[#283421] active:bg-[#1E2718] text-[#FAF8F3] font-semibold text-xs transition-colors shadow-xs group"
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
          )}
        </div>

        <div className="pt-6 flex flex-wrap items-center justify-center gap-6 text-xs text-[#77796F] font-mono">
          <span className="flex items-center gap-1.5">
            <Check className="w-3.5 h-3.5 text-[#4E673D]" />
            Connect GitHub in 2 minutes
          </span>
          <span className="flex items-center gap-1.5">
            <Check className="w-3.5 h-3.5 text-[#4E673D]" />
            Open-weight AI, runs locally
          </span>
          <span className="flex items-center gap-1.5">
            <Check className="w-3.5 h-3.5 text-[#4E673D]" />
            No code modification needed
          </span>
        </div>
      </div>
    </section>
  );
}
