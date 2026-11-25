# PinVoice

Assistente clínico multi-dispositivo de captura por voz **ultra-rápido, offline-first e efêmero**.

## Estrutura do Monorepo

- **`web/`** — Web App / PWA (Vite + React + TypeScript + Tailwind CSS + Dexie IndexedDB + `@google/genai` BYOK + Supabase Realtime opcional).
- **`supabase/`** — Migração PostgreSQL (`001_initial_schema.sql`) com tabelas `templates` e `evolutions` (apenas texto), RLS estrito, Realtime e função de TTL LGPD.
- **`android/`** — Projeto Gradle Kotlin DSL multi-módulo (`:shared`, `:app` Android minSdk 26+, `:wear` Wear OS 3+/4+ minSdk 30+) com Jetpack Compose, Room, WorkManager e Wearable Data Layer (`ChannelClient`/`MessageClient`).

## Como rodar o Web App / PWA

```powershell
npm.cmd --prefix web install
npm.cmd --prefix web run dev
```

1. Abra o endereço local no navegador.
2. Clique em **Configurar API Key** e informe sua chave do Google Gemini (`gemini-2.5-flash`).
3. Opcionalmente, conecte seu projeto Supabase após aplicar `supabase/migrations/001_initial_schema.sql`.

## Testes e Build (Web)

```powershell
npm.cmd --prefix web run typecheck
npm.cmd --prefix web test
npm.cmd --prefix web run build
```

## Android & Wear OS

Abra a pasta `android/` no **Android Studio** para sincronizar o Gradle e compilar os módulos `:app` (smartphone) e `:wear` (smartwatch Wear OS).
