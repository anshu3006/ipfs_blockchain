import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // Port must match FRONTEND_ORIGIN in backend/.env (CORS)
  server: { port: 5173, strictPort: true },
});
