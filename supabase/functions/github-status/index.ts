import { getAdminClient, requireUser } from "../_shared/auth.ts";
import { jsonResponse, requestMethodError } from "../_shared/http.ts";

Deno.serve(async (request: Request) => {
  const methodError = requestMethodError(request);
  if (methodError) return methodError;
  const auth = await requireUser(request);
  if (!auth.user) return jsonResponse(request, { error: auth.error }, 401);
  try {
    const { data, error } = await getAdminClient()
      .from("github_connections")
      .select("github_login,repository_full_name,repository_default_branch,connected_at")
      .eq("user_id", auth.user.id)
      .maybeSingle();
    if (error) throw new Error("connection_lookup_failed");
    return jsonResponse(request, {
      connected: !!data,
      login: data?.github_login ?? null,
      repository: data?.repository_full_name ?? null,
      branch: data?.repository_default_branch ?? null,
      connected_at: data?.connected_at ?? null,
    });
  } catch (error) {
    console.error("github-status failed", error instanceof Error ? error.message : "unknown");
    return jsonResponse(request, { error: "github_status_failed" }, 500);
  }
});
