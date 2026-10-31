"use client";

import React, { useState } from "react";
import { useDashboard } from "@/context/DashboardContext";
import {
  User,
  Shield,
  Bell,
  LogOut,
  CheckCircle2,
  Save,
} from "lucide-react";

export default function DashboardSettingsPage() {
  const { user, handleLogout, addToast } = useDashboard();

  const [autoSync, setAutoSync] = useState(true);
  const [sensitivity, setSensitivity] = useState<"standard" | "high">("standard");

  const handleSavePreferences = () => {
    addToast("Preferences saved successfully.", "success");
  };

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
              src={user.avatarUrl}
              alt={user.username}
              className="w-16 h-16 rounded-full ring-2 ring-[#9BAF8B]/40 shrink-0"
            />
            <div className="space-y-1">
              <p className="text-base font-bold text-[#41463B]">{user.name}</p>
              <p className="text-xs font-mono text-[#77796F]">
                github.com/{user.username}
              </p>
              <p className="text-xs text-[#77796F]">{user.email}</p>
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
                Connected via Dev Trace GitHub App with fine-grained repository
                permissions.
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
            <div className="flex items-center justify-between py-2 border-b border-[#F2ECE0]">
              <span className="text-[#77796F]">App Slug</span>
              <span className="font-mono font-semibold text-[#38462F]">
                dev-trace2607
              </span>
            </div>
            <div className="flex items-center justify-between py-2">
              <span className="text-[#77796F]">Permissions</span>
              <span className="inline-flex items-center gap-1 font-semibold text-[#38462F]">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Read-only issues, discussions & contents
              </span>
            </div>
          </div>
        </div>

        {/* 3. Indexing & Preferences */}
        <div className="p-6 rounded-2xl bg-white border border-[#DDD8CC] shadow-xs space-y-5">
          <div className="flex items-center gap-3 border-b border-[#F2ECE0] pb-4">
            <div className="w-8 h-8 rounded-lg bg-[#EAE6D8] text-[#38462F] flex items-center justify-center">
              <Bell className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-[#41463B]">
                Indexing & Decision Preferences
              </h3>
              <p className="text-xs text-[#77796F]">
                Configure real-time webhooks and decision extraction.
              </p>
            </div>
          </div>

          <div className="space-y-4 text-xs">
            {/* Toggle 1 */}
            <div className="flex items-center justify-between">
              <div>
                <p className="font-semibold text-[#41463B]">
                  Automatic Webhook Synchronization
                </p>
                <p className="text-[11px] text-[#77796F]">
                  Instantly index technical discussions when PRs or issues are
                  closed.
                </p>
              </div>
              <input
                type="checkbox"
                checked={autoSync}
                onChange={(e) => setAutoSync(e.target.checked)}
                className="w-4 h-4 text-[#38462F] rounded accent-[#38462F] cursor-pointer"
              />
            </div>

            {/* Toggle 2 */}
            <div className="flex items-center justify-between">
              <div>
                <p className="font-semibold text-[#41463B]">
                  Decision Synthesis Sensitivity
                </p>
                <p className="text-[11px] text-[#77796F]">
                  Controls filtering of minor code formatting reviews vs
                  architectural decisions.
                </p>
              </div>
              <select
                value={sensitivity}
                onChange={(e) =>
                  setSensitivity(e.target.value as "standard" | "high")
                }
                className="px-2.5 py-1.5 rounded-lg bg-[#F7F5ED] border border-[#DDD8CC] text-xs text-[#41463B] font-medium cursor-pointer"
              >
                <option value="standard">Architectural decisions only</option>
                <option value="high">All design discussions</option>
              </select>
            </div>
          </div>

          <div className="pt-2">
            <button
              type="button"
              onClick={handleSavePreferences}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#38462F] hover:bg-[#2B3724] text-[#FAF8F3] text-xs font-semibold transition-all shadow-xs"
            >
              <Save className="w-3.5 h-3.5 text-[#C5D6B4]" />
              <span>Save preferences</span>
            </button>
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

