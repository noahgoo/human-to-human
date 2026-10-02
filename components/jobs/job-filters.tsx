"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function JobFilters({
  q,
  technical,
  maxCost,
}: {
  q: string;
  technical: boolean;
  maxCost: string;
}) {
  const router = useRouter();
  const [query, setQuery] = useState(q);

  useEffect(() => {
    setQuery(q);
  }, [q]);

  useEffect(() => {
    if (query.trim() === q.trim()) return;
    const handle = window.setTimeout(() => {
      const params = new URLSearchParams();
      const trimmed = query.trim();
      if (trimmed) params.set("q", trimmed);
      if (technical) params.set("technical", "1");
      if (maxCost === "1" || maxCost === "2" || maxCost === "3") params.set("maxCost", maxCost);
      const search = params.toString();
      router.replace(search ? `/jobs?${search}` : "/jobs", { scroll: false });
    }, 300);
    return () => window.clearTimeout(handle);
  }, [query, q, technical, maxCost, router]);

  function replace(next: { technical?: boolean; maxCost?: string }) {
    const params = new URLSearchParams();
    const trimmed = query.trim();
    const tech = next.technical ?? technical;
    const cost = next.maxCost ?? maxCost;
    if (trimmed) params.set("q", trimmed);
    if (tech) params.set("technical", "1");
    if (cost === "1" || cost === "2" || cost === "3") params.set("maxCost", cost);
    const search = params.toString();
    router.replace(search ? `/jobs?${search}` : "/jobs", { scroll: false });
  }

  return (
    <form
      className="flex flex-col gap-3 rounded-xl border bg-card p-4 shadow-1 lg:flex-row lg:items-end"
      onSubmit={(event) => event.preventDefault()}
    >
      <div className="relative min-w-0 flex-1 space-y-1.5">
        <Label htmlFor="job-search">Search jobs</Label>
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            id="job-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by role or company"
            className="h-[38px] rounded-md pl-9"
          />
        </div>
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <button
          type="button"
          aria-pressed={technical}
          onClick={() => replace({ technical: !technical })}
          className={`inline-flex h-[38px] items-center rounded-md border px-3 text-small focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 ${
            technical
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border bg-card text-foreground hover:border-border-strong hover:bg-muted"
          }`}
        >
          Technical only
        </button>
        <div className="space-y-1.5">
          <Label htmlFor="max-cost">Max credits</Label>
          <select
            id="max-cost"
            value={maxCost}
            onChange={(event) => replace({ maxCost: event.target.value })}
            className="h-[38px] rounded-md border border-border bg-card px-2 text-small text-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            <option value="">Any</option>
            <option value="1">1 credit</option>
            <option value="2">2 credits or fewer</option>
            <option value="3">3 credits or fewer</option>
          </select>
        </div>
      </div>
    </form>
  );
}
