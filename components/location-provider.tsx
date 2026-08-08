"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";

const STORAGE_KEY = "sunushop.location.v1";

type LocationValue = { region: string | null; city: string | null };

type LocationContextValue = LocationValue & {
  ready: boolean;
  setLocation: (value: LocationValue) => void;
  clearLocation: () => void;
};

const LocationContext = createContext<LocationContextValue | null>(null);

export function LocationProvider({ children }: { children: React.ReactNode }) {
  const [value, setValue] = useState<LocationValue>({ region: null, city: null });
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (stored) setValue(JSON.parse(stored) as LocationValue);
    } catch {
      // localStorage indisponible (navigation privée) : le filtre reste vide pour la session.
    } finally {
      setReady(true);
    }
  }, []);

  const setLocation = useCallback((next: LocationValue) => {
    setValue(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // ignoré : le filtre fonctionne quand même pour la session en cours.
    }
  }, []);

  const clearLocation = useCallback(() => setLocation({ region: null, city: null }), [setLocation]);

  return (
    <LocationContext.Provider value={{ ...value, ready, setLocation, clearLocation }}>
      {children}
    </LocationContext.Provider>
  );
}

export function useLocationFilter() {
  const context = useContext(LocationContext);
  if (!context) throw new Error("useLocationFilter doit être utilisé sous LocationProvider.");
  return context;
}
