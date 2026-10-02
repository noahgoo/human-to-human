export function BlockedDomains({ domains }: { domains: string[] }) {
  return (
    <section className="rounded-xl border bg-card p-4 shadow-1">
      <h2 className="text-h3">Blocked email domains</h2>
      <p className="mt-1 text-body text-copy">Free-mail domains cannot be used to verify a company.</p>
      <ul className="mt-3 flex flex-wrap gap-2">
        {domains.map((domain) => (
          <li key={domain} className="rounded-md border bg-muted px-2 py-0.5 font-mono text-code text-foreground">
            {domain}
          </li>
        ))}
      </ul>
    </section>
  );
}
