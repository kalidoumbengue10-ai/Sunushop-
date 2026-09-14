// Échappement unique des valeurs interpolées dans un filtre `ilike`/`like`.
//
// PostgREST encode bien les valeurs (il n'y a pas d'injection SQL ici), mais
// `%` et `_` restent interprétés comme des jokers : une recherche contenant
// `%` élargit silencieusement le filtre au lieu de le restreindre. Sur une
// requête déjà bornée (par `merchant_id` par exemple) l'impact est nul, mais
// la règle doit être uniforme pour qu'une future recherche non bornée ne
// devienne pas un moyen d'énumérer des lignes.
export function escapeLikePattern(value: string) {
  return value.replace(/([\\%_])/g, "\\$1");
}

// Enveloppe la valeur échappée dans un motif « contient ».
export function containsPattern(value: string) {
  return `%${escapeLikePattern(value)}%`;
}
