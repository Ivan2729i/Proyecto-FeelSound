// === Mis Playlists ===
document.addEventListener('DOMContentLoaded', () => {

  const API_BASE = '/api/v1';
  const view = document.getElementById('view-playlists');
  if (!view) return;

  const listWrap = document.getElementById('pl-list');
  const emptyBox = document.getElementById('pl-empty');

  // === Router Hook ===
  window.addEventListener('hashchange', handleRoute);
  handleRoute();

  function handleRoute() {
    const hash = (location.hash || '').replace('#/', '');
    if (hash === 'playlists') {
      showSection(true);
      renderPlaylists();
    } else {
      showSection(false);
    }
  }

  function showSection(show) {
    if (show) view.removeAttribute('hidden');
    else view.setAttribute('hidden', '');
  }

  // === Lógica principal ===
  async function renderPlaylists() {
    listWrap.innerHTML = `
      <div class="rounded-2xl bg-white/5 border border-white/10 p-6 animate-pulse">
        <div class="h-5 w-40 bg-white/10 rounded mb-4"></div>
        <div class="space-y-2">
          <div class="h-14 bg-white/5 rounded"></div>
          <div class="h-14 bg-white/5 rounded"></div>
          <div class="h-14 bg-white/5 rounded"></div>
        </div>
      </div>
    `;
    emptyBox.classList.add('hidden');

    try {
      const res = await fetch(`${API_BASE}/playlists/`, {
        headers: { 'X-Requested-With': 'XMLHttpRequest' },
        credentials: 'same-origin'
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (!data || !data.length) {
        listWrap.innerHTML = '';
        emptyBox.classList.remove('hidden');
        return;
      }
      listWrap.innerHTML = data.map(pl => renderCard(pl)).join('');
      bindPlaylistButtons();
    } catch (err) {
      listWrap.innerHTML = `
        <div class="rounded-2xl bg-white/5 border border-white/10 p-6 text-red-300">
          Error al cargar playlists: ${err.message}
        </div>
      `;
    }
  }

  function renderCard(pl) {
    const created = pl.created_at ? new Date(pl.created_at).toLocaleDateString('es-MX') : '';
    const items = (pl.tracks || []).slice(0, 6).map((t, i) => `
      <div class="flex justify-between items-center bg-white/5 hover:bg-white/10 transition rounded-lg p-3">
        <div class="flex items-center gap-3 min-w-0">
          <span class="w-5 text-white/50 tabular-nums">${i + 1}</span>
          <img src="${t.cover_url || ''}" alt="" class="w-12 h-12 rounded-md bg-white/10 object-cover">
          <div class="min-w-0">
            <p class="text-white truncate">${t.title || '—'}</p>
            <p class="text-white/60 text-sm truncate">${(t.artists || []).join(', ')}</p>
          </div>
        </div>
        <span class="text-white/50 text-sm">${fmtTime(t.duration_ms)}</span>
      </div>
    `).join('');

    return `
      <article class="rounded-2xl bg-white/5 backdrop-blur border border-white/10 p-6">
        <div class="flex items-start justify-between gap-4 mb-4">
          <div>
            <a href="#/playlists/${pl.id}" class="text-xl font-semibold text-white hover:underline">${pl.name}</a>
            ${pl.description ? `<p class="text-white/60 text-sm">${pl.description}</p>` : ''}
            ${created ? `<p class="text-white/40 text-xs mt-1">Creada el ${created}</p>` : ''}
          </div>
          <div class="flex items-center gap-2">
            <button class="p-2 rounded-lg hover:bg-white/10" title="Agregar canciones" data-pl-add="${pl.id}">
              <svg class="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M11 11V6h2v5h5v2h-5v5h-2v-5H6v-2z"/></svg>
            </button>
            <button class="p-2 rounded-lg hover:bg-white/10" title="Compartir" data-pl-share="${pl.id}">
              <svg class="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M14 9l6 6m0 0l-6 6m6-6H8"/></svg>
            </button>
            <button class="p-2 rounded-lg hover:bg-red-600/20" title="Eliminar" data-pl-del="${pl.id}">
              <svg class="w-5 h-5 text-red-400" viewBox="0 0 24 24" fill="currentColor"><path d="M6 18L18 6M6 6l12 12"/></svg>
            </button>
          </div>
        </div>
        <div class="space-y-2">${items || `<p class="text-white/60">No hay canciones aún.</p>`}</div>
      </article>
    `;
  }

  function fmtTime(ms) {
    if (!ms && ms !== 0) return '--:--';
    const total = Math.round(ms / 1000);
    const m = Math.floor(total / 60);
    const s = `${total % 60}`.padStart(2, '0');
    return `${m}:${s}`;
  }

  function bindPlaylistButtons() {
    document.querySelectorAll('[data-pl-del]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.plDel;
        if (!confirm('¿Eliminar esta playlist?')) return;
        try {
          const r = await fetch(`${API_BASE}/playlists/${id}/`, {
            method: 'DELETE',
            headers: { 'X-CSRFToken': getCookie('csrftoken') },
            credentials: 'same-origin'
          });
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          renderPlaylists();
        } catch (err) {
          alert('Error eliminando playlist: ' + err.message);
        }
      });
    });
  }

  function getCookie(name) {
    const m = document.cookie.match('(^|;)\\s*' + name + '\\s*=\\s*([^;]+)');
    return m ? m.pop() : '';
  }

});
