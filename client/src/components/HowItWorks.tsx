"use client";

import { GitPullRequest, FileCode2 } from "lucide-react";

export function HowItWorks() {
  const steps = [
    {
      num: "01",
      tag: "Ingest",
      title: "Connect existing workspaces",
      desc: "Install the official GitHub App and invite the Discord collector with one click. Zero code changes or CI configuration needed.",
      visual: (
        <div className="p-4 rounded-xl bg-white border border-[#DDD8CC] text-xs space-y-2.5">
          <div className="flex items-center justify-between text-[11px] font-mono text-[#77796F] pb-2 border-b border-[#F2ECE0]">
            <span>SOURCES</span>
            <span className="flex items-center gap-1.5 text-[#35432C] font-semibold">
              <span className="w-1.5 h-1.5 rounded-full bg-[#4E673D] animate-pulse" />
              Active
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="font-mono text-[#2D3327] font-semibold">github.com/org/repo</span>
            <span className="text-[10px] font-mono bg-[#DCE6D3] text-[#2D3728] px-2 py-0.5 rounded">Synced</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="font-mono text-[#2D3327] font-semibold">discord: #architecture</span>
            <span className="text-[10px] font-mono bg-[#DCE6D3] text-[#2D3728] px-2 py-0.5 rounded">Listening</span>
          </div>
        </div>
      ),
    },
    {
      num: "02",
      tag: "Extract",
      title: "Synthesize consensus & trade-offs",
      desc: "AI identifies architectural proposals, adopted solutions, consensus reasoning, and explicitly rejected alternatives from real conversations.",
      visual: (
        <div className="p-4 rounded-xl bg-white border border-[#DDD8CC] text-xs space-y-2.5">
          <div className="flex items-center justify-between text-[11px] font-mono text-[#77796F] pb-2 border-b border-[#F2ECE0]">
            <span>DECISION EXTRACTED</span>
            <span className="text-[10px] font-mono bg-[#DCE6D3] text-[#2D3728] px-2 py-0.5 rounded font-bold">
              ACCEPTED
            </span>
          </div>
          <div>
            <div className="text-[10px] font-mono uppercase text-[#77796F]">Selected</div>
            <div className="font-semibold text-[#2D3327] text-xs">
              JWT with Redis Blocklist for session invalidation
            </div>
          </div>
          <div>
            <div className="text-[10px] font-mono uppercase text-[#9E3426]">Rejected Alternative</div>
            <div className="text-[#6F7365] text-[11px]">
              Opaque DB sessions (cross-region latency too high)
            </div>
          </div>
        </div>
      ),
    },
    {
      num: "03",
      tag: "Anchor",
      title: "Anchor decisions to code & PRs",
      desc: "Connect every decision directly to files, PRs, and discussions. When lines are touched in future PRs, context surfaces instantly.",
      visual: (
        <div className="p-4 rounded-xl bg-white border border-[#DDD8CC] text-xs space-y-2.5">
          <div className="flex items-center justify-between text-[11px] font-mono text-[#77796F] pb-2 border-b border-[#F2ECE0]">
            <span>LINKED CODE ARTIFACTS</span>
            <span className="text-[10px] font-mono text-[#77796F]">2 References</span>
          </div>
          <div className="flex items-center justify-between font-mono text-[11px]">
            <div className="flex items-center gap-1.5 text-[#2D3327]">
              <FileCode2 className="w-3.5 h-3.5 text-[#5A684E]" />
              <span>server/auth/jwt.ts</span>
            </div>
            <span className="text-[#77796F]">:L24-78</span>
          </div>
          <div className="flex items-center justify-between font-mono text-[11px]">
            <div className="flex items-center gap-1.5 text-[#2D3327]">
              <GitPullRequest className="w-3.5 h-3.5 text-[#5A684E]" />
              <span>PR #112 (Merged)</span>
            </div>
            <span className="text-[#35432C] font-semibold">Verified</span>
          </div>
        </div>
      ),
    },
  ];

  return (
    <section id="how-it-works" className="py-20 md:py-28 bg-[#F7F5ED]">
      <div className="max-w-6xl mx-auto px-6 sm:px-8">
        {/* Section Header */}
        <div className="max-w-2xl">
          <span className="text-[11px] font-mono tracking-wider uppercase text-[#5A684E] font-bold">
            How Dev Trace Operates
          </span>
          <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-[#2D3327] mt-3 leading-[1.2]">
            From messy discussions to <br />
            <span className="text-[#5A684E]">structured engineering records.</span>
          </h2>
          <p className="mt-4 text-sm sm:text-base text-[#6F7365] leading-relaxed">
            A background intelligence layer that runs alongside your daily tools, turning scattered debates into permanent architectural knowledge.
          </p>
        </div>

        {/* 3 Step Flow */}
        <div className="mt-16 grid grid-cols-1 md:grid-cols-3 gap-8 pt-10 border-t border-[#EAE4D5]">
          {steps.map((step) => (
            <div key={step.num} className="flex flex-col justify-between space-y-6">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-2xl font-extrabold text-[#5A684E]">
                    {step.num}
                  </span>
                  <span className="text-[10px] font-mono uppercase tracking-wider text-[#77796F] bg-[#EAE6D8] px-2.5 py-0.5 rounded font-semibold">
                    {step.tag}
                  </span>
                </div>
                <h3 className="text-base font-bold text-[#2D3327] tracking-tight">
                  {step.title}
                </h3>
                <p className="text-xs sm:text-sm text-[#6F7365] leading-relaxed">
                  {step.desc}
                </p>
              </div>

              {/* Step Visual Preview */}
              <div>{step.visual}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
