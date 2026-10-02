"use client";

import { useActionState } from "react";
import { confirmWorkEmail } from "./actions";
import { Button } from "@/components/ui/button";

export function ConfirmWorkEmailForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(confirmWorkEmail, null);

  return (
    <form action={action} className="mt-6 flex flex-col gap-3">
      <input type="hidden" name="token" value={token} />
      {state && !state.ok && (
        <p className="text-small text-destructive" role="alert">
          {state.error.message}
        </p>
      )}
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Confirming…" : "Confirm my work email"}
      </Button>
    </form>
  );
}
