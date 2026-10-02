import { z } from "zod";

export const jobInputSchema = z.object({
  title: z.string().trim().min(5, "Enter at least 5 characters.").max(120, "Keep the title under 120 characters."),
  location: z.string().trim().max(120, "Keep the location under 120 characters."),
  workMode: z.enum(["remote", "hybrid", "onsite"], { error: "Choose a work mode." }),
  description: z
    .string()
    .trim()
    .min(50, "Add at least 50 characters.")
    .max(20_000, "Keep the description under 20,000 characters."),
  requirements: z
    .string()
    .trim()
    .min(1, "Add requirements.")
    .max(10_000, "Keep requirements under 10,000 characters."),
  isTechnical: z.boolean(),
  tokenCost: z.union([z.literal(1), z.literal(2), z.literal(3)]),
});

export type JobInput = z.infer<typeof jobInputSchema>;

export function zodFieldErrors(error: z.ZodError): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "");
    if (key && !fields[key]) fields[key] = issue.message;
  }
  return fields;
}
