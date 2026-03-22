import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import fs from "fs";
import dotenv from "dotenv";

// Load public.env if it exists
if (fs.existsSync("public.env")) {
  dotenv.config({ path: "public.env" });
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [tailwindcss(), react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  // Ensure we can access process.env values that might be loaded
  define: {
    // Vite automatically exposes VITE_ prefixed vars from .env files,
    // but for custom file 'public.env', we loaded them into process.env.
    // We can explicitly map them if needed, or rely on Vite's loadEnv in config?
    // Actually, dotenv populates process.env.
    // However, Vite only exposes process.env.VITE_* if loaded via its own system usually.
    // But since we are in config, we can use `define` to inject them.
    'process.env': process.env
  }
});
