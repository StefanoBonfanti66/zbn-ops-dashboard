# Current Focus

**Completed:**
- ✅ Fixed normalizeName regex bug (/^[a-z0-9_]+/g) to support underscore project names (es. gestione_spese_famiglia)
- ✅ Implemented sync-from-projects.mjs fully: reads all 5 JSON sources, regenerates portfolio-summary.json, validates data integrity
- ✅ Unified dashboard view in app/index.html + app.js + app.css with KPI grid, Progetti catalog (search/filter/copy), Follow-up table, Commercial flags
- ✅ Verified app builds with `node scripts/build-pages.mjs` and serving with `npx serve build`
- ✅ Sync dashboard functional: all 5 JSON files validated, 1 project enriched from projects-index.json

**Next Steps:**
- 🔄 Backfill other anagrafica contacts (fornitori B2B)
- 🔄 Context recovery and existing project integration

**Dashboard Status:**
- App static-only, loads JSON files from zbn-ops-dashboard/scripts/
- Endpoints available via HTTP server

**Architecture:**
- 3 repos: zbn-ops-dashboard (app), dev-control-center (project catalog), opencode-config (commands+agenti+docs)
- Unified view merges projects-index.json + all-projects.json via name-to-slug normalization
- 4 filters: search, priority, machine, state
- Follow-up items displayed with priority badge inline
