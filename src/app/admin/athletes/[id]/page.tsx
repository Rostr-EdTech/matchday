import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireOwner } from "@/lib/auth";
import { canAccessAthlete } from "@/lib/access";
import { feedbackForAthlete } from "@/lib/feedback";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AthleteFields } from "@/components/athletes/athlete-form";
import { AthleteInvite } from "@/components/athletes/athlete-invite";
import { FeedbackPanel } from "@/components/feedback/feedback-panel";

export default async function AthleteDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireOwner();
  const { id } = await params;
  if (!(await canAccessAthlete(user, id))) notFound();

  const athlete = await prisma.athlete.findUnique({
    where: { id },
    include: {
      linkedUser: { select: { id: true, name: true, email: true, active: true } },
      invite: { select: { token: true, expiresAt: true } },
      rosterSpots: { where: { status: "ACTIVE" }, include: { team: { select: { id: true, name: true } } } },
    },
  });
  if (!athlete) notFound();

  const feedback = await feedbackForAthlete(id, true);

  const initial = {
    displayName: athlete.displayName,
    dateOfBirth: athlete.dateOfBirth ? athlete.dateOfBirth.toISOString().slice(0, 10) : null,
    jerseyNumber: athlete.jerseyNumber,
    primaryPosition: athlete.primaryPosition,
    secondaryPositions: athlete.secondaryPositions ? (JSON.parse(athlete.secondaryPositions) as string[]) : [],
    dominantFoot: athlete.dominantFoot,
    status: athlete.status,
    injuryStatus: athlete.injuryStatus,
    injuryNote: athlete.injuryNote,
    notes: athlete.notes,
    email: athlete.email,
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title={`${athlete.jerseyNumber != null ? `#${athlete.jerseyNumber} ` : ""}${athlete.displayName}`}
        subtitle={athlete.primaryPosition ?? "No position set"}
      />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card>
            <CardHeader><CardTitle>Athlete details</CardTitle></CardHeader>
            <CardContent>
              <AthleteFields mode="edit" athleteId={athlete.id} initial={initial} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Feedback</CardTitle></CardHeader>
            <CardContent>
              <FeedbackPanel
                athleteId={athlete.id}
                initialItems={feedback.map((f) => ({
                  id: f.id,
                  message: f.message,
                  visibility: f.visibility,
                  authorName: f.authorName,
                  createdAt: f.createdAt.toISOString(),
                  editedAt: f.editedAt ? f.editedAt.toISOString() : null,
                }))}
              />
            </CardContent>
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader><CardTitle>Teams</CardTitle></CardHeader>
            <CardContent>
              {athlete.rosterSpots.length === 0 ? (
                <p className="text-sm text-muted-foreground">Not on any team roster yet.</p>
              ) : (
                <ul className="space-y-1.5">
                  {athlete.rosterSpots.map((r) => (
                    <li key={r.id} className="rounded-md border border-border px-2.5 py-1.5 text-sm text-foreground">
                      {r.team.name}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Athlete portal login</CardTitle></CardHeader>
            <CardContent>
              <AthleteInvite
                athleteId={athlete.id}
                athleteEmail={athlete.email}
                linkedUser={athlete.linkedUser}
                pendingInvite={athlete.invite ? { token: athlete.invite.token, expiresAt: athlete.invite.expiresAt.toISOString() } : null}
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
