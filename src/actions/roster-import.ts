"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireOwner } from "@/lib/auth";
import { assertCanAccessTeam, accessibleAthleteIds } from "@/lib/access";
import { logActivity } from "@/lib/activity-log";
import { buildPreview } from "@/lib/import/prepare";
import type { ImportSheet, ColumnMapping, ImportPreviewRow } from "@/lib/import/types";

const MAX_ROWS = 300;

export async function previewRosterImport(
  teamId: string,
  sheet: ImportSheet,
  mapping: ColumnMapping,
): Promise<{ ok: true; rows: ImportPreviewRow[] } | { ok: false; error: string }> {
  const user = await requireOwner();
  try {
    await assertCanAccessTeam(user, teamId);
  } catch {
    return { ok: false, error: "You don't have access to that team." };
  }
  if (sheet.rows.length > MAX_ROWS) {
    return { ok: false, error: `This file has ${sheet.rows.length} rows — the import limit is ${MAX_ROWS} at a time.` };
  }
  const rows = await buildPreview(sheet, mapping, teamId, await accessibleAthleteIds(user));
  return { ok: true, rows };
}

export type ImportRosterResult =
  | { ok: true; rostered: number; alreadyRostered: number; errors: number }
  | { ok: false; error: string };

// Re-derives the preview server-side from the raw sheet+mapping — never
// trusts a client-computed preview, since it could be stale. Idempotent: a
// second import of the same sheet produces zero new athletes/roster spots,
// everything resolves to ALREADY_ROSTERED.
export async function importRoster(teamId: string, sheet: ImportSheet, mapping: ColumnMapping): Promise<ImportRosterResult> {
  const user = await requireOwner();
  try {
    await assertCanAccessTeam(user, teamId);
  } catch {
    return { ok: false, error: "You don't have access to that team." };
  }
  if (sheet.rows.length > MAX_ROWS) {
    return { ok: false, error: `This file has ${sheet.rows.length} rows — the import limit is ${MAX_ROWS} at a time.` };
  }

  const rows = await buildPreview(sheet, mapping, teamId, await accessibleAthleteIds(user));
  const toImport = rows.filter((r) => r.status !== "ERROR");
  const errors = rows.length - toImport.length;
  let rostered = 0;
  let alreadyRostered = 0;

  await prisma.$transaction(async (tx) => {
    for (const row of toImport) {
      if (row.status === "ALREADY_ROSTERED") {
        alreadyRostered++;
        continue;
      }
      let athleteId = row.matchedAthleteId;
      if (!athleteId) {
        const jerseyNumber = row.jerseyNumber ? parseInt(row.jerseyNumber, 10) : null;
        const athlete = await tx.athlete.create({
          data: {
            displayName: row.displayName,
            jerseyNumber: Number.isFinite(jerseyNumber) ? jerseyNumber : null,
            primaryPosition: row.primaryPosition,
            email: row.email,
            externalId: row.externalId,
            status: "ACTIVE",
            createdByUserId: user.id,
          },
        });
        athleteId = athlete.id;
      }
      await tx.rosterSpot.upsert({
        where: { athleteId_teamId: { athleteId, teamId } },
        update: { status: "ACTIVE" },
        create: { athleteId, teamId, status: "ACTIVE" },
      });
      rostered++;
    }
  });

  await logActivity({
    userId: user.id,
    actionType: "ROSTER_IMPORTED",
    description: `Imported ${rostered + alreadyRostered} athletes from ${sheet.sourceLabel} (${rostered} new/re-rostered, ${alreadyRostered} already rostered${errors ? `, ${errors} skipped with errors` : ""})`,
  });
  revalidatePath(`/admin/teams/${teamId}`);

  return { ok: true, rostered, alreadyRostered, errors };
}
