// Turns a flat set of drawn arrows into an ordered sequence of "steps" for
// the tactical board's Play feature — pure, client-safe (no server-only
// imports) so it's shared by the interactive board and the read-only
// shared view, and independently testable.
//
// The core idea: a coach draws a multi-beat move as SEPARATE arrows, one
// drag gesture each, but intends them to connect — arrow 2 starting where
// arrow 1 ended means "then they go here." Connectivity is detected by
// endpoint proximity, not by any explicit link the coach has to manage.

export type Arrow = { id: string; kind: string; fromX: number; fromY: number; toX: number; toY: number; createdAt?: string };
export type Step = { runs: Arrow[]; passes: Arrow[] };

const CONNECT_RADIUS = 6;

function closeEnough(ax: number, ay: number, bx: number, by: number): boolean {
  return Math.hypot(ax - bx, ay - by) <= CONNECT_RADIUS;
}

// Groups arrows of one kind into ordered chains — each chain is a sequence
// where one arrow's endpoint feeds the next arrow's start point, exactly
// what a coach means by drawing a second arrow starting where the first
// left off. Arrows whose endpoints don't connect to anything become their
// own single-arrow chains, so nothing drawn is ever silently dropped.
export function buildChains(arrows: Arrow[]): Arrow[][] {
  const sorted = [...arrows].sort((a, b) => (a.createdAt ?? "").localeCompare(b.createdAt ?? ""));
  const used = new Set<string>();
  const chains: Arrow[][] = [];

  const hasPredecessor = (a: Arrow) => sorted.some((b) => b.id !== a.id && closeEnough(b.toX, b.toY, a.fromX, a.fromY));
  const heads = sorted.filter((a) => !hasPredecessor(a));

  for (const head of heads.length ? heads : sorted) {
    if (used.has(head.id)) continue;
    const chain: Arrow[] = [head];
    used.add(head.id);
    let current = head;
    for (;;) {
      const next = sorted.find((a) => !used.has(a.id) && closeEnough(current.toX, current.toY, a.fromX, a.fromY));
      if (!next) break;
      chain.push(next);
      used.add(next.id);
      current = next;
    }
    chains.push(chain);
  }
  // Anything a cycle or edge case left unvisited still gets shown, alone.
  for (const a of sorted) if (!used.has(a.id)) chains.push([a]);
  return chains;
}

// One independent chain per player run (different players' runs live in
// different parts of the pitch, so they naturally never connect to each
// other). Pass chains all move the same single ball, so disconnected pass
// chains are concatenated end to end (head order) rather than kept as
// separate parallel chains — there's only one ball to move.
export function buildSequence(arrows: Arrow[]): Step[] {
  const runChains = buildChains(arrows.filter((a) => a.kind === "RUN"));
  const passSequence = buildChains(arrows.filter((a) => a.kind === "PASS")).flat();

  const maxLen = Math.max(passSequence.length, 0, ...runChains.map((c) => c.length));
  const steps: Step[] = [];
  for (let i = 0; i < maxLen; i++) {
    steps.push({
      runs: runChains.map((c) => c[i]).filter((a): a is Arrow => Boolean(a)),
      passes: passSequence[i] ? [passSequence[i]] : [],
    });
  }
  return steps;
}

export function describeStep(step: Step): string {
  const parts: string[] = [];
  if (step.runs.length) parts.push(`${step.runs.length} run${step.runs.length === 1 ? "" : "s"}`);
  if (step.passes.length) parts.push("pass");
  return parts.length ? parts.join(", ") : "—";
}
