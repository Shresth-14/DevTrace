"use client";

import { LogoMark } from "@/components/LogoMark";
import { useState, useEffect } from "react";
import Link from "next/link";
import { Menu, X, ArrowUpRight, LogOut, GitBranch } from "lucide-react";
import { api, setStoredSession, UserDto } from "@/lib/api";

export function Navbar() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [user, setUser] = useState<UserDto | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const initUser = async () => {
      try {
        if (typeof window !== "undefined") {
          const urlParams = new URLSearchParams(window.location.search);
          const sessionParam = urlParams.get("session");
          if (sessionParam) {
            setStoredSession(sessionParam);
            const cleanUrl = window.location.pathname;
            window.history.replaceState({}, document.title, cleanUrl);
          }
        }

        const { user: currentUser } = await api.getCurrentUser();
        setUser(currentUser);
      } catch {
        setUser(null);
      } finally {
        setLoading(false);
      }
    };

    initUser();
  }, []);

  const handleLogout = async () => {
    try {
      await api.disconnect();
      setUser(null);
      window.location.reload();
    } catch (err) {
      console.error("Logout error:", err);
    }
  };

  return (
    <header className="sticky top-0 z-50 backdrop-blur-md bg-[#F7F5ED]/90 border-b border-[#EAE4D5] transition-all">
      <div className="max-w-7xl mx-auto px-6 sm:px-8 h-16 flex items-center justify-between">
        {/* Left: Brand */}
        <Link
          href="/"
          className="flex items-center gap-2.5 group focus:outline-none"
        >
          <div className="w-8 h-8 rounded-lg bg-[#2D3627] text-[#FAF8F3] flex items-center justify-center font-bold text-xs tracking-tight shadow-xs transition-transform group-hover:scale-[1.02]">
            <LogoMark />
          </div>
          <span className="font-bold text-base tracking-tight text-[#283022]">
            Dev Trace
          </span>
        </Link>

        {/* Right: Actions */}
        <div className="hidden md:flex items-center gap-5">
          {!loading && user ? (
            <div className="flex items-center gap-3">
              <Link
                href="/dashboard"
                className="inline-flex items-center gap-2 text-xs font-medium text-[#41463B] hover:text-[#283022] transition-colors"
              >
                {user.githubAvatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={user.githubAvatarUrl}
                    alt={user.githubUsername}
                    className="w-6 h-6 rounded-full ring-1 ring-[#35432C]/20"
                  />
                ) : (
                  <div className="w-6 h-6 rounded-full bg-[#35432C] text-white text-[10px] flex items-center justify-center font-bold">
                    {user.githubUsername[0].toUpperCase()}
                  </div>
                )}
                <span>@{user.githubUsername}</span>
              </Link>

              <Link
                href="/dashboard"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#38462F] hover:bg-[#2B3724] text-[#FAF8F3] text-xs font-semibold transition-all shadow-xs"
              >
                <GitBranch className="w-3.5 h-3.5 text-[#C5D6B4]" />
                <span>Dashboard</span>
              </Link>

              <button
                type="button"
                onClick={handleLogout}
                title="Sign out"
                className="p-1.5 rounded-md text-[#77796F] hover:text-[#283022] hover:bg-[#EAE4D5] transition-colors"
                aria-label="Sign out"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-4">
              <a
                href={api.getAuthUrl("/dashboard")}
                className="text-xs font-semibold text-[#5A6052] hover:text-[#283022] transition-colors"
              >
                Sign in
              </a>
              <a
                href={api.getAuthUrl("/dashboard")}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-[#38462F] hover:bg-[#2B3724] text-[#FAF8F3] text-xs font-semibold transition-all shadow-xs"
              >
                <span>Sign up</span>
                <ArrowUpRight className="w-3 h-3 text-[#C5D6B4]" />
              </a>
            </div>
          )}
        </div>

        {/* Mobile Hamburger */}
        <button
          type="button"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          aria-label="Toggle menu"
          className="md:hidden p-1.5 rounded-lg text-[#2F3728] hover:bg-[#EAE4D5] transition-colors"
        >
          {mobileMenuOpen ? (
            <X className="w-5 h-5" />
          ) : (
            <Menu className="w-5 h-5" />
          )}
        </button>
      </div>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="md:hidden bg-[#FAF8F3] border-b border-[#EAE4D5] px-6 py-4 flex flex-col gap-3 animate-in fade-in slide-in-from-top-2 duration-150">
          {user ? (
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2.5">
                {user.githubAvatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={user.githubAvatarUrl}
                    alt={user.githubUsername}
                    className="w-7 h-7 rounded-full"
                  />
                ) : null}
                <div>
                  <p className="text-xs font-bold text-[#1F271B]">
                    {user.name || user.githubUsername}
                  </p>
                  <p className="text-[11px] text-[#5A6052]">
                    @{user.githubUsername}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <Link
                  href="/dashboard"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex-1 py-2 rounded-lg bg-[#38462F] text-center text-[#FAF8F3] text-xs font-semibold"
                >
                  Dashboard
                </Link>
                <button
                  type="button"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    handleLogout();
                  }}
                  className="px-3 py-2 rounded-lg bg-[#EAE4D5] text-[#5A6052] text-xs font-semibold"
                >
                  Sign out
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-3 pt-1">
              <a
                href={api.getAuthUrl("/dashboard")}
                onClick={() => setMobileMenuOpen(false)}
                className="text-xs font-semibold text-[#41463B] py-2"
              >
                Sign in
              </a>
              <a
                href={api.getAuthUrl("/dashboard")}
                onClick={() => setMobileMenuOpen(false)}
                className="px-4 py-2 rounded-lg bg-[#38462F] text-[#FAF8F3] text-xs font-semibold shadow-xs"
              >
                Sign up with GitHub
              </a>
            </div>
          )}
        </div>
      )}
    </header>
  );
}
