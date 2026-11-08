import { getAdminClient, requireUser } from "../_shared/auth.ts";
import { jsonResponse, requestMethodError } from "../_shared/http.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

Deno.serve(async (request: Request) => {
  const methodError = requestMethodError(request);
  if (methodError) return methodError;
  const auth = await requireUser(request);
  if (!auth.user) return jsonResponse(request, { error: auth.error }, 401);
  try {
    const body = (await request.json()) as {
      record_id?: string;
      record_ids?: string[];
      state?: "trashed" | "restored";
    };
    const recordIds = body.record_ids ?? (body.record_id ? [body.record_id] : []);
    if (
      !Array.isArray(recordIds) ||
      recordIds.length === 0 ||
      recordIds.length > 100 ||
      recordIds.some((id) => typeof id !== "string" || !UUID.test(id)) ||
      !["trashed", "restored"].includes(body.state ?? "")
    ) {
      return jsonResponse(request, { error: "invalid_tombstone_request" }, 400);
    }
    const admin = getAdminClient();
    const result =
      body.state === "trashed"
        ? await admin.from("github_backup_tombstones").upsert(
            recordIds.map((record_id) => ({
              user_id: auth.user.id,
              record_id,
              deleted_at: new Date().toISOString(),
            })),
            { onConflict: "user_id,record_id", ignoreDuplicates: true },
          )
        : await admin
            .from("github_backup_tombstones")
            .delete()
            .eq("user_id", auth.user.id)
            .in("record_id", recordIds);
    if (result.error) throw new Error("tombstone_write_failed");
    return jsonResponse(request, { ok: true });
  } catch (error) {
    console.error(
      "github-set-record-trash failed",
      error instanceof Error ? error.message : "unknown",
    );
    return jsonResponse(request, { error: "tombstone_update_failed" }, 500);
  }
});
