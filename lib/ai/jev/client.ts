import "server-only";

import { z } from "zod";
import { openRouterHeaders } from "@/lib/ai/openrouter";
import { AGENT_INSTRUCTIONS, FIT_CRITERIA, type FitAgent, type FitSource } from "@/lib/ai/jev/agents";
import { distributionFromAnswer } from "@/lib/ai/jev/score";

const DECISIONS_URL = "https://openrouter.ai/api/alpha/decisions";
const MODEL = "typesafe/jev-1.13";

const probabilityMap = z.record(z.string(), z.number());

const ScoreAnswer = z.object({
  type: z.literal("score"),
  probabilities: z.union([z.array(z.number()), probabilityMap]).optional(),
  distribution: z.array(z.number()).optional(),
});

const DecisionsResponse = z.object({
  answers: z.object({
    fit: ScoreAnswer,
  }),
});

export class JevError extends Error {
  constructor(
    readonly code: "missing_key" | "rejected" | "unavailable",
    message: string,
  ) {
    super(message);
    this.name = "JevError";
  }
}

export type FitCall = {
  agent: FitAgent;
  source: FitSource;
  jobTitle: string;
  jobRequirements: string;
  evidence: string;
};

export async function scoreEvidence(call: FitCall): Promise<number[]> {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new JevError("missing_key", "OPENROUTER_API_KEY is not set");

  const body = {
    model: MODEL,
    state: {
      agent: call.agent,
      jobTitle: call.jobTitle,
      jobRequirements: call.jobRequirements,
      source: call.source,
      evidence: call.evidence,
    },
    questions: {
      fit: {
        type: "score",
        instructions: AGENT_INSTRUCTIONS[call.agent],
        criteria: [...FIT_CRITERIA],
      },
    },
  };

  let lastStatus = 0;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    let response: Response;
    try {
      response = await fetch(DECISIONS_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
          ...openRouterHeaders(),
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(30_000),
      });
    } catch (error) {
      if (attempt === 0) continue;
      const message = error instanceof Error ? error.message : "Jev request failed";
      throw new JevError("unavailable", message);
    }
    if (response.ok) {
      const json: unknown = await response.json();
      const parsed = DecisionsResponse.safeParse(json);
      if (!parsed.success) throw new JevError("rejected", "Jev returned an unexpected score");
      return distributionFromAnswer(parsed.data.answers.fit);
    }
    lastStatus = response.status;
    if (response.status !== 429 && response.status < 500) {
      throw new JevError("rejected", `Jev rejected the request (${response.status})`);
    }
  }
  throw new JevError("unavailable", `Jev was unavailable (${lastStatus})`);
}
