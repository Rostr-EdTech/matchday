"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Plus, Trash2, Pencil, Check, X, Eraser, Share2, Copy, EyeOff, Eye, Lock, Unlock, Swords,
  CircleDot, Pointer, PenLine, Play, RotateCcw, ListOrdered,
} from "lucide-react";
import { Select, Input, Textarea } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import {
  BOARD_VIEWS, type BoardView, aspectRatioFor, toScreen, fromScreen, visibleInView, nearestSlot,
  PitchMarkings, PlayerBadge, OpponentBadge, EmptySlotMarker, BallToken, ArrowLine,
} from "@/components/board/pitch";
import { buildSequence, describeStep, type Step } from "@/lib/board-sequence";
import {
  createLineup, renameLineup, deleteLineup, applyFormationTemplate, clearBoard, placeAthlete,
  removeFromBoard, removeSlot, shareLineup, unshareLineup, addOpponentFormation,
  clearOpponentFormation, moveOpponentSlot, addBall, removeBall, moveBall, addArrow, clearArrows,
} from "@/actions/lineups";

type Athlete = { id: string; displayName: string; jerseyNumber: number | null; primaryPosition: string | null; injuryStatus: string };
type Formation = { id: string; name: string };
type LineupSummary = { id: string; name: string; sharedAt: string | null };
type Slot = { id: string; side: string; positionLabel: string | null; athleteId: string | null; athlete: Athlete | null; x: number; y: number };
type Arrow = { id: string; kind: string; fromX: number; fromY: number; toX: number; toY: number; createdAt?: string };
type LineupBoard = {
  id: string;
  name: string;
  teamId: string;
  sharedAt: string | null;
  shareToken: string | null;
  notes: string | null;
  ballX: number | null;
  ballY: number | null;
  slots: Slot[];
  arrows: Arrow[];
  team: { rosterSpots: { athlete: Athlete }[] };
};

type DragKind = "bench" | "board" | "ball";
type DragSide = "US" | "OPPONENT" | "BALL";
type DragState = {
  kind: DragKind;
  side: DragSide;
  athleteId: string | null;
  slotId: string | null;
  pointerId: number;
  clientX: number;
  clientY: number;
};
type Drawing = { pointerId: number; x1: number; y1: number; x2: number; y2: number } | null;

const VIEW_KEY = "matchday:boardView";
const NAMES_KEY = "matchday:boardShowNames";
const LOCK_KEY = "matchday:boardLocked";
const STEP_MS = 1400;

function rectContains(r: DOMRect | undefined, x: number, y: number): boolean {
  return !!r && x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
}

