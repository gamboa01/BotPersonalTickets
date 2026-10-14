# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Sistema de gestión de tickets de TI para la maquila Textyler (antes usado en el colegio Alatina; se reutiliza el mismo proyecto Supabase, restaurado tras haberse pausado), con tres piezas independientes que comparten un único backend Supabase:

1. **Bot de Telegram** (`supabase/functions/telegram-bot/index.ts`) — única interfaz para crear/gestionar tickets. Corre como Supabase Edge Function (Deno), recibe updates de Telegram por webhook.
2. **Dashboard** (`dashboard/`) — app React/Vite publicada en GitHub Pages. Lee tickets (solo lectura) y es el único lugar con escritura directa a la tabla `docs` (módulo de Documentación/bitácora).
3. **Supabase** (`supabase/`) — Postgres + Auth + Storage + Edge Functions. Es el backend completo; no hay servidor propio ni ORM. El dashboard habla directo contra PostgREST vía `@supabase/supabase-js`.

Todo corre en capas gratuitas (Supabase + GitHub Pages); no se usa Railway ni hosting propio. Como el plan gratuito pausa el proyecto tras 7 días sin actividad (así murió la versión anterior), `.github/workflows/keep-alive.yml` hace un ping a PostgREST cada 3 días — no quitarlo.

## Comandos

Todo el desarrollo día a día ocurre dentro de `dashboard/`:

```bash
cd dashboard
npm install
npm run dev       # servidor local de Vite
npm run build     # tsc -b (typecheck) + vite build — usar esto para verificar que compila antes de un commit
npm run preview   # sirve el build de dist/ localmente
```

No hay suite de tests ni linter configurado en el repo.

Para la Edge Function (`supabase/functions/telegram-bot`), el flujo de despliegue es vía Supabase CLI, no hay build local:

```bash
supabase login                                  # requiere SUPABASE_ACCESS_TOKEN si el login por navegador falla
supabase link --project-ref <project-ref>
supabase functions deploy telegram-bot --no-verify-jwt
supabase secrets set TELEGRAM_BOT_TOKEN=... TELEGRAM_WEBHOOK_SECRET=... ADMIN_CHAT_ID=... ALLOWED_USER_IDS=...
```

Las migraciones en `supabase/migrations/*.sql` son secuenciales (`0008_textyler_reset.sql` y `0009_textyler_docs_reset.sql` vaciaron los datos de Alatina (tickets y bitácora) y la 0008 siembra las categorías de TI de Textyler; no volver a correrlas en producción porque borran todo) y se aplican manualmente pegándolas en el SQL Editor de Supabase (o `supabase db push` si el CLI está enlazado) — no hay ORM ni migraciones automáticas en el deploy.

El dashboard se despliega solo: `.github/workflows/deploy-dashboard.yml` compila y publica a GitHub Pages en cada push a `main` que toque `dashboard/**` (o manualmente desde Actions). Necesita los secrets `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` configurados en GitHub.

## Arquitectura

### Modelo de acceso: el dashboard es de solo lectura, salvo contenido propio del dashboard

Todas las tablas (`tickets`, `categorias`, `comentarios`, `adjuntos`) tienen RLS restringido a un único email admin vía `auth.jwt() ->> 'email' = '...'` (ver `0004_dashboard_auth_rls.sql`). Las escrituras reales (crear/actualizar tickets) las hace **solo** la Edge Function del bot, usando la `service_role key` (nunca expuesta al frontend). El dashboard usa la `anon key` y por eso solo puede leer.

Las excepciones son `docs` (Documentación, `0006`), `areas` (croquis, `0011`) y `tecnicos`/`rutinas`/`rutina_registros`/`jornada_semana`/`calendario_excepciones`/`ausencias` (pantalla Hoy, `0012`–`0015`) — ahí el dashboard sí tiene RLS de escritura completa (`for all`), porque ese contenido se edita solo desde el dashboard. El bot solo lee `areas` (para `/areas` y el paso de área en `/nuevo`).

