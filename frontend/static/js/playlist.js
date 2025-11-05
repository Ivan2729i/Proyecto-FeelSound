// frontend/static/js/playlists.js
// Híbrido: si hay backend (window.API.v1Base) usa la API REST (/api/v1),
// si no, funciona 100% front-only con LocalStorage.

document.addEventListener('DOMContentLoaded', () => {
  const view = document.getElementById('view-playlists');
  if (!view) return;

  const listWrap = document.getElementById('pl-list');
  const emptyBox = document.getElementById('pl-empty');

  // ====== Detección/override de backend ======
  // Puedes forzar con window.FEEL?.env?.USE_BACK = true/false si quieres.
  const ENV = (window.FEEL && window.FEEL.env) || {};
  const HAS_BACK = !!window.API?.v1Base;
  const USE_BACK = (typeof ENV.USE_BACK === 'boolean') ? ENV.USE_BACK : HAS_BACK;

  // ====== Store front-only (LocalStorage) ======
  const LS_KEY = 'fs_playlists_v1';

  function ls_getAll() {
    try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]'); }
    catch { return []; }
  }
  function ls_setAll(arr) {
    localStorage.setItem(LS_KEY, JSON.stringify(arr || []));
  }
  function ls_delete(id) {
    const all = ls_getAll().filter(p => String(p.id) !== String(id));
    ls_setAll(all);
  }
  function ls_seedIfEmpty() {
    const cur = ls_getAll();
    if (cur.length) return;
    const now = new Date().toISOString();
    ls_setAll([
      {
        id: 1,
        name: 'Focus Beats',
        description: 'Lo-fi / focus',
        created_at: now,
        tracks: [
          { title: 'Deep Work',  artists: ['DJ Focus'],  duration_ms: 148000, cover_url: '' },
          { title: 'Study Flow', artists: ['Lofi Lab'],  duration_ms: 165000, cover_url: '' },
        ]
      },
      {
        id: 2,
        name: 'Workout Hits',
        description: 'Energía para el gym',
        created_at: now,
        tracks: []
      }
    ]);
  }

  // ====== Cliente REST (usa helpers de config.js) ======
  async function api_list() {
    // GET /api/v1/playlists/
    return window.apiFetchV1('/playlists/', { headers: { Accept: 'application/json' } });
  }
  async function api_delete(id) {
    // DELETE /api/v1/playlists/:id/
    await window.apiFetchV1(`/playlists/${id}/`, { method: 'DELETE' });
    return true;
  }

  // ====== Router ======
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
    if (show) view.removeAttribute('hidden'); else view.setAttribute('hidden', '');
  }

  // ====== UI ======
  function fmtTime(ms) {
    if (!ms && ms !== 0) return '--:--';
    const total = Math.round(ms / 1000);
    const m = Math.floor(total / 60);
    const s = `${total % 60}`.padStart(2, '0');
    return `${m}:${s}`;
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
            <p class="text-white/60 text-sm truncate">${Array.isArray(t.artists) ? t.artists.join(', ') : (t.artists || '')}</p>
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
      let data = [];
      if (USE_BACK) {
        // Si la API falla, caemos al modo local sin romper la UI
        try {
          data = await api_list(); // ← debe devolver array de playlists
        } catch (e) {
          console.warn('[Playlists] API caída, usando LocalStorage:', e);
          ls_seedIfEmpty();
          data = ls_getAll();
        }
      } else {
        ls_seedIfEmpty();
        data = ls_getAll();
      }

      if (!Array.isArray(data) || data.length === 0) {
        listWrap.innerHTML = '';
        emptyBox.classList.remove('hidden');
        return;
      }

      listWrap.innerHTML = data.map(renderCard).join('');
      bindPlaylistButtons();
    } catch (err) {
      listWrap.innerHTML = `
        <div class="rounded-2xl bg-white/5 border border-white/10 p-6 text-red-300">
          Error al cargar playlists: ${err.message || err}
        </div>
      `;
    }
  }

  function bindPlaylistButtons() {
    // Eliminar
    document.querySelectorAll('[data-pl-del]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.plDel;
        if (!confirm('¿Eliminar esta playlist?')) return;
        try {
          if (USE_BACK) {
            try {
              await api_delete(id);
            } catch (e) {
              // Si el back falla, no dejes la UI muerta
              alert('No se pudo eliminar en el servidor. Intentaremos local.');
              ls_delete(id);
            }
          } else {
            ls_delete(id);
          }
          renderPlaylists();
        } catch (err) {
          alert('Error eliminando playlist: ' + (err.message || err));
        }
      });
    });

    // Agregar (placeholder – integra tu modal/flujo)
    document.querySelectorAll('[data-pl-add]').forEach(btn => {
      btn.addEventListener('click', () => {
        alert('Aquí va tu modal/form para agregar canciones a la playlist (front-only o contra API).');
      });
    });

    // Compartir
    document.querySelectorAll('[data-pl-share]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.plShare;
        const url = `${location.origin}${location.pathname}#/playlists/${id}`;
        navigator.clipboard.writeText(url).then(() => {
          alert('Enlace copiado al portapapeles.');
        });
      });
    });
  }
});
