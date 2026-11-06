import type { MetadataRoute } from "next";
import { brand } from "@/lib/brand";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: brand.name,
    short_name: brand.name,
    description: brand.description,
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: brand.backgroundColor,
    theme_color: brand.themeColor,
    icons: [
      {
        src: brand.assets.icons.app192,
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: brand.assets.icons.app512,
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: brand.assets.icons.maskable192,
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: brand.assets.icons.maskable512,
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
