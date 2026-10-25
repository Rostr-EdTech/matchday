// Idempotently upserts the 6 built-in formation presets — global reference
// data (see prisma/schema.prisma::Formation), not demo data. Deliberately a
// SEPARATE script from prisma/seed.ts (which also does this, for local dev)
// so a production deploy always has formation presets available even when a
// coach reasonably skips the full demo seed (fake athletes named "Ava
// Thompson" have no place in a real team's data) — see render.yaml's
// preDeployCommand and CONTEXT.md's Eleventh pass for why this bug existed.
//
// Run: npx tsx prisma/seed-formations.ts
import { PrismaClient } from "@prisma/client";
import { FORMATION_PRESETS } from "../src/lib/formations";

const prisma = new PrismaClient();

async function main() {
  for (const preset of FORMATION_PRESETS) {
    await prisma.formation.upsert({
      where: { name: preset.name },
      update: { slotsJson: JSON.stringify(preset.slots) },
      create: { name: preset.name, sport: "SOCCER", slotsJson: JSON.stringify(preset.slots) },
    });
  }
  console.log(`Seeded ${FORMATION_PRESETS.length} formation presets.`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
