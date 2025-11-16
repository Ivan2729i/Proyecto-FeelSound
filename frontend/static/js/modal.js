// ============================================================================
//  FeelSound · Modal "Agregar a playlist"
// ============================================================================

(function () {
  // ---------- Refs ----------
  const $root     = document.getElementById('fs-add-to-pl-modal');
  if (!$root) return;

  const $overlay  = document.getElementById('fs-atp-overlay');
  const $subtitle = document.getElementById('fs-atp-sub');
  const $list     = document.getElementById('fs-atp-list');
  const $scroll   = document.getElementById('fs-atp-scroll');

  const $btnX     = document.getElementById('fs-atp-close');
  const $btnCancel= document.getElementById('fs-atp-cancel');
  const $btnDone  = document.getElementById('fs-atp-ok');

  // ---------- Helpers ----------
  function flash(type, text){
    try {
      if (window.Flash?.[type]) return window.Flash[type](text);
      if (window.Flash?.show)   return window.Flash.show({ type, text });
    } catch(_) {}
    console.log(`[${type}] ${text}`);
  }
  function getCSRF(){
    const m = document.cookie.match(/(?:^|;\s*)csrftoken=([^;]+)/);
    return m ? decodeURIComponent(m[1]) : '';
  }
  function apiOrigin(){
    const base = (window.API && window.API.origin) || '';
    return base.replace(/\/+$/,'');
  }
  function fmtCount(n){
    n = +n || 0;
    return `${n} ${n===1 ? 'canción' : 'canciones'}`;
  }

  // ---------- Estado / caché ----------
  let _track = { id:null, title:'', artists:[] };
  let _playlistsCache = null;            // [{id,nombre,track_count}]
  const _membershipCache = new Map();    // key=`${pid}:${trackId}` -> boolean
  let _cacheTime = 0;
  const CACHE_MS = 30_000;

  // Carga ágil (cache 30s)
  async function fetchPlaylistsOnce(){
    const now = Date.now();
    if (Array.isArray(_playlistsCache) && (now - _cacheTime) < CACHE_MS) return _playlistsCache;
    try {
      const r = await fetch(`${apiOrigin()}/api/v1/playlists/`, {
        credentials: 'include', headers: { 'Accept':'application/json' }
      });
      const j = await r.json();
      const arr = Array.isArray(j?.data) ? j.data : [];
      _playlistsCache = arr.map(x => ({
        id: x.id,
        nombre: x.nombre || 'Playlist',
        track_count: +x.track_count || 0
      }));
      _cacheTime = now;
      return _playlistsCache;
    } catch(e){
      _playlistsCache = [];
      return [];
    }
  }

  // Pertenece la canción a la playlist (con cache)
  async function isMember(pid, trackId){
    const key = `${pid}:${trackId}`;
    if (_membershipCache.has(key)) return _membershipCache.get(key);

    try {
      const r = await fetch(`${apiOrigin()}/api/v1/playlists/${pid}/`, {
        credentials:'include', headers:{ 'Accept':'application/json' }
      });
      if (!r.ok) throw 0;
      const d = await r.json();
      const arr = Array.isArray(d?.tracks) ? d.tracks : [];
      const found = arr.some(t => String(t.id) === String(trackId));
      _membershipCache.set(key, found);
      return found;
    } catch(_){
      _membershipCache.set(key, false);
      return false;
    }
  }

  // PATCH add/remove
  async function toggleServer(pid, trackId, makeOn){
    const url = `${apiOrigin()}/api/v1/playlists/${pid}/`;
    const payload = { action: makeOn ? 'add' : 'remove', track_id: trackId };
    const r = await fetch(url, {
      method: 'PATCH',
      credentials: 'include',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'X-CSRFToken': getCSRF(),
        'X-Requested-With': 'XMLHttpRequest'
      },
      body: JSON.stringify(payload)
    });
    if (!r.ok) {
      let msg = `Error ${r.status}`;
      try { const j = await r.json(); if (j?.detail) msg = j.detail; } catch(_){}
      throw new Error(msg);
    }
    _membershipCache.set(`${pid}:${trackId}`, makeOn);
  }

  // ---------- UI ----------
  // Fila compacta (sin imagen)
  function renderItemRow(pl){
    const row = document.createElement('label');
    row.className = 'flex items-center justify-between gap-3 rounded-xl px-4 py-3 bg-white/5 hover:bg-white/8 border border-white/10';

    const left = document.createElement('div');
    left.className = 'min-w-0';
    left.innerHTML = `
      <p class="font-medium text-white truncate">${pl.nombre}</p>
      <p class="text-xs text-white/60">${fmtCount(pl.track_count)}</p>
    `;

    const right = document.createElement('input');
    right.type = 'checkbox';
    right.className = 'h-5 w-5 accent-[#6D8BFF] cursor-pointer';

    // estado inicial (lazy)
    right.disabled = true;
    isMember(pl.id, _track.id).then(on => {
      right.checked = !!on;
      right.disabled = false;
    });

    right.addEventListener('change', async () => {
      const on = right.checked;
      right.disabled = true;
      try{
        await toggleServer(pl.id, _track.id, on);
        pl.track_count = Math.max(0, (pl.track_count || 0) + (on ? 1 : -1));
        row.querySelector('.text-xs').textContent = fmtCount(pl.track_count);
        flash('success', on ? 'Agregada a la playlist' : 'Quitada de la playlist');
      } catch(err){
        right.checked = !on;
        flash('error', err?.message || 'No se pudo actualizar la playlist');
      } finally {
        right.disabled = false;
      }
    });

    row.appendChild(left);
    row.appendChild(right);
    return row;
  }

  // Abrir
  async function open(track){
    _track = {
      id: track?.id,
      title: (track?.title || '').trim(),
      artists: Array.isArray(track?.artists) ? track.artists : (track?.artists? [track.artists] : [])
    };
    if (!_track.id) return;

    // Subtítulo "Canción — Artista"
    const sub = [_track.title, (_track.artists[0]||'')].filter(Boolean).join(' — ');
    if ($subtitle) $subtitle.textContent = sub || '—';

    // --- subir el picker por encima del modal de playlist ---
    const mPl = document.getElementById('pl-modal');
    if (mPl) mPl.style.zIndex = '2147483646';

    if ($root.parentElement !== document.body) document.body.appendChild($root);
    $root.style.zIndex = '2147483647';

    $root.classList.remove('hidden');
    document.body.style.overflow = 'hidden';

    // skeleton
    $list.innerHTML = '';
    for (let i=0;i<5;i++){
      const sk = document.createElement('div');
      sk.className = 'h-12 rounded-xl bg-white/5 border border-white/10 animate-pulse';
      $list.appendChild(sk);
    }

    $root.classList.remove('hidden');
    document.body.style.overflow = 'hidden';

    const pls = await fetchPlaylistsOnce();
    $list.innerHTML = '';
    if (!pls.length){
      $list.innerHTML = `<div class="p-3 text-white/70 text-sm">Aún no tienes playlists.</div>`;
    } else {
      pls.forEach(pl => $list.appendChild(renderItemRow(pl)));
    }
    // Limitar visualmente a 5 filas y activar scroll si hay más
    if ($scroll) {
      const rows = $list.querySelectorAll('label');
      if (rows.length > 5) {
        const rowH = rows[0]?.getBoundingClientRect().height || 64;
        const gap  = 8;
        const visible = 5;
        const maxH = Math.round(rowH * visible + gap * (visible - 1));
        $scroll.style.maxHeight = `${maxH}px`;
        $scroll.classList.add('overflow-y-auto');
      } else {
        // sin scroll si hay 5 o menos
        $scroll.style.maxHeight = '';
        $scroll.classList.remove('overflow-y-auto');
      }
    }
    setTimeout(() => { if ($scroll) $scroll.scrollTop = 0; }, 0);
  }

  function close(){
    // restaurar z-index del modal de playlist si estaba abierto
    const mPl = document.getElementById('pl-modal');
    if (mPl) mPl.style.zIndex = '2147483647';
    $root.classList.add('hidden');
    document.body.style.overflow = '';
  }

  // Cerrar: overlay, X, Cancelar, ESC
  $overlay?.addEventListener('click', close);
  $btnX?.addEventListener('click', close);
  $btnCancel?.addEventListener('click', close);
  $btnDone?.addEventListener('click', close);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !$root.classList.contains('hidden')) close();
  });

  // API pública
  window.FSPlaylistPicker = { open, close };
})();
