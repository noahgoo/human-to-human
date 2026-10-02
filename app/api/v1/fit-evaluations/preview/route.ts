import { NextResponse } from "next/server";
import { z } from "zod";
import { assertFitPreviewAccess, PREVIEW_MAX_FILE_BYTES } from "@/lib/api/fit-preview-guard";
import { GptError } from "@/lib/ai/repo/gpt";
import { JevError } from "@/lib/ai/jev/client";
import { CsvParseError, evaluateCandidate } from "@/lib/ai/jev/evaluate";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_RESUME_CHARS = 14_000;

const fields = z.object({
  jobTitle: z.string().trim().min(1).max(200),
  jobRequirements: z.string().trim().min(1).max(8_000),
});

export async function POST(request: Request) {
  const denied = await assertFitPreviewAccess(request);
  if (denied) return denied;

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return error(422, "VALIDATION_FAILED", "Expected multipart form data.");
  }

  const parsed = fields.safeParse({
    jobTitle: form.get("jobTitle"),
    jobRequirements: form.get("jobRequirements"),
  });
  if (!parsed.success) {
    return error(422, "VALIDATION_FAILED", "jobTitle and jobRequirements are required.");
  }

  try {
    const profileCsv = await readCsv(form, "profile");
    const richMediaCsv = await readCsv(form, "richMedia");
    const connectionsCsv = await readCsv(form, "connections");
    const resumeText = await readOptionalResume(form);

    const preview = await evaluateCandidate({
      jobTitle: parsed.data.jobTitle,
      jobRequirements: parsed.data.jobRequirements,
      profileCsv,
      richMediaCsv,
      connectionsCsv,
      resumeText,
    });
    return NextResponse.json(preview);
  } catch (err) {
    if (err instanceof CsvParseError) return error(422, "VALIDATION_FAILED", err.message);
    if ((err instanceof JevError || err instanceof GptError) && err.code === "missing_key") {
      return error(503, "SERVICE_UNAVAILABLE", "OpenRouter is not configured.");
    }
    if (err instanceof GptError) {
      return error(502, "OPENROUTER_UNAVAILABLE", "GPT could not review the GitHub repositories.");
    }
    if (err instanceof JevError) return error(502, "OPENROUTER_UNAVAILABLE", "Jev could not score this candidate.");
    const message = err instanceof Error ? err.message : "Invalid upload";
    if (message.includes("required") || message.includes("larger than")) {
      return error(422, "VALIDATION_FAILED", message);
    }
    return error(500, "INTERNAL", "Could not score this candidate.");
  }
}

async function readCsv(form: FormData, field: string): Promise<string> {
  const value = form.get(field);
  if (!(value instanceof File)) throw new Error(`${field} file is required.`);
  if (value.size > PREVIEW_MAX_FILE_BYTES) {
    throw new Error(`${field} is larger than ${Math.floor(PREVIEW_MAX_FILE_BYTES / 1_000_000)} MB.`);
  }
  return value.text();
}

async function readOptionalResume(form: FormData): Promise<string | undefined> {
  const inline = form.get("resumeText");
  if (typeof inline === "string" && inline.trim()) {
    if (inline.length > MAX_RESUME_CHARS) throw new Error(`resumeText is longer than ${MAX_RESUME_CHARS} characters.`);
    return inline;
  }
  const file = form.get("resume");
  if (!(file instanceof File) || file.size === 0) return undefined;
  if (file.size > PREVIEW_MAX_FILE_BYTES) throw new Error("resume is larger than the upload limit.");
  const text = await file.text();
  if (text.length > MAX_RESUME_CHARS) throw new Error(`resume is longer than ${MAX_RESUME_CHARS} characters.`);
  return text;
}

function error(status: number, code: string, message: string) {
  return NextResponse.json({ error: { code, message } }, { status });
}
