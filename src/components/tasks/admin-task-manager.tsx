"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { useFormStatus } from "react-dom";
import { Plus, Archive, Repeat, CheckCircle2, Circle, Trash2, RotateCcw, ChevronDown, Pencil } from "lucide-react";
import { Modal, ConfirmModal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea, Select, EnumSelect } from "@/components/ui/field";
import { Badge, PriorityBadge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import { createTask, updateTask, archiveTask, unarchiveTask, deleteTask } from "@/actions/tasks";
import { PRIORITIES } from "@/lib/enums";
import { formatDate, relativeTime, cn } from "@/lib/utils";
import type { ActionResult } from "@/actions/types";

type Task = {
  id: string;
  title: string;
  description: string | null;
  priority: string;
  recurring: boolean;
  completed: boolean;
  completedAt: string | null;
  assignedToId: string | null;
  assignedTo: string | null;
  athleteId: string | null;
  athleteName: string | null;
  notes: string | null;
  evidenceUrl: string | null;
  date: string;
};

type AthleteOpt = { id: string; displayName: string };

// A shared "Athlete" dropdown for the create/edit task forms.
function AthleteField({ athletes, defaultValue }: { athletes: AthleteOpt[]; defaultValue?: string | null }) {
  return (
    <Field label="Athlete (optional)">
      <Select name="athleteId" defaultValue={defaultValue ?? ""}>
        <option value="">General (no athlete)</option>
        {athletes.map((a) => <option key={a.id} value={a.id}>{a.displayName}</option>)}
      </Select>
    </Field>
  );
}

function CreateButton() {
  const { pending } = useFormStatus();
  return <Button type="submit" disabled={pending}>{pending ? "Creating…" : "Create task"}</Button>;
}

export function AdminTaskManager({
  tasks,
  archivedTasks,
  people,
  athletes,
}: {
  tasks: Task[];
  archivedTasks: Task[];
  people: { id: string; name: string }[];
  athletes: AthleteOpt[];
}) {
  const [open, setOpen] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<Task | null>(null);
  const [editing, setEditing] = useState<Task | null>(null);
  const [state, formAction] = useActionState<ActionResult, FormData>(createTask, { ok: false });
  const { toast } = useToast();
  const [, start] = useTransition();

  useEffect(() => {
    if (state.ok) {
      toast("Task created.");
      setOpen(false);
    } else if (state.error) {
      toast(state.error, "error");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const onArchive = (id: string) => start(async () => { await archiveTask(id); toast("Task archived."); });
  const onRestore = (id: string) => start(async () => { await unarchiveTask(id); toast("Task restored."); });
  const onDelete = (t: Task) => {
    const id = t.id;
    setConfirmDelete(null);
    start(async () => { const r = await deleteTask(id); r.ok ? toast("Task deleted.") : toast(r.error ?? "Failed", "error"); });
  };

  const recurring = tasks.filter((t) => t.recurring);
  const oneOff = tasks.filter((t) => !t.recurring);

  return (
    <div className="space-y-5">
      <div className="flex justify-end">
        <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> New task</Button>
      </div>

      <TaskGroup title="Recurring tasks" tasks={recurring} variant="active" onArchive={onArchive} onEdit={(t) => setEditing(t)} onDelete={(t) => setConfirmDelete(t)} />
      <TaskGroup title="One-off tasks" tasks={oneOff} variant="active" onArchive={onArchive} onEdit={(t) => setEditing(t)} onDelete={(t) => setConfirmDelete(t)} />

      {/* Archived tasks (collapsible) */}
      <div>
        <button
          onClick={() => setShowArchived((s) => !s)}
          className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground"
        >
          <ChevronDown className={cn("h-4 w-4 transition-transform", showArchived && "rotate-180")} />
          Archived tasks ({archivedTasks.length})
        </button>
        {showArchived && (
          <div className="mt-3">
            {archivedTasks.length === 0 ? (
              <p className="text-sm text-muted-foreground">No archived tasks.</p>
            ) : (
              <TaskGroup title="" tasks={archivedTasks} variant="archived" onRestore={onRestore} onDelete={(t) => setConfirmDelete(t)} />
            )}
          </div>
        )}
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title="Create task">
        <form action={formAction} className="space-y-3">
          <Field label="Title" required error={state.fieldErrors?.title}>
            <Input name="title" required />
          </Field>
          <Field label="Description">
            <Textarea name="description" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Assign to">
              <Select name="assignedToId" defaultValue={people[0]?.id ?? ""}>
                <option value="">Unassigned</option>
                {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </Select>
            </Field>
            <AthleteField athletes={athletes} />
            <Field label="Priority">
              <EnumSelect name="priority" options={PRIORITIES} defaultValue="MEDIUM" />
            </Field>
            <Field label="Date">
              <Input name="date" type="date" />
            </Field>
            <Field label="Recurring">
              <label className="flex h-9 items-center gap-2 text-sm text-muted-foreground">
                <input type="checkbox" name="recurring" /> Repeats daily
              </label>
            </Field>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <CreateButton />
          </div>
        </form>
      </Modal>

      {editing && (
        <EditTaskModal
          key={editing.id}
          task={editing}
          people={people}
          athletes={athletes}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); toast("Task updated."); }}
        />
      )}

      <ConfirmModal
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        onConfirm={() => confirmDelete && onDelete(confirmDelete)}
        title="Delete this task?"
        message={`Permanently delete "${confirmDelete?.title}"? This cannot be undone. (Use Archive if you just want to hide it.)`}
        confirmLabel="Delete permanently"
        danger
      />
    </div>
  );
}

function SaveButton() {
  const { pending } = useFormStatus();
  return <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save changes"}</Button>;
}

// Edit modal — mounted fresh per task (keyed), so its bound action + form
// defaults always match the task being edited.
function EditTaskModal({
  task,
  people,
  athletes,
  onClose,
  onSaved,
}: {
  task: Task;
  people: { id: string; name: string }[];
  athletes: AthleteOpt[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [state, formAction] = useActionState<ActionResult, FormData>(updateTask.bind(null, task.id), { ok: false });

  useEffect(() => {
    if (state.ok) onSaved();
    else if (state.error) toast(state.error, "error");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <Modal open onClose={onClose} title="Edit task">
      <form action={formAction} className="space-y-3">
        <Field label="Title" required error={state.fieldErrors?.title}>
          <Input name="title" defaultValue={task.title} required />
        </Field>
        <Field label="Description">
          <Textarea name="description" defaultValue={task.description ?? ""} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Assign to">
            <Select name="assignedToId" defaultValue={task.assignedToId ?? ""}>
              <option value="">Unassigned</option>
              {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
          </Field>
          <AthleteField athletes={athletes} defaultValue={task.athleteId} />
          <Field label="Priority">
            <EnumSelect name="priority" options={PRIORITIES} defaultValue={task.priority} />
          </Field>
          <Field label="Date">
            <Input name="date" type="date" defaultValue={task.date.slice(0, 10)} />
          </Field>
          <Field label="Recurring">
            <label className="flex h-9 items-center gap-2 text-sm text-muted-foreground">
              <input type="checkbox" name="recurring" defaultChecked={task.recurring} /> Repeats daily
            </label>
          </Field>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <SaveButton />
        </div>
      </form>
    </Modal>
  );
}

function TaskGroup({
  title,
  tasks,
  variant,
  onArchive,
  onRestore,
  onEdit,
  onDelete,
}: {
  title: string;
  tasks: Task[];
  variant: "active" | "archived";
  onArchive?: (id: string) => void;
  onRestore?: (id: string) => void;
  onEdit?: (task: Task) => void;
  onDelete: (task: Task) => void;
}) {
  return (
    <div>
      {title && <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">{title} ({tasks.length})</h2>}
      {tasks.length === 0 ? (
        <p className="text-sm text-muted-foreground">None.</p>
      ) : (
        <div className="space-y-2">
          {tasks.map((t) => (
            <Card key={t.id}>
              <CardContent className="flex items-start justify-between gap-3 py-3">
                <div className="flex items-start gap-2">
                  {t.completed ? <CheckCircle2 className="mt-0.5 h-4 w-4 text-green-600" /> : <Circle className="mt-0.5 h-4 w-4 text-muted-foreground" />}
                  <div>
                    <p className={cn("text-sm font-medium text-foreground", variant === "archived" && "text-muted-foreground")}>{t.title}</p>
                    {t.description && <p className="text-xs text-muted-foreground">{t.description}</p>}
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <PriorityBadge value={t.priority} />
                      {t.recurring && <Badge color="bg-indigo-100 text-indigo-700 border-indigo-200"><Repeat className="mr-1 h-3 w-3" /> Recurring</Badge>}
                      {t.athleteName && <Badge color="bg-muted text-muted-foreground border-border">{t.athleteName}</Badge>}
                      {t.assignedTo && <span>Assigned: {t.assignedTo}</span>}
                      {t.completed && t.completedAt && <span>Done {relativeTime(t.completedAt)}</span>}
                      {!t.recurring && <span>{formatDate(t.date)}</span>}
                    </div>
                    {t.notes && <p className="mt-1 text-xs italic text-muted-foreground">“{t.notes}”</p>}
                    {t.evidenceUrl && <a href={t.evidenceUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline">Evidence link</a>}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {variant === "active" && onEdit && (
                    <button onClick={() => onEdit(t)} className="rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-primary" title="Edit">
                      <Pencil className="h-4 w-4" />
                    </button>
                  )}
                  {variant === "active" ? (
                    <button onClick={() => onArchive?.(t.id)} className="rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-muted-foreground" title="Archive">
                      <Archive className="h-4 w-4" />
                    </button>
                  ) : (
                    <button onClick={() => onRestore?.(t.id)} className="rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-green-600" title="Restore">
                      <RotateCcw className="h-4 w-4" />
                    </button>
                  )}
                  <button onClick={() => onDelete(t)} className="rounded p-1.5 text-muted-foreground hover:bg-red-50 hover:text-red-600" title="Delete permanently">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
