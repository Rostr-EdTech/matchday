"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { AlertCircle, Trophy } from "lucide-react";
import { Field, Input } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { acceptAssistantInvite } from "@/actions/assistant-invite";
import type { ActionResult } from "@/actions/types";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" className="w-full" disabled={pending}>
      <Trophy className="h-4 w-4" /> {pending ? "Setting your password…" : "Set my password"}
    </Button>
  );
}

export function AssistantInviteAcceptForm({ token, name }: { token: string; name: string }) {
  const [state, formAction] = useActionState<ActionResult, FormData>(acceptAssistantInvite.bind(null, token), { ok: false });
  const err = (f: string) => state.fieldErrors?.[f];

  return (
    <form action={formAction} className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Hi {name.split(" ")[0]}! Choose the password you&apos;ll use to sign in from now on.
      </p>
      {state.error && (
        <div className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <AlertCircle className="h-4 w-4 shrink-0" /> {state.error}
        </div>
      )}
      <Field label="Choose a password" error={err("password")} hint="At least 8 characters.">
        <Input name="password" type="password" autoComplete="new-password" required autoFocus />
      </Field>
      <Field label="Confirm password" error={err("confirmPassword")}>
        <Input name="confirmPassword" type="password" autoComplete="new-password" required />
      </Field>
      <SubmitButton />
    </form>
  );
}
