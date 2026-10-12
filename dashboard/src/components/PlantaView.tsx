import { useEffect, useMemo, useState } from "react";
import { Area, supabase, Ticket } from "../supabaseClient";
import { NIVEL_LABEL, TIPO_LABEL, areaColor, areaMatches, ladoArea } from "../planUtils";
import { FloorPlan, Rect } from "./FloorPlan";
import { Focus3D, Plant3D } from "./Plant3D";
import { AreaDraft, AreaEditorModal } from "./AreaEditorModal";

interface PlantaViewProps {
  tickets: Ticket[];
  initialAreaId: number | null;
  onOpenTicket: (ticket: Ticket) => void;
}

type Editor = { isNew: true; draft: AreaDraft } | { isNew: false; id: number; draft: AreaDraft };

function toDraft(area: Area): AreaDraft {
  return {
    nombre: area.nombre,
    nivel: area.nivel,
    tipo: area.tipo,
    x: area.x,
    y: area.y,
    w: area.w,
    h: area.h,
    color: area.color,
    ubicacion: area.ubicacion ?? "",
    encargado: area.encargado ?? "",
    extension: area.extension ?? "",
    notas: area.notas ?? "",
  };
}

// Campos de texto vacíos se guardan como null, igual que los que nunca se llenaron.
function toRow(draft: AreaDraft) {
  return {
    ...draft,
    ubicacion: draft.ubicacion || null,
    encargado: draft.encargado || null,
    extension: draft.extension || null,
    notas: draft.notas || null,
  };
}

