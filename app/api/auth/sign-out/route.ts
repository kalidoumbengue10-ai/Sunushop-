import { apiFailure, apiSuccess } from "@/lib/api/response";
import { getServerSupabase } from "@/lib/infrastructure/supabase/server";

export async function POST() {
  const requestId = crypto.randomUUID();
  try {
    const supabase = await getServerSupabase();
    if (supabase) await supabase.auth.signOut({ scope: "local" });
    return apiSuccess({ signedOut: true }, { requestId });
  } catch (error) {
    return apiFailure(error, requestId);
  }
}
