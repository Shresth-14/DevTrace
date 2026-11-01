"use client";

import React from "react";
import { useDashboard } from "@/context/DashboardContext";
import { CheckCircle2, AlertCircle, ExternalLink } from "lucide-react";

export default function DashboardIntegrationsPage() {
  const { user } = useDashboard();

  return (
    <div className="space-y-8 animate-in fade-in duration-150 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-[#41463B]">
          Integrations
        </h1>
        <p className="text-sm text-[#77796F] mt-1">
          The sources Dev Trace reads decisions from.
        </p>
      </div>

      <div className="space-y-4">
        <div className="p-6 rounded-2xl bg-white border border-[#DDD8CC] shadow-xs">
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
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Signed in
                </span>
              </div>
              <p className="text-xs text-[#77796F] mt-1">
                Account: <strong className="text-[#41463B]">@{user.username}</strong>
              </p>
              <p className="text-xs text-[#77796F] mt-1 max-w-lg leading-relaxed">
                Add any public repository by URL. Dev Trace reads its public
                issues, pull requests, reviews, inline comments, discussions and
                commits using your GitHub sign-in, and never needs access to your
                private code.
              </p>
              <a
                href={`https://github.com/${user.username}`}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-[#38462F] hover:underline"
              >
                View your GitHub profile <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>
        </div>

        <div className="p-6 rounded-2xl bg-white border border-[#DDD8CC] shadow-xs">
          <div className="flex items-center gap-2.5">
            <h3 className="text-base font-bold text-[#41463B]">Discord</h3>
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-[#EAE6D8] text-[#77796F] text-xs font-semibold">
              <AlertCircle className="w-3.5 h-3.5" />
              Not available yet
            </span>
          </div>
          <p className="text-xs text-[#77796F] mt-2 max-w-lg leading-relaxed">
            A standalone Discord collector exists in the repository, but it is
            not connected to this app yet, so Discord discussions are not
            imported and cannot be connected from here.
          </p>
        </div>
      </div>
    </div>
  );
}
