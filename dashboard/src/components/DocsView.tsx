import { useEffect, useMemo, useState } from "react";
import { DocEntry, supabase } from "../supabaseClient";
import {
  DEFAULT_CATEGORIAS_DOC,
  formatDocDate,
  highlightSegments,
  IMAGE_MARKDOWN_RE,
  matchesQuery,
  parseBodySegments,
  stripImageMarkdown,
} from "../docsUtils";
import { DocEditorModal, DocDraft } from "./DocEditorModal";
import { DocDetailModal } from "./DocDetailModal";
import { DocImportModal } from "./DocImportModal";

function escapeHtmlForPrint(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function DocsView() {
  const [entries, setEntries] = useState<DocEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<string>("todas");
  const [showEditor, setShowEditor] = useState(false);
  const [editingEntry, setEditingEntry] = useState<DocEntry | null>(null);
  const [viewingEntry, setViewingEntry] = useState<DocEntry | null>(null);
  const [saving, setSaving] = useState(false);
  const [showImport, setShowImport] = useState(false);

  async function load() {
    const { data, error } = await supabase.from("docs").select("*").order("updated_at", { ascending: false });
    if (error) {
      setError(error.message);
    } else {
      setEntries((data ?? []) as DocEntry[]);
    }
    setLoading(false);
  }

  useEffect(() => {
    load();

    const channel = supabase
      .channel("docs-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "docs" }, () => {
        load();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const categoryCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const e of entries) {
      const cat = e.category || "Otros";
      counts.set(cat, (counts.get(cat) ?? 0) + 1);
    }
    return counts;
  }, [entries]);

  const allCategories = useMemo(() => {
    const list = [...DEFAULT_CATEGORIAS_DOC];
    for (const cat of categoryCounts.keys()) {
      if (!list.includes(cat)) list.push(cat);
    }
    return list;
  }, [categoryCounts]);

  const filteredEntries = useMemo(() => {
    return entries
      .filter((e) => (activeCategory === "todas" ? true : (e.category || "Otros") === activeCategory))
      .filter((e) => matchesQuery(e, query))
      .sort((a, b) => (b.updated_at || "").localeCompare(a.updated_at || ""));
  }, [entries, activeCategory, query]);

  function openNew() {
    setEditingEntry(null);
    setShowEditor(true);
  }

  function openEdit(entry: DocEntry) {
    setViewingEntry(null);
    setEditingEntry(entry);
    setShowEditor(true);
  }

  async function handleSave(draft: DocDraft) {
    setSaving(true);
    const now = new Date().toISOString();
    if (editingEntry) {
      await supabase
        .from("docs")
        .update({ ...draft, updated_at: now })
        .eq("id", editingEntry.id);
    } else {
      await supabase.from("docs").insert({ ...draft, created_at: now, updated_at: now });
    }
    await load();
    setSaving(false);
    setShowEditor(false);
    setEditingEntry(null);
  }

  async function handleDelete() {
    if (!editingEntry) return;
    if (!confirm("¿Eliminar esta entrada? No se puede deshacer.")) return;
    await supabase.from("docs").delete().eq("id", editingEntry.id);
    await load();
    setShowEditor(false);
    setEditingEntry(null);
  }

  function exportJson() {
    const payload = { app: "bitacora-ti", version: 1, exportedAt: new Date().toISOString(), entries };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const d = new Date();
    const stamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    a.href = url;
    a.download = `bitacora-ti-${stamp}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 500);
  }

  async function importJsonText(jsonText: string) {
    try {
      const parsed = JSON.parse(jsonText);
      const incoming: Record<string, unknown>[] = Array.isArray(parsed.entries)
        ? parsed.entries
        : Array.isArray(parsed)
          ? parsed
          : [];
      if (incoming.length === 0) throw new Error("El JSON no tiene entradas reconocibles.");

      const rows = incoming.map((raw) => {
        const r = raw as Record<string, any>;
        const now = new Date().toISOString();
        return {
          id: r.id ? String(r.id) : crypto.randomUUID(),
          title: r.title ?? "",
          category: r.category ?? r.cat ?? "Otros",
          tags: Array.isArray(r.tags) ? r.tags : [],
          username: r.username ?? r.user ?? "",
          url: r.url ?? "",
          cred_ref: r.cred_ref ?? r.ref ?? "",
          body: r.body ?? "",
          created_at: r.created_at ?? r.created ?? now,
          updated_at: r.updated_at ?? r.updated ?? now,
        };
      });

      const { error } = await supabase.from("docs").upsert(rows, { onConflict: "id" });
      if (error) throw error;
      await load();
      alert(`Se importaron ${rows.length} entradas.`);
      setShowImport(false);
    } catch (err) {
      alert(`No se pudo importar: ${err instanceof Error ? err.message : "JSON inválido"}`);
    }
  }

  function printPdf() {
    const items = [...entries].sort(
      (a, b) => (a.category || "").localeCompare(b.category || "") || a.title.localeCompare(b.title)
    );
    const w = window.open("", "_blank");
    if (!w) {
      alert("Permite las ventanas emergentes para exportar a PDF.");
      return;
    }
    const css =
      "body{font-family:Georgia,serif;max-width:720px;margin:32px auto;padding:0 20px;color:#15202a;line-height:1.55}" +
      "h1{font-size:22px;border-bottom:2px solid #15202a;padding-bottom:8px}" +
      "h2{font-size:15px;margin-top:26px;color:#0a5b55;border-bottom:1px solid #ccc;padding-bottom:4px}" +
      "h3{font-size:14px;margin:16px 0 4px}.m{font-family:monospace;font-size:11px;color:#666;margin:2px 0 6px}" +
      ".b{white-space:pre-wrap;font-size:12.5px;margin:0 0 8px}.t{font-family:monospace;font-size:10px;color:#0a5b55}" +
      ".b img{max-width:100%;border:1px solid #ccc;border-radius:4px;margin:6px 0;display:block}" +
      "@media print{h2,h3{page-break-after:avoid}article{page-break-inside:avoid}}";

    let html = `<h1>Bitácora TI</h1><div class="m">Generado ${new Date().toLocaleString("es-GT")} · ${items.length} entradas</div>`;
    let lastCat: string | null = null;
    for (const e of items) {
      const cat = e.category || "Otros";
      if (cat !== lastCat) {
        html += `<h2>${escapeHtmlForPrint(cat)}</h2>`;
        lastCat = cat;
      }
      html += `<article><h3>${escapeHtmlForPrint(e.title)}</h3>`;
      const meta: string[] = [];
      if (e.username) meta.push(`Usuario: ${escapeHtmlForPrint(e.username)}`);
      if (e.url) meta.push(`URL: ${escapeHtmlForPrint(e.url)}`);
      if (e.cred_ref) meta.push(`Credencial en: ${escapeHtmlForPrint(e.cred_ref)}`);
      if (meta.length) html += `<div class="m">${meta.join(" &nbsp;|&nbsp; ")}</div>`;

      const bodyHtml = parseBodySegments(e.body || "")
        .map((seg) => {
          if (seg.type === "image") return `<img src="${escapeHtmlForPrint(seg.url)}" alt="${escapeHtmlForPrint(seg.alt)}" />`;
          if (seg.type === "link")
            return `<a href="${escapeHtmlForPrint(seg.value)}">${escapeHtmlForPrint(seg.value)}</a>`;
          return escapeHtmlForPrint(seg.value);
        })
        .join("");
      html += `<div class="b">${bodyHtml}</div>`;
      if (e.tags.length) html += `<div class="t">${e.tags.map(escapeHtmlForPrint).join(" · ")}</div>`;
      html += "</article>";
    }

    w.document.write(
      `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Bitácora TI</title><style>${css}</style></head><body>${html}<script>window.onload=function(){setTimeout(function(){window.print();},250);}<\/script></body></html>`
    );
    w.document.close();
  }

  if (loading) return <p className="empty-state">Cargando documentación...</p>;
  if (error) return <div className="status-screen error">Error al cargar la documentación: {error}</div>;

  return (
    <div className="docs-layout">
      <aside className="docs-rail panel">
        <div className="docs-rail-label">Categorías</div>
        <ul className="docs-rail-list">
          <li>
            <button
              className={activeCategory === "todas" ? "active" : ""}
              onClick={() => setActiveCategory("todas")}
            >
              <span>Todas</span>
              <span className="docs-rail-count">{entries.length}</span>
            </button>
          </li>
          {allCategories.map((cat) => (
            <li key={cat}>
              <button className={activeCategory === cat ? "active" : ""} onClick={() => setActiveCategory(cat)}>
                <span>{cat}</span>
                <span className="docs-rail-count">{categoryCounts.get(cat) ?? 0}</span>
              </button>
            </li>
          ))}
        </ul>

        <div className="docs-backup">
          <div className="docs-rail-label">Respaldo</div>
          <button className="action-button doc-full-width" onClick={exportJson}>
            ⬇️ Exportar .json
          </button>
          <button className="action-button doc-full-width" onClick={() => setShowImport(true)}>
            ⬆️ Importar .json
          </button>
          <button className="action-button doc-full-width" onClick={printPdf}>
            🖨️ Exportar a PDF
          </button>
        </div>
      </aside>

      <section className="docs-main">
        <div className="docs-toolbar">
          <input
            type="text"
            className="docs-search"
            placeholder="Buscar en todo (título, notas, etiquetas, usuario...)"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button className="action-button action-button-primary" onClick={openNew}>
            + Nueva entrada
          </button>
        </div>

        <div className="docs-listhead">
          <h2>{activeCategory === "todas" ? "Todas las entradas" : activeCategory}</h2>
          <span className="docs-listcount">
            {filteredEntries.length} {filteredEntries.length === 1 ? "entrada" : "entradas"}
            {query && " · filtrando"}
          </span>
        </div>

        {filteredEntries.length === 0 ? (
          <div className="empty-state">
            {query
              ? `Sin resultados para "${query}".`
              : entries.length
                ? "No hay entradas en esta categoría todavía."
                : "Tu bitácora está vacía. Crea la primera entrada."}
          </div>
        ) : (
          <div className="docs-cards">
            {filteredEntries.map((e) => (
              <article key={e.id} className="docs-card" onClick={() => setViewingEntry(e)}>
                <div className="docs-card-top">
                  <h3>
                    {highlightSegments(e.title, query).map((seg, i) =>
                      seg.match ? <mark key={i}>{seg.text}</mark> : <span key={i}>{seg.text}</span>
                    )}
                  </h3>
                  <span className={`chip${e.cred_ref ? " chip-cred" : ""}`}>{e.category || "Otros"}</span>
                </div>
                <div className="docs-card-meta">
                  <span>actualizado {formatDocDate(e.updated_at)}</span>
                  {e.username && <span><b>usuario</b> {e.username}</span>}
                  {e.url && <span><b>url</b> {e.url.replace(/^https?:\/\//, "")}</span>}
                  {e.cred_ref && <span><b>credencial</b> {e.cred_ref}</span>}
                  {e.body && new RegExp(IMAGE_MARKDOWN_RE).test(e.body) && <span>📷 con imágenes</span>}
                </div>
                {e.body && (
                  <p className="docs-card-preview">
                    {highlightSegments(stripImageMarkdown(e.body).slice(0, 220), query).map((seg, i) =>
                      seg.match ? <mark key={i}>{seg.text}</mark> : <span key={i}>{seg.text}</span>
                    )}
                  </p>
                )}
                {e.tags.length > 0 && (
                  <div className="doc-tags">
                    {e.tags.map((t) => (
                      <span key={t} className="tag">
                        {t}
                      </span>
                    ))}
                  </div>
                )}
              </article>
            ))}
          </div>
        )}
      </section>

      {showEditor && (
        <DocEditorModal
          entry={editingEntry}
          categories={allCategories}
          saving={saving}
          onSave={handleSave}
          onDelete={handleDelete}
          onClose={() => {
            setShowEditor(false);
            setEditingEntry(null);
          }}
        />
      )}

      {viewingEntry && !showEditor && (
        <DocDetailModal entry={viewingEntry} onEdit={() => openEdit(viewingEntry)} onClose={() => setViewingEntry(null)} />
      )}

      {showImport && <DocImportModal onImport={importJsonText} onClose={() => setShowImport(false)} />}
    </div>
  );
}
