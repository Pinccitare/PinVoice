# PinVoice

Assistente clínico multi-dispositivo de captura por voz **ultra-rápido, offline-first e efêmero**.

## Arquitetura Atual

- **`web/`** — **Web App / PWA principal (PC e Celular)** em Vite + React + TypeScript + Tailwind CSS v4 + `@google/genai` (streaming ao vivo) + Supabase Realtime + shader `GradientWaves`. Atualiza automaticamente via GitHub → Netlify.
- **`android/` (`:wear` + `:shared`)** — **App nativo Wear OS** (discreto OLED, captura em 1 toque / duplo clique no botão físico, envio direto para Gemini → Supabase).
- **`supabase/`** — Migrações SQL (`001_initial_schema.sql` e `002_personal_mode_no_auth.sql` para modo pessoal direto).

## Comandos (Web / PWA)

```powershell
npm.cmd --prefix web install
npm.cmd --prefix web run dev
npm.cmd --prefix web run typecheck
npm.cmd --prefix web test
npm.cmd --prefix web run build
```
