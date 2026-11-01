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
    <header className="sticky top-0 z-50 border-b border-lp-line bg-lp-bg/70 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6 sm:px-8">
        {/* Left: Brand */}
        <Link
          href="/"
          className="group flex items-center gap-2.5 focus:outline-none"
        >
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#2D3627] ring-1 ring-lp-glow/30 transition-transform group-hover:scale-105">
            <LogoMark />
          </div>
          <span className="text-base font-semibold tracking-tight text-lp-ink">
            Dev Trace
          </span>
        </Link>

        {/* Right: Actions */}
        <div className="hidden items-center gap-5 md:flex">
          {!loading && user ? (
            <div className="flex items-center gap-3">
              <Link
                href="/dashboard"
                className="inline-flex items-center gap-2 text-xs font-medium text-lp-mute transition-colors hover:text-lp-ink"
              >
                {user.githubAvatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={user.githubAvatarUrl}
                    alt={user.githubUsername}
                    className="h-6 w-6 rounded-full ring-1 ring-lp-glow/30"
                  />
                ) : (
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-lp-glow text-[10px] font-bold text-lp-bg">
                    {user.githubUsername[0].toUpperCase()}
                  </div>
                )}
                <span>@{user.githubUsername}</span>
              </Link>

              <Link
                href="/dashboard"
                className="inline-flex items-center gap-1.5 rounded-full bg-lp-glow px-4 py-1.5 text-xs font-semibold text-lp-bg transition-all hover:brightness-110"
              >
                <GitBranch className="h-3.5 w-3.5" />
                <span>Dashboard</span>
              </Link>

              <button
                type="button"
                onClick={handleLogout}
                title="Sign out"
                className="rounded-md p-1.5 text-lp-mute transition-colors hover:bg-white/10 hover:text-lp-ink"
                aria-label="Sign out"
              >
                <LogOut className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-5">
              <a
                href={api.getAuthUrl("/dashboard")}
                className="text-xs font-semibold text-lp-mute transition-colors hover:text-lp-ink"
              >
                Sign in
              </a>
              <a
                href={api.getAuthUrl("/dashboard")}
                className="inline-flex items-center gap-1.5 rounded-full bg-lp-glow px-4 py-1.5 text-xs font-semibold text-lp-bg transition-all hover:brightness-110"
              >
                <span>Sign up</span>
                <ArrowUpRight className="h-3 w-3" />
              </a>
            </div>
          )}
        </div>

        {/* Mobile Hamburger */}
        <button
          type="button"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          aria-label="Toggle menu"
          className="rounded-lg p-1.5 text-lp-ink transition-colors hover:bg-white/10 md:hidden"
        >
          {mobileMenuOpen ? (
            <X className="h-5 w-5" />
          ) : (
            <Menu className="h-5 w-5" />
          )}
        </button>
      </div>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="flex flex-col gap-3 border-t border-lp-line bg-lp-bg/95 px-6 py-4 animate-in fade-in slide-in-from-top-2 duration-150 md:hidden">
          {user ? (
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2.5">
                {user.githubAvatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={user.githubAvatarUrl}
                    alt={user.githubUsername}
                    className="h-7 w-7 rounded-full"
                  />
                ) : null}
                <div>
                  <p className="text-xs font-bold text-lp-ink">
                    {user.name || user.githubUsername}
                  </p>
                  <p className="text-[11px] text-lp-mute">
                    @{user.githubUsername}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <Link
                  href="/dashboard"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex-1 rounded-full bg-lp-glow py-2 text-center text-xs font-semibold text-lp-bg"
                >
                  Dashboard
                </Link>
                <button
                  type="button"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    handleLogout();
                  }}
                  className="rounded-full bg-white/10 px-4 py-2 text-xs font-semibold text-lp-ink"
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
                className="py-2 text-xs font-semibold text-lp-mute"
              >
                Sign in
              </a>
              <a
                href={api.getAuthUrl("/dashboard")}
                onClick={() => setMobileMenuOpen(false)}
                className="rounded-full bg-lp-glow px-4 py-2 text-xs font-semibold text-lp-bg"
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
