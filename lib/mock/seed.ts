// All demo data in one place, one array per Supabase table. Rows use the app's camelCase
// types; each maps 1:1 onto the snake_case columns in docs (e.g. `companyId` -> company_id).
// Timestamps are relative to "now" so the demo never goes stale; in SQL use
// `now() - interval '...'`.
//
// Cast:
//   Carter Lee  onboarded applicant, applied to Waystar and Redo
//   Collin Smith  new applicant (goes through onboarding)
//   Steve       verified recruiter at Redo, login stays steve@neighbor.com
//   Admin       platform admin
import type {
  Application,
  ApplicantProfile,
  Company,
  Connection,
  FitEvaluation,
  Job,
  Profile,
  RecruiterMembership,
  RepoCategory,
  RepoEvaluation,
} from "@/lib/types";

type RepoScores = Record<RepoCategory, number>;

// ---------- ids ----------

export const DEMO_APPLICANT_ID = "user-carter";
export const DEMO_NEW_APPLICANT_ID = "user-noah";
export const DEMO_RECRUITER_ID = "user-steve";
export const DEMO_NEW_RECRUITER_ID = "user-sam";
export const DEMO_ADMIN_ID = "user-admin";
export const DEMO_RECRUITER_COMPANY_ID = "co-redo";

const DEMO_PROFILE_CSV = `First Name,Last Name,Headline,Summary,Industry
Carter,Lee,Software Engineer · Backend and data,"Built event-driven messaging services in Go and TypeScript handling 20M events/day. Moved billing reports to Postgres materialized views, cutting load time 60%. Previously built React dashboards and an internal design system.",Software
`;

const DEMO_RICH_MEDIA_CSV = `Date/Time,Media Description,Media Link
"March 1, 2024","Built event-driven messaging services in Go and TypeScript handling 20M events/day.",https://example.test/messaging
"June 1, 2022","Moved billing reports to Postgres materialized views, cutting load time 60%.",https://example.test/billing
`;

// ---------- time helpers ----------

const now = Date.now();
const periodStart = (() => {
  const d = new Date(now);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
})();
const daysAgo = (d: number) => new Date(now - d * 86_400_000).toISOString();
const hoursAgo = (h: number) => new Date(now - h * 3_600_000).toISOString();
/** Inside the current UTC credit period, even on the 1st of the month. */
const thisMonth = (hours: number) => new Date(Math.max(now - hours * 3_600_000, periodStart + 60_000)).toISOString();
/** Always in the previous credit period. */
const priorPeriod = (days: number) => new Date(Math.min(now, periodStart) - days * 86_400_000).toISOString();

// ---------- profiles (auth users) ----------

export const profiles: Profile[] = [
  { id: DEMO_APPLICANT_ID, email: "carter@example.com", fullName: "Carter Lee", avatarUrl: null, role: "applicant" },
  { id: DEMO_NEW_APPLICANT_ID, email: "noah@example.com", fullName: "Collin Smith", avatarUrl: null, role: "applicant" },
  { id: DEMO_RECRUITER_ID, email: "steve@neighbor.com", fullName: "Steve", avatarUrl: null, role: "recruiter" },
  { id: DEMO_NEW_RECRUITER_ID, email: "sam@brightforge.io", fullName: "Sam Okoro", avatarUrl: null, role: "recruiter" },
  { id: DEMO_ADMIN_ID, email: "admin@nexuspulse.dev", fullName: "Admin", avatarUrl: null, role: "admin" },
  { id: "user-avery", email: "avery@example.com", fullName: "Avery Chen", avatarUrl: null, role: "applicant" },
  { id: "user-sam-patel", email: "sam.patel@example.com", fullName: "Sam Patel", avatarUrl: null, role: "applicant" },
  { id: "user-morgan", email: "morgan@example.com", fullName: "Morgan Diaz", avatarUrl: null, role: "applicant" },
  { id: "user-riley", email: "riley@example.com", fullName: "Riley Brooks", avatarUrl: null, role: "applicant" },
  { id: "user-taylor", email: "taylor@example.com", fullName: "Taylor Kim", avatarUrl: null, role: "applicant" },
];

// ---------- companies + recruiter_memberships ----------

