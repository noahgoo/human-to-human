"use client";

import { useQuery } from "@tanstack/react-query";
import { Coins } from "lucide-react";
import type { TokenBalance } from "@/lib/types";
import { CREDIT } from "@/lib/copy";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export const TOKEN_BALANCE_KEY = ["token-balance"] as const;

/**
 * Seeded from the layout RSC. Other components update it with
 * queryClient.setQueryData(TOKEN_BALANCE_KEY, ...) for optimistic Apply.
 */
export function TokenBalancePill({ initialBalance }: { initialBalance: TokenBalance }) {
  const { data } = useQuery({
    queryKey: TOKEN_BALANCE_KEY,
    queryFn: async () => initialBalance,
    initialData: initialBalance,
    staleTime: Infinity,
  });
  const resets = new Date(data.resetsAt).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          aria-live="polite"
          className="inline-flex items-center gap-1.5 rounded-full border border-token/15 bg-token-subtle px-3 py-1 font-mono text-small text-token-fg tabular-nums"
        >
          <Coins className="size-3.5" aria-hidden />
          {data.balance} / {data.total} {CREDIT.other}
        </span>
      </TooltipTrigger>
      <TooltipContent>Resets {resets}. Unused credits don&apos;t roll over.</TooltipContent>
    </Tooltip>
  );
}
