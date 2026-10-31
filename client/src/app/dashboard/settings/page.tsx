"use client";

import React from "react";
import { useDashboard } from "@/context/DashboardContext";
import { GITHUB_APP_SLUG } from "@/lib/api";
import { User, Shield, LogOut } from "lucide-react";

export default function DashboardSettingsPage() {
  const { user, handleLogout } = useDashboard();

  return (
    <div className="space-y-8 animate-in fade-in duration-150 max-w-3xl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-[#41463B]">
          Settings
        </h1>
        <p className="text-sm text-[#77796F] mt-1">
          Manage your maintainer profile, connected accounts, and decision
          indexing preferences.
        </p>
      </div>

      <div className="space-y-6">
        {/* 1. Profile Information */}
        <div className="p-6 rounded-2xl bg-white border border-[#DDD8CC] shadow-xs space-y-5">
          <div className="flex items-center gap-3 border-b border-[#F2ECE0] pb-4">
            <div className="w-8 h-8 rounded-lg bg-[#EAE6D8] text-[#38462F] flex items-center justify-center">
              <User className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-[#41463B]">
                Profile Information
              </h3>
              <p className="text-xs text-[#77796F]">
                Your personal maintainer credentials.
              </p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center gap-5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={user.avatarUrl ?? `https://github.com/${user.username}.png`}
              alt={user.username}
              className="w-16 h-16 rounded-full ring-2 ring-[#9BAF8B]/40 shrink-0"
            />
            <div className="space-y-1">
              <p className="text-base font-bold text-[#41463B]">{user.name}</p>
              <p className="text-xs font-mono text-[#77796F]">
                github.com/{user.username}
              </p>
              {user.email ? <p className="text-xs text-[#77796F]">{user.email}</p> : null}
            </div>
          </div>
        </div>

        {/* 2. GitHub Connection */}
        <div className="p-6 rounded-2xl bg-white border border-[#DDD8CC] shadow-xs space-y-4">
          <div className="flex items-center gap-3 border-b border-[#F2ECE0] pb-4">
            <div className="w-8 h-8 rounded-lg bg-[#DCE6D3] text-[#38462F] flex items-center justify-center">
              <Shield className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-[#41463B]">
                GitHub Authorization
              </h3>
              <p className="text-xs text-[#77796F]">
                Signed in with GitHub. Repositories are read through the Dev Trace
                GitHub App, only where you installed it.
              </p>
            </div>
          </div>

          <div className="space-y-2 text-xs">
            <div className="flex items-center justify-between py-2 border-b border-[#F2ECE0]">
              <span className="text-[#77796F]">GitHub Username</span>
              <span className="font-mono font-semibold text-[#41463B]">
                @{user.username}
              </span>
            </div>
            <div className="flex items-center justify-between py-2">
              <span className="text-[#77796F]">App Slug</span>
              <span className="font-mono font-semibold text-[#38462F]">
                {GITHUB_APP_SLUG}
              </span>
            </div>
          </div>
        </div>

        {/* 4. Danger Zone / Logout */}
        <div className="p-6 rounded-2xl bg-white border border-red-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h3 className="text-sm font-bold text-red-900">Sign Out</h3>
            <p className="text-xs text-[#77796F] mt-0.5">
              Disconnect active session on this device and return to landing
              page.
            </p>
          </div>

          <button
            type="button"
            onClick={handleLogout}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-red-200 bg-red-50 hover:bg-red-100 text-red-700 text-xs font-semibold transition-colors self-start sm:self-auto"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Log out</span>
          </button>
        </div>
      </div>
    </div>
  );
}

