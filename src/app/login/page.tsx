import { redirect } from "next/navigation";
import { Trophy } from "lucide-react";
import { getSessionUser, dashboardPathFor } from "@/lib/auth";
import { APP_NAME } from "@/lib/app-config";
import { LoginForm } from "./login-form";

export default async function LoginPage() {
  const user = await getSessionUser();
  if (user) redirect(dashboardPathFor(user.role));

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-950 to-slate-900 p-4">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-soft">
            <Trophy className="h-6 w-6" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">{APP_NAME}</h1>
          <p className="mt-1 text-sm text-muted-foreground">Roster, formations, and match planning for your team</p>
        </div>

        <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
          <LoginForm />
        </div>
      </div>
    </div>
  );
}
