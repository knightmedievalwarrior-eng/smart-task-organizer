/**
 * Credit cost per task, by complexity. Mirrors the database function
 * `public.task_credit_cost` — signed-in users are charged by the server
 * using that function, guests locally using this one.
 */
import { readItems, type TaskData, type TaskType } from "./tasks/definitions";

export type CostKind = TaskType | "excel";

export function creditCost(kind: CostKind, units = 0): number {
  const u = Math.max(0, Math.floor(units || 0));
  switch (kind) {
    case "customer":
      return 1;
    case "quotation":
      // 2 credits, +1 for every 10 items beyond the first
      return 2 + Math.floor(Math.max(u - 1, 0) / 10);
    case "document":
      return 2;
    case "excel":
      // 3 credits, +1 for every 1,000 rows
      return 3 + Math.floor(u / 1000);
    default:
      return 20;
  }
}

/** How "big" a task is, sent along with the charge. */
export function taskUnits(type: TaskType, data: TaskData): number {
  if (type === "quotation") return readItems(data).length;
  return 0;
}

export const taskCost = (task: { type: TaskType; data: TaskData }) =>
  creditCost(task.type, taskUnits(task.type, task.data));
