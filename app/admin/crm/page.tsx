import { redirect } from "next/navigation";
import { AdminWorkspace } from "@/components/admin-workspace";
import { SetupRequired } from "@/components/setup-required";
import { isSupabaseConfigured } from "@/lib/config/env";
import { getServerSupabase } from "@/lib/infrastructure/supabase/server";

export default async function AdminCrmPage() {
  const configured = isSupabaseConfigured();
  if (configured) {
    const supabase = await getServerSupabase();
    if (!supabase) {
      redirect("/connexion?profil=admin&next=/admin/crm");
    }
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      redirect("/connexion?profil=admin&next=/admin/crm");
    }
    const { data: assurance } =
      await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (assurance?.currentLevel !== "aal2") {
      redirect("/admin/securite");
    }
  }

  return (
    <main className="admin-page">
      {configured ? (
        <AdminWorkspace initialTab="crm" />
      ) : (
        <div className="admin-setup"><SetupRequired /></div>
      )}
    </main>
  );
}
