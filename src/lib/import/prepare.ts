import "server-only";
import { prisma } from "@/lib/prisma";
import { checkAthleteEmailAllowed } from "@/lib/allowed-email";
import { SOCCER_POSITIONS } from "@/lib/enums";
import type { ImportSheet, ColumnMapping, ImportPreviewRow } from "./types";

function cell(row: string[], mapping: ColumnMapping, key: string): string | null {
  for (const [idxStr, fieldKey] of Object.entries(mapping)) {
    if (fieldKey === key) {
      const v = row[Number(idxStr)]?.trim();
      return v || null;
    }
  }
  return null;
}

function resolveDisplayName(row: string[], mapping: ColumnMapping): string | null {
  const direct = cell(row, mapping, "displayName");
  if (direct) return direct;
  const first = cell(row, mapping, "firstName");
  const last = cell(row, mapping, "lastName");
  const joined = [first, last].filter(Boolean).join(" ").trim();
  return joined || null;
}

// Best-effort match against the fixed position vocabulary — an unrecognized
// value (a league's own abbreviation, a typo) is dropped rather than erroring
// the whole row; position is a convenience field, not required for a roster
// row to import.
function resolvePosition(raw: string | null): string | null {
  if (!raw) return null;
  const norm = raw.trim().toUpperCase();
  const byCode = SOCCER_POSITIONS.find((p) => p.value === norm);
  if (byCode) return byCode.value;
  const byLabel = SOCCER_POSITIONS.find((p) => p.label.toUpperCase() === norm);
  return byLabel?.value ?? null;
}

// Builds a per-row preview: normalizes each raw row, then dedupes against the
// database (email -> externalId -> case-insensitive name-within-team) and
// against earlier rows in the same file. ALWAYS re-run server-side from the
// raw sheet+mapping before committing — never trust a client-computed
// preview, since the browser's dedupe verdict could be stale by the time the
// import actually runs.
//
// `accessibleAthleteIds` (the caller's own accessibleAthleteIds(user) result)
// bounds the email/externalId dedupe match to athletes in the CALLER's own
// workspace. Without this, importing a CSV whose email happens to match some
// unrelated coach's existing athlete would silently roster that other
// coach's private athlete record onto this team — a real record found by
// email, in someone else's workspace, that this caller has no access to.
export async function buildPreview(
  sheet: ImportSheet,
  mapping: ColumnMapping,
  teamId: string,
  accessibleAthleteIds: "ALL" | string[],
): Promise<ImportPreviewRow[]> {
  const isAccessible = (athleteId: string) => accessibleAthleteIds === "ALL" || accessibleAthleteIds.includes(athleteId);

  const teamAthletes = await prisma.athlete.findMany({
    where: { rosterSpots: { some: { teamId, status: "ACTIVE" } } },
    select: { id: true, displayName: true },
  });
  const teamNameIndex = new Map(teamAthletes.map((a) => [a.displayName.toLowerCase(), a.id]));
  const teamAthleteIds = new Set(teamAthletes.map((a) => a.id));

  const seenEmails = new Set<string>();
  const seenExternalIds = new Set<string>();
  const results: ImportPreviewRow[] = [];

  for (let rowIndex = 0; rowIndex < sheet.rows.length; rowIndex++) {
    const row = sheet.rows[rowIndex];
    const displayName = resolveDisplayName(row, mapping);
    const email = cell(row, mapping, "email")?.toLowerCase() ?? null;
    const jerseyNumber = cell(row, mapping, "jerseyNumber");
    const primaryPosition = resolvePosition(cell(row, mapping, "primaryPosition"));
    const externalId = cell(row, mapping, "externalId");

    if (!displayName) {
      results.push({ rowIndex, status: "ERROR", displayName: "", email, jerseyNumber, primaryPosition, externalId, matchedAthleteId: null, matchReason: null, error: "Missing name" });
      continue;
    }
    if ((email && seenEmails.has(email)) || (externalId && seenExternalIds.has(externalId))) {
      results.push({ rowIndex, status: "ERROR", displayName, email, jerseyNumber, primaryPosition, externalId, matchedAthleteId: null, matchReason: null, error: "Duplicate row in this file" });
      continue;
    }
    if (email) seenEmails.add(email);
    if (externalId) seenExternalIds.add(externalId);

    // Dedupe ladder: email -> externalId -> case-insensitive name-within-team.
    let matchedAthleteId: string | null = null;
    let matchReason: ImportPreviewRow["matchReason"] = null;

    if (email) {
      const byEmail = await prisma.athlete.findUnique({ where: { email }, select: { id: true } });
      if (byEmail && !isAccessible(byEmail.id)) {
        results.push({ rowIndex, status: "ERROR", displayName, email, jerseyNumber, primaryPosition, externalId, matchedAthleteId: null, matchReason: null, error: "That email belongs to an athlete you don't have access to." });
        continue;
      }
      if (byEmail) { matchedAthleteId = byEmail.id; matchReason = "email"; }
    }
    if (!matchedAthleteId && externalId) {
      const byExternalId = await prisma.athlete.findFirst({ where: { externalId }, select: { id: true } });
      if (byExternalId && !isAccessible(byExternalId.id)) {
        results.push({ rowIndex, status: "ERROR", displayName, email, jerseyNumber, primaryPosition, externalId, matchedAthleteId: null, matchReason: null, error: "That player ID belongs to an athlete you don't have access to." });
        continue;
      }
      if (byExternalId) { matchedAthleteId = byExternalId.id; matchReason = "externalId"; }
    }
    if (!matchedAthleteId) {
      const byName = teamNameIndex.get(displayName.toLowerCase());
      if (byName) { matchedAthleteId = byName; matchReason = "name"; }
    }

    if (matchedAthleteId && teamAthleteIds.has(matchedAthleteId)) {
      results.push({ rowIndex, status: "ALREADY_ROSTERED", displayName, email, jerseyNumber, primaryPosition, externalId, matchedAthleteId, matchReason, error: null });
    } else if (matchedAthleteId) {
      results.push({ rowIndex, status: "MATCH_EXISTING", displayName, email, jerseyNumber, primaryPosition, externalId, matchedAthleteId, matchReason, error: null });
    } else {
      // A brand-new Athlete row is about to be created with this email — gate
      // it against the preloaded roster/domain the same way a manual
      // create/edit is (see src/actions/athletes.ts), so a CSV import can't
      // be used to attach an unapproved email to a new athlete record.
      const emailError = email ? await checkAthleteEmailAllowed(email) : null;
      if (emailError) {
        results.push({ rowIndex, status: "ERROR", displayName, email, jerseyNumber, primaryPosition, externalId, matchedAthleteId: null, matchReason: null, error: emailError });
      } else {
        results.push({ rowIndex, status: "NEW", displayName, email, jerseyNumber, primaryPosition, externalId, matchedAthleteId: null, matchReason: null, error: null });
      }
    }
  }

  return results;
}
