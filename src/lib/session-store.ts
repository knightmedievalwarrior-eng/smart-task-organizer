/**
 * Privacy-first client store.
 *
 * - Working data (drafts, customer details) lives in localStorage on this
 *   device permanently; deleted tasks go to a trash for 30 days, and a
 *   finished mission's data is removed immediately.
 * - Usage history lives in localStorage and holds only non-personal
 *   summaries (task type, reference no., counts, amounts, timestamps).
 * Nothing is ever sent to or stored on a server.
 */
import { useSyncExternalStore } from "react";

import type { Text } from "./i18n";
import { TASKS, type TaskData, type TaskType } from "./tasks/definitions";

export type TaskStatus = "draft" | "ready";

/** Outcome of the latest bot run for a task that is still pending. */
export interface LastRun {
  status: "running" | "failed";
  startedAt: number;
  /** 0-based pipeline step that failed. */
  failedStep?: number;
  failedLabel?: string;
  message?: string;
}

export interface Task {
  id: string;
  type: TaskType;
  status: TaskStatus;
  stepIndex: number;
  data: TaskData;
  lastRun?: LastRun | undefined;
  /** When set, the app starts this task automatically at this time (while the app is open). */
  scheduledAt?: number | undefined;
  createdAt: number;
  updatedAt: number;
}

export type HistoryStatus = "success" | "cancelled" | "failed";

export interface HistoryEntry {
  id: string;
  type: TaskType;
  ref: string;
  /** Both languages for new entries; older entries hold a Thai string. */
  label: string | Text;
  status: HistoryStatus;
  startedAt: number;
  finishedAt: number;
  steps: number;
  /** 0-based step where a failed run stopped. */
  failedStep?: number;
  /** "n8n" when a real webhook ran the task, "simulate" for demo mode. */
  mode?: "n8n" | "simulate";
}

export interface TrashItem {
  task: Task;
  deletedAt: number;
}

export interface AppState {
  tasks: Task[];
  history: HistoryEntry[];
  trash: TrashItem[];
}

export const TRASH_DAYS = 30;
const TRASH_MS = TRASH_DAYS * 24 * 60 * 60 * 1000;

export const SESSION_KEY = "gtr.tasks.v2";
const LEGACY_SESSION_KEY = "gtr.session.v1";
export const TRASH_KEY = "gtr.trash.v1";
export const HISTORY_KEY = "gtr.history.v1";
const HISTORY_LIMIT = 50;

const EMPTY: AppState = { tasks: [], history: [], trash: [] };

let state: AppState = EMPTY;
let loaded = false;
const listeners = new Set<() => void>();

function safeParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function load() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  // Tasks are now kept permanently in this browser (localStorage).
  let tasks = safeParse<Task[] | null>(window.localStorage.getItem(SESSION_KEY), null);
  if (!tasks) tasks = safeParse<Task[]>(window.sessionStorage.getItem(LEGACY_SESSION_KEY), []);
  const history = safeParse<HistoryEntry[]>(window.localStorage.getItem(HISTORY_KEY), []);
  const trash = safeParse<TrashItem[]>(window.localStorage.getItem(TRASH_KEY), []);
  state = {
    tasks: Array.isArray(tasks) ? tasks.filter((t) => t && t.type in TASKS) : [],
    history: Array.isArray(history) ? history : [],
    trash: purgeExpired(Array.isArray(trash) ? trash : [], Date.now()),
  };
  window.sessionStorage.removeItem(LEGACY_SESSION_KEY);
  persist();
}

/** Drops trash items older than TRASH_DAYS. */
export function purgeExpired(trash: TrashItem[], now: number): TrashItem[] {
  return trash.filter((i) => i && i.task && now - i.deletedAt < TRASH_MS);
}

function persist() {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(SESSION_KEY, JSON.stringify(state.tasks));
  window.localStorage.setItem(HISTORY_KEY, JSON.stringify(state.history));
  window.localStorage.setItem(TRASH_KEY, JSON.stringify(state.trash));
}

function setState(next: AppState) {
  state = next;
  persist();
  listeners.forEach((l) => l());
}

