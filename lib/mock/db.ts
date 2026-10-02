// In-memory mock store for the hackathon MVP. Server-only (import from RSC, server
// actions and route handlers). Survives HMR via globalThis. All seed rows live in
// ./seed.ts; swapping to Supabase means seeding those tables and changing the bodies
// of lib/data/* without touching their signatures.
import "server-only";
import type {
  Application,
  ApplicantProfile,
  Company,
  Connection,
  FitEvaluation,
  Job,
  Profile,
  RecruiterMembership,
  RepoEvaluation,
} from "@/lib/types";
import * as seed from "./seed";

export {
  DEMO_ADMIN_ID,
  DEMO_APPLICANT_ID,
  DEMO_NEW_APPLICANT_ID,
  DEMO_NEW_RECRUITER_ID,
  DEMO_RECRUITER_COMPANY_ID,
  DEMO_RECRUITER_ID,
} from "./seed";

export interface MockDb {
  profiles: Profile[];
  companies: Company[];
  blockedEmailDomains: string[];
  jobs: Job[];
  applicants: ApplicantProfile[];
  applications: Application[];
  fitEvaluations: FitEvaluation[];
  repoEvaluations: RepoEvaluation[];
  connections: Connection[];
  memberships: RecruiterMembership[];
  /** Manual credit adjustments / refunds per applicant for the current period. */
  tokenAdjustments: Array<{ applicantId: string; kind: "refund" | "adjustment"; amount: number; at: string }>;
  /** Demo users who have finished onboarding. */
  onboardedUserIds: string[];
}

function fresh(): MockDb {
  return structuredClone({
    profiles: seed.profiles,
    companies: seed.companies,
    blockedEmailDomains: seed.blockedEmailDomains,
    jobs: seed.jobs,
    applicants: seed.applicantProfiles,
    applications: seed.applications,
    fitEvaluations: seed.fitEvaluations,
    repoEvaluations: seed.repoEvaluations,
    connections: seed.connections,
    memberships: seed.recruiterMemberships,
    tokenAdjustments: [],
    onboardedUserIds: seed.onboardedUserIds,
  });
}

// Bump when the MockDb shape or seed changes so a running dev server reseeds.
const SEED_VERSION = 8;
const g = globalThis as unknown as { __npMockDb?: MockDb; __npMockDbVersion?: number };

export function db(): MockDb {
  if (!g.__npMockDb || g.__npMockDbVersion !== SEED_VERSION) {
    g.__npMockDb = fresh();
    g.__npMockDbVersion = SEED_VERSION;
  }
  return g.__npMockDb;
}

export function newId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
}

/** Simulated latency so loading states are visible in the demo. */
export function delay(ms = 150): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
