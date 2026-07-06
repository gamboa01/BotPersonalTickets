import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

// La anon key es segura de exponer en el cliente: el acceso real está
// controlado por las políticas RLS (solo lectura) definidas en la BD.
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export type Prioridad = "baja" | "media" | "alta" | "critica";
export type Estado = "abierto" | "en_progreso" | "resuelto" | "cerrado";

export interface Ticket {
  id: number;
  descripcion: string;
  categoria_id: number | null;
  prioridad: Prioridad;
  estado: Estado;
  reportado_por: number;
  reportado_por_nombre: string | null;
  asignado_a: string | null;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
  categorias?: { nombre: string } | null;
}

export interface Categoria {
  id: number;
  nombre: string;
}

export interface Comentario {
  id: number;
  ticket_id: number;
  autor: string;
  texto: string;
  created_at: string;
}

export interface Adjunto {
  id: number;
  ticket_id: number;
  url: string;
  created_at: string;
}
