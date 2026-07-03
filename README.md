# Sistema de gestión de tickets TI (Bot de Telegram + Supabase + Dashboard)

## Arquitectura

```
Telegram Bot ──(webhook)──> Supabase Edge Function (Deno/TS)
                                      │
                                      ▼
                            Supabase Postgres (BD + RLS)
                                      ▲
                                      │ (lectura, anon key)
                            Dashboard (React/Vite) en GitHub Pages
```

Todo corre en capas gratuitas: Supabase (BD + Edge Functions) y GitHub Pages. No se usa Railway ni ningún servidor propio.

## Estructura del proyecto

```
supabase/
  migrations/0001_init.sql       -> esquema de la base de datos
  functions/telegram-bot/index.ts -> lógica del bot (webhook)
dashboard/                        -> app React que se publica en GitHub Pages
.github/workflows/deploy-dashboard.yml -> compila y publica el dashboard automáticamente
```

---

## 1. Crear el proyecto en Supabase

1. Crea una cuenta y un proyecto en [supabase.com](https://supabase.com) (plan gratuito).
2. En **Project Settings > API** copia:
   - `Project URL`
   - `anon public key`
   - `service_role key` (no la compartas, es de servidor)
3. Ve a **SQL Editor**, pega el contenido de [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql) y ejecútalo. Esto crea las tablas `tickets`, `categorias`, `comentarios`, `bot_sessions` y las políticas de RLS.

## 2. Crear el bot en Telegram

1. Habla con [@BotFather](https://t.me/BotFather) en Telegram y crea un bot con `/newbot`.
2. Guarda el **token** que te entrega.
3. Define un secreto propio (cualquier cadena aleatoria larga) para `TELEGRAM_WEBHOOK_SECRET`; sirve para verificar que las peticiones al webhook realmente vienen de Telegram.

## 3. Desplegar la Edge Function

Necesitas instalar el **CLI de Supabase** (no requiere git, solo Node/Homebrew):

```bash
npm install -g supabase
supabase login
supabase link --project-ref TU_PROJECT_REF   # el ref aparece en la URL del proyecto
```

Configura los secretos que usará la función:

```bash
supabase secrets set TELEGRAM_BOT_TOKEN=xxxx:yyyy
supabase secrets set TELEGRAM_WEBHOOK_SECRET=un-secreto-largo-y-aleatorio
```

> `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` ya están disponibles automáticamente dentro de las Edge Functions, no hace falta configurarlos.

Despliega la función:

```bash
supabase functions deploy telegram-bot --no-verify-jwt
```

Esto te da una URL tipo `https://TU_PROJECT_REF.supabase.co/functions/v1/telegram-bot`.

## 4. Registrar el webhook en Telegram

Ejecuta (reemplazando los valores):

```bash
curl "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook?url=https://TU_PROJECT_REF.supabase.co/functions/v1/telegram-bot&secret_token=<TELEGRAM_WEBHOOK_SECRET>"
```

Prueba escribiéndole a tu bot `/start` o `/nuevo` en Telegram.

## 5. Publicar el dashboard en GitHub Pages (sin usar git localmente)

1. Copia `dashboard/.env.example` a `dashboard/.env` y complétalo con tu `Project URL` y `anon key` (útil si quieres probar en local con `npm run dev`; este archivo no debe subirse).
2. Crea un repositorio nuevo en GitHub (público o privado) desde la web.
3. Dentro del repo, usa **Add file > Upload files** y arrastra todo el contenido de esta carpeta (`supabase/`, `dashboard/`, `.github/`, `README.md`), **excepto** `dashboard/node_modules`, `dashboard/dist` y `dashboard/.env` si llegaste a crearlos.
4. Ve a **Settings > Pages** y en "Build and deployment" selecciona **Source: GitHub Actions**.
5. Ve a **Settings > Secrets and variables > Actions** y crea dos secrets:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
6. Cada vez que subas cambios dentro de `dashboard/` (aunque sea por upload manual, ya que también genera un commit), el workflow `.github/workflows/deploy-dashboard.yml` compila y publica automáticamente el sitio. También puedes lanzarlo a mano desde la pestaña **Actions > Deploy Dashboard to GitHub Pages > Run workflow**.
7. La URL final será `https://tu-usuario.github.io/nombre-del-repo/`.

## Flujo del bot

- `/nuevo` — crea un ticket: selecciona categoría y prioridad con botones, luego pide la descripción.
- `/mistickets` — lista tus tickets abiertos o en progreso.
- `/estado <id>` — detalle de un ticket y su historial.
- `/resolver <id>` — pide una nota y marca el ticket como resuelto.
- `/ayuda` — muestra los comandos disponibles.

## Notas de seguridad

- La `anon key` usada en el dashboard solo tiene permiso de **lectura** (ver políticas RLS en la migración); todas las escrituras las hace la Edge Function con la `service_role key`, que nunca se expone al frontend.
- El webhook valida el header `X-Telegram-Bot-Api-Secret-Token` en cada request antes de procesar nada.
