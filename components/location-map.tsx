"use client";

import { useEffect, useRef, useState } from "react";
import type { Map as MapLibreMap, Marker as MapLibreMarker } from "maplibre-gl";
import type { Coordinates, GeoPlace } from "@/lib/domain/geo";
import { isInSenegalBounds, navigationLinks } from "@/lib/domain/geo";
import { MAP_STYLE_URL, SENEGAL_MAP_CENTER, SENEGAL_MAP_ZOOM, configureMapWorker, toLngLat } from "@/lib/maps/config";

type LocationPickerProps = {
  value: Coordinates | null;
  onChange: (value: Coordinates | null) => void;
  onPlace?: (place: GeoPlace) => void;
  label?: string;
  required?: boolean;
};

function coordinatesFromInputs(latitude: HTMLInputElement | null, longitude: HTMLInputElement | null) {
  const value = { latitude: Number(latitude?.value), longitude: Number(longitude?.value) };
  return Number.isFinite(value.latitude) && Number.isFinite(value.longitude) && isInSenegalBounds(value) ? value : null;
}

export function LocationPicker({ value, onChange, onPlace, label = "Position exacte", required = false }: LocationPickerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markerRef = useRef<MapLibreMarker | null>(null);
  const latitudeRef = useRef<HTMLInputElement>(null);
  const longitudeRef = useRef<HTMLInputElement>(null);
  const onChangeRef = useRef(onChange);
  const onPlaceRef = useRef(onPlace);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GeoPlace[]>([]);
  const [message, setMessage] = useState("");
  const [mapUnavailable, setMapUnavailable] = useState(false);

  useEffect(() => {
    onChangeRef.current = onChange;
    onPlaceRef.current = onPlace;
  }, [onChange, onPlace]);

  const reverse = async (coordinates: Coordinates) => {
    try {
      const response = await fetch(`/api/maps/reverse?lat=${coordinates.latitude}&lng=${coordinates.longitude}`);
      const payload = await response.json();
      if (response.ok && payload.data?.place) onPlaceRef.current?.(payload.data.place as GeoPlace);
    } catch {
      // Le point GPS reste valide même si le libellé ne peut pas être résolu.
    }
  };

  const selectCoordinates = (coordinates: Coordinates, resolve = true) => {
    if (!isInSenegalBounds(coordinates)) {
      setMessage("Choisissez un point situé au Sénégal.");
      return;
    }
    setMessage("");
    onChangeRef.current(coordinates);
    if (resolve) void reverse(coordinates);
  };

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    let disposed = false;
    // Le style vectoriel ou l'une de ses sources peut échouer sans toujours
    // déclencher l'event "error" de MapLibre (échec partiel silencieux) :
    // ce filet de sécurité affiche le message de repli si le style ne se
    // résout jamais. Délai généreux car le rendu WebGL initial peut être
    // lent sur du matériel sans accélération graphique dédiée.
    const loadTimeout = window.setTimeout(() => {
      if (!disposed) setMapUnavailable(true);
    }, 15_000);
    void import("maplibre-gl").then(({ Map, Marker, NavigationControl, setWorkerUrl }) => {
      if (disposed || !containerRef.current) return;
      configureMapWorker(setWorkerUrl);
      const map = new Map({
        container: containerRef.current,
        style: MAP_STYLE_URL,
        center: value ? toLngLat(value) : SENEGAL_MAP_CENTER,
        zoom: value ? 15 : SENEGAL_MAP_ZOOM,
        attributionControl: {},
      });
      map.addControl(new NavigationControl({ showCompass: false }), "top-right");
      map.on("click", (event) => selectCoordinates({ latitude: event.lngLat.lat, longitude: event.lngLat.lng }));
      map.on("error", () => setMapUnavailable(true));
      // "styledata" confirme que le style JSON et ses sources sont résolus,
      // sans attendre le rendu complet de toutes les tuiles du viewport.
      map.once("styledata", () => {
        window.clearTimeout(loadTimeout);
        setMapUnavailable(false);
      });
      mapRef.current = map;
      if (value) {
        const marker = new Marker({ draggable: true }).setLngLat(toLngLat(value)).addTo(map);
        marker.on("dragend", () => {
          const point = marker.getLngLat();
          selectCoordinates({ latitude: point.lat, longitude: point.lng });
        });
        markerRef.current = marker;
      }
    }).catch(() => setMapUnavailable(true));
    return () => {
      disposed = true;
      window.clearTimeout(loadTimeout);
      mapRef.current?.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
    // La carte n'est créée qu'une fois ; les coordonnées sont synchronisées ci-dessous.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (latitudeRef.current) latitudeRef.current.value = value ? String(value.latitude) : "";
    if (longitudeRef.current) longitudeRef.current.value = value ? String(value.longitude) : "";
    if (!value || !mapRef.current) return;
    if (!markerRef.current) {
      void import("maplibre-gl").then(({ Marker }) => {
        if (!mapRef.current) return;
        const marker = new Marker({ draggable: true }).setLngLat(toLngLat(value)).addTo(mapRef.current);
        marker.on("dragend", () => {
          const point = marker.getLngLat();
          selectCoordinates({ latitude: point.lat, longitude: point.lng });
        });
        markerRef.current = marker;
      });
    } else {
      markerRef.current.setLngLat(toLngLat(value));
    }
    mapRef.current.flyTo({ center: toLngLat(value), zoom: Math.max(mapRef.current.getZoom(), 14) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value?.latitude, value?.longitude]);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 4) return;
    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      try {
        const focus = value ? `&lat=${value.latitude}&lng=${value.longitude}` : "";
        const response = await fetch(`/api/maps/search?q=${encodeURIComponent(trimmed)}${focus}`, { signal: controller.signal });
        const payload = await response.json();
        if (!response.ok) return setMessage(payload.error?.message ?? "Recherche indisponible.");
        setResults(payload.data?.items ?? []);
        setMessage(payload.data?.items?.length ? "" : "Aucun lieu trouvé. Vous pouvez placer le point sur la carte.");
      } catch (error) {
        if ((error as Error).name !== "AbortError") setMessage("Recherche indisponible. Placez le point manuellement.");
      }
    }, 600);
    return () => { controller.abort(); window.clearTimeout(timeout); };
  }, [query, value]);

  const locate = () => {
    setMessage("");
    if (!navigator.geolocation) return setMessage("La géolocalisation n’est pas disponible sur cet appareil.");
    navigator.geolocation.getCurrentPosition(
      (position) => selectCoordinates({ latitude: position.coords.latitude, longitude: position.coords.longitude }),
      () => setMessage("Position non accessible. Placez le point manuellement."),
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
    );
  };

  const choosePlace = (place: GeoPlace) => {
    setQuery(place.label);
    setResults([]);
    onPlaceRef.current?.(place);
    selectCoordinates(place, false);
  };

  const applyManualCoordinates = () => {
    const coordinates = coordinatesFromInputs(latitudeRef.current, longitudeRef.current);
    if (!coordinates) return setMessage("Saisissez des coordonnées valides situées au Sénégal.");
    selectCoordinates(coordinates);
  };

  return (
    <section className="location-picker" aria-label={label}>
      <div className="location-picker__heading">
        <div><strong>{label}{required ? " *" : ""}</strong><small>Recherchez, utilisez votre position ou touchez la carte.</small></div>
        <button type="button" className="mvp-button mvp-button--secondary" onClick={locate}>Utiliser ma position</button>
      </div>
      <label className="mvp-field">
        Rechercher un lieu
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Quartier, rue ou lieu connu" autoComplete="off" />
      </label>
      {results.length > 0 && <div className="location-search-results" role="listbox">{results.map((place) => (
        <button type="button" key={`${place.latitude}-${place.longitude}-${place.label}`} onClick={() => choosePlace(place)}>{place.label}</button>
      ))}</div>}
      <div ref={containerRef} className="location-map" aria-label="Carte de sélection" />
      {mapUnavailable && <p className="mvp-alert mvp-alert--warning">Le fond de carte ne répond pas. Utilisez le GPS ou saisissez les coordonnées ci-dessous.</p>}
      {message && <p className="location-picker__message" role="status">{message}</p>}
      <details className="location-coordinates">
        <summary>Saisir les coordonnées manuellement</summary>
        <div className="mvp-form__grid">
          <label className="mvp-field">Latitude<input ref={latitudeRef} type="number" step="0.000001" min="12" max="17" /></label>
          <label className="mvp-field">Longitude<input ref={longitudeRef} type="number" step="0.000001" min="-18" max="-11" /></label>
        </div>
        <button type="button" className="mvp-button mvp-button--secondary" onClick={applyManualCoordinates}>Appliquer les coordonnées</button>
      </details>
      {value && <small className="location-picker__selected">Point sélectionné : {value.latitude.toFixed(6)}, {value.longitude.toFixed(6)}</small>}
    </section>
  );
}

