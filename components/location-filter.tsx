"use client";

import { SENEGAL_REGIONS } from "@/lib/domain/merchant-ui";
import { useLocationFilter } from "@/components/location-provider";

export function LocationFilter() {
  const { region, city, latitude, longitude, setLocation, setNearby, clearLocation } = useLocationFilter();

  const locate = () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition((position) => {
      setNearby({ latitude: position.coords.latitude, longitude: position.coords.longitude });
    });
  };

  return (
    <div className="location-filter">
      <button type="button" className={`location-filter__nearby ${latitude != null && longitude != null ? "is-active" : ""}`} onClick={locate}>
        Autour de moi
      </button>
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
      {(region || city || latitude != null) && (
        <button type="button" className="location-filter__clear" onClick={clearLocation} aria-label="Retirer le filtre de localisation">
          ✕
        </button>
      )}
    </div>
  );
}
