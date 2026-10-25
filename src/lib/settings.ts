import "server-only";
import { prisma } from "./prisma";
import { encryptSecret, decryptSecret } from "./crypto";

// Centralised managed-secret access. Trimmed hard from class_copilot's
// version (see CONTEXT.md) — nothing in this domain needs AI provider keys
// or Canvas/Google OAuth. The only managed keys today are the Gmail SMTP
// credentials that power bulk athlete-invite emails (src/lib/email.ts).
//
// A key set on the admin Settings page (stored encrypted in the DB) takes
// precedence; otherwise falls back to the env var of the same name. This
// lets a head coach rotate credentials from the website with no redeploy,
// while env vars still work as a safety net (e.g. for local dev).
export const MANAGED_KEYS = [
  { name: "GMAIL_SMTP_USER", label: "Gmail address (invite emails)", hint: "The Gmail address bulk athlete-invite emails are sent from — needs the App Password below." },
  { name: "GMAIL_SMTP_APP_PASSWORD", label: "Gmail App Password", hint: "Requires 2-Step Verification on that Gmail account. Generate one at myaccount.google.com/apppasswords" },
] as const;

export type ManagedKeyName = (typeof MANAGED_KEYS)[number]["name"];

// The value the app should actually use: DB (decrypted) first, then env var.
export async function getApiKey(name: string): Promise<string | undefined> {
  try {
    const row = await prisma.setting.findUnique({ where: { key: name } });
    if (row?.value) {
      try {
        return decryptSecret(row.value);
      } catch {
        /* corrupt/rotated AUTH_SECRET — fall back to env */
      }
    }
  } catch {
    /* DB unreachable — fall back to env */
  }
  return process.env[name] || undefined;
}

export async function setApiKey(name: string, value: string, userId?: string): Promise<void> {
  const enc = encryptSecret(value);
  await prisma.setting.upsert({
    where: { key: name },
    create: { key: name, value: enc, updatedById: userId ?? null },
    update: { value: enc, updatedById: userId ?? null },
  });
}

export async function clearApiKey(name: string): Promise<void> {
  await prisma.setting.deleteMany({ where: { key: name } });
}

export type KeyStatus = {
  name: string;
  label: string;
  hint: string;
  source: "website" | "env" | "none";
  masked: string | null;
  updatedAt: string | null;
};

function mask(v: string): string {
  if (v.length <= 8) return "••••";
  return `${v.slice(0, 4)}…${v.slice(-4)}`;
}

// Status for the admin UI — masked previews only; the full key never leaves
// the server.
export async function getKeyStatuses(): Promise<KeyStatus[]> {
  const rows = await prisma.setting.findMany({ where: { key: { in: MANAGED_KEYS.map((k) => k.name) } } });
  const byName = new Map(rows.map((r) => [r.key, r]));

  return MANAGED_KEYS.map((k) => {
    const row = byName.get(k.name);
    if (row?.value) {
      let masked: string | null = null;
      try {
        masked = mask(decryptSecret(row.value));
      } catch {
        masked = null;
      }
      return { name: k.name, label: k.label, hint: k.hint, source: "website", masked, updatedAt: row.updatedAt.toISOString() };
    }
    if (process.env[k.name]) {
      return { name: k.name, label: k.label, hint: k.hint, source: "env", masked: mask(process.env[k.name] as string), updatedAt: null };
    }
    return { name: k.name, label: k.label, hint: k.hint, source: "none", masked: null, updatedAt: null };
  });
}
