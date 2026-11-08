import { getAdminClient, requireUser } from "../_shared/auth.ts";
import { decryptGithubToken } from "../_shared/github-crypto.ts";
import { githubRequest, safeGithubError } from "../_shared/github-api.ts";
import { jsonResponse, requestMethodError } from "../_shared/http.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_RECORDS = 100;
const MAX_BYTES = 5 * 1024 * 1024;

function decodeGithubBase64(content: string): string {
  const normalized = content.replace(/\s/g, "");
  const binary = atob(normalized);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

Deno.serve(async (request: Request) => {
  const methodError = requestMethodError(request);
  if (methodError) return methodError;
  const auth = await requireUser(request);
  if (!auth.user) return jsonResponse(request, { error: auth.error }, 401);
  try {
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
    const [owner, repo] = connection.repository_full_name.split("/");
    if (!owner || !repo) throw new Error("stored_repository_name_invalid");
    const token = await decryptGithubToken(
      connection.access_token_ciphertext,
      connection.access_token_iv,
    );
    const branch = connection.repository_default_branch ?? "main";
    const folderPath = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/records?ref=${encodeURIComponent(branch)}&per_page=100`;
    const listing = await githubRequest<Array<{ name?: string; path?: string; type?: string }>>(
      token,
      folderPath,
    );
    if (listing.response.status === 404) return jsonResponse(request, { records: [] });
    if (!listing.response.ok || !Array.isArray(listing.body))
      return jsonResponse(request, { error: safeGithubError(listing.response.status) }, 502);
    if (listing.response.headers.get("link")?.includes('rel="next"')) {
      return jsonResponse(
        request,
        { error: "repository_record_count_exceeds_single_page_limit" },
        413,
      );
    }

    const { data: tombstones, error: tombstoneError } = await admin
      .from("github_backup_tombstones")
      .select("record_id")
      .eq("user_id", auth.user.id);
    if (tombstoneError) throw new Error("tombstone_lookup_failed");
    const trashed = new Set((tombstones ?? []).map((row) => row.record_id.toLowerCase()));
    const candidates = listing.body
      .filter((item) => item.type === "file" && item.name?.endsWith(".json"))
      .map((item) => ({ id: item.name!.slice(0, -5), path: item.path! }))
      .filter((item) => UUID.test(item.id) && !trashed.has(item.id.toLowerCase()));
    if (candidates.length > MAX_RECORDS)
      return jsonResponse(request, { error: "too_many_records_fetch_in_batches" }, 413);

    const records: Array<{ id: string; ciphertext: string }> = [];
    let totalBytes = 0;
    for (const item of candidates) {
      const file = await githubRequest<{ content?: string; encoding?: string }>(
        token,
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${item.path.split("/").map(encodeURIComponent).join("/")}?ref=${encodeURIComponent(branch)}`,
      );
      if (!file.response.ok || !file.body?.content || file.body.encoding !== "base64") {
        return jsonResponse(request, { error: safeGithubError(file.response.status) }, 502);
      }
      const parsed = JSON.parse(decodeGithubBase64(file.body.content)) as {
        version?: number;
        id?: string;
        ciphertext?: string;
      };
      if (
        parsed.version !== 1 ||
        parsed.id?.toLowerCase() !== item.id.toLowerCase() ||
        typeof parsed.ciphertext !== "string"
      ) {
        return jsonResponse(request, { error: "stored_record_format_invalid" }, 502);
      }
      totalBytes += parsed.ciphertext.length;
      if (totalBytes > MAX_BYTES)
        return jsonResponse(request, { error: "download_batch_too_large" }, 413);
      records.push({ id: item.id, ciphertext: parsed.ciphertext });
    }
    return jsonResponse(request, { records });
  } catch (error) {
    console.error(
      "github-list-encrypted-records failed",
      error instanceof Error ? error.message : "unknown",
    );
    return jsonResponse(request, { error: "encrypted_download_failed" }, 500);
  }
});
