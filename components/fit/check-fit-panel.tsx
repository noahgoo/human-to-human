"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { Check, Minus, X } from "lucide-react";
import { ApplyDialog, insufficientCreditsCopy, useLiveTokenBalance, type ApplyJob } from "@/components/applications/apply-dialog";
import { ConnectionsCallout, type ConnectionPerson } from "@/components/fit/connections-callout";
import { StatusChip, MatchScoreBadge } from "@/components/shared/chips";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { errorMessage, formatCredits } from "@/lib/copy";
import type { ApplicationStatus, FitEvaluation, FitRequirement, TokenBalance } from "@/lib/types";

type Phase = "idle" | "pending" | "result" | "failed" | "timeout";

type FitDto = Pick<
  FitEvaluation,
  "id" | "jobId" | "status" | "confidenceScore" | "band" | "explanation" | "requirements" | "createdAt"
>;

const MET_LABEL: Record<FitRequirement["met"], string> = {
  yes: "Met",
  partial: "Partial",
  no: "Not met",
};

function RequirementIcon({ met }: { met: FitRequirement["met"] }) {
  if (met === "yes") return <Check className="size-4 text-success" aria-hidden />;
  if (met === "partial") return <Minus className="size-4 text-warning-fg" aria-hidden />;
  return <X className="size-4 text-muted-foreground" aria-hidden />;
}

async function readApiError(response: Response) {
  try {
    const body = (await response.json()) as { error?: { code?: string; message?: string } };
    const code = body.error?.code ?? "INTERNAL";
    return { code, message: body.error?.message ?? errorMessage(code) };
  } catch {
    return { code: "INTERNAL", message: errorMessage("INTERNAL") };
  }
}

function toDto(fit: FitEvaluation): FitDto {
  return {
    id: fit.id,
    jobId: fit.jobId,
    status: fit.status,
    confidenceScore: fit.confidenceScore,
    band: fit.band,
    explanation: fit.explanation,
    requirements: fit.requirements,
    createdAt: fit.createdAt,
  };
}

