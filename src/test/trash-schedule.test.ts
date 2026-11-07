import { beforeEach, describe, expect, it } from "vitest";

import { creditCost } from "@/lib/credit-cost";
import { dueTasks } from "@/lib/scheduler";
import {
  __resetForTests,
  createTask,
  deleteTask,
  getState,
  purgeExpired,
  restoreTask,
  updateTask,
} from "@/lib/session-store";

const DAY = 24 * 60 * 60 * 1000;

beforeEach(() => {
  window.sessionStorage.clear();
  window.localStorage.clear();
  __resetForTests();
});

describe("trash (30 days)", () => {
  it("moves a deleted task to the trash and restores it", () => {
    const t = createTask("customer", { name: "A" });
    deleteTask(t.id);
    expect(getState().tasks).toHaveLength(0);
    expect(getState().trash[0]?.task.id).toBe(t.id);
    restoreTask(t.id);
    expect(getState().tasks[0]?.id).toBe(t.id);
    expect(getState().trash).toHaveLength(0);
  });

  it("keeps items for 29 days and drops them after 30", () => {
    const t = createTask("customer");
    const now = Date.now();
    expect(purgeExpired([{ task: t, deletedAt: now - 29 * DAY }], now)).toHaveLength(1);
    expect(purgeExpired([{ task: t, deletedAt: now - 30 * DAY }], now)).toHaveLength(0);
  });

  it("survives a reload (tab closed and reopened)", () => {
    const t = createTask("customer");
    __resetForTests();
    expect(getState().tasks[0]?.id).toBe(t.id);
  });
});

describe("scheduler", () => {
  it("picks only ready tasks whose time has come", () => {
    const now = Date.now();
    const a = createTask("customer");
    const b = createTask("customer");
    const c = createTask("customer");
    updateTask(a.id, { status: "ready", scheduledAt: now - 1000 });
    updateTask(b.id, { status: "ready", scheduledAt: now + 60_000 });
    updateTask(c.id, { scheduledAt: now - 1000 }); // still a draft
    expect(dueTasks(getState().tasks, now).map((t) => t.id)).toEqual([a.id]);
  });
});

describe("credit cost by complexity", () => {
  it("customer 1, quotation 2, excel 3", () => {
    expect(creditCost("customer")).toBe(1);
    expect(creditCost("quotation", 1)).toBe(2);
    expect(creditCost("excel", 10)).toBe(3);
  });
  it("bigger jobs cost more", () => {
    expect(creditCost("quotation", 11)).toBe(3);
    expect(creditCost("excel", 2500)).toBe(5);
  });
});
