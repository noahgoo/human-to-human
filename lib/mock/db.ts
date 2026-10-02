// In-memory mock store for the hackathon MVP. Server-only (import from RSC, server
// actions and route handlers). Survives HMR via globalThis. Swap for Supabase later:
// keep the lib/data/* function signatures and change their bodies.
import "server-only";
import type {
  Application,
  ApplicantProfile,
  Company,
  Connection,
  FitEvaluation,
  Job,
  RecruiterMembership,
  RepoEvaluation,
} from "@/lib/types";
import { bandFor } from "@/lib/ranking/bands";

export const DEMO_APPLICANT_ID = "user-applicant-demo";
export const DEMO_RECRUITER_ID = "user-recruiter-demo";
export const DEMO_RECRUITER_COMPANY_ID = "co-lumen";

const DEMO_PROFILE_CSV = `First Name,Last Name,Headline,Summary,Industry
Jordan,Lee,Senior Software Engineer · Distributed systems,"Led migration of an ingestion pipeline to Go, cutting p99 latency 40%. Owned the Kubernetes platform for 60 services. Previously built React dashboards and an internal design system.",Software
`;

const DEMO_RICH_MEDIA_CSV = `Date/Time,Media Description,Media Link
"March 1, 2024","Led migration of an ingestion pipeline to Go, cutting p99 latency 40%. Owned Kubernetes for 60 services.",https://example.test/pipeline
"June 1, 2020","Built React dashboards and an internal design system.",https://example.test/dashboards
`;

