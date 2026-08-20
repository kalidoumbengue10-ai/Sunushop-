import { requireUser } from "@/lib/api/auth";
import { apiFailure, apiSuccess } from "@/lib/api/response";
import { z } from "zod";

const responseSchema = z.object({ decision: z.enum(["accept", "decline"]) });

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const requestId = crypto.randomUUID();
  try {
    const { id } = await context.params;
    const input = responseSchema.parse(await request.json());
    const { supabase } = await requireUser();

    const { data, error } = await supabase.rpc("respond_to_courier_invitation", {
      p_membership_id: id,
      p_accept: input.decision === "accept",
    });
    if (error) throw error;

    return apiSuccess({ membership: data, decision: input.decision }, { requestId });
  } catch (error) {
    return apiFailure(error, requestId);
  }
}
