import { getAdminClient } from "../_shared/auth.ts";
import { decryptGithubToken } from "../_shared/github-crypto.ts";
import { githubRequest, safeGithubError } from "../_shared/github-api.ts";
import { requiredEnv } from "../_shared/http.ts";

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async (request: Request) => {
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const expected = Deno.env.get("GITHUB_PURGE_SECRET") ?? "";
  const supplied = request.headers.get("x-purge-secret") ?? "";
  if (expected.length < 32 || !constantTimeEqual(expected, supplied))
    return new Response("Unauthorized", { status: 401 });

  try {
    const admin = getAdminClient();
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { data: tombstones, error } = await admin
      .from("github_backup_tombstones")
      .select("user_id,record_id,deleted_at")
      .lte("deleted_at", cutoff)
      .order("deleted_at")
      .limit(100);
    if (error) throw new Error("tombstone_read_failed");
    let purged = 0;
    let deferred = 0;
    for (const tombstone of tombstones ?? []) {
      const { data: connection } = await admin
        .from("github_connections")
        .select(
          "access_token_ciphertext,access_token_iv,repository_full_name,repository_default_branch",
        )
        .eq("user_id", tombstone.user_id)
        .maybeSingle();
      if (!connection?.repository_full_name) {
        deferred++;
        continue;
      }
      const [owner, repo] = connection.repository_full_name.split("/");
      if (!owner || !repo) {
        deferred++;
        continue;
      }
      try {
        const token = await decryptGithubToken(
          connection.access_token_ciphertext,
          connection.access_token_iv,
        );
        const path = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/records/${tombstone.record_id}.json`;
        const file = await githubRequest<{ sha?: string }>(
          token,
          `${path}?ref=${encodeURIComponent(connection.repository_default_branch ?? "main")}`,
        );
        if (file.response.status === 404) {
          // Already absent, so the remote purge is complete.
        } else if (!file.response.ok || !file.body?.sha) {
          deferred++;
          console.warn("github purge deferred", safeGithubError(file.response.status));
          continue;
        } else {
          const removed = await githubRequest(token, path, {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              message: `Purge expired encrypted Stepwise record ${tombstone.record_id}`,
              sha: file.body.sha,
              branch: connection.repository_default_branch ?? "main",
            }),
          });
          if (!removed.response.ok && removed.response.status !== 404) {
            deferred++;
            console.warn("github purge deferred", safeGithubError(removed.response.status));
            continue;
          }
        }
        const { error: deleteError } = await admin
          .from("github_backup_tombstones")
          .delete()
          .eq("user_id", tombstone.user_id)
          .eq("record_id", tombstone.record_id);
        if (deleteError) deferred++;
        else purged++;
      } catch {
        deferred++;
        console.warn("github purge deferred due to token or API error");
      }
    }
    // Retire expired, unused OAuth state records too; no task data is touched.
    await admin.from("github_oauth_states").delete().lt("expires_at", new Date().toISOString());
    console.log(`github purge complete: purged=${purged}, deferred=${deferred}`);
    return Response.json({ purged, deferred }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error(
      "github-purge-expired failed",
      error instanceof Error ? error.message : "unknown",
    );
    return Response.json(
      { error: "purge_failed" },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
});
