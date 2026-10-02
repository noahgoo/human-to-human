"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FileText } from "lucide-react";
import { toast } from "sonner";
import type { ResumeInfo } from "@/lib/types";
import { clearResume, saveResume } from "@/app/(applicant)/profile/actions";
import type { UploadGate } from "@/components/onboarding/readiness";
import { FileDropzone, formatBytes, type DropzonePhase } from "./file-dropzone";
import { animateProgress, isAbortError, sleep } from "./simulate";

const RESUME_LIMIT = 5 * 1024 * 1024;
const FAILED_COPY = "We couldn't read this file. Try exporting it as PDF.";

export function ResumeCard({
  initial,
  onGateChange,
}: {
  initial: ResumeInfo | null;
  onGateChange?: (gate: UploadGate) => void;
}) {
  const router = useRouter();
  const abortRef = useRef<AbortController | null>(null);
  const onGateChangeRef = useRef(onGateChange);
  onGateChangeRef.current = onGateChange;
  const [committed, setCommitted] = useState(initial);
  const committedRef = useRef(committed);
  committedRef.current = committed;
  const [phase, setPhase] = useState<DropzonePhase>(
    initial?.parseStatus === "succeeded" ? "done" : initial?.parseStatus === "failed" ? "error" : "idle",
  );
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(initial?.parseStatus === "failed" ? FAILED_COPY : null);
  const [pendingName, setPendingName] = useState<string | null>(null);
  const [removing, setRemoving] = useState(false);

  const gate: UploadGate =
    phase === "uploading"
      ? "uploading"
      : phase === "processing"
        ? "processing"
        : phase === "error" || committed?.parseStatus === "failed"
          ? "failed"
          : committed?.parseStatus === "succeeded"
            ? "ready"
            : "missing";

  useEffect(() => {
    onGateChangeRef.current?.(gate);
  }, [gate]);

  useEffect(() => () => abortRef.current?.abort(), []);

  async function handleFiles(files: File[]) {
    const file = files[0];
    if (!file) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setError(null);
    setPendingName(file.name);
    setPhase("uploading");
    setProgress(0);
    try {
      await animateProgress(controller.signal, setProgress, 1000);
      if (controller.signal.aborted) return;
      setPhase("processing");
      await sleep(1200, controller.signal);
      const saved = await saveResume({ fileName: file.name, sizeBytes: file.size });
      if (controller.signal.aborted) return;
      if (!saved.ok) {
        setError(saved.error.message);
        setPhase(committedRef.current?.parseStatus === "succeeded" ? "done" : "error");
        return;
      }
      setCommitted(saved.data);
      if (saved.data.parseStatus === "failed") {
        setPhase("error");
        setError(FAILED_COPY);
        return;
      }
      setPhase("done");
      setError(null);
      router.refresh();
    } catch (caught) {
      if (isAbortError(caught)) return;
      setPhase("error");
      setError(caught instanceof Error ? caught.message : "Something went wrong.");
    }
  }

  async function remove() {
    abortRef.current?.abort();
    setRemoving(true);
    const result = await clearResume();
    setRemoving(false);
    if (!result.ok) {
      toast.error(result.error.message);
      return;
    }
    setCommitted(null);
    setPendingName(null);
    setPhase("idle");
    setError(null);
    setProgress(0);
    router.refresh();
  }

  const fileName = pendingName ?? committed?.fileName ?? null;
  const shown =
    fileName && phase !== "idle"
      ? [
          {
            name: fileName,
            detail:
              phase === "done" && committed
                ? `${formatBytes(committed.sizeBytes)} · Uploaded`
                : phase === "error"
                  ? "Couldn’t read this file"
                  : undefined,
          },
        ]
      : [];

  return (
    <section className="flex flex-col gap-4 rounded-xl border bg-card p-5 shadow-1 sm:p-6">
      <div className="flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border bg-muted text-foreground">
          <FileText className="size-4" aria-hidden />
        </span>
        <div>
          <h2 className="text-body font-semibold text-foreground">Resume</h2>
          <p className="mt-0.5 text-small text-muted-foreground">PDF or DOCX, up to 5 MB.</p>
        </div>
      </div>
      <FileDropzone
        accept={[".pdf", ".docx"]}
        maxBytes={RESUME_LIMIT}
        phase={shown.length === 0 && phase === "error" ? "idle" : phase}
        progress={progress}
        error={error}
        files={shown}
        onFiles={handleFiles}
        onRemove={fileName ? remove : undefined}
        disabled={removing}
        idleTitle="Drag and drop your resume"
        idleHint="PDF or DOCX, up to 5 MB"
        processingLabel="Extracting text…"
        doneAnnouncement={committed?.parseStatus === "succeeded" ? `${committed.fileName} uploaded` : undefined}
        replaceLabel={phase === "error" ? "Retry upload" : "Replace"}
      />
    </section>
  );
}
