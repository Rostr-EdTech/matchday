import Link from "next/link";
import { CheckCircle2, Circle, Rocket, ArrowRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

// A short guided flow for a new head coach: add your first team → roster an
// athlete → assign an assistant coach. Rendered only until all three are
// done. Steps reflect real state (counts passed in), so it self-completes as
// you go.
export function Onboarding({
  hasTeam,
  hasAthlete,
  hasAssistant,
}: {
  hasTeam: boolean;
  hasAthlete: boolean;
  hasAssistant: boolean;
}) {
  if (hasTeam && hasAthlete && hasAssistant) return null;

  const steps = [
    { done: hasTeam, label: "Create your first team", desc: "A squad/roster, e.g. Varsity Boys.", href: "/admin/teams" },
    { done: hasAthlete, label: "Add an athlete", desc: "Their name, position, and jersey number.", href: "/admin/athletes" },
    { done: hasAssistant, label: "Assign an assistant coach", desc: "So they can help manage a team's roster and lineups.", href: "/admin/assistants" },
  ];
  const nextStep = steps.find((s) => !s.done);

  return (
    <Card className="border-primary/30 bg-primary/[0.03]">
      <CardContent className="pt-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <Rocket className="h-5 w-5 text-primary" />
            <div>
              <p className="font-semibold text-foreground">Get started</p>
              <p className="text-xs text-muted-foreground">Three quick steps to get your team set up.</p>
            </div>
          </div>
          {nextStep && (
            <Link href={nextStep.href} className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90">
              {nextStep.label} <ArrowRight className="h-4 w-4" />
            </Link>
          )}
        </div>
        <ol className="mt-4 space-y-2">
          {steps.map((s) => (
            <li key={s.label} className="flex items-start gap-2">
              {s.done ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-600" /> : <Circle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />}
              <div>
                <Link href={s.href} className={`text-sm font-medium ${s.done ? "text-muted-foreground line-through" : "text-foreground hover:text-primary"}`}>{s.label}</Link>
                {!s.done && <p className="text-xs text-muted-foreground">{s.desc}</p>}
              </div>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}
