"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";

type Category = { id: string; name: string; slug: string; description: string | null; position: number; active: boolean };
export function CategoryAdmin() {
  const [items, setItems] = useState<Category[]>([]); const [editing, setEditing] = useState<Category | null>(null); const [error, setError] = useState(""); const [message, setMessage] = useState("");
  const load = useCallback(async () => { const response = await fetch("/api/admin/categories"); const payload = await response.json(); if (!response.ok) throw new Error(payload.error?.message); setItems(payload.data.items); }, []);
  useEffect(() => {
    // Chargement réseau initial uniquement.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load().catch((caught: Error) => setError(caught.message));
  }, [load]);
  const save = async (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const form = new FormData(event.currentTarget); const response = await fetch("/api/admin/categories", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: editing?.id, name: form.get("name"), slug: form.get("slug"), description: form.get("description") || undefined, position: Number(form.get("position")), active: form.get("active") === "on" }) }); const payload = await response.json(); if (!response.ok) return setError(payload.error?.message ?? "Enregistrement impossible."); setEditing(null); setMessage("Catégorie enregistrée."); await load(); };
  return <div className="mvp-grid"><section className="mvp-card"><h2>Catégories marketplace</h2><div className="mvp-list">{items.map((item) => <button className="mvp-row" key={item.id} onClick={() => setEditing(item)}><div><strong>{item.name}</strong><small>{item.slug} · position {item.position}</small></div><span className="mvp-status" data-status={item.active ? "active" : "inactive"}>{item.active ? "active" : "inactive"}</span></button>)}</div></section><section className="mvp-card"><h2>{editing ? "Modifier" : "Ajouter"}</h2>{message && <p className="mvp-alert">{message}</p>}{error && <p className="mvp-alert mvp-alert--error">{error}</p>}<form className="mvp-form" onSubmit={save} key={editing?.id ?? "new"}><label className="mvp-field">Nom<input name="name" defaultValue={editing?.name} required /></label><label className="mvp-field">Slug<input name="slug" defaultValue={editing?.slug} required /></label><label className="mvp-field">Description<textarea name="description" defaultValue={editing?.description ?? ""} /></label><label className="mvp-field">Position<input name="position" type="number" defaultValue={editing?.position ?? 100} required /></label><label><input name="active" type="checkbox" defaultChecked={editing?.active ?? true} /> Active</label><button className="mvp-button">Enregistrer</button></form></section></div>;
}
