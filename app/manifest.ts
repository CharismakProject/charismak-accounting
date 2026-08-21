import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Charismak Construction Accounting",
    short_name: "Charismak CA",
    description: "Construction accounting, project cost control, treasury, approvals and document intelligence.",
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
