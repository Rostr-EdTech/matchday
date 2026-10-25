// Soccer formation templates — pure, client-safe (no server-only imports) so
// both the board UI (client) and seed/server code can share the shapes.
//
// Coordinates are percentages on a normalized pitch: x is 0 (left touchline)
// to 100 (right touchline); y is 0 (own goal line) to 100 (opponent's goal
// line) — the team always attacks "up" the board. Exactly one slot per
// formation has positionLabel "GK".

export type FormationSlot = { slotKey: string; positionLabel: string; x: number; y: number };
export type FormationPreset = { name: string; slots: FormationSlot[] };

function slot(slotKey: string, positionLabel: string, x: number, y: number): FormationSlot {
  return { slotKey, positionLabel, x, y };
}

export const FORMATION_PRESETS: FormationPreset[] = [
  {
    name: "4-4-2",
    slots: [
      slot("gk", "GK", 50, 6),
      slot("lb", "LB", 15, 25), slot("cb1", "CB", 35, 18), slot("cb2", "CB", 65, 18), slot("rb", "RB", 85, 25),
      slot("lm", "LM", 15, 55), slot("cm1", "CM", 35, 50), slot("cm2", "CM", 65, 50), slot("rm", "RM", 85, 55),
      slot("st1", "ST", 38, 82), slot("st2", "ST", 62, 82),
    ],
  },
  {
    name: "4-3-3",
    slots: [
      slot("gk", "GK", 50, 6),
      slot("lb", "LB", 15, 25), slot("cb1", "CB", 35, 18), slot("cb2", "CB", 65, 18), slot("rb", "RB", 85, 25),
      slot("cm1", "CM", 30, 50), slot("cdm", "CDM", 50, 42), slot("cm2", "CM", 70, 50),
      slot("lw", "LW", 15, 82), slot("st", "ST", 50, 88), slot("rw", "RW", 85, 82),
    ],
  },
  {
    name: "4-2-3-1",
    slots: [
      slot("gk", "GK", 50, 6),
      slot("lb", "LB", 15, 25), slot("cb1", "CB", 35, 18), slot("cb2", "CB", 65, 18), slot("rb", "RB", 85, 25),
      slot("cdm1", "CDM", 35, 42), slot("cdm2", "CDM", 65, 42),
      slot("lw", "LW", 15, 66), slot("cam", "CAM", 50, 68), slot("rw", "RW", 85, 66),
      slot("st", "ST", 50, 88),
    ],
  },
  {
    name: "3-5-2",
    slots: [
      slot("gk", "GK", 50, 6),
      slot("cb1", "CB", 25, 20), slot("cb2", "CB", 50, 15), slot("cb3", "CB", 75, 20),
      slot("lwb", "LWB", 8, 50), slot("cm1", "CM", 32, 48), slot("cdm", "CDM", 50, 42), slot("cm2", "CM", 68, 48), slot("rwb", "RWB", 92, 50),
      slot("st1", "ST", 38, 82), slot("st2", "ST", 62, 82),
    ],
  },
  {
    name: "3-4-3",
    slots: [
      slot("gk", "GK", 50, 6),
      slot("cb1", "CB", 25, 20), slot("cb2", "CB", 50, 15), slot("cb3", "CB", 75, 20),
      slot("lm", "LM", 15, 50), slot("cm1", "CM", 38, 48), slot("cm2", "CM", 62, 48), slot("rm", "RM", 85, 50),
      slot("lw", "LW", 15, 82), slot("st", "ST", 50, 88), slot("rw", "RW", 85, 82),
    ],
  },
  {
    name: "5-3-2",
    slots: [
      slot("gk", "GK", 50, 6),
      slot("lwb", "LWB", 10, 28), slot("cb1", "CB", 30, 18), slot("cb2", "CB", 50, 15), slot("cb3", "CB", 70, 18), slot("rwb", "RWB", 90, 28),
      slot("cm1", "CM", 30, 52), slot("cdm", "CDM", 50, 45), slot("cm2", "CM", 70, 52),
      slot("st1", "ST", 38, 82), slot("st2", "ST", 62, 82),
    ],
  },
];
