import { defineConfig } from "vite";

/** Standalone viewer build; separate from the site's Cloudflare/vinext config. */
export default defineConfig({
  root: "viewer",
  base: "./",
  build: { outDir: "../dist/body-viewer", emptyOutDir: true },
  server: { host: "0.0.0.0", fs: { allow: [".."] } },
});