export const companies: Company[] = [
  {
    id: "co-neighbor", name: "Neighbor", website: "https://www.neighbor.com", logoUrl: "/logos/neighbor.png",
    verificationStatus: "verified", reviewReason: null, domains: ["neighbor.com"], createdAt: daysAgo(60),
    description: "Peer-to-peer storage and parking marketplace that connects renters with hosts' unused space.",
  },
  {
    id: "co-waystar", name: "Waystar", website: "https://www.waystar.com", logoUrl: "/logos/waystar.png",
    verificationStatus: "verified", reviewReason: null, domains: ["waystar.com"], createdAt: daysAgo(55),
    description: "Healthcare payments software that simplifies revenue cycle management for providers.",
  },
  {
    id: "co-redo", name: "Redo", website: "https://www.getredo.com", logoUrl: "/logos/redo.png",
    verificationStatus: "verified", reviewReason: null, domains: ["getredo.com"], createdAt: daysAgo(50),
    description: "Returns, exchanges and shipping protection platform for Shopify brands.",
  },
];

export const recruiterMemberships: RecruiterMembership[] = [
  { recruiterId: DEMO_RECRUITER_ID, companyId: "co-redo", verificationStatus: "verified", workEmail: "steve@getredo.com" },
];

/** `blocked_email_domains`: free-mail providers that can't verify a company. */
export const blockedEmailDomains: string[] = [
  "gmail.com", "googlemail.com", "yahoo.com", "ymail.com", "hotmail.com", "outlook.com", "live.com",
  "msn.com", "icloud.com", "me.com", "mac.com", "proton.me", "protonmail.com", "pm.me", "aol.com",
];

// ---------- jobs ----------

