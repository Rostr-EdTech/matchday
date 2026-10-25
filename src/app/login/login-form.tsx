"use client";

import { useFormStatus } from "react-dom";
import { useActionState } from "react";
import Link from "next/link";
import { AlertCircle } from "lucide-react";
import { loginAction, type LoginState } from "@/actions/auth";
import { Field, Input } from "@/components/ui/field";
import { Button } from "@/components/ui/button";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" className="w-full" disabled={pending}>
      {pending ? "Signing in…" : "Log in"}
    </Button>
  );
}

export function LoginForm() {
  const [state, formAction] = useActionState<LoginState, FormData>(loginAction, {});

  return (
    <div className="space-y-4">
      <form action={formAction} className="space-y-4">
        {state.error && (
          <div className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {state.error}
          </div>
        )}
        <Field label="Email" htmlFor="email">
          <Input id="email" name="email" type="email" placeholder="you@example.com" required autoFocus />
        </Field>
        <Field label="Password" htmlFor="password">
          <Input id="password" name="password" type="password" placeholder="••••••••" required />
        </Field>
        <SubmitButton />
      </form>
      <div className="text-center">
        <Link href="/signup" className="text-sm text-muted-foreground hover:underline">
          New head coach? Create your own workspace
        </Link>
      </div>
    </div>
  );
}
