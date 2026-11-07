/** Opens the upgrade window from anywhere (credit badge, locked themes, out of credits). */
import { useSyncExternalStore } from "react";

let open = false;
const listeners = new Set<() => void>();

export function setUpgradeOpen(next: boolean) {
  open = next;
  listeners.forEach((l) => l());
}

export const openUpgrade = () => setUpgradeOpen(true);

export function useUpgradeOpen(): boolean {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => open,
    () => false,
  );
}
