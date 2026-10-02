import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

const STEPS = [
  { n: 1, label: "Account & role" },
  { n: 2, label: "Upload data" },
  { n: 3, label: "Review & finish" },
] as const;

export function OnboardingStepper({ current }: { current: 1 | 2 | 3 }) {
  return (
    <nav aria-label="Onboarding" className="rounded-xl border bg-card p-2 shadow-1">
      <ol className="grid grid-cols-3 gap-2">
        {STEPS.map((step) => {
          const done = step.n < current;
          const active = step.n === current;
          return (
            <li
              key={step.n}
              aria-current={active ? "step" : undefined}
              className={cn(
                "flex min-w-0 items-center gap-2 rounded-lg px-2 py-2 sm:gap-3 sm:px-3",
                done && "border border-success/20 bg-success-subtle",
                active && "bg-primary text-primary-foreground shadow-1",
                !done && !active && "bg-muted text-muted-foreground",
              )}
            >
              <span
                className={cn(
                  "flex size-6 shrink-0 items-center justify-center rounded-full font-mono text-code",
                  done && "bg-success text-primary-foreground",
                  active && "bg-card text-foreground",
                  !done && !active && "bg-border text-copy",
                )}
                aria-hidden
              >
                {done ? <Check className="size-3.5" /> : step.n}
              </span>
              <span className="min-w-0">
                <span
                  className={cn(
                    "hidden text-small tracking-wide uppercase sm:block",
                    active ? "text-primary-foreground/80" : done ? "text-success-fg" : "text-muted-foreground",
                  )}
                >
                  {done ? "Done" : active ? "In progress" : `Step ${step.n}`}
                </span>
                <span className={cn("block truncate text-small font-semibold", !active && !done && "text-copy")}>
                  {step.label}
                </span>
              </span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
