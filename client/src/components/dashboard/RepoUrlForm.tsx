"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, ArrowRight, Loader2 } from "lucide-react";
import { useDashboard } from "@/context/DashboardContext";

const EXAMPLE = "https://github.com/python/peps";

/** Paste a public GitHub repository URL; Dev Trace imports and analyses it. */
export function RepoUrlForm({ onDone }: { onDone?: () => void }) {
  const router = useRouter();
  const { addProjectFromUrl } = useDashboard();
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const value = url.trim();
    if (!value) {
      setError("Paste the URL of a public GitHub repository.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { project } = await addProjectFromUrl(value);
      onDone?.();
      router.push(`/p/${project.slug}`);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not add this repository."
      );
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-3" noValidate>
      <label
        htmlFor="repo-url"
        className="block text-xs font-semibold text-[#41463B]"
      >
        Public GitHub repository URL
      </label>
      <input
        id="repo-url"
        type="url"
        inputMode="url"
        autoFocus
        autoComplete="off"
        spellCheck={false}
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder={EXAMPLE}
        disabled={busy}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? "repo-url-error" : "repo-url-hint"}
        className="w-full rounded-xl border border-[#DDD8CC] bg-white px-3.5 py-2.5 font-mono text-xs text-[#1F271B] focus:border-[#35432C] focus:outline-none disabled:opacity-60"
      />
      {error ? (
        <p
          id="repo-url-error"
          role="alert"
          className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </p>
      ) : (
        <p
          id="repo-url-hint"
          className="text-[11px] leading-relaxed text-[#77796F]"
        >
          Dev Trace reads the repository&apos;s public issues, pull requests,
          reviews and discussions, then recovers the decisions made in them. The
          most recently updated threads are imported first, so large
          repositories start showing results quickly.
        </p>
      )}
      <button
        type="submit"
        disabled={busy}
        className="inline-flex items-center gap-2 rounded-xl bg-[#35432C] px-4 py-2.5 text-xs font-semibold text-[#FAF8F3] transition-colors hover:bg-[#283421] disabled:cursor-wait disabled:opacity-70"
      >
        {busy ? (
          <>
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            Adding…
          </>
        ) : (
          <>
            Add repository
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </>
        )}
      </button>
    </form>
  );
}
