// ============================================================================
//  FeelSound · Crear Playlist
// ============================================================================

(() => {
  const section  = document.getElementById('view-pl-create');
  if (!section) return;

  // ------- DOM refs -------
  const $name     = document.getElementById('plnew-name');
  const $nameErr  = document.getElementById('plnew-name-err');
  const $desc     = document.getElementById('plnew-desc');
  const $search   = document.getElementById('plnew-search');
  const $results  = document.getElementById('plnew-results');
  const $save     = document.getElementById('plnew-save');
  const $cancelA = document.getElementById('plnew-cancel');
  const $wrapScroll = document.getElementById('plnew-results-scroll') || $results?.parentElement;


  // ------- Estado -------
  const selected = new Map();
  let lastQuery  = '';
  let lastRows   = [];

  // ------- Helpers -------
  const API_ORIGIN =
    (window.API && window.API.origin) ||
    (window.FEEL?.env?.API_BASE?.replace(/\/api(?:\/v1)?\/?$/,'')) ||
    "http://127.0.0.1:8000";

  function getCookie(name) {
    try {
      const m = document.cookie.match('(^|;)\\s*' + name + '\\s*=\\s*([^;]+)');
      return m ? m.pop() : '';
    } catch { return ''; }
  }

  const fmtTime = (ms)=> {
    const t = Math.round((ms||0)/1000); const m = Math.floor(t/60); const s = String(t%60).padStart(2,'0');
    return `${m}:${s}`;
  };

  function flash(type, text){
    try {
      if (window.Flash?.[type]) return window.Flash[type](text);
      if (window.Flash?.show)   return window.Flash.show({ type, text });
    } catch {}
    console.log(`[Flash ${type}]`, text);
  }

  function updateSaveBtn(){
      const ok = ($name.value.trim().length >= 3) && selected.size >= 1;
      if ($save){
        $save.classList.toggle('opacity-60', !ok);
        $save.classList.toggle('pointer-events-none', false);
        $save.setAttribute('aria-disabled', ok ? 'false' : 'true');
      }
  }

  function toggleSelect(track){
    const key = String(track.id);
    if (selected.has(key)) selected.delete(key);
    else selected.set(key, track);
    syncIcons();
    updateSaveBtn();
  }

  function syncIcons(){
    if (!$results) return;
    $results.querySelectorAll('[data-tid]').forEach(node => {
      const tid = node.getAttribute('data-tid');
      const btn = node.querySelector('[data-add]');
      if (!btn) return;
      const isSel = selected.has(String(tid));
      btn.setAttribute('data-selected', isSel ? '1' : '0');
      btn.title = isSel ? 'Quitar' : 'Agregar';
      btn.innerHTML = isSel
        ? `<svg class="w-5 h-5 text-green-400" viewBox="0 0 24 24" fill="currentColor"><path d="M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z"/></svg>`
        : `<svg class="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M11 11V6h2v5h5v2h-5v5h-2v-5H6v-2z"/></svg>`;
    });
  }

  function enforceThreeVisible(){
    if (!$wrapScroll || !$results) return;
    const firstRow = $results.querySelector(':scope > div');
    const gapY = 8;
    if (!firstRow){
      $wrapScroll.style.maxHeight = '180px';
      $wrapScroll.style.overflowY = 'auto';
      return;
    }
    const rowH = firstRow.getBoundingClientRect().height || 64;
    const visible = (rowH * 3) + (gapY * 2);
    $wrapScroll.style.maxHeight = `${Math.round(visible)}px`;
    $wrapScroll.style.overflowY = 'auto';
  }

  function renderResults(list){
    lastRows = Array.isArray(list) ? list : [];
    if (!$results) return;

    if (lastRows.length === 0){
      $results.innerHTML = `<p class="text-white/60 text-sm px-1">Sin resultados. Escribe algo para buscar…</p>`;
      enforceThreeVisible();
      return;
    }

    $results.innerHTML = lastRows.map(t => `
      <div class="flex justify-between items-center bg-white/5 hover:bg-white/10 rounded-lg p-2" data-tid="${t.id}">
        <div class="flex items-center gap-3 min-w-0">
          <button class="p-2 rounded-full hover:bg-white/10" data-add="${t.id}" title="Agregar">
            <svg class="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M11 11V6h2v5h5v2h-5v5h-2v-5H6v-2z"/></svg>
          </button>
          <img src="${t.cover_url||''}" alt="" class="w-10 h-10 rounded-md bg-white/10 object-cover">
          <div class="min-w-0">
            <p class="text-white truncate">${t.title}</p>
            <p class="text-white/60 text-xs truncate">${Array.isArray(t.artists)?t.artists.join(', '):(t.artists||'')}</p>
          </div>
        </div>
        <span class="text-white/50 text-xs">${fmtTime(t.duration_ms)}</span>
      </div>
    `).join('');

    $results.querySelectorAll('[data-add]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-add');
        const track = lastRows.find(x => String(x.id) === String(id));
        if (track) toggleSelect(track);
      });
    });

    syncIcons();
    enforceThreeVisible();
  }

  // ------- Backend -------
  async function searchTracks(q){
    q = (q||'').trim();
    if (!q) return [];
    const url = `${API_ORIGIN.replace(/\/+$/,'')}/api/deezer/search/?type=track&q=${encodeURIComponent(q)}`;
    const r = await fetch(url, { credentials: 'include', headers: { 'Accept':'application/json' }});
    if (!r.ok) return [];
    const data = await r.json().catch(()=>null);
    const rows = Array.isArray(data?.data) ? data.data : [];
    return rows.map(d => ({
      id: d.id,
      title: d.title,
      artists: [d.artist?.name].filter(Boolean),
      duration_ms: (d.duration||0)*1000,
      cover_url: d.album?.cover || d.album?.cover_medium || ''
    }));
  }

  async function createPlaylist(payload){
    const url = `${API_ORIGIN.replace(/\/+$/,'')}/api/v1/playlists/create`;
    const r = await fetch(url, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type':'application/json',
        'Accept':'application/json',
        'X-CSRFToken': getCookie('csrftoken')
      },
      body: JSON.stringify(payload)
    });
    const data = await r.json().catch(()=>null);
    if (!r.ok){
      const msg = (data && (data.error || data.detail)) || 'Error al crear la playlist.';
      const code = r.status;
      throw Object.assign(new Error(msg), { code, data });
    }
    return data;
  }

  // ------- Validación + Guardado -------
  function validateLocal(){
    const errors = [];
    const name = ($name?.value || '').trim();
    if (name.length < 3) errors.push('El nombre debe tener al menos 3 caracteres.');
    if (selected.size < 1) errors.push('Agrega al menos una canción.');
    return errors;
  }

  async function savePlaylist(){
    // Validación local
    const errs = validateLocal();
    if (errs.length){
      if ($name && $name.value.trim().length < 3){
        if ($nameErr){ $nameErr.textContent = 'El nombre debe tener al menos 3 caracteres.'; $nameErr.classList.remove('hidden'); }
      } else if ($nameErr){ $nameErr.classList.add('hidden'); }
      flash('error', errs.join(' '));
      updateSaveBtn();
      return;
    }
    if ($nameErr) $nameErr.classList.add('hidden');

    // Payload
    const payload = {
      nombre: ($name?.value || '').trim(),
      descripcion: ($desc?.value || '').trim(),
      es_publica: false,
      tracks: Array.from(selected.keys()).map(x => Number(x))
    };

    // UI estado
    const oldText = $save?.textContent;
    if ($save){ $save.textContent = 'Guardando…'; $save.disabled = true; }

    try {
      const out = await createPlaylist(payload);
      if (!out?.ok) throw new Error(out?.error || 'Error al crear la playlist.');

      clearForm();
      flash('success', 'Playlist creada.');
      location.hash = '#/playlists';

    } catch (e) {
      // Errores: NO limpiar nada
      flash('error', e.message || 'No se pudo crear la playlist.');
    } finally {
      if ($save){ $save.textContent = oldText || 'Guardar playlist'; $save.disabled = false; }
      updateSaveBtn();
    }
  }

  function clearForm(){
    // Limpia todo para éxito o cancelar
    if ($name){ $name.value = ''; }
    if ($desc){ $desc.value = ''; }
    selected.clear();
    syncIcons();
    updateSaveBtn();
  }

  // ------- Eventos -------
  let searchTimer = null;
  $search?.addEventListener('input', () => {
    clearTimeout(searchTimer);
    const q = $search.value;
    lastQuery = q;
    // esqueletito
    if ($results){
      $results.innerHTML = `
        <div class="rounded-xl bg-white/5 border border-white/10 p-4 animate-pulse">
          <div class="h-4 w-28 bg-white/10 rounded mb-2"></div>
          <div class="h-12 bg-white/5 rounded"></div>
          <div class="h-12 bg-white/5 rounded mt-2"></div>
        </div>`;
      enforceThreeVisible();
    }
    searchTimer = setTimeout(async () => {
      try {
        const list = await searchTracks(q);
        renderResults(list);
      } catch {
        if ($results) $results.innerHTML = `<p class="text-red-300 text-sm px-1">Error buscando canciones.</p>`;
      }
    }, 250);
  });

  $name?.addEventListener('input', () => {
    if ($nameErr) $nameErr.classList.add('hidden');
    updateSaveBtn();
  });

  document.getElementById('plnew-save')?.addEventListener('click', (e) => {
    e.preventDefault();
    savePlaylist();
  });

  // Interceptar "Cancelar" para limpiar
  $cancelA?.addEventListener('click', (e) => {
      e.preventDefault();
      clearForm();
      flash('info', 'Creación de playlist cancelada. No se guardaron cambios.');
      location.hash = '#/playlists';
  });

  // Alturas/scroll
  function setHeightsSafe(){
    try { enforceThreeVisible(); } catch {}
  }
  window.addEventListener('resize', setHeightsSafe);
  window.addEventListener('load', setHeightsSafe);
  setTimeout(setHeightsSafe, 100);

  // Mostrar/ocultar vista por hash
  function route(){
    const h = (location.hash || '').toLowerCase();
    const show = h.startsWith('#/playlist/new');
    if (section) section.hidden = !show;
    if (!section.hidden) {
      setHeightsSafe();
      if ($results && !$results.innerHTML) renderResults([]);
      updateSaveBtn();
    }
  }
  window.addEventListener('hashchange', route);
  route();
})();

