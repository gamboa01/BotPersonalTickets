import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// base relativo: funciona tanto en GitHub Pages (https://usuario.github.io/repo/)
// como en local, sin necesidad de conocer el nombre del repositorio.
export default defineConfig({
  plugins: [react()],
  base: "./",
});