export interface MockDb {
  companies: Company[];
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

export const DEMO_NEW_APPLICANT_ID = "user-applicant-new";
export const DEMO_NEW_RECRUITER_ID = "user-recruiter-new";

const now = Date.now();
const daysAgo = (d: number) => new Date(now - d * 86_400_000).toISOString();
const hoursAgo = (h: number) => new Date(now - h * 3_600_000).toISOString();

function seed(): MockDb {
  const companies: Company[] = [
    { id: "co-lumen", name: "Lumen Labs", website: "https://lumenlabs.dev", logoUrl: null, verificationStatus: "verified", domains: ["lumenlabs.dev"], description: "Developer tooling for observability at scale." },
    { id: "co-cobalt", name: "Cobalt Pay", website: "https://cobaltpay.com", logoUrl: null, verificationStatus: "verified", domains: ["cobaltpay.com"], description: "Payments infrastructure for marketplaces." },
    { id: "co-northwind", name: "Northwind Robotics", website: "https://northwind.ai", logoUrl: null, verificationStatus: "verified", domains: ["northwind.ai"], description: "Warehouse autonomy and fleet software." },
    { id: "co-harbor", name: "Harbor Health", website: "https://harborhealth.io", logoUrl: null, verificationStatus: "verified", domains: ["harborhealth.io"], description: "Care coordination for clinics." },
    { id: "co-atlas", name: "Atlas Data", website: "https://atlasdata.co", logoUrl: null, verificationStatus: "verified", domains: ["atlasdata.co"], description: "Analytics warehouse for growth teams." },
    { id: "co-fernway", name: "Fernway", website: "https://fernway.com", logoUrl: null, verificationStatus: "pending", domains: ["fernway.com"], description: "Sustainable travel booking." },
  ];

  const job = (j: Partial<Job> & Pick<Job, "id" | "companyId" | "title">): Job => ({
    description:
      "You'll join a small, senior team shipping product end to end. We value clear writing, pragmatic engineering and ownership.\n\nWhat you'll do:\n- Design and ship features across the stack\n- Partner with design and product on scope\n- Improve reliability and developer experience",
    requirements: "- 3+ years of professional experience\n- Strong communication skills\n- Experience with modern web stacks",
    location: "San Francisco, CA",
    workMode: "hybrid",
    tokenCost: 2,
    isTechnical: false,
    status: "open",
    publishedAt: daysAgo(3),
    createdAt: daysAgo(5),
    updatedAt: daysAgo(3),
    ...j,
  });

  const jobs: Job[] = [
    job({ id: "job-lumen-infra", companyId: "co-lumen", title: "Staff Infrastructure Engineer", isTechnical: true, tokenCost: 3, workMode: "remote", location: "United States", publishedAt: daysAgo(6), requirements: "- 7+ years building distributed systems\n- Go or Rust in production\n- Kubernetes, Terraform, observability tooling\n- Experience leading cross-team technical projects" }),
    job({ id: "job-lumen-fe", companyId: "co-lumen", title: "Senior Frontend Engineer", isTechnical: true, tokenCost: 2, workMode: "hybrid", location: "Austin, TX", publishedAt: daysAgo(2), requirements: "- 5+ years with React and TypeScript\n- Design systems experience\n- Performance and accessibility focus" }),
    job({ id: "job-lumen-pm", companyId: "co-lumen", title: "Product Manager, Platform", tokenCost: 2, status: "draft", publishedAt: null }),
    job({ id: "job-lumen-devrel", companyId: "co-lumen", title: "Developer Advocate", tokenCost: 1, status: "closed", publishedAt: daysAgo(40) }),
    job({ id: "job-cobalt-backend", companyId: "co-cobalt", title: "Backend Engineer, Payments", isTechnical: true, tokenCost: 2, workMode: "onsite", location: "Seattle, WA", publishedAt: daysAgo(1), requirements: "- 4+ years backend engineering\n- Postgres, event-driven systems\n- Payments or fintech experience a plus" }),
    job({ id: "job-cobalt-design", companyId: "co-cobalt", title: "Product Designer", tokenCost: 1, workMode: "remote", location: "United States", publishedAt: daysAgo(4) }),
    job({ id: "job-northwind-ml", companyId: "co-northwind", title: "Machine Learning Engineer, Perception", isTechnical: true, tokenCost: 3, workMode: "onsite", location: "Pittsburgh, PA", publishedAt: daysAgo(8), requirements: "- MS/PhD or equivalent experience in ML\n- PyTorch, computer vision\n- Shipping models to edge devices" }),
    job({ id: "job-harbor-ops", companyId: "co-harbor", title: "Clinical Operations Lead", tokenCost: 1, workMode: "hybrid", location: "Boston, MA", publishedAt: daysAgo(10) }),
    job({ id: "job-atlas-data", companyId: "co-atlas", title: "Data Engineer", isTechnical: true, tokenCost: 2, workMode: "remote", location: "United States", publishedAt: daysAgo(12), requirements: "- SQL and Python\n- dbt, Airflow or Dagster\n- Warehouse modeling" }),
    job({ id: "job-atlas-sales", companyId: "co-atlas", title: "Account Executive, Mid-Market", tokenCost: 1, workMode: "remote", location: "United States", publishedAt: daysAgo(14) }),
  ];

  const demoApplicant: ApplicantProfile = {
    id: DEMO_APPLICANT_ID,
    fullName: "Jordan Lee",
    email: "jordan@example.com",
    avatarUrl: null,
    headline: "Senior Software Engineer · Distributed systems",
    targetSeniority: "Senior / Staff",
    locationPref: "remote",
    resume: {
      id: "resume-demo",
      fileName: "jordan-lee-resume.pdf",
      sizeBytes: 182_340,
      mimeType: "application/pdf",
      parseStatus: "succeeded",
      textContent:
        "JORDAN LEE\nSenior Software Engineer\n\nEXPERIENCE\nAcme Cloud — Senior Software Engineer (2021–present)\n- Led migration of ingestion pipeline to Go, cutting p99 latency 40%\n- Owned Kubernetes platform for 60 services\n\nBrightline — Software Engineer (2018–2021)\n- Built React dashboards and internal design system\n\nSKILLS\nGo, Rust, TypeScript, React, Kubernetes, Terraform, Postgres",
    },
    linkedin: {
      id: "li-demo",
      status: "succeeded",
      filesPresent: ["Profile", "Positions", "Skills", "Education", "Connections"],
      counts: { connections: 1428, companies: 342, positions: 4, skills: 24, education: 2 },
      profileCsv: DEMO_PROFILE_CSV,
      richMediaCsv: DEMO_RICH_MEDIA_CSV,
    },
  };

  const names = [
    "Avery Chen", "Sam Patel", "Morgan Diaz", "Riley Brooks", "Casey Nguyen", "Jamie Okafor",
    "Taylor Kim", "Drew Martinez", "Quinn Foster", "Reese Wang", "Skyler Adams", "Rowan Ali",
  ];
  const headlines = [
    "Staff Engineer · Platform", "Senior SRE", "Backend Engineer · Go", "Infra Engineer · Rust",
    "Senior DevOps Engineer", "Distributed Systems Engineer", "Platform Engineer", "Cloud Engineer",
    "Senior Software Engineer", "Site Reliability Lead", "Systems Engineer", "Software Engineer II",
  ];
  const otherApplicants: ApplicantProfile[] = names.map((fullName, i) => ({
    id: `user-applicant-${i + 1}`,
    fullName,
    email: `${fullName.split(" ")[0].toLowerCase()}@example.com`,
    avatarUrl: null,
    headline: headlines[i],
    targetSeniority: "Senior / Staff",
    locationPref: "remote",
    resume: {
      id: `resume-${i + 1}`,
      fileName: `${fullName.toLowerCase().replace(" ", "-")}-resume.pdf`,
      sizeBytes: 120_000 + i * 3_100,
      mimeType: "application/pdf",
      parseStatus: "succeeded",
      textContent: `${fullName.toUpperCase()}\n${headlines[i]}\n\nEXPERIENCE\n- ${4 + (i % 6)} years building backend and infrastructure systems\n- Operated Kubernetes clusters and CI/CD pipelines\n\nSKILLS\nGo, Python, Kubernetes, Terraform, AWS`,
    },
    linkedin: {
      id: `li-${i + 1}`,
      status: "succeeded",
      filesPresent: ["Profile", "Positions", "Skills", "Education", "Connections"],
      counts: { connections: 300 + i * 40, companies: 120 + i * 7, positions: 3, skills: 15, education: 1 },
    },
  }));

  // Ranking fixture on job-lumen-infra: confidence + GitHub state per applicant (A1…A12).
  const infraFixture: Array<{ conf: number | null; repo: "ok" | "pending" | "failed"; scores?: [number, number, number, number]; status?: Application["status"] }> = [
    { conf: 92, repo: "ok", scores: [9, 8, 8, 7], status: "shortlisted" },
    { conf: 88, repo: "ok", scores: [8, 9, 7, 8] },
    { conf: 81, repo: "ok", scores: [9, 9, 9, 8] },
    { conf: 76, repo: "ok", scores: [6, 7, 6, 5] },
    { conf: 71, repo: "ok", scores: [7, 6, 7, 6] },
    { conf: 64, repo: "ok", scores: [5, 6, 5, 4] },
    { conf: 58, repo: "ok", scores: [4, 5, 5, 3], status: "rejected" },
    { conf: 85, repo: "pending" },
    { conf: 69, repo: "failed" },
    { conf: 47, repo: "ok", scores: [3, 4, 4, 2] },
    { conf: null, repo: "pending" },
    { conf: 73, repo: "ok", scores: [7, 7, 6, 7], status: "withdrawn" },
  ];

  const applications: Application[] = [];
  const fitEvaluations: FitEvaluation[] = [];
  const repoEvaluations: RepoEvaluation[] = [];

  infraFixture.forEach((f, i) => {
    const applicant = otherApplicants[i];
    const appId = `app-infra-${i + 1}`;
    const fitId = `fit-infra-${i + 1}`;
    const status = f.status ?? "submitted";
    const submittedAt = hoursAgo(6 + i * 9);
    if (f.conf != null) {
      fitEvaluations.push({
        id: fitId,
        jobId: "job-lumen-infra",
        applicantId: applicant.id,
        status: "succeeded",
        confidenceScore: f.conf,
        band: bandFor(f.conf),
        explanation: `${applicant.fullName.split(" ")[0]} has ${f.conf >= 80 ? "strong" : f.conf >= 60 ? "partial" : "limited"} overlap with the distributed-systems and Kubernetes requirements. ${f.conf >= 70 ? "Production Go experience is clearly evidenced." : "Go or Rust in production is not clearly evidenced."}`,
        requirements: [
          { requirement: "7+ years building distributed systems", met: f.conf >= 80 ? "yes" : "partial", evidence: "Resume: backend and infrastructure roles" },
          { requirement: "Go or Rust in production", met: f.conf >= 70 ? "yes" : "no", evidence: f.conf >= 70 ? "Skills list and positions" : null },
          { requirement: "Kubernetes, Terraform, observability tooling", met: "yes", evidence: "Operated Kubernetes clusters" },
          { requirement: "Experience leading cross-team technical projects", met: f.conf >= 85 ? "yes" : "partial", evidence: null },
        ],
        createdAt: submittedAt,
      });
    }
    const events: Application["events"] = [{ fromStatus: null, toStatus: "submitted", at: submittedAt }];
    if (status !== "submitted") events.push({ fromStatus: "submitted", toStatus: status, at: hoursAgo(2 + i), actorName: status === "withdrawn" ? undefined : "Priya Shah" });
    const repoUrl = `https://github.com/${applicant.fullName.split(" ")[0].toLowerCase()}/infra-toolkit`;
    applications.push({
      id: appId,
      jobId: "job-lumen-infra",
      applicantId: applicant.id,
      status,
      tokenCost: 3,
      githubRepoUrl: repoUrl,
      submittedAt,
      updatedAt: events[events.length - 1].at,
      fitEvaluationId: f.conf != null ? fitId : null,
      events,
    });
    const scores = f.scores
      ? { security: f.scores[0], organization: f.scores[1], performance: f.scores[2], testing: f.scores[3] }
      : null;
    repoEvaluations.push({
      id: `repo-infra-${i + 1}`,
      applicationId: appId,
      status: f.repo === "ok" ? "succeeded" : f.repo === "pending" ? "running" : "failed",
      scores,
      overall: scores ? (scores.security + scores.organization + scores.performance + scores.testing) / 4 : null,
      rationale: scores
        ? {
            security: "Secrets are loaded from env; input validation present on HTTP handlers.",
            organization: "Clear package boundaries (cmd/, internal/, pkg/).",
            performance: "Uses connection pooling and bounded worker pools.",
            testing: scores.testing >= 6 ? "Table-driven unit tests cover core packages." : "Few tests; no CI configuration found.",
          }
        : {},
      repoUrl,
      repoFullName: repoUrl.replace("https://github.com/", ""),
      commitSha: scores ? `a1b2c3d${i}e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9`.slice(0, 40) : null,
      flags: i === 2 ? ["fork"] : [],
      failureCode: f.repo === "failed" ? "repo_not_accessible" : null,
    });
  });

  // Demo applicant's own history.
  applications.push(
    {
      id: "app-demo-1", jobId: "job-cobalt-backend", applicantId: DEMO_APPLICANT_ID, status: "submitted", tokenCost: 2,
      githubRepoUrl: "https://github.com/jordanlee/queue-service", submittedAt: hoursAgo(20), updatedAt: hoursAgo(20), fitEvaluationId: null,
      events: [{ fromStatus: null, toStatus: "submitted", at: hoursAgo(20) }],
    },
    {
      id: "app-demo-2", jobId: "job-harbor-ops", applicantId: DEMO_APPLICANT_ID, status: "shortlisted", tokenCost: 1,
      githubRepoUrl: null, submittedAt: daysAgo(6), updatedAt: daysAgo(2), fitEvaluationId: null,
      events: [{ fromStatus: null, toStatus: "submitted", at: daysAgo(6) }, { fromStatus: "submitted", toStatus: "shortlisted", at: daysAgo(2) }],
    },
  );
  const connections: Connection[] = [
    { id: "c1", ownerId: DEMO_APPLICANT_ID, firstName: "Sarah", lastName: "Lin", position: "Engineering Manager", companyName: "Lumen Labs" },
    { id: "c2", ownerId: DEMO_APPLICANT_ID, firstName: "Alex", lastName: "Moreno", position: "Staff Engineer", companyName: "Lumen Labs" },
    { id: "c3", ownerId: DEMO_APPLICANT_ID, firstName: "Dana", lastName: "Price", position: "Recruiter", companyName: "Lumen Labs" },
    { id: "c4", ownerId: DEMO_APPLICANT_ID, firstName: "Chris", lastName: "Owens", position: "Product Designer", companyName: "Cobalt Pay" },
    { id: "c5", ownerId: DEMO_APPLICANT_ID, firstName: "Nina", lastName: "Rossi", position: "Data Scientist", companyName: "Atlas Data" },
  ];

  const memberships: RecruiterMembership[] = [
    { recruiterId: DEMO_RECRUITER_ID, companyId: "co-lumen", verificationStatus: "verified", workEmail: "priya@lumenlabs.dev" },
    { recruiterId: "user-recruiter-fernway", companyId: "co-fernway", verificationStatus: "pending", workEmail: "max@fernway.com" },
  ];

  return {
    companies,
    jobs,
    applicants: [demoApplicant, ...otherApplicants],
    applications,
    fitEvaluations,
    repoEvaluations,
    connections,
    memberships,
    tokenAdjustments: [],
    onboardedUserIds: [DEMO_APPLICANT_ID, DEMO_RECRUITER_ID, "user-recruiter-fernway", ...otherApplicants.map((a) => a.id)],
  };
}

// Bump when the MockDb shape or seed changes so a running dev server reseeds.
const SEED_VERSION = 4;
const g = globalThis as unknown as { __npMockDb?: MockDb; __npMockDbVersion?: number };

export function db(): MockDb {
  if (!g.__npMockDb || g.__npMockDbVersion !== SEED_VERSION) {
    g.__npMockDb = seed();
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
