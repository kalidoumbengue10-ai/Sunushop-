import { redirect } from "next/navigation";
import { AdminMfa } from "@/components/admin-mfa";
import { MvpShell } from "@/components/mvp-shell";
import { SetupRequired } from "@/components/setup-required";
import { isSupabaseConfigured } from "@/lib/config/env";
import { getServerSupabase } from "@/lib/infrastructure/supabase/server";

export default async function AdminSecurityPage() {
  const configured = isSupabaseConfigured();
  if (configured) {
    const supabase = await getServerSupabase();
    if (!supabase) {
      redirect("/connexion?profil=admin&next=/admin/securite");
    }
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      redirect("/connexion?profil=admin&next=/admin/securite");
    }
  }

  return (
    <MvpShell>
      <main className="mvp-main">
        <div className="mvp-shell">
          {configured ? <AdminMfa /> : <SetupRequired />}
        </div>
      </main>
    </MvpShell>
  );
}
