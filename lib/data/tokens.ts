import "server-only";
import type { TokenBalance } from "@/lib/types";
import { must, tokenPeriod } from "@/lib/db/rows";
import { admin } from "@/lib/supabase/admin";

const MONTHLY_GRANT = 10;

/** D-02/D-11: virtual +10 grant unless materialised; balance counts the current UTC month only. */
export async function getTokenBalance(applicantId: string): Promise<TokenBalance> {
  const now = new Date();
  const period = tokenPeriod(now);
  const resetsAt = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toISOString();
  const rows = must(
    await admin().from("token_ledger").select("kind, amount").eq("applicant_id", applicantId).eq("period", period),
    "token_ledger",
  ) as Array<{ kind: string; amount: number }>;
  const sum = (kind: string) => rows.filter((r) => r.kind === kind).reduce((s, r) => s + r.amount, 0);
  const granted = sum("monthly_grant") || MONTHLY_GRANT;
  const spent = -sum("application_spend");
  const refunded = sum("refund");
  const adjusted = sum("adjustment");
  const total = granted + refunded + adjusted;
  return { period, granted, spent, refunded, adjusted, total, balance: total - spent, resetsAt };
}
