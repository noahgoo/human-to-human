import type { OnboardingLinkedInFile } from "@/lib/linkedin/onboarding-files";
import { onboardingFileFromPath } from "@/lib/linkedin/onboarding-files";

export type ExtractedLinkedInCsvs = Partial<Record<OnboardingLinkedInFile, string>>;

async function readZipCsvs(zipBytes: Uint8Array): Promise<{ names: string[]; csvs: ExtractedLinkedInCsvs }> {
  const { unzip, strFromU8 } = await import("fflate");
  const csvs: ExtractedLinkedInCsvs = {};
  const names: string[] = [];
  await new Promise<void>((resolve, reject) => {
    unzip(
      zipBytes,
      {
        filter(file) {
          names.push(file.name);
          const kind = onboardingFileFromPath(file.name);
          const readable = file.compression === 0 || file.compression === 8;
          return Boolean(kind && readable && file.originalSize <= 20_000_000);
        },
      },
      (error, unzipped) => {
        if (error) {
          reject(error);
          return;
        }
        for (const [name, data] of Object.entries(unzipped)) {
          const kind = onboardingFileFromPath(name);
          if (kind) csvs[kind] = strFromU8(data);
        }
        resolve();
      },
    );
  });
  return { names, csvs };
}

/** Read Profile, Positions, Connections, and Rich_Media from uploaded files. */
export async function extractOnboardingCsvs(files: File[]): Promise<ExtractedLinkedInCsvs> {
  const zips = files.filter((f) => f.name.toLowerCase().endsWith(".zip"));
  const csvs = files.filter((f) => f.name.toLowerCase().endsWith(".csv"));
  if (zips.length > 0 && csvs.length > 0) {
    throw new Error("Upload either one ZIP export or the CSV files, not both.");
  }
  if (zips.length > 1) throw new Error("Upload a single ZIP, or the individual CSV files.");
  const out: ExtractedLinkedInCsvs = {};
  if (zips.length === 1) {
    const { csvs: fromZip } = await readZipCsvs(new Uint8Array(await zips[0].arrayBuffer()));
    Object.assign(out, fromZip);
    return out;
  }
  for (const file of csvs) {
    const kind = onboardingFileFromPath(file.name);
    if (!kind) continue;
    out[kind] = await file.text();
  }
  return out;
}
