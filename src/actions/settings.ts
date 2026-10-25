"use server";

import { revalidatePath } from "next/cache";
import { requireOwner } from "@/lib/auth";
import { logActivity } from "@/lib/activity-log";
import { setApiKey, clearApiKey, MANAGED_KEYS } from "@/lib/settings";
import type { ActionResult } from "./types";

const MANAGED = new Set<string>(MANAGED_KEYS.map((k) => k.name));

// Owner-only: store a managed credential (encrypted) so it's used everywhere
// with no redeploy. The value never leaves the server after this.
export async function saveApiKey(name: string, value: string): Promise<ActionResult> {
  const admin = await requireOwner();
  if (!MANAGED.has(name)) return { ok: false, error: "Unknown setting." };
  const v = value.trim();
  if (v.length < 4) return { ok: false, error: "That value looks too short." };

  await setApiKey(name, v, admin.id);
  await logActivity({ userId: admin.id, actionType: "SETTING_UPDATED", description: `Updated ${name}` });
  revalidatePath("/admin/settings");
  return { ok: true };
}

export async function removeApiKey(name: string): Promise<ActionResult> {
  const admin = await requireOwner();
  if (!MANAGED.has(name)) return { ok: false, error: "Unknown setting." };

  await clearApiKey(name);
  await logActivity({ userId: admin.id, actionType: "SETTING_UPDATED", description: `Cleared ${name}` });
  revalidatePath("/admin/settings");
  return { ok: true };
}
