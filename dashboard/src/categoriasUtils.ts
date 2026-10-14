import { Categoria } from "./supabaseClient";

// Alfabético, con "Otros" siempre al final (mismo criterio que el bot).
export function ordenarCategorias(categorias: Categoria[]) {
  return [...categorias].sort((a, b) =>
    a.nombre === "Otros" ? 1 : b.nombre === "Otros" ? -1 : a.nombre.localeCompare(b.nombre, "es")
  );
}
