"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { TOKEN_BALANCE_KEY } from "@/components/tokens/token-balance-pill";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { errorMessage, formatCredits } from "@/lib/copy";
import type { JobStatus, TokenBalance, TokenCost } from "@/lib/types";

export type ApplyJob = {
  id: string;
  title: string;
  companyName: string;
  tokenCost: TokenCost;
  isTechnical: boolean;
  status: JobStatus;
};

const repoFormSchema = z.object({
  githubRepoUrl: z
    .string()
    .trim()
    .min(1, "Enter a GitHub repository URL.")
    .refine(
      (value) => normalizeGithubRepoUrl(value) !== null,
      "Use a URL like https://github.com/owner/repo.",
    ),
  repoOwnershipAttested: z.boolean().refine((value) => value, "Confirm this repository is your own work, or that you are a major contributor."),
});

type RepoForm = z.infer<typeof repoFormSchema>;

export function normalizeGithubRepoUrl(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.hostname.toLowerCase() !== "github.com") return null;
  const parts = url.pathname.replace(/\/+$/, "").split("/").filter(Boolean);
  if (parts.length < 2) return null;
  const owner = parts[0];
  const repo = parts[1]?.replace(/\.git$/i, "");
  if (!owner || !repo) return null;
  if (!/^[A-Za-z0-9_.-]+$/.test(owner) || !/^[A-Za-z0-9_.-]+$/.test(repo)) return null;
  return `https://github.com/${owner}/${repo}`;
}

export function useLiveTokenBalance(initial: TokenBalance): TokenBalance {
  const { data } = useQuery({
    queryKey: TOKEN_BALANCE_KEY,
    queryFn: async () => initial,
    initialData: initial,
    staleTime: Infinity,
  });
  return data ?? initial;
}

function formatUtc(iso: string, withYear: boolean) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: withYear ? "numeric" : undefined,
    timeZone: "UTC",
  }).format(new Date(iso));
}

export function insufficientCreditsCopy(cost: number, balance: number, resetsAt: string) {
  const need = cost === 1 ? "1 credit" : `${cost} credits`;
  return `You need ${need}; you have ${balance}. Credits reset on ${formatUtc(resetsAt, false)}.`;
}

async function readApiError(response: Response): Promise<{ code: string; message: string }> {
  try {
    const body = (await response.json()) as { error?: { code?: string; message?: string } };
    const code = body.error?.code ?? "INTERNAL";
    return { code, message: body.error?.message ?? errorMessage(code) };
  } catch {
    return { code: "INTERNAL", message: errorMessage("INTERNAL") };
  }
}

