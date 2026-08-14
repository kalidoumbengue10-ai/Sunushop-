"use client";

import { useEffect, useState } from "react";
import { ConversationThread } from "@/components/conversation-thread";
import { getBrowserSupabase } from "@/lib/infrastructure/supabase/browser";

type ConversationRow = {
  id: string;
  kind: "buyer_merchant" | "buyer_support";
  merchant_id?: string | null;
  buyer_id?: string;
  order_id?: string | null;
  product_id?: string | null;
  subject: string | null;
  last_message_at: string;
  buyer_last_read_at?: string | null;
  merchant_last_read_at?: string | null;
  admin_last_read_at?: string | null;
  merchant_accounts?: { public_name: string; slug: string } | Array<{ public_name: string; slug: string }>;
  profiles?: { display_name: string | null; email: string | null; phone?: string | null } | Array<{ display_name: string | null; email: string | null; phone?: string | null }>;
  orders?: { public_code: string; status: string } | Array<{ public_code: string; status: string }>;
};

type View = "asBuyer" | "asMerchant" | "asAdmin";

function one<T>(value: T | T[] | undefined): T | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function isUnread(conversation: ConversationRow, view: View) {
  const readAt = view === "asBuyer" ? conversation.buyer_last_read_at : view === "asMerchant" ? conversation.merchant_last_read_at : conversation.admin_last_read_at;
  if (!readAt) return true;
  return new Date(conversation.last_message_at) > new Date(readAt);
}

function ConversationContext({ conversation, view }: { conversation: ConversationRow; view: View }) {
  if (view === "asBuyer") return null;
  const profile = one(conversation.profiles);
  const order = one(conversation.orders);
  if (!profile && !order) return null;
  return (
    <div className="conversation-context">
      {profile && (
        <div className="conversation-context__identity">
          <strong>{profile.display_name || "Client sans nom renseigné"}</strong>
          {profile.email && <span>{profile.email}</span>}
          {profile.phone && <span>{profile.phone}</span>}
        </div>
      )}
      <div className="conversation-context__order">
        {order ? <span>Commande {order.public_code}</span> : <span>Aucune commande liée</span>}
      </div>
    </div>
  );
}

export function ConversationList({ view, currentUserId }: { view: View; currentUserId?: string }) {
  const [conversations, setConversations] = useState<ConversationRow[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [resolvedUserId, setResolvedUserId] = useState(currentUserId);

  const load = async () => {
    const response = await fetch("/api/conversations");
    if (response.ok) {
      const payload = await response.json();
      setConversations(payload.data[view] ?? []);
    }
    setLoading(false);
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    load().catch(() => setLoading(false));
    if (!currentUserId) {
      (async () => {
        try {
          const supabase = getBrowserSupabase();
          const { data: { user } } = await supabase.auth.getUser();
          if (user) setResolvedUserId(user.id);
        } catch { /* pas d'utilisateur résolu : le fil masquera juste la mise en avant "mes messages". */ }
      })();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

  const activeConversation = conversations.find((c) => c.id === activeId);

  return (
    <div className="conversation-list-layout">
      <div className="conversation-list">
        {loading && <p className="mvp-empty">Chargement…</p>}
        {!loading && !conversations.length && <p className="mvp-empty">Aucune conversation pour l’instant.</p>}
        {conversations.map((conversation) => {
          const merchant = one(conversation.merchant_accounts);
          const profile = one(conversation.profiles);
          const order = one(conversation.orders);
          const title = view === "asBuyer"
            ? (conversation.kind === "buyer_support" ? "Support SunuShop" : merchant?.public_name ?? "Boutique")
            : (profile?.display_name || profile?.email || "Client");
          return (
            <button
              type="button"
              key={conversation.id}
              className={conversation.id === activeId ? "conversation-list__item is-active" : "conversation-list__item"}
              onClick={() => { setActiveId(conversation.id); if (isUnread(conversation, view)) load(); }}
            >
              <strong>{title}</strong>
              {order && <small>Commande {order.public_code}</small>}
              {!order && conversation.subject && <small>{conversation.subject}</small>}
              <time dateTime={conversation.last_message_at}>{new Date(conversation.last_message_at).toLocaleDateString("fr-SN")}</time>
              {isUnread(conversation, view) && <span className="conversation-list__unread-dot" aria-label="Non lu" />}
            </button>
          );
        })}
      </div>
      <div className="conversation-list__detail">
        {activeConversation && resolvedUserId ? (
          <div className="conversation-list__detail-inner">
            <ConversationContext conversation={activeConversation} view={view} />
            <ConversationThread conversationId={activeConversation.id} currentUserId={resolvedUserId} />
          </div>
        ) : activeConversation
          ? <p className="mvp-empty">Chargement…</p>
          : <p className="mvp-empty">Sélectionnez une conversation.</p>}
      </div>
    </div>
  );
}