export const jobs: Job[] = [
  {
    id: "job-neighbor-backend", companyId: "co-neighbor", title: "Senior Backend Engineer, Marketplace",
    description:
      "Neighbor is building the largest storage and parking marketplace in the country. Hosts earn money from unused garages, driveways and spare rooms, and renters find space close to home.\n\nWhat you'll do:\n- Own the services behind search, booking and payouts\n- Scale geospatial search across millions of listings\n- Improve trust and safety signals for hosts and renters",
    requirements:
      "- 5+ years building backend services at scale\n- Go or TypeScript/Node.js in production\n- Postgres, search and geospatial queries\n- Experience with two-sided marketplaces or payments",
    location: "Lehi, UT", workMode: "hybrid", tokenCost: 3, isTechnical: true, status: "open",
    publishedAt: daysAgo(6), createdAt: daysAgo(8), updatedAt: daysAgo(6),
  },
  {
    id: "job-neighbor-pm", companyId: "co-neighbor", title: "Product Manager, Pricing & Search",
    description:
      "Neighbor is building the largest storage and parking marketplace in the country.\n\nWhat you'll do:\n- Own dynamic pricing recommendations for hosts\n- Improve search ranking and conversion for renters\n- Partner with data science on experiments",
    requirements:
      "- 4+ years of product management in a marketplace\n- Strong analytical skills (SQL a plus)\n- Experience running pricing or ranking experiments",
    location: "Lehi, UT", workMode: "hybrid", tokenCost: 2, isTechnical: false, status: "draft",
    publishedAt: null, createdAt: daysAgo(2), updatedAt: daysAgo(2),
  },
  {
    id: "job-neighbor-product", companyId: "co-neighbor", title: "Software Engineer, Product",
    description:
      "Neighbor is building the largest storage and parking marketplace in the country. Hosts earn money from unused garages, driveways, and spare rooms, and renters find space close to home.\n\nWe're hiring an early-career software engineer to build the product hosts and renters use every day.\n\nWhat you'll do:\n- Ship TypeScript and React features across the host and renter apps\n- Add AI-assisted tools that help hosts write listings and answer renter questions\n- Build interactive product UI, not just forms and tables\n- Own tests and CI so we can ship changes without breaking bookings\n- Treat application security as part of the job on a marketplace that stores personal spaces and payments",
    requirements:
      "- Shipped a web product in TypeScript and React (Next.js counts)\n- Built an AI or LLM feature into a real product\n- Testing or CI/CD experience from an internship, team, or project\n- Internship or project work in application security, internal tools, or automation\n- Comfort taking an idea from concept to a working product",
    location: "Lehi, UT", workMode: "hybrid", tokenCost: 2, isTechnical: true, status: "open",
    publishedAt: daysAgo(1), createdAt: daysAgo(1), updatedAt: daysAgo(1),
  },
  {
    id: "job-waystar-claims", companyId: "co-waystar", title: "Software Engineer II, Claims Platform",
    description:
      "Waystar's cloud platform helps more than a million providers get paid faster, from patient estimates and eligibility to claims and remittance.\n\nWhat you'll do:\n- Build services that process millions of healthcare claims a day\n- Improve claim status and denial workflows\n- Keep PHI secure and HIPAA compliant",
    requirements:
      "- 3+ years of backend engineering (C#/.NET or Java)\n- SQL Server or Postgres, message queues\n- Healthcare claims (EDI 837/835) experience a plus",
    location: "Lehi, UT", workMode: "hybrid", tokenCost: 2, isTechnical: true, status: "open",
    publishedAt: daysAgo(3), createdAt: daysAgo(5), updatedAt: daysAgo(3),
  },
  {
    id: "job-waystar-impl", companyId: "co-waystar", title: "Implementation Consultant",
    description:
      "Waystar's cloud platform helps more than a million providers get paid faster.\n\nWhat you'll do:\n- Lead new hospital and clinic clients through go-live\n- Configure payer connections and workflows\n- Train client billing teams",
    requirements:
      "- 2+ years implementing B2B SaaS for healthcare providers\n- Strong project management and client communication\n- Familiarity with revenue cycle workflows",
    location: "United States", workMode: "remote", tokenCost: 1, isTechnical: false, status: "open",
    publishedAt: daysAgo(9), createdAt: daysAgo(10), updatedAt: daysAgo(9),
  },
  {
    id: "job-redo-fullstack", companyId: "co-redo", title: "Full-Stack Engineer, Returns Platform",
    description:
      "Redo helps e-commerce brands turn returns into exchanges and recover revenue, with a returns portal, shipping protection and post-purchase tools built for Shopify.\n\nWhat you'll do:\n- Build the returns and exchanges portal shoppers use\n- Integrate with Shopify, carriers and warehouses\n- Ship fast in a small, high-ownership team",
    requirements:
      "- 3+ years of full-stack TypeScript (React and Node.js)\n- Experience with Shopify apps or e-commerce APIs\n- Postgres and background job systems",
    location: "Provo, UT", workMode: "onsite", tokenCost: 3, isTechnical: true, status: "open",
    publishedAt: daysAgo(4), createdAt: daysAgo(6), updatedAt: daysAgo(4),
  },
  {
    id: "job-redo-product", companyId: "co-redo", title: "Software Engineer, Returns Product",
    description:
      "Redo helps e-commerce brands turn returns into exchanges and recover revenue, with a returns portal, shipping protection, and post-purchase tools built for Shopify.\n\nWe're hiring an early-career software engineer to build the product merchants and shoppers use after checkout.\n\nWhat you'll do:\n- Ship TypeScript and React features across the returns portal and merchant dashboard\n- Add AI-assisted tools that help merchants write return policies and answer shopper questions\n- Build interactive product UI, not just forms and tables\n- Own tests and CI so we can ship changes without breaking exchanges\n- Treat application security as part of the job on a platform that handles orders, refunds, and customer data",
    requirements:
      "- Shipped a web product in TypeScript and React (Next.js counts)\n- Built an AI or LLM feature into a real product\n- Testing or CI/CD experience from an internship, team, or project\n- Internship or project work in application security, internal tools, or automation\n- Comfort taking an idea from concept to a working product",
    location: "Provo, UT", workMode: "hybrid", tokenCost: 2, isTechnical: true, status: "open",
    publishedAt: daysAgo(1), createdAt: daysAgo(1), updatedAt: daysAgo(1),
  },
  {
    id: "job-redo-merchant-success", companyId: "co-redo", title: "Merchant Success Manager",
    description:
      "Redo helps e-commerce brands turn returns into exchanges and recover revenue.\n\nWhat you'll do:\n- Onboard new Shopify merchants to Redo\n- Grow exchange rates and retained revenue for your book\n- Turn merchant feedback into product requests",
    requirements:
      "- 2+ years in customer success or account management\n- E-commerce or Shopify experience\n- Comfortable with data and merchant reporting",
    location: "Provo, UT", workMode: "onsite", tokenCost: 1, isTechnical: false, status: "open",
    publishedAt: daysAgo(40), createdAt: daysAgo(42), updatedAt: daysAgo(40),
  },
];

// ---------- applicant_profiles (+ resumes, linkedin_imports) ----------

const linkedinFiles: NonNullable<ApplicantProfile["linkedin"]>["filesPresent"] = [
  "Profile", "Positions", "Skills", "Education", "Connections",
];