export function ApplyDialog({
  job,
  balance: initialBalance,
  open,
  onOpenChange,
}: {
  job: ApplyJob;
  balance: TokenBalance;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const balance = useLiveTokenBalance(initialBalance);
  const keyRef = useRef("");
  const repoAtKey = useRef("");
  const prevOpen = useRef(false);
  const [step, setStep] = useState<"repo" | "confirm">(job.isTechnical ? "repo" : "confirm");
  const [formError, setFormError] = useState<string | null>(null);

  const form = useForm<RepoForm>({
    resolver: zodResolver(repoFormSchema),
    defaultValues: { githubRepoUrl: "", repoOwnershipAttested: false },
    mode: "onBlur",
    reValidateMode: "onChange",
  });

  const repoUrl = form.watch("githubRepoUrl");

  useEffect(() => {
    if (open && !prevOpen.current) {
      keyRef.current = crypto.randomUUID();
      repoAtKey.current = "";
      setStep(job.isTechnical ? "repo" : "confirm");
      setFormError(null);
      form.reset({ githubRepoUrl: "", repoOwnershipAttested: false });
    }
    prevOpen.current = open;
  }, [open, job.isTechnical, form]);

  useEffect(() => {
    if (!open) return;
    if (repoUrl === repoAtKey.current) return;
    keyRef.current = crypto.randomUUID();
    repoAtKey.current = repoUrl;
  }, [repoUrl, open]);

  const mutation = useMutation({
    mutationFn: async (githubRepoUrl: string | null) => {
      const response = await fetch("/api/v1/applications", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": keyRef.current,
        },
        body: JSON.stringify({
          jobId: job.id,
          githubRepoUrl,
          expectedTokenCost: job.tokenCost,
          repoOwnershipAttested: job.isTechnical ? true : undefined,
        }),
      });
      if (!response.ok) {
        const err = await readApiError(response);
        throw Object.assign(new Error(err.message), { code: err.code });
      }
      return (await response.json()) as { applicationId: string; balanceAfter: number };
    },
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: TOKEN_BALANCE_KEY });
      const prev = queryClient.getQueryData<TokenBalance>(TOKEN_BALANCE_KEY);
      queryClient.setQueryData<TokenBalance>(TOKEN_BALANCE_KEY, (current) =>
        current
          ? { ...current, balance: current.balance - job.tokenCost, spent: current.spent + job.tokenCost }
          : current,
      );
      return { prev };
    },
    onError: (error, _vars, context) => {
      if (context?.prev) queryClient.setQueryData(TOKEN_BALANCE_KEY, context.prev);
      const code = (error as { code?: string }).code ?? "INTERNAL";
      const message = errorMessage(code);
      if (code === "REPO_NOT_ACCESSIBLE") {
        setStep("repo");
        form.setError("githubRepoUrl", { message });
      }
      if (code === "JOB_NOT_OPEN") {
        onOpenChange(false);
        router.refresh();
      }
      setFormError(message);
    },
    onSuccess: (data, _vars, context) => {
      queryClient.setQueryData<TokenBalance>(TOKEN_BALANCE_KEY, (current) => {
        if (context?.prev) {
          return { ...context.prev, balance: data.balanceAfter, spent: context.prev.spent + job.tokenCost };
        }
        return current ? { ...current, balance: data.balanceAfter } : current;
      });
      toast.success(`Application sent: ${formatCredits(job.tokenCost)} spent`);
      router.push(`/applications/${data.applicationId}`);
      router.refresh();
    },
  });

  const pending = mutation.isPending;
  const balanceSnapshot = useRef(balance);
  if (!pending) balanceSnapshot.current = balance;
  const quoted = balanceSnapshot.current;
  const normalizedRepo = normalizeGithubRepoUrl(repoUrl);
  const balanceAfter = quoted.balance - job.tokenCost;
  const resetLabel = formatUtc(quoted.resetsAt, true);

  function submitApplication() {
    setFormError(null);
    mutation.mutate(job.isTechnical ? normalizedRepo : null);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && pending) return;
        onOpenChange(next);
      }}
    >
      <DialogContent
        className="sm:max-w-lg"
        showCloseButton={!pending}
        onEscapeKeyDown={(event) => {
          if (pending) event.preventDefault();
        }}
        onPointerDownOutside={(event) => {
          if (pending) event.preventDefault();
        }}
        onInteractOutside={(event) => {
          if (pending) event.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle>{step === "repo" ? "Share a repository" : "Confirm"}</DialogTitle>
          <DialogDescription>
            {step === "repo"
              ? "Public GitHub repos only. Our AI reads the code statically and never runs it."
              : `${job.title} at ${job.companyName}`}
          </DialogDescription>
        </DialogHeader>

        {formError && (
          <Alert variant="destructive">
            <AlertDescription>{formError}</AlertDescription>
          </Alert>
        )}

        {step === "repo" ? (
          <form
            className="space-y-4"
            onSubmit={form.handleSubmit(() => {
              setFormError(null);
              setStep("confirm");
            })}
          >
            <div className="space-y-1.5">
              <Label htmlFor="github-repo-url">GitHub repository URL</Label>
              <Input
                id="github-repo-url"
                placeholder="https://github.com/owner/repo"
                autoComplete="off"
                aria-invalid={Boolean(form.formState.errors.githubRepoUrl)}
                aria-describedby="github-repo-help"
                className="h-[38px] rounded-md font-mono"
                {...form.register("githubRepoUrl")}
              />
              {form.formState.errors.githubRepoUrl && (
                <p className="text-small text-destructive" role="alert">
                  {form.formState.errors.githubRepoUrl.message}
                </p>
              )}
              <p id="github-repo-help" className="text-small text-muted-foreground">
                Public GitHub repos only. Our AI reads the code statically and never runs it. Ratings are shared with
                the recruiter only; you won&apos;t see them.
              </p>
            </div>
            <div className="space-y-1.5">
              <div className="flex items-start gap-2">
                <Controller
                  name="repoOwnershipAttested"
                  control={form.control}
                  render={({ field }) => (
                    <Checkbox
                      id="repo-ownership"
                      checked={field.value}
                      onCheckedChange={(checked) => field.onChange(checked === true)}
                      aria-invalid={Boolean(form.formState.errors.repoOwnershipAttested)}
                      aria-describedby={form.formState.errors.repoOwnershipAttested ? "repo-ownership-error" : undefined}
                    />
                  )}
                />
                <Label htmlFor="repo-ownership" className="text-body leading-snug font-normal text-copy">
                  This repository is my own work, or I am a major contributor
                </Label>
              </div>
              {form.formState.errors.repoOwnershipAttested && (
                <p id="repo-ownership-error" className="text-small text-destructive" role="alert">
                  {form.formState.errors.repoOwnershipAttested.message}
                </p>
              )}
            </div>
            <div className="flex justify-end">
              <Button type="submit">Next</Button>
            </div>
          </form>
        ) : (
          <div className="space-y-4">
            <dl className="space-y-2 rounded-xl border border-border bg-muted/60 p-4 text-body">
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Role</dt>
                <dd className="text-right font-medium text-foreground">{job.title}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Company</dt>
                <dd className="text-right font-medium text-foreground">{job.companyName}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Cost</dt>
                <dd className="text-right font-medium text-foreground tabular-nums">{formatCredits(job.tokenCost)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Balance after</dt>
                <dd className="text-right font-medium text-foreground tabular-nums">
                  {balanceAfter} of {balance.total}
                </dd>
              </div>
              {normalizedRepo && (
                <div className="space-y-1">
                  <dt className="text-muted-foreground">Repository</dt>
                  <dd className="font-mono text-code break-all text-foreground">{normalizedRepo}</dd>
                </div>
              )}
            </dl>
            <p className="text-small text-muted-foreground">
              Credits reset {resetLabel} (UTC) and don&apos;t roll over.
            </p>
            <p className="text-small text-copy">
              An AI estimate is shared with the recruiter, and a human makes every decision.
            </p>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              {job.isTechnical && (
                <Button type="button" variant="outline" onClick={() => setStep("repo")} disabled={pending}>
                  Back
                </Button>
              )}
              <Button type="button" onClick={submitApplication} disabled={pending} aria-busy={pending}>
                {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
                Spend {formatCredits(job.tokenCost)} & apply
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
