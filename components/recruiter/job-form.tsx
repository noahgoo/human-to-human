"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { archiveJob, closeJob, createJob, updateJob } from "@/app/(recruiter)/recruiter/jobs/actions";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { REPO_CATEGORY_LABEL, WORK_MODE_LABEL } from "@/lib/copy";
import type { JobStatus, RepoCategory, WorkMode } from "@/lib/types";
import { cn } from "@/lib/utils";
import { archiveJobCopy, closeJobCopy, JobConfirmDialog } from "./job-confirm-dialog";
import { JobPreviewCard } from "./job-preview-card";
import { jobInputSchema, type JobInput } from "./job-schema";
import { TokenCostSelector } from "./token-cost-selector";

const CATEGORIES: RepoCategory[] = ["security", "organization", "performance", "testing"];
const WORK_MODES: WorkMode[] = ["remote", "hybrid", "onsite"];
const LOCK_NOTE = "Cost is locked once candidates have applied. Close this job and post a new one to change it.";

type BaseProps = {
  verified: boolean;
  companyName: string;
  logoUrl?: string | null;
  defaultValues: JobInput;
  locked: boolean;
  unactedCount?: number;
};

type Props = BaseProps & ({ mode: "create" } | { mode: "edit"; jobId: string; status: JobStatus });