export const applicantProfiles: ApplicantProfile[] = [
  {
    id: DEMO_APPLICANT_ID, fullName: "Carter Lee", email: "carter@example.com", avatarUrl: null,
    headline: "Software Engineer · Backend and data", targetSeniority: "Mid / Senior", locationPref: "hybrid",
    resume: {
      id: "resume-carter", fileName: "carter-lee-resume.pdf", sizeBytes: 182_340, mimeType: "application/pdf", parseStatus: "succeeded",
      textContent:
        "CARTER LEE\nSoftware Engineer\n\nEXPERIENCE\nPodium — Software Engineer II (2022–present)\n- Built event-driven messaging services in Go and TypeScript handling 20M events/day\n- Moved billing reports to Postgres materialized views, cutting load time 60%\n\nQualtrics — Software Engineer (2020–2022)\n- Built React dashboards and contributed to the internal design system\n\nEDUCATION\nBrigham Young University — B.S. Computer Science\n\nSKILLS\nGo, TypeScript, Node.js, React, Postgres, Kafka, AWS",
    },
    linkedin: {
      id: "li-carter", status: "succeeded", filesPresent: [...linkedinFiles, "Rich_Media"],
      counts: { connections: 1428, companies: 342, positions: 4, skills: 24, education: 2, richMedia: 2 },
      profileCsv: DEMO_PROFILE_CSV,
      richMediaCsv: DEMO_RICH_MEDIA_CSV,
    },
  },
  {
    id: "user-avery", fullName: "Avery Chen", email: "avery@example.com", avatarUrl: null,
    headline: "Senior Backend Engineer · Marketplaces", targetSeniority: "Senior / Staff", locationPref: "remote",
    resume: {
      id: "resume-avery", fileName: "avery-chen-resume.pdf", sizeBytes: 141_200, mimeType: "application/pdf", parseStatus: "succeeded",
      textContent:
        "AVERY CHEN\nSenior Backend Engineer\n\nEXPERIENCE\nTuro — Senior Software Engineer (2019–present)\n- Led the booking and payouts services in Go for a two-sided rental marketplace\n- Built geospatial availability search on Postgres + PostGIS\n\nSKILLS\nGo, Node.js, Postgres, PostGIS, Elasticsearch, AWS",
    },
    linkedin: { id: "li-avery", status: "succeeded", filesPresent: linkedinFiles, counts: { connections: 812, companies: 210, positions: 3, skills: 18, education: 1 } },
  },
  {
    id: "user-sam-patel", fullName: "Sam Patel", email: "sam.patel@example.com", avatarUrl: null,
    headline: "Backend Engineer · Go", targetSeniority: "Senior", locationPref: "hybrid",
    resume: {
      id: "resume-sam-patel", fileName: "sam-patel-resume.pdf", sizeBytes: 128_900, mimeType: "application/pdf", parseStatus: "succeeded",
      textContent:
        "SAM PATEL\nBackend Engineer\n\nEXPERIENCE\nWeave — Software Engineer (2020–present)\n- Built Go microservices for scheduling and payments\n- Owned Postgres schema migrations for core services\n\nSKILLS\nGo, gRPC, Postgres, Redis, GCP",
    },
    linkedin: { id: "li-sam-patel", status: "succeeded", filesPresent: linkedinFiles, counts: { connections: 455, companies: 160, positions: 2, skills: 14, education: 1 } },
  },
  {
    id: "user-morgan", fullName: "Morgan Diaz", email: "morgan@example.com", avatarUrl: null,
    headline: "Staff Engineer · Search", targetSeniority: "Staff", locationPref: "remote",
    resume: {
      id: "resume-morgan", fileName: "morgan-diaz-resume.pdf", sizeBytes: 150_400, mimeType: "application/pdf", parseStatus: "succeeded",
      textContent:
        "MORGAN DIAZ\nStaff Engineer\n\nEXPERIENCE\nZillow — Staff Software Engineer (2018–present)\n- Led listing search relevance and geospatial ranking\n- Scaled search APIs to 40k QPS on Elasticsearch\n\nSKILLS\nTypeScript, Node.js, Java, Elasticsearch, Postgres",
    },
    linkedin: { id: "li-morgan", status: "succeeded", filesPresent: linkedinFiles, counts: { connections: 1210, companies: 300, positions: 4, skills: 22, education: 2 } },
  },
  {
    id: "user-riley", fullName: "Riley Brooks", email: "riley@example.com", avatarUrl: null,
    headline: "Software Engineer · Payments", targetSeniority: "Mid", locationPref: "onsite",
    resume: {
      id: "resume-riley", fileName: "riley-brooks-resume.pdf", sizeBytes: 119_700, mimeType: "application/pdf", parseStatus: "succeeded",
      textContent:
        "RILEY BROOKS\nSoftware Engineer\n\nEXPERIENCE\nDivvy — Software Engineer (2021–present)\n- Built card authorization services in Node.js\n- Maintained reconciliation jobs on Postgres\n\nSKILLS\nTypeScript, Node.js, Postgres, Kafka",
    },
    linkedin: { id: "li-riley", status: "succeeded", filesPresent: linkedinFiles, counts: { connections: 380, companies: 140, positions: 2, skills: 12, education: 1 } },
  },
  {
    id: "user-taylor", fullName: "Taylor Kim", email: "taylor@example.com", avatarUrl: null,
    headline: "Full-Stack Engineer", targetSeniority: "Mid", locationPref: "remote",
    resume: {
      id: "resume-taylor", fileName: "taylor-kim-resume.pdf", sizeBytes: 110_300, mimeType: "application/pdf", parseStatus: "succeeded",
      textContent:
        "TAYLOR KIM\nFull-Stack Engineer\n\nEXPERIENCE\nAgency work (2021–present)\n- Built React and Node.js sites for small business clients\n- Set up MySQL databases and REST APIs\n\nSKILLS\nJavaScript, React, Node.js, MySQL",
    },
    linkedin: { id: "li-taylor", status: "succeeded", filesPresent: linkedinFiles, counts: { connections: 260, companies: 95, positions: 3, skills: 10, education: 1 } },
  },
];

