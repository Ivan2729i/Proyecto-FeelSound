// ============================================================================
//  FeelSound · Mis Playlists
// ============================================================================

(() => {
  // ---------- Refs base ----------
  const $view   = document.getElementById('view-playlists');
  const $grid   = document.getElementById('pl-grid');
  const $empty  = document.getElementById('pl-empty');
  const $tpl    = document.getElementById('tpl-pl-card');
  const $scroll = document.getElementById('pl-scroll');
  if (!$view || !$grid || !$empty || !$tpl || !$scroll) return;

  // ---------- Refs modal ----------
  const $plm        = document.getElementById('pl-modal');
  const $plmClose   = document.getElementById('plm-close');
  const $plmCloseBg = document.getElementById('plm-close-bg');
  const $plmTitle   = document.getElementById('plm-title');
  const $plmDesc    = document.getElementById('plm-desc');
  const $plmScroll  = document.getElementById('plm-scroll');
  const $plmList    = document.getElementById('plm-list');
  const $tplRow     = document.getElementById('tpl-plm-row');
  // --- guarda la lista actual del modal para reproducir en orden
  let _currentPlTracks = [];
  // --- edición de playlist
  let _editingPlaylistId = null;


  // fallback mm:ss
  function _mmss(secs) {
      secs = Math.max(0, Math.floor(+secs || 0));
      const m = Math.floor(secs/60);
      const s = String(secs%60).padStart(2,'0');
      return `${m}:${s}`;
  }

  // panel del modal
  let $plmPanel = null;

  // ---------- API base ----------
  const API_ORIGIN =
    (window.API && window.API.origin) ||
    (window.FEEL?.env?.API_BASE?.replace(/\/api(?:\/v1)?\/?$/,'')) ||
    'http://127.0.0.1:8000';

  async function hydrateMissingFromDeezer(tracks) {
      const base = API_ORIGIN.replace(/\/+$/,'');
      if (!Array.isArray(tracks) || !tracks.length) return tracks;

      const needs = tracks.filter(t => !t || !t.title || !t.artist || !t.cover);
      if (!needs.length) return tracks;

      const byId = {};

      // ---- limitador de concurrencia 4 ----
      const queue = needs.map(t => t && t.id).filter(Boolean);
      const workers = Math.min(4, queue.length);

      async function worker() {
        while (queue.length) {
          const id = queue.shift();
          try {
            // TU ENDPOINT REAL:
            const r = await fetch(`${base}/api/deezer/track/${encodeURIComponent(id)}/`, {
              credentials: 'include',
              headers: { 'Accept':'application/json' }
            });
            if (!r.ok) continue;
            const d = await r.json().catch(()=>null);
            const src = d?.data || d;
            if (src?.id) {
              byId[String(src.id)] = {
                id: src.id,
                title: src.title || '',
                artist: src.artist?.name || '',
                artists: src.artist?.name ? [src.artist.name] : [],
                album: src.album?.title || '',
                cover: src.album?.cover || src.album?.cover_medium || '',
                duration: (src.duration || 0),
                preview: src.preview || ''
              };
            }
          } catch(_){}
        }
      }

      await Promise.all(Array.from({length: workers}, worker));

      // fusión final (normalizando artists)
      return tracks.map(t => {
        const k = String(t.id);
        const src = byId[k];
        if (!src) return t;

        const currentArtists = Array.isArray(t.artists)
          ? t.artists
          : (typeof t.artists === 'string' && t.artists.trim()
              ? t.artists.split(/\s*,\s*/).filter(Boolean)
              : []);

        const mergedArtists = currentArtists.length ? currentArtists : (src.artists || []);
        const mergedArtist  = t.artist || (mergedArtists[0] || '');

        return {
          ...t,
          title:   t.title   || src.title,
          artist:  mergedArtist,
          artists: mergedArtists,
          album:   t.album   || src.album,
          cover:   t.cover   || src.cover,
          duration: t.duration || src.duration,
          preview:  t.preview || src.preview
        };
      });
  }


  // ---- helpers comunes ----
    function flash(type, text){
      try {
        // usa tu sistema de toasts (ya lo tienes)
        if (window.Flash?.[type]) return window.Flash[type](text);
        if (window.Flash?.show)   return window.Flash.show({ type, text });
      } catch(_) {}
      console.log(`[${type}] ${text}`);
    }

    function getCSRF(){
      const m = document.cookie.match(/(?:^|;\s*)csrftoken=([^;]+)/);
      return m ? decodeURIComponent(m[1]) : '';
    }

    async function apiDeletePlaylist(pid){
      const base = API_ORIGIN.replace(/\/+$/,'');
      const url  = `${base}/api/v1/playlists/${pid}/`;
      const r = await fetch(url, {
        method: 'DELETE',
        credentials: 'include',
        headers: {
          'Accept': 'application/json',
          'X-CSRFToken': getCSRF(),
          'X-Requested-With': 'XMLHttpRequest'
        }
      });
      if (r.status === 204) return { deleted: true, redirect: null };
      if (r.ok) return r.json();
      let msg = `Error ${r.status}`;
      try { const j = await r.json(); if (j?.detail) msg = j.detail; } catch(_){}
      throw new Error(msg);
    }


  // ---------- Utils ----------
  const fmtDate = (iso) => {
    if (!iso) return '';
    try {
      return new Intl.DateTimeFormat('es-MX', { day:'numeric', month:'long', year:'numeric' })
        .format(new Date(iso));
    } catch { return iso; }
  };
  const fmtTime = (ms) => {
    const t = Math.round((ms||0)/1000),
          h = Math.floor(t/3600),
          m = Math.floor((t%3600)/60),
          s = String(t%60).padStart(2,'0');
    return h ? `${h}:${String(m).padStart(2,'0')}:${s}` : `${m}:${s}`;
  };
  const mmss = (secs) => {
    secs = Math.max(0, Math.floor(+secs || 0));
    const m = Math.floor(secs/60);
    const s = String(secs%60).padStart(2,'0');
    return `${m}:${s}`;
  };

  const showEmpty = (show) => {
    $empty.classList.toggle('hidden', !show);
    $scroll.classList.toggle('hidden', show);
  };

  // Ajusta la altura del scroll de la grilla principal (tu diseño original)
  function fitScrollHeight() {
    try {
      const vpH  = window.innerHeight;
      const rect = $scroll.getBoundingClientRect();
      const reserve = 120; // espacio para reproductor/footer
      const maxH = Math.max(240, vpH - rect.top - reserve);
      $scroll.style.maxHeight = `${Math.round(maxH)}px`;
    } catch {}
  }

  // ---------- Fetch helpers ----------
  async function apiJSON(path) {
    const r = await fetch(`${API_ORIGIN.replace(/\/+$/,'')}${path}`, {
      credentials:'include',
      headers: { 'Accept':'application/json' }
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  }

  async function fetchPlaylists() {
    const data = await apiJSON('/api/v1/playlists/');
    const arr  = Array.isArray(data?.data) ? data.data : (Array.isArray(data) ? data : []);
    return arr.map(raw => ({
      id            : raw.id,
      nombre        : raw.nombre ?? raw.name ?? 'Playlist',
      descripcion   : raw.descripcion ?? raw.description ?? '',
      fecha_creacion: raw.fecha_creacion ?? raw.created_at ?? null,
      track_count   : raw.tracks_count ?? raw.track_count ?? 0,
      duration_ms   : raw.duration_ms ?? raw.duration ?? 0
    }));
  }

  // --- ids-only: sin hidratar, súper rápido para modo edición ---
  async function fetchPlaylistTrackIdsOnly(id) {
      const d = await apiJSON(`/api/v1/playlists/${id}/`);
      const nombre      = d?.nombre ?? d?.name ?? 'Playlist';
      const descripcion = d?.descripcion ?? d?.description ?? '';

      let raw = [];
      if (Array.isArray(d?.tracks))            raw = d.tracks;
      else if (Array.isArray(d?.canciones))    raw = d.canciones;
      else if (Array.isArray(d?.items))        raw = d.items;
      else if (Array.isArray(d?.data?.tracks)) raw = d.data.tracks;

      const ids = raw
        .map(x => Number(x.id ?? x.deezer_id ?? x.track_id))
        .filter(Boolean);

      return { nombre, descripcion, ids };
  }

  async function fetchPlaylistDetail(id) {
    const d = await apiJSON(`/api/v1/playlists/${id}/`);
    const nombre      = d?.nombre ?? d?.name ?? 'Playlist';
    const descripcion = d?.descripcion ?? d?.description ?? '';

    let rawTracks = [];
    if (Array.isArray(d?.tracks))           rawTracks = d.tracks;
    else if (Array.isArray(d?.canciones))   rawTracks = d.canciones;
    else if (Array.isArray(d?.items))       rawTracks = d.items;
    else if (Array.isArray(d?.data?.tracks))rawTracks = d.data.tracks;

    const tracks = rawTracks.map(x => {
      // normaliza artistas (array o string)
      const artistsNorm = Array.isArray(x.artists)
        ? x.artists
        : (typeof x.artists === 'string' && x.artists.trim()
            ? x.artists.split(/\s*,\s*/).filter(Boolean)
            : []);

      const durationSec =
        (typeof x.duration_ms === 'number' ? Math.round(x.duration_ms / 1000) :
         typeof x.duracion_ms === 'number' ? Math.round(x.duracion_ms / 1000) :
         x.duration ?? x.duracion ?? 30);

      return {
        id      : x.id ?? x.deezer_id ?? x.track_id ?? null,
        title   : x.title ?? x.titulo ?? '',
        artist  : x.artist ?? x.artista ?? (artistsNorm[0] || ''),
        artists : artistsNorm,
        album   : x.album ?? '',
        cover   : x.cover ?? x.cover_url ?? x.portada ?? x.album_cover ?? (x.album?.cover || ''),
        duration: durationSec,
        preview : x.preview ?? x.preview_url ?? ''
      };
    });
      const hydrated = await hydrateMissingFromDeezer(tracks);
      return { nombre, descripcion, tracks: hydrated };
  }


  function prefillCreateForm(detail){
      const $name = document.getElementById('plnew-name');
      const $desc = document.getElementById('plnew-desc');

      if ($name){
        $name.placeholder = detail?.nombre || 'Nombre de la playlist';
        $name.value = detail?.nombre || '';
      }
      if ($desc){
        $desc.placeholder = detail?.descripcion || 'Describe tu lista de reproducción…';
        $desc.value = detail?.descripcion || '';
      }

      const $save = document.getElementById('plnew-save');
      if ($save){
        $save.textContent = _editingPlaylistId ? 'Guardar cambios' : 'Guardar playlist';
      }
  }


  // ---------- Modal: (centrado + azul) ----------
  function ensureModalOnBody() {
      if (!$plm) return;
      if ($plm.parentElement !== document.body) document.body.appendChild($plm);

      // Overlay centrado
      Object.assign($plm.style, {
        position: 'fixed',
        inset: '0',
        display: 'grid',
        placeItems: 'center',
        pointerEvents: 'auto',
        zIndex: '2147483647',
        background: 'rgba(0,0,0,.60)',
        backdropFilter: 'blur(6px)',
      });

      // Tarjeta
      $plmPanel = Array.from($plm.children).find(n => n !== $plmCloseBg) || null;
      if ($plmPanel) {
        Object.assign($plmPanel.style, {
          position: 'relative',
          zIndex: '1',
          width: 'min(980px, 94vw)',  // ancho estable
          maxWidth: '94vw',
          maxHeight: '82vh',          // alto máximo del panel
          height: 'auto',
          overflow: 'hidden',
          borderRadius: '16px',
          background: '#0b1630',
          boxShadow: '0 20px 60px rgba(0,0,0,.45)',
        });
      }
  }


  function fitModalScroll() {
      if (!$plmPanel || !$plmScroll) return;

      // Máximo alto usable del panel
      const maxPanelH = Math.floor(window.innerHeight * 0.82);

      // Altura del header real (título+desc+borde)
      const header = $plmPanel.querySelector('.border-b') || $plmPanel.firstElementChild;
      const headH  = header ? Math.ceil(header.getBoundingClientRect().height) : 72;

      // Paddings del wrapper del body (el div con px-2 pb-4)
      const bodyWrap = $plmScroll.parentElement || $plmPanel;
      const cs = getComputedStyle(bodyWrap);
      const padTop    = parseFloat(cs.paddingTop)    || 0;
      const padBottom = parseFloat(cs.paddingBottom) || 0;

      // Bordes del panel
      const pcs = getComputedStyle($plmPanel);
      const bTop = parseFloat(pcs.borderTopWidth)    || 0;
      const bBtm = parseFloat(pcs.borderBottomWidth) || 0;

      const safety = 16; // extra para que no corte la última fila nunca

      // Alto máximo del scroll interno, basado en 82vh
      const maxH = Math.max(
        140,
        maxPanelH - headH - padTop - padBottom - bTop - bBtm - safety
      );

      $plmScroll.style.maxHeight = `${maxH}px`;
      $plmScroll.style.overflowY = 'auto';
      $plmScroll.style.scrollbarGutter = 'stable both-edges';
  }



  function plmOpen(titleText, descText) {
      ensureModalOnBody();                // <- importante
      if ($plmTitle) $plmTitle.textContent = titleText || 'Playlist';
      if ($plmDesc)  $plmDesc.textContent  = (descText || '').trim();
      if ($plmList)  $plmList.innerHTML    = '';
      $plm.classList.remove('hidden');
      $plm.style.display = 'grid';        // por si alguna clase lo cambia
      document.body.style.overflow = 'hidden';

      // en algunos navegadores, re-apéndalo un tick después por si el DOM cambia
      setTimeout(() => {
        if ($plm.parentElement !== document.body) document.body.appendChild($plm);
        $plm.style.zIndex = '2147483647';
      }, 0);

      if ($plmScroll) $plmScroll.scrollTop = 0;

      // recalcular alto de scroll interno del modal
      fitModalScroll();
      setTimeout(fitModalScroll, 0);
  }

  function plmClose() {
    if (!$plm) return;
    $plm.classList.add('hidden');
    $plm.style.display = '';
    document.body.style.overflow = '';
  }

  $plmCloseBg?.addEventListener('click', plmClose);
  $plmClose?.addEventListener('click', plmClose);
  window.addEventListener('resize', fitModalScroll);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !$plm?.classList.contains('hidden')) plmClose();
  });

  // Render de filas del modal
  function renderModalTracks(list) {
      if (!$plmList || !$tplRow) return;

      _currentPlTracks = Array.isArray(list) ? list.slice() : [];
      $plmList.innerHTML = '';

      _currentPlTracks.forEach((t, idx) => {
        const row = $tplRow.content.firstElementChild.cloneNode(true);

        row.querySelector('div').textContent = String(idx + 1);

        const img = row.querySelector('.plm-cover');
        img.src = t.cover || '';
        img.referrerPolicy = 'no-referrer';
        img.onerror = () => {
          img.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==';
        };
        img.onload = () => requestAnimationFrame(fitModalScroll);

        row.querySelector('.plm-title').textContent  = t.title  || '—';
        row.querySelector('.plm-artist').textContent = t.artist || t.artists || '—';
        row.querySelector('.plm-time').textContent   = _mmss(t.duration || 30);

        // --- botón de 3 puntos ---
        const btnMore = row.querySelector('.plm-more');
        if (btnMore) {
          const artistsArr = Array.isArray(t.artists)
            ? t.artists
            : (t.artist ? [t.artist] : []);

          btnMore.dataset.trackId      = t.id;
          btnMore.dataset.trackTitle   = t.title || '';
          btnMore.dataset.trackArtists = artistsArr.join(', ');

          // abre el modal azul encima del modal de playlist
          btnMore.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (window.FSPlaylistPicker?.open) {
              window.FSPlaylistPicker.open({
                id: t.id,
                title: t.title || '',
                artists: artistsArr
              });
            }
          });
        }

        row.addEventListener('click', (e) => {
          if (e.target.closest('.plm-more')) return;

          if (typeof window.fsPlayTracks === 'function') {
            window.fsPlayTracks(_currentPlTracks, idx);
          } else if (typeof window.replayRecent === 'function') {
            window.replayRecent({
              id: t.id,
              title: t.title || '',
              artists: t.artist || t.artists || '',
              cover: t.cover || ''
            });
          }
        });

        $plmList.appendChild(row);
      });

      // Spacer generoso para que la fila final no quede pegada al borde
      const tail = document.createElement('div');
      tail.style.height = '28px';
      tail.setAttribute('aria-hidden', 'true');
      $plmList.appendChild(tail);

      // Recalcula con layout ya pintado
      fitModalScroll();
      setTimeout(fitModalScroll, 0);
  }

  // ======= Favoritos (máx 5) =======
    const $favList  = document.getElementById('fav-pl-list');
    const $favEmpty = document.getElementById('fav-pl-empty');

    // Clave por USUARIO
    function getFavKey() {
      const email = localStorage.getItem('fs_user_email') || '';
      const uid   = localStorage.getItem('fs_user_id')    || '';
      const tag   = email || uid || 'guest';
      return `userFav.v1::${tag}`;
    }

    // Carga/guarda
    function favLoad(){
      const key = getFavKey();
      try {
        const raw = localStorage.getItem(key);
        const arr = Array.isArray(JSON.parse(raw)) ? JSON.parse(raw) : [];
        return arr.filter(x => x && Number.isFinite(+x.id)).slice(0,5);
      } catch { return []; }
    }
    function favSave(arr){
      const key = getFavKey();
      localStorage.setItem(key, JSON.stringify((arr||[]).slice(0,5)));
    }
    function favIs(id){
      return favLoad().some(x => +x.id === +id);
    }
    function favAddTop(pl){
      const cur = favLoad().filter(x => +x.id !== +pl.id);
      cur.unshift({ id:+pl.id, nombre: pl.nombre||'Playlist', descripcion: (pl.descripcion||'').trim() });
      if (cur.length > 5) cur.length = 5;
      favSave(cur);
      return cur;
    }
    function favRemove(id){
      const cur = favLoad().filter(x => +x.id !== +id);
      favSave(cur);
      return cur;
    }
    function favToggle(pl){
      return favIs(pl.id) ? (favRemove(pl.id), false) : (favAddTop(pl), true);
    }

    function favReconcileWith(items){
      try {
        const byId = new Map(items.map(p => [+p.id, p]));
        const prev = favLoad();
        const next = [];
        let changed = false;

        for (const f of prev){
          const pl = byId.get(+f.id);
          if (!pl) { changed = true; continue; }
          const nNombre = pl.nombre || 'Playlist';
          const nDesc   = (pl.descripcion || '').trim();
          if ((f.nombre || '') !== nNombre || (f.descripcion || '').trim() !== nDesc){
            changed = true;
          }
          next.push({ id:+pl.id, nombre: nNombre, descripcion: nDesc });
        }

        if (changed){
          favSave(next);
          renderFavSidebar();
        }
      } catch {}
    }

    // Render sidebar
    async function renderFavSidebar(){
      if (!$favList) return;
      const favs = favLoad();
      $favList.innerHTML = '';

      if (!favs.length){
        $favEmpty?.classList.remove('hidden');
        return;
      }
      $favEmpty?.classList.add('hidden');

      for (const f of favs){
        const a = document.createElement('a');
        a.href = `#/playlists/${f.id}`;
        a.dataset.plid   = String(f.id);
        a.dataset.plname = f.nombre || 'Playlist';
        a.dataset.pldesc = (f.descripcion || '').trim();
        a.className = 'block px-3 py-2 rounded-lg text-white/80 hover:text-white hover:bg-white/10';
        a.textContent = f.nombre || 'Playlist';
        $favList.appendChild(a);
      }
    }

    // Abrir modal por ID (misma UX que click en la tarjeta)
    async function openPlaylistModalById(id, nameHint='', descHint=''){
      try{
        plmOpen(nameHint || 'Playlist', (descHint||'').trim());
        if ($plmList) {
          $plmList.innerHTML = `<div class="py-4 px-6 text-white/70">Cargando canciones…</div>`;
        }
        const det = await fetchPlaylistDetail(+id);
        $plmTitle && ($plmTitle.textContent = det.nombre || nameHint || 'Playlist');
        $plmDesc  && ($plmDesc.textContent  = (det.descripcion || descHint || '').trim());
        renderModalTracks(det.tracks || []);
        fitModalScroll();

        const needs = (det.tracks||[]).some(t => !t || !t.title || !t.artist || !t.cover);
        if (needs){
          const hydrated = await hydrateMissingFromDeezer(det.tracks || []);
          renderModalTracks(hydrated);
          fitModalScroll();
        }
      } catch (err) {
          console.warn('[FavSidebar] detalle playlist:', err);
          try { favRemove(+id); renderFavSidebar(); } catch {}
          if ($plmList) {
            $plmList.innerHTML = `<div class="py-4 px-6 text-red-300">Esta playlist ya no existe. La quité de tus favoritas.</div>`;
          }
        }
    }

    // Delegación de clicks en el sidebar
    $favList?.addEventListener('click', (e)=>{
      const a = e.target.closest('a[data-plid]');
      if (!a) return;
      e.preventDefault();
      openPlaylistModalById(+a.dataset.plid, a.dataset.plname, a.dataset.pldesc);
    });

    // Pinta al cargar
    renderFavSidebar();
    // Repintar al hidratar usuario y al cambiar de sesión
    document.addEventListener('feel:user-ready', () => renderFavSidebar());
    document.addEventListener('feel:session-switched', () => renderFavSidebar());


  // ---------- Tarjetas ----------
  function renderCard(pl) {
      const node  = $tpl.content.firstElementChild.cloneNode(true);
      const nameA = node.querySelector('.pl-name');

      // ---- Texto/meta ----
      nameA.textContent = pl.nombre || 'Playlist';
      nameA.href = '#';
      node.querySelector('.pl-meta').textContent =
        `Creada el ${fmtDate(pl.fecha_creacion)}`;
      node.querySelector('.pl-count').textContent =
        `${pl.track_count ?? 0} ${pl.track_count === 1 ? 'canción' : 'canciones'}`;
      node.querySelector('.pl-duration').textContent = fmtTime(pl.duration_ms || 0);

      // ---- Data attrs útiles ----
      node.dataset.plId = pl.id;
      nameA.dataset.plDesc = (pl.descripcion || pl.description || '').trim();

      // --- EDITAR  ---
        node.querySelector('.pl-edit')?.addEventListener('click', (ev) => {
          ev.preventDefault();

          window.FEEL = window.FEEL || {};
          window.FEEL.editingPlaylistId   = pl.id;
          window.FEEL.editingPlaylistName = pl.nombre || '';
          window.FEEL.editingPlaylistDesc = pl.descripcion || '';

          location.hash = '#/playlist/new';

          requestAnimationFrame(async () => {
            prefillCreateForm({
              nombre: window.FEEL.editingPlaylistName,
              descripcion: window.FEEL.editingPlaylistDesc
            });

            const $viewCreate = document.getElementById('view-pl-create');
            if ($viewCreate) { $viewCreate.dataset.mode = 'edit'; $viewCreate.dataset.pid = String(pl.id); }

            try {
              const det = await fetchPlaylistTrackIdsOnly(pl.id);
                window.FEEL.editingPlaylistTrackIds = det.ids || [];

                if (det.descripcion && det.descripcion.trim()) {
                  window.FEEL.editingPlaylistDesc = det.descripcion;
                  prefillCreateForm({
                    nombre: window.FEEL.editingPlaylistName,
                    descripcion: det.descripcion
                  });
                }
                document.dispatchEvent(new CustomEvent('feelsound:seed-editing-tracks'));
            } catch (e) {
              console.warn('No se pudieron cargar los IDs para edición', e);
              window.FEEL.editingPlaylistTrackIds = [];
            }
          });
        });

      // ================== Abrir modal de detalle ==================
      nameA.addEventListener('click', async (e) => {
          e.preventDefault();
          plmOpen(pl.nombre || 'Playlist', (pl.descripcion || '').trim());

          // skeleton inmediato
          if ($plmList) {
            $plmList.innerHTML = `
              <div class="py-4 px-6 text-white/70">Cargando canciones…</div>
            `;
          }

          try {
            const det = await fetchPlaylistDetail(pl.id);
            $plmTitle && ($plmTitle.textContent = det.nombre || pl.nombre || 'Playlist');
            $plmDesc  && ($plmDesc.textContent  = (det.descripcion || '').trim());

            renderModalTracks(det.tracks || []);
            fitModalScroll();

            const needsHydration = (det.tracks || []).some(t => !t || !t.title || !t.artist || !t.cover);
            if (needsHydration) {
              const hydrated = await hydrateMissingFromDeezer(det.tracks || []);
              renderModalTracks(hydrated);
              fitModalScroll();
            }
          } catch (err) {
            console.warn('[Modal] detalle playlist:', err);
            if ($plmList) {
              $plmList.innerHTML = `<div class="py-4 px-6 text-red-300">No se pudieron cargar las canciones.</div>`;
            }
          }
      });

      // ================== Acciones extra ==================
      node.querySelector('.pl-share')?.addEventListener('click', async (ev) => {
          ev.preventDefault();
          try {
            const base = API_ORIGIN.replace(/\/+$/,'');
            const url  = `${base}/api/v1/playlists/${pl.id}/share/copy-link`;
            const r = await fetch(url, {
              method: 'POST',
              credentials: 'include',
              headers: {
                'Accept':'application/json',
                'X-Requested-With':'XMLHttpRequest',
                'X-CSRFToken': getCSRF?.() || (document.cookie.match(/(^|;\s*)csrftoken=([^;]+)/)?.[2] || '')
              }
            });
            const j = await r.json().catch(()=>null);
            if (!r.ok || !j?.url) {
              const msg = (j && (j.detail||j.error)) || `No se pudo generar el enlace.`;
              throw new Error(msg);
            }

            // Abre el modal con el link y el TTL recibido
            if (window.FSShareModal?.open) {
              window.FSShareModal.open({
                url: j.url,
                ttl_days: j.ttl_days ?? 3,
                expires_at: j.expires_at ?? null
              });
            } else {
              // Fallback mínimo si el modal no existe
              await navigator.clipboard.writeText(j.url);
              flash?.('success','Enlace copiado en el portapapeles');
            }
          } catch(e){
            flash?.('error', e.message || 'No se pudo generar el enlace');
          }
      });

      // Eliminar → confirmar en modal
      node.querySelector('.pl-del')?.addEventListener('click', (ev) => {
        ev.preventDefault();
        openDeleteModal(pl.id, pl.nombre || 'Playlist', node);
      });

      // ---- FAVORITO (corazón) ----
        const favBtn = node.querySelector('.pl-fav');
        if (favBtn){
          const icon = favBtn.querySelector('svg');

          const setState = (on) => {
            favBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
            if (icon) icon.setAttribute('fill', on ? 'currentColor' : 'none');
            favBtn.classList.toggle('bg-pink-600/15', on);
            favBtn.classList.toggle('ring-1', on);
            favBtn.classList.toggle('ring-pink-500/40', on);
          };

          setState(favIs(pl.id));

          favBtn.addEventListener('click', (ev)=>{
            ev.preventDefault();
            ev.stopPropagation();
            const nowOn = favToggle({ id: pl.id, nombre: pl.nombre, descripcion: pl.descripcion||'' });
            setState(nowOn);
            renderFavSidebar();
            if (nowOn) flash('success', 'Añadida a favoritas');
            else       flash('info', 'Quitada de favoritas');
          });
        }

      return node;
  }


  // ---------- Render principal ----------
  async function render() {
    // skeletons
    $grid.innerHTML = '';
    showEmpty(false);
    for (let i = 0; i < 3; i++) {
      const sk = document.createElement('div');
      sk.className = 'rounded-2xl bg-white/5 border border-white/10 p-6 animate-pulse h-32';
      $grid.appendChild(sk);
    }
    fitScrollHeight();

    try {
      const items = await fetchPlaylists();
      favReconcileWith(items);
      $grid.innerHTML = '';
      if (!items.length) { showEmpty(true); fitScrollHeight(); return; }
      showEmpty(false);
      items.forEach(pl => $grid.appendChild(renderCard(pl)));
      fitScrollHeight();
    } catch (e) {
      console.error('[Playlists] Error:', e);
      $grid.innerHTML = `
        <div class="col-span-full rounded-xl border border-white/10 bg-white/5 text-white/80 p-4">
          No se pudieron cargar tus playlists. Inténtalo de nuevo.
        </div>`;
      showEmpty(false);
      fitScrollHeight();
    }
  }

  // ---------- Router + eventos ----------
    function route() {
      const h = (location.hash || '').toLowerCase();

      const onPlaylists = h.startsWith('#/playlists');
      const onCreate    = h.startsWith('#/playlist/new');

      const $vList  = document.getElementById('view-playlists');
      const $vForm  = document.getElementById('view-pl-create');

      if ($vList) $vList.hidden = !onPlaylists;
      if ($vForm) $vForm.hidden = !onCreate;

      // Vista playlists
      if (onPlaylists) {
        render().finally(() => fitScrollHeight());
        document.dispatchEvent(new CustomEvent('feelsound:reset-create-form'));
        // saliste del formulario -> limpia modo edición
        if ($vForm) {
          delete $vForm.dataset.mode;
          delete $vForm.dataset.pid;
        }
        if (window.FEEL) window.FEEL.editingPlaylistId = null;
      }

      // Vista crear/editar
      if (onCreate) {
          const $v = document.getElementById('view-pl-create');

          const fromPencil = !!window.FEEL?.editingPlaylistId;
          const pid = ($v?.dataset.pid)
                   || (fromPencil ? String(window.FEEL.editingPlaylistId) : null);

          if (pid) {
            if ($v) { $v.dataset.mode = 'edit'; $v.dataset.pid = pid; }

            if (fromPencil) {
              // Prefill inmediato desde FEEL (sin pedir detalle pesado)
              prefillCreateForm({
                nombre: window.FEEL.editingPlaylistName || '',
                descripcion: window.FEEL.editingPlaylistDesc || ''
              });
              document.dispatchEvent(new CustomEvent('feelsound:seed-editing-tracks'));
            } else {
              // Acceso directo por URL -> un solo fetch de detalle
              fetchPlaylistDetail(+pid)
                .then(det => prefillCreateForm(det))
                .catch(()=>{});
            }
          } else {
            if ($v) { delete $v.dataset.mode; delete $v.dataset.pid; }
            prefillCreateForm({ nombre: '', descripcion: '' });
          }

          // asegura alturas del layout principal
          fitScrollHeight();
      }
    }

    window.addEventListener('hashchange', route);
    window.addEventListener('resize', fitScrollHeight);
    window.addEventListener('load', fitScrollHeight);

    // pinta la vista correcta al cargar
    route();


  // ======== MODAL CONFIRM DELETE ========
    const $plDelModal  = document.getElementById('pl-del-modal');
    const $plDelBg     = document.getElementById('pldel-close-bg');
    const $plDelText   = document.getElementById('pldel-text');
    const $plDelCancel = document.getElementById('pldel-cancel');
    const $plDelOK     = document.getElementById('pldel-confirm');

    let _delCtx = { id: null, name: '', cardNode: null };

    /** Lleva un modal al <body> y lo pone por ENCIMA de todo */
    function ensureModalOnBodyTop(modalEl, panelSelector='[data-modal-panel]', z=2147483647){
      if (!modalEl) return;
      if (modalEl.parentElement !== document.body) document.body.appendChild(modalEl);
      Object.assign(modalEl.style, {
        position: 'fixed',
        inset: '0',
        display: 'grid',
        placeItems: 'center',
        pointerEvents: 'auto',
        zIndex: String(z),
        background: 'rgba(0,0,0,.60)',
        backdropFilter: 'blur(6px)'
      });
      const panel = modalEl.querySelector(panelSelector) || modalEl.firstElementChild;
      if (panel) {
        Object.assign(panel.style, {
          position: 'relative',
          zIndex: '1',
          width: 'min(560px, 92vw)',
          maxWidth: '92vw',
          borderRadius: '16px',
          background: '#0b1630',
          color: '#fff',
          boxShadow: '0 20px 60px rgba(0,0,0,.45)'
        });
      }
    }

    /* Asegura que quede encima del modal de playlist si ambos están visibles */
    function raiseOverPlaylistModal(){
      const mPl = document.getElementById('pl-modal');
      if (mPl) mPl.style.zIndex = '2147483646';
      if ($plDelModal) {
        document.body.appendChild($plDelModal);
        $plDelModal.style.zIndex = '2147483647';
      }
    }

    function openDeleteModal(id, name, cardNode){
      _delCtx = { id, name, cardNode };

      if ($plDelText) {
        const safe = (name || 'esta playlist').replace(/</g,'&lt;');
        $plDelText.innerHTML = `¿Seguro que quieres borrar <b>${safe}</b>? Esta acción no se puede deshacer.`;
      }

      ensureModalOnBodyTop($plDelModal);
      raiseOverPlaylistModal();

      $plDelModal.classList.remove('hidden');
      $plDelModal.style.display = 'grid';
      document.body.style.overflow = 'hidden';
    }

    function closeDeleteModal(){
      if (!$plDelModal) return;
      $plDelModal.classList.add('hidden');
      $plDelModal.style.display = '';
      document.body.style.overflow = '';
      _delCtx = { id: null, name: '', cardNode: null };

      const mPl = document.getElementById('pl-modal');
      if (mPl) mPl.style.zIndex = '2147483647';
    }

    // Cerrar por fondo, botón cancelar o ESC
    $plDelBg?.addEventListener('click', closeDeleteModal);
    $plDelCancel?.addEventListener('click', closeDeleteModal);
    document.addEventListener('keydown', (e)=>{
      if (e.key === 'Escape' && !$plDelModal?.classList.contains('hidden')) closeDeleteModal();
    });

    // Confirmar -> DELETE real + flash + refresco inmediato
    $plDelOK?.addEventListener('click', async ()=>{
      if (!_delCtx.id) return;

      const old = $plDelOK.textContent;
      $plDelOK.disabled = true;
      $plDelOK.textContent = 'Eliminando…';

      try {
        const res = await apiDeletePlaylist(_delCtx.id);

        // Cierra el modal de confirmación
        closeDeleteModal();
        // Quita de favoritas playlists
        favRemove(_delCtx.id);
        renderFavSidebar();

        const tNow = (document.getElementById('plm-title')?.textContent || '').trim();
        if (tNow && tNow === (_delCtx.name||'').trim()){
          const mPl = document.getElementById('pl-modal');
          if (mPl){ mPl.classList.add('hidden'); document.body.style.overflow = ''; }
        }

        _delCtx.cardNode?.remove();

        const gridHasCards = !!document.getElementById('pl-grid')?.querySelector('article');
        if (!gridHasCards) {
          const $empty  = document.getElementById('pl-empty');
          const $scroll = document.getElementById('pl-scroll');
          $empty?.classList.remove('hidden');
          $scroll?.classList.add('hidden');
        }

        // FLASH de éxito
        if (typeof flash === 'function') {
          flash('success', 'Playlist borrada');
        } else if (window.Flash?.success) {
          window.Flash.success('Playlist borrada');
        } else {
          console.log('[ok] Playlist borrada');
        }

        // Refrescar el grid desde la API
        setTimeout(async () => {
          try {
            if ((location.hash || '').toLowerCase().startsWith('#/playlists')) {
              await render();
            } else {
              location.hash = '#/playlists';
            }
          } catch (e) {
            console.warn('Refresh playlists falló, usando fallback:', e);
          }
        }, 0);

        // Respetar redirect opcional del backend
        if (res?.redirect) location.hash = '#/playlists';

      } catch (err) {
        // FLASH de error
        const msg = `No se pudo eliminar: ${err?.message || err}`;
        if (typeof flash === 'function') {
          flash('error', msg);
        } else if (window.Flash?.error) {
          window.Flash.error(msg);
        } else {
          console.error(err);
          alert(msg);
        }
      } finally {
        $plDelOK.disabled = false;
        $plDelOK.textContent = old;
      }
    });


    // ====== MODAL: Importar playlist ======
    (function(){
      const $m    = document.getElementById('pl-import-modal');
      const $open = document.getElementById('pl-import-open');
      const $inp  = document.getElementById('pl-import-input');
      const $pv   = document.getElementById('pl-import-preview');
      const $ok   = document.getElementById('pl-import-continue');
      const $cc   = document.getElementById('pl-import-cancel');

      if (!$m || !$open) return;

      function openM(){ $m.classList.remove('hidden'); $inp.value=''; $pv.classList.add('hidden'); $pv.innerHTML=''; $inp.focus(); }
      function closeM(){ $m.classList.add('hidden'); }

      function extractToken(s){
        s = (s||'').trim();
        if (!s) return '';
        try {
          const u = new URL(s);
          return u.searchParams.get('token') || '';
        } catch{
          // no es URL: asumir que pegó el token puro
          return s;
        }
      }

      async function doPreview(token){
        const base = API_ORIGIN.replace(/\/+$/,'');
        const url  = `${base}/api/v1/share/copy/preview?token=${encodeURIComponent(token)}`;
        const r = await fetch(url, { headers: { 'Accept':'application/json' } });
        const j = await r.json().catch(()=>null);
        if (!r.ok || !j?.token_ok){
          throw new Error((j && (j.detail||j.error)) || 'Token inválido o expirado');
        }
        // pinta preview
        const mins = Math.round((j.duration_ms||0)/60000);
        const covers = (j.covers||[]).slice(0,4).map(c=>`<img src="${c}" class="w-10 h-10 rounded object-cover bg-white/10">`).join('');
        $pv.innerHTML = `
          <div class="flex items-center gap-3">
            <div class="flex -space-x-2">${covers || ''}</div>
            <div>
              <div class="font-semibold">${j.name}</div>
              <div class="text-white/70 text-xs">${j.tracks_count||0} canciones • ${mins} min aprox</div>
            </div>
          </div>
        `;
        $pv.classList.remove('hidden');
      }

      $open.addEventListener('click', (e)=>{ e.preventDefault(); openM(); });

      // Al cambiar el input, intenta mostrar preview
      let tPrev = null;
      $inp?.addEventListener('input', ()=>{
        clearTimeout(tPrev);
        $pv.classList.add('hidden'); $pv.innerHTML='';
        const raw = $inp.value;
        tPrev = setTimeout(async ()=>{
          const token = extractToken(raw);
          if (!token) return;
          try { await doPreview(token); }
          catch(e){ }
        }, 300);
      });

      $cc?.addEventListener('click', (e)=>{ e.preventDefault(); closeM(); });

      $ok?.addEventListener('click', async ()=>{
        try{
          const token = extractToken($inp.value);
          if (!token) { flash('error','Pega el enlace o token.'); return; }
          const base = API_ORIGIN.replace(/\/+$/,'');
          const url  = `${base}/api/v1/share/copy/import`;
          const r = await fetch(url, {
            method:'POST',
            credentials:'include',
            headers: {
              'Content-Type':'application/json',
              'Accept':'application/json',
              'X-Requested-With':'XMLHttpRequest',
              'X-CSRFToken': (document.cookie.match(/(^|;\s*)csrftoken=([^;]+)/)?.[2] || '')
            },
            body: JSON.stringify({ token })
          });
          const j = await r.json().catch(()=>null);
          if (!r.ok || !j?.ok){
            throw new Error((j && (j.detail||j.error)) || 'No se pudo importar la playlist');
          }
          flash('success', `Importada: ${j.name}`);
          closeM();
          // refresca vista de playlists
          location.hash = '#/playlists';
          try { document.dispatchEvent(new CustomEvent('feelsound:refresh-playlists')); } catch {}
        } catch(e){
          flash('error', e.message || 'Error al importar');
        }
      });
    })();

    // ====== Modal Compartir ======
    (function () {
      const $m   = document.getElementById('pl-share-modal');
      const $url = document.getElementById('pl-share-url');
      const $exp = document.getElementById('pl-share-exp');
      const $cp  = document.getElementById('pl-share-copy');
      const $cl  = document.getElementById('pl-share-close');

      if (!$m || !$url || !$exp || !$cp || !$cl) return;

      function ensureModalOnBodyTop(modalEl, panelSelector='[data-modal-panel]', z=2147483647){
        if (!modalEl) return;
        if (modalEl.parentElement !== document.body) document.body.appendChild(modalEl);
        Object.assign(modalEl.style, {
          position: 'fixed',
          inset: '0',
          display: 'grid',
          placeItems: 'center',
          pointerEvents: 'auto',
          zIndex: String(z),
          background: 'rgba(0,0,0,.60)',
          backdropFilter: 'blur(6px)'
        });
        const panel = modalEl.querySelector(panelSelector) || modalEl.firstElementChild;
        if (panel) {
          Object.assign(panel.style, {
            position: 'relative',
            zIndex: '1',
            width: 'min(560px, 92vw)',
            maxWidth: '92vw',
            borderRadius: '16px',
            background: '#0b1630',
            color: '#fff',
            boxShadow: '0 20px 60px rgba(0,0,0,.45)'
          });
        }
      }

      function openShareModal({ url, ttl_days=3, expires_at=null }) {
        ensureModalOnBodyTop($m);
        $url.value = url || '';

        const days = Number.isFinite(+ttl_days) ? +ttl_days : 3;
        $exp.textContent = `Vence en ${days} ${days === 1 ? 'día' : 'días'}`;

        $m.classList.remove('hidden');
        $m.style.display = 'grid';
        document.body.style.overflow = 'hidden';

        try { $url.focus(); $url.select(); } catch {}
      }

      function closeShareModal() {
        $m.classList.add('hidden');
        $m.style.display = '';
        document.body.style.overflow = '';
      }

      // Helpers de flash consistentes
      function flashSuccess(msg){
        if (typeof flash === 'function') return flash('success', msg);
        if (window.Flash?.success) return window.Flash.success(msg);
        console.log('[success]', msg);
      }
      function flashInfo(msg){
        if (typeof flash === 'function') return flash('info', msg);
        if (window.Flash?.info) return window.Flash.info(msg);
        console.log('[info]', msg);
      }
      function flashError(msg){
        if (typeof flash === 'function') return flash('error', msg);
        if (window.Flash?.error) return window.Flash.error(msg);
        console.error('[error]', msg);
      }

      // Copiar
      $cp.addEventListener('click', async (e) => {
        e.preventDefault();
        try {
          await navigator.clipboard.writeText($url.value);
          flashSuccess('Enlace copiado en el portapapeles');
          // UX: cierra el modal para que el toast quede claro
          closeShareModal();

        } catch {
          // Fallback: selecciona texto y avisa
          try { $url.select(); } catch {}
          flashInfo('Seleccioné el enlace; presiona Ctrl+C');
        }
      });

      $cl.addEventListener('click', (e)=>{ e.preventDefault(); closeShareModal(); });
      // Cerrar al hacer click en el fondo (no en el panel)
      $m.addEventListener('click', (e)=>{ if (e.target === $m) closeShareModal(); });
      // API pública
      window.FSShareModal = { open: openShareModal, close: closeShareModal };
    })();

})();