export function getState(): AppState {
  load();
  return state;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useAppState(): AppState {
  return useSyncExternalStore(subscribe, getState, () => EMPTY);
}

export function useTask(id: string): Task | undefined {
  const s = useAppState();
  return s.tasks.find((t) => t.id === id);
}

const noopSubscribe = () => () => {};
export function useHydrated(): boolean {
  return useSyncExternalStore(noopSubscribe, () => true, () => false);
}

export function uid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function createTask(type: TaskType, prefill: TaskData = {}): Task {
  const s = getState();
  const now = Date.now();
  const task: Task = {
    id: uid(),
    type,
    status: "draft",
    stepIndex: 0,
    data: { ...TASKS[type].defaults(), ...prefill },
    createdAt: now,
    updatedAt: now,
  };
  setState({ ...s, tasks: [task, ...s.tasks] });
  return task;
}

export function updateTask(id: string, patch: Partial<Omit<Task, "id" | "type" | "data">> & { data?: TaskData }) {
  const s = getState();
  setState({
    ...s,
    tasks: s.tasks.map((t) =>
      t.id === id
        ? { ...t, ...patch, data: patch.data ? { ...t.data, ...patch.data } : t.data, updatedAt: Date.now() }
        : t,
    ),
  });
}

/** Moves a task to the trash (kept for TRASH_DAYS days). */
export function deleteTask(id: string) {
  const s = getState();
  const task = s.tasks.find((t) => t.id === id);
  if (!task) return;
  setState({
    ...s,
    tasks: s.tasks.filter((t) => t.id !== id),
    trash: [{ task: { ...task, scheduledAt: undefined }, deletedAt: Date.now() }, ...purgeExpired(s.trash, Date.now())],
  });
}

export function restoreTask(id: string) {
  const s = getState();
  const item = s.trash.find((i) => i.task.id === id);
  if (!item) return;
  setState({ ...s, tasks: [item.task, ...s.tasks], trash: s.trash.filter((i) => i.task.id !== id) });
}

export function deleteForever(id: string) {
  const s = getState();
  setState({ ...s, trash: s.trash.filter((i) => i.task.id !== id) });
}

export function emptyTrash() {
  setState({ ...getState(), trash: [] });
}

export function setSchedule(id: string, at: number | undefined) {
  updateTask(id, { scheduledAt: at });
}

/** Full snapshot for backups. */
export function exportBackup() {
  const s = getState();
  return { app: "guided-task-runner", version: 1, exportedAt: new Date().toISOString(), ...s };
}

/** Replaces local data with a backup snapshot. */
export function importBackup(raw: unknown): boolean {
  if (!raw || typeof raw !== "object") return false;
  const b = raw as Partial<AppState>;
  if (!Array.isArray(b.tasks) || !Array.isArray(b.history)) return false;
  setState({
    tasks: b.tasks.filter((t) => t && t.type in TASKS),
    history: b.history,
    trash: purgeExpired(Array.isArray(b.trash) ? b.trash : [], Date.now()),
  });
  return true;
}

function makeRef(prefix: string, at: number) {
  const d = new Date(at);
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  const n = Math.floor(1000 + Math.random() * 9000);
  return `${prefix}-${ymd}-${n}`;
}

/**
 * Ends a mission: records a non-personal history entry and destroys the
 * task's working data immediately.
 */
export function finishTask(
  id: string,
  status: HistoryStatus,
  startedAt: number,
  steps: number,
  extra: Pick<HistoryEntry, "failedStep" | "mode"> = {},
): HistoryEntry | undefined {
  const s = getState();
  const task = s.tasks.find((t) => t.id === id);
  if (!task) return undefined;
  const def = TASKS[task.type];
  const finishedAt = Date.now();
  const entry: HistoryEntry = {
    id: uid(),
    type: task.type,
    ref: makeRef(def.refPrefix, finishedAt),
    label: def.historyLabel(task.data),
    status,
    startedAt,
    finishedAt,
    steps,
    ...extra,
  };
  setState({
    ...s,
    tasks: status === "success" ? s.tasks.filter((t) => t.id !== id) : s.tasks,
    history: [entry, ...s.history].slice(0, HISTORY_LIMIT),
  });
  return entry;
}

export function clearHistory() {
  setState({ ...getState(), history: [] });
}

export function wipeAll() {
  setState({ tasks: [], history: [], trash: [] });
}

/** Test helper: forget the in-memory cache so storage is re-read. */
export function __resetForTests() {
  state = EMPTY;
  loaded = false;
}