/** `connections`: Carter's LinkedIn connections at the seeded companies. */
export const connections: Connection[] = [
  { id: "conn-1", ownerId: DEMO_APPLICANT_ID, firstName: "Sarah", lastName: "Lin", position: "Engineering Manager", companyName: "Neighbor" },
  { id: "conn-2", ownerId: DEMO_APPLICANT_ID, firstName: "Alex", lastName: "Moreno", position: "Senior Software Engineer", companyName: "Neighbor" },
  { id: "conn-3", ownerId: DEMO_APPLICANT_ID, firstName: "Chris", lastName: "Owens", position: "Senior Data Engineer", companyName: "Waystar" },
  { id: "conn-4", ownerId: DEMO_APPLICANT_ID, firstName: "Ben", lastName: "Hatch", position: "Founding Engineer", companyName: "Redo" },
];

// ---------- applications (+ application_events) ----------
//
// Steve's pipeline for job-redo-product covers every ranking state:
//   Avery   shortlisted, complete     Morgan  repo review running (incomplete)
//   Carter  submitted, complete       Riley   repo review failed (incomplete)
//   Sam     submitted, complete       Taylor  rejected
// Carter spends 5 credits this month (3 Redo + 2 Waystar), so 5 of 10 are left.
// His Redo application is in the previous period and doesn't count.

const submitted = (at: string): Application["events"] => [{ fromStatus: null, toStatus: "submitted", at }];

