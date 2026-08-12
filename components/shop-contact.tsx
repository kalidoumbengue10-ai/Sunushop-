// Coordonnées cliquables d'une boutique : adresse (app de navigation),
// téléphone (tel:) et email (mailto:). Chaque champ n'est rendu que s'il est
// renseigné — phone est not null en base mais email, lat/lng sont optionnels.

type ShopContactProps = {
  phone?: string | null;
  email?: string | null;
  addressLine?: string | null;
  latitude?: number | null;
  longitude?: number | null;
};

function addressHref(addressLine: string, latitude?: number | null, longitude?: number | null) {
  if (latitude != null && longitude != null) {
    return `geo:${latitude},${longitude}?q=${encodeURIComponent(addressLine)}`;
  }
  return `https://www.openstreetmap.org/search?query=${encodeURIComponent(addressLine)}`;
}

export function ShopContact({ phone, email, addressLine, latitude, longitude }: ShopContactProps) {
  if (!phone && !email && !addressLine) return null;

  return (
    <div className="mvp-list shop-contact">
      {addressLine && (
        <a
          className="mvp-row"
          href={addressHref(addressLine, latitude, longitude)}
          target="_blank"
          rel="noopener noreferrer"
        >
          <strong>Adresse</strong>
          <span>{addressLine}</span>
        </a>
      )}
      {phone && (
        <a className="mvp-row" href={`tel:${phone}`}>
          <strong>Téléphone</strong>
          <span>{phone}</span>
        </a>
      )}
      {email && (
        <a className="mvp-row" href={`mailto:${email}`}>
          <strong>Email</strong>
          <span>{email}</span>
        </a>
      )}
    </div>
  );
}