export function JobForm(props: Props) {
  const router = useRouter();
  const [pending, setPending] = useState<"draft" | "publish" | null>(null);
  const [confirm, setConfirm] = useState<"close" | "archive" | null>(null);
  const form = useForm<JobInput>({
    resolver: zodResolver(jobInputSchema),
    defaultValues: props.defaultValues,
  });
  const { control, register, handleSubmit, watch, setError, formState } = form;
  const values = watch();
  const status = props.mode === "edit" ? props.status : "draft";
  const archived = status === "archived";
  const draftDisabled = props.mode === "edit" && status !== "draft";

  async function save(intent: "draft" | "publish", input: JobInput) {
    setPending(intent);
    try {
      const payload = props.locked
        ? { ...input, tokenCost: props.defaultValues.tokenCost, isTechnical: props.defaultValues.isTechnical }
        : input;
      const result =
        props.mode === "create"
          ? await createJob(payload, intent)
          : await updateJob(props.jobId, payload, intent);
      if (!result.ok) {
        if (result.error.fields) {
          for (const [key, message] of Object.entries(result.error.fields)) {
            setError(key as keyof JobInput, { message });
          }
        }
        toast.error(result.error.message);
        return;
      }
      const published = intent === "publish";
      toast.success(!published ? "Draft saved." : props.mode === "edit" && status === "open" ? "Changes saved." : "Job published.");
      router.push(published ? `/recruiter/jobs/${result.data.id}` : "/recruiter/jobs");
    } catch {
      toast.error("Something went wrong on our side.");
    } finally {
      setPending(null);
    }
  }

  async function runLifecycle(kind: "close" | "archive") {
    if (props.mode !== "edit") return;
    const result = kind === "close" ? await closeJob(props.jobId) : await archiveJob(props.jobId);
    if (!result.ok) {
      toast.error(result.error.message);
      return;
    }
    toast.success(kind === "close" ? "Job closed." : "Job archived.");
    setConfirm(null);
    router.push("/recruiter/jobs");
    router.refresh();
  }

  return (
    <div className="grid items-start gap-6 lg:grid-cols-12">
      <div className="flex flex-col gap-4 lg:col-span-8">
        <FormSection step="1" title="Role overview">
          <Field label="Job title" htmlFor="job-title" error={formState.errors.title?.message}>
            <Input
              id="job-title"
              placeholder="Staff Infrastructure Engineer"
              className="h-[38px] rounded-md"
              aria-invalid={!!formState.errors.title}
              {...register("title")}
            />
          </Field>
          <Field label="Location" htmlFor="location" optional error={formState.errors.location?.message}>
            <Input
              id="location"
              placeholder="Austin, TX"
              className="h-[38px] rounded-md"
              aria-invalid={!!formState.errors.location}
              {...register("location")}
            />
          </Field>
          <fieldset className="flex flex-col gap-2">
            <legend className="text-sm font-medium">Work mode</legend>
            <Controller
              control={control}
              name="workMode"
              render={({ field }) => (
                <RadioGroup
                  value={field.value}
                  onValueChange={field.onChange}
                  className="grid grid-cols-1 gap-2 sm:grid-cols-3"
                  aria-invalid={!!formState.errors.workMode}
                >
                  {WORK_MODES.map((mode) => (
                    <label
                      key={mode}
                      className={cn(
                        "flex cursor-pointer items-center gap-2 rounded-md border bg-card px-3 py-2 text-small shadow-1",
                        field.value === mode && "border-border-strong bg-muted",
                      )}
                    >
                      <RadioGroupItem value={mode} id={`work-mode-${mode}`} />
                      {WORK_MODE_LABEL[mode]}
                    </label>
                  ))}
                </RadioGroup>
              )}
            />
            {formState.errors.workMode && <p className="text-small text-destructive">{formState.errors.workMode.message}</p>}
          </fieldset>
        </FormSection>

        <FormSection step="2" title="Description & requirements">
          <Field
            label="Description"
            htmlFor="description"
            error={formState.errors.description?.message}
            hint="Plain text or Markdown. At least 50 characters."
            count={<CharCount id="description-count" value={values.description ?? ""} max={20_000} />}
          >
            <Textarea
              id="description"
              rows={8}
              className="min-h-40 rounded-md"
              aria-invalid={!!formState.errors.description}
              aria-describedby="description-count"
              {...register("description")}
            />
          </Field>
          <Field
            label="Requirements"
            htmlFor="requirements"
            error={formState.errors.requirements?.message}
            hint="One requirement per line."
            count={<CharCount id="requirements-count" value={values.requirements ?? ""} max={10_000} />}
          >
            <Textarea
              id="requirements"
              rows={6}
              className="min-h-32 rounded-md"
              aria-invalid={!!formState.errors.requirements}
              aria-describedby="requirements-count"
              {...register("requirements")}
            />
          </Field>
        </FormSection>

        <FormSection step="3" title="Technical screening">
          <Controller
            control={control}
            name="isTechnical"
            render={({ field }) => (
              <div className="flex flex-col gap-3">
                <div className="flex items-start gap-3 rounded-lg bg-muted p-4">
                  <Checkbox
                    id="technical-role"
                    className="mt-0.5"
                    checked={field.value}
                    disabled={props.locked}
                    onCheckedChange={(checked) => field.onChange(checked === true)}
                  />
                  <div>
                    <Label htmlFor="technical-role">Technical role</Label>
                    <p className="mt-1 text-small text-copy">
                      Require a public GitHub repo. AI rates Security, Organization, Performance, Testing (1–10). Applicants don&apos;t see ratings.
                    </p>
                  </div>
                </div>
                {field.value && (
                  <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {CATEGORIES.map((category) => (
                      <li key={category} className="rounded-md border bg-card px-3 py-2 text-small">
                        {REPO_CATEGORY_LABEL[category]}
                        <span className="mt-0.5 block text-code text-muted-foreground">1–10</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          />
        </FormSection>

        <FormSection step="4" title="Credit cost">
          <Controller
            control={control}
            name="tokenCost"
            render={({ field }) => (
              <TokenCostSelector
                value={field.value}
                onChange={field.onChange}
                disabled={props.locked}
                describedBy="credit-cost-help"
              />
            )}
          />
          <p id="credit-cost-help" className="text-small text-copy">
            Higher cost means fewer, more deliberate applications. Applicants get 10 credits a month.
          </p>
          {props.locked && <p className="text-small text-warning-fg">{LOCK_NOTE}</p>}
        </FormSection>
      </div>

      <aside className="flex flex-col gap-4 lg:sticky lg:top-24 lg:col-span-4">
        <JobPreviewCard
          title={values.title ?? ""}
          companyName={props.companyName}
          logoUrl={props.logoUrl}
          location={values.location ?? ""}
          workMode={values.workMode ?? null}
          tokenCost={values.tokenCost ?? 2}
          isTechnical={!!values.isTechnical}
        />
        <div className="flex flex-col gap-2 rounded-xl border bg-card p-4 shadow-1">
          <PublishButton
            verified={props.verified && !archived}
            pending={pending === "publish"}
            disabledReason={archived ? "Archived jobs stay archived." : "Verify your company before you can publish."}
            onClick={() => void handleSubmit((input) => save("publish", input))()}
          />
          {!props.verified && !archived && (
            <p className="text-small text-copy">Publish is unavailable until your company is verified.</p>
          )}
          <Button
            type="button"
            variant="outline"
            className="w-full"
            disabled={!!pending || draftDisabled || archived}
            onClick={() => void handleSubmit((input) => save("draft", input))()}
          >
            {pending === "draft" ? "Saving…" : "Save as draft"}
          </Button>
          {draftDisabled && !archived && (
            <p className="text-small text-copy">Published jobs stay published. Close the job to stop new applications.</p>
          )}
          {props.mode === "edit" && (status === "open" || status === "closed") && (
            <div className="mt-2 flex flex-col gap-2 border-t pt-3">
              {status === "open" && (
                <Button type="button" variant="outline" onClick={() => setConfirm("close")}>
                  Close job
                </Button>
              )}
              <Button type="button" variant="outline" onClick={() => setConfirm("archive")}>
                Archive job
              </Button>
            </div>
          )}
        </div>
      </aside>

      {props.mode === "edit" && (
        <>
          <JobConfirmDialog
            open={confirm === "close"}
            onOpenChange={(open) => setConfirm(open ? "close" : null)}
            title="Close this job?"
            description={closeJobCopy()}
            confirmLabel="Close job"
            onConfirm={() => runLifecycle("close")}
          />
          <JobConfirmDialog
            open={confirm === "archive"}
            onOpenChange={(open) => setConfirm(open ? "archive" : null)}
            title="Archive this job?"
            description={archiveJobCopy(props.unactedCount ?? 0)}
            confirmLabel="Archive job"
            onConfirm={() => runLifecycle("archive")}
          />
        </>
      )}
    </div>
  );
}

function PublishButton({
  verified,
  pending,
  disabledReason,
  onClick,
}: {
  verified: boolean;
  pending: boolean;
  disabledReason: string;
  onClick: () => void;
}) {
  const button = (
    <Button type="button" size="lg" className="w-full" disabled={!verified || pending} onClick={onClick}>
      {pending ? "Publishing…" : "Publish"}
    </Button>
  );
  if (verified) return button;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex w-full rounded-md focus-visible:ring-3 focus-visible:ring-ring/50" tabIndex={0}>
          {button}
        </span>
      </TooltipTrigger>
      <TooltipContent>{disabledReason}</TooltipContent>
    </Tooltip>
  );
}

function FormSection({ step, title, children }: { step: string; title: string; children: React.ReactNode }) {
  return (
    <section className="overflow-hidden rounded-xl border bg-card shadow-1">
      <div className="flex items-center gap-2 bg-muted/70 px-5 py-3">
        <span className="flex size-6 items-center justify-center rounded-md bg-primary text-code text-primary-foreground">{step}</span>
        <h2 className="text-h3">{title}</h2>
      </div>
      <div className="flex flex-col gap-4 p-5">{children}</div>
    </section>
  );
}

function Field({
  label,
  htmlFor,
  optional,
  error,
  hint,
  count,
  children,
}: {
  label: string;
  htmlFor: string;
  optional?: boolean;
  error?: string;
  hint?: string;
  count?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <Label htmlFor={htmlFor}>
          {label}
          {optional && <span className="font-normal text-muted-foreground"> (optional)</span>}
        </Label>
        {count}
      </div>
      {children}
      {hint && !error && <p className="text-small text-muted-foreground">{hint}</p>}
      {error && <p className="text-small text-destructive">{error}</p>}
    </div>
  );
}

function CharCount({ id, value, max }: { id: string; value: string; max: number }) {
  const count = value.length;
  return (
    <span id={id} className={cn("text-code tabular-nums", count > max ? "text-destructive" : "text-muted-foreground")}>
      {count.toLocaleString()} / {max.toLocaleString()}
    </span>
  );
}