export const applications: Application[] = [
  {
    id: "app-carter-neighbor", jobId: "job-redo-product", applicantId: DEMO_APPLICANT_ID, status: "submitted", tokenCost: 3,
    githubRepoUrl: "https://github.com/carterlee/storage-search", fitEvaluationId: "fit-carter-neighbor",
    submittedAt: thisMonth(30), updatedAt: thisMonth(30), events: submitted(thisMonth(30)),
  },
  {
    id: "app-carter-waystar", jobId: "job-waystar-claims", applicantId: DEMO_APPLICANT_ID, status: "submitted", tokenCost: 2,
    githubRepoUrl: "https://github.com/carterlee/claims-queue", fitEvaluationId: "fit-carter-waystar",
    submittedAt: thisMonth(20), updatedAt: thisMonth(20), events: submitted(thisMonth(20)),
  },
  {
    id: "app-carter-redo", jobId: "job-redo-merchant-success", applicantId: DEMO_APPLICANT_ID, status: "shortlisted", tokenCost: 1,
    githubRepoUrl: null, fitEvaluationId: null, submittedAt: priorPeriod(6), updatedAt: priorPeriod(2),
    events: [
      { fromStatus: null, toStatus: "submitted", at: priorPeriod(6) },
      { fromStatus: "submitted", toStatus: "shortlisted", at: priorPeriod(2) },
    ],
  },
  {
    id: "app-avery-neighbor", jobId: "job-redo-product", applicantId: "user-avery", status: "shortlisted", tokenCost: 3,
    githubRepoUrl: "https://github.com/averychen/booking-api", fitEvaluationId: "fit-avery-neighbor",
    submittedAt: hoursAgo(70), updatedAt: hoursAgo(5),
    events: [
      { fromStatus: null, toStatus: "submitted", at: hoursAgo(70) },
      { fromStatus: "submitted", toStatus: "shortlisted", at: hoursAgo(5), actorName: "Steve" },
    ],
  },
  {
    id: "app-sam-neighbor", jobId: "job-redo-product", applicantId: "user-sam-patel", status: "submitted", tokenCost: 3,
    githubRepoUrl: "https://github.com/sampatel/geo-index", fitEvaluationId: "fit-sam-neighbor",
    submittedAt: hoursAgo(50), updatedAt: hoursAgo(50), events: submitted(hoursAgo(50)),
  },
  {
    id: "app-morgan-neighbor", jobId: "job-redo-product", applicantId: "user-morgan", status: "submitted", tokenCost: 3,
    githubRepoUrl: "https://github.com/morgandiaz/listing-search", fitEvaluationId: "fit-morgan-neighbor",
    submittedAt: hoursAgo(3), updatedAt: hoursAgo(3), events: submitted(hoursAgo(3)),
  },
  {
    id: "app-riley-neighbor", jobId: "job-redo-product", applicantId: "user-riley", status: "submitted", tokenCost: 3,
    githubRepoUrl: "https://github.com/rileybrooks/payouts-service", fitEvaluationId: "fit-riley-neighbor",
    submittedAt: hoursAgo(26), updatedAt: hoursAgo(26), events: submitted(hoursAgo(26)),
  },
  {
    id: "app-taylor-neighbor", jobId: "job-redo-product", applicantId: "user-taylor", status: "rejected", tokenCost: 3,
    githubRepoUrl: "https://github.com/taylorkim/todo-api", fitEvaluationId: "fit-taylor-neighbor",
    submittedAt: hoursAgo(90), updatedAt: hoursAgo(40),
    events: [
      { fromStatus: null, toStatus: "submitted", at: hoursAgo(90) },
      { fromStatus: "submitted", toStatus: "rejected", at: hoursAgo(40), actorName: "Steve" },
    ],
  },
];

// ---------- fit_evaluations ----------

const neighborReqs = {
  scale: "5+ years building backend services at scale",
  lang: "Go or TypeScript/Node.js in production",
  data: "Postgres, search and geospatial queries",
  market: "Experience with two-sided marketplaces or payments",
};

