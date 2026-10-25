// Scripted test for the roster CSV-import pipeline (parsing, header-mapping,
// dedupe, and idempotency). Run: node --env-file=.env --import tsx scripts/roster-import-test.mts
//
// csv.ts/map.ts are pure functions with no server-only marker, so they're
// imported directly. `src/lib/import/prepare.ts` imports the `server-only`
// package, which Next.js resolves specially at bundle time but genuinely
// isn't installed in node_modules for plain Node/tsx to find — so, matching
// isolation-test.mts's precedent, `buildPreview`'s dedupe logic is
// re-implemented here rather than imported, mirroring it exactly.
import { PrismaClient } from "@prisma/client";
import { parseCsv } from "../src/lib/import/csv";
import { guessMapping } from "../src/lib/import/map";
import type { ImportSheet, ColumnMapping, ImportPreviewRow } from "../src/lib/import/types";

const prisma = new PrismaClient();

function cell(row: string[], mapping: ColumnMapping, key: string): string | null {
  for (const [idxStr, fieldKey] of Object.entries(mapping)) {
    if (fieldKey === key) { const v = row[Number(idxStr)]?.trim(); return v || null; }
  }
  return null;
}
function resolveDisplayName(row: string[], mapping: ColumnMapping): string | null {
  const direct = cell(row, mapping, "displayName");
  if (direct) return direct;
  const joined = [cell(row, mapping, "firstName"), cell(row, mapping, "lastName")].filter(Boolean).join(" ").trim();
  return joined || null;
}
async function buildPreview(sheet: ImportSheet, mapping: ColumnMapping, teamId: string): Promise<ImportPreviewRow[]> {
  const teamAthletes = await prisma.athlete.findMany({ where: { rosterSpots: { some: { teamId, status: "ACTIVE" } } }, select: { id: true, displayName: true } });
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
    const primaryPosition = cell(row, mapping, "primaryPosition");
    const externalId = cell(row, mapping, "externalId");
    if (!displayName) { results.push({ rowIndex, status: "ERROR", displayName: "", email, jerseyNumber, primaryPosition, externalId, matchedAthleteId: null, matchReason: null, error: "Missing name" }); continue; }
    if ((email && seenEmails.has(email)) || (externalId && seenExternalIds.has(externalId))) { results.push({ rowIndex, status: "ERROR", displayName, email, jerseyNumber, primaryPosition, externalId, matchedAthleteId: null, matchReason: null, error: "Duplicate row in this file" }); continue; }
    if (email) seenEmails.add(email);
    if (externalId) seenExternalIds.add(externalId);
    let matchedAthleteId: string | null = null;
    let matchReason: ImportPreviewRow["matchReason"] = null;
    if (email) { const byEmail = await prisma.athlete.findUnique({ where: { email }, select: { id: true } }); if (byEmail) { matchedAthleteId = byEmail.id; matchReason = "email"; } }
    if (!matchedAthleteId && externalId) { const byExt = await prisma.athlete.findFirst({ where: { externalId }, select: { id: true } }); if (byExt) { matchedAthleteId = byExt.id; matchReason = "externalId"; } }
    if (!matchedAthleteId) { const byName = teamNameIndex.get(displayName.toLowerCase()); if (byName) { matchedAthleteId = byName; matchReason = "name"; } }
    if (matchedAthleteId && teamAthleteIds.has(matchedAthleteId)) results.push({ rowIndex, status: "ALREADY_ROSTERED", displayName, email, jerseyNumber, primaryPosition, externalId, matchedAthleteId, matchReason, error: null });
    else if (matchedAthleteId) results.push({ rowIndex, status: "MATCH_EXISTING", displayName, email, jerseyNumber, primaryPosition, externalId, matchedAthleteId, matchReason, error: null });
    else results.push({ rowIndex, status: "NEW", displayName, email, jerseyNumber, primaryPosition, externalId, matchedAthleteId: null, matchReason: null, error: null });
  }
  return results;
}

let failures = 0;
function check(name: string, cond: boolean) {
  console.log(`${cond ? "  ✓" : "  ✗ FAIL"} ${name}`);
  if (!cond) failures++;
}

