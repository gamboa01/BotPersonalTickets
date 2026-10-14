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
  area_id: number | null;
  areas?: { nombre: string } | null;
  asignado_id: number | null;
  asignado_at: string | null;
  tecnicos?: { nombre: string } | null;
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

export interface DocEntry {
  id: string;
  title: string;
  category: string | null;
  tags: string[];
  username: string | null;
  url: string | null;
  cred_ref: string | null;
  body: string | null;
  created_at: string;
  updated_at: string;
}

export type AreaTipo = "area" | "produccion" | "referencia";

// Rectángulo del croquis en celdas de la cuadrícula (ver planUtils.ts).
export interface Area {
  id: number;
  nombre: string;
  nivel: 1 | 2;
  tipo: AreaTipo;
  x: number;
  y: number;
  w: number;
  h: number;
  color: string | null;
  ubicacion: string | null;
  encargado: string | null;
  extension: string | null;
  notas: string | null;
  created_at: string;
  updated_at: string;
}

// Equipo de TI que atiende tickets (pantalla Hoy).
export interface Tecnico {
  id: number;
  nombre: string;
  color: string | null;
  activo: boolean;
  created_at: string;
}

// `dias` sigue extract(dow) de Postgres: 0 = domingo … 6 = sábado.
export interface Rutina {
  id: number;
  nombre: string;
  descripcion: string | null;
  hora: string | null;
  dias: number[];
  tecnico_id: number | null;
  activo: boolean;
  orden: number;
  created_at: string;
}

export interface RutinaRegistro {
  id: number;
  rutina_id: number;
  fecha: string;
  tecnico_id: number | null;
  completada_at: string;
}
