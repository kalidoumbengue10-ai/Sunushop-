import { MerchantApplicationForm } from "@/components/merchant-application-form";
import { MvpShell } from "@/components/mvp-shell";
import { getAdminSupabase } from "@/lib/infrastructure/supabase/server";

export const revalidate = 300;

export default async function MerchantApplicationPage() {
  const admin = getAdminSupabase();
  const { data: categories } = admin ? await admin.from("categories").select("name").eq("active", true).order("position") : { data: [] };
  return <MvpShell><main className="mvp-main merchant-application-page"><div className="mvp-shell"><MerchantApplicationForm categories={categories ?? []} turnstileSiteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim()} /></div></main></MvpShell>;
}
