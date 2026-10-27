import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  // GitHub Pages serves the site under /<repo>/; the deploy workflow sets BASE_PATH
  base: process.env.BASE_PATH || "/",
  plugins: [react()],
  resolve: { dedupe: ["three"] },
  optimizeDeps: { include: ["three", "three/examples/jsm/controls/OrbitControls.js", "three/examples/jsm/loaders/RGBELoader.js", "three/examples/jsm/loaders/GLTFLoader.js"] },
  server: { port: 5173, open: false },
  build: { target: "es2020", chunkSizeWarningLimit: 1500 },
});
