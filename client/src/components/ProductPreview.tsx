"use client";

import { LogoMark } from "@/components/LogoMark";
import { useState } from "react";
import {
  Search,
  MessageSquare,
  GitPullRequest,
  FileCode2,
  Send,
  Sparkles,
  ExternalLink,
} from "lucide-react";

interface DecisionItem {
  id: string;
  title: string;
  status: "ACCEPTED" | "PROPOSED" | "REJECTED" | "UNRESOLVED";
  date: string;
  summary: string;
  sources: { type: "github" | "discord" | "pr"; name: string; url: string }[];
  codeFiles: string[];
}

export function ProductPreview() {
  const sampleDecisions: DecisionItem[] = [
    {
      id: "DEC-084",
      title: "Why did we choose PostgreSQL?",
      status: "ACCEPTED",
      date: "Oct 14, 2026",
      summary:
        "Selected PostgreSQL on Supabase as the primary relational datastore with Prisma ORM. Strict relational consistency and foreign keys were required for decision evidence graphs.",
      sources: [
        { type: "github", name: "Discussion #142 (Storage)", url: "#" },
        { type: "pr", name: "PR #89 (Initial Schema)", url: "#" },
        { type: "discord", name: "Discord #architecture", url: "#" },
      ],
      codeFiles: [
        "server/prisma/schema.prisma",
        "server/src/database/index.ts",
      ],
    },
    {
      id: "DEC-042",
      title: "Session Pooler over Direct Connection",
      status: "ACCEPTED",
      date: "Oct 18, 2026",
      summary:
        "Standardized on Supabase Session Pooler (port 5432) to prevent connection exhaustion in serverless environments while maintaining Prisma prepared statement support.",
      sources: [
        {
          type: "discord",
          name: "Discord #infra (Incident debrief)",
          url: "#",
        },
        { type: "pr", name: "PR #42 (Pooler config)", url: "#" },
      ],
      codeFiles: ["server/src/config/env.ts", "server/.env.example"],
    },
    {
      id: "DEC-061",
      title: "Isolated Collectors vs Monorepo Tooling",
      status: "ACCEPTED",
      date: "Oct 22, 2026",
      summary:
        "Kept the Go Discord collector (Discrawl) independently buildable at the repository root rather than introducing Turborepo or monorepo build tools.",
      sources: [
        { type: "github", name: "Issue #73 (Architecture review)", url: "#" },
      ],
      codeFiles: ["discord-collector/Makefile", "discord-collector/go.mod"],
    },
    {
      id: "DEC-070",
      title: "GraphQL Gateway for Frontend Dashboard",
      status: "REJECTED",
      date: "Oct 25, 2026",
      summary:
        "Evaluated Apollo GraphQL gateway between Next.js App Router and Express. Rejected due to added latency, dual schema duplication and unnecessary cognitive overhead.",
      sources: [
        { type: "github", name: "Discussion #198 (API Design)", url: "#" },
      ],
      codeFiles: ["client/src/app/page.tsx", "server/src/app.ts"],
    },
  ];

  const [selectedDecision, setSelectedDecision] = useState<DecisionItem>(
    sampleDecisions[0]
  );

  const [queryInput, setQueryInput] = useState(
    "Why did we choose session pooling instead of direct connections?"
  );

  const sampleQueries = [
    "Why did we choose session pooling instead of direct connections?",
    "Why did we reject MongoDB for technical decisions?",
    "Where is the Discord collector code integrated?",
  ];

  const handleSelectQuery = (q: string) => {
    setQueryInput(q);
  };

  return (
    <section className="py-24 md:py-32 bg-[#F7F5ED]">
      <div className="max-w-7xl mx-auto px-6 sm:px-8">
        {/* Section Header */}
        <div className="max-w-3xl">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#E4DDCA] border border-[#CCC2AC] mb-4">
            <span className="text-[11px] font-mono tracking-wider uppercase text-[#2B3523] font-bold">
              Illustrative preview · example data, not a real repository
            </span>
          </div>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-extrabold tracking-tight text-[#22291D] leading-[1.18]">
            Never ask &quot;Why was this built this way?&quot;{" "}
            <span className="text-[#4E673D]">again.</span>
          </h2>
          <p className="mt-5 text-base sm:text-lg text-[#52594B] leading-relaxed font-medium">
            A unified repository cockpit where every developer can query project
            history, trace decisions to code, and review linked evidence in
            seconds.
          </p>
        </div>

        {/* Dashboard Frame */}
        <div className="mt-16 rounded-2xl bg-white border border-[#D5CDBF] shadow-[0_16px_48px_rgba(40,50,33,0.1)] overflow-hidden">
          {/* Topbar */}
          <div className="px-6 py-4 bg-[#F6F1E6] border-b border-[#DDD4C2] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-[#2A3324] text-white flex items-center justify-center font-bold text-xs">
                <LogoMark />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-sm text-[#22291D]">
                    Dev-Trace / core-platform
                  </span>
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-[#E6DEC D] bg-[#EAE3D4] text-[#283222] font-bold border border-[#CCC1AD]">
                    Production
                  </span>
                </div>
                <div className="text-[11px] text-[#52594B] font-medium">
                  Connected: GitHub repository + Discord server
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs font-mono text-[#374130] bg-white px-3 py-1.5 rounded-lg border border-[#D5CDBF] font-bold">
                34 Decisions Tracked
              </span>
              <span className="text-xs font-mono text-[#1E2D17] bg-[#CADDBB] px-3 py-1.5 rounded-lg border border-[#A6C590] font-bold">
                Sync: Up to Date
              </span>
            </div>
          </div>

          {/* Main Dashboard Layout */}
          <div className="grid grid-cols-1 lg:grid-cols-12 min-h-[580px]">
            {/* Left Column: Decision List (5 cols) */}
            <div className="lg:col-span-5 border-r border-[#EAE2D2] p-5 sm:p-6 bg-[#FAF7F0] flex flex-col justify-between">
              <div className="space-y-4">
                {/* Search */}
                <div className="relative">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-3 text-[#52594B]" />
                  <input
                    type="text"
                    readOnly
                    value="Filter by source, status, or file..."
                    className="w-full bg-white pl-9 pr-3 py-2 rounded-lg border border-[#D5CDBF] text-xs font-mono text-[#52594B] font-medium focus:outline-none"
                  />
                </div>

                {/* Status Badges Filter */}
                <div className="flex items-center gap-1.5 text-[11px] font-mono pb-2 border-b border-[#E2D8C6]">
                  <span className="text-[#20271A] font-bold">Decisions</span>
                  <span className="text-[#52594B]">·</span>
                  <span className="text-[#2F441F] font-bold">22 Accepted</span>
                  <span className="text-[#52594B]">·</span>
                  <span className="text-[#8C2C20] font-bold">4 Rejected</span>
                </div>

                {/* Decision Cards List */}
                <div className="space-y-2.5">
                  {sampleDecisions.map((item) => {
                    const isSelected = selectedDecision.id === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => setSelectedDecision(item)}
                        className={`w-full text-left p-3.5 rounded-xl transition-all duration-150 border ${
                          isSelected
                            ? "bg-white border-[#4E673D] shadow-sm ring-1 ring-[#4E673D]"
                            : "bg-white/80 hover:bg-white border-[#DCD3C1]"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-mono text-[11px] font-bold text-[#20271A]">
                            {item.id}
                          </span>
                          <span
                            className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold border ${
                              item.status === "ACCEPTED"
                                ? "bg-[#CADDBB] text-[#1E2D17] border-[#A6C590]"
                                : item.status === "REJECTED"
                                  ? "bg-[#FCE1DD] text-[#8C2C20] border-[#E5A8A0]"
                                  : "bg-[#F5E2B8] text-[#553E12] border-[#DCBF84]"
                            }`}
                          >
                            {item.status}
                          </span>
                        </div>
                        <h4 className="text-xs font-bold text-[#22291D] mt-1.5 leading-snug">
                          {item.title}
                        </h4>
                        <div className="flex items-center justify-between text-[11px] text-[#52594B] mt-2 pt-2 border-t border-[#EAE3D4] font-medium">
                          <span>{item.date}</span>
                          <span className="font-mono text-[10px] font-bold text-[#35432C]">
                            {item.codeFiles.length} file links
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="mt-6 pt-4 border-t border-[#E2D8C6] text-[11px] font-mono text-[#52594B] font-medium">
                Click any decision to inspect reasoning &amp; evidence
              </div>
            </div>

            {/* Right Column: Decision Detail & Repository Q&A (7 cols) */}
            <div className="lg:col-span-7 p-6 sm:p-8 flex flex-col justify-between space-y-8 bg-white">
              {/* Top: Active Decision Inspection */}
              <div className="space-y-5">
                <div className="flex items-center justify-between pb-4 border-b border-[#EAE2D2]">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-bold text-[#20271A]">
                        {selectedDecision.id}
                      </span>
                      <span
                        className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold border ${
                          selectedDecision.status === "ACCEPTED"
                            ? "bg-[#CADDBB] text-[#1E2D17] border-[#A6C590]"
                            : selectedDecision.status === "REJECTED"
                              ? "bg-[#FCE1DD] text-[#8C2C20] border-[#E5A8A0]"
                              : "bg-[#F5E2B8] text-[#553E12] border-[#DCBF84]"
                        }`}
                      >
                        {selectedDecision.status}
                      </span>
                      <span className="text-xs text-[#52594B] font-medium">
                        {selectedDecision.date}
                      </span>
                    </div>
                    <h3 className="text-xl font-extrabold text-[#1F271B] mt-1">
                      {selectedDecision.title}
                    </h3>
                  </div>
                </div>

                {/* Summary */}
                <div className="p-4 rounded-xl bg-[#F8F5EE] border border-[#DDD5C2] space-y-1.5">
                  <div className="text-[11px] font-mono uppercase font-bold text-[#4B5443]">
                    Extracted Summary &amp; Rationale
                  </div>
                  <p className="text-xs text-[#252E20] leading-relaxed font-medium">
                    {selectedDecision.summary}
                  </p>
                </div>

                {/* Linked Evidence Chips */}
                <div>
                  <div className="text-[11px] font-mono uppercase font-bold text-[#4B5443] mb-2">
                    Verified Source Evidence
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {selectedDecision.sources.map((src, i) => (
                      <div
                        key={i}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#FAF8F3] hover:bg-[#F2ECE0] transition-colors border border-[#D5CDBF] text-xs font-bold text-[#252E20]"
                      >
                        {src.type === "github" ? (
                          <MessageSquare className="w-3.5 h-3.5 text-[#20271A]" />
                        ) : src.type === "pr" ? (
                          <GitPullRequest className="w-3.5 h-3.5 text-[#3D5B2A]" />
                        ) : (
                          <MessageSquare className="w-3.5 h-3.5 text-[#354827]" />
                        )}
                        <span>{src.name}</span>
                        <ExternalLink className="w-3 h-3 text-[#52594B]" />
                      </div>
                    ))}
                  </div>
                </div>

                {/* Related Code Files */}
                <div>
                  <div className="text-[11px] font-mono uppercase font-bold text-[#4B5443] mb-2">
                    Related Code Files
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {selectedDecision.codeFiles.map((file, i) => (
                      <div
                        key={i}
                        className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md bg-[#F4EFE3] border border-[#D5CCBA] font-mono text-[11px] text-[#20271A] font-bold"
                      >
                        <FileCode2 className="w-3.5 h-3.5 text-[#4E673D]" />
                        <span>{file}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Bottom: Repository Q&A Interface */}
              <div className="pt-6 border-t border-[#EAE2D2] space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-[#4E673D]" />
                    <span className="text-xs font-mono font-bold uppercase text-[#20271A]">
                      Repository Q&amp;A Interface
                    </span>
                  </div>
                  <span className="text-[10px] font-mono text-[#52594B] font-bold">
                    Cites Real Evidence Only
                  </span>
                </div>

                {/* Query Input Box */}
                <div className="relative">
                  <input
                    type="text"
                    value={queryInput}
                    onChange={(e) => setQueryInput(e.target.value)}
                    className="w-full bg-[#FAF7F0] px-4 py-2.5 rounded-xl border border-[#D0C7B5] text-xs font-sans text-[#20271A] font-semibold focus:outline-none focus:border-[#4E673D] focus:bg-white transition-colors"
                  />
                  <button
                    type="button"
                    className="absolute right-2 top-2 p-1.5 rounded-lg bg-[#35432C] hover:bg-[#283421] text-[#FAF8F3] transition-colors shadow-xs"
                    aria-label="Ask Question"
                  >
                    <Send className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Preset Chips */}
                <div className="flex flex-wrap gap-1.5">
                  {sampleQueries.map((q, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => handleSelectQuery(q)}
                      className={`text-[10px] px-2.5 py-1 rounded-md transition-colors text-left font-medium ${
                        queryInput === q
                          ? "bg-[#CADDBB] text-[#1E2D17] font-bold border border-[#A6C590]"
                          : "bg-[#F3EDE2] hover:bg-[#EAE2D2] text-[#36402E] border border-[#D5CDBF]"
                      }`}
                    >
                      &quot;{q}&quot;
                    </button>
                  ))}
                </div>

                {/* AI Grounded Answer Box */}
                <div className="p-3.5 rounded-xl bg-[#CADDBB]/50 border border-[#9DC385] space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-[#1E2D17] text-[11px]">
                      Grounded Answer (DEC-042 citation)
                    </span>
                    <span className="text-[10px] font-mono text-[#2C461C] font-bold">
                      100% verified sources
                    </span>
                  </div>
                  <p className="text-[#252F20] text-xs leading-relaxed font-medium">
                    &quot;In PR #42 and the Discord discussion on Oct 18, the
                    team found that serverless functions exhausted PostgreSQL
                    connection limits on Supabase. Session pooling on port 5432
                    was adopted to maintain persistent connection reuse without
                    breaking prepared statements.&quot;
                  </p>
                  <div className="flex flex-wrap gap-1.5 pt-1 text-[10px] font-mono font-bold text-[#203314]">
                    <span className="bg-white px-2 py-0.5 rounded border border-[#9DC385]">
                      [Discord: #infra:10/18]
                    </span>
                    <span className="bg-white px-2 py-0.5 rounded border border-[#9DC385]">
                      [PR #42: Discussion]
                    </span>
                    <span className="bg-white px-2 py-0.5 rounded border border-[#9DC385]">
                      [schema.prisma:L4]
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
