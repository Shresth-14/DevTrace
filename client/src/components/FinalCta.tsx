"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import { ArrowRight, GitBranch } from "lucide-react";
import { api, getStoredSession } from "@/lib/api";
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

export function FinalCta() {
  const isAuthenticated = useSyncExternalStore(
    subscribeSession,
    getSessionSnapshot,
    getServerSnapshot
  );

  const button =
    "group inline-flex items-center justify-center gap-2.5 rounded-full bg-lp-glow px-8 py-4 text-sm font-semibold text-lp-bg transition-all hover:brightness-110 hover:shadow-[0_0_50px_-4px_rgb(211_240_138/0.6)]";

  return (
    <section className="lp-reveal px-6 py-28 sm:px-8 md:py-44">
      <div className="mx-auto max-w-4xl text-center">
        <h2 className="text-[clamp(2.5rem,8vw,6.5rem)] font-semibold leading-[0.98] tracking-[-0.04em]">
          Stop losing
          <br />
          <span className="lp-display lp-shine pr-2">the why.</span>
        </h2>

        <div className="mt-12">
          {isAuthenticated ? (
            <Link href="/dashboard" className={button}>
              <GitBranch className="h-4 w-4" />
              <span>Go to Dashboard</span>
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </Link>
          ) : (
            <a href={api.getAuthUrl("/dashboard")} className={button}>
              <GithubMark />
              <span>Continue with GitHub</span>
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </a>
          )}
        </div>
      </div>
    </section>
  );
}
