import { TechnicalChip, TokenCostBadge } from "@/components/shared/chips";
import { CompanyLogo } from "@/components/shared/misc";
import { WORK_MODE_LABEL } from "@/lib/copy";
import type { TokenCost, WorkMode } from "@/lib/types";

export function JobPreviewCard({
  title,
  companyName,
  logoUrl,
  location,
  workMode,
  tokenCost,
  isTechnical,
}: {
  title: string;
  companyName: string;
  logoUrl?: string | null;
  location: string;
  workMode: WorkMode | null;
  tokenCost: TokenCost;
  isTechnical: boolean;
}) {
  const place = [location.trim(), workMode ? WORK_MODE_LABEL[workMode] : null].filter(Boolean).join(" · ");
  const heading = title.trim() || "Job title";

  return (
    <div className="rounded-xl border bg-card p-4 shadow-1">
      <div className="mb-3 flex items-center justify-between gap-2">
        <span className="text-small font-medium">Live preview</span>
        <span className="text-small text-muted-foreground">Candidate view</span>
      </div>
      <div className="rounded-xl border bg-card p-4 shadow-2">
        <div className="flex items-start gap-3">
          <CompanyLogo name={companyName || "Company"} logoUrl={logoUrl} size={40} />
          <div className="min-w-0">
            <h3 className={title.trim() ? "text-h3 leading-tight" : "text-h3 leading-tight text-muted-foreground"}>{heading}</h3>
            <p className="mt-1 text-small text-copy">
              <span className="font-medium text-foreground">{companyName || "Company"}</span>
              {place ? ` · ${place}` : null}
            </p>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <TokenCostBadge cost={tokenCost} />
          {isTechnical ? <TechnicalChip /> : null}
        </div>
      </div>
    </div>
  );
}
