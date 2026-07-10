-- Habilita Supabase Realtime en tickets para que el dashboard se actualice
-- solo cuando el bot crea o modifica un ticket, sin necesidad de recargar.
alter publication supabase_realtime add table public.tickets;
