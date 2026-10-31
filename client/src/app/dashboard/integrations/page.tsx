"use client";

import React, { useState } from "react";
import { useDashboard } from "@/context/DashboardContext";
import {
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  ShieldCheck,
  RefreshCw,
  Sparkles,
} from "lucide-react";

export default function DashboardIntegrationsPage() {
  const { integrations, toggleDiscordIntegration, addToast, user } =
    useDashboard();

  const [isManagingGithub, setIsManagingGithub] = useState(false);

  const githubIntegration = integrations.find((i) => i.name === "GitHub");
  const discordIntegration = integrations.find((i) => i.name === "Discord");

  const handleManageGithub = () => {
    setIsManagingGithub(true);
    setTimeout(() => {
      setIsManagingGithub(false);
      addToast(
        "GitHub App permissions verified. Repository webhooks are active.",
        "success"
      );
    }, 600);
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-150 max-w-4xl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-[#41463B]">
          Connected Integrations
        </h1>
        <p className="text-sm text-[#77796F] mt-1">
          Dev Trace continuously monitors discussions, pull requests, and chat
          channels across your engineering stack.
        </p>
      </div>

      {/* Integration Cards */}
      <div className="space-y-4">
        {/* 1. GitHub Integration */}
        <div className="p-6 rounded-2xl bg-white border border-[#DDD8CC] shadow-xs space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-xl bg-[#2D3627] text-white flex items-center justify-center shrink-0">
                <svg
                  className="w-6 h-6 fill-current"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path
                    fillRule="evenodd"
                    clipRule="evenodd"
                    d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
                  />
                </svg>
              </div>

              <div>
                <div className="flex items-center gap-2.5">
                  <h3 className="text-base font-bold text-[#41463B]">GitHub</h3>
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-[#DCE6D3] text-[#38462F] text-xs font-semibold">
                    <CheckCircle2 className="w-3.5 h-3.5 text-[#38462F]" />
                    Connected
                  </span>
                </div>
                <p className="text-xs text-[#77796F] mt-1">
                  Connected account:{" "}
                  <strong className="text-[#41463B]">
                    @{githubIntegration?.accountName || user.username}
                  </strong>
                </p>
                <p className="text-xs text-[#77796F] mt-1 max-w-lg leading-relaxed">
                  {githubIntegration?.description}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 self-start sm:self-center">
              <button
                type="button"
                onClick={handleManageGithub}
                disabled={isManagingGithub}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-[#DDD8CC] bg-white hover:bg-[#FAF8F3] text-xs font-semibold text-[#41463B] transition-colors shadow-xs"
              >
                <RefreshCw
                  className={`w-3.5 h-3.5 text-[#77796F] ${
                    isManagingGithub ? "animate-spin" : ""
                  }`}
                />
                <span>Manage connection</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-4 border-t border-[#F2ECE0] text-xs">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-[#38462F]" />
              <span className="text-[#5A6052]">Webhook events verified</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[#9BAF8B]" />
              <span className="text-[#5A6052]">
                Synced {githubIntegration?.lastSync || "recently"}
              </span>
            </div>
            <div className="flex items-center gap-2 sm:justify-end">
              <a
                href="https://github.com/settings/installations"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#38462F] hover:underline flex items-center gap-1 font-medium"
              >
                <span>GitHub App Settings</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>
        </div>

        {/* 2. Discord Integration */}
        <div className="p-6 rounded-2xl bg-white border border-[#DDD8CC] shadow-xs space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start gap-4">
              <div
                className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 transition-colors ${
                  discordIntegration?.connected
                    ? "bg-[#5865F2] text-white"
                    : "bg-[#EAE6D8] text-[#77796F]"
                }`}
              >
                <svg
                  className="w-6 h-6 fill-current"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994.021-.041.001-.09-.041-.106a13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.929 1.793 8.18 1.793 12.061 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.894.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.028zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
                </svg>
              </div>

              <div>
                <div className="flex items-center gap-2.5">
                  <h3 className="text-base font-bold text-[#41463B]">Discord</h3>
                  {discordIntegration?.connected ? (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-[#DCE6D3] text-[#38462F] text-xs font-semibold">
                      <CheckCircle2 className="w-3.5 h-3.5 text-[#38462F]" />
                      Connected
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-[#EAE6D8] text-[#77796F] text-xs font-semibold">
                      <AlertCircle className="w-3.5 h-3.5 text-[#77796F]" />
                      Not connected
                    </span>
                  )}
                </div>

                {discordIntegration?.connected ? (
                  <p className="text-xs text-[#77796F] mt-1">
                    Connected channel:{" "}
                    <strong className="text-[#41463B]">
                      {discordIntegration.accountName}
                    </strong>
                  </p>
                ) : (
                  <p className="text-xs text-[#77796F] mt-1">
                    Capture engineering discussions from your Discord channels.
                  </p>
                )}

                <p className="text-xs text-[#77796F] mt-1 max-w-lg leading-relaxed">
                  {discordIntegration?.description}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 self-start sm:self-center">
              <button
                type="button"
                onClick={toggleDiscordIntegration}
                className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold transition-all shadow-xs ${
                  discordIntegration?.connected
                    ? "border border-red-200 text-red-700 bg-white hover:bg-red-50"
                    : "bg-[#38462F] hover:bg-[#2B3724] text-[#FAF8F3]"
                }`}
              >
                {discordIntegration?.connected ? (
                  <span>Disconnect Discord</span>
                ) : (
                  <>
                    <span>Connect Discord</span>
                    <Sparkles className="w-3.5 h-3.5 text-[#C5D6B4]" />
                  </>
                )}
              </button>
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-[#F7F5ED] border border-[#DDD8CC] text-xs text-[#77796F] leading-relaxed">
            <strong className="text-[#41463B]">
              Discord Collector Engine:
            </strong>{" "}
            Uses the high-efficiency Discrawl collector to ingest designated
            development channels and threads while respecting message retention
            policies.
          </div>
        </div>
      </div>
    </div>
  );
}
