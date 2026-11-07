import { describe, expect, it } from "vitest";

import { balance, emptyState, normalize, spend, FREE_DAILY, PRO_MONTHLY, RUN_COST } from "@/lib/credits";
import { PACKAGES } from "@/lib/payment";

const d = (s: string) => new Date(s);

describe("credits", () => {
  it("gives 250 free credits per day", () => {
    expect(FREE_DAILY).toBe(250);
    expect(balance(emptyState(d("2026-11-05T10:00:00")), false).total).toBe(250);
  });

  it("one task costs 20 credits", () => {
    expect(RUN_COST).toBe(20);
    const s = spend(emptyState(d("2026-11-05T10:00:00")), RUN_COST, false)!;
    expect(balance(s, false).free).toBe(230);
  });

  it("refills free credits at midnight", () => {
    const used = { ...emptyState(d("2026-11-05T23:59:00")), freeUsed: 240 };
    expect(balance(normalize(used, d("2026-11-05T23:59:30")), false).free).toBe(10);
    expect(balance(normalize(used, d("2026-11-06T00:00:00")), false).free).toBe(250);
  });

  it("blocks a task when credits run out", () => {
    const s = { ...emptyState(d("2026-11-05T10:00:00")), freeUsed: 240 };
    expect(spend(s, RUN_COST, false)).toBeNull();
  });

  it("pack credits never expire and are used after free credits", () => {
    const s = { ...emptyState(d("2026-01-01T10:00:00")), freeUsed: 240, pack: 2500 };
    const later = normalize(s, d("2027-06-01T10:00:00"));
    expect(later.pack).toBe(2500);
    const after = spend({ ...later, freeUsed: 250 }, RUN_COST, false)!;
    expect(after.pack).toBe(2480);
  });

  it("Pro gets 25,000 credits that reset each month", () => {
    expect(PRO_MONTHLY).toBe(25000);
    const s = { ...emptyState(d("2026-11-30T10:00:00")), proUsed: 25000 };
    expect(balance(s, true).monthly).toBe(0);
    expect(balance(normalize(s, d("2026-12-01T00:00:00")), true).monthly).toBe(25000);
  });

  it("package prices", () => {
    expect(PACKAGES.pack.price).toBe(99);
    expect(PACKAGES.pack.credits).toBe(2500);
    expect(PACKAGES.pro.credits).toBe(25000);
  });
});
