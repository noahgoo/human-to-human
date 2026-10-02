import type { ParseStatus } from "@/lib/types";

export type UploadGate = "missing" | "uploading" | "processing" | "failed" | "ready";

export function gateFromStatus(status: ParseStatus | null | undefined, failed: boolean): UploadGate {
  if (failed) return "failed";
  if (status === "succeeded") return "ready";
  if (status === "failed") return "failed";
  if (status === "pending" || status === "running") return "processing";
  return "missing";
}

export function onboardingGaps(linkedin: UploadGate, resume: UploadGate): string[] {
  const items: string[] = [];
  if (linkedin !== "ready") {
    items.push(
      linkedin === "uploading"
        ? "LinkedIn export is uploading."
        : linkedin === "processing"
          ? "Parsing your export…"
          : linkedin === "failed"
            ? "Fix the LinkedIn export and try again."
            : "Upload your LinkedIn export.",
    );
  }
  if (resume !== "ready") {
    items.push(
      resume === "uploading"
        ? "Resume is uploading."
        : resume === "processing"
          ? "Extracting text…"
          : resume === "failed"
            ? "We couldn't read this file. Try exporting it as PDF."
            : "Upload your resume (PDF or DOCX).",
    );
  }
  return items;
}