export function CheckFitPanel({
  job,
  initial,
  balance: initialBalance,
  applied,
  hasLinkedInImport,
  showHeading = true,
}: {
  job: ApplyJob;
  initial: FitEvaluation | null;
  balance: TokenBalance;
  applied: { applicationId: string; status: ApplicationStatus } | null;
  hasLinkedInImport: boolean;
  showHeading?: boolean;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const balance = useLiveTokenBalance(initialBalance);
  const ready = initial?.status === "succeeded" && initial.confidenceScore != null;
  const [phase, setPhase] = useState<Phase>(ready ? "result" : "idle");
  const [evaluation, setEvaluation] = useState<FitDto | null>(ready && initial ? toDto(initial) : null);
  const [evalId, setEvalId] = useState<string | null>(null);
  const [connectionsOn, setConnectionsOn] = useState(Boolean(ready));
  const [applyOpen, setApplyOpen] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const startedAt = useRef(0);
  const refreshed = useRef(false);

  const connections = useQuery({
    queryKey: ["job-connections", job.id],
    enabled: connectionsOn,
    retry: false,
    staleTime: 60_000,
    queryFn: async () => {
      const response = await fetch(`/api/v1/jobs/${job.id}/connections`, { cache: "no-store" });
      if (!response.ok) throw new Error("connections");
      return (await response.json()) as { data: ConnectionPerson[]; total: number };
    },
  });

  const poll = useQuery({
    queryKey: ["fit-evaluation", evalId],
    enabled: phase === "pending" && Boolean(evalId),
    retry: false,
    queryFn: async () => {
      const response = await fetch(`/api/v1/fit-evaluations/${evalId}`, { cache: "no-store" });
      if (!response.ok) {
        const err = await readApiError(response);
        throw Object.assign(new Error(err.message), { code: err.code });
      }
      return (await response.json()) as FitDto;
    },
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      if (status === "succeeded" || status === "failed") return false;
      if (startedAt.current && Date.now() - startedAt.current >= 60_000) return false;
      return 1000;
    },
    refetchIntervalInBackground: false,
  });

  useEffect(() => {
    if (phase !== "pending" || !poll.data || !evalId || poll.data.id !== evalId) return;
    if (poll.data.status === "succeeded") {
      setEvaluation(poll.data);
      setPhase("result");
      if (!refreshed.current) {
        refreshed.current = true;
        router.refresh();
      }
    } else if (poll.data.status === "failed") {
      setPhase("failed");
      setErrorText("Couldn't check fit");
    }
  }, [evalId, poll.data, phase, router]);

  useEffect(() => {
    if (phase !== "pending") return;
    const remaining = Math.max(0, 60_000 - (Date.now() - startedAt.current));
    const timer = window.setTimeout(() => {
      setPhase((current) => (current === "pending" ? "timeout" : current));
    }, remaining);
    return () => window.clearTimeout(timer);
  }, [phase, evalId]);

  useEffect(() => {
    if (poll.isError && phase === "pending") {
      setPhase("failed");
      setErrorText("Couldn't check fit");
    }
  }, [poll.isError, phase]);

  async function start(recheck: boolean) {
    setPhase("pending");
    setErrorText(null);
    setConnectionsOn(true);
    setEvalId(null);
    startedAt.current = Date.now();
    refreshed.current = false;
    const connectionsPromise = queryClient
      .fetchQuery({
        queryKey: ["job-connections", job.id],
        staleTime: 60_000,
        queryFn: async () => {
          const response = await fetch(`/api/v1/jobs/${job.id}/connections`, { cache: "no-store" });
          if (!response.ok) throw new Error("connections");
          return (await response.json()) as { data: ConnectionPerson[]; total: number };
        },
      })
      .catch(() => null);

    try {
      const [response] = await Promise.all([
        fetch(`/api/v1/jobs/${job.id}/fit-evaluations`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ recheck }),
        }),
        connectionsPromise,
      ]);
      if (response.status === 200) {
        const data = (await response.json()) as FitDto;
        setEvaluation(data);
        setPhase("result");
        if (!refreshed.current) {
          refreshed.current = true;
          router.refresh();
        }
        return;
      }
      if (response.status === 202) {
        const data = (await response.json()) as { id: string };
        setEvalId(data.id);
        return;
      }
      const err = await readApiError(response);
      setPhase("failed");
      setErrorText(err.message || "Couldn't check fit");
    } catch {
      setPhase("failed");
      setErrorText("Couldn't check fit");
    }
  }

  const blocked = applied
    ? null
    : job.status !== "open"
      ? "This job is no longer accepting applications."
      : balance.balance < job.tokenCost
        ? insufficientCreditsCopy(job.tokenCost, balance.balance, balance.resetsAt)
        : null;

  const showConnections = connectionsOn && phase !== "idle";
  const callout = showConnections ? (
    <ConnectionsCallout
      connections={connections.data?.data ?? []}
      total={connections.data?.total ?? 0}
      companyName={job.companyName}
      hasLinkedInImport={hasLinkedInImport}
      isLoading={connections.isLoading}
      isError={connections.isError}
    />
  ) : null;

  return (
    <div className="space-y-4">
      {showHeading && <h2 className="text-h2">Check fit</h2>}

      {phase === "idle" && (
        <div className="space-y-3">
          <p className="text-body text-copy">
            Checking your fit is free. Credits are only spent when you apply. We compare your resume and LinkedIn
            export with this role&apos;s requirements.
          </p>
          <Button type="button" variant="secondary" onClick={() => void start(false)}>
            Check fit
          </Button>
        </div>
      )}

      {phase === "pending" && (
        <div className="space-y-3">
          <Skeleton className="h-10 w-44 rounded-full" />
          <Skeleton className="h-16 w-full" />
          <p className="text-body text-copy" aria-live="polite">
            Comparing your resume and LinkedIn to the requirements…
          </p>
          {callout}
        </div>
      )}

      {(phase === "failed" || phase === "timeout") && (
        <div className="space-y-3" aria-live="polite">
          <p className="text-body font-medium text-foreground">
            {phase === "timeout" ? "This is taking longer than usual." : "Couldn't check fit"}
          </p>
          {phase === "failed" && errorText && errorText !== "Couldn't check fit" && (
            <p className="text-small text-muted-foreground">{errorText}</p>
          )}
          <Button type="button" variant="secondary" onClick={() => void start(true)}>
            Retry
          </Button>
          {callout}
        </div>
      )}

      {phase === "result" && evaluation && (
        <div className="space-y-4">
          <MatchScoreBadge score={evaluation.confidenceScore} status="succeeded" size="lg" />
          {evaluation.explanation && (
            <p className="text-body whitespace-pre-line text-copy">{evaluation.explanation}</p>
          )}
          {evaluation.requirements.length > 0 && (
            <ul className="space-y-2">
              {evaluation.requirements.map((item) => (
                <li key={item.requirement} className="flex gap-2 text-body text-copy">
                  <span className="mt-0.5">
                    <RequirementIcon met={item.met} />
                  </span>
                  <span>
                    <span className="sr-only">{MET_LABEL[item.met]}: </span>
                    <span className="text-foreground">{item.requirement}</span>
                    <span className="ml-2 text-small text-muted-foreground">{MET_LABEL[item.met]}</span>
                    {item.evidence && <span className="mt-0.5 block text-small text-muted-foreground">{item.evidence}</span>}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {callout}
          <p className="text-small text-muted-foreground">
            Checked {formatDistanceToNow(new Date(evaluation.createdAt), { addSuffix: true })}
            {" · "}
            <button
              type="button"
              onClick={() => void start(true)}
              className="font-medium text-link underline-offset-4 hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
            >
              Re-check
            </button>
          </p>
          <p className="text-small text-muted-foreground">
            AI estimate based on your resume and LinkedIn export. Recruiters see their own evaluation.
          </p>
          {applied ? (
            <div className="flex flex-wrap items-center gap-2">
              <StatusChip status={applied.status} audience="applicant" />
              <Button variant="link" size="sm" asChild>
                <Link href={`/applications/${applied.applicationId}`}>View application</Link>
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              <Button type="button" onClick={() => setApplyOpen(true)} disabled={Boolean(blocked)}>
                Apply · {formatCredits(job.tokenCost)}
              </Button>
              {blocked && <p className="text-small text-muted-foreground">{blocked}</p>}
            </div>
          )}
        </div>
      )}

      <div aria-live="polite" className="sr-only">
        {phase === "result" && evaluation?.confidenceScore != null
          ? `Fit check complete. Score ${Math.round(evaluation.confidenceScore)}.`
          : ""}
      </div>

      <ApplyDialog job={job} balance={initialBalance} open={applyOpen} onOpenChange={setApplyOpen} />
    </div>
  );
}
