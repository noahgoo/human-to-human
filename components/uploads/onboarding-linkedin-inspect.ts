import {
  ONBOARDING_LINKEDIN_FILES,
  onboardingFileFromPath,
  type OnboardingLinkedInFile,
} from "@/lib/linkedin/onboarding-files";
import { summarizeConnections } from "@/components/uploads/linkedin-inspect";

export type OnboardingLinkedInInspection = {
  filesPresent: OnboardingLinkedInFile[];
  counts: {
    connections: number;
    companies: number;
    positions: number;
    richMedia: number;
  };
  displayNames: string[];
  allRequiredPresent: boolean;
};

function countDataRows(text: string): number {
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
  return Math.max(0, lines.length - 1);
}

async function csvsFromZip(data: Uint8Array): Promise<{ names: string[]; texts: Partial<Record<OnboardingLinkedInFile, string>> }> {
  const { unzip, strFromU8 } = await import("fflate");
  const names: string[] = [];
  const texts: Partial<Record<OnboardingLinkedInFile, string>> = {};
  await new Promise<void>((resolve, reject) => {
    unzip(
      data,
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
        for (const [name, bytes] of Object.entries(unzipped)) {
          const kind = onboardingFileFromPath(name);
          if (kind) texts[kind] = strFromU8(bytes);
        }
        resolve();
      },
    );
  });
  return { names, texts };
}

export async function inspectOnboardingLinkedInFiles(files: File[]): Promise<OnboardingLinkedInInspection> {
  const zips = files.filter((f) => f.name.toLowerCase().endsWith(".zip"));
  const csvs = files.filter((f) => f.name.toLowerCase().endsWith(".csv"));
  if (zips.length > 0 && csvs.length > 0) {
    throw new Error("Upload either one ZIP export or the CSV files, not both.");
  }
  if (zips.length > 1) throw new Error("Upload a single ZIP, or the four CSV files.");

  const present = new Set<OnboardingLinkedInFile>();
  const counts = { connections: 0, companies: 0, positions: 0, richMedia: 0 };
  let displayNames: string[] = [];

  if (zips.length === 1) {
    displayNames = [zips[0].name];
    let extracted: { names: string[]; texts: Partial<Record<OnboardingLinkedInFile, string>> };
    try {
      extracted = await csvsFromZip(new Uint8Array(await zips[0].arrayBuffer()));
    } catch {
      throw new Error("We couldn't read that ZIP. Try uploading the four CSV files instead.");
    }
    for (const name of extracted.names) {
      const kind = onboardingFileFromPath(name);
      if (kind) present.add(kind);
    }
    for (const kind of ONBOARDING_LINKEDIN_FILES) {
      const text = extracted.texts[kind];
      if (!text) continue;
      if (kind === "Connections") {
        const summary = summarizeConnections(text);
        counts.connections = summary.connections;
        counts.companies = summary.companies;
      } else if (kind === "Positions") counts.positions = countDataRows(text);
      else if (kind === "Rich_Media") counts.richMedia = countDataRows(text);
    }
  } else {
    displayNames = csvs.map((f) => f.name);
    for (const file of csvs) {
      const kind = onboardingFileFromPath(file.name);
      if (!kind) continue;
      present.add(kind);
      const text = await file.text();
      if (kind === "Connections") {
        const summary = summarizeConnections(text);
        counts.connections = summary.connections;
        counts.companies = summary.companies;
      } else if (kind === "Positions") counts.positions = countDataRows(text);
      else if (kind === "Rich_Media") counts.richMedia = countDataRows(text);
    }
  }

  if (present.size === 0) {
    throw new Error(
      "We need Profile.csv, Positions.csv, Connections.csv, and Rich_Media.csv from your LinkedIn export.",
    );
  }

  const filesPresent = ONBOARDING_LINKEDIN_FILES.filter((k) => present.has(k));
  const allRequiredPresent = ONBOARDING_LINKEDIN_FILES.every((k) => present.has(k));

  return { filesPresent, counts, displayNames, allRequiredPresent };
}
