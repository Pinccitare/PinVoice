-- PinVoice — Migração 002: Modo Pessoal Simplificado (Sem Auth, Sem RLS, Sem TTL 24h)
-- Permite que Relógio (Wear OS), Web (Netlify) e Celular sincronizem direto
-- sem login/senha, sem expiração de token e sem apagar histórico automaticamente.

-- 1. Remove obrigatoriedade de user_id autenticado (usa UUID fixo pessoal como default)
alter table public.evolutions
  drop constraint if exists evolutions_user_id_fkey;

alter table public.evolutions
  alter column user_id set default '00000000-0000-0000-0000-000000000001'::uuid;

alter table public.templates
  drop constraint if exists templates_user_id_fkey;

alter table public.templates
  alter column user_id set default '00000000-0000-0000-0000-000000000001'::uuid;

-- 2. Desabilita RLS e libera leitura/escrita direta pela chave do projeto (anon + authenticated)
alter table public.evolutions disable row level security;
alter table public.templates disable row level security;

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on public.evolutions, public.templates to anon, authenticated;
