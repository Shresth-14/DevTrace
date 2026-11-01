"use client";

import {
  Search,
  FileCode2,
  GitPullRequest,
  AlertTriangle,
  ExternalLink,
  ShieldCheck,
} from "lucide-react";

export function Features() {
  return (
    <section id="features" className="py-20 md:py-28 border-t border-[#EAE4D5]">
      <div className="max-w-6xl mx-auto px-6 sm:px-8">
        {/* Section Header */}
        <div className="max-w-2xl">
          <span className="text-[11px] font-mono tracking-wider uppercase text-[#5A684E] font-bold">
            Core Capabilities
          </span>
          <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-[#2D3327] mt-3 leading-[1.2]">
            Engineering intelligence <br />
            <span className="text-[#5A684E]">for fast-moving teams.</span>
          </h2>
          <p className="mt-4 text-sm sm:text-base text-[#6F7365] leading-relaxed">
            Ensure your engineering team never re-debates solved problems or accidentally breaks critical architectural invariants during code reviews.
          </p>
        </div>

        {/* 4 Feature Columns / Grid */}
        <div className="mt-16 grid grid-cols-1 md:grid-cols-2 gap-12 pt-10 border-t border-[#EAE4D5]">
          {/* Feature 1: Decision Explorer */}
          <div className="space-y-4">
            <div className="space-y-2">
              <span className="text-[11px] font-mono font-bold text-[#5A684E] uppercase">
                Capability 01
              </span>
              <h3 className="text-xl font-bold text-[#2D3327] tracking-tight">
                Searchable Decision Explorer
              </h3>
              <p className="text-xs sm:text-sm text-[#6F7365] leading-relaxed">
                Browse every technical decision, its status, rationale, and discarded alternatives in one unified catalog. Filter by status, subsystem, or author.
              </p>
            </div>

            {/* Visualizer 1 */}
            <div className="p-4 rounded-xl bg-white border border-[#DDD8CC] text-xs space-y-2.5">
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#F7F5ED] text-[#77796F] text-xs border border-[#EAE4D5]">
                <Search className="w-3.5 h-3.5" />
                <span className="font-mono text-[11px]">Filter by keyword, path, or status...</span>
              </div>
              <div className="space-y-1.5 pt-1">
                <div className="flex items-center justify-between p-2 rounded-lg hover:bg-[#F7F5ED] transition-colors border border-transparent hover:border-[#EAE4D5]">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-[#4E673D]" />
                    <span className="font-bold text-[#2D3327] text-xs">DEC-084: PostgreSQL on Supabase</span>
                  </div>
                  <span className="font-mono text-[10px] text-[#77796F]">schema.prisma</span>
                </div>
                <div className="flex items-center justify-between p-2 rounded-lg hover:bg-[#F7F5ED] transition-colors border border-transparent hover:border-[#EAE4D5]">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-[#4E673D]" />
                    <span className="font-bold text-[#2D3327] text-xs">DEC-042: Session Pooler on Port 5432</span>
                  </div>
                  <span className="font-mono text-[10px] text-[#77796F]">database/index.ts</span>
                </div>
                <div className="flex items-center justify-between p-2 rounded-lg hover:bg-[#F7F5ED] transition-colors border border-transparent hover:border-[#EAE4D5]">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-[#B34032]" />
                    <span className="font-bold text-[#2D3327] text-xs">DEC-070: GraphQL Gateway (Rejected)</span>
                  </div>
                  <span className="font-mono text-[10px] text-[#77796F]">api/routes.ts</span>
                </div>
              </div>
            </div>
          </div>

          {/* Feature 2: Verbatim Evidence Backing */}
          <div className="space-y-4">
            <div className="space-y-2">
              <span className="text-[11px] font-mono font-bold text-[#5A684E] uppercase">
                Capability 02
              </span>
              <h3 className="text-xl font-bold text-[#2D3327] tracking-tight">
                Verbatim Evidence Backing
              </h3>
              <p className="text-xs sm:text-sm text-[#6F7365] leading-relaxed">
                Never trust hallucinated summaries. Every recorded decision links directly to the original discussion, PR review comments, and verified participant quotes.
              </p>
            </div>

            {/* Visualizer 2 */}
            <div className="p-4 rounded-xl bg-white border border-[#DDD8CC] text-xs space-y-2.5">
              <div className="flex items-center justify-between text-[11px] font-mono text-[#77796F] pb-2 border-b border-[#F2ECE0]">
                <div className="flex items-center gap-1.5 text-[#2D3327] font-semibold">
                  <ShieldCheck className="w-3.5 h-3.5 text-[#4E673D]" />
                  <span>Verified Citation</span>
                </div>
                <span className="text-[10px] font-mono text-[#35432C] bg-[#DCE6D3] px-2 py-0.5 rounded">
                  Discord #architecture
                </span>
              </div>
              <p className="text-xs italic text-[#555A4D] bg-[#F7F5ED] p-3 rounded-lg border border-[#EAE4D5] leading-relaxed">
                &quot;Mongo seemed simpler initially, but our decision graph requires relational consistency and foreign keys. PostgreSQL + Prisma is the clear path forward.&quot;
              </p>
              <div className="flex items-center justify-between text-[11px] text-[#77796F] pt-1">
                <span>By @alex-tech · Merged in PR #89</span>
                <span className="flex items-center gap-1 font-semibold text-[#2D3327] hover:underline cursor-pointer">
                  Original source <ExternalLink className="w-2.5 h-2.5" />
                </span>
              </div>
            </div>
          </div>

          {/* Feature 3: Repository Impact Graph */}
          <div className="space-y-4">
            <div className="space-y-2">
              <span className="text-[11px] font-mono font-bold text-[#5A684E] uppercase">
                Capability 03
              </span>
              <h3 className="text-xl font-bold text-[#2D3327] tracking-tight">
                Repository Impact Graph
              </h3>
              <p className="text-xs sm:text-sm text-[#6F7365] leading-relaxed">
                Decisions are indexed directly to files, function scopes, and configuration blocks. Trace from any decision to the exact lines that implement it.
              </p>
            </div>

            {/* Visualizer 3 */}
            <div className="p-4 rounded-xl bg-white border border-[#DDD8CC] text-xs space-y-2">
              <div className="text-[11px] font-mono text-[#77796F] pb-2 border-b border-[#F2ECE0] flex items-center justify-between">
                <span>CONNECTED ARTIFACTS</span>
                <span>3 References</span>
              </div>
              <div className="flex items-center justify-between p-2 rounded-lg bg-[#F7F5ED] text-xs font-mono">
                <div className="flex items-center gap-2 text-[#2D3327]">
                  <FileCode2 className="w-3.5 h-3.5 text-[#5A684E]" />
                  <span>server/prisma/schema.prisma</span>
                </div>
                <span className="text-[#77796F] text-[10px]">:L1-L188</span>
              </div>
              <div className="flex items-center justify-between p-2 rounded-lg bg-[#F7F5ED] text-xs font-mono">
                <div className="flex items-center gap-2 text-[#2D3327]">
                  <FileCode2 className="w-3.5 h-3.5 text-[#5A684E]" />
                  <span>server/src/database/index.ts</span>
                </div>
                <span className="text-[#77796F] text-[10px]">:L12-L64</span>
              </div>
            </div>
          </div>

          {/* Feature 4: PR Invariant Shield */}
          <div className="space-y-4">
            <div className="space-y-2">
              <span className="text-[11px] font-mono font-bold text-[#5A684E] uppercase">
                Capability 04
              </span>
              <h3 className="text-xl font-bold text-[#2D3327] tracking-tight">
                PR Invariant Shield
              </h3>
              <p className="text-xs sm:text-sm text-[#6F7365] leading-relaxed">
                When a pull request touches code protected by an agreed-upon architectural decision, Dev Trace surfaces the historical context before you merge.
              </p>
            </div>

            {/* Visualizer 4 */}
            <div className="p-4 rounded-xl bg-[#FAF8F3] border border-[#DDD8CC] text-xs space-y-2.5">
              <div className="flex items-center justify-between text-[11px] font-mono text-[#77796F] pb-2 border-b border-[#EAE4D5]">
                <div className="flex items-center gap-1.5 text-[#2D3327] font-semibold">
                  <GitPullRequest className="w-3.5 h-3.5 text-[#5A684E]" />
                  <span>PR #147: &quot;Update pooler port&quot;</span>
                </div>
                <span className="text-[#4E673D] font-bold">Bot Context Check</span>
              </div>
              <div className="p-3 rounded-lg bg-[#FFFBEB] border border-[#FDE68A] text-[#92400E] space-y-1.5">
                <div className="flex items-center gap-1.5 font-bold text-xs">
                  <AlertTriangle className="w-3.5 h-3.5 text-[#D97706]" />
                  <span>Protected Invariant Notice</span>
                </div>
                <p className="text-[11px] leading-relaxed text-[#78350F]">
                  This PR modifies <code className="font-mono bg-white/70 px-1 rounded">server/src/database/index.ts</code>. Note that <strong>DEC-042</strong> requires port 5432 for session affinity during Supabase migrations.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