El dashboard escribe en `tickets` solo a través de funciones `security definer` que validan el email admin y dejan comentario en el historial, nunca con RLS: `asignar_ticket()` (0012), `registrar_atencion()` (0015, atenciones pedidas en persona; `reportado_por = 0` marca tickets sin usuario de Telegram) y `resolver_ticket()` (0015, sin aviso por Telegram). La columna de texto `asignado_a` de `0001` quedó sin uso.

Al añadir una tabla nueva, seguir el mismo patrón por defecto (RLS de solo lectura para el dashboard) salvo que el feature sea explícitamente dashboard-only como `docs`.

### El bot de Telegram es una única función grande basada en sesiones

`supabase/functions/telegram-bot/index.ts` (~900 líneas) maneja todo el flujo conversacional con una tabla `bot_sessions` (estado por `telegram_id`, con expiración de 30 min vía `SESSION_TIMEOUT_MS`). El patrón repetido es: comando → (en `/nuevo` y `/registrar`, `startTicketFlow()` pregunta planta → área si hay áreas en el croquis) → pide categoría/prioridad con botones inline → pide texto libre → muestra vista previa editable ("Listo"/"Editar") antes de escribir a la BD → ofrece adjuntar foto (Sí/No).

Puntos a tener en cuenta si se modifica:
- La verificación de dueño de ticket usa `telegram_id` numérico, nunca username (evita que cualquiera adivine `/estado <id>` de otro). El mensaje de error es idéntico para "no existe" y "no te pertenece", para no filtrar existencia de IDs.
- Las fotos se reenvían usando el `file_id` original de Telegram (`sendPhoto`), no se vuelven a subir — evita gastar cuota de Storage al reenviar.
- Acceso por lista blanca: solo los admins de `ADMIN_CHAT_ID` y los usuarios de `ALLOWED_USER_IDS` (ambos admiten varios IDs separados por coma) usan el bot (`isAllowed()`). Las cuentas admin son de la misma persona: los avisos de actividad de usuarios no admin van solo al primer ID (`NOTIFY_ADMIN_ID`), nunca entre admins; se valida en `Deno.serve()` antes del rate limit.
- Rate limiting (`rate_limits` table) y validación del secret del webhook (`X-Telegram-Bot-Api-Secret-Token`) ocurren en `Deno.serve()` antes de despachar a cualquier handler.
- El menú de comandos de Telegram vive en `USER_COMMANDS`/`ADMIN_COMMANDS` y se publica con `/actualizarmenu` (`setMyCommands`), no en BotFather. Al agregar un comando, actualizar esas listas y `helpText()`.
- Este archivo no toca el módulo de Documentación en absoluto — esa función es 100% dashboard + Supabase directo.

### Deep links dashboard → bot

`dashboard/src/telegram.ts` arma links `tg://resolve?domain=...&start=<payload>` para que botones del dashboard abran el bot con una acción precargada (p. ej. `resolver_42`). El payload de `/registrar` va en base64url (`registrarDeepLink`) porque el parámetro `start` de Telegram solo acepta `[A-Za-z0-9_-]` y máx. 64 caracteres — el bot decodifica con `base64UrlDecode()` en `index.ts`. Si se agrega un nuevo deep link con texto libre (acentos/espacios), hay que pasar por ese mismo encode/decode.

### Módulo de Documentación (`docs`)

Diseño deliberado: el contenido va en un solo campo `body` de texto libre, **no** en un esquema de "pasos" estructurado — las imágenes se insertan inline como markdown-lite `![alt](url)` y el texto en negrita como `**texto**`. `dashboard/src/docsUtils.ts` (`parseBodySegments`) es el único parser de ese formato (texto / negrita / link / imagen); cualquier sintaxis nueva de formato debe añadirse ahí y replicarse en los tres consumidores que renderizan `body`: `DocDetailModal.tsx` (vista), `DocEditorModal.tsx` (toolbar de edición/inserción) y `DocsView.tsx` → `printPdf()` (exportación a PDF vía `window.print()`).