export function PlantaView({ tickets, initialAreaId, onOpenTicket }: PlantaViewProps) {
  const [areas, setAreas] = useState<Area[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modo, setModo] = useState<"plano" | "3d">("plano");
  const [nivel, setNivel] = useState<1 | 2>(1);
  const [focus3d, setFocus3d] = useState<Focus3D>("ambas");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(initialAreaId);
  const [editing, setEditing] = useState(false);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [saving, setSaving] = useState(false);

  async function load() {
    const { data, error } = await supabase.from("areas").select("*").order("nivel").order("nombre");
    if (error) setError(error.message);
    else setAreas((data ?? []) as Area[]);
    setLoading(false);
  }

  useEffect(() => {
    load();
    const channel = supabase
      .channel("areas-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "areas" }, () => {
        load();
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Deep link del bot (#area=ID): al cargar, ir a la planta de esa área.
  useEffect(() => {
    if (initialAreaId === null) return;
    const area = areas.find((a) => a.id === initialAreaId);
    if (area) {
      setNivel(area.nivel);
      setSelectedId(area.id);
    }
  }, [areas, initialAreaId]);

  const openTicketsByArea = useMemo(() => {
    const map = new Map<number, Ticket[]>();
    for (const t of tickets) {
      if (!t.area_id || (t.estado !== "abierto" && t.estado !== "en_progreso")) continue;
      map.set(t.area_id, [...(map.get(t.area_id) ?? []), t]);
    }
    return map;
  }, [tickets]);

  const openCounts = useMemo(
    () => new Map(Array.from(openTicketsByArea.entries()).map(([id, list]) => [id, list.length])),
    [openTicketsByArea]
  );

  const matchIds = useMemo(() => {
    if (!query.trim()) return null;
    return new Set(areas.filter((a) => areaMatches(a, query)).map((a) => a.id));
  }, [areas, query]);

  // Al buscar, si lo encontrado está en la otra planta, cambiar a esa planta;
  // si hay un solo resultado, seleccionarlo directamente.
  useEffect(() => {
    if (!matchIds || matchIds.size === 0) return;
    const encontradas = areas.filter((a) => matchIds.has(a.id));
    if (!encontradas.some((a) => a.nivel === nivel)) setNivel(encontradas[0].nivel);
    if (encontradas.length === 1) setSelectedId(encontradas[0].id);
  }, [matchIds]);

  const selected = areas.find((a) => a.id === selectedId) ?? null;

  function selectArea(id: number | null) {
    setSelectedId(id);
    const area = areas.find((a) => a.id === id);
    if (area && modo === "3d" && focus3d !== "ambas") setFocus3d(area.nivel);
  }

  function handleCreate(rect: Rect) {
    setEditor({
      isNew: true,
      draft: {
        nombre: "",
        nivel,
        tipo: "area",
        ...rect,
        color: null,
        ubicacion: "",
        encargado: "",
        extension: "",
        notas: "",
      },
    });
  }

  async function handleChangeRect(id: number, rect: Rect) {
    // Optimista: se mueve en pantalla de inmediato y se guarda detrás.
    setAreas((list) => list.map((a) => (a.id === id ? { ...a, ...rect } : a)));
    const { error } = await supabase.from("areas").update(rect).eq("id", id);
    if (error) {
      alert(`No se pudo guardar la posición: ${error.message}`);
      load();
    }
  }

  async function handleSave(draft: AreaDraft) {
    if (!editor) return;
    setSaving(true);
    const row = toRow(draft);
    const { data, error } = editor.isNew
      ? await supabase.from("areas").insert(row).select().single()
      : await supabase.from("areas").update(row).eq("id", editor.id).select().single();
    setSaving(false);
    if (error) {
      alert(`No se pudo guardar el área: ${error.message}`);
      return;
    }
    await load();
    setEditor(null);
    if (data) {
      setNivel((data as Area).nivel);
      setSelectedId((data as Area).id);
    }
  }

  async function handleDelete() {
    if (!editor || editor.isNew) return;
    const abiertos = openCounts.get(editor.id) ?? 0;
    const aviso = abiertos
      ? `Esta área tiene ${abiertos} ticket(s) abierto(s); quedarán sin área. ¿Eliminarla?`
      : "¿Eliminar esta área del plano? No se puede deshacer.";
    if (!confirm(aviso)) return;
    await supabase.from("areas").delete().eq("id", editor.id);
    setSelectedId(null);
    setEditor(null);
    await load();
  }

  if (loading) return <div className="empty-state">Cargando plano...</div>;
  if (error) return <div className="empty-state">Error al cargar el plano: {error}</div>;

  const listaNivel = areas.filter((a) => a.nivel === nivel && (!matchIds || matchIds.has(a.id)));
  const ticketsDelArea = selected ? openTicketsByArea.get(selected.id) ?? [] : [];

  return (
    <div className="planta-layout">
      <section className="panel planta-main">
        <div className="planta-toolbar">
          <div className="segmented">
            <button className={modo === "plano" ? "active" : ""} onClick={() => setModo("plano")}>
              🗺️ Plano
            </button>
            <button
              className={modo === "3d" ? "active" : ""}
              onClick={() => {
                setModo("3d");
                setEditing(false);
              }}
            >
              🧊 Vista 3D
            </button>
          </div>

          {modo === "plano" ? (
            <div className="segmented">
              <button className={nivel === 1 ? "active" : ""} onClick={() => setNivel(1)}>
                ⬇️ Planta baja
              </button>
              <button className={nivel === 2 ? "active" : ""} onClick={() => setNivel(2)}>
                ⬆️ Planta alta
              </button>
            </div>
          ) : (
            <div className="segmented">
              <button className={focus3d === "ambas" ? "active" : ""} onClick={() => setFocus3d("ambas")}>
                Ambas
              </button>
              <button className={focus3d === 1 ? "active" : ""} onClick={() => setFocus3d(1)}>
                Baja
              </button>
              <button className={focus3d === 2 ? "active" : ""} onClick={() => setFocus3d(2)}>
                Alta
              </button>
            </div>
          )}

          <input
            type="text"
            className="docs-search planta-search"
            placeholder="Buscar área, encargado o extensión…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />

          {modo === "plano" && (
            <button
              className={`action-button${editing ? " action-button-primary" : ""}`}
              onClick={() => setEditing((v) => !v)}
            >
              {editing ? "✓ Terminar edición" : "✏️ Editar plano"}
            </button>
          )}
        </div>

        {editing && (
          <p className="planta-hint">
            Arrastra sobre un espacio vacío para dibujar un área. Arrastra un área para moverla, usa su esquina
            inferior derecha para cambiar el tamaño, o haz clic en ella para editar sus datos. Dibuja con la entrada
            principal abajo.
          </p>
        )}

        <div className="planta-canvas">
          {modo === "plano" ? (
            <FloorPlan
              areas={areas}
              nivel={nivel}
              selectedId={selectedId}
              matchIds={matchIds}
              openCounts={openCounts}
              editing={editing}
              onSelect={selectArea}
              onCreate={handleCreate}
              onChangeRect={handleChangeRect}
              onEdit={(area) => setEditor({ isNew: false, id: area.id, draft: toDraft(area) })}
            />
          ) : (
            <Plant3D
              areas={areas}
              focus={focus3d}
              selectedId={selectedId}
              matchIds={matchIds}
              openCounts={openCounts}
              onSelect={selectArea}
            />
          )}
        </div>

        <div className="planta-legend">
          {(["area", "produccion", "referencia"] as const).map((t) => (
            <span key={t}>
              <i style={{ background: areaColor({ tipo: t, color: null }) }} />
              {TIPO_LABEL[t].split(" (")[0]}
            </span>
          ))}
          <span>
            <i className="legend-badge">n</i>
            Tickets abiertos
          </span>
        </div>
      </section>

      <aside className="panel planta-side">
        {selected ? (
          <div className="area-card">
            <div className="area-card-head">
              <span className="area-card-dot" style={{ background: areaColor(selected) }} />
              <h2>{selected.nombre}</h2>
            </div>
            <div className="doc-tags">
              <span className="tag">{NIVEL_LABEL[selected.nivel]}</span>
              <span className="tag">{ladoArea(selected)}</span>
              <span className="tag">{TIPO_LABEL[selected.tipo].split(" (")[0]}</span>
            </div>
            <dl className="modal-meta area-meta">
              {selected.ubicacion && (
                <>
                  <dt>Cómo llegar</dt>
                  <dd>{selected.ubicacion}</dd>
                </>
              )}
              {selected.encargado && (
                <>
                  <dt>Encargado</dt>
                  <dd>{selected.encargado}</dd>
                </>
              )}
              {selected.extension && (
                <>
                  <dt>Extensión</dt>
                  <dd>{selected.extension}</dd>
                </>
              )}
            </dl>
            {selected.notas && <p className="area-notes">{selected.notas}</p>}

            {selected.tipo !== "referencia" && (
              <>
                <h3 className="area-subtitle">Tickets abiertos ({ticketsDelArea.length})</h3>
                {ticketsDelArea.length === 0 ? (
                  <p className="empty-state">Sin tickets pendientes en esta área.</p>
                ) : (
                  <ul className="area-tickets">
                    {ticketsDelArea.map((t) => (
                      <li key={t.id} onClick={() => onOpenTicket(t)}>
                        <span className={`badge badge-${t.prioridad}`}>#{t.id}</span>
                        <span>{t.descripcion}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}

            <div className="area-card-actions">
              <button
                className="action-button"
                onClick={() => setEditor({ isNew: false, id: selected.id, draft: toDraft(selected) })}
              >
                ✏️ Editar datos
              </button>
              <button className="action-button" onClick={() => setSelectedId(null)}>
                Cerrar
              </button>
            </div>
          </div>
        ) : (
          <>
            <h2>{modo === "3d" ? "Áreas" : NIVEL_LABEL[nivel]}</h2>
            {areas.filter((a) => a.tipo !== "produccion").length === 0 && (
              <p className="empty-state">
                Aún no hay áreas dibujadas. Usa “✏️ Editar plano” y arrastra sobre el plano para agregar la primera.
              </p>
            )}
            <ul className="area-list">
              {(modo === "3d" ? areas.filter((a) => !matchIds || matchIds.has(a.id)) : listaNivel).map((a) => (
                <li key={a.id}>
                  <button onClick={() => selectArea(a.id)}>
                    <span className="area-card-dot" style={{ background: areaColor(a) }} />
                    <span className="area-list-name">{a.nombre}</span>
                    {modo === "3d" && <span className="docs-rail-count">{a.nivel === 1 ? "Baja" : "Alta"}</span>}
                    {(openCounts.get(a.id) ?? 0) > 0 && (
                      <span className="area-list-badge">{openCounts.get(a.id)}</span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </aside>

      {editor && (
        <AreaEditorModal
          initial={editor.draft}
          isNew={editor.isNew}
          saving={saving}
          onSave={handleSave}
          onDelete={handleDelete}
          onClose={() => setEditor(null)}
        />
      )}
    </div>
  );
}
