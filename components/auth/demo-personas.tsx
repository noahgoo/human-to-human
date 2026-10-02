import Link from "next/link";

const PERSONAS = [
  { href: "/demo?role=applicant", label: "Jordan, applicant" },
  { href: "/demo?role=applicant_new", label: "Casey, new applicant (onboarding)" },
  { href: "/demo?role=bobby", label: "Bobby, onboarding" },
  { href: "/demo?role=recruiter", label: "Priya, verified recruiter" },
  { href: "/demo?role=recruiter_new", label: "Sam, new recruiter (onboarding)" },
  { href: "/demo?role=admin", label: "Admin" },
] as const;

export function DemoPersonas() {
  return (
    <section aria-labelledby="demo-personas-heading" className="mt-8 rounded-xl border bg-muted p-4">
      <h2 id="demo-personas-heading" className="text-h3">
        Demo personas
      </h2>
      <p className="mt-1 text-small font-normal text-copy">Jump in as a sample user. No account is created.</p>
      <ul className="mt-3 grid gap-2">
        {PERSONAS.map((persona) => (
          <li key={persona.href}>
            <Link
              href={persona.href}
              className="flex min-h-11 items-center rounded-md border bg-card px-3 py-2 text-body text-foreground outline-none hover:border-border-strong focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              {persona.label}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
