import { redirect } from "next/navigation";
import { ConversationList } from "@/components/conversation-list";
import { MvpShell } from "@/components/mvp-shell";
import { SetupRequired } from "@/components/setup-required";
import { getServerSupabase } from "@/lib/infrastructure/supabase/server";

export const dynamic = "force-dynamic";

export default async function MessagesPage({
  searchParams,
}: {
  searchParams: Promise<{ merchantId?: string; orderId?: string; productId?: string; subject?: string }>;
}) {
  const supabase = await getServerSupabase();
  if (!supabase) return <MvpShell><main className="mvp-main"><div className="mvp-shell"><SetupRequired /></div></main></MvpShell>;
  const { data: { user } } = await supabase.auth.getUser();
  const intent = await searchParams;
  const requestedNext = intent.merchantId
    ? `/messages?${new URLSearchParams(Object.entries(intent).filter((entry): entry is [string, string] => Boolean(entry[1]))).toString()}`
    : "/messages";
  if (!user) redirect(`/connexion?profil=client&next=${encodeURIComponent(requestedNext)}`);

  return (
    <MvpShell>
      <main className="mvp-main">
        <div className="mvp-shell">
          <section className="mvp-card mvp-card--full">
            <span className="mvp-eyebrow">Messagerie</span>
            <h1 className="mvp-title">Mes conversations</h1>
          </section>
          <ConversationList
            view="asBuyer"
            currentUserId={user.id}
            startIntent={intent.merchantId ? intent : undefined}
          />
        </div>
      </main>
    </MvpShell>
  );
}
