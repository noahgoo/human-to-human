"use client";

import { useState } from "react";
import Link from "next/link";
import { Users } from "lucide-react";

export interface ConnectionPerson {
  id: string;
  firstName: string;
  lastName: string;
  position: string | null;
}

function shortName(person: ConnectionPerson) {
  const initial = person.lastName.trim().charAt(0);
  return initial ? `${person.firstName} ${initial}.` : person.firstName;
}

export function ConnectionsCallout({
  connections,
  total,
  companyName,
  hasLinkedInImport,
  isLoading,
  isError,
}: {
  connections: ConnectionPerson[];
  total: number;
  companyName: string;
  hasLinkedInImport: boolean;
  isLoading?: boolean;
  isError?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);

  if (isError) return null;

  if (!hasLinkedInImport) {
    return (
      <p className="rounded-lg border border-border bg-muted px-3.5 py-2.5 text-small text-copy">
        Re-upload your LinkedIn export to check fit and see connections.{" "}
        <Link href="/profile" className="font-medium text-link underline-offset-4 hover:underline">
          Go to profile
        </Link>
      </p>
    );
  }

  if (isLoading) {
    return (
      <p className="rounded-lg border border-border bg-muted px-3.5 py-2.5 text-small text-muted-foreground">
        Looking up connections at {companyName}…
      </p>
    );
  }

  if (total === 0) {
    return (
      <p className="rounded-lg border border-border bg-muted px-3.5 py-2.5 text-small text-copy">
        No connections at {companyName} yet.
      </p>
    );
  }

  const preview = connections.slice(0, 2);
  const extra = total - preview.length;
  const noun = total === 1 ? "connection works" : "connections work";

  return (
    <div className="rounded-lg border border-border bg-muted px-3.5 py-2.5 text-small text-copy">
      <p className="flex items-start gap-2">
        <Users className="mt-0.5 size-4 shrink-0 text-foreground" aria-hidden />
        <span>
          <span className="font-semibold text-foreground">
            {total} {noun} at {companyName}:
          </span>{" "}
          {preview.map(shortName).join(", ")}
          {extra > 0 ? ` +${extra}` : ""}
        </span>
      </p>
      {total > preview.length && (
        <button
          type="button"
          onClick={() => setExpanded((open) => !open)}
          className="mt-1 ml-6 font-medium text-link underline-offset-4 hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
          aria-expanded={expanded}
        >
          {expanded ? "Show less" : "Show all"}
        </button>
      )}
      {expanded && (
        <ul className="mt-2 ml-6 space-y-1">
          {connections.map((person) => (
            <li key={person.id}>
              {person.firstName} {person.lastName}
              {person.position ? <span className="text-muted-foreground"> · {person.position}</span> : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
