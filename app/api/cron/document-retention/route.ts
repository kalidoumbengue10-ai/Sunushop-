import { requireAdminClient } from "@/lib/api/auth";
import { requireCron } from "@/lib/api/cron";
import { apiFailure, apiSuccess } from "@/lib/api/response";
import { pilotConfig } from "@/lib/config/env";

export async function GET(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    requireCron(request);
    const admin = requireAdminClient();
    const { data: candidates, error } = await admin.rpc(
      "document_retention_candidates",
      {
        p_rejected_days: pilotConfig.rejectedRetentionDays,
        p_closed_days: pilotConfig.closedRetentionDays,
      },
    );
    if (error) throw error;

    let purged = 0;
    for (const candidate of candidates ?? []) {
      const { error: removeError } = await admin.storage
        .from(candidate.storage_bucket)
        .remove([candidate.storage_path]);
      if (removeError) continue;
      const { error: markError } = await admin.rpc(
        "mark_verification_document_purged",
        { p_document_id: candidate.document_id },
      );
      if (!markError) purged += 1;
    }

    return apiSuccess(
      { candidates: candidates?.length ?? 0, purged },
      { requestId },
    );
  } catch (error) {
    return apiFailure(error, requestId);
  }
}