type LocationMapProps = {
  point: Coordinates;
  label?: string | null;
  route?: { type: "LineString"; coordinates: number[][] } | null;
  destination?: Coordinates | null;
};

export function LocationMap({ point, label, route, destination }: LocationMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!containerRef.current) return;
    let map: MapLibreMap | null = null;
    let disposed = false;
    void import("maplibre-gl").then(({ Map, Marker, NavigationControl, LngLatBounds, Popup, setWorkerUrl }) => {
      if (disposed || !containerRef.current) return;
      configureMapWorker(setWorkerUrl);
      map = new Map({ container: containerRef.current, style: MAP_STYLE_URL, center: toLngLat(point), zoom: destination ? 11 : 15, attributionControl: {} });
      map.addControl(new NavigationControl({ showCompass: false }), "top-right");
      const originMarker = new Marker({ color: "#173f2e" }).setLngLat(toLngLat(point));
      if (label) originMarker.setPopup(new Popup({ offset: 20 }).setText(label));
      originMarker.addTo(map);
      if (destination) new Marker({ color: "#b84d2d" }).setLngLat(toLngLat(destination)).addTo(map);
      map.on("load", () => {
        if (!map || !destination) return;
        const geometry = route ?? { type: "LineString" as const, coordinates: [toLngLat(point), toLngLat(destination)] };
        map.addSource("sunushop-route", { type: "geojson", data: { type: "Feature", properties: {}, geometry } });
        map.addLayer({ id: "sunushop-route", type: "line", source: "sunushop-route", paint: { "line-color": "#b84d2d", "line-width": 5, "line-opacity": route ? 0.9 : 0.55, ...(route ? {} : { "line-dasharray": [2, 2] }) } });
        const bounds = new LngLatBounds(toLngLat(point), toLngLat(point));
        bounds.extend(toLngLat(destination));
        for (const coordinate of geometry.coordinates) bounds.extend(coordinate as [number, number]);
        map.fitBounds(bounds, { padding: 52, maxZoom: 15 });
      });
    });
    return () => { disposed = true; map?.remove(); };
  }, [destination, label, point, route]);
  return <div ref={containerRef} className="location-map location-map--readonly" aria-label={label ? `Carte : ${label}` : "Carte"} />;
}

export function NavigationLinks({ destination, label }: { destination: Coordinates; label?: string | null }) {
  const links = navigationLinks({ ...destination, label });
  return <div className="mvp-actions location-navigation">
    <a className="mvp-button" href={links.app}>Ouvrir l’application GPS</a>
    <a className="mvp-button mvp-button--secondary" href={links.openStreetMap} target="_blank" rel="noreferrer">Voir sur OpenStreetMap</a>
  </div>;
}
