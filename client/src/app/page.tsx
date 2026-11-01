"use client";

import { LogoMark } from "@/components/LogoMark";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Navbar } from "@/components/Navbar";
import { Hero } from "@/components/Hero";
import { ProblemSection } from "@/components/ProblemSection";
import { HowItWorks } from "@/components/HowItWorks";
import { Features } from "@/components/Features";
import { FinalCta } from "@/components/FinalCta";
import { Footer } from "@/components/Footer";
import { X, ArrowRight, ShieldCheck, CheckCircle2 } from "lucide-react";
import { api, setStoredSession } from "@/lib/api";

export default function Home() {
  const router = useRouter();
  const [authModal, setAuthModal] = useState<"login" | "signup" | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const urlParams = new URLSearchParams(window.location.search);
      const sessionParam = urlParams.get("session");
      if (sessionParam) {
        setStoredSession(sessionParam);
        router.push("/dashboard");
      }
    }
  }, [router]);

  useEffect(() => {
    const handleHash = () => {
      const hash = window.location.hash;
      if (hash === "#signup") {
        setAuthModal("signup");
      } else if (hash === "#login") {
        setAuthModal("login");
      }
    };

    window.addEventListener("hashchange", handleHash);
    handleHash();

    return () => window.removeEventListener("hashchange", handleHash);
  }, []);

  const closeModal = () => {
    setAuthModal(null);
    if (
      window.location.hash === "#signup" ||
      window.location.hash === "#login"
    ) {
      history.pushState(
        "",
        document.title,
        window.location.pathname + window.location.search
      );
    }
  };

  return (
    <div className="lp-root flex min-h-screen flex-col font-sans selection:bg-lp-glow selection:text-lp-bg">
      <div className="lp-aurora" aria-hidden="true" />
      <div className="lp-grid" aria-hidden="true" />
      <div className="lp-grain" aria-hidden="true" />
      {/* 1. Navigation */}
      <Navbar />

      {/* Main Content */}
      <main className="relative flex-1">
        {/* The thread: drawn down the page as you scroll */}
        <svg
          className="lp-thread pointer-events-none absolute inset-0 -z-[1] hidden h-full w-full md:block"
          viewBox="0 0 100 1000"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <defs>
            <linearGradient id="lp-thread-grad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#d3f08a" stopOpacity="0" />
              <stop offset="0.1" stopColor="#d3f08a" />
              <stop offset="1" stopColor="#6f9a4c" />
            </linearGradient>
          </defs>
          <path
            className="lp-thread-base"
            d="M7 0 C7 140 3 220 6 340 S11 520 6 660 S2 840 7 1000"
            fill="none"
            strokeWidth="1"
            vectorEffect="non-scaling-stroke"
          />
          <path
            className="lp-thread-live"
            d="M7 0 C7 140 3 220 6 340 S11 520 6 660 S2 840 7 1000"
            pathLength={1}
            fill="none"
            stroke="url(#lp-thread-grad)"
            strokeWidth="2"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
            style={{ filter: "drop-shadow(0 0 6px rgb(211 240 138 / 0.7))" }}
          />
        </svg>

        <Hero />
        <ProblemSection />
        <HowItWorks />
        <Features />
        <FinalCta />
      </main>

      {/* 7. Footer */}
      <Footer />

      {/* Subtle Interactive Auth Modal for Demonstration */}
      {authModal && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-in fade-in duration-150"
        >
          <div className="lp-card w-full max-w-md space-y-6 p-6 text-lp-ink animate-in zoom-in-95 duration-150 sm:p-8">
            <button
              onClick={closeModal}
              type="button"
              className="absolute top-5 right-5 p-1.5 rounded-lg text-lp-mute hover:bg-white/10 hover:text-lp-ink transition-colors"
              aria-label="Close dialog"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="space-y-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#2D3627] ring-1 ring-lp-glow/30">
                <LogoMark />
              </div>
              <h3 className="text-xl font-semibold tracking-tight text-lp-ink">
                {authModal === "signup"
                  ? "Create your Dev Trace account"
                  : "Welcome back to Dev Trace"}
              </h3>
              <p className="text-xs text-lp-mute">
                {authModal === "signup"
                  ? "Connect your GitHub and Discord workspaces to start preserving architectural context."
                  : "Access your repository decision history and technical memory layer."}
              </p>
            </div>

            <div className="space-y-4 pt-2">
              <a
                href={api.getAuthUrl("/dashboard")}
                className="flex w-full items-center justify-center gap-2.5 rounded-full bg-lp-glow px-4 py-3.5 text-xs font-semibold text-lp-bg transition-all hover:brightness-110"
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
                <ArrowRight className="w-3.5 h-3.5" />
              </a>

              <p className="text-center text-[11px] text-lp-mute">
                Redirects to GitHub for one-step app authorization &amp;
                repository discovery.
              </p>
            </div>

            <div className="pt-3 border-t border-lp-line space-y-1.5 text-[11px] text-lp-mute">
              <div className="flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-lp-glow" />
                <span>Zero code modification needed</span>
              </div>
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-lp-glow" />
                <span>Official GitHub App authorization</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
