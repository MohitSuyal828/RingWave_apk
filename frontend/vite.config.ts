import path from "path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    // Binds to 0.0.0.0 instead of just localhost, so a phone/other laptop
    // on the same Wi-Fi can reach this dev server at your machine's LAN IP.
    // Run `npm run dev` and look for the "Network:" URL it prints.
    host: true,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});