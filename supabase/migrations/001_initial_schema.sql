-- PinVoice — Schema Inicial (PostgreSQL + RLS + Realtime + TTL LGPD)
-- IMPORTANTE: Este banco armazena APENAS texto processado e templates.
-- Nenhum arquivo de áudio jamais é enviado ou persistido no Supabase.

create extension if not exists "pgcrypto";

-- ============================================================================
-- 1. Tabela de Templates Clínicos (blocos modulares, editáveis e reordenáveis)
-- ============================================================================
create table if not exists public.templates (
  id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  description text default '',
  voice_triggers text[] not null default '{}',
  clinical_keywords text[] not null default '{}',
  -- Array ordenado: [{ id, title, hint, enabled }]
  blocks jsonb not null default '[]'::jsonb,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

-- ============================================================================
-- 2. Tabela de Evoluções Clínicas (apenas texto + Copilot, com TTL LGPD)
-- ============================================================================
create table if not exists public.evolutions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  template_id text not null,
  template_name text not null,
  selection_mode text not null check (selection_mode in ('manual', 'voice', 'auto')),
  patient_label text not null default '',
  -- Mapa { [blockId]: string } contendo apenas blocos preenchidos
  blocks_content jsonb not null default '{}'::jsonb,
  rendered_text text not null default '',
  -- { pendencies: [], alerts: [], medications: [], exams: [] }
  copilot jsonb not null default '{"pendencies":[],"alerts":[],"medications":[],"exams":[]}'::jsonb,
  source_device text not null default 'web' check (source_device in ('web', 'android', 'wear')),
  audio_purged_at timestamptz,
  expires_at timestamptz not null default (now() + interval '24 hours'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_evolutions_user_created
  on public.evolutions (user_id, created_at desc);

create index if not exists idx_evolutions_expires_at
  on public.evolutions (expires_at);

-- ============================================================================
-- 3. Trigger de updated_at automático
-- ============================================================================
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_templates_updated_at on public.templates;
create trigger trg_templates_updated_at
  before update on public.templates
  for each row execute function public.set_updated_at();

drop trigger if exists trg_evolutions_updated_at on public.evolutions;
create trigger trg_evolutions_updated_at
  before update on public.evolutions
  for each row execute function public.set_updated_at();

-- ============================================================================
-- 4. Row Level Security (RLS) estrito por usuário
-- ============================================================================
alter table public.templates enable row level security;
alter table public.evolutions enable row level security;

grant usage on schema public to authenticated;
grant select, insert, update, delete on public.templates, public.evolutions to authenticated;

drop policy if exists "templates_owner_all" on public.templates;
create policy "templates_owner_all"
  on public.templates
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "evolutions_owner_all" on public.evolutions;
create policy "evolutions_owner_all"
  on public.evolutions
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ============================================================================
-- 5. Realtime (sincronização instantânea celular <-> computador)
-- ============================================================================
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'evolutions'
  ) then
    alter publication supabase_realtime add table public.evolutions;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'templates'
  ) then
    alter publication supabase_realtime add table public.templates;
  end if;
end $$;

-- ============================================================================
-- 6. Rotina de TTL / Limpeza LGPD (pode ser chamada via RPC ou pg_cron)
-- ============================================================================
create or replace function public.purge_expired_evolutions()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  deleted_count integer;
begin
  delete from public.evolutions
  where expires_at <= now()
    and (auth.uid() is null or user_id = auth.uid());

  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

grant execute on function public.purge_expired_evolutions() to authenticated;

-- Opcional (caso pg_cron esteja habilitado no seu projeto Supabase):
-- select cron.schedule(
--   'pinvoice-purge-expired',
--   '0 * * * *',
--   $$ delete from public.evolutions where expires_at <= now(); $$
-- );
