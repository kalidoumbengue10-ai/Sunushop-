import { redirect } from "next/navigation";
import { ClientWorkspace } from "@/components/client-workspace";
import { MvpShell } from "@/components/mvp-shell";
import { SetupRequired } from "@/components/setup-required";
import { getServerSupabase } from "@/lib/infrastructure/supabase/server";

export const dynamic = "force-dynamic";

export default async function ClientPage() {
  const supabase = await getServerSupabase();
  if (!supabase) return <MvpShell><main className="mvp-main"><div className="mvp-shell"><SetupRequired /></div></main></MvpShell>;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/connexion?profil=client&next=/client");
  return <MvpShell><main className="mvp-main"><div className="mvp-shell"><ClientWorkspace /></div></main></MvpShell>;
}
