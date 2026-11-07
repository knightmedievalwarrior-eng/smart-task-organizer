/** Signed-in account (email only — no task data is ever stored with it). */
import type { User } from "@supabase/supabase-js";
import { useSyncExternalStore } from "react";

let user: User | null = null;
let started = false;
const listeners = new Set<() => void>();

function set(next: User | null) {
  const changed = next?.id !== user?.id || next?.email !== user?.email;
  user = next;
  if (changed) listeners.forEach((l) => l());
}

export function getUser(): User | null {
  return user;
}

/** Call once in the browser (root layout). */
export async function initAuth(onChange?: () => void) {
  if (started || typeof window === "undefined") return;
  started = true;
  const { supabase } = await import("@/integrations/supabase/client");
  supabase.auth.onAuthStateChange((event, session) => {
    if (event !== "SIGNED_IN" && event !== "SIGNED_OUT" && event !== "USER_UPDATED" && event !== "INITIAL_SESSION") return;
    set(session?.user ?? null);
    onChange?.();
  });
  const { data } = await supabase.auth.getSession();
  set(data.session?.user ?? null);
  onChange?.();
}

export async function signOut() {
  const { supabase } = await import("@/integrations/supabase/client");
  await supabase.auth.signOut();
  set(null);
}

export function useUser(): User | null {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => user,
    () => null,
  );
}
