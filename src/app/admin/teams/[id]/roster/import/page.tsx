import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireOwner } from "@/lib/auth";
import { canAccessTeam } from "@/lib/access";
import { PageHeader } from "@/components/layout/page-header";
import { ImportWizard } from "@/components/roster/import-wizard";

export default async function RosterImportPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireOwner();
  const { id } = await params;
  if (!(await canAccessTeam(user, id))) notFound();
  const team = await prisma.team.findUnique({ where: { id }, select: { id: true, name: true } });
  if (!team) notFound();

  return (
    <div className="space-y-4">
      <PageHeader title="Import roster" subtitle={`Bulk-add athletes into ${team.name}.`} />
      <ImportWizard teamId={team.id} teamName={team.name} />
    </div>
  );
}
