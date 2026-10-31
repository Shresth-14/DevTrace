"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

/**
 * Repositories are now added by URL from the dashboard ("Add project"). This route
 * only exists for old links and the GitHub setup redirect; it forwards to the
 * dashboard and keeps the query string, which may carry the sign-in session.
 */
export default function ImportRedirectPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace(`/dashboard${window.location.search}`);
  }, [router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-dt-bg">
      <div role="status" className="flex items-center gap-2 text-sm text-dt-muted-text">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        Opening your dashboard…
      </div>
    </div>
  );
}
