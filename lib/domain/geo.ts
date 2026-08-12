export const SENEGAL_BOUNDS = {
  minLatitude: 12,
  maxLatitude: 17,
  minLongitude: -18,
  maxLongitude: -11,
} as const;

export type Coordinates = { latitude: number; longitude: number };

export type GeoPlace = Coordinates & {
  label: string;
  region: string | null;
  city: string | null;
};

export function hasCoordinatePair(value: {
  latitude?: number | null;
  longitude?: number | null;
}): value is Coordinates {
  return Number.isFinite(value.latitude) && Number.isFinite(value.longitude);
}

export function isInSenegalBounds({ latitude, longitude }: Coordinates) {
  return latitude >= SENEGAL_BOUNDS.minLatitude &&
    latitude <= SENEGAL_BOUNDS.maxLatitude &&
    longitude >= SENEGAL_BOUNDS.minLongitude &&
    longitude <= SENEGAL_BOUNDS.maxLongitude;
}

export function distanceKm(origin: Coordinates, destination: Coordinates) {
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const latitudeDelta = radians(destination.latitude - origin.latitude);
  const longitudeDelta = radians(destination.longitude - origin.longitude);
  const a = Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(radians(origin.latitude)) * Math.cos(radians(destination.latitude)) *
    Math.sin(longitudeDelta / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function navigationLinks(destination: Coordinates & { label?: string | null }) {
  const label = destination.label?.trim() || "Destination SunuShop";
  const coordinates = `${destination.latitude},${destination.longitude}`;
  return {
    app: `geo:${coordinates}?q=${encodeURIComponent(`${coordinates} (${label})`)}`,
    openStreetMap: `https://www.openstreetmap.org/?mlat=${destination.latitude}&mlon=${destination.longitude}#map=17/${destination.latitude}/${destination.longitude}`,
  };
}
