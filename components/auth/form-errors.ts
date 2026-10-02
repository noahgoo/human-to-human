import type { FieldPath, FieldValues, UseFormReturn } from "react-hook-form";
import type { ActionResult } from "@/lib/types";

export function applyFieldErrors<T extends FieldValues>(
  form: UseFormReturn<T>,
  result: ActionResult<unknown>,
): string | null {
  if (result.ok) return null;
  const fields = result.error.fields;
  if (!fields) return result.error.message;
  for (const [name, message] of Object.entries(fields)) {
    form.setError(name as FieldPath<T>, { message });
  }
  return null;
}
