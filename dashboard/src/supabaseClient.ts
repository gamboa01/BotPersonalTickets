import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

// La anon key es segura de exponer en el cliente: el acceso real está
// controlado por las políticas RLS (solo lectura) definidas en la BD.
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export type Prioridad = "baja" | "media" | "alta" | "critica";
export type Estado = "abierto" | "en_progreso" | "resuelto" | "cerrado" | "anulado";

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
  // Las inactivas no se ofrecen al crear tickets, pero los viejos la conservan.
  activa: boolean;
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
  // Si tiene técnicos, el responsable se turna entre ellos día a día (ignora tecnico_id).
  rotacion: number[];
  activo: boolean;
  orden: number;
  // 'fija' usa `hora`; 'salida' usa la hora de salida del día + minutos_salida.
  referencia: "fija" | "salida";
  minutos_salida: number;
  created_at: string;
}

// Horario base por día de la semana (0 = domingo … 6 = sábado).
export interface JornadaDia {
  dia: number;
  laboral: boolean;
  hora_salida: string | null;
}

// Descanso, reposición u otra hora de salida para una fecha concreta.
export interface ExcepcionDia {
  fecha: string;
  laboral: boolean;
  hora_salida: string | null;
  como_dia: number | null;
  nota: string | null;
  created_at: string;
}

export interface RutinaRegistro {
  id: number;
  rutina_id: number;
  fecha: string;
  tecnico_id: number | null;
  completada_at: string;
  // La marcó el dashboard al pasar la hora + 15 min sin que nadie lo hiciera.
  automatica: boolean;
  // Se revisó y NO se hizo: no cuenta como cumplida.
  omitida: boolean;
}

// Ausencia de un técnico: todo el día (desde = null) o desde una hora.
export interface Ausencia {
  id: number;
  tecnico_id: number;
  fecha: string;
  desde: string | null;
  cubre_id: number | null;
  nota: string | null;
  created_at: string;
}

// Almuerzo de un técnico en el día: `fin` es la hora prevista de regreso.
export interface Almuerzo {
  id: number;
  tecnico_id: number;
  fecha: string;
  inicio: string;
  fin: string;
  regreso: string | null;
  // Lo marcó el dashboard a las 12:00 (no la persona).
  automatico: boolean;
  // "Sigo trabajando": se canceló el automático y el almuerzo sigue pendiente.
  pospuesto: boolean;
}
