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
  let seedFromEditingOnce = false;

  // --- reset duro de la vista crear ---
  function resetCreateViewHard() {
      // inputs
      if ($name)  $name.value = '';
      if ($desc)  $desc.value = '';
      if ($search) $search.value = '';
      if ($nameErr) $nameErr.classList.add('hidden');

      // estado de búsqueda/selección
      selected.clear();
      seedFromEditingOnce = false;
      lastQuery = '';
      lastRows = [];

      // UI
      if ($results) $results.innerHTML = '';
      syncIcons();
      updateSaveBtn();

      // quita cualquier “modo edición” que haya quedado pegado
      const $v = document.getElementById('view-pl-create');
      if ($v) { delete $v.dataset.mode; delete $v.dataset.pid; }
      if (window.FEEL) {
        delete window.FEEL.editingPlaylistId;
        delete window.FEEL.editingPlaylistName;
        delete window.FEEL.editingPlaylistDesc;
        delete window.FEEL.editingPlaylistTrackIds;
      }
  }

  function seedSelectedFromEditingIfNeeded() {
      if (seedFromEditingOnce) return;
      const ids = window.FEEL?.editingPlaylistTrackIds;
      if (Array.isArray(ids) && ids.length) {
        ids.forEach(id => selected.set(String(id), { id:Number(id) }));
        seedFromEditingOnce = true;
        syncIcons();
        updateSaveBtn();
      }
  }

  // ------- Helpers -------
  const API_ORIGIN =
    (window.API && window.API.origin) ||
    (window.FEEL?.env?.API_BASE?.replace(/\/api(?:\/v1)?\/?$/,'')) ||
    "http://127.0.0.1:8000";

  // --- helper: detectar modo edición e ID ---
  function isEditMode() {
      const pidFromFEEL = window.FEEL?.editingPlaylistId;
      const pidFromDOM  = document.getElementById('view-pl-create')?.dataset?.pid;
      return Boolean(pidFromFEEL || pidFromDOM);
  }
  function getEditingId() {
      return Number(window.FEEL?.editingPlaylistId || document.getElementById('view-pl-create')?.dataset?.pid || 0);
  }

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

  function showFieldError($el, msg){
      if (!$el) return;
      $el.textContent = msg;
      $el.classList.remove('hidden');
  }

  function isDuplicateNameError(err){
      const code = err?.code;
      const m = (err?.message || err?.data?.error || err?.data?.detail || '').toLowerCase();
      return (
        code === 409 ||
        m.includes('ya tienes una playlist') ||
        m.includes('nombre ya existe') ||
        m.includes('duplicate') ||
        m.includes('duplicad') ||
        m.includes('unique constraint') ||
        m.includes('1062')
      );
  }


  function updateSaveBtn(){
      const nameOK = ($name?.value.trim().length || 0) >= 3;
      const needTracks = !isEditMode();
      const tracksOK = needTracks ? selected.size >= 1 : true;

      const ok = nameOK && tracksOK;
      if ($save){
        $save.classList.toggle('opacity-60', !ok);
        $save.setAttribute('aria-disabled', ok ? 'false' : 'true');
        $save.disabled = !ok;
        $save.textContent = isEditMode() ? 'Guardar cambios' : 'Guardar playlist';
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
      title: d.title || '',
      artist: d.artist?.name || '',
      artists: d.artist?.name ? [d.artist.name] : [],
      album: d.album?.title || '',
      duration_ms: (d.duration || 0) * 1000,
      cover_url: d.album?.cover || d.album?.cover_medium || '',
      cover: d.album?.cover || d.album?.cover_medium || '',
      preview: d.preview || ''
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
      if (!isEditMode() && selected.size < 1) {
        errors.push('Agrega al menos una canción.');
      }
      return errors;
  }

    // --- helper: DELETE local ---
    async function apiDeletePlaylistLocal(pid){
      const base = API_ORIGIN.replace(/\/+$/,'');
      const url  = `${base}/api/v1/playlists/${pid}/`;
      const r = await fetch(url, {
        method: 'DELETE',
        credentials: 'include',
        headers: {
          'Accept': 'application/json',
          'X-CSRFToken': getCookie('csrftoken'),
          'X-Requested-With': 'XMLHttpRequest'
        }
      });
      if (r.status === 204) return { ok:true };
      if (!r.ok) {
        let msg = `Error ${r.status}`;
        try { const j = await r.json(); if (j?.detail) msg = j.detail; } catch {}
        throw new Error(msg);
      }
      return { ok:true };
    }

    // ---- construye arreglo de metadatos completos ----
    function buildTracksFullFromSelected(selMap){
      return Array.from(selMap.values()).map(t => ({
        id: Number(t.id),
        title: t.title || '',
        artist: t.artist || (Array.isArray(t.artists) ? t.artists[0] : ''),
        artists: Array.isArray(t.artists) ? t.artists : (t.artist ? [t.artist] : []),
        album: t.album || '',
        cover: t.cover || t.cover_url || '',
        duration: Math.round((t.duration_ms || 0) / 1000), // segundos
        preview: t.preview || ''
      }));
    }

    async function savePlaylist(){
      // Validación local
      const name = ($name?.value || '').trim();
      const errs = [];
      if (name.length < 3) errs.push('El nombre debe tener al menos 3 caracteres.');
      if (!isEditMode() && selected.size < 1) errs.push('Agrega al menos una canción.');

      if (errs.length){
        if ($name && name.length < 3 && $nameErr){
          $nameErr.textContent = 'El nombre debe tener al menos 3 caracteres.';
          $nameErr.classList.remove('hidden');
        } else if ($nameErr){ $nameErr.classList.add('hidden'); }
        flash('error', errs.join(' '));
        updateSaveBtn?.();
        return;
      }
      if ($nameErr) $nameErr.classList.add('hidden');

      const oldText = $save?.textContent;
      if ($save){ $save.textContent = 'Guardando…'; $save.disabled = true; }

      try {
        if (isEditMode()){
          const pid = getEditingId();

          const existing = Array.isArray(window.FEEL?.editingPlaylistTrackIds)
            ? window.FEEL.editingPlaylistTrackIds : [];
          const addedNow = Array.from(selected.keys()).map(id => Number(id));
          const unionIds = Array.from(new Set([...existing, ...addedNow]));

          const tracksFullNew = buildTracksFullFromSelected(selected);
          const payload = {
              nombre: name,
              descripcion: ($desc?.value || '').trim(),
              es_publica: false,
              tracks: unionIds,
              tracks_full: tracksFullNew
          };

          await apiDeletePlaylistLocal(pid);

          const urlC = `${API_ORIGIN.replace(/\/+$/,'')}/api/v1/playlists/create`;
          const rC = await fetch(urlC, {
            method:'POST', credentials:'include',
            headers: {
              'Content-Type':'application/json',
              'Accept':'application/json',
              'X-CSRFToken': getCookie('csrftoken'),
              'X-Requested-With': 'XMLHttpRequest'
            },
            body: JSON.stringify(payload)
          });
          const jC = await rC.json().catch(()=>null);
          if (!rC.ok || jC?.ok === false) {
            const msg = (jC && (jC.error || jC.detail)) || `No se pudo recrear la playlist.`;
            throw new Error(msg);
          }

          if (window.FEEL) {
            delete window.FEEL.editingPlaylistId;
            delete window.FEEL.editingPlaylistName;
            delete window.FEEL.editingPlaylistDesc;
            delete window.FEEL.editingPlaylistTrackIds;
          }
          const $viewCreate = document.getElementById('view-pl-create');
          if ($viewCreate){ delete $viewCreate.dataset.mode; delete $viewCreate.dataset.pid; }
          seedFromEditingOnce = false;
          selected.clear();

          flash('success', 'Playlist actualizada exitosamente.');
          document.dispatchEvent(new CustomEvent('feel:playlist-created'));
          window.refreshPlaylistsCount?.();
          location.hash = '#/playlists';
          return;
        }

        // ----- Modo CREACIÓN normal -----
        const ids = Array.from(selected.keys()).map(x => Number(x));
        const payload = {
          nombre: name,
          descripcion: ($desc?.value || '').trim(),
          es_publica: false,
          tracks: ids,
          tracks_full: buildTracksFullFromSelected(selected)
        };

        const url = `${API_ORIGIN.replace(/\/+$/,'')}/api/v1/playlists/create`;
        const r = await fetch(url, {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type':'application/json',
            'Accept':'application/json',
            'X-CSRFToken': getCookie('csrftoken'),
            'X-Requested-With': 'XMLHttpRequest'
          },
          body: JSON.stringify(payload)
        });

        // intenta JSON; si falla, usa texto crudo
        let data = null, raw = '';
        try { data = await r.json(); } catch { try { raw = await r.text(); } catch {} }

        if (!r.ok || data?.ok === false){
          const msg = (data && (data.error || data.detail)) ||
                      raw ||
                      'Error al crear la playlist.';
          throw Object.assign(new Error(msg), { code: r.status, data });
        }

        // limpiar y volver
        if ($name) $name.value = '';
        if ($desc) $desc.value = '';
        selected.clear();
        syncIcons?.();
        updateSaveBtn?.();
        flash('success', 'Playlist creada.');
        document.dispatchEvent(new CustomEvent('feel:playlist-created'));
        window.refreshPlaylistsCount?.();
        location.hash = '#/playlists';

      } catch (e) {
          if (isDuplicateNameError(e)) {
            showFieldError($nameErr, 'Ya tienes una playlist con ese nombre.');
            $name?.focus();
          }
          flash('error', e.message || 'No se pudo guardar la playlist.');
        } finally {
        if ($save){
          $save.textContent = oldText || (isEditMode() ? 'Guardar cambios' : 'Guardar playlist');
          $save.disabled = false;
        }
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
  document.addEventListener('feelsound:reset-create-form', resetCreateViewHard);
  document.addEventListener('feelsound:seed-editing-tracks', seedSelectedFromEditingIfNeeded);

  // Mostrar/ocultar vista por hash
  function route(){
      const h = (location.hash || '').toLowerCase();
      const show = h.startsWith('#/playlist/new');
      if (section) section.hidden = !show;

      if (!section.hidden) {
        // Si NO venimos en modo edición => reset duro para que no se “arrastre” nada
        const isEdit = !!(document.getElementById('view-pl-create')?.dataset.pid || window.FEEL?.editingPlaylistId);
        if (!isEdit) resetCreateViewHard();
        // si es edición, sembrar una sola vez
        seedSelectedFromEditingIfNeeded();

        // pintar altura/básicos
        try { enforceThreeVisible(); } catch {}
        if ($results && !$results.innerHTML) renderResults([]);
        updateSaveBtn();
      }
  }
  window.addEventListener('hashchange', route);
  route();
})();

