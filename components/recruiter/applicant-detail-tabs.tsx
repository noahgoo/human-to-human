"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

export function ApplicantDetailTabs({ overview, resume }: { overview: React.ReactNode; resume: React.ReactNode }) {
  const [tab, setTab] = useState<"overview" | "resume">("overview");
  return (
    <div>
      <div className="mb-4 grid grid-cols-2 rounded-lg bg-muted p-1 lg:hidden" role="tablist" aria-label="Application sections">
        {(["overview", "resume"] as const).map((value) => (
          <button
            key={value}
            type="button"
            role="tab"
            id={`applicant-tab-${value}`}
            aria-selected={tab === value}
            aria-controls={`applicant-panel-${value}`}
            className={cn(
              "rounded-md px-3 py-1.5 text-small capitalize focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
              tab === value ? "bg-card text-foreground shadow-1" : "text-muted-foreground",
            )}
            onClick={() => setTab(value)}
          >
            {value === "overview" ? "Overview" : "Resume"}
          </button>
        ))}
      </div>
      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(280px,380px)] lg:items-start lg:gap-6">
        <div id="applicant-panel-overview" role="tabpanel" aria-labelledby="applicant-tab-overview" className={tab === "resume" ? "hidden lg:block" : undefined}>
          {overview}
        </div>
        <div id="applicant-panel-resume" role="tabpanel" aria-labelledby="applicant-tab-resume" className={tab === "overview" ? "hidden lg:block" : undefined}>
          {resume}
        </div>
      </div>
    </div>
  );
}
