import { getAdminClient, requireUser } from "../_shared/auth.ts";
import { decryptGithubToken } from "../_shared/github-crypto.ts";
import { githubRequest, safeGithubError } from "../_shared/github-api.ts";
import { jsonResponse, requestMethodError } from "../_shared/http.ts";

const MAX_RECORDS = 20;
const MAX_RECORD_BYTES = 240 * 1024;
const MAX_BATCH_BYTES = 900 * 1024;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function encodeBase64(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}

Deno.serve(async (request: Request) => {
  const methodError = requestMethodError(request);
  if (methodError) return methodError;
  const auth = await requireUser(request);
  if (!auth.user) return jsonResponse(request, { error: auth.error }, 401);
  try {
    const raw = await request.text();
    if (raw.length > MAX_BATCH_BYTES * 1.5)
      return jsonResponse(request, { error: "batch_too_large" }, 413);
    const body = JSON.parse(raw) as { records?: Array<{ id?: string; ciphertext?: string }> };
    if (
      !Array.isArray(body.records) ||
      body.records.length === 0 ||
      body.records.length > MAX_RECORDS
    ) {
      return jsonResponse(request, { error: "invalid_record_batch" }, 400);
    }
    const ids = new Set<string>();
    let totalBytes = 0;
    for (const record of body.records) {
      if (!record || typeof record.id !== "string" || !UUID.test(record.id) || ids.has(record.id))
        return jsonResponse(request, { error: "invalid_or_duplicate_record_id" }, 400);
      ids.add(record.id);
      if (
        typeof record.ciphertext !== "string" ||
        !/^[A-Za-z0-9+/]+={0,2}$/.test(record.ciphertext)
      )
        return jsonResponse(request, { error: "ciphertext_must_be_base64" }, 400);
      const bytes = Math.floor((record.ciphertext.length * 3) / 4);
      if (bytes < 29 || bytes > MAX_RECORD_BYTES)
        return jsonResponse(request, { error: "record_size_out_of_range" }, 413);
      totalBytes += bytes;
    }
    if (totalBytes > MAX_BATCH_BYTES)
      return jsonResponse(request, { error: "batch_too_large" }, 413);

    const admin = getAdminClient();
    const { data: connection, error } = await admin
      .from("github_connections")
      .select(
        "access_token_ciphertext,access_token_iv,repository_full_name,repository_default_branch",
      )
      .eq("user_id", auth.user.id)
      .maybeSingle();
    if (error || !connection?.repository_full_name)
      return jsonResponse(request, { error: "github_repository_not_ready" }, 409);
    const token = await decryptGithubToken(
      connection.access_token_ciphertext,
      connection.access_token_iv,
    );
    const [owner, repo] = connection.repository_full_name.split("/");
    if (!owner || !repo) throw new Error("stored_repository_name_invalid");
    const stored: string[] = [];

    // Only opaque client-side ciphertext crosses this server. Request/response bodies are never logged or persisted here.
    for (const record of body.records) {
      const path = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/records/${record.id}.json`;
      const existing = await githubRequest<{ sha?: string }>(
        token,
        `${path}?ref=${encodeURIComponent(connection.repository_default_branch ?? "main")}`,
      );
      if (!existing.response.ok && existing.response.status !== 404) {
        return jsonResponse(
          request,
          { error: safeGithubError(existing.response.status), stored },
          existing.response.status === 409 ? 409 : 502,
        );
      }
      const file = JSON.stringify({ version: 1, id: record.id, ciphertext: record.ciphertext });
      const updated = await githubRequest<{ content?: { sha?: string } }>(token, path, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: `Update encrypted Stepwise record ${record.id}`,
          content: encodeBase64(file),
          branch: connection.repository_default_branch ?? "main",
          ...(existing.body?.sha ? { sha: existing.body.sha } : {}),
        }),
      });
      if (!updated.response.ok)
        return jsonResponse(
          request,
          { error: safeGithubError(updated.response.status), stored },
          updated.response.status === 409 ? 409 : 502,
        );
      stored.push(record.id);
    }
    return jsonResponse(request, { stored });
  } catch (error) {
    console.error(
      "github-sync-encrypted-records failed",
      error instanceof Error ? error.message : "unknown",
    );
    return jsonResponse(request, { error: "encrypted_sync_failed" }, 500);
  }
});
