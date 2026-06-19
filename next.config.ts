import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === "production";
// GitHub Pages serves the site at /vet-heatmap/ subpath.
// For local dev (npm run dev) we use root.
const basePath = isProd ? "/vet-heatmap" : "";
const assetPrefix = isProd ? "/vet-heatmap/" : undefined;

const nextConfig: NextConfig = {
  output: "export",
  // GitHub Pages needs /vet-heatmap subpath in production
  basePath,
  assetPrefix,
  // Static export doesn't need image optimization
  images: { unoptimized: true },
  // MapLibre needs to be transpiled (it has some ESM edge cases)
  transpilePackages: ["maplibre-gl"],
  // Type-check is done via `tsc --noEmit` separately; faster iteration here
  typescript: { ignoreBuildErrors: true },
  reactStrictMode: true,
};

export default nextConfig;
