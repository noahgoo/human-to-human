import type { FitBand } from "@/lib/types";
import { bandFor } from "@/lib/ranking/bands";
import type { FitAgent, FitSource } from "@/lib/ai/jev/agents";

const ANCHORS = 5;

export type SourceScore = {
  score: number;
  distribution: number[];
};

export type AgentFit = {
  confidenceScore: number;
  sources: Partial<Record<FitSource, SourceScore>>;
};

export type FitPreview = {
  confidenceScore: number;
  band: FitBand;
  agents: Partial<Record<FitAgent, AgentFit>>;
};

export function distributionFromAnswer(answer: {
  probabilities?: Record<string, number> | number[];
  distribution?: number[];
}): number[] {
  const raw = answer.distribution ?? answer.probabilities;
  if (!raw) throw new Error("Jev score answer has no distribution");
  const bins = Array.from({ length: ANCHORS }, () => 0);
  if (Array.isArray(raw)) {
    raw.forEach((value, index) => {
      if (index < ANCHORS && typeof value === "number") bins[index] = value;
    });
  } else {
    for (const [key, value] of Object.entries(raw)) {
      const index = Number(key);
      if (Number.isInteger(index) && index >= 0 && index < ANCHORS && typeof value === "number") {
        bins[index] = value;
      }
    }
  }
  return normalize(bins);
}

export function confidenceFromDistribution(distribution: number[]): number {
  const bins = normalize(distribution);
  const expected = bins.reduce((sum, probability, index) => sum + probability * index, 0);
  return Math.round((expected / (bins.length - 1)) * 100);
}

export function aggregateFit(
  parts: Array<{ agent: FitAgent; source: FitSource; distribution: number[] }>,
): FitPreview {
  const agents: Partial<Record<FitAgent, AgentFit>> = {};
  for (const part of parts) {
    const score = confidenceFromDistribution(part.distribution);
    const agent = agents[part.agent] ?? { confidenceScore: 0, sources: {} };
    agent.sources[part.source] = {
      score,
      distribution: part.distribution.map((value) => Math.round(value * 10_000) / 10_000),
    };
    agents[part.agent] = agent;
  }

  const agentScores: number[] = [];
  for (const agent of Object.values(agents)) {
    const scores = Object.values(agent.sources).map((source) => source.score);
    if (scores.length === 0) continue;
    agent.confidenceScore = meanRounded(scores);
    agentScores.push(agent.confidenceScore);
  }
  if (agentScores.length === 0) {
    throw new Error("Not enough profile, rich media, or GitHub evidence to score.");
  }
  const confidenceScore = meanRounded(agentScores);
  return { confidenceScore, band: bandFor(confidenceScore), agents };
}

function meanRounded(scores: number[]): number {
  const total = scores.reduce((sum, score) => sum + score, 0);
  return Math.round(total / scores.length);
}

function normalize(bins: number[]): number[] {
  if (bins.length !== ANCHORS) throw new Error("Jev score distribution must have 5 anchors");
  const sum = bins.reduce((total, value) => total + value, 0);
  if (!(sum > 0) || bins.some((value) => value < 0)) {
    throw new Error("Jev score distribution is empty");
  }
  return bins.map((value) => value / sum);
}
