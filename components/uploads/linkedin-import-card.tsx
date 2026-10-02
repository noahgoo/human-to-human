"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Users } from "lucide-react";
import { toast } from "sonner";
import type { LinkedInImportInfo } from "@/lib/types";
import { clearLinkedIn, importLinkedInExport } from "@/app/(applicant)/profile/actions";
import type { UploadGate } from "@/components/onboarding/readiness";
import { ONBOARDING_LINKEDIN_FILES, filesPresentLabel } from "@/lib/linkedin/onboarding-files";
import { FileDropzone, type DropzonePhase } from "./file-dropzone";
import { formatImportCounts } from "./import-summary";
import {
  inspectOnboardingLinkedInFiles,
  type OnboardingLinkedInInspection,
} from "./onboarding-linkedin-inspect";
import { isAbortError } from "./simulate";

const ZIP_LIMIT = 50 * 1024 * 1024;
const CSV_LIMIT = 20 * 1024 * 1024;

function inspectionFrom(info: LinkedInImportInfo): OnboardingLinkedInInspection {
  return {
    filesPresent: info.filesPresent.filter((f): f is (typeof ONBOARDING_LINKEDIN_FILES)[number] =>
      (ONBOARDING_LINKEDIN_FILES as readonly string[]).includes(f),
    ),
    counts: {
      connections: info.counts.connections,
      companies: info.counts.companies,
      positions: info.counts.positions,
      richMedia: info.counts.richMedia ?? 0,
    },
    displayNames: ["LinkedIn export"],
    allRequiredPresent: true,
  };
}

