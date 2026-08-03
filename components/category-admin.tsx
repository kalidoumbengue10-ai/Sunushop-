"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";

type Category = { id: string; name: string; slug: string; description: string | null; position: number; active: boolean };

export function CategoryAdmin() {
  const [items, setItems] = useState<Category[]>([]);
  const [editing, setEditing] = useState<Category | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const load = useCallback(async () => {
    const response = await fetch("/api/admin/categories");
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error?.message);
    setItems(payload.data.items);
  }, []);
  useEffect(() => {
    // Chargement réseau initial.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load().catch((caught: Error) => setError(caught.message));
  }, [load]);
  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setError(""); setMessage("");
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/admin/categories", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: editing?.id, name: form.get("name"), description: form.get("description") || undefined, position: Number(form.get("position")), active: form.get("active") === "on" }),
    });
    const payload = await response.json();
    if (!response.ok) return setError(payload.error?.message ?? "Enregistrement impossible.");
    setEditing(null); setMessage("Catégorie enregistrée."); await load();
  };
  return (
    <div className="admin-category-layout">
      <section className="admin-panel">
        <div className="admin-panel__heading"><div><span className="admin-kicker">Catalogue public</span><h2>Catégories</h2><p>Ordre et visibilité du menu produits.</p></div></div>
        <div className="admin-category-list">{items.map((item) => <button type="button" key={item.id} onClick={() => setEditing(item)}><span><strong>{item.name}</strong><small>Position {item.position}</small></span><i className="crm-status" data-status={item.active ? "converted" : "archived"}>{item.active ? "Visible" : "Masquée"}</i></button>)}</div>
      </section>
      <section className="admin-panel admin-operation-panel">
        <div className="admin-panel__heading"><div><span className="admin-kicker">Configuration</span><h2>{editing ? "Modifier la catégorie" : "Nouvelle catégorie"}</h2><p>L’adresse publique est créée automatiquement.</p></div></div>
        {message && <p className="admin-feedback">{message}</p>}{error && <p className="admin-feedback admin-feedback--error">{error}</p>}
        <form className="admin-decision-form" onSubmit={save} key={editing?.id ?? "new"}>
          <label>Nom<input name="name" defaultValue={editing?.name} required /></label>
          <label>Position<input name="position" type="number" min="0" defaultValue={editing?.position ?? 100} required /></label>
          <label className="admin-field-wide">Description<textarea name="description" rows={4} defaultValue={editing?.description ?? ""} /></label>
          <label className="admin-field-wide admin-checkbox"><input name="active" type="checkbox" defaultChecked={editing?.active ?? true} /> Visible dans la marketplace</label>
          <div className="admin-field-wide mvp-actions"><button className="admin-primary-button">Enregistrer</button>{editing && <button type="button" className="admin-secondary-button" onClick={() => setEditing(null)}>Annuler</button>}</div>
        </form>
      </section>
    </div>
  );
}
