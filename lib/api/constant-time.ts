import { timingSafeEqual } from "node:crypto";

// Point de comparaison unique pour tout secret partagé (cron, webhooks,
// ingestion signée) : une comparaison `===` sur des Buffer/chaînes fuit leur
// longueur commune par canal temporel. `timingSafeEqual` exige des tampons
// de même longueur, d'où la vérification préalable ci-dessous.
export function constantTimeEqual(a: Buffer, b: Buffer) {
  return a.length === b.length && timingSafeEqual(a, b);
}
