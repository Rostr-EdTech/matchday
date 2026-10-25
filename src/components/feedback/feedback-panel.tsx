"use client";

import { useState, useTransition } from "react";
import { Send, Trash2, Pencil, Check, X } from "lucide-react";
import { Textarea } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { addFeedback, editFeedback, deleteFeedback } from "@/actions/feedback";
import { BADGE_COLORS, labelOf, FEEDBACK_VISIBILITY } from "@/lib/enums";

export type FeedbackItem = {
  id: string;
  message: string;
  visibility: string;
  authorName: string;
  createdAt: string; // ISO
  editedAt: string | null;
};

// A small thread of existing feedback for one athlete plus a compose box
// with a COACH_ONLY/ATHLETE_VISIBLE toggle. Deliberately separate from the
// private `notes` field on Athlete: this is an explicit message, not
// internal record-keeping.
export function FeedbackPanel({
  athleteId,
  initialItems,
}: {
  athleteId: string;
  initialItems: FeedbackItem[];
}) {
  const { toast } = useToast();
  const [items, setItems] = useState(initialItems);
  const [draft, setDraft] = useState("");
  const [visible, setVisible] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [pending, start] = useTransition();

  function submit() {
    const message = draft.trim();
    if (!message) return;
    const visibility = visible ? "ATHLETE_VISIBLE" : "COACH_ONLY";
    start(async () => {
      const res = await addFeedback(athleteId, message, visibility);
      if (res.ok) {
        setItems((prev) => [{ id: crypto.randomUUID(), message, visibility, authorName: "You", createdAt: new Date().toISOString(), editedAt: null }, ...prev]);
        setDraft("");
        toast("Feedback added.");
      } else {
        toast(res.error || "Could not save.", "error");
      }
    });
  }

  function startEdit(item: FeedbackItem) {
    setEditingId(item.id);
    setEditDraft(item.message);
  }

  function saveEdit(id: string) {
    const message = editDraft.trim();
    if (!message) return;
    start(async () => {
      const res = await editFeedback(id, message);
      if (res.ok) {
        setItems((prev) => prev.map((i) => (i.id === id ? { ...i, message, editedAt: new Date().toISOString() } : i)));
        setEditingId(null);
        toast("Feedback updated.");
      } else {
        toast(res.error || "Could not save.", "error");
      }
    });
  }

  function remove(id: string) {
    start(async () => {
      const res = await deleteFeedback(id);
      if (res.ok) {
        setItems((prev) => prev.filter((i) => i.id !== id));
        toast("Feedback deleted.");
      } else {
        toast(res.error || "Could not delete.", "error");
      }
    });
  }

  return (
    <div className="space-y-3">
      {items.length === 0 ? (
        <p className="rounded-md border border-dashed border-border py-3 text-center text-xs text-muted-foreground">No feedback yet.</p>
      ) : (
        <ul className="max-h-52 space-y-2 overflow-y-auto">
          {items.map((item) => (
            <li key={item.id} className="rounded-md border border-border p-2.5">
              {editingId === item.id ? (
                <div className="space-y-1.5">
                  <Textarea value={editDraft} onChange={(e) => setEditDraft(e.target.value)} className="min-h-[60px] text-sm" />
                  <div className="flex justify-end gap-1.5">
                    <button type="button" onClick={() => setEditingId(null)} className="rounded p-1 text-muted-foreground hover:bg-accent"><X className="h-3.5 w-3.5" /></button>
                    <button type="button" onClick={() => saveEdit(item.id)} className="rounded p-1 text-primary hover:bg-accent"><Check className="h-3.5 w-3.5" /></button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <Badge color={BADGE_COLORS[item.visibility]}>{labelOf(FEEDBACK_VISIBILITY, item.visibility)}</Badge>
                    <div className="flex items-center gap-1">
                      <span className="text-[11px] text-muted-foreground">{item.authorName}{item.editedAt ? " · edited" : ""}</span>
                      <button type="button" onClick={() => startEdit(item)} className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-muted-foreground"><Pencil className="h-3 w-3" /></button>
                      <button type="button" onClick={() => remove(item.id)} className="rounded p-1 text-red-400 hover:bg-red-50 hover:text-red-600"><Trash2 className="h-3 w-3" /></button>
                    </div>
                  </div>
                  <p className="whitespace-pre-wrap text-sm text-foreground">{item.message}</p>
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="space-y-1.5 rounded-md border border-dashed border-border p-2.5">
        <Textarea value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Write feedback…" className="min-h-[60px] text-sm" />
        <div className="flex items-center justify-between">
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <input type="checkbox" checked={visible} onChange={(e) => setVisible(e.target.checked)} />
            Visible to athlete
          </label>
          <Button size="sm" onClick={submit} disabled={pending || !draft.trim()}>
            <Send className="h-3.5 w-3.5" /> Add
          </Button>
        </div>
      </div>
    </div>
  );
}
