// Read only register page. Talks to the same REST API that the docs describe.
const state = { q: '', status: '', discipline: '' };

const $ = (sel) => document.querySelector(sel);
const rowsEl = $('#rows');

const badgeClass = (status) => status.toLowerCase().replace(/\s+/g, '');

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// "2026-09-07" or a full timestamp becomes "07 Sep 2026".
function formatDate(iso) {
  if (!iso) return '-';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d} ${MONTHS[Number(m) - 1]} ${y}`;
}

function queryString(extra = {}) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries({ ...state, ...extra })) {
    if (value !== '' && value !== undefined) params.set(key, value);
  }
  return params.toString();
}

async function getJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return res.json();
}

async function loadStats() {
  const stats = await getJson('/api/stats');
  document.querySelectorAll('[data-key]').forEach((el) => {
    const key = el.dataset.key;
    el.textContent = key === 'total' ? stats.total : stats.by_status[key];
  });
}

async function loadDocuments() {
  const { data, total } = await getJson(`/api/documents?${queryString({ limit: 100, sort: 'doc_no' })}`);
  rowsEl.innerHTML = data
    .map(
      (d) => `
      <tr data-id="${d.id}" tabindex="0">
        <td class="docno" data-label="Document No">${escapeHtml(d.doc_no)}</td>
        <td class="title" data-label="Title">${escapeHtml(d.title)}<span class="originator">${escapeHtml(d.originator)}</span></td>
        <td data-label="Discipline">${escapeHtml(d.discipline)}</td>
        <td data-label="Type">${escapeHtml(d.type)}</td>
        <td class="rev" data-label="Rev">${escapeHtml(d.current_rev)}</td>
        <td data-label="Status"><span class="badge ${badgeClass(d.status)}">${escapeHtml(d.status)}</span></td>
        <td class="updated" data-label="Updated">${formatDate(d.updated_at)}</td>
      </tr>`
    )
    .join('');
  $('#empty').hidden = data.length > 0;
  $('#count').textContent = `Showing ${data.length} of ${total} documents`;
  $('#export').href = `/api/documents/export.csv?${queryString()}`;
}

async function showDetail(id) {
  const doc = await getJson(`/api/documents/${id}`);
  const revisions = doc.revisions
    .slice()
    .reverse()
    .map(
      (r) => `
      <li>
        <div class="rev-head"><strong>${escapeHtml(r.rev)}</strong><span class="badge ${badgeClass(r.status)}">${escapeHtml(r.status)}</span></div>
        <div class="rev-dates">Submitted ${formatDate(r.submitted_on)}${r.reviewed_on ? ` &middot; Reviewed ${formatDate(r.reviewed_on)}` : ''}</div>
        ${r.remarks ? `<p>${escapeHtml(r.remarks)}</p>` : ''}
      </li>`
    )
    .join('');
  $('#detail-body').innerHTML = `
    <p class="docno">${escapeHtml(doc.doc_no)}</p>
    <h2>${escapeHtml(doc.title)}</h2>
    <p class="meta">${escapeHtml(doc.discipline)} &middot; ${escapeHtml(doc.type)} &middot; ${escapeHtml(doc.originator)}</p>
    <h3>Revision history</h3>
    <ol class="revisions">${revisions}</ol>`;
  $('#detail').showModal();
}

// Small delay so typing does not fire a request on every key.
let timer;
$('#q').addEventListener('input', (e) => {
  clearTimeout(timer);
  timer = setTimeout(() => {
    state.q = e.target.value.trim();
    loadDocuments();
  }, 200);
});

$('#discipline').addEventListener('change', (e) => {
  state.discipline = e.target.value;
  loadDocuments();
});

$('#chips').addEventListener('click', (e) => {
  const chip = e.target.closest('.chip');
  if (!chip) return;
  document.querySelectorAll('.chip').forEach((c) => c.classList.toggle('active', c === chip));
  state.status = chip.dataset.status;
  loadDocuments();
});

rowsEl.addEventListener('click', (e) => {
  const row = e.target.closest('tr[data-id]');
  if (row) showDetail(row.dataset.id);
});
rowsEl.addEventListener('keydown', (e) => {
  const row = e.target.closest('tr[data-id]');
  if (row && e.key === 'Enter') showDetail(row.dataset.id);
});

getJson('/api/health')
  .then((h) => ($('#project').textContent = h.project))
  .catch(() => {});
loadStats();
loadDocuments();
