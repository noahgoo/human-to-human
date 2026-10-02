export const REPO_TOPICS = [
  {
    id: "dataArchitecture",
    label: "Data Architecture & Management",
    subtopics: [
      {
        id: "dataFlowStorage",
        label: "Data Flow & Storage",
        criterion:
          "How data moves between systems, where it is stored, and which database models (SQL vs. NoSQL) are used.",
      },
      {
        id: "consistencyCompliance",
        label: "Consistency & Compliance",
        criterion:
          "Methods for ensuring data integrity, retention policies, and compliance with data privacy regulations like GDPR or CCPA.",
      },
    ],
  },
  {
    id: "scalability",
    label: "Scalability, Performance & Reliability",
    subtopics: [
      {
        id: "throughputLatency",
        label: "Throughput & Latency",
        criterion:
          "System performance under normal and peak loads, response times, and API bottlenecks.",
      },
      {
        id: "highAvailability",
        label: "High Availability",
        criterion:
          "Failover mechanisms, disaster recovery plans, multi-region deployment strategies, and backup frequency.",
      },
      {
        id: "resourceOptimization",
        label: "Resource Optimization",
        criterion:
          "Cost and efficiency of cloud infrastructure, caching strategies (e.g., Redis), and database indexing.",
      },
    ],
  },
  {
    id: "codeQuality",
    label: "Code Quality & Maintainability",
    subtopics: [
      {
        id: "standardsPatterns",
        label: "Standards & Patterns",
        criterion:
          "Adherence to clean coding practices, design patterns, and language-specific style guides.",
      },
      {
        id: "testCoverage",
        label: "Test Coverage",
        criterion:
          "Presence and effectiveness of automated testing suites (unit, integration, and end-to-end tests).",
      },
      {
        id: "technicalDebt",
        label: "Technical Debt",
        criterion:
          "Documentation of legacy code areas, known bugs, outdated frameworks, and refactoring priorities.",
      },
    ],
  },
  {
    id: "cicd",
    label: "CI/CD, Deployment & Operations",
    subtopics: [
      {
        id: "automationPipelines",
        label: "Automation Pipelines",
        criterion: "Reliability of the continuous integration and continuous deployment builds.",
      },
      {
        id: "observabilityMonitoring",
        label: "Observability & Monitoring",
        criterion:
          "Effectiveness of live logging, health check alerts, and metric dashboards (e.g., Prometheus, Grafana).",
      },
      {
        id: "infrastructureAsCode",
        label: "Infrastructure as Code (IaC)",
        criterion:
          "Use of automated configuration tools (e.g., Terraform) to manage environments instead of manual setups.",
      },
    ],
  },
  {
    id: "teamTopology",
    label: "Team Topology & Governance",
    subtopics: [
      {
        id: "documentation",
        label: "Documentation",
        criterion:
          "Completeness of API documentation, architectural decision records (ADRs), and setup guides.",
      },
      {
        id: "onboardingOwnership",
        label: "Onboarding & Ownership",
        criterion:
          "Clear code ownership boundaries among feature teams and ease of onboarding for new developers.",
      },
    ],
  },
] as const;

export type RepoTopicId = (typeof REPO_TOPICS)[number]["id"];
export type RepoSubtopicId = (typeof REPO_TOPICS)[number]["subtopics"][number]["id"];

export const REPO_SUBTOPICS = REPO_TOPICS.flatMap((topic) =>
  topic.subtopics.map((subtopic) => ({ ...subtopic, topicId: topic.id })),
);

export type SubtopicJudgement = {
  score: number;
  evidence: string;
};

export type GithubTopicScore = {
  id: RepoTopicId;
  label: string;
  score: number;
  subtopics: Array<{ id: RepoSubtopicId; label: string; score: number; evidence: string }>;
};

export type GithubReview = {
  status: "succeeded";
  login: string;
  repos: string[];
  filesReviewed: number;
  model: string;
  overall: number;
  topics: GithubTopicScore[];
};

export function rollupTopicScores(
  judgements: Record<string, SubtopicJudgement>,
): { overall: number; topics: GithubTopicScore[] } {
  const topics = REPO_TOPICS.map((topic) => {
    const subtopics = topic.subtopics.map((subtopic) => {
      const judgement = judgements[subtopic.id];
      if (!judgement) throw new Error(`Missing score for ${subtopic.id}`);
      return {
        id: subtopic.id,
        label: subtopic.label,
        score: clampScore(judgement.score),
        evidence: judgement.evidence.slice(0, 400),
      };
    });
    return {
      id: topic.id,
      label: topic.label,
      score: meanRounded(subtopics.map((subtopic) => subtopic.score)),
      subtopics,
    };
  });
  return { overall: meanRounded(topics.map((topic) => topic.score)), topics };
}

function clampScore(score: number): number {
  return Math.min(100, Math.max(1, Math.round(score)));
}

function meanRounded(scores: number[]): number {
  const total = scores.reduce((sum, score) => sum + score, 0);
  return Math.round(total / scores.length);
}
