const configuredUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim();

export const siteConfig = {
  name: "SunuShop",
  title: "SunuShop | Chaque commande devient claire",
  description:
    "La marketplace sénégalaise qui transforme les catalogues sociaux en boutiques vérifiées et chaque demande en commande suivie.",
  url: configuredUrl || "http://localhost:3000",
  isLive:
    process.env.NEXT_PUBLIC_SITE_IS_LIVE === "true" &&
    Boolean(configuredUrl),
  locale: "fr_SN",
  city: "Dakar",
  country: "SN",
} as const;

export function getStructuredData() {
  if (!siteConfig.isLive) return [];

  return [
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: siteConfig.name,
      url: siteConfig.url,
      inLanguage: "fr-SN",
      description: siteConfig.description,
    },
  ];
}
