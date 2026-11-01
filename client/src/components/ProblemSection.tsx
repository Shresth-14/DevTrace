"use client";

import { GitCommit, ShieldCheck, ArrowRight } from "lucide-react";

export function ProblemSection() {
  const problems = [
    {
      num: "01",
      title: "Context gets buried",
      desc: "Crucial architectural trade-offs disappear across issues, pull requests, and chat channels. When questions arise six months later, teams waste hours digging through closed tabs and stale threads.",
      symptom: "Circular re-debates on solved problems",
    },
    {
      num: "02",
      title: "Knowledge walks away",
      desc: "When senior developers leave or change teams, the reasoning behind key constraints walks out the door. New contributors inherit complex code without knowing which guardrails are intentional and which are obsolete.",
      symptom: "Fear of refactoring fragile legacy systems",
    },
    {
      num: "03",
      title: "Intent stays disconnected",
      desc: "Git blame tells you who committed a line and when, but not why alternative approaches were rejected. The code reflects the final syntax, but completely strips the engineering debate.",
      symptom: "Accidental regressions during PR reviews",
    },
  ];

  return (
    <section className="py-20 md:py-28 border-t border-[#EAE4D5]">
      <div className="max-w-6xl mx-auto px-6 sm:px-8">
        {/* Section Header */}
        <div className="max-w-2xl">
          <span className="text-[11px] font-mono tracking-wider uppercase text-[#5A684E] font-bold">
            The Missing Context Layer
          </span>
          <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-[#2D3327] mt-3 leading-[1.2]">
            Code shows what changed. <br />
            <span className="text-[#5A684E]">Discussions explain why.</span>
          </h2>
          <p className="mt-4 text-sm sm:text-base text-[#6F7365] leading-relaxed">
            Every codebase accumulates hundreds of implicit decisions. Without an intentional memory layer, the intent behind your architecture disappears into forgotten channels.
          </p>
        </div>

        {/* 3-Column Editorial Layout (No box-in-box wrapping) */}
        <div className="mt-16 grid grid-cols-1 md:grid-cols-3 gap-10 md:gap-8 pt-10 border-t border-[#EAE4D5]">
          {problems.map((prob) => (
            <div key={prob.num} className="flex flex-col justify-between space-y-4">
              <div className="space-y-3">
                <span className="font-mono text-xs font-bold text-[#8A9C7B] tracking-wider">
                  {prob.num}
                </span>
                <h3 className="text-lg font-bold text-[#2D3327] tracking-tight">
                  {prob.title}
                </h3>
                <p className="text-xs sm:text-sm text-[#6F7365] leading-relaxed">
                  {prob.desc}
                </p>
              </div>

              <div className="pt-3 border-t border-[#EAE4D5]/80 flex items-center gap-2 text-xs font-mono text-[#5A6052]">
                <span className="w-1.5 h-1.5 rounded-full bg-[#B34032]" />
                <span className="text-[11px]">{prob.symptom}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Editorial Side-by-Side: Git Blame vs Dev Trace */}
        <div className="mt-16 pt-10 border-t border-[#EAE4D5]">
          <div className="text-xs font-mono uppercase tracking-wider text-[#77796F] mb-6">
            Compare developer workflows
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Git Blame reality */}
            <div className="p-6 rounded-2xl bg-[#EAE6D8]/50 border border-[#DDD8CC] space-y-3 font-mono text-xs">
              <div className="flex items-center gap-2 text-[#41463B] font-bold">
                <GitCommit className="w-4 h-4 text-[#77796F]" />
                <span>What Git Blame gives you</span>
              </div>
              <div className="space-y-1 text-[#555A4D] bg-white/70 p-4 rounded-xl border border-[#DDD8CC]/70 text-[11px] leading-relaxed">
                <div>$ git log -S &quot;prismaPooler&quot; -1</div>
                <div className="font-semibold text-[#2D3327] pt-1">
                  commit 749c72a1 · 3 weeks ago
                </div>
                <div className="text-[#77796F]">
                  Author: Sarah Lin &lt;sarah@company.com&gt;
                </div>
                <div className="italic text-[#2D3327]">
                  &quot;refactor: update connection pooler settings&quot;
                </div>
                <div className="text-[#A13A2C] pt-2 font-semibold">
                  ✕ Why port 5432? ✕ What broke before? ✕ What was rejected?
                </div>
              </div>
            </div>

            {/* Dev Trace preserved context */}
            <div className="p-6 rounded-2xl bg-white border border-[#C5D6B4] shadow-xs space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-bold text-[#2D3327]">
                  <ShieldCheck className="w-4 h-4 text-[#4E673D]" />
                  <span>What Dev Trace preserves</span>
                </div>
                <span className="text-[10px] font-mono font-bold bg-[#DCE6D3] text-[#2D3728] px-2 py-0.5 rounded">
                  DEC-042: VERIFIED
                </span>
              </div>
              <div className="space-y-2 text-xs">
                <div className="font-semibold text-[#2D3327]">
                  Supabase Session Pooler on Port 5432
                </div>
                <p className="text-xs text-[#555A4D] leading-relaxed">
                  Adopted session mode over transaction mode because Prisma prepared statements required persistent session affinity during automated schema migrations.
                </p>
                <div className="pt-2 flex items-center justify-between text-[11px] font-mono text-[#5A684E] border-t border-[#F2ECE0]">
                  <span>Linked: PR #42 · Issue #31 · env.ts:L14</span>
                  <span className="flex items-center gap-1 font-semibold hover:underline cursor-pointer">
                    Trace <ArrowRight className="w-3 h-3" />
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
