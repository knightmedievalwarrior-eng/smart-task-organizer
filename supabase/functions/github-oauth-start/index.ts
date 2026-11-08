import { getAdminClient, requireUser } from "../_shared/auth.ts";
import { jsonResponse, requestMethodError, requiredEnv } from "../_shared/http.ts";
import { sha256Hex } from "../_shared/github-crypto.ts";

Deno.serve(async (request: Request) => {
  const methodError = requestMethodError(request);
  if (methodError) return methodError;
  const auth = await requireUser(request);
  if (!auth.user) return jsonResponse(request, { error: auth.error }, 401);

  try {
    const stateBytes = crypto.getRandomValues(new Uint8Array(32));
    const state = btoa(String.fromCharCode(...stateBytes))
      .replaceAll("+", "-")
      .replaceAll("/", "_")
      .replaceAll("=", "");
    const stateHash = await sha256Hex(state);
    const admin = getAdminClient();
    const { error } = await admin.from("github_oauth_states").insert({
      state_hash: stateHash,
      user_id: auth.user.id,
      expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    });
    if (error) throw new Error("oauth_state_storage_failed");
    // Opportunistically remove expired one-time state metadata.
    await admin.from("github_oauth_states").delete().lt("expires_at", new Date().toISOString());

    const redirectUri = requiredEnv("GITHUB_REDIRECT_URI");
    const authorize = new URL("https://github.com/login/oauth/authorize");
    authorize.searchParams.set("client_id", requiredEnv("GITHUB_CLIENT_ID"));
    authorize.searchParams.set("redirect_uri", redirectUri);
    authorize.searchParams.set("scope", "repo read:user");
    authorize.searchParams.set("state", state);
    return jsonResponse(request, { authorization_url: authorize.toString() });
  } catch (error) {
    console.error("github-oauth-start failed", error instanceof Error ? error.message : "unknown");
    return jsonResponse(request, { error: "oauth_start_failed" }, 500);
  }
});
