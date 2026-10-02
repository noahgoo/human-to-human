export const FIT_SOURCES = ["richMedia", "profile", "github", "resume"] as const;
export type FitSource = (typeof FIT_SOURCES)[number];

export const FIT_AGENTS = ["engineeringHiringManager", "dataHiringManager", "resumeAnalyst"] as const;
export type FitAgent = (typeof FIT_AGENTS)[number];

/** Which evidence each agent may score. Resume is only for the resume analyst. */
export const AGENT_SOURCES: Record<FitAgent, readonly FitSource[]> = {
  engineeringHiringManager: ["richMedia", "profile", "github"],
  dataHiringManager: ["richMedia", "profile", "github"],
  resumeAnalyst: ["resume"],
};

/** Ordered low to high. Index 0 is no fit; index 4 is the candidate has done this work. */
export const FIT_CRITERIA = [
  "No supporting evidence that the candidate meets the job requirements.",
  "Only weak or adjacent evidence, with the core requirements missing.",
  "Partial evidence for some requirements, with important gaps.",
  "Clear evidence for most requirements.",
  "The evidence shows the candidate has done this work.",
] as const;

const JEV_COMPARE_SOURCES = ["richMedia", "profile", "resume"] as const;

/** Agents and sources for a fit check that uses only resume, profile, and rich media. */
export function jevCompareCalls(evidence: Record<(typeof JEV_COMPARE_SOURCES)[number], string>) {
  return FIT_AGENTS.flatMap((agent) =>
    AGENT_SOURCES[agent]
      .filter((source): source is (typeof JEV_COMPARE_SOURCES)[number] =>
        (JEV_COMPARE_SOURCES as readonly string[]).includes(source),
      )
      .map((source) => ({ agent, source, text: evidence[source] }))
      .filter((call) => call.text.trim().length > 0),
  );
}

export const AGENT_INSTRUCTIONS: Record<FitAgent, string> = {
  engineeringHiringManager:
    "You are a hiring manager for the role in state.jobTitle. Using only state.evidence, judge how well the candidate meets the job requirements. Weigh building, shipping, and systems work. Ignore name, school, photos, and location.",
  dataHiringManager:
    "You are a hiring manager for the role in state.jobTitle. Using only state.evidence, judge how well the candidate meets the job requirements. Weigh analysis, modeling, experimentation, and data work. Ignore name, school, photos, and location.",
  resumeAnalyst:
    "You are a hiring analyst. Using only state.evidence (the candidate resume), judge how well the candidate meets state.jobTitle and state.jobRequirements. Match skills, experience, and projects to the posting. Ignore name, gender, age, photos, address, and school prestige.",
};
