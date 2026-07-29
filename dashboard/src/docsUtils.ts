export const DEFAULT_CATEGORIAS_DOC = [
  "Plataformas",
  "Procesos",
  "FAQ",
  "Impresoras",
  "Red y WiFi",
  "Hosting y dominios",
  "Usuarios",
  "Credenciales",
  "Scripts",
  "Respaldos",
  "Otros",
];

const COMBINING_MARKS_RE = new RegExp("[̀-ͯ]", "g");

// Minúsculas y sin acentos, para que "chamilo" encuentre "Chamilo" y "número" encuentre "numero".
export function normalize(value: string): string {
  return value.toLowerCase().normalize("NFD").replace(COMBINING_MARKS_RE, "");
}

export function matchesQuery(
  entry: {
    title: string;
    category: string | null;
    tags: string[];
    body: string | null;
    username: string | null;
    url: string | null;
    cred_ref: string | null;
  },
  query: string
): boolean {
  const q = query.trim();
  if (!q) return true;
  const haystack = normalize(
    [entry.title, entry.category, entry.tags.join(" "), entry.body, entry.username, entry.url, entry.cred_ref]
      .filter(Boolean)
      .join("  ")
  );
  return normalize(q)
    .split(/\s+/)
    .filter(Boolean)
    .every((term) => haystack.includes(term));
}

// Divide un texto en segmentos para resaltar coincidencias sin usar HTML crudo.
export function highlightSegments(text: string, query: string): { text: string; match: boolean }[] {
  const q = query.trim();
  if (!q) return [{ text, match: false }];

  const terms = q
    .split(/\s+/)
    .filter(Boolean)
    .map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  if (terms.length === 0) return [{ text, match: false }];

  const re = new RegExp(`(${terms.join("|")})`, "gi");
  const parts = text.split(re).filter((p) => p !== "");
  return parts.map((part) => ({
    text: part,
    match: terms.some((t) => new RegExp(`^${t}$`, "i").test(part)),
  }));
}

// Separa texto plano en fragmentos de texto y URLs http(s), para volver los
// links clicables en React sin recurrir a dangerouslySetInnerHTML.
export function linkifySegments(text: string): { text: string; isLink: boolean }[] {
  const re = /(https?:\/\/[^\s]+)/g;
  const parts = text.split(re).filter((p) => p !== "");
  return parts.map((part) => ({ text: part, isLink: /^https?:\/\//.test(part) }));
}

export function formatDocDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("es-GT", { year: "numeric", month: "short", day: "numeric" });
  } catch {
    return "";
  }
}
