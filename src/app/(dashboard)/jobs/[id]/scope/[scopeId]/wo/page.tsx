"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";

/**
 * Legacy route — redirects to the scope page with ?expand= param.
 * Keeps old bookmarks, external links, and browser history working.
 */
export default function ScopeWorkOrdersRedirect() {
  const params = useParams();
  const jobId = params.id;
  const scopeId = params.scopeId;
  const router = useRouter();

  useEffect(() => {
    const search = window.location.search;
    const expandParam = new URLSearchParams(search).get("expand");
    const target = `/jobs/${jobId}/scope/${scopeId}${expandParam ? `?expand=${expandParam}` : ""}`;
    router.replace(target);
  }, [jobId, scopeId, router]);

  return (
    <div className="flex items-center justify-center h-64 text-muted text-sm animate-pulse">
      Redirecting...
    </div>
  );
}
