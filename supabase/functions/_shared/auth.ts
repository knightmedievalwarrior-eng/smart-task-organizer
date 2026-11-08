import { createClient, type SupabaseClient, type User } from "npm:@supabase/supabase-js@2";
import { requiredEnv } from "./http.ts";

export function getAdminClient(): SupabaseClient {
  return createClient(requiredEnv("SUPABASE_URL"), requiredEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

export async function requireUser(
  request: Request,
): Promise<{ user: User; error?: never } | { user?: never; error: string }> {
  const authorization = request.headers.get("authorization");
  if (!authorization?.toLowerCase().startsWith("bearer ")) return { error: "unauthorized" };
  try {
    const token = authorization.slice(7).trim();
    if (!token) return { error: "unauthorized" };
    const client = createClient(requiredEnv("SUPABASE_URL"), requiredEnv("SUPABASE_ANON_KEY"), {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await client.auth.getUser(token);
    if (error || !data.user) return { error: "unauthorized" };
    return { user: data.user };
  } catch {
    return { error: "unauthorized" };
  }
}
