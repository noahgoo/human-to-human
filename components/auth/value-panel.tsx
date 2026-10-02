import { Code2, Coins, Users } from "lucide-react";
import { BRAND } from "@/lib/copy";

const POINTS = [
  {
    title: "10 monthly application credits",
    body: "Every month starts with 10 credits. Jobs cost 1–3 credits to apply.",
    icon: Coins,
    className: "border-token/20 bg-token-subtle text-token-fg",
  },
  {
    title: "See your connections at each company",
    body: "Your LinkedIn export shows who you know before you spend a credit.",
    icon: Users,
    className: "border-success/20 bg-success-subtle text-success-fg",
  },
  {
    title: "Recruiter-side GitHub code reviews",
    body: "On technical roles, recruiters can review a public repository.",
    icon: Code2,
    className: "border-border bg-card text-foreground",
  },
] as const;

export function ValuePanel() {
  return (
    <aside className="flex flex-col border-b bg-muted p-5 sm:p-8 lg:col-span-5 lg:border-r lg:border-b-0 lg:p-12">
      <div>
        <div className="mb-6 flex items-center gap-2.5 lg:mb-8">
          <span className="flex size-9 items-center justify-center rounded-md bg-primary text-small font-bold text-primary-foreground">
            N
          </span>
          <span className="text-h3 font-bold tracking-tight">{BRAND}</span>
        </div>
        <h1 className="text-h2 leading-snug sm:text-h1">Career connections built for tech talent.</h1>
        <p className="mt-3 text-body text-copy">Check your fit for free, then apply with credits.</p>
        <ul className="mt-8 space-y-5 lg:mt-10 lg:space-y-6">
          {POINTS.map((point) => (
            <li key={point.title} className="flex items-start gap-3">
              <span className={`flex size-8 shrink-0 items-center justify-center rounded-md border ${point.className}`}>
                <point.icon className="size-4" aria-hidden />
              </span>
              <span>
                <span className="block text-small font-semibold text-foreground">{point.title}</span>
                <span className="mt-0.5 block text-small font-normal text-muted-foreground">{point.body}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </aside>
  );
}
