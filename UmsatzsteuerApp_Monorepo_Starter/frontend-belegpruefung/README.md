# BelegprüfungsApp (frontend-belegpruefung)

Entwicklungs-Frontend (Vite + React + TypeScript) — Minimal scaffolding für die BelegprüfungsApp.

Lokal starten:

```bash
cd UmsatzsteuerApp_Monorepo_Starter
npm ci
npm -w frontend-belegpruefung run dev
```

Unit Tests:
```bash
npm -w frontend-belegpruefung run test:unit
```

E2E Tests (Playwright):
```bash
# Dev server first
npm -w frontend-belegpruefung run dev &
npm -w frontend-belegpruefung run test:e2e
```

<!-- trigger: test rake -->
