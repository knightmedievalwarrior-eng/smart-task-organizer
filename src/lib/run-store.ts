/**
 * Live bot runs, kept in memory for the whole app so the Command Center,
 * header and execution screen all show the same real-time status.
 * Runs keep going while the user navigates around the app.
 */
import { useSyncExternalStore } from "react";
import { toast } from "sonner";

import { tt, tx } from "./i18n";
import { getN8nConfig } from "./n8n/config";
import { initialProgress, type StepProgress } from "./n8n/protocol";
import { taskUnits } from "./credit-cost";
import { chargeTask } from "./credits";
import { openUpgrade } from "./upgrade";
import { startRun, type LogLine, type RunControl, type RunMode } from "./runner";
import { finishTask, getState, uid, updateTask, type Task } from "./session-store";
import { TASKS, type TaskType } from "./tasks/definitions";

export type RunPhase = "authorizing" | "running" | "paused" | "done" | "error";

export interface LiveRun {
  taskId: string;
  type: TaskType;
  mode: RunMode;
  target?: string | undefined;
  phase: RunPhase;
  progress: StepProgress;
  logs: LogLine[];
  startedAt: number;
  canPause: boolean;
  entryId?: string | undefined;
  failure?: { index: number; label: string; message: string };
}

const runs = new Map<string, LiveRun>();
const controls = new Map<string, RunControl>();
const listeners = new Set<() => void>();
let snapshot: LiveRun[] = [];

function emit() {
  snapshot = [...runs.values()];
  listeners.forEach((l) => l());
}

