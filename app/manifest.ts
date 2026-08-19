import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Charismak Accounting",
    short_name: "Accounting",
    description: "Construction accounting, project cost control, treasury and approvals.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#f4f7fb",
    theme_color: "#082945",
    orientation: "any",
    categories: ["business", "finance", "productivity"],
    icons: [
      { src: "/icon", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
