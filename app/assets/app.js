async function loadJson(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`Errore caricando ${path}`);
  return res.json();
}

function badge(status) {
  return `<span class="badge ${status}">${status}</span>`;
}

async function init() {
  const [summary, followups, flags] = await Promise.all([
    loadJson('./data/portfolio-summary.json'),
    loadJson('./data/followup-items.json'),
    loadJson('./data/commercial-flags.json')
  ]);

  const kpis = [
    ['Progetti attivi', summary.projects_active],
    ['Urgent', summary.followup_urgent],
    ['Pending', summary.followup_pending],
    ['Snooze', summary.followup_snooze],
    ['Ricavi €', summary.revenue_total_eur],
    ['Fatture', summary.invoices_total]
  ];

  document.getElementById('kpi-grid').innerHTML = kpis.map(([label, value]) => `
    <article class="card">
      <div class="kpi-label">${label}</div>
      <div class="kpi-value">${value}</div>
    </article>
  `).join('');

  document.getElementById('followup-body').innerHTML = followups.map(item => `
    <tr>
      <td>${item.project_slug}</td>
      <td>${item.title}</td>
      <td>${badge(item.status)}</td>
      <td>${item.next_review_at}</td>
      <td>${item.next_action}</td>
    </tr>
  `).join('');

  document.getElementById('flags-list').innerHTML = flags.map(flag => `
    <article class="flag">
      <strong>${flag.project_slug}</strong>
      <div>${badge(flag.risk_level === 'high' ? 'urgent' : 'pending')}</div>
      <p>${flag.reason}</p>
      <p><strong>Azione:</strong> ${flag.action_needed}</p>
    </article>
  `).join('');
}

init().catch(err => {
  document.body.insertAdjacentHTML('beforeend', `<pre style="color:#fca5a5;padding:16px">${err.message}</pre>`);
});
