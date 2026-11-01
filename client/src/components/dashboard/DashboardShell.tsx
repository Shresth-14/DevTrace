"use client";

import { LogoMark } from "@/components/LogoMark";
import React, { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useDashboard } from "@/context/DashboardContext";
import { AddProjectModal } from "./AddProjectModal";
import {
  LayoutDashboard,
  FolderGit2,
  Puzzle,
  Settings,
  LogOut,
  ChevronDown,
  Menu,
  X,
  Plus,
  ExternalLink,
  ShieldCheck,
  Check,
  AlertCircle,
  Info,
} from "lucide-react";

interface NavItem {
  name: string;
  href: string;
  icon: React.ElementType;
  badge?: string;
}

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const {
    user,
    projects,
    openAddProject,
    toasts,
    removeToast,
    handleLogout,
  } = useDashboard();

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [userDropdownOpen, setUserDropdownOpen] = useState(false);

  const navItems: NavItem[] = [
    {
      name: "Overview",
      href: "/dashboard",
      icon: LayoutDashboard,
    },
    {
      name: "Projects",
      href: "/dashboard/projects",
      icon: FolderGit2,
      badge: projects.length > 0 ? `${projects.length}` : undefined,
    },
    {
      name: "Integrations",
      href: "/dashboard/integrations",
      icon: Puzzle,
    },
    {
      name: "Settings",
      href: "/dashboard/settings",
      icon: Settings,
    },
  ];

  const isNavActive = (href: string) => {
    if (href === "/dashboard") {
      return pathname === "/dashboard";
    }
    return pathname.startsWith(href);
  };

  return (
    <div className="min-h-screen bg-[#F7F5ED] text-[#41463B] flex flex-col md:flex-row">
      {/* Add Project Modal Host */}
      <AddProjectModal />

      {/* Floating Toast Host */}
      <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`pointer-events-auto p-3.5 rounded-xl border shadow-lg flex items-start gap-3 animate-in slide-in-from-bottom-2 fade-in duration-200 ${
              toast.type === "error"
                ? "bg-white border-red-200 text-red-800"
                : toast.type === "info"
                  ? "bg-[#FAF8F3] border-[#DDD8CC] text-[#41463B]"
                  : "bg-white border-[#9BAF8B] text-[#2F3728]"
            }`}
          >
            <div className="shrink-0 mt-0.5">
              {toast.type === "error" ? (
                <AlertCircle className="w-4 h-4 text-red-600" />
              ) : toast.type === "info" ? (
                <Info className="w-4 h-4 text-[#77796F]" />
              ) : (
                <Check className="w-4 h-4 text-[#38462F]" />
              )}
            </div>
            <div className="flex-1 text-xs font-medium leading-relaxed">
              {toast.message}
            </div>
            <button
              type="button"
              onClick={() => removeToast(toast.id)}
              className="text-[#77796F] hover:text-[#41463B] p-0.5"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>

      {/* Mobile Top Header */}
      <header className="md:hidden bg-[#FAF8F3] border-b border-[#EAE4D5] px-4 py-3 flex items-center justify-between sticky top-0 z-40">
        <Link href="/" className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-[#2D3627] text-[#FAF8F3] flex items-center justify-center font-bold text-xs">
            <LogoMark />
          </div>
          <span className="font-bold text-base tracking-tight text-[#283022]">
            Dev Trace
          </span>
        </Link>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={openAddProject}
            className="p-1.5 rounded-lg bg-[#38462F] text-white text-xs font-semibold flex items-center gap-1 shadow-xs"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="p-1.5 rounded-lg text-[#41463B] hover:bg-[#EAE4D5] transition-colors"
            aria-label="Toggle navigation menu"
          >
            {mobileMenuOpen ? (
              <X className="w-5 h-5" />
            ) : (
              <Menu className="w-5 h-5" />
            )}
          </button>
        </div>
      </header>

      {/* Mobile Dropdown Menu Drawer */}
      {mobileMenuOpen && (
        <div className="md:hidden bg-[#FAF8F3] border-b border-[#EAE4D5] px-4 py-4 space-y-4 animate-in fade-in slide-in-from-top-2 duration-150">
          <nav className="space-y-1">
            {navItems.map((item) => {
              const active = isNavActive(item.href);
              const Icon = item.icon;
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-medium transition-colors ${
                    active
                      ? "bg-[#DCE6D3] text-[#283022] font-semibold"
                      : "text-[#77796F] hover:bg-[#EAE6D8] hover:text-[#41463B]"
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Icon className="w-4 h-4" />
                    <span>{item.name}</span>
                  </div>
                  {item.badge && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#FFFFFF] border border-[#DDD8CC]">
                      {item.badge}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>

          <div className="pt-2 border-t border-[#EAE4D5] flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={user.avatarUrl ?? `https://github.com/${user.username}.png`}
                alt={user.username}
                className="w-7 h-7 rounded-full ring-1 ring-[#38462F]/20"
              />
              <span className="text-xs font-semibold text-[#41463B]">
                @{user.username}
              </span>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              className="text-xs text-red-700 font-semibold flex items-center gap-1"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Log out</span>
            </button>
          </div>
        </div>
      )}

      {/* Desktop Persistent Left Sidebar */}
      <aside className="hidden md:flex flex-col w-64 shrink-0 bg-[#FAF8F3] border-r border-[#EAE4D5] h-screen sticky top-0 justify-between select-none">
        {/* Top: Brand & Quick Action */}
        <div>
          <div className="h-18 px-5 flex items-center justify-between border-b border-[#EAE4D5]">
            <Link
              href="/"
              className="flex items-center gap-2.5 group focus:outline-none"
            >
              <div className="w-8 h-8 rounded-xl bg-[#2D3627] text-[#FAF8F3] flex items-center justify-center font-bold text-xs shadow-xs transition-transform group-hover:scale-[1.03]">
                <LogoMark />
              </div>
              <div className="flex flex-col">
                <span className="font-bold text-base tracking-tight text-[#283022]">
                  Dev Trace
                </span>
              </div>
            </Link>
          </div>

          {/* New Project Quick Trigger Button */}
          <div className="p-3.5 pb-2">
            <button
              type="button"
              onClick={openAddProject}
              className="w-full flex items-center justify-center gap-2 px-3.5 py-2 rounded-xl bg-[#38462F] hover:bg-[#2B3724] active:bg-[#222C1C] text-[#FAF8F3] text-xs font-semibold transition-all shadow-[0_1px_3px_rgba(40,50,33,0.12)] cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5 text-[#C5D6B4]" />
              <span>Add project</span>
            </button>
          </div>

          {/* Navigation Links */}
          <nav className="p-3 space-y-1">
            {navItems.map((item) => {
              const active = isNavActive(item.href);
              const Icon = item.icon;
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  className={`flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium transition-all ${
                    active
                      ? "bg-[#DCE6D3] text-[#283022] font-semibold shadow-xs"
                      : "text-[#77796F] hover:bg-[#EAE6D8] hover:text-[#41463B]"
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Icon
                      className={`w-4 h-4 ${
                        active ? "text-[#38462F]" : "text-[#77796F]"
                      }`}
                    />
                    <span>{item.name}</span>
                  </div>
                  {item.badge && (
                    <span
                      className={`px-2 py-0.2 rounded-full text-[10px] font-semibold border ${
                        active
                          ? "bg-white text-[#38462F] border-[#C5D6B4]"
                          : "bg-[#EAE6D8] text-[#5A6052] border-[#DDD8CC]"
                      }`}
                    >
                      {item.badge}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Bottom Maintainer Account Section */}
        <div className="p-3 border-t border-[#EAE4D5] relative">
          {/* Dropdown Menu */}
          {userDropdownOpen && (
            <>
              <div
                className="fixed inset-0 z-20"
                onClick={() => setUserDropdownOpen(false)}
              />
              <div className="absolute bottom-16 left-3 right-3 z-30 bg-white rounded-xl border border-[#DDD8CC] shadow-xl p-1.5 space-y-1 text-xs">
                <div className="px-3 py-2 border-b border-[#EAE4D5]">
                  <p className="font-bold text-[#41463B] truncate">{user.name}</p>
                  <p className="text-[11px] text-[#77796F] truncate">
                    github.com/{user.username}
                  </p>
                </div>

                <Link
                  href="/dashboard/settings"
                  onClick={() => setUserDropdownOpen(false)}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg text-[#5A6052] hover:bg-[#F7F5ED] hover:text-[#41463B] transition-colors"
                >
                  <Settings className="w-3.5 h-3.5" />
                  <span>Account Settings</span>
                </Link>

                <a
                  href={`https://github.com/${user.username}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-between px-3 py-2 rounded-lg text-[#5A6052] hover:bg-[#F7F5ED] hover:text-[#41463B] transition-colors"
                >
                  <span className="flex items-center gap-2">
                    <ShieldCheck className="w-3.5 h-3.5 text-[#38462F]" />
                    <span>GitHub Profile</span>
                  </span>
                  <ExternalLink className="w-3 h-3 text-[#77796F]" />
                </a>

                <button
                  type="button"
                  onClick={handleLogout}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-red-700 hover:bg-red-50 transition-colors text-left font-medium"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Log out</span>
                </button>
              </div>
            </>
          )}

          {/* Profile Trigger Pill */}
          <button
            type="button"
            onClick={() => setUserDropdownOpen(!userDropdownOpen)}
            className="w-full flex items-center justify-between p-2 rounded-xl hover:bg-[#EAE6D8] transition-colors text-left"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={user.avatarUrl ?? `https://github.com/${user.username}.png`}
                alt={user.username}
                className="w-8 h-8 rounded-full ring-1 ring-[#38462F]/20 shrink-0"
              />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold text-[#41463B] truncate leading-tight">
                  {user.name}
                </p>
                <p className="text-[10px] text-[#77796F] truncate font-mono">
                  @{user.username}
                </p>
              </div>
            </div>
            <ChevronDown className="w-3.5 h-3.5 text-[#77796F] shrink-0" />
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 min-w-0 bg-[#F7F5ED] p-4 sm:p-8 lg:p-10 max-w-7xl mx-auto w-full">
        {children}
      </main>
    </div>
  );
}

