import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { render, cleanup, act } from "@testing-library/react";
import { DashboardProvider, useDashboard } from "./DashboardContext";
import { api, type ProjectDto } from "@/lib/api";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

function Consumer() {
  const { projects, projectsLoading } = useDashboard();
  return (
    <div>
      <span data-testid="count">{projects.length}</span>
      <span data-testid="loading">{String(projectsLoading)}</span>
    </div>
  );
}

const mockUser = {
  id: "u1",
  name: "Alice",
  githubUsername: "alice",
  email: "alice@example.com",
  githubId: "12345",
  githubUserType: "User",
  githubAvatarUrl: null,
  githubProfileUrl: "https://github.com/alice",
};

const makeProject = (overrides: Partial<ProjectDto> = {}): ProjectDto => ({
  id: "p1",
  name: "demo",
  slug: "demo",
  description: "test",
  githubRepoFullName: "org/demo",
  githubRepoUrl: "https://github.com/org/demo",
  defaultBranch: "main",
  isPrivate: false,
  primaryLanguage: "TypeScript",
  url: "https://devtrace.io/p/demo",
  createdAt: new Date().toISOString(),
  syncStatus: "synced",
  lastSyncedAt: new Date().toISOString(),
  aiStatus: "completed",
  lastExtractedAt: new Date().toISOString(),
  decisionsCount: 5,
  ...overrides,
});

describe("Phase 4 — DashboardContext polling & lifecycle optimizations", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(api, "getCurrentUser").mockResolvedValue({ user: mockUser });
    Object.defineProperty(document, "visibilityState", {
      value: "visible",
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it("does not poll when idle (no projects are syncing or analysing)", async () => {
    const idleProject = makeProject({ syncStatus: "synced", aiStatus: "completed" });
    const getProjectsSpy = vi.spyOn(api, "getProjects").mockResolvedValue({
      projects: [idleProject],
    });

    await act(async () => {
      render(
        <DashboardProvider>
          <Consumer />
        </DashboardProvider>
      );
    });

    // Initial mount call
    expect(getProjectsSpy).toHaveBeenCalledTimes(1);

    // Fast-forward 15 seconds (would be 3 ticks if polling)
    await act(async () => {
      vi.advanceTimersByTime(15_000);
    });

    // Should still only be 1 call because all projects are idle
    expect(getProjectsSpy).toHaveBeenCalledTimes(1);
  });

  it("polls every 5s while syncStatus or aiStatus is running", async () => {
    const runningProject = makeProject({ syncStatus: "running", aiStatus: "idle" });
    const getProjectsSpy = vi.spyOn(api, "getProjects").mockResolvedValue({
      projects: [runningProject],
    });

    await act(async () => {
      render(
        <DashboardProvider>
          <Consumer />
        </DashboardProvider>
      );
    });

    expect(getProjectsSpy).toHaveBeenCalledTimes(1);

    // Advance 5s -> should tick once
    await act(async () => {
      vi.advanceTimersByTime(5_000);
    });
    expect(getProjectsSpy).toHaveBeenCalledTimes(2);

    // Advance another 5s -> should tick again
    await act(async () => {
      vi.advanceTimersByTime(5_000);
    });
    expect(getProjectsSpy).toHaveBeenCalledTimes(3);
  });

  it("pauses polling when tab is hidden and resumes immediately when visible", async () => {
    const runningProject = makeProject({ syncStatus: "running" });
    const getProjectsSpy = vi.spyOn(api, "getProjects").mockResolvedValue({
      projects: [runningProject],
    });

    await act(async () => {
      render(
        <DashboardProvider>
          <Consumer />
        </DashboardProvider>
      );
    });

    expect(getProjectsSpy).toHaveBeenCalledTimes(1);

    // Tab is hidden
    await act(async () => {
      Object.defineProperty(document, "visibilityState", {
        value: "hidden",
        configurable: true,
      });
      document.dispatchEvent(new Event("visibilitychange"));
    });

    // Advance 15 seconds while tab is hidden
    await act(async () => {
      vi.advanceTimersByTime(15_000);
    });

    // No extra calls should have happened while hidden!
    expect(getProjectsSpy).toHaveBeenCalledTimes(1);

    // Tab becomes visible again
    await act(async () => {
      Object.defineProperty(document, "visibilityState", {
        value: "visible",
        configurable: true,
      });
      document.dispatchEvent(new Event("visibilitychange"));
    });

    // Becoming visible triggers immediate refresh
    expect(getProjectsSpy).toHaveBeenCalledTimes(2);

    // And continues regular interval
    await act(async () => {
      vi.advanceTimersByTime(5_000);
    });
    expect(getProjectsSpy).toHaveBeenCalledTimes(3);
  });

  it("aborts in-flight requests when unmounted", async () => {
    let capturedSignal: AbortSignal | undefined;
    vi.spyOn(api, "getProjects").mockImplementation((options) => {
      capturedSignal = options?.signal as AbortSignal;
      return new Promise(() => {}); // never resolves
    });

    let unmountFn!: () => void;
    await act(async () => {
      const { unmount } = render(
        <DashboardProvider>
          <Consumer />
        </DashboardProvider>
      );
      unmountFn = unmount;
    });

    // Signal should not yet be aborted
    expect(capturedSignal?.aborted).toBe(false);

    // Unmount
    act(() => {
      unmountFn();
    });

    // Signal should now be aborted
    expect(capturedSignal?.aborted).toBe(true);
  });
});
