"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import type { RealtimePostgresInsertPayload } from "@supabase/supabase-js";
import { getBrowserSupabase } from "@/lib/infrastructure/supabase/browser";

type Message = { id: string; sender_id: string; sender_role: "buyer" | "merchant" | "admin"; body: string; created_at: string };

const ROLE_LABELS: Record<Message["sender_role"], string> = {
  buyer: "Client",
  merchant: "Boutique",
  admin: "SunuShop",
};

export function ConversationThread({ conversationId, currentUserId }: { conversationId: string; currentUserId: string }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);

  const load = async () => {
    const response = await fetch(`/api/conversations/${conversationId}/messages`);
    if (response.ok) {
      const payload = await response.json();
      setMessages(payload.data.items);
    }
    setLoading(false);
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    load().catch(() => setLoading(false));
    fetch(`/api/conversations/${conversationId}/read`, { method: "PATCH" }).catch(() => undefined);

    // Temps réel uniquement pendant que ce fil est affiché à l'écran, filtré
    // par conversation_id : pas de connexion permanente ailleurs dans l'app.
    let channel: ReturnType<ReturnType<typeof getBrowserSupabase>["channel"]> | undefined;
    try {
      const supabase = getBrowserSupabase();
      channel = supabase.channel(`conversation-${conversationId}`)
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${conversationId}` }, (payload: RealtimePostgresInsertPayload<Message>) => {
          setMessages((current) => current.some((m) => m.id === payload.new.id) ? current : [...current, payload.new as Message]);
          fetch(`/api/conversations/${conversationId}/read`, { method: "PATCH" }).catch(() => undefined);
        })
        .subscribe();
    } catch { /* pas de temps réel disponible : le fil reste consultable via GET. */ }
    return () => { if (channel) channel.unsubscribe(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const send = async (event: FormEvent) => {
    event.preventDefault();
    const trimmed = body.trim();
    if (!trimmed) return;
    setBusy(true);
    setError("");
    const response = await fetch(`/api/conversations/${conversationId}/messages`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ body: trimmed }),
    });
    const payload = await response.json();
    setBusy(false);
    if (!response.ok) return setError(payload.error?.message ?? "Le message n’a pas pu être envoyé.");
    setMessages((current) => current.some((m) => m.id === payload.data.id) ? current : [...current, payload.data]);
    setBody("");
  };

  return (
    <div className="conversation-thread">
      <div className="conversation-thread__messages">
        {loading && <p className="mvp-empty">Chargement…</p>}
        {!loading && !messages.length && <p className="mvp-empty">Aucun message pour l’instant. Écrivez le premier.</p>}
        {messages.map((message) => (
          <div key={message.id} className={message.sender_id === currentUserId ? "conversation-message is-own" : "conversation-message"}>
            <span className="conversation-message__role">{ROLE_LABELS[message.sender_role]}</span>
            <p>{message.body}</p>
            <time dateTime={message.created_at}>{new Date(message.created_at).toLocaleString("fr-SN", { dateStyle: "short", timeStyle: "short" })}</time>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
      {error && <p className="mvp-alert mvp-alert--error">{error}</p>}
      <form className="conversation-thread__composer" onSubmit={send}>
        <textarea
          value={body}
          onChange={(event) => setBody(event.target.value)}
          placeholder="Écrivez votre message…"
          rows={2}
          maxLength={4000}
          required
        />
        <button className="mvp-button" disabled={busy || !body.trim()}>{busy ? "Envoi…" : "Envoyer"}</button>
      </form>
    </div>
  );
}
