"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Users } from "lucide-react";
import { toast } from "sonner";
import type { LinkedInImportInfo } from "@/lib/types";
import { clearLinkedIn, saveLinkedInImport } from "@/app/(applicant)/profile/actions";
import type { UploadGate } from "@/components/onboarding/readiness";
import { FileDropzone, type DropzonePhase } from "./file-dropzone";
import { formatImportCounts } from "./import-summary";
import { inspectLinkedInFiles, LINKEDIN_FILES, type LinkedInInspection } from "./linkedin-inspect";
import { animateProgress, isAbortError, sleep } from "./simulate";

const ZIP_LIMIT = 50 * 1024 * 1024;
const CSV_LIMIT = 20 * 1024 * 1024;

function inspectionFrom(info: LinkedInImportInfo): LinkedInInspection {
  return {
    filesPresent: info.filesPresent,
    counts: info.counts,
    displayNames: ["LinkedIn export"],
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
  const [inspection, setInspection] = useState<LinkedInInspection | null>(initial ? inspectionFrom(initial) : null);
  const [phase, setPhase] = useState<DropzonePhase>(initial?.status === "succeeded" ? "done" : "idle");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [removing, setRemoving] = useState(false);

  const filesPresent = inspection?.filesPresent ?? [];
  const summary = inspection ? formatImportCounts(inspection.counts) : undefined;
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
      const next = await inspectLinkedInFiles(files);
      if (controller.signal.aborted) return;
      setInspection(next);
      setPhase("uploading");
      setProgress(0);
      await animateProgress(controller.signal, setProgress, 1500);
      if (controller.signal.aborted) return;
      setPhase("processing");
      await sleep(2000, controller.signal);
      const saved = await saveLinkedInImport({ filesPresent: next.filesPresent, counts: next.counts });
      if (controller.signal.aborted) return;
      if (!saved.ok) {
        restoreOrFail(saved.error.message);
        return;
      }
      setCommitted(saved.data);
      setInspection({ ...next, displayNames: next.displayNames });
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
          <h2 className="text-body font-semibold text-foreground">Import your LinkedIn export</h2>
          <p className="mt-0.5 text-small text-muted-foreground">
            A ZIP, or any of Profile, Positions, Skills, Education, and Connections.
          </p>
        </div>
      </div>

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
        processingLabel="Parsing your export…"
        doneAnnouncement={summary}
        replaceLabel={phase === "error" ? "Retry upload" : "Replace"}
      />

      {filesPresent.length > 0 && (
        <ul className="grid grid-cols-2 gap-1.5" aria-label="LinkedIn files">
          {LINKEDIN_FILES.map((name) => {
            const present = filesPresent.includes(name);
            return (
              <li key={name} className="flex items-center gap-2 text-small">
                <span aria-hidden className={present ? "text-success" : "text-muted-foreground"}>
                  {present ? "✓" : "–"}
                </span>
                <span className={present ? "text-foreground" : "text-muted-foreground"}>{name}.csv</span>
                <span className="sr-only">{present ? "present" : "missing"}</span>
              </li>
            );
          })}
        </ul>
      )}

      {filesPresent.length > 0 && !filesPresent.includes("Connections") && (
        <p className="rounded-md bg-warning-subtle px-3 py-2 text-small text-warning-fg" role="status">
          Without Connections.csv we can&apos;t show who you know at companies.
        </p>
      )}

      <div className="space-y-2 border-t pt-3 text-small text-copy">
        <p>
          LinkedIn → Settings → Data privacy → Get a copy of your data. Select Connections, Positions, Profile, Skills
          and Education. LinkedIn usually emails it within about 10 minutes; you can upload your resume meanwhile.
        </p>
        <p>We store your connections&apos; names, companies and titles only, never their emails, and never show them to recruiters.</p>
        <p>Signing in with LinkedIn does not import your data. Upload your export here.</p>
      </div>
    </section>
  );
}
