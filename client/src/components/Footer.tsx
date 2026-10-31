"use client";

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

export function Footer() {
  return (
    <footer className="bg-[#F7F5ED] border-t border-[#E5E0D5] py-16 text-[#77796F] text-sm">
      <div className="max-w-7xl mx-auto px-6 sm:px-8">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-10 pb-12 border-b border-[#EAE6D8]">
          {/* Brand Info (2 cols) */}
          <div className="md:col-span-2 space-y-4">
            <Link href="/" className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-[#41463B] text-[#F7F5ED] flex items-center justify-center font-bold text-xs">
                <svg
                  className="w-4 h-4 text-[#C5D6B4]"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="6" cy="6" r="3" />
                  <circle cx="18" cy="18" r="3" />
                  <path d="M9 9l6 6" />
                  <path d="M15 6h3v3" />
                </svg>
              </div>
              <span className="font-semibold text-base text-[#41463B]">
                Dev Trace
              </span>
            </Link>

            <p className="text-sm text-[#77796F] max-w-sm leading-relaxed">
              The memory layer for software teams. Preserving the why behind
              every line of code by connecting discussions directly to
              repositories.
            </p>

            <div className="text-xs font-mono text-[#77796F] pt-2">
              Understand the why behind every line of code.
            </div>
          </div>

          {/* Links: Platform */}
          <div className="space-y-3">
            <h4 className="text-xs font-mono uppercase font-semibold text-[#41463B] tracking-wider">
              Product
            </h4>
            <ul className="space-y-2.5 text-sm">
              <li>
                <a
                  href="#product"
                  className="hover:text-[#41463B] transition-colors"
                >
                  Overview
                </a>
              </li>
              <li>
                <a
                  href="#how-it-works"
                  className="hover:text-[#41463B] transition-colors"
                >
                  How it works
                </a>
              </li>
              <li>
                <a
                  href="#features"
                  className="hover:text-[#41463B] transition-colors"
                >
                  Features
                </a>
              </li>
              <li>
                <a
                  href="#documentation"
                  className="hover:text-[#41463B] transition-colors"
                >
                  Documentation
                </a>
              </li>
            </ul>
          </div>

          {/* Links: Resources */}
          <div className="space-y-3">
            <h4 className="text-xs font-mono uppercase font-semibold text-[#41463B] tracking-wider">
              Ecosystem
            </h4>
            <ul className="space-y-2.5 text-sm">
              <li>
                <a
                  href="https://github.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 hover:text-[#41463B] transition-colors"
                >
                  GitHub
                  <ArrowUpRight className="w-3 h-3" />
                </a>
              </li>
              <li>
                <a
                  href="#documentation"
                  className="hover:text-[#41463B] transition-colors"
                >
                  API Reference
                </a>
              </li>
              <li>
                <a
                  href="#product"
                  className="hover:text-[#41463B] transition-colors"
                >
                  Decision Schema
                </a>
              </li>
            </ul>
          </div>

          {/* Links: Account */}
          <div className="space-y-3">
            <h4 className="text-xs font-mono uppercase font-semibold text-[#41463B] tracking-wider">
              Access
            </h4>
            <ul className="space-y-2.5 text-sm">
              <li>
                <Link
                  href="#login"
                  className="hover:text-[#41463B] transition-colors"
                >
                  Log in
                </Link>
              </li>
              <li>
                <Link
                  href="#signup"
                  className="hover:text-[#41463B] transition-colors font-semibold text-[#41463B]"
                >
                  Sign up
                </Link>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="pt-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-[#77796F]">
          <p>© 2026 Dev Trace. All rights reserved.</p>
          <div className="flex items-center gap-6 font-mono text-[11px]">
            <span>Privacy</span>
            <span>Terms</span>
            <span>Security</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
