"use client";

import { useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { Input, Field } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { saveApiKey, removeApiKey } from "@/actions/settings";
import type { KeyStatus } from "@/lib/settings";

// One row per managed credential (today: the two Gmail SMTP values that
// power bulk athlete-invite emails). Save/clear each independently.
export function ApiKeysForm({ statuses }: { statuses: KeyStatus[] }) {
  const { toast } = useToast();
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();

  function save(name: string) {
    const value = (drafts[name] ?? "").trim();
    if (!value) return;
    start(async () => {
      const res = await saveApiKey(name, value);
      if (res.ok) {
        setDrafts((d) => ({ ...d, [name]: "" }));
        toast("Saved.");
      } else {
        toast(res.error || "Could not save.", "error");
      }
    });
  }

  function clear(name: string) {
    start(async () => {
      const res = await removeApiKey(name);
      toast(res.ok ? "Cleared." : res.error || "Could not clear.", res.ok ? "success" : "error");
    });
  }

  return (
    <div className="space-y-4">
      {statuses.map((s) => (
        <Field key={s.name} label={s.label} hint={s.hint}>
          <div className="flex items-center gap-2">
            <Input
              type="text"
              placeholder={s.masked ? `${s.masked} (${s.source === "website" ? "saved" : "from env"})` : "Not set"}
              value={drafts[s.name] ?? ""}
              onChange={(e) => setDrafts((d) => ({ ...d, [s.name]: e.target.value }))}
            />
            <Button type="button" size="sm" onClick={() => save(s.name)} disabled={pending || !(drafts[s.name] ?? "").trim()}>
              Save
            </Button>
            {s.source === "website" && (
              <Button type="button" size="sm" variant="outline" onClick={() => clear(s.name)} disabled={pending} title="Clear">
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </Field>
      ))}
    </div>
  );
}
