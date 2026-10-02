import { format, parseISO } from "date-fns";
import { Check } from "lucide-react";
import type { ApplicationStatus } from "@/lib/types";

const LABEL: Record<ApplicationStatus, string> = {
  submitted: "Submitted",
  shortlisted: "Shortlisted",
  rejected: "Not selected",
  withdrawn: "Withdrawn",
};

export function ApplicationTimeline({ events }: { events: { toStatus: ApplicationStatus; at: string }[] }) {
  return (
    <ol className="mt-4 space-y-0">
      {events.map((event, index) => {
        const when = format(parseISO(event.at), "MMM d, yyyy");
        return (
          <li key={`${event.toStatus}-${event.at}`} className="relative flex gap-3 pb-6 last:pb-0">
            {index < events.length - 1 && <span className="absolute top-6 left-[11px] h-[calc(100%-12px)] w-px bg-border" aria-hidden />}
            <span className="relative z-10 flex size-6 shrink-0 items-center justify-center rounded-full border bg-card text-success">
              <Check className="size-3.5" aria-hidden />
            </span>
            <div>
              <p className="text-body font-medium text-foreground">{LABEL[event.toStatus]}</p>
              <time dateTime={event.at} className="text-small text-muted-foreground">
                {when}
              </time>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