const fitEvaluationRows: FitEvaluation[] = [
  {
    id: "fit-carter-neighbor", jobId: "job-redo-product", applicantId: DEMO_APPLICANT_ID, status: "succeeded",
    confidenceScore: 84, band: "good", createdAt: thisMonth(31),
    explanation:
      "Strong backend fit: Carter runs high-volume Go and TypeScript services at Podium and has real Postgres performance work. Geospatial search isn't evidenced, and he has about 4 years of experience against the 5+ asked. Two connections at Neighbor, including an engineering manager.",
    requirements: [
      { requirement: neighborReqs.scale, met: "partial", evidence: "About 4 years backend at Podium and Qualtrics; 20M events/day" },
      { requirement: neighborReqs.lang, met: "yes", evidence: "Go and TypeScript messaging services at Podium" },
      { requirement: neighborReqs.data, met: "partial", evidence: "Postgres materialized views; no geospatial work listed" },
      { requirement: neighborReqs.market, met: "partial", evidence: "Billing reports at Podium" },
    ],
  },
  {
    id: "fit-carter-waystar", jobId: "job-waystar-claims", applicantId: DEMO_APPLICANT_ID, status: "succeeded",
    confidenceScore: 82, band: "good", createdAt: thisMonth(21),
    explanation:
      "Solid backend experience with Postgres and event-driven messaging at Podium. Go and TypeScript are evidenced, but C#/.NET or Java is not. No direct healthcare claims experience.",
    requirements: [
      { requirement: "3+ years of backend engineering (C#/.NET or Java)", met: "partial", evidence: "4 years backend in Go and TypeScript" },
      { requirement: "SQL Server or Postgres, message queues", met: "yes", evidence: "Postgres views, Kafka messaging services" },
      { requirement: "Healthcare claims (EDI 837/835) experience a plus", met: "no", evidence: null },
    ],
  },
  {
    id: "fit-avery-neighbor", jobId: "job-redo-product", applicantId: "user-avery", status: "succeeded",
    confidenceScore: 92, band: "strong", createdAt: hoursAgo(71),
    explanation:
      "Direct match: Avery led booking and payouts for a two-sided rental marketplace in Go and built geospatial availability search on PostGIS.",
    requirements: [
      { requirement: neighborReqs.scale, met: "yes", evidence: "6+ years at Turo" },
      { requirement: neighborReqs.lang, met: "yes", evidence: "Go booking and payouts services" },
      { requirement: neighborReqs.data, met: "yes", evidence: "Postgres + PostGIS availability search" },
      { requirement: neighborReqs.market, met: "yes", evidence: "Turo rental marketplace" },
    ],
  },
  {
    id: "fit-sam-neighbor", jobId: "job-redo-product", applicantId: "user-sam-patel", status: "succeeded",
    confidenceScore: 76, band: "good", createdAt: hoursAgo(51),
    explanation: "Production Go and Postgres experience with payments exposure at Weave. No search or geospatial work, and no marketplace background.",
    requirements: [
      { requirement: neighborReqs.scale, met: "partial", evidence: "5 years at Weave" },
      { requirement: neighborReqs.lang, met: "yes", evidence: "Go microservices" },
      { requirement: neighborReqs.data, met: "partial", evidence: "Postgres migrations; no search" },
      { requirement: neighborReqs.market, met: "partial", evidence: "Payments services" },
    ],
  },
  {
    id: "fit-morgan-neighbor", jobId: "job-redo-product", applicantId: "user-morgan", status: "succeeded",
    confidenceScore: 88, band: "strong", createdAt: hoursAgo(4),
    explanation: "Deep listing search and geospatial ranking experience at Zillow, at high scale. Marketplace experience is adjacent rather than two-sided.",
    requirements: [
      { requirement: neighborReqs.scale, met: "yes", evidence: "Search APIs at 40k QPS" },
      { requirement: neighborReqs.lang, met: "yes", evidence: "TypeScript and Node.js" },
      { requirement: neighborReqs.data, met: "yes", evidence: "Geospatial ranking on Elasticsearch" },
      { requirement: neighborReqs.market, met: "partial", evidence: "Real-estate listings" },
    ],
  },
  {
    id: "fit-riley-neighbor", jobId: "job-redo-product", applicantId: "user-riley", status: "succeeded",
    confidenceScore: 66, band: "moderate", createdAt: hoursAgo(27),
    explanation: "Node.js payments experience at Divvy is relevant, but seniority is below the bar and search work isn't evidenced.",
    requirements: [
      { requirement: neighborReqs.scale, met: "no", evidence: "About 3 years of experience" },
      { requirement: neighborReqs.lang, met: "yes", evidence: "Node.js authorization services" },
      { requirement: neighborReqs.data, met: "partial", evidence: "Postgres reconciliation jobs" },
      { requirement: neighborReqs.market, met: "yes", evidence: "Card payments at Divvy" },
    ],
  },
  {
    id: "fit-taylor-neighbor", jobId: "job-redo-product", applicantId: "user-taylor", status: "succeeded",
    confidenceScore: 48, band: "limited", createdAt: hoursAgo(91),
    explanation: "Agency full-stack work with small-scale MySQL APIs. Little evidence of backend services at scale, Postgres, or marketplaces.",
    requirements: [
      { requirement: neighborReqs.scale, met: "no", evidence: null },
      { requirement: neighborReqs.lang, met: "partial", evidence: "Node.js REST APIs" },
      { requirement: neighborReqs.data, met: "no", evidence: "MySQL only" },
      { requirement: neighborReqs.market, met: "no", evidence: null },
    ],
  },
];

export const fitEvaluations: FitEvaluation[] = fitEvaluationRows.map((fit) => {
  if (fit.confidenceScore == null) return fit;
  const confidence = fit.confidenceScore;
  return {
    ...fit,
    sourceScores: {
      richMedia: Math.min(100, Math.max(0, confidence - 3)),
      profile: Math.min(100, Math.max(0, confidence + 1)),
      resume: Math.min(100, Math.max(0, confidence + 4)),
    },
  };
});

// ---------- repo_evaluations ----------

const repoBase = (applicationId: string, repoUrl: string) => ({
  id: applicationId.replace("app-", "repo-"),
  applicationId,
  repoUrl,
  repoFullName: repoUrl.replace("https://github.com/", ""),
});