function patch(taskId: string, fn: (r: LiveRun) => LiveRun) {
  const r = runs.get(taskId);
  if (!r) return;
  runs.set(taskId, fn(r));
  emit();
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

const EMPTY: LiveRun[] = [];
export function useLiveRuns(): LiveRun[] {
  return useSyncExternalStore(
    subscribe,
    () => snapshot,
    () => EMPTY,
  );
}

export function useRun(taskId: string): LiveRun | undefined {
  return useLiveRuns().find((r) => r.taskId === taskId);
}

export function getRun(taskId: string): LiveRun | undefined {
  return runs.get(taskId);
}

function chargeRequestId(taskId: string): string | undefined {
  if (typeof window === "undefined" || typeof crypto === "undefined" || !("randomUUID" in crypto))
    return undefined;
  const key = `gtr.credit-request.${taskId}`;
  const existing = window.localStorage.getItem(key);
  if (existing) return existing;
  const id = crypto.randomUUID();
  window.localStorage.setItem(key, id);
  return id;
}

function clearChargeRequestId(taskId: string) {
  if (typeof window !== "undefined") window.localStorage.removeItem(`gtr.credit-request.${taskId}`);
}

/** Starts the bot for a ready task. Safe to call twice (returns the existing run). */
export function launchRun(task: Task): LiveRun {
  const existing = runs.get(task.id);
  if (
    existing &&
    (existing.phase === "authorizing" ||
      existing.phase === "running" ||
      existing.phase === "paused")
  )
    return existing;

  const def = TASKS[task.type];
  const runId = uid();
  const requestId = chargeRequestId(task.id);
  const rejectRun = () => {
    const r = runs.get(task.id);
    if (!r || r !== run) return;
    controls.get(task.id)?.cancel();
    controls.delete(task.id);
    runs.delete(task.id);
    if (getState().tasks.some((t) => t.id === task.id))
      updateTask(task.id, { lastRun: undefined, status: "ready" });
    emit();
    toast.error(tt("เครดิตไม่พอ งานถูกหยุด", "Not enough credits — the task was stopped"));
    openUpgrade();
  };
  const config = getN8nConfig();
  const mode: RunMode = config.url ? "n8n" : "simulate";
  const startedAt = Date.now();
  let target: string | undefined;
  try {
    target = config.url ? new URL(config.url).host : undefined;
  } catch {
    target = config.url;
  }

  const run: LiveRun = {
    taskId: task.id,
    type: task.type,
    mode,
    target,
    phase: "authorizing",
    progress: initialProgress(def.pipeline.length),
    logs: [],
    startedAt,
    canPause: mode === "simulate",
  };
  runs.set(task.id, run);
  emit();

  // The server is the source of truth: do not execute a task before its charge succeeds.
  void chargeTask(task.type, taskUnits(task.type, task.data), requestId)
    .then(({ ok }) => {
      if (!ok) return rejectRun();
      clearChargeRequestId(task.id);
      if (runs.get(task.id) !== run) return;
      const authorizedAt = Date.now();
      updateTask(task.id, { lastRun: { status: "running", startedAt: authorizedAt } });
      patch(task.id, (r) => ({ ...r, phase: "running", startedAt: authorizedAt }));

      const control = startRun(
        { id: task.id, type: task.type, data: task.data },
        {
          onLog: (line) =>
            patch(task.id, (r) => ({
              ...r,
              logs: [...r.logs, { ...line, id: r.logs.length + 1 }],
            })),
          onProgress: (progress) => patch(task.id, (r) => ({ ...r, progress })),
          onDone: () => {
            const entry = finishTask(task.id, "success", authorizedAt, def.pipeline.length, {
              mode,
            });
            patch(task.id, (r) => ({ ...r, phase: "done", entryId: entry?.id }));
            controls.delete(task.id);
            const onScreen =
              typeof window !== "undefined" && window.location.pathname === `/execute/${task.id}`;
            if (!onScreen) {
              // Nobody is watching the execution screen: forget the run so it doesn't linger.
              runs.delete(task.id);
              emit();
              toast.success(tt(`${def.title.th}สำเร็จ`, `${def.title.en} done`), {
                description: entry?.ref,
              });
            }
          },
          onError: ({ index, message }) => {
            const label = tx(def.pipeline[index]);
            updateTask(task.id, {
              lastRun: {
                status: "failed",
                startedAt: authorizedAt,
                failedStep: index,
                failedLabel: label,
                message,
              },
            });
            const entry = finishTask(task.id, "failed", authorizedAt, index, {
              failedStep: index,
              mode,
            });
            patch(task.id, (r) => ({
              ...r,
              phase: "error",
              entryId: entry?.id,
              failure: { index, label, message },
            }));
            controls.delete(task.id);
            toast.error(
              tt(
                `${def.title.th} ขัดข้องที่ขั้นตอน ${index + 1}/${def.pipeline.length}`,
                `${def.title.en} failed at step ${index + 1}/${def.pipeline.length}`,
              ),
              { description: label },
            );
          },
        },
        { mode, config, runId },
      );
      controls.set(task.id, control);
    })
    .catch(rejectRun);
  return run;
}

export function pauseRun(taskId: string) {
  const c = controls.get(taskId);
  if (!c?.canPause) return;
  c.pause();
  patch(taskId, (r) => ({ ...r, phase: "paused" }));
}

export function resumeRun(taskId: string) {
  const c = controls.get(taskId);
  if (!c?.canPause) return;
  c.resume();
  patch(taskId, (r) => ({ ...r, phase: "running" }));
}

/** Stops a run locally; the task stays in Pending. */
export function cancelRun(taskId: string) {
  const r = runs.get(taskId);
  controls.get(taskId)?.cancel();
  controls.delete(taskId);
  if (r?.phase === "authorizing") return;
  if (r && (r.phase === "running" || r.phase === "paused")) {
    finishTask(taskId, "cancelled", r.startedAt, r.progress.completed, { mode: r.mode });
  }
  if (getState().tasks.some((t) => t.id === taskId)) updateTask(taskId, { lastRun: undefined });
  runs.delete(taskId);
  emit();
}

/** Forgets a finished/failed run (its outcome is already in history / the task). */
export function dismissRun(taskId: string) {
  const r = runs.get(taskId);
  if (!r || r.phase === "running" || r.phase === "paused") return;
  runs.delete(taskId);
  emit();
}

/** Test helper. */
export function __resetRunsForTests() {
  controls.forEach((c) => c.cancel());
  controls.clear();
  runs.clear();
  emit();
}
