// Module pour gérer les enfants via l'API

async function fetchEnfants() {
  return await req('/api/children');
}

export async function renderEnfants() {
  const section = qs('#filter-section').value;
  const all = await fetchEnfants();
  const list = all.filter(e => !section || e.section === section);
  const tbody = qs('#enfants-tbody');
  if (!list.length) {
    tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;color:#666;">Aucun enfant</td></tr>';
  } else {
    tbody.innerHTML = list.map(e => `
      <tr>
        <td>${escapeHtml(e.nom)}</td>
        <td>${escapeHtml(e.prenom)}</td>
        <td>${escapeHtml(e.age || '')}</td>
        <td>${escapeHtml(e.section)}</td>
        <td>${escapeHtml(e.parent)}</td>
        <td>${escapeHtml(e.telephone)}</td>
        <td></td>
        <td></td>
        <td><button class="btn btn-danger btn-xs" data-action="del-enfant" data-id="${e.id}">Supprimer</button></td>
      </tr>
    `).join('');
  }
  qs('#enfants-count').textContent = String(all.length);
}

function showAddEnfantModal() { qs('#enfant-form').reset(); openModal('#enfant-modal'); }

qs('#enfant-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const nom = qs('#enfant-nom').value.trim();
  const prenom = qs('#enfant-prenom').value.trim();
  const age = parseInt(qs('#enfant-age').value, 10);
  const section = qs('#enfant-section').value;
  const parent = qs('#enfant-parent').value.trim();
  const telephone = qs('#enfant-telephone').value.trim();
  await req('/api/children', {
    method: 'POST',
    body: JSON.stringify({ nom, prenom, age, section, parent, telephone })
  });
  hideAllModals();
  renderEnfants();
});

document.body.addEventListener('click', async (e) => {
  const delBtn = e.target.closest('button[data-action="del-enfant"]');
  if (delBtn) {
    const id = Number(delBtn.dataset.id);
    await req(`/api/children/${id}`, { method: 'DELETE' });
    renderEnfants();
  }
});

window.renderEnfants = renderEnfants;
window.showAddEnfantModal = showAddEnfantModal;
window.filterEnfantsBySection = renderEnfants;

renderEnfants();
