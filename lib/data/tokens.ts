import "server-only";
import type { TokenBalance } from "@/lib/types";
import { db } from "@/lib/mock/db";

const MONTHLY_GRANT = 10;

function currentPeriod(d = new Date()) {
  const period = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  const resetsAt = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)).toISOString();
  const start = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
  return { period, resetsAt, start };
}

/** D-02/D-11: virtual +10 grant; balance counts the current UTC month only. */
export async function getTokenBalance(applicantId: string): Promise<TokenBalance> {
  const { period, resetsAt, start } = currentPeriod();
  const store = db();
  const spent = store.applications
    .filter((a) => a.applicantId === applicantId && Date.parse(a.submittedAt) >= start)
    .reduce((sum, a) => sum + a.tokenCost, 0);
  const adj = store.tokenAdjustments.filter((t) => t.applicantId === applicantId && Date.parse(t.at) >= start);
  const refunded = adj.filter((t) => t.kind === "refund").reduce((s, t) => s + t.amount, 0);
  const adjusted = adj.filter((t) => t.kind === "adjustment").reduce((s, t) => s + t.amount, 0);
  const total = MONTHLY_GRANT + refunded + adjusted;
  return { period, granted: MONTHLY_GRANT, spent, refunded, adjusted, total, balance: total - spent, resetsAt };
}
