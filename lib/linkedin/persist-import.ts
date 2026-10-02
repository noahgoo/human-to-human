import "server-only";
import { randomUUID } from "crypto";
import {
  ONBOARDING_LINKEDIN_FILES,
  type OnboardingLinkedInFile,
  filesPresentLabel,
} from "@/lib/linkedin/onboarding-files";
import type { ExtractedLinkedInCsvs } from "@/lib/linkedin/extract-csvs";
import { parseProfileForStorage } from "@/lib/parsers/linkedin/parse-profile-storage";
import { parsePositionsCsv } from "@/lib/parsers/linkedin/parse-positions";
import { parseConnectionsForStorage } from "@/lib/parsers/linkedin/parse-connections-storage";
import { parseRichMediaForStorage } from "@/lib/parsers/linkedin/parse-rich-media-storage";
import { CsvParseError } from "@/lib/parsers/linkedin/fit-sources";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { LinkedInImportInfo } from "@/lib/types";

function missingFiles(csvs: ExtractedLinkedInCsvs): OnboardingLinkedInFile[] {
  return ONBOARDING_LINKEDIN_FILES.filter((kind) => !csvs[kind]?.trim());
}

function uniqueCompanies(rows: { companyName: string | null }[]): number {
  const set = new Set<string>();
  for (const row of rows) {
    if (row.companyName) set.add(row.companyName.toLowerCase());
  }
  return set.size;
}

export async function persistLinkedInOnboardingImport(
  applicantId: string,
  csvs: ExtractedLinkedInCsvs,
  source: "zip" | "csv",
): Promise<LinkedInImportInfo> {
  const missing = missingFiles(csvs);
  if (missing.length > 0) {
    throw new CsvParseError(
      `Upload all required files: ${missing.map((k) => filesPresentLabel(k)).join(", ")}.`,
    );
  }

  const profile = parseProfileForStorage(csvs.Profile!);
  const positions = parsePositionsCsv(csvs.Positions!);
  const connections = parseConnectionsForStorage(csvs.Connections!);
  const richMedia = parseRichMediaForStorage(csvs.Rich_Media!);

  const importId = randomUUID();
  const now = new Date().toISOString();
  const filesPresent = ONBOARDING_LINKEDIN_FILES.map((k) => filesPresentLabel(k)) as LinkedInImportInfo["filesPresent"];

  const counts = {
    connections: connections.length,
    companies: uniqueCompanies(connections),
    positions: positions.length,
    skills: 0,
    education: 0,
    richMedia: richMedia.length,
  };

  const admin = supabaseAdmin();

  const { error: importError } = await admin.from("linkedin_imports").insert({
    id: importId,
    applicant_id: applicantId,
    source,
    status: "running",
    files_present: filesPresent,
    counts,
    headline: profile.headline,
    summary: profile.summary,
    industry: profile.industry,
    geo_location: profile.geoLocation,
    uploaded_at: now,
    started_at: now,
  });
  if (importError) throw importError;

  if (positions.length > 0) {
    const { error } = await admin.from("linkedin_positions").insert(
      positions.map((row) => ({
        import_id: importId,
        applicant_id: applicantId,
        company_name: row.companyName,
        title: row.title,
        description: row.description,
        location: row.location,
        started_on: row.startedOn,
        ended_on: row.endedOn,
      })),
    );
    if (error) throw error;
  }

  if (connections.length > 0) {
    const chunkSize = 500;
    for (let i = 0; i < connections.length; i += chunkSize) {
      const slice = connections.slice(i, i + chunkSize);
      const { error } = await admin.from("connections").insert(
        slice.map((row) => ({
          import_id: importId,
          applicant_id: applicantId,
          first_name: row.firstName,
          last_name: row.lastName,
          company_name: row.companyName,
          position: row.position,
          connected_on: row.connectedOn,
        })),
      );
      if (error) throw error;
    }
  }

  if (richMedia.length > 0) {
    const { error } = await admin.from("linkedin_rich_media").insert(
      richMedia.map((row) => ({
        import_id: importId,
        applicant_id: applicantId,
        occurred_at: row.occurredAt,
        description: row.description,
        media_link: row.mediaLink,
      })),
    );
    if (error) throw error;
  }

  const { error: succeedError } = await admin
    .from("linkedin_imports")
    .update({ status: "succeeded", parsed_at: now, updated_at: now, counts })
    .eq("id", importId);
  if (succeedError) throw succeedError;

  await admin.from("applicant_profiles").upsert(
    {
      profile_id: applicantId,
      active_linkedin_import_id: importId,
      headline: profile.headline,
      updated_at: now,
    },
    { onConflict: "profile_id" },
  );

  const { data: oldImports } = await admin
    .from("linkedin_imports")
    .select("id")
    .eq("applicant_id", applicantId)
    .neq("id", importId);
  if (oldImports && oldImports.length > 0) {
    await admin
      .from("linkedin_imports")
      .delete()
      .eq("applicant_id", applicantId)
      .neq("id", importId);
  }

  return {
    id: importId,
    status: "succeeded",
    filesPresent: ONBOARDING_LINKEDIN_FILES as unknown as LinkedInImportInfo["filesPresent"],
    counts: {
      connections: counts.connections,
      companies: counts.companies,
      positions: counts.positions,
      skills: counts.skills,
      education: counts.education,
    },
    profileCsv: profile.profileCsv,
    richMediaCsv: csvs.Rich_Media,
  };
}