export function FormationBoard({
  lineup,
  lineups,
  formations,
}: {
  lineup: LineupBoard;
  lineups: LineupSummary[];
  formations: Formation[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const pitchRef = useRef<HTMLDivElement>(null);
  const benchRef = useRef<HTMLDivElement>(null);

  const [view, setView] = useState<BoardView>("horizontal");
  const [showNames, setShowNames] = useState(true);
  const [locked, setLocked] = useState(false);
  const [localSlots, setLocalSlots] = useState<Slot[]>(lineup.slots);
  const [localArrows, setLocalArrows] = useState<Arrow[]>(lineup.arrows);
  const [localBall, setLocalBall] = useState<{ x: number; y: number } | null>(
    lineup.ballX != null && lineup.ballY != null ? { x: lineup.ballX, y: lineup.ballY } : null,
  );
  const [drag, setDrag] = useState<DragState | null>(null);
  const [mode, setMode] = useState<"move" | "draw">("move");
  const [arrowKind, setArrowKind] = useState<"PASS" | "RUN">("RUN");
  const [drawing, setDrawing] = useState<Drawing>(null);
  const [animating, setAnimating] = useState(false);
  const [activeStep, setActiveStep] = useState<number | null>(null);
  const baselineRef = useRef<{ slots: Slot[]; ball: { x: number; y: number } | null } | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [nameDraft, setNameDraft] = useState(lineup.name);
  const [shareOpen, setShareOpen] = useState(false);
  const [opponentOpen, setOpponentOpen] = useState(false);
  const [shareNotes, setShareNotes] = useState(lineup.notes ?? "");
  const [shareUrl, setShareUrl] = useState<string | null>(null);

  useEffect(() => { if (!animating) setLocalSlots(lineup.slots); }, [lineup.slots, animating]);
  useEffect(() => {
    if (animating) return;
    setLocalArrows(lineup.arrows);
    setActiveStep(null);
    baselineRef.current = null;
  }, [lineup.arrows, animating]);
  useEffect(() => {
    if (animating) return;
    setLocalBall(lineup.ballX != null && lineup.ballY != null ? { x: lineup.ballX, y: lineup.ballY } : null);
  }, [lineup.ballX, lineup.ballY, animating]);

  useEffect(() => {
    try {
      const v = localStorage.getItem(VIEW_KEY);
      if (v === "horizontal" || v === "vertical" || v === "attack" || v === "defend") setView(v);
      const n = localStorage.getItem(NAMES_KEY);
      if (n !== null) setShowNames(n === "1");
      const l = localStorage.getItem(LOCK_KEY);
      if (l !== null) setLocked(l === "1");
    } catch { /* ignore */ }
  }, []);

  function changeView(v: BoardView) {
    setView(v);
    try { localStorage.setItem(VIEW_KEY, v); } catch { /* ignore */ }
  }
  function toggleNames() {
    setShowNames((prev) => {
      const next = !prev;
      try { localStorage.setItem(NAMES_KEY, next ? "1" : "0"); } catch { /* ignore */ }
      return next;
    });
  }
  function toggleLock() {
    setLocked((prev) => {
      const next = !prev;
      try { localStorage.setItem(LOCK_KEY, next ? "1" : "0"); } catch { /* ignore */ }
      if (next) setMode("move");
      return next;
    });
  }

  const athleteById = useMemo(() => new Map(lineup.team.rosterSpots.map((r) => [r.athlete.id, r.athlete])), [lineup.team.rosterSpots]);
  const usSlots = localSlots.filter((s) => s.side !== "OPPONENT");
  const opponentSlots = localSlots.filter((s) => s.side === "OPPONENT");
  const assignedIds = useMemo(() => new Set(usSlots.map((s) => s.athleteId).filter(Boolean) as string[]), [usSlots]);
  const bench = lineup.team.rosterSpots.map((r) => r.athlete).filter((a) => !assignedIds.has(a.id));
  const visibleUs = usSlots.filter((s) => visibleInView(s.y, view));
  const visibleOpponent = opponentSlots.filter((s) => visibleInView(s.y, view));
  const visibleArrows = localArrows.filter((a) => visibleInView(a.fromY, view) || visibleInView(a.toY, view));
  const sequence = useMemo(() => buildSequence(localArrows), [localArrows]);

  function refresh() { router.refresh(); }

  // --- Optimistic local mirrors of the server's placement logic — see
  // actions/lineups.ts::placeAthlete for the authoritative version.
  function optimisticPlace(athleteId: string, x: number, y: number, targetSlotId: string | null) {
    setLocalSlots((prev) => {
      const us = prev.filter((s) => s.side !== "OPPONENT");
      const rest = prev.filter((s) => s.side === "OPPONENT");
      const sourceSlot = us.find((s) => s.athleteId === athleteId) ?? null;
      const targetSlot = targetSlotId ? us.find((s) => s.id === targetSlotId) ?? null : null;
      let next: Slot[];
      if (targetSlot && targetSlot.id !== sourceSlot?.id) {
        if (targetSlot.athleteId) {
          next = us.map((s) => {
            if (s.id === targetSlot.id) return { ...s, athleteId, athlete: athleteById.get(athleteId) ?? null };
            if (sourceSlot && s.id === sourceSlot.id) return { ...s, athleteId: targetSlot.athleteId, athlete: targetSlot.athlete };
            return s;
          });
        } else {
          next = us
            .filter((s) => !(sourceSlot && s.id === sourceSlot.id))
            .map((s) => (s.id === targetSlot.id ? { ...s, athleteId, athlete: athleteById.get(athleteId) ?? null } : s));
        }
      } else if (sourceSlot) {
        next = us.map((s) => (s.id === sourceSlot.id ? { ...s, x, y } : s));
      } else {
        const a = athleteById.get(athleteId) ?? null;
        next = [...us, { id: `optimistic-${athleteId}`, side: "US", positionLabel: a?.primaryPosition ?? null, athleteId, athlete: a, x, y }];
      }
      return [...next, ...rest];
    });
  }
  function optimisticRemove(athleteId: string) {
    setLocalSlots((prev) => prev.filter((s) => !(s.side !== "OPPONENT" && s.athleteId === athleteId)));
  }
  function optimisticMoveOpponent(slotId: string, x: number, y: number) {
    setLocalSlots((prev) => prev.map((s) => (s.id === slotId ? { ...s, x, y } : s)));
  }
  function optimisticRemoveSlot(slotId: string) {
    setLocalSlots((prev) => prev.filter((s) => s.id !== slotId));
  }

  // --- Pointer-based dragging (players, opponent markers, the ball) --------

  function startDrag(e: React.PointerEvent, meta: Omit<DragState, "pointerId" | "clientX" | "clientY">) {
    if (locked || mode === "draw") return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrag({ ...meta, pointerId: e.pointerId, clientX: e.clientX, clientY: e.clientY });
  }
  function moveDrag(e: React.PointerEvent) {
    setDrag((prev) => (prev && prev.pointerId === e.pointerId ? { ...prev, clientX: e.clientX, clientY: e.clientY } : prev));
  }
  function endDrag(e: React.PointerEvent) {
    const ds = drag;
    setDrag(null);
    if (!ds || ds.pointerId !== e.pointerId) return;
    const pRect = pitchRef.current?.getBoundingClientRect();
    const bRect = benchRef.current?.getBoundingClientRect();

    if (ds.side === "US" && ds.kind === "board" && ds.athleteId && rectContains(bRect, e.clientX, e.clientY)) {
      optimisticRemove(ds.athleteId);
      start(async () => { await removeFromBoard(lineup.id, ds.athleteId!); refresh(); });
      return;
    }
    if (!rectContains(pRect, e.clientX, e.clientY) || !pRect) return;

    const leftPct = ((e.clientX - pRect.left) / pRect.width) * 100;
    const topPct = ((e.clientY - pRect.top) / pRect.height) * 100;
    const { x, y } = fromScreen(leftPct, topPct, view);

    if (ds.side === "BALL") {
      setLocalBall({ x, y });
      start(async () => { await moveBall(lineup.id, x, y); refresh(); });
      return;
    }
    if (ds.side === "OPPONENT") {
      if (!ds.slotId) return;
      optimisticMoveOpponent(ds.slotId, x, y);
      start(async () => { await moveOpponentSlot(lineup.id, ds.slotId!, x, y); refresh(); });
      return;
    }

    if (!ds.athleteId) return;
    const excludeId = ds.kind === "board" ? ds.slotId : null;
    const target = nearestSlot(usSlots, x, y, excludeId);
    optimisticPlace(ds.athleteId, x, y, target?.id ?? null);
    start(async () => {
      const res = await placeAthlete(lineup.id, ds.athleteId!, x, y, target?.id ?? null);
      if (!res.ok) toast(res.error ?? "Failed.", "error");
      refresh();
    });
  }

  // --- Drawing arrows (pass / run) ------------------------------------------

  function pitchPointFrom(e: React.PointerEvent): { x: number; y: number } | null {
    const rect = pitchRef.current?.getBoundingClientRect();
    if (!rect) return null;
    const leftPct = ((e.clientX - rect.left) / rect.width) * 100;
    const topPct = ((e.clientY - rect.top) / rect.height) * 100;
    return fromScreen(leftPct, topPct, view);
  }
  function onPitchPointerDown(e: React.PointerEvent) {
    if (mode !== "draw" || locked) return;
    const p = pitchPointFrom(e);
    if (!p) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    // Snap to another arrow's endpoint if we're starting close to one — this
    // is what makes two separately-drawn arrows register as one connected,
    // sequential motion (see src/lib/board-sequence.ts) instead of two
    // independent ones that merely happen to be near each other.
    const sameKind = localArrows.filter((a) => a.kind === arrowKind);
    let startPoint = p;
    let bestDist = 6;
    for (const a of sameKind) {
      const d = Math.hypot(a.toX - p.x, a.toY - p.y);
      if (d <= bestDist) { bestDist = d; startPoint = { x: a.toX, y: a.toY }; }
    }
    setDrawing({ pointerId: e.pointerId, x1: startPoint.x, y1: startPoint.y, x2: startPoint.x, y2: startPoint.y });
  }
  function onPitchPointerMove(e: React.PointerEvent) {
    if (!drawing || drawing.pointerId !== e.pointerId) return;
    const p = pitchPointFrom(e);
    if (!p) return;
    setDrawing((prev) => (prev ? { ...prev, x2: p.x, y2: p.y } : prev));
  }
  function onPitchPointerUp(e: React.PointerEvent) {
    if (!drawing || drawing.pointerId !== e.pointerId) return;
    const d = drawing;
    setDrawing(null);
    if (Math.hypot(d.x2 - d.x1, d.y2 - d.y1) < 2) return; // a tap, not a drag — ignore
    const optimisticId = `optimistic-arrow-${Date.now()}`;
    setLocalArrows((prev) => [...prev, { id: optimisticId, kind: arrowKind, fromX: d.x1, fromY: d.y1, toX: d.x2, toY: d.y2, createdAt: new Date().toISOString() }]);
    start(async () => {
      const res = await addArrow(lineup.id, arrowKind, d.x1, d.y1, d.x2, d.y2);
      if (!res.ok) toast(res.error ?? "Failed.", "error");
      refresh();
    });
  }
  function doClearArrows() {
    setLocalArrows([]);
    start(async () => { await clearArrows(lineup.id); refresh(); });
  }

  // --- Playing the sequence (client-side only — never persisted) -----------
  // See src/lib/board-sequence.ts for how connected arrows become ordered
  // steps. Each step moves whichever players/ball have an arrow at that
  // index, all at once; steps play out one after another. `baselineRef`
  // captures the pre-playback shape once (on the first Play/step click) so
  // Reset can always get back to it, no matter how many steps were played.

  function ensureBaseline() {
    if (!baselineRef.current) baselineRef.current = { slots: localSlots, ball: localBall };
  }

  function applyStep(step: Step, index: number) {
    setLocalSlots((prev) => prev.map((s) => {
      if (s.side === "OPPONENT" || !s.athleteId) return s;
      const arrow = step.runs.find((a) => Math.hypot(a.fromX - s.x, a.fromY - s.y) < 8);
      return arrow ? { ...s, x: arrow.toX, y: arrow.toY } : s;
    }));
    if (step.passes[0]) setLocalBall({ x: step.passes[0].toX, y: step.passes[0].toY });
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
      if (i >= sequence.length) {
        setTimeout(resetSequence, 400);
        return;
      }
      applyStep(sequence[i], i);
      i++;
      setTimeout(next, STEP_MS);
    };
    next();
  }

  function resetSequence() {
    if (baselineRef.current) {
      setLocalSlots(baselineRef.current.slots);
      setLocalBall(baselineRef.current.ball);
    }
    baselineRef.current = null;
    setActiveStep(null);
    setAnimating(false);
  }

  function quickFill(formationId: string) {
    start(async () => {
      const res = await applyFormationTemplate(lineup.id, formationId);
      if (!res.ok) toast(res.error ?? "Failed.", "error");
      refresh();
    });
  }
  function clear() {
    setLocalSlots((prev) => prev.filter((s) => s.side === "OPPONENT"));
    start(async () => { await clearBoard(lineup.id); refresh(); });
  }
  function deleteEmptySlot(slotId: string) {
    optimisticRemoveSlot(slotId);
    start(async () => {
      const res = await removeSlot(slotId);
      if (!res.ok) toast(res.error ?? "Failed.", "error");
      refresh();
    });
  }
  function addOpponent(formationId: string) {
    start(async () => {
      const res = await addOpponentFormation(lineup.id, formationId);
      if (!res.ok) toast(res.error ?? "Failed.", "error");
      refresh();
    });
  }
  function clearOpponent() {
    setLocalSlots((prev) => prev.filter((s) => s.side !== "OPPONENT"));
    start(async () => { await clearOpponentFormation(lineup.id); refresh(); });
  }
  function toggleBall() {
    if (localBall) {
      setLocalBall(null);
      start(async () => { await removeBall(lineup.id); refresh(); });
    } else {
      setLocalBall({ x: 50, y: 50 });
      start(async () => { await addBall(lineup.id); refresh(); });
    }
  }

  function switchLineup(id: string) {
    if (id === lineup.id) return;
    router.push(`/teams/board?lineup=${id}`);
  }
  function createNew() {
    start(async () => {
      const res = await createLineup(lineup.teamId);
      if (res.ok && res.id) router.push(`/teams/board?lineup=${res.id}`);
      else toast(res.error ?? "Failed.", "error");
    });
  }
  function saveName() {
    setRenaming(false);
    if (nameDraft.trim() === lineup.name) return;
    start(async () => {
      const res = await renameLineup(lineup.id, nameDraft);
      if (!res.ok) toast(res.error ?? "Failed.", "error");
      refresh();
    });
  }
  function removeLineup() {
    start(async () => {
      const res = await deleteLineup(lineup.id);
      if (res.ok) { toast("Board deleted."); router.push("/teams/board"); }
      else toast(res.error ?? "Failed.", "error");
    });
  }

  function openShare() {
    setShareUrl(lineup.sharedAt && lineup.shareToken ? `${window.location.origin}/share/lineup/${lineup.shareToken}` : null);
    setShareOpen(true);
  }
  function doShare() {
    start(async () => {
      const res = await shareLineup(lineup.id, shareNotes);
      if (res.ok && res.token) {
        setShareUrl(`${window.location.origin}/share/lineup/${res.token}`);
        toast("Shared with the team.");
      } else {
        toast(res.error ?? "Failed.", "error");
      }
      refresh();
    });
  }
  function doUnshare() {
    start(async () => {
      const res = await unshareLineup(lineup.id);
      if (res.ok) { toast("Stopped sharing."); setShareUrl(null); }
      refresh();
    });
  }
  function copyShareUrl() {
    if (!shareUrl) return;
    navigator.clipboard.writeText(shareUrl);
    toast("Link copied.");
  }

  const dragGhostAthlete = drag?.athleteId ? athleteById.get(drag.athleteId) ?? null : null;
  const previewArrow = drawing && Math.hypot(drawing.x2 - drawing.x1, drawing.y2 - drawing.y1) >= 2 ? drawing : null;

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_260px]">
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Select value={lineup.id} onChange={(e) => switchLineup(e.target.value)} className="h-9 w-auto max-w-[200px] border-slate-700 bg-slate-800 text-slate-100">
            {lineups.map((l) => <option key={l.id} value={l.id}>{l.name}{l.sharedAt ? " (shared)" : ""}</option>)}
          </Select>
          {renaming ? (
            <div className="flex items-center gap-1">
              <Input value={nameDraft} onChange={(e) => setNameDraft(e.target.value)} className="h-9 w-40 border-slate-700 bg-slate-800 text-slate-100" autoFocus />
              <button onClick={saveName} className="rounded p-1.5 text-blue-400 hover:bg-white/10"><Check className="h-4 w-4" /></button>
              <button onClick={() => { setRenaming(false); setNameDraft(lineup.name); }} className="rounded p-1.5 text-slate-400 hover:bg-white/10"><X className="h-4 w-4" /></button>
            </div>
          ) : (
            <button onClick={() => setRenaming(true)} className="flex items-center gap-1 rounded-md border border-slate-700 px-2 py-1.5 text-xs text-slate-300 hover:bg-white/10">
              <Pencil className="h-3.5 w-3.5" /> {lineup.name}
            </button>
          )}
          <Button size="sm" variant="outline" onClick={createNew}><Plus className="h-3.5 w-3.5" /> New board</Button>
          <Button size="sm" variant="outline" onClick={openShare}><Share2 className="h-3.5 w-3.5" /> {lineup.sharedAt ? "Shared" : "Share"}</Button>
          <Button size="sm" variant="ghost" onClick={removeLineup} title="Delete this board" className="text-red-400 hover:text-red-300"><Trash2 className="h-3.5 w-3.5" /></Button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-md border border-slate-700 p-0.5">
            {BOARD_VIEWS.map((v) => (
              <button
                key={v.value}
                onClick={() => changeView(v.value)}
                className={`rounded px-2 py-1 text-xs ${view === v.value ? "bg-blue-600 text-white" : "text-slate-300 hover:bg-white/10"}`}
              >
                {v.label}
              </button>
            ))}
          </div>
          <Button size="sm" variant="outline" onClick={toggleNames}>
            {showNames ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />} Names
          </Button>
          <Button size="sm" variant={locked ? "primary" : "outline"} onClick={toggleLock} title="Freeze positions so nothing moves by accident">
            {locked ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />} {locked ? "Locked" : "Lock"}
          </Button>
          {usSlots.length > 0 && (
            <Button size="sm" variant="outline" onClick={clear} disabled={pending || locked}><Eraser className="h-3.5 w-3.5" /> Clear board</Button>
          )}
          <Button size="sm" variant="outline" onClick={() => setOpponentOpen((v) => !v)} disabled={locked}>
            <Swords className="h-3.5 w-3.5" /> Opponent
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-md border border-slate-700 p-0.5">
            <button
              onClick={() => setMode("move")}
              disabled={locked}
              className={`flex items-center gap-1 rounded px-2 py-1 text-xs ${mode === "move" ? "bg-blue-600 text-white" : "text-slate-300 hover:bg-white/10"}`}
            >
              <Pointer className="h-3.5 w-3.5" /> Move
            </button>
            <button
              onClick={() => setMode("draw")}
              disabled={locked}
              className={`flex items-center gap-1 rounded px-2 py-1 text-xs ${mode === "draw" ? "bg-blue-600 text-white" : "text-slate-300 hover:bg-white/10"}`}
            >
              <PenLine className="h-3.5 w-3.5" /> Draw
            </button>
          </div>
          {mode === "draw" && (
            <div className="flex rounded-md border border-slate-700 p-0.5">
              <button onClick={() => setArrowKind("RUN")} className={`rounded px-2 py-1 text-xs ${arrowKind === "RUN" ? "bg-amber-500 text-slate-900" : "text-slate-300 hover:bg-white/10"}`}>Run</button>
              <button onClick={() => setArrowKind("PASS")} className={`rounded px-2 py-1 text-xs ${arrowKind === "PASS" ? "bg-white text-slate-900" : "text-slate-300 hover:bg-white/10"}`}>Pass</button>
            </div>
          )}
          {localArrows.length > 0 && (
            <Button size="sm" variant="outline" onClick={doClearArrows} disabled={pending}><Eraser className="h-3.5 w-3.5" /> Clear arrows</Button>
          )}
          <Button size="sm" variant="outline" onClick={toggleBall} disabled={locked}>
            <CircleDot className="h-3.5 w-3.5" /> {localBall ? "Remove ball" : "Add ball"}
          </Button>
          <Button size="sm" variant="success" onClick={playAll} disabled={animating || sequence.length === 0}>
            <Play className="h-3.5 w-3.5" /> {animating ? "Playing…" : "Play"}
          </Button>
          {activeStep !== null && (
            <Button size="sm" variant="outline" onClick={resetSequence} disabled={animating}>
              <RotateCcw className="h-3.5 w-3.5" /> Reset
            </Button>
          )}
        </div>

        {opponentOpen && (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-red-800/60 bg-red-950/30 p-3">
            {opponentSlots.length === 0 ? (
              <>
                <span className="text-xs text-slate-300">Sketch in an expected opponent shape:</span>
                {formations.map((f) => (
                  <Button key={f.id} size="sm" variant="outline" onClick={() => addOpponent(f.id)} disabled={pending}>{f.name}</Button>
                ))}
              </>
            ) : (
              <>
                <span className="text-xs text-slate-300">Opponent shape shown in red — drag markers to adjust.</span>
                <Button size="sm" variant="outline" onClick={clearOpponent} disabled={pending}><Eraser className="h-3.5 w-3.5" /> Clear opponent</Button>
              </>
            )}
          </div>
        )}

        {usSlots.length === 0 && (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-slate-700 p-3">
            <span className="text-xs text-slate-300">Drag athletes onto the pitch freely, or quick-fill a formation:</span>
            {formations.map((f) => (
              <Button key={f.id} size="sm" variant="outline" onClick={() => quickFill(f.id)} disabled={pending}>{f.name}</Button>
            ))}
          </div>
        )}

        <div
          ref={pitchRef}
          onPointerDown={onPitchPointerDown}
          onPointerMove={onPitchPointerMove}
          onPointerUp={onPitchPointerUp}
          onPointerCancel={() => setDrawing(null)}
          className={`relative mx-auto w-full max-w-full touch-none overflow-hidden rounded-xl border border-slate-700 ${mode === "draw" ? "cursor-crosshair" : ""}`}
          style={{ aspectRatio: aspectRatioFor(view), maxHeight: "70vh" }}
        >
          <PitchMarkings view={view} />

          <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="pointer-events-none absolute inset-0 h-full w-full">
            {visibleArrows.map((a) => {
              const p1 = toScreen(a.fromX, a.fromY, view);
              const p2 = toScreen(a.toX, a.toY, view);
              return <ArrowLine key={a.id} x1={p1.left} y1={p1.top} x2={p2.left} y2={p2.top} kind={a.kind} />;
            })}
            {previewArrow && (() => {
              const p1 = toScreen(previewArrow.x1, previewArrow.y1, view);
              const p2 = toScreen(previewArrow.x2, previewArrow.y2, view);
              return <ArrowLine x1={p1.left} y1={p1.top} x2={p2.left} y2={p2.top} kind={arrowKind} />;
            })()}
          </svg>

          {visibleOpponent.map((slot) => {
            const { left, top } = toScreen(slot.x, slot.y, view);
            const isDragging = drag?.slotId === slot.id;
            return (
              <div
                key={slot.id}
                className="absolute -translate-x-1/2 -translate-y-1/2"
                style={{ left: `${left}%`, top: `${top}%`, opacity: isDragging ? 0.25 : 1, transition: animating ? "none" : undefined }}
              >
                <div
                  onPointerDown={(e) => startDrag(e, { kind: "board", side: "OPPONENT", athleteId: null, slotId: slot.id })}
                  onPointerMove={moveDrag}
                  onPointerUp={endDrag}
                  onPointerCancel={() => setDrag(null)}
                  className={locked || mode === "draw" ? "" : "cursor-grab touch-none active:cursor-grabbing"}
                >
                  <OpponentBadge positionLabel={slot.positionLabel} />
                </div>
                {!locked && mode === "move" && <button onClick={() => deleteEmptySlot(slot.id)} className="mt-0.5 block w-full text-center text-[9px] text-white/70 hover:text-white">remove</button>}
              </div>
            );
          })}

          {visibleUs.map((slot) => {
            const { left, top } = toScreen(slot.x, slot.y, view);
            const isDragging = drag?.slotId === slot.id;
            return (
              <div
                key={slot.id}
                className="absolute -translate-x-1/2 -translate-y-1/2"
                style={{ left: `${left}%`, top: `${top}%`, opacity: isDragging ? 0.25 : 1, transition: animating ? "left 1.8s ease-in-out, top 1.8s ease-in-out" : undefined }}
              >
                {slot.athlete ? (
                  <div
                    onPointerDown={(e) => startDrag(e, { kind: "board", side: "US", athleteId: slot.athleteId, slotId: slot.id })}
                    onPointerMove={moveDrag}
                    onPointerUp={endDrag}
                    onPointerCancel={() => setDrag(null)}
                    className={locked || mode === "draw" ? "" : "cursor-grab touch-none active:cursor-grabbing"}
                  >
                    <PlayerBadge athlete={slot.athlete} showName={showNames} />
                  </div>
                ) : (
                  <>
                    <EmptySlotMarker positionLabel={slot.positionLabel} />
                    {!locked && mode === "move" && <button onClick={() => deleteEmptySlot(slot.id)} className="mt-0.5 block w-full text-center text-[9px] text-white/70 hover:text-white">remove</button>}
                  </>
                )}
              </div>
            );
          })}

          {localBall && visibleInView(localBall.y, view) && (() => {
            const { left, top } = toScreen(localBall.x, localBall.y, view);
            const isDragging = drag?.side === "BALL";
            return (
              <div
                onPointerDown={(e) => startDrag(e, { kind: "ball", side: "BALL", athleteId: null, slotId: null })}
                onPointerMove={moveDrag}
                onPointerUp={endDrag}
                onPointerCancel={() => setDrag(null)}
                className={`absolute -translate-x-1/2 -translate-y-1/2 ${locked || mode === "draw" ? "" : "cursor-grab touch-none active:cursor-grabbing"}`}
                style={{ left: `${left}%`, top: `${top}%`, opacity: isDragging ? 0.25 : 1, transition: animating ? "left 0.9s ease-in-out, top 0.9s ease-in-out" : undefined }}
              >
                <BallToken />
              </div>
            );
          })()}

          {drag && (
            <div className="pointer-events-none fixed z-50 -translate-x-1/2 -translate-y-1/2" style={{ left: drag.clientX, top: drag.clientY }}>
              {drag.side === "OPPONENT" ? (
                <OpponentBadge positionLabel={opponentSlots.find((s) => s.id === drag.slotId)?.positionLabel ?? null} />
              ) : drag.side === "BALL" ? (
                <BallToken />
              ) : (
                dragGhostAthlete && <PlayerBadge athlete={dragGhostAthlete} showName={showNames} />
              )}
            </div>
          )}
        </div>
        {mode === "draw" && <p className="text-[11px] text-slate-400">Drag on the pitch to draw a {arrowKind === "RUN" ? "player run (dashed, yellow)" : "pass (solid, white)"}.</p>}
      </div>

      <div className="space-y-4">
        <div ref={benchRef} className="space-y-2 rounded-xl border border-slate-700 bg-slate-800/40 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-300">Bench ({bench.length})</p>
          {bench.length === 0 ? (
            <p className="text-xs text-slate-400">Everyone on the roster is on the pitch.</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {bench.map((a) => {
                const isDragging = drag?.kind === "bench" && drag.athleteId === a.id;
                return (
                  <div
                    key={a.id}
                    onPointerDown={(e) => startDrag(e, { kind: "bench", side: "US", athleteId: a.id, slotId: null })}
                    onPointerMove={moveDrag}
                    onPointerUp={endDrag}
                    onPointerCancel={() => setDrag(null)}
                    className={`flex items-center gap-1.5 rounded-full border border-slate-600 bg-slate-100 px-2 py-1 text-xs shadow-sm touch-none ${locked || mode === "draw" ? "" : "cursor-grab active:cursor-grabbing"}`}
                    style={{ opacity: isDragging ? 0.3 : 1 }}
                    title={a.primaryPosition ?? undefined}
                  >
                    {a.jerseyNumber != null && <span className="font-semibold text-slate-400">{a.jerseyNumber}</span>}
                    <span className="truncate text-slate-700">{a.displayName}</span>
                  </div>
                );
              })}
            </div>
          )}
          <p className="pt-2 text-[11px] text-slate-400">Drag anywhere onto the pitch to place freely, drag near another player to swap, or drag back here to bench them.</p>
        </div>

        {sequence.length > 0 && (
          <div className="space-y-2 rounded-xl border border-slate-700 bg-slate-800/40 p-3">
            <div className="flex items-center justify-between">
              <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-300">
                <ListOrdered className="h-3.5 w-3.5" /> Sequence
              </p>
              {activeStep !== null && (
                <button onClick={resetSequence} disabled={animating} className="text-[10px] text-slate-400 hover:text-white">reset</button>
              )}
            </div>
            <ol className="space-y-1">
              {sequence.map((step, i) => (
                <li key={i}>
                  <button
                    onClick={() => playStep(i)}
                    disabled={animating}
                    className={`w-full rounded-md border px-2 py-1.5 text-left text-xs transition-colors ${
                      activeStep === i ? "border-amber-400 bg-amber-400/10 text-amber-200" : "border-slate-700 text-slate-300 hover:bg-white/5"
                    }`}
                  >
                    Step {i + 1}: {describeStep(step)}
                  </button>
                </li>
              ))}
            </ol>
            <p className="pt-1 text-[11px] text-slate-400">Click a step to play just that motion, or "Play" above to run the whole sequence.</p>
          </div>
        )}
      </div>

      <Modal open={shareOpen} onClose={() => setShareOpen(false)} title="Share with the team" className="max-w-md">
        <div className="space-y-3">
          <p className="text-sm text-slate-500">Anyone with the link can view this board — no login required. A message to go with it:</p>
          <Textarea value={shareNotes} onChange={(e) => setShareNotes(e.target.value)} rows={3} placeholder="Game plan notes for the team…" />
          {shareUrl && (
            <div className="flex items-center gap-2 rounded-md border border-border bg-slate-50 p-2">
              <code className="flex-1 truncate select-all text-sm">{shareUrl}</code>
              <button onClick={copyShareUrl} className="text-slate-400 hover:text-slate-700"><Copy className="h-4 w-4" /></button>
            </div>
          )}
          <div className="flex justify-end gap-2 pt-1">
            {lineup.sharedAt && <Button variant="outline" onClick={doUnshare} disabled={pending}>Stop sharing</Button>}
            <Button onClick={doShare} disabled={pending}>{lineup.sharedAt ? "Re-share (new link)" : "Share"}</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
