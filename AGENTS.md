# Current Focus

**Completed (2026-09-24):**
- ✅ Sync dati + feature pubblicati su main — commit `bfaa068` "feat(dashboard): sync dati, copy overview/docs, nuovi progetti e agis-lab" (6 file, +72/−20). Contenuto: nuovi bottoni "Copy overview"/"Copy docs" in `app/assets/app.js`; `overview_note`+`docs_path` aggiunti a 4 progetti in `projects-index.json` + nuovi progetti `nuovo-sito-vetronaviglio` e `agis-lab`; schema JSON esteso; `sync-from-projects.mjs` propaga i 2 campi; `followup` aggiornati (Magie su Excel, Cartiglio).
- ✅ Deploy pipeline verificata end-to-end — push su main → GitHub Pages auto-deploy (`pages.yml`) confermato live (run in_progress → success). Live `dashboard.zetabytenexus.it` serve `data/projects-index.json` con i nuovi progetti. Domain custom verified (cert fino 2026-11-30), cron nightly `refresh-data.yml` attivo (00:01 UTC).
- ✅ Diagnosi "non vedo gli aggiornamenti": il meccanismo push→deploy funzionava già; il motivo era commit locali mai pushati + main locale 35 commit dietro origin/main (cron nightly). Risolto con rebase + merge manuale dei conflitti su `app/data/*` (tenuti `last_commit` aggiornati dal cron + arricchimento locale).
- ✅ Deploy da push riattivato: era rimasto "workflow_run-only" da 2026-08-05; ora nuovo push deploy success 2026-09-24.

**Completed (2026-07-23):**
- ✅ Fixed normalizeName regex bug (`app/assets/app.js:12`): `[^a-z0-9]+` → `[^a-z0-9_]+` to preserve underscores in slugs (e.g. `gestione_spese_famiglia`)
- ✅ Implemented `sync-from-projects.mjs` fully: reads all 5 JSON sources, regenerates portfolio-summary.json, validates data integrity
- ✅ Unified dashboard view in `app/index.html` + `app.js` + `app.css` with KPI grid, Progetti catalog (search/filter/copy), Follow-up table, Commercial flags
- ✅ Verified app builds with `node scripts/build-pages.mjs` and serving with `npx serve build`
- ✅ Sync dashboard functional: all 5 JSON files validated, 1 project enriched from projects-index.json
- ✅ Added missing project `vetronaviglio-tracking-mvp` to `projects-index.json` (€10,200 revenue, 1 invoice paid, ledger "operativo", risk "low")
- ✅ Created automation script `scripts/dashboard-add-project.mjs <slug> [name] [phase] [state]` to add new projects to dashboard index
- ✅ Extended `/new-project` command (opencode-config) with step 7 to auto-update dashboard index on new project creation
- ✅ Resolved GitHub Pages deploy conflicts (local ahead of remote), pushed to main → auto-deploy via `pages.yml`

**Next Steps:**
- 🔄 Verificare che il deploy push→Pages continui a funzionare dopo il commit `bfaa068` e che il cron nightly non crei nuovi disallineamenti su `app/data/*`
- 🔄 Backfill other anagrafica contacts (fornitori B2B)
- 🔄 Context recovery and existing project integration
- 🔄 Email per Chiara Garramone (blocco TDS vetronaviglio-tds-automation): serve l'indirizzo email per creare la bozza Gmail "Specifiche TDS 2.0 implementate e pubblicate"

**Dashboard Status:**
- App static-only, loads JSON files from zbn-ops-dashboard/scripts/
- Endpoints available via HTTP server
- GitHub Pages auto-deploys on push to main

**Architecture:**
- 3 repos: zbn-ops-dashboard (app), dev-control-center (project catalog), opencode-config (commands+agenti+docs)
- Unified view merges projects-index.json + all-projects.json via name-to-slug normalization
- 4 filters: search, priority, machine, state
- Follow-up items displayed with priority badge inline
- `projects-index.json` = manual source of truth for ZBN projects (nightly cron only UPDATES existing)
- New projects added to index automatically via `/new-project` → `dashboard-add-project.mjs`
