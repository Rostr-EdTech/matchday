import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { accessibleAthleteIds } from "@/lib/access";
import { PageHeader } from "@/components/layout/page-header";
import { AssistantTaskList } from "@/components/tasks/assistant-task-list";

export default async function AssistantTasksPage() {
  const user = await requireRole("ASSISTANT");

  // Show: tasks assigned to me, plus general (no-athlete) tasks. Athlete-
  // specific tasks only surface if the athlete is one I can access.
  const ids = await accessibleAthleteIds(user);
  const athleteCond =
    ids === "ALL"
      ? {}
      : { OR: [{ athleteId: null }, { athleteId: { in: ids } }] };

  const tasks = await prisma.task.findMany({
    where: {
      archived: false,
      AND: [
        { OR: [{ assignedToId: user.id }, { assignedToId: null }] },
        athleteCond,
      ],
    },
    orderBy: [{ recurring: "desc" }, { priority: "asc" }, { createdAt: "desc" }],
    include: { athlete: { select: { displayName: true } } },
  });

  const mapped = tasks.map((t) => ({
    id: t.id,
    title: t.title,
    description: t.description,
    priority: t.priority,
    recurring: t.recurring,
    completed: t.completed,
    notes: t.notes,
    evidenceUrl: t.evidenceUrl,
    athleteName: t.athlete?.displayName ?? null,
  }));

  return (
    <div className="space-y-4">
      <PageHeader title="My tasks" subtitle="Tick tasks as you complete them and add notes or evidence." />
      <AssistantTaskList tasks={mapped} />
    </div>
  );
}