export function LinkedInImportCard({
  initial,
  onGateChange,
}: {
  initial: LinkedInImportInfo | null;
  onGateChange?: (gate: UploadGate) => void;
}) {
  const router = useRouter();
  const abortRef = useRef<AbortController | null>(null);
  const onGateChangeRef = useRef(onGateChange);
  onGateChangeRef.current = onGateChange;
  const [committed, setCommitted] = useState(initial);
  const committedRef = useRef(committed);
  committedRef.current = committed;
  const [inspection, setInspection] = useState<OnboardingLinkedInInspection | null>(
    initial ? inspectionFrom(initial) : null,
  );
  const [phase, setPhase] = useState<DropzonePhase>(initial?.status === "succeeded" ? "done" : "idle");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [removing, setRemoving] = useState(false);

  const filesPresent = inspection?.filesPresent ?? [];
  const summary = inspection
    ? formatImportCounts({
        connections: inspection.counts.connections,
        companies: inspection.counts.companies,
        positions: inspection.counts.positions,
        richMedia: inspection.counts.richMedia,
      })
    : undefined;
  const gate: UploadGate =
    phase === "uploading"
      ? "uploading"
      : phase === "processing"
        ? "processing"
        : committed?.status === "succeeded" && phase !== "error"
          ? "ready"
          : phase === "error"
            ? "failed"
            : "missing";

  useEffect(() => {
    onGateChangeRef.current?.(gate);
  }, [gate]);

  useEffect(() => () => abortRef.current?.abort(), []);

  async function handleFiles(files: File[]) {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setError(null);
    try {
      const next = await inspectOnboardingLinkedInFiles(files);
      if (controller.signal.aborted) return;
      setInspection(next);
      if (!next.allRequiredPresent) {
        toast.message("Missing files", {
          description: "Upload Profile, Positions, Connections, and Rich_Media before we can save to your account.",
        });
        setPhase("error");
        setError("Include all four CSV files (or a ZIP that contains them).");
        return;
      }
      setPhase("uploading");
      setProgress(25);
      const formData = new FormData();
      for (const file of files) formData.append("files", file);
      if (controller.signal.aborted) return;
      setPhase("processing");
      setProgress(60);
      const saved = await importLinkedInExport(formData);
      if (controller.signal.aborted) return;
      if (!saved.ok) {
        restoreOrFail(saved.error.message);
        return;
      }
      setCommitted(saved.data);
      setInspection({
        ...next,
        counts: {
          connections: saved.data.counts.connections,
          companies: saved.data.counts.companies,
          positions: saved.data.counts.positions,
          richMedia: saved.data.counts.richMedia ?? next.counts.richMedia,
        },
      });
      setProgress(100);
      setPhase("done");
      router.refresh();
    } catch (caught) {
      if (isAbortError(caught)) return;
      restoreOrFail(caught instanceof Error ? caught.message : "Something went wrong.");
    }
  }

  function restoreOrFail(message: string) {
    const previous = committedRef.current;
    setError(message);
    if (previous?.status === "succeeded") {
      setInspection(inspectionFrom(previous));
      setPhase("done");
      return;
    }
    setPhase("error");
  }

  async function remove() {
    abortRef.current?.abort();
    setRemoving(true);
    const result = await clearLinkedIn();
    setRemoving(false);
    if (!result.ok) {
      toast.error(result.error.message);
      return;
    }
    setCommitted(null);
    setInspection(null);
    setPhase("idle");
    setError(null);
    setProgress(0);
    router.refresh();
  }

  const shownFiles =
    phase === "idle"
      ? []
      : (inspection?.displayNames ?? []).map((name) => ({
          name,
          detail: phase === "done" ? summary : undefined,
        }));

  return (
    <section className="flex flex-col gap-4 rounded-xl border bg-card p-5 shadow-1 sm:p-6">
      <div className="flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-token/20 bg-token-subtle text-token-fg">
          <Users className="size-4" aria-hidden />
        </span>
        <div>
          <h2 className="text-body font-semibold text-foreground">Import your LinkedIn data</h2>
          <p className="mt-0.5 text-small text-muted-foreground">
            Upload Profile, Positions, Connections, and Rich_Media from your LinkedIn export (ZIP or four CSVs).
          </p>
        </div>
      </div>

      <ol className="list-decimal space-y-1 pl-5 text-small text-copy">
        <li>
          On LinkedIn, open <strong className="font-medium text-foreground">Settings &amp; Privacy → Data privacy</strong>.
        </li>
        <li>
          Choose <strong className="font-medium text-foreground">Get a copy of your data</strong> and request a{" "}
          <strong className="font-medium text-foreground">Basic LinkedIn data export</strong> (or select Profile,
          Positions, Connections, and rich media). LinkedIn usually emails a ZIP in about 10 minutes.
        </li>
        <li>Upload that ZIP here, or upload the four CSV files from inside the folder.</li>
      </ol>

      <FileDropzone
        accept={[".zip", ".csv"]}
        maxBytes={CSV_LIMIT}
        maxBytesByExtension={{ ".zip": ZIP_LIMIT, ".csv": CSV_LIMIT }}
        multiple
        phase={shownFiles.length === 0 && phase === "error" ? "idle" : phase}
        progress={progress}
        error={error}
        files={shownFiles}
        onFiles={handleFiles}
        onRemove={committed || phase === "error" ? remove : undefined}
        disabled={removing}
        idleTitle="Drag and drop your export"
        idleHint="ZIP up to 50 MB, or CSV files up to 20 MB each"
        processingLabel="Saving to your account…"
        doneAnnouncement={summary}
        replaceLabel={phase === "error" ? "Retry upload" : "Replace"}
      />

      {filesPresent.length > 0 && (
        <ul className="grid grid-cols-2 gap-1.5" aria-label="LinkedIn files">
          {ONBOARDING_LINKEDIN_FILES.map((name) => {
            const present = filesPresent.includes(name);
            return (
              <li key={name} className="flex items-center gap-2 text-small">
                <span aria-hidden className={present ? "text-success" : "text-muted-foreground"}>
                  {present ? "✓" : "–"}
                </span>
                <span className={present ? "text-foreground" : "text-muted-foreground"}>{filesPresentLabel(name)}</span>
                <span className="sr-only">{present ? "present" : "missing"}</span>
              </li>
            );
          })}
        </ul>
      )}

      <div className="space-y-2 border-t pt-3 text-small text-copy">
        <p>
          We store connection names, companies, and titles only — never emails or profile URLs — and we don&apos;t show
          connections to recruiters.
        </p>
        <p>Signing in with LinkedIn does not import your data. You need to upload your export here.</p>
      </div>
    </section>
  );
}
