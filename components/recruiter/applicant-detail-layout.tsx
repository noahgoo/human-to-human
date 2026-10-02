"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

export function ApplicantDetailLayout({
  overview,
  resume,
}: {
  overview: React.ReactNode;
  resume: React.ReactNode;
}) {
  const [tab, setTab] = useState<"overview" | "resume">("overview");

  return (
    <div>
      <div className="mb-4 flex rounded-lg bg-muted p-1 lg:hidden" role="tablist" aria-label="Application sections">
        {(
          [
            ["overview", "Overview"],
            ["resume", "Resume"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            id={`tab-${id}`}
            aria-selected={tab === id}
            aria-controls={`panel-${id}`}
            className={cn(
              "flex-1 rounded-md px-3 py-1.5 text-small outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
              tab === id ? "bg-card text-foreground shadow-1" : "text-muted-foreground",
            )}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start lg:gap-6">
        <div id="panel-overview" role="tabpanel" aria-labelledby="tab-overview" className={tab === "overview" ? "block" : "hidden lg:block"}>
          {overview}
        </div>
        <div id="panel-resume" role="tabpanel" aria-labelledby="tab-resume" className={tab === "resume" ? "block" : "hidden lg:block"}>
          {resume}
        </div>
      </div>
    </div>
  );
}
