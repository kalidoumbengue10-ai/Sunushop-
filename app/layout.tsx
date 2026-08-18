import type { Metadata } from "next";
import "maplibre-gl/dist/maplibre-gl.css";
import "./globals.css";
import "./mvp.css";
import "./access-spaces.css";
import "./admin.css";
import { PostHogProvider } from "@/components/posthog-provider";

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
  ),
  title: {
    default: "SunuShop",
    template: "%s | SunuShop",
  },
  description:
    "La marketplace sénégalaise pour acheter, vendre et suivre ses commandes.",
  applicationName: "SunuShop",
  robots: {
    index: false,
    follow: false,
    nocache: true,
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr" data-scroll-behavior="smooth">
      <body suppressHydrationWarning>
        <PostHogProvider>{children}</PostHogProvider>
      </body>
    </html>
  );
}
