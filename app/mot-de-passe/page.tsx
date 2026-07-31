import { redirect } from "next/navigation";
import { MvpShell } from "@/components/mvp-shell";
import { PasswordUpdateForm } from "@/components/password-update-form";
import { SetupRequired } from "@/components/setup-required";
import { getServerSupabase } from "@/lib/infrastructure/supabase/server";

export const dynamic = "force-dynamic";

export default async function MotDePassePage() {
  const supabase = await getServerSupabase();

  if (!supabase) {
    return (
      <MvpShell>
        <main className="mvp-auth">
          <SetupRequired />
        </main>
      </MvpShell>
    );
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/connexion?mode=recuperation");
  }

  return (
    <MvpShell>
      <main className="mvp-auth">
        <PasswordUpdateForm />
      </main>
    </MvpShell>
  );
}
