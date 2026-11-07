/**
 * Runs scheduled tasks automatically — only while the app is open in a tab,
 * because task data lives on this device.
 */
import { toast } from "sonner";

import { taskCost } from "./credit-cost";
import { canAfford } from "./credits";
import { tt } from "./i18n";
import { getRun, launchRun } from "./run-store";
import { getState, updateTask, type Task } from "./session-store";

const TICK_MS = 15_000;
let timer: ReturnType<typeof setInterval> | null = null;

/** Tasks whose scheduled time has come and that can start now. */
export function dueTasks(tasks: Task[], now: number): Task[] {
  return tasks.filter((t) => t.scheduledAt != null && t.scheduledAt <= now && t.status === "ready");
}

export function tick(now = Date.now()) {
  for (const task of dueTasks(getState().tasks, now)) {
    const run = getRun(task.id);
    updateTask(task.id, { scheduledAt: undefined });
    if (run && (run.phase === "running" || run.phase === "paused")) continue;
    if (!canAfford(taskCost(task))) {
      toast.error(tt("เครดิตไม่พอ งานที่ตั้งเวลาไว้ไม่ได้เริ่ม", "Not enough credits — a scheduled task didn't start"));
      continue;
    }
    launchRun(task);
    toast.success(tt("เริ่มงานที่ตั้งเวลาไว้แล้ว", "Scheduled task started"));
  }
}

export function startScheduler() {
  if (timer || typeof window === "undefined") return;
  tick();
  timer = setInterval(() => tick(), TICK_MS);
}
