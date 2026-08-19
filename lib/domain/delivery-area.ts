/**
 * Normalise les noms de région/ville avant de les comparer.
 *
 * NFKC rend notamment équivalents les caractères Unicode composés/décomposés
 * et transforme les espaces insécables en espaces ordinaires. Le remplacement
 * final neutralise aussi les espaces répétés ou placés au milieu d'un nom.
 */
export function normalizeDeliveryAreaName(value: string) {
  return value
    .normalize("NFKC")
    .replace(/\s+/gu, " ")
    .trim()
    .toLocaleLowerCase("fr");
}

export function sameDeliveryAreaName(left: string, right: string) {
  return normalizeDeliveryAreaName(left) === normalizeDeliveryAreaName(right);
}
