import { ImageResponse } from "next/og";

export const alt = "SunuShop — chaque commande devient claire";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "64px 72px",
          color: "#fffdf8",
          background: "#173f2e",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 34 }}>
          <span
            style={{
              width: 42,
              height: 42,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 24,
              color: "#173f2e",
              background: "#f1ad32",
              fontSize: 18,
            }}
          >
            S
          </span>
          <span style={{ color: "#fffdf8" }}>Sunu</span>
          <span style={{ marginLeft: -14, color: "#f1ad32" }}>Shop</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div style={{ display: "flex", maxWidth: 920, fontSize: 72, lineHeight: 1.02 }}>
            Vendez simplement. Commandez l’esprit clair.
          </div>
          <div style={{ display: "flex", fontSize: 24, color: "#dce7d7" }}>
            Boutiques vérifiées · total visible · suivi de commande
          </div>
        </div>
      </div>
    ),
    size,
  );
}
