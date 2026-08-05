import { Suspense } from "react";
import { redirect } from "next/navigation";
import { AuthFlow } from "@/components/auth-flow";
import { InvitationAccountSwitch } from "@/components/invitation-account-switch";
import { MvpShell } from "@/components/mvp-shell";
import { SetupRequired } from "@/components/setup-required";
import { isSupabaseConfigured } from "@/lib/config/env";
import { hashInvitationToken } from "@/lib/domain/invitation-token";
import { getAdminSupabase, getServerSupabase } from "@/lib/infrastructure/supabase/server";

export default async function ConnexionPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const configured = isSupabaseConfigured();
  const requestedNext = (await searchParams).next;
  if (configured && requestedNext?.startsWith("/invitations/claim?token=")) {
    const supabase = await getServerSupabase();
    const { data: { user } } = supabase ? await supabase.auth.getUser() : { data: { user: null } };
    if (user) {
      const token = new URL(requestedNext, "https://sunushop.local").searchParams.get("token");
      const admin = getAdminSupabase();
      const { data: invitation } = token && admin
        ? await admin.from("workspace_invitations")
          .select("email")
          .eq("token_hash", hashInvitationToken(token))
          .eq("status", "pending")
          .gt("expires_at", new Date().toISOString())
          .maybeSingle()
        : { data: null };
      if (invitation?.email && user.email?.toLowerCase() === invitation.email.toLowerCase()) {
        redirect(requestedNext);
      }
      if (invitation?.email && user.email) {
        return (
          <MvpShell>
            <main className="mvp-auth">
              <InvitationAccountSwitch currentEmail={user.email} invitedEmail={invitation.email} />
            </main>
          </MvpShell>
        );
      }
    }
  }

  return (
    <MvpShell>
      <main className="mvp-auth">
        {!configured && <SetupRequired />}
        <Suspense fallback={<p>Chargement…</p>}>
          <AuthFlow
            turnstileSiteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim()}
          />
        </Suspense>
      </main>
    </MvpShell>
  );
}
