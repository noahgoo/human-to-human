import { format } from "date-fns";
import type { ApplicationEvent } from "@/lib/types";

function eventLabel(event: ApplicationEvent): string {
  if (event.toStatus === "submitted" && event.fromStatus) return "Moved back to New";
  if (event.toStatus === "submitted") return "Applied";
  if (event.toStatus === "shortlisted" && event.fromStatus === "rejected") return "Reconsidered";
  if (event.toStatus === "shortlisted") return "Shortlisted";
  if (event.toStatus === "rejected") return "Rejected";
  return "Withdrawn";
}

export function ApplicantTimeline({ events }: { events: ApplicationEvent[] }) {
  return (
    <section>
      <h2 className="text-h3">Status history</h2>
      <ol className="mt-3 space-y-3 border-l border-border pl-4">
        {events.map((event) => (
          <li key={`${event.at}-${event.toStatus}`} className="relative">
            <span className="absolute top-1.5 -left-[21px] size-2 rounded-full bg-foreground" aria-hidden />
            <p className="text-small text-foreground">{eventLabel(event)}</p>
            <p className="text-small text-muted-foreground">
              {format(new Date(event.at), "MMM d, yyyy 'at' p")}
              {event.actorName ? ` · ${event.actorName}` : ""}
            </p>
          </li>
        ))}
      </ol>
    </section>
  );
}