async function main() {
  console.log("CSV parsing:");
  const csv = 'name,email,jersey\n"Lovelace, Ada",ada@example.com,9\nGrace Hopper,"grace@example.com",7\n';
  const sheet = parseCsv(csv, "test.csv");
  check("parses 2 data rows", sheet.rows.length === 2);
  check("handles a quoted field containing a comma", sheet.rows[0][0] === "Lovelace, Ada");
  check("handles a quoted field without extra quotes leaking in", sheet.rows[1][1] === "grace@example.com");
  check("headers parsed correctly", JSON.stringify(sheet.headers) === JSON.stringify(["name", "email", "jersey"]));

  const tsv = "Athlete Name\tE-Mail\tPosition\nAva Thompson\tava2@example.com\tGK";
  const tsvSheet = parseCsv(tsv, "pasted.tsv");
  check("sniffs tab delimiter for pasted spreadsheet data", tsvSheet.rows.length === 1 && tsvSheet.rows[0][0] === "Ava Thompson");

  console.log("Header mapping:");
  const mapping = guessMapping(["Athlete Name", "E-Mail", "Jersey #", "Position", "Player ID", "Homeroom"]);
  check('"Athlete Name" -> displayName', mapping[0] === "displayName");
  check('"E-Mail" -> email', mapping[1] === "email");
  check('"Jersey #" -> jerseyNumber', mapping[2] === "jerseyNumber");
  check('"Position" -> primaryPosition', mapping[3] === "primaryPosition");
  check('"Player ID" -> externalId', mapping[4] === "externalId");
  check('unrecognized "Homeroom" -> skip (never an error)', mapping[5] === "skip");

  console.log("Dedupe against real seed data:");
  const varsity = await prisma.team.findFirstOrThrow({ where: { name: "Varsity Boys" } });
  const jv = await prisma.team.findFirstOrThrow({ where: { name: "JV Boys" } });
  const ava = await prisma.athlete.findFirstOrThrow({ where: { displayName: { startsWith: "Ava" } } });
  const caleb = await prisma.athlete.findFirstOrThrow({ where: { displayName: { startsWith: "Caleb" } } });

  const dedupeCsv = [
    "name,email",
    `Ava Thompson,${ava.email}`, // already rostered on Varsity -> ALREADY_ROSTERED
    `Caleb Young,${caleb.email}`, // exists, but NOT rostered on Varsity (only JV) -> MATCH_EXISTING
    "Priya Patel,priya.new@example.com", // brand new -> NEW
    ",missing-name@example.com", // no name -> ERROR
  ].join("\n");
  const dedupeSheet = parseCsv(dedupeCsv, "dedupe-test.csv");
  const dedupeMapping = guessMapping(dedupeSheet.headers);
  const preview = await buildPreview(dedupeSheet, dedupeMapping, varsity.id);

  check("Ava (already rostered on Varsity) -> ALREADY_ROSTERED", preview[0].status === "ALREADY_ROSTERED");
  check("Caleb (exists, rostered on JV not Varsity) -> MATCH_EXISTING", preview[1].status === "MATCH_EXISTING" && preview[1].matchedAthleteId === caleb.id);
  check("Priya (never seen) -> NEW", preview[2].status === "NEW");
  check("missing name -> ERROR", preview[3].status === "ERROR");

  console.log("Idempotency (same team, same dedupe check re-run):");
  const preview2 = await buildPreview(dedupeSheet, dedupeMapping, varsity.id);
  check("re-running the identical preview yields the identical verdicts (no drift)", JSON.stringify(preview.map((r) => r.status)) === JSON.stringify(preview2.map((r) => r.status)));

  console.log("Cross-team isolation of the dedupe:");
  const previewJv = await buildPreview(dedupeSheet, dedupeMapping, jv.id);
  check("Caleb against HIS OWN team (JV) -> ALREADY_ROSTERED, not MATCH_EXISTING", previewJv[1].status === "ALREADY_ROSTERED");

  console.log(`\n${failures === 0 ? "✅ All roster-import checks passed." : `❌ ${failures} check(s) FAILED.`}`);
  if (failures > 0) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
