"use client";

import { formatCredits } from "@/lib/copy";
import type { TokenCost } from "@/lib/types";
import { cn } from "@/lib/utils";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

const OPTIONS: { cost: TokenCost; blurb: string }[] = [
  { cost: 1, blurb: "Low barrier. Expect more applications." },
  { cost: 2, blurb: "A balance of reach and intent." },
  { cost: 3, blurb: "High bar. Fewer, more deliberate applications." },
];

export function TokenCostSelector({
  value,
  onChange,
  disabled,
  describedBy,
}: {
  value: TokenCost;
  onChange: (cost: TokenCost) => void;
  disabled?: boolean;
  describedBy?: string;
}) {
  return (
    <RadioGroup
      value={String(value)}
      onValueChange={(next) => onChange(Number(next) as TokenCost)}
      disabled={disabled}
      aria-describedby={describedBy}
      className="grid grid-cols-1 gap-3 sm:grid-cols-3"
    >
      {OPTIONS.map((option) => {
        const selected = value === option.cost;
        return (
          <label
            key={option.cost}
            className={cn(
              "flex cursor-pointer flex-col gap-2 rounded-lg border bg-card p-4 shadow-1 transition-colors",
              selected && "border-border-strong bg-muted",
              disabled && "cursor-not-allowed opacity-60",
            )}
          >
            <span className="flex items-center justify-between gap-2">
              <span className="flex flex-wrap items-center gap-2 font-medium">
                {formatCredits(option.cost)}
                {option.cost === 2 && (
                  <span className="rounded-md bg-token-subtle px-1.5 py-0.5 text-small text-token-fg">Recommended</span>
                )}
              </span>
              <RadioGroupItem value={String(option.cost)} aria-label={formatCredits(option.cost)} />
            </span>
            <span className="text-small text-copy">{option.blurb}</span>
          </label>
        );
      })}
    </RadioGroup>
  );
}
