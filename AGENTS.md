# Current Focus

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
- 🔄 Backfill other anagrafica contacts (fornitori B2B)
- 🔄 Context recovery and existing project integration

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
