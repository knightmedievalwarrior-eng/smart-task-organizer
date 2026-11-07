/**
 * Backs up this device's data to a file in the user's own GitHub repository,
 * straight from the browser (GitHub Contents API). The access token stays in
 * this browser only.
 */
import { useSyncExternalStore } from "react";

import { exportBackup, importBackup } from "./session-store";

export const GITHUB_KEY = "gtr.github.v1";

export interface GithubConfig {
  token: string;
  /** "owner/repo" */
  repo: string;
  path: string;
  branch: string;
  /** Back up automatically every few minutes while the app is open. */
  auto: boolean;
  lastBackupAt?: number;
}

const DEFAULT: GithubConfig = { token: "", repo: "", path: "task-runner-backup.json", branch: "main", auto: false };
let cache: GithubConfig | null = null;
const listeners = new Set<() => void>();

export function getGithubConfig(): GithubConfig {
  if (cache) return cache;
  if (typeof window === "undefined") return DEFAULT;
  try {
    cache = { ...DEFAULT, ...JSON.parse(window.localStorage.getItem(GITHUB_KEY) ?? "{}") };
  } catch {
    cache = DEFAULT;
  }
  return cache!;
}

export function saveGithubConfig(patch: Partial<GithubConfig>) {
  cache = { ...getGithubConfig(), ...patch };
  window.localStorage.setItem(GITHUB_KEY, JSON.stringify(cache));
  listeners.forEach((l) => l());
}

export function useGithubConfig(): GithubConfig {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    getGithubConfig,
    () => DEFAULT,
  );
}

const toB64 = (text: string) => {
  const bytes = new TextEncoder().encode(text);
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin);
};
const fromB64 = (b64: string) => {
  const bin = atob(b64.replace(/\s/g, ""));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
};

function url(c: GithubConfig) {
  const repo = c.repo.trim().replace(/^https?:\/\/github\.com\//, "").replace(/\.git$/, "").replace(/\/+$/, "");
  const path = c.path.trim().replace(/^\/+/, "").split("/").map(encodeURIComponent).join("/");
  return `https://api.github.com/repos/${repo}/contents/${path}`;
}

function headers(c: GithubConfig) {
  return {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${c.token.trim()}`,
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

async function fail(res: Response): Promise<never> {
  if (res.status === 401) throw new Error("Token invalid / โทเคนไม่ถูกต้อง");
  if (res.status === 403) throw new Error("No permission / ไม่มีสิทธิ์เขียน repo นี้");
  if (res.status === 404) throw new Error("Repo or file not found / ไม่พบ repo หรือไฟล์");
  throw new Error(`GitHub HTTP ${res.status}`);
}

export async function backupToGithub(c = getGithubConfig()): Promise<void> {
  if (!c.token || !c.repo) throw new Error("Missing token or repo / ยังไม่ได้ตั้งค่า");
  const branch = c.branch.trim() || "main";
  let sha: string | undefined;
  const head = await fetch(`${url(c)}?ref=${encodeURIComponent(branch)}`, { headers: headers(c) });
  if (head.ok) sha = ((await head.json()) as { sha?: string }).sha;
  else if (head.status !== 404) await fail(head);
  const res = await fetch(url(c), {
    method: "PUT",
    headers: { ...headers(c), "Content-Type": "application/json" },
    body: JSON.stringify({
      message: `Task Runner backup ${new Date().toISOString()}`,
      content: toB64(JSON.stringify(exportBackup(), null, 2)),
      branch,
      ...(sha ? { sha } : {}),
    }),
  });
  if (!res.ok) await fail(res);
  saveGithubConfig({ lastBackupAt: Date.now() });
}

export async function restoreFromGithub(c = getGithubConfig()): Promise<void> {
  if (!c.token || !c.repo) throw new Error("Missing token or repo / ยังไม่ได้ตั้งค่า");
  const res = await fetch(`${url(c)}?ref=${encodeURIComponent(c.branch.trim() || "main")}`, { headers: headers(c) });
  if (!res.ok) await fail(res);
  const body = (await res.json()) as { content?: string };
  if (!body.content || !importBackup(JSON.parse(fromB64(body.content)))) throw new Error("Backup file invalid / ไฟล์สำรองไม่ถูกต้อง");
}

const AUTO_MS = 10 * 60 * 1000;
let autoTimer: ReturnType<typeof setInterval> | null = null;

export function startAutoBackup() {
  if (autoTimer || typeof window === "undefined") return;
  autoTimer = setInterval(() => {
    const c = getGithubConfig();
    if (c.auto && c.token && c.repo) void backupToGithub(c).catch(() => {});
  }, AUTO_MS);
}
