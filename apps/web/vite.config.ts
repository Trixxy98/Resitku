import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Proksi /api ke pelayan Express semasa pembangunan supaya frontend dan API
// kelihatan sama asal (same-origin) dari perspektif pelayar — mengelakkan
// kerumitan CORS/SameSite-cookie semata-mata untuk kerja tempatan. Produksi
// pula menetapkan VITE_API_URL secara eksplisit sebaliknya (lihat
// src/lib/apiClient.ts), dengan CORS_ORIGIN di sisi API dikonfigurasikan
// sepadan.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      "/api": {
        target: "http://localhost:3000",
        changeOrigin: true,
      },
    },
  },
});
