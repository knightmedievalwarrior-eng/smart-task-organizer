import { getAdminClient } from "../_shared/auth.ts";
import { encryptGithubToken, sha256Hex } from "../_shared/github-crypto.ts";
import { githubHeaders } from "../_shared/github-api.ts";
import { requiredEnv } from "../_shared/http.ts";

function appRedirect(result: "connected" | "error", reason?: string): Response {
  const target = new URL(requiredEnv("GITHUB_APP_REDIRECT_URL"));
  target.searchParams.set("github", result);
  if (reason) target.searchParams.set("reason", reason);
  return Response.redirect(target.toString(), 302);
}

Deno.serve(async (request: Request) => {
  if (request.method !== "GET") return new Response("Method not allowed", { status: 405 });
  try {
    const url = new URL(request.url);
    const state = url.searchParams.get("state") ?? "";
    if (state.length < 32 || state.length > 256) return appRedirect("error", "invalid_state");
    const admin = getAdminClient();
    const { data: userId, error: stateError } = await admin.rpc("consume_github_oauth_state", {
      _state_hash: await sha256Hex(state),
    });
    if (stateError || !userId) return appRedirect("error", "invalid_or_expired_state");

    const providerError = url.searchParams.get("error");
    if (providerError) return appRedirect("error", "authorization_denied");
    const code = url.searchParams.get("code");
    if (!code || code.length > 2048) return appRedirect("error", "missing_code");

    const exchange = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: requiredEnv("GITHUB_CLIENT_ID"),
        client_secret: requiredEnv("GITHUB_CLIENT_SECRET"),
        code,
        redirect_uri: requiredEnv("GITHUB_REDIRECT_URI"),
      }),
      cache: "no-store",
    });
    const tokenResult = (await exchange.json()) as {
      access_token?: string;
      scope?: string;
      error?: string;
    };
    if (!exchange.ok || !tokenResult.access_token)
      return appRedirect("error", "token_exchange_failed");

    const profileResponse = await fetch("https://api.github.com/user", {
      headers: githubHeaders(tokenResult.access_token),
      cache: "no-store",
    });
    if (!profileResponse.ok) return appRedirect("error", "github_profile_failed");
    const githubUser = (await profileResponse.json()) as { id?: number; login?: string };
    if (!Number.isSafeInteger(githubUser.id) || !githubUser.login)
      return appRedirect("error", "github_profile_invalid");

    const encrypted = await encryptGithubToken(tokenResult.access_token);
    const { error: saveError } = await admin.from("github_connections").upsert(
      {
        user_id: userId,
        github_user_id: githubUser.id,
        github_login: githubUser.login,
        access_token_ciphertext: encrypted.ciphertext,
        access_token_iv: encrypted.iv,
        granted_scopes: (tokenResult.scope ?? "").split(",").filter(Boolean),
        connected_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );
    if (saveError) throw new Error("connection_storage_failed");
    return appRedirect("connected");
  } catch (error) {
    console.error(
      "github-oauth-callback failed",
      error instanceof Error ? error.message : "unknown",
    );
    try {
      return appRedirect("error", "callback_failed");
    } catch {
      return new Response("GitHub connection failed. Return to Stepwise and try again.", {
        status: 500,
      });
    }
  }
});