const scored = (
  applicationId: string,
  repoUrl: string,
  scores: RepoScores,
  rationale: Partial<Record<RepoCategory, string>>,
  commitSha: string,
  flags: string[] = [],
): RepoEvaluation => ({
  ...repoBase(applicationId, repoUrl),
  status: "succeeded",
  scores,
  overall:
    (scores.dataArchitecture + scores.performance + scores.deployment + scores.codeQuality + scores.teamTopology) / 5,
  rationale,
  commitSha,
  flags,
  failureCode: null,
});

export const repoEvaluations: RepoEvaluation[] = [
  scored("app-carter-neighbor", "https://github.com/carterlee/storage-search",
    { dataArchitecture: 7, performance: 7, deployment: 5, codeQuality: 8, teamTopology: 7 },
    {
      dataArchitecture: "Uses a pooled Postgres client and indexed queries.",
      performance: "Indexed queries keep search reads bounded.",
      deployment: "No CI workflow found for this repo.",
      codeQuality: "Secrets come from env; request bodies are validated with zod. Unit tests cover the search service.",
      teamTopology: "Clear split between routes, services and data access.",
    },
    "3f9c2a71b4e8d05c6a1f7e2b9d4c8a0e5b6f1c2d"),
  scored("app-carter-waystar", "https://github.com/carterlee/claims-queue",
    { dataArchitecture: 7, performance: 7, deployment: 6, codeQuality: 7, teamTopology: 8 },
    {
      dataArchitecture: "Claim records move through an explicit queue and Postgres.",
      performance: "Batch processing with bounded concurrency.",
      deployment: "Dependencies are pinned; no deploy config in the repo.",
      codeQuality: "No secrets committed. Table-driven tests cover the claim parser.",
      teamTopology: "Queue workers and handlers are well separated.",
    },
    "8a1d4e6f2c9b07e3d5a8f1c4b6e9d2a7c0f3b5e8"),
  scored("app-avery-neighbor", "https://github.com/averychen/booking-api",
    { dataArchitecture: 8, performance: 8, deployment: 7, codeQuality: 9, teamTopology: 8 },
    {
      dataArchitecture: "Parameterized SQL and a clear booking data model.",
      performance: "Bounded worker pools and connection pooling.",
      deployment: "A CI workflow builds and tests the service.",
      codeQuality: "Auth middleware on every route; good unit coverage.",
      teamTopology: "Idiomatic Go layout (cmd/, internal/, pkg/).",
    },
    "c4e7a2b9d1f60e8c3a5b7d9f2e4c6a8b0d1f3e5a"),
  scored("app-sam-neighbor", "https://github.com/sampatel/geo-index",
    { dataArchitecture: 6, performance: 6, deployment: 5, codeQuality: 6, teamTopology: 7 },
    {
      dataArchitecture: "Index rows are stored in SQL, with some N+1 queries in the builder.",
      performance: "Some N+1 queries in the index builder.",
      deployment: "Few tests and no CI configuration.",
      codeQuality: "Input validation is partial on HTTP handlers.",
      teamTopology: "Reasonable package boundaries.",
    },
    "1b3d5f7a9c2e4b6d8f0a1c3e5b7d9f2a4c6e8b0d",
    ["fork"]),
  { ...repoBase("app-morgan-neighbor", "https://github.com/morgandiaz/listing-search"),
    status: "running", scores: null, overall: null, rationale: {}, commitSha: null, flags: [], failureCode: null },
  { ...repoBase("app-riley-neighbor", "https://github.com/rileybrooks/payouts-service"),
    status: "failed", scores: null, overall: null, rationale: {}, commitSha: null, flags: [], failureCode: "not_found_or_private" },
  scored("app-taylor-neighbor", "https://github.com/taylorkim/todo-api",
    { dataArchitecture: 4, performance: 4, deployment: 3, codeQuality: 4, teamTopology: 5 },
    {
      dataArchitecture: "Small MySQL schema with credentials hard-coded in config.js.",
      performance: "No pooling; synchronous file I/O on requests.",
      deployment: "No tests and no CI configuration.",
      codeQuality: "Database credentials are hard-coded in config.js.",
      teamTopology: "Most logic lives in a single server file.",
    },
    "9e2c4a6b8d0f1e3c5a7b9d2f4e6a8c0b1d3f5e7a"),
];

/** Users who finished onboarding (in Supabase: derived from applicant_profiles / memberships). */
export const onboardedUserIds: string[] = [
  DEMO_APPLICANT_ID,
  DEMO_RECRUITER_ID,
  ...applicantProfiles.filter((a) => a.id !== DEMO_APPLICANT_ID).map((a) => a.id),
];
