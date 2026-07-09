async function loadJson(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`Errore caricando ${path}`);
  return res.json();
}

function badge(status) {
  return `<span class="badge ${status}">${status}</span>`;
}

function normalizeName(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function showToast(message) {
  const toast = document.getElementById("toast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => toast.classList.remove("show"), 1800);
}

async function copyText(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {}
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch { return false; }
}

function renderKpi(summary) {
  const kpis = [
    ["Progetti attivi", summary.projects_active],
    ["Urgent", summary.followup_urgent],
    ["Pending", summary.followup_pending],
    ["Snooze", summary.followup_snooze],
    ["Ricavi €", summary.revenue_total_eur],
    ["Fatture", summary.invoices_total],
  ];
  document.getElementById("kpi-grid").innerHTML = kpis.map(([label, value]) => `
    <article class="card">
      <div class="kpi-label">${label}</div>
      <div class="kpi-value">${value}</div>
    </article>
  `).join("");
}

function createProjectActions(p) {
  const buttons = [];
  if (p.github_url) {
    buttons.push(`<a href="${p.github_url}" target="_blank" rel="noopener">GitHub</a>`);
  }
  if (p.local_path_guess) {
    buttons.push(`<button data-copy="cd ${p.local_path_guess}">Copy cd</button>`);
  }
  if (p.project_where_command) {
    buttons.push(`<button data-copy="${p.project_where_command}">Copy where</button>`);
  }
  if (p.opencode_command) {
    buttons.push(`<button data-copy="${p.opencode_command}">Copy opencode</button>`);
  }
  return `<div class="actions">${buttons.join("")}</div>`;
}

function buildProjectList(projectsIndex, allProjects) {
  const map = {};
  for (const p of projectsIndex) {
    map[p.slug] = { ...p, _source: "zbn", _matched: true };
  }
  for (const p of allProjects) {
    const slug = normalizeName(p.name);
    if (map[slug] && map[slug]._source === "zbn") {
      Object.assign(map[slug], {
        machine: p.machine,
        github_url: p.github_url || map[slug].github_url,
        local_path_guess: p.local_path_guess,
        opencode_command: p.opencode_command,
        project_where_command: p.project_where_command,
      });
    } else {
      map[slug] = {
        slug,
        name: p.name,
        state: p._state || "unknown",
        priority: p.priority || "medium",
        phase: p._phase || "-",
        next_action: p.next_action || "-",
        machine: p.machine || "-",
        github_url: p.github_url || "",
        local_path_guess: p.local_path_guess || "",
        opencode_command: p.opencode_command || "",
        project_where_command: p.project_where_command || "",
        _source: "all",
        _matched: false,
      };
    }
  }
  return Object.values(map);
}

function renderProjects(projects) {
  const tbody = document.getElementById("projects-body");
  if (!projects.length) {
    tbody.innerHTML = `<tr><td colspan="7" class="muted">Nessun progetto trovato</td></tr>`;
    return;
  }
  tbody.innerHTML = projects.map((p) => `
    <tr>
      <td><strong>${p.name || p.slug}</strong>${p._matched ? "" : ` <span class="muted">(non ZBN)</span>`}</td>
      <td>${badge(p.state || "unknown")}</td>
      <td>${p.priority ? badge(p.priority) : "-"}</td>
      <td>${p.phase || "-"}</td>
      <td>${p.next_action || "-"}</td>
      <td>${p.machine || "-"}</td>
      <td>${createProjectActions(p)}</td>
    </tr>
  `).join("");
}

function setupProjectFilters(projects) {
  const search = document.getElementById("search");
  const priority = document.getElementById("priority-filter");
  const machine = document.getElementById("machine-filter");
  const state = document.getElementById("state-filter");

  function apply() {
    const q = (search.value || "").toLowerCase();
    const pv = priority.value;
    const mv = machine.value;
    const sv = state.value;

    const filtered = projects.filter((p) => {
      const haystack = ((p.name || p.slug) + " " + (p.next_action || "")).toLowerCase();
      if (q && !haystack.includes(q)) return false;
      if (pv && p.priority !== pv) return false;
      if (mv && p.machine !== mv) return false;
      if (sv && p.state !== sv) return false;
      return true;
    });
    renderProjects(filtered);
  }

  search.addEventListener("input", apply);
  priority.addEventListener("change", apply);
  machine.addEventListener("change", apply);
  state.addEventListener("change", apply);
  return apply;
}

function renderFollowups(followups) {
  const tbody = document.getElementById("followup-body");
  if (!followups.length) {
    tbody.innerHTML = `<tr><td colspan="6" class="muted">Nessun follow-up aperto</td></tr>`;
    return;
  }
  tbody.innerHTML = followups.map((item) => `
    <tr>
      <td>${item.project_slug}</td>
      <td>${item.title}</td>
      <td>${badge(item.status)}</td>
      <td>${badge(item.priority)}</td>
      <td>${item.next_review_at}</td>
      <td>${item.next_action}</td>
    </tr>
  `).join("");
}

function renderFlags(flags) {
  const el = document.getElementById("flags-list");
  if (!flags.length) {
    el.innerHTML = `<p class="muted">Nessun flag commerciale attivo</p>`;
    return;
  }
  el.innerHTML = flags.map((flag) => {
    const riskClass = flag.risk_level === "high" ? "risk-high" : flag.risk_level === "medium" ? "risk-medium" : "risk-low";
    return `
    <article class="flag">
      <strong>${flag.project_slug}</strong>
      <div><span class="${riskClass}">${badge(flag.risk_level === "high" ? "urgent" : "pending")}</span></div>
      <p>${flag.reason}</p>
      <p><strong>Azione:</strong> ${flag.action_needed}</p>
    </article>`;
  }).join("");
}

async function init() {
  const [summary, projectsIndex, allProjects, followups, flags] = await Promise.all([
    loadJson("./data/portfolio-summary.json"),
    loadJson("./data/projects-index.json"),
    loadJson("./data/all-projects.json"),
    loadJson("./data/followup-items.json"),
    loadJson("./data/commercial-flags.json"),
  ]);

  renderKpi(summary);

  const merged = buildProjectList(projectsIndex, allProjects);
  const applyFilters = setupProjectFilters(merged);
  applyFilters();

  document.getElementById("projects-body").addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-copy]");
    if (!btn) return;
    const ok = await copyText(btn.dataset.copy);
    showToast(ok ? "Copiato" : "Copia non riuscita");
  });

  renderFollowups(Array.isArray(followups) ? followups : followups?.items ?? []);
  renderFlags(Array.isArray(flags) ? flags : []);
}

init().catch((err) => {
  document.body.insertAdjacentHTML("beforeend", `<pre style="color:#fca5a5;padding:16px">${err.message}</pre>`);
});
