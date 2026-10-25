"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Play, RotateCcw, ListOrdered } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  BOARD_VIEWS, type BoardView, aspectRatioFor, toScreen, visibleInView,
  PitchMarkings, PlayerBadge, OpponentBadge, EmptySlotMarker, BallToken, ArrowLine,
} from "@/components/board/pitch";
import { buildSequence, describeStep, type Step } from "@/lib/board-sequence";

type Athlete = { id: string; displayName: string; jerseyNumber: number | null; primaryPosition: string | null };
type Slot = { id: string; side: string; positionLabel: string | null; athleteId: string | null; athlete: Athlete | null; x: number; y: number };
type Arrow = { id: string; kind: string; fromX: number; fromY: number; toX: number; toY: number; createdAt?: string };

const STEP_MS = 1400;

// Read-only rendering of a shared board — no drag handlers, no server
// actions, but the same step-sequenced "Play" the coach sees is available
// here too (it's a pure client-side visualization — see LineupArrow's
// schema comment), so a player opening the link can watch the plan play
// out, one connected motion at a time, for themselves.
export function SharedBoardView({
  slots,
  arrows,
  ball,
}: {
  slots: Slot[];
  arrows: Arrow[];
  ball: { x: number; y: number } | null;
}) {
  const [view, setView] = useState<BoardView>("horizontal");
  const [animating, setAnimating] = useState(false);
  const [activeStep, setActiveStep] = useState<number | null>(null);
  const [animSlots, setAnimSlots] = useState(slots);
  const [animBall, setAnimBall] = useState(ball);
  const baselineRef = useRef<{ slots: Slot[]; ball: { x: number; y: number } | null } | null>(null);

  useEffect(() => {
    if (animating) return;
    setAnimSlots(slots);
    setActiveStep(null);
    baselineRef.current = null;
  }, [slots, animating]);
  useEffect(() => { if (!animating) setAnimBall(ball); }, [ball, animating]);

  useEffect(() => {
    try {
      const v = localStorage.getItem("matchday:boardView");
      if (v === "horizontal" || v === "vertical" || v === "attack" || v === "defend") setView(v);
    } catch { /* ignore */ }
  }, []);

  const sequence = useMemo(() => buildSequence(arrows), [arrows]);
  const visible = animSlots.filter((s) => visibleInView(s.y, view));
  const visibleArrows = arrows.filter((a) => visibleInView(a.fromY, view) || visibleInView(a.toY, view));

  function ensureBaseline() {
    if (!baselineRef.current) baselineRef.current = { slots: animSlots, ball: animBall };
  }
  function applyStep(step: Step, index: number) {
    setAnimSlots((prev) => prev.map((s) => {
      if (s.side === "OPPONENT" || !s.athleteId) return s;
      const arrow = step.runs.find((a) => Math.hypot(a.fromX - s.x, a.fromY - s.y) < 8);
      return arrow ? { ...s, x: arrow.toX, y: arrow.toY } : s;
    }));
    if (step.passes[0]) setAnimBall({ x: step.passes[0].toX, y: step.passes[0].toY });
    setActiveStep(index);
  }
  function playStep(index: number) {
    if (animating || !sequence[index]) return;
    ensureBaseline();
    setAnimating(true);
    applyStep(sequence[index], index);
    setTimeout(() => setAnimating(false), STEP_MS);
  }
  function playAll() {
    if (animating || sequence.length === 0) return;
    ensureBaseline();
    setAnimating(true);
    let i = 0;
    const next = () => {
      if (i >= sequence.length) { setTimeout(reset, 400); return; }
      applyStep(sequence[i], i);
      i++;
      setTimeout(next, STEP_MS);
    };
    next();
  }
  function reset() {
    if (baselineRef.current) {
      setAnimSlots(baselineRef.current.slots);
      setAnimBall(baselineRef.current.ball);
    }
    baselineRef.current = null;
    setActiveStep(null);
    setAnimating(false);
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-center gap-2">
        <div className="flex flex-wrap justify-center gap-1 rounded-md border border-border p-0.5">
          {BOARD_VIEWS.map((v) => (
            <button
              key={v.value}
              onClick={() => setView(v.value)}
              className={`rounded px-2 py-1 text-xs ${view === v.value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent"}`}
            >
              {v.label}
            </button>
          ))}
        </div>
        {sequence.length > 0 && (
          <>
            <Button size="sm" variant="success" onClick={playAll} disabled={animating}>
              <Play className="h-3.5 w-3.5" /> {animating ? "Playing…" : "Play"}
            </Button>
            {activeStep !== null && (
              <Button size="sm" variant="outline" onClick={reset} disabled={animating}>
                <RotateCcw className="h-3.5 w-3.5" /> Reset
              </Button>
            )}
          </>
        )}
      </div>

      <div className="relative mx-auto w-full overflow-hidden rounded-xl border border-border bg-slate-900" style={{ aspectRatio: aspectRatioFor(view), maxHeight: "70vh" }}>
        <PitchMarkings view={view} />

        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="pointer-events-none absolute inset-0 h-full w-full">
          {visibleArrows.map((a) => {
            const p1 = toScreen(a.fromX, a.fromY, view);
            const p2 = toScreen(a.toX, a.toY, view);
            return <ArrowLine key={a.id} x1={p1.left} y1={p1.top} x2={p2.left} y2={p2.top} kind={a.kind} />;
          })}
        </svg>

        {visible.map((slot) => {
          const { left, top } = toScreen(slot.x, slot.y, view);
          return (
            <div
              key={slot.id}
              className="absolute -translate-x-1/2 -translate-y-1/2"
              style={{ left: `${left}%`, top: `${top}%`, transition: animating && slot.side !== "OPPONENT" ? "left 1.4s ease-in-out, top 1.4s ease-in-out" : undefined }}
            >
              {slot.side === "OPPONENT" ? (
                <OpponentBadge positionLabel={slot.positionLabel} />
              ) : slot.athlete ? (
                <PlayerBadge athlete={slot.athlete} showName />
              ) : (
                <EmptySlotMarker positionLabel={slot.positionLabel} />
              )}
            </div>
          );
        })}

        {animBall && visibleInView(animBall.y, view) && (() => {
          const { left, top } = toScreen(animBall.x, animBall.y, view);
          return (
            <div
              className="absolute -translate-x-1/2 -translate-y-1/2"
              style={{ left: `${left}%`, top: `${top}%`, transition: animating ? "left 1.4s ease-in-out, top 1.4s ease-in-out" : undefined }}
            >
              <BallToken />
            </div>
          );
        })()}
      </div>

      {sequence.length > 0 && (
        <div className="space-y-2 rounded-xl border border-border p-3">
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <ListOrdered className="h-3.5 w-3.5" /> Sequence
          </p>
          <ol className="grid grid-cols-1 gap-1 sm:grid-cols-2">
            {sequence.map((step, i) => (
              <li key={i}>
                <button
                  onClick={() => playStep(i)}
                  disabled={animating}
                  className={`w-full rounded-md border px-2 py-1.5 text-left text-xs transition-colors ${
                    activeStep === i ? "border-amber-400 bg-amber-400/10 text-amber-700" : "border-border text-muted-foreground hover:bg-accent"
                  }`}
                >
                  Step {i + 1}: {describeStep(step)}
                </button>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}
