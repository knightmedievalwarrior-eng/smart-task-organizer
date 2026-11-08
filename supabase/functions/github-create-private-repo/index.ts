import { getAdminClient, requireUser } from "../_shared/auth.ts";
import { decryptGithubToken } from "../_shared/github-crypto.ts";
import { githubRequest, safeGithubError } from "../_shared/github-api.ts";
import { jsonResponse, requestMethodError } from "../_shared/http.ts";

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
        "github_user_id,github_login,access_token_ciphertext,access_token_iv,repository_id,repository_full_name,repository_default_branch",
      )
      .eq("user_id", auth.user.id)
      .maybeSingle();
    if (error || !connection) return jsonResponse(request, { error: "github_not_connected" }, 409);
    if (connection.repository_full_name) {
      const token = await decryptGithubToken(
        connection.access_token_ciphertext,
        connection.access_token_iv,
      );
      const [owner, repo] = connection.repository_full_name.split("/");
      const existing = await githubRequest<{ private?: boolean }>(
        token,
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`,
      );
      if (!existing.response.ok || existing.body?.private !== true)
        return jsonResponse(request, { error: "private_repository_unavailable" }, 409);
      return jsonResponse(request, {
        repository: connection.repository_full_name,
        branch: connection.repository_default_branch ?? "main",
        created: false,
      });
    }

    const token = await decryptGithubToken(
      connection.access_token_ciphertext,
      connection.access_token_iv,
    );
    const me = await githubRequest<{ id?: number }>(token, "/user");
    if (!me.response.ok || me.body?.id !== connection.github_user_id)
      return jsonResponse(request, { error: "github_identity_mismatch" }, 403);

    const repoName = `stepwise-backup-${auth.user.id.replaceAll("-", "").slice(0, 12)}`;
    let created = await githubRequest<{
      id?: number;
      full_name?: string;
      private?: boolean;
      default_branch?: string;
    }>(token, "/user/repos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: repoName,
        description: "Encrypted Stepwise task backup",
        private: true,
        auto_init: true,
        has_issues: false,
        has_wiki: false,
        has_projects: false,
      }),
    });
    if (created.response.status === 422) {
      created = await githubRequest<{
        id?: number;
        full_name?: string;
        private?: boolean;
        default_branch?: string;
      }>(
        token,
        `/repos/${encodeURIComponent(connection.github_login)}/${encodeURIComponent(repoName)}`,
      );
    }
    if (
      !created.response.ok ||
      !created.body?.id ||
      !created.body.full_name ||
      created.body.private !== true
    ) {
      return jsonResponse(request, { error: safeGithubError(created.response.status) }, 502);
    }

    const { error: saveError } = await admin
      .from("github_connections")
      .update({
        repository_id: created.body.id,
        repository_full_name: created.body.full_name,
        repository_default_branch: created.body.default_branch ?? "main",
      })
      .eq("user_id", auth.user.id);
    if (saveError) throw new Error("repository_metadata_save_failed");
    return jsonResponse(request, {
      repository: created.body.full_name,
      branch: created.body.default_branch ?? "main",
      created: true,
    });
  } catch (error) {
    console.error(
      "github-create-private-repo failed",
      error instanceof Error ? error.message : "unknown",
    );
    return jsonResponse(request, { error: "github_repository_creation_failed" }, 500);
  }
});
