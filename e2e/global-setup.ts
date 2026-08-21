import { assertDisposableLocalE2E } from "./local-environment";

export default async function globalSetup() {
  assertDisposableLocalE2E();

  // Next.js compile les routes à la demande en développement. Sans ce
  // préchauffage, le premier clic vers une route froide peut être annulé par
  // le Fast Refresh qui suit sa compilation, ce qui rend les tests de
  // navigation inutilement intermittents.
  const baseUrl = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3107";
  const routes = [
    "/",
    "/connexion?profil=client&next=/client",
    "/connexion?profil=vendeur&next=/marchand",
    "/creer-ma-boutique",
  ];

  for (const route of routes) {
    const response = await fetch(new URL(route, baseUrl), { redirect: "manual" });
    if (response.status >= 500) {
      throw new Error(`Le préchauffage E2E de ${route} a échoué (${response.status}).`);
    }
    await response.arrayBuffer();
  }
}
