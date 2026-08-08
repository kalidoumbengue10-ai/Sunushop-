"use client";

import { SENEGAL_REGIONS } from "@/lib/domain/merchant-ui";
import { useLocationFilter } from "@/components/location-provider";

export function LocationFilter() {
  const { region, city, setLocation, clearLocation } = useLocationFilter();

  return (
    <div className="location-filter">
      <label className="location-filter__field">
        <span aria-hidden="true">📍</span>
        <select
          value={region ?? ""}
          onChange={(event) => setLocation({ region: event.target.value || null, city: null })}
          aria-label="Filtrer par région"
        >
          <option value="">Toute région du Sénégal</option>
          {SENEGAL_REGIONS.map((value) => <option value={value} key={value}>{value}</option>)}
        </select>
      </label>
      {region && (
        <label className="location-filter__field">
          <input
            value={city ?? ""}
            onChange={(event) => setLocation({ region, city: event.target.value || null })}
            placeholder="Ville (facultatif)"
            aria-label="Filtrer par ville"
          />
        </label>
      )}
      {(region || city) && (
        <button type="button" className="location-filter__clear" onClick={clearLocation} aria-label="Retirer le filtre de localisation">
          ✕
        </button>
      )}
    </div>
  );
}
