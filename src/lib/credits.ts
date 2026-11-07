/**
 * Usage credits, kept in this browser only (localStorage).
 *
 * - Everyone gets FREE_DAILY credits that refill at 00:00 (local time) each day.
 * - Monthly Pro Pass adds PRO_MONTHLY credits that reset each calendar month.
 * - Credit packs add credits that never expire.
 * Spending order: today's free credits → Pro monthly credits → pack credits.
 */
import { useSyncExternalStore } from "react";

import { creditCost, type CostKind } from "./credit-cost";
import { isPro } from "./plan";

export const FREE_DAILY = 250;
export const PRO_MONTHLY = 25_000;
export const RUN_COST = 20;
export const CREDITS_KEY = "gtr.credits.v1";

export type CreditState = {
  /** Local date (YYYY-MM-DD) the free usage belongs to. */
  day: string;
  freeUsed: number;
  /** Local month (YYYY-MM) the Pro usage belongs to. */
  month: string;
  proUsed: number;
  /** Non-expiring credits from packs. */
  pack: number;
};

const pad = (n: number) => String(n).padStart(2, "0");
export const dayKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const monthKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;

/** Rolls the daily/monthly counters over when the date has changed. */
export function normalize(s: CreditState, now: Date): CreditState {
  const day = dayKey(now);
  const month = monthKey(now);
  return {
    ...s,
    day,
    freeUsed: s.day === day ? s.freeUsed : 0,
    month,
    proUsed: s.month === month ? s.proUsed : 0,
  };
}

export function balance(s: CreditState, pro: boolean) {
  const free = Math.max(0, FREE_DAILY - s.freeUsed);
  const monthly = pro ? Math.max(0, PRO_MONTHLY - s.proUsed) : 0;
  return { free, monthly, pack: s.pack, total: free + monthly + s.pack };
}

/** Deducts `cost`; returns null when there isn't enough. */
export function spend(s: CreditState, cost: number, pro: boolean): CreditState | null {
  const b = balance(s, pro);
  if (b.total < cost) return null;
  let left = cost;
  const fromFree = Math.min(left, b.free);
  left -= fromFree;
  const fromPro = Math.min(left, b.monthly);
  left -= fromPro;
  return { ...s, freeUsed: s.freeUsed + fromFree, proUsed: s.proUsed + fromPro, pack: s.pack - left };
}

export function emptyState(now: Date): CreditState {
  return { day: dayKey(now), freeUsed: 0, month: monthKey(now), proUsed: 0, pack: 0 };
}

let cache: CreditState | null = null;
const listeners = new Set<() => void>();

function load(): CreditState {
  const now = new Date();
  let s = cache;
  if (!s) {
    s = emptyState(now);
    if (typeof window !== "undefined") {
      try {
        const raw = JSON.parse(window.localStorage.getItem(CREDITS_KEY) ?? "null");
        if (raw && typeof raw === "object") s = { ...s, ...raw } as CreditState;
      } catch {
        /* ignore broken value */
      }
    }
    cache = s;
  }
  const next = normalize(s, now);
  if (next.day !== s.day || next.month !== s.month) {
    save(next);
    return next;
  }
  return s;
}

function save(s: CreditState) {
  cache = s;
  if (typeof window !== "undefined") window.localStorage.setItem(CREDITS_KEY, JSON.stringify(s));
  listeners.forEach((l) => l());
}

type Balance = { free: number; monthly: number; pack: number; total: number };

/** Balance from the signed-in account (user_profiles); null for guests. */
let server: (Balance & { pro: boolean }) | null = null;
let signedIn = false;

function setServer(row: { free: number; monthly: number; pack: number; total: number; is_pro: boolean } | null) {
  server = row ? { free: row.free, monthly: row.monthly, pack: row.pack, total: row.total, pro: row.is_pro } : null;
  listeners.forEach((l) => l());
}

/** Re-reads the account balance (call after sign-in/out). */
export async function refreshServerCredits(isSignedIn: boolean) {
  signedIn = isSignedIn;
  if (!isSignedIn) return setServer(null);
  const { supabase } = await import("@/integrations/supabase/client");
  const { data, error } = await supabase.rpc("my_credits");
  if (error) return;
  setServer(data?.[0] ?? null);
}

export function getBalance(): Balance {
  if (server) return { free: server.free, monthly: server.monthly, pack: server.pack, total: server.total };
  return balance(load(), isPro());
}

export function canAfford(cost = RUN_COST): boolean {
  return getBalance().total >= cost;
}

/** Spends local (guest) credits; false when there aren't enough. */
export function spendCredits(cost = RUN_COST): boolean {
  const next = spend(load(), cost, isPro());
  if (!next) return false;
  save(next);
  return true;
}

/**
 * Charges one task. Signed-in users are charged by the server (cost worked
 * out there from the task kind and size); guests locally.
 */
export async function chargeTask(kind: CostKind, units = 0): Promise<{ ok: boolean; cost: number }> {
  const cost = creditCost(kind, units);
  if (!signedIn) return { ok: spendCredits(cost), cost };
  const { supabase } = await import("@/integrations/supabase/client");
  const { data, error } = await supabase.rpc("spend_credits", { _kind: kind, _units: units });
  if (error || !data?.[0]) {
    void refreshServerCredits(true);
    return { ok: false, cost };
  }
  const row = data[0];
  setServer(row);
  return { ok: true, cost: row.cost };
}

/** Adds non-expiring pack credits (used after the admin confirms a payment). */
export function addPackCredits(amount: number) {
  const s = load();
  save({ ...s, pack: s.pack + amount });
}

let snap: { key: string; value: ReturnType<typeof getBalance> } | null = null;
function snapshot() {
  const b = getBalance();
  const key = `${b.free}|${b.monthly}|${b.pack}`;
  if (!snap || snap.key !== key) snap = { key, value: b };
  return snap.value;
}

export function useCredits() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    snapshot,
    () => null,
  );
}

/** Test helper. */
export function __resetCreditsForTests() {
  cache = null;
  snap = null;
  server = null;
  signedIn = false;
}
