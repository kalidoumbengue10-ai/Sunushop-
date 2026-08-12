"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";

const STORAGE_KEY = "sunushop.location.v1";

type LocationValue = { region: string | null; city: string | null; latitude: number | null; longitude: number | null };

type LocationContextValue = LocationValue & {
  ready: boolean;
  setLocation: (value: Pick<LocationValue, "region" | "city">) => void;
  setNearby: (value: { latitude: number; longitude: number }) => void;
  clearLocation: () => void;
};

const LocationContext = createContext<LocationContextValue | null>(null);

export function LocationProvider({ children }: { children: React.ReactNode }) {
  const [value, setValue] = useState<LocationValue>({ region: null, city: null, latitude: null, longitude: null });
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as Partial<LocationValue>;
        // Hydratation unique depuis le stockage navigateur.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setValue({ region: parsed.region ?? null, city: parsed.city ?? null, latitude: parsed.latitude ?? null, longitude: parsed.longitude ?? null });
      }
    } catch {
      // localStorage indisponible (navigation privée) : le filtre reste vide pour la session.
    } finally {
      setReady(true);
    }
  }, []);

  const persist = useCallback((next: LocationValue) => {
    setValue(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // ignoré : le filtre fonctionne quand même pour la session en cours.
    }
  }, []);

  const setLocation = useCallback((next: Pick<LocationValue, "region" | "city">) => {
    persist({ ...next, latitude: null, longitude: null });
  }, [persist]);

  const setNearby = useCallback((next: { latitude: number; longitude: number }) => {
    persist({ region: null, city: null, ...next });
  }, [persist]);

  const clearLocation = useCallback(() => persist({ region: null, city: null, latitude: null, longitude: null }), [persist]);

  return (
    <LocationContext.Provider value={{ ...value, ready, setLocation, setNearby, clearLocation }}>
      {children}
    </LocationContext.Provider>
  );
}

export function useLocationFilter() {
  const context = useContext(LocationContext);
  if (!context) throw new Error("useLocationFilter doit être utilisé sous LocationProvider.");
  return context;
}