Import/export de `docs` es JSON plano (`{"entries": [...]}`), aceptado tanto por archivo como pegado como texto (`DocImportModal.tsx` → `importJsonText()` en `DocsView.tsx`), usando `upsert(..., { onConflict: "id" })`.

### Convenciones del dashboard

- Sin router: navegación por estado (`view: "hoy" | "tickets" | "docs" | "planta"` en `App.tsx`, por defecto `hoy`), sin URLs de subpáginas. Excepciones por hash: `#area=<id>` abre Planta con esa área seleccionada (link "Ver en el plano" de `/areas`, si existe el secret `DASHBOARD_URL`) y `#pantalla` es el modo TV de TI: solo `HoyView` con `kiosk`, letra escalada con `em`/`vw`, sin controles de asignación, y recarga de tickets cada 2 min como respaldo del realtime.
- Pantalla Hoy (`HoyView.tsx`): columnas Sin asignar / una por técnico activo / Resueltos hoy (día de Guatemala). Los tickets nuevos se detectan comparando contra los IDs vistos al montar (`knownIds`), parpadean 90 s y pueden sonar (WebAudio, preferencia en localStorage). Rutinas (`rutinasUtils.ts`, editor en `RutinasModal.tsx`): `diaInfo()` decide si el día es laboral, qué día de la semana aplica (`como_dia` en una reposición) y la hora de salida — primero `calendario_excepciones` de esa fecha, si no `jornada_semana`. Una rutina con `referencia = 'salida'` toma la salida del día + `minutos_salida`; las de hora fija posteriores a la salida no aparecen. En días de descanso no hay rutinas. Responsable rotativo: si `rutinas.rotacion` tiene técnicos, `responsableDelDia()` los turna por días de calendario desde un lunes fijo (`ROTACION_INICIO`). La columna "Hecho hoy" mezcla tickets resueltos y `rutina_registros` del día. Ausencias: `cubrirAusencia()` pasa las rutinas del ausente (desde su hora `desde`, o todo el día) a `cubre_id` o a otro técnico activo. Los pendientes no se cierran solos: siguen en Hoy cada día con la marca "Desde <día>" hasta resolverse.
- Realtime: cada vista (`tickets`, `docs`) se suscribe a su tabla vía `supabase.channel(...).on("postgres_changes", ...)` y recarga con la misma función `load()` que usa el mount inicial.
- Fechas: los tickets se agrupan por día calendario de Guatemala (`timezone.ts` → `gtDayKey`), no por el día local del navegador de quien vea el dashboard — importante para no correr un ticket nocturno al día siguiente.
- Gráficas (`recharts`): se usa barra horizontal (`RankedBarChart.tsx`) en vez de pie chart para comparar categorías/personas — decisión explícita para datasets con muchos segmentos.
- Croquis (`PlantaView.tsx`): las áreas son rectángulos en una cuadrícula de 60 × 30 celdas (`planUtils.ts`, `GRID_W`/`GRID_H`), con la entrada principal abajo. `FloorPlan.tsx` es el plano 2D editable (dibujar/mover/redimensionar con pointer events) y `Plant3D.tsx` la vista isométrica en SVG puro, sin librerías 3D (orden de pintado por eje separador en `paintOrder()`). Si cambia el ancho de la cuadrícula, actualizar también `PLANO_ANCHO` en el bot, que lo usa para decir "lado izquierdo/derecho".
- Compresión de imágenes en cliente antes de subir a Storage: `imageUtils.ts` (`resizeImageFile`, Canvas API) — replica en el navegador lo que el bot hace server-side con `imagescript`, para no gastar la cuota gratuita de Storage.
