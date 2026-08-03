"use client";

import { FormEvent, useMemo, useState } from "react";
import type { CrmLead } from "@/components/admin-crm";

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

export function MerchantInvitationPanel({
  leads,
  reload,
}: {
  leads: CrmLead[];
  reload: () => Promise<void>;
}) {
  const [selectedId, setSelectedId] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const selected = useMemo(
    () => leads.find((lead) => lead.id === selectedId),
    [leads, selectedId],
  );

  const invite = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/admin/merchant-invitations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          leadId: selected?.id,
          kind: form.get("kind"),
          publicName: form.get("publicName"),
          legalName: form.get("legalName") || undefined,
          slug: form.get("slug"),
          phone: form.get("phone"),
          email: form.get("email"),
          region: form.get("region") || undefined,
          city: form.get("city") || undefined,
          addressHint: form.get("addressHint") || undefined,
          representativeIsLegalOwner:
            form.get("representativeIsLegalOwner") === "on",
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error?.message ?? "Invitation impossible.");
      }
      setMessage("Invitation commerçant envoyée.");
      setSelectedId("");
      event.currentTarget.reset();
      await reload();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Invitation impossible.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="admin-panel admin-operation-panel">
      <div className="admin-panel__heading">
        <div>
          <span className="admin-kicker">Accès commerçant</span>
          <h2>Inviter ou ajouter un commerçant</h2>
          <p>
            Sélectionnez un prospect du CRM ou renseignez directement un nouveau
            commerce.
          </p>
        </div>
      </div>
      {message && <p className="admin-feedback">{message}</p>}
      {error && <p className="admin-feedback admin-feedback--error">{error}</p>}
      <label className="mvp-field">
        Prospect CRM facultatif
        <select value={selectedId} onChange={(event) => setSelectedId(event.target.value)}>
          <option value="">Ajout manuel</option>
          {leads
            .filter((lead) => !["converted", "archived", "rejected"].includes(lead.status))
            .map((lead) => (
              <option value={lead.id} key={lead.id}>
                {lead.business_name} · {lead.full_name}
              </option>
            ))}
        </select>
      </label>
      <form className="admin-decision-form" onSubmit={invite} key={selected?.id ?? "manual"}>
        <label>
          Type
          <select name="kind">
            <option value="informal">Informel</option>
            <option value="formal">Formel</option>
          </select>
        </label>
        <label>
          Nom public
          <input name="publicName" defaultValue={selected?.business_name ?? ""} required />
        </label>
        <label>
          Identifiant URL
          <input name="slug" defaultValue={slugify(selected?.business_name ?? "")} required />
        </label>
        <label>
          Email
          <input name="email" type="email" defaultValue={selected?.email ?? ""} required />
        </label>
        <label>
          Téléphone international
          <input name="phone" defaultValue={selected?.phone || "+221"} required />
        </label>
        <label>
          Ville
          <input name="city" defaultValue={selected?.city ?? ""} />
        </label>
        <label>
          Région
          <input name="region" />
        </label>
        <label>
          Raison sociale
          <input name="legalName" />
        </label>
        <label className="admin-field-wide">
          Adresse ou repère
          <textarea name="addressHint" rows={2} />
        </label>
        <label className="admin-field-wide">
          <input name="representativeIsLegalOwner" type="checkbox" defaultChecked />{" "}
          Le signataire est le responsable légal
        </label>
        <div className="admin-field-wide">
          <button className="admin-primary-button" disabled={busy}>
            {busy ? "Envoi…" : "Envoyer l’invitation"}
          </button>
        </div>
      </form>
    </section>
  );
}
