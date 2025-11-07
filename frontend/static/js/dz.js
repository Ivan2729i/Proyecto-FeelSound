// ============================================================================
// FeelSound · Deezer
// ============================================================================

document.addEventListener('DOMContentLoaded', () => {
  // --- Rutas centralizadas ---
  const ROUTES = {
    deezerSearch: (q) => `/api/deezer/search/?type=track&q=${encodeURIComponent(q)}`,
    deezerTrack:  (id) => `/api/deezer/track/${id}/`,
    songsByEmotion: (emocion, limit = 25) =>
      `/api/songs?emocion=${encodeURIComponent(emocion)}&limit=${limit}`,
    trackEmotions: (id) => `/api/v1/tracks/${id}/emotions`,
    captureTrack: `/api/capture/deezer-track`,
  };

  // Helper: construir URL absoluta
  function absApi(path) {
    if (!path) return '';
    if (/^https?:\/\//i.test(path)) return path;
    const origin = (window.API && window.API.origin) || '';
    return `${origin}${path}`;
  }

  // --- DOM refs ---
  const inpSearch   = document.getElementById('fs-search');
  const tbody       = document.getElementById('fs-results-body');
  const audio       = document.getElementById('fs-audio');
  const coverEl     = document.getElementById('player-cover');
  const titleWrap   = document.getElementById('player-title');
  const artistWrap  = document.getElementById('player-artist');
  const titleTextEl = document.getElementById('player-title-text');
  const artistTextEl= document.getElementById('player-artist-text');
  const btnPlay     = document.getElementById('btn-play');
  const iconPlay    = btnPlay?.querySelector('.icon-play');
  const iconPause   = btnPlay?.querySelector('.icon-pause');
  const seekEl      = document.getElementById('player-seek');
  const tCurEl      = document.getElementById('player-time-current');
  const tTotEl      = document.getElementById('player-time-total');
  const volEl       = document.getElementById('player-volume');
  const moodLabel   = document.getElementById('fs-mood-label');
  const btnRepeatOne= document.getElementById('btn-repeat-one');
  const emolistEl   = document.getElementById('fs-emotions');

  // Estado
  let currentList = [];
  let currentIndex = -1;

  // Mantener sincronizados los globals
  function setList(arr) {
      currentList = Array.isArray(arr) ? arr : [];
      window.currentList = currentList;
  }
  function setIndex(i) {
      currentIndex = Number.isInteger(i) ? i : -1;
      window.currentIndex = currentIndex;
  }


  // === Repeat One ===
  let repeatOne = JSON.parse(localStorage.getItem('fs-repeat-one') || 'false');
  function applyRepeatOne(isOn) {
    if (!audio) return;
    audio.loop = isOn;
    btnRepeatOne?.setAttribute('aria-pressed', String(isOn));
    if (btnRepeatOne) {
      btnRepeatOne.title = isOn ? 'Repetir esta canción (activo)' : 'Repetir esta canción';
    }
  }
  applyRepeatOne(repeatOne);

  // --- Helpers ---
  const mmss = secs => {
    secs = Math.max(0, Math.floor(+secs || 0));
    const m = Math.floor(secs / 60);
    const s = (secs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  function dzUrlExpired(u) {
    try {
      const exp = Number(new URL(u).searchParams.get('exp'));
      if (!exp) return false;
      const now = Math.floor(Date.now() / 1000);
      return now >= (exp - 15);
    } catch { return false; }
  }

  // --- Normalizador para captura ---
  function normalizeCapturePayload(input) {
    if (!input || typeof input !== 'object') return null;

    const id       = input.id ?? input.track_id ?? input.deezer_id ?? null;
    const title    = (typeof input.title === 'string' ? input.title : (input.titulo || '')).trim();
    const duration = Number(input.duration || input.duracion || 30) || 30;
    const preview  = (input.preview || input.preview_url || '').toString();

    let artistName = '';
    let artistId   = null;
    if (typeof input.artist === 'string') {
      artistName = input.artist;
    } else if (input.artist && typeof input.artist === 'object') {
      const a = input.artist;
      artistName = typeof a.name === 'string' ? a.name
              : (a.name && typeof a.name === 'object' && typeof a.name.name === 'string') ? a.name.name
              : (typeof a.title === 'string' ? a.title : '');
      artistId = a.id ?? (a.name && a.name.id) ?? null;
    } else if (typeof input.artista === 'string') {
      artistName = input.artista;
    }

    let albumTitle = '';
    let albumId    = null;
    let albumCover = '';
    if (typeof input.album === 'string') {
      albumTitle = input.album;
    } else if (input.album && typeof input.album === 'object') {
      const al = input.album;
      albumTitle = typeof al.title === 'string' ? al.title
               : (al.title && typeof al.title === 'object' && typeof al.title.title === 'string') ? al.title.title
               : (typeof al.name === 'string' ? al.name : '');
      albumId    = al.id ?? (al.title && al.title.id) ?? null;
      albumCover = typeof al.cover === 'string' ? al.cover
               : (al.title && typeof al.title.cover === 'string') ? al.title.cover
               : (typeof input.cover === 'string' ? input.cover : '');
    } else {
      albumTitle = (input.album_title || input.albumName || '').toString();
      albumCover = (input.cover || '').toString();
    }

    return {
      id,
      title,
      duration,
      preview,
      artist: { id: artistId ?? undefined, name: artistName || '' },
      album:  { id: albumId ?? undefined,  title: albumTitle || '—', cover: albumCover || '' },
    };
  }

  // === Emociones por track ===
  function renderEmotions(list) {
    if (!emolistEl) return;
    if (!Array.isArray(list) || !list.length) {
      emolistEl.innerHTML = '<span class="text-white/50 text-sm">Sin etiquetas</span>';
      return;
    }
    emolistEl.innerHTML = list.slice(0, 6).map(e => `
      <span class="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-white/10 text-white/80">
        ${e.emocion} <span class="opacity-70">(${Number(e.score).toFixed(2)})</span>
      </span>
    `).join(' ');
  }

  async function loadEmotionsFor(trackId) {
    if (!trackId) { renderEmotions([]); return; }
    try {
      const data = await window.apiFetchV1(ROUTES.trackEmotions(trackId));
      renderEmotions(Array.isArray(data) ? data : []);
    } catch { renderEmotions([]); }
  }

  // Artistas para UI
  function artistsInlineText(t) {
    const list = [t.artist, ...(t.contributors || [])].filter(Boolean);
    return list.length > 1 ? `${t.artist} · ${list.slice(1).join(' · ')}` : (t.artist || '');
  }
  function artistsFullList(t) {
    return [t.artist, ...(t.contributors || [])].filter(Boolean).join(', ');
  }

  // Stats
  function trackForStats(t) {
    return { id: t.id, title: t.title, artists: artistsFullList(t), cover: t.cover };
  }

  // Marquee
  function setupMarquee(wrapperEl) {
    if (!wrapperEl) return;
    const track = wrapperEl.querySelector('.fs-marq-track');
    const main  = wrapperEl.querySelector('.fs-marq-item:not(.fs-marq-dup)');
    const dup   = wrapperEl.querySelector('.fs-marq-dup');
    if (!track || !main || !dup) return;

    dup.textContent = main.textContent || '';

    const containerW = Math.floor(wrapperEl.clientWidth || 0);
    const textW      = Math.floor(main.scrollWidth || 0);
    const baseGap = 32;
    const gap = (textW <= containerW) ? (containerW - textW + baseGap) : baseGap;
    const cycle = textW + gap;

    const pxPerSec = 60;
    const seconds  = Math.max(3, cycle / pxPerSec);

    wrapperEl.classList.remove('no-anim');
    track.style.setProperty('--marq-gap', `${gap}px`);
    track.style.setProperty('--marq-cycle', `${cycle}px`);
    track.style.setProperty('--marq-speed', `${seconds}s`);
  }

  // Tabla
  const formatRow = (t, i) => {
    const artistsFull = artistsFullList(t);
    const artistsLine = artistsInlineText(t);
    return `
      <tr class="hover:bg-white/5 transition-colors fs-track-row" data-idx="${i}">
        <td class="px-4 py-3 text-white/60">${i + 1}</td>
        <td class="px-4 py-3">
          <div class="flex items-center gap-3">
            <img src="${t.cover || ''}" alt="" class="w-12 h-12 rounded-lg object-cover bg-white/10" />
            <div class="min-w-0">
              <p class="font-medium text-white truncate max-w-[200px]">${t.title}</p>
              <p class="text-white/60 text-xs truncate max-w-[260px]" title="${artistsFull}" data-artists="${i}">
                ${artistsLine}
              </p>
            </div>
          </div>
        </td>
        <td class="px-4 py-3 text-white/60 truncate max-w-[220px]">${t.album || ''}</td>
        <td class="px-4 py-3 text-white/60">${mmss(t.duration)}</td>
      </tr>
    `;
  };

  const wireRows = () => {
    tbody.querySelectorAll('tr.fs-track-row').forEach(row => {
      row.addEventListener('click', () => {
        const idx = parseInt(row.dataset.idx, 10);
        playIndex(idx, /*fromUserGesture=*/true);
      });
    });
  };

  // --- Búsqueda ---
  if (inpSearch) {
    inpSearch.addEventListener('keydown', async (e) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      const q = (inpSearch.value || '').trim();
      if (!q) return;
      await doSearch(q);
      inpSearch.value = '';
      inpSearch.blur();
    });
  }

  async function doSearch(q) {
    if (!q) return;
    tbody.innerHTML = `<tr><td colspan="4" class="px-4 py-4 text-white/70">Buscando “${q}”…</td></tr>`;
    try {
      const data = await window.apiFetchRoot(ROUTES.deezerSearch(q));
      if (!data || !Array.isArray(data?.data)) {
        tbody.innerHTML = `<tr><td colspan="4" class="px-4 py-4 text-white/70">Sin backend disponible (modo demo). Intenta más tarde.</td></tr>`;
        return;
      }
      const list = data.data;

      const items = list.map(x => ({
        id: x.id,
        title: x.title || '',
        duration: x.duration || 30,
        preview: x.preview || '',
        artist: x.artist?.name || '',
        contributors: Array.isArray(x.contributors) ? x.contributors.map(c => c.name).filter(Boolean) : [],
        album: x.album?.title || '',
        cover: x.album?.cover || '',
        top_emocion: null
      }));

      currentList = items;
      currentIndex = -1;
      window.currentList = currentList;
      window.currentIndex = currentIndex;

      if (!items.length) {
        tbody.innerHTML = `<tr><td colspan="4" class="px-4 py-4 text-white/70">Sin resultados.</td></tr>`;
        return;
      }

      tbody.innerHTML = items.map(formatRow).join('');
      wireRows();
      enrichContributors(currentList);
      localStorage.setItem('fs_last_query', q);
    } catch (err) {
      tbody.innerHTML = `<tr><td colspan="4" class="px-4 py-4 text-red-300">Error: ${err?.message || err}</td></tr>`;
      console.error('[FS] Error en doSearch', err);
    }
  }

  // Completar contributors con detalle del track
  async function enrichContributors(list) {
    const max = Math.min(list.length, 25);
    const chunkSize = 5;

    const updateArtistLine = (idx) => {
      const el = tbody.querySelector(`p[data-artists="${idx}"]`);
      if (!el) return;
      el.textContent = artistsInlineText(list[idx]);
      el.title = artistsFullList(list[idx]);
    };

    for (let i = 0; i < max; i += chunkSize) {
      const chunk = list.slice(i, i + chunkSize);
      try {
        const details = await Promise.all(
          chunk.map(t => window.apiFetchRoot(ROUTES.deezerTrack(t.id)).catch(() => null))
        );
        details.forEach((d, k) => {
          const idx = i + k;
          if (!d) return;
          const main = d.artist?.name || list[idx].artist || '';
          const contribs = Array.isArray(d.contributors)
            ? d.contributors.map(c => c.name).filter(n => n && n !== main)
            : [];
          if (contribs.length) {
            list[idx].contributors = contribs;
            updateArtistLine(idx);
          }
        });
      } catch (_) { /* no-op */ }
    }
  }

  // ====== Reproducción: utilidades ======
  function setPlayUI(isPlaying) {
    if (!btnPlay) return;
    btnPlay.dataset.state = isPlaying ? 'playing' : 'paused';
    if (iconPlay && iconPause) {
      iconPlay.classList.toggle('hidden', isPlaying);
      iconPause.classList.toggle('hidden', !isPlaying);
    }
  }

  function loadTrack(t) {
    if (!t.preview) return false;
    audio.src = t.preview;
    audio.currentTime = 0;

    if (titleTextEl)  titleTextEl.textContent  = t.title  || '—';
    if (artistTextEl) artistTextEl.textContent = t.artist || '—';
    setupMarquee(titleWrap);
    setupMarquee(artistWrap);

    if (coverEl) {
      const def = coverEl.dataset.defaultSrc;
      if (!coverEl.dataset.errBound) {
        coverEl.addEventListener('error', () => {
          if (coverEl.src === def) return;
          coverEl.src = def;
          coverEl.classList.add('img-placeholder');
        });
        coverEl.dataset.errBound = '1';
      }
      const hasCover = !!t.cover && typeof t.cover === 'string';
      coverEl.classList.toggle('img-placeholder', !hasCover);
      coverEl.src = hasCover ? t.cover : def;
    }
    if (tTotEl)  tTotEl.textContent = mmss(30); // previews ~30s
    if (seekEl)  seekEl.value = 0;

    renderEmotions([]);
    return true;
  }

  function captureTrackFireAndForget(trackLike) {
    try {
      const payload = normalizeCapturePayload(trackLike);
      if (!payload || !payload.id || !payload.title) return;

      const url = absApi(ROUTES.captureTrack);

      if (navigator.sendBeacon) {
        const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
        navigator.sendBeacon(url, blob);
      } else {
        fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          keepalive: true,
          credentials: 'include'
        }).catch(() => {});
      }
    } catch (_) {}
  }

  // --- Curación del preview para la misma pista
  async function healPreviewFor(index) {
    const t0 = currentList[index];
    if (!t0) return false;

    // Detalle por id si lo tenemos
    if (t0.dz_id || t0.id) {
      try {
        const d = await window.apiFetchRoot(ROUTES.deezerTrack(t0.dz_id || t0.id));
        if (d?.preview) {
          t0.preview  = d.preview;
          t0.duration = d.duration || t0.duration || 30;
          t0.cover    = d.album?.cover || t0.cover || '';
          t0.artist   = d.artist?.name || t0.artist || '';
          if (Array.isArray(d.contributors)) {
            t0.contributors = d.contributors.map(c => c.name).filter(Boolean);
          }
          captureTrackFireAndForget({
            id: d.id || t0.id,
            title: t0.title,
            duration: t0.duration,
            preview: t0.preview,
            artist: { id: d.artist?.id, name: t0.artist },
            album: { id: d.album?.id, title: d.album?.title || t0.album, cover: t0.cover }
          });
          if (t0.preview && !dzUrlExpired(t0.preview)) return true;
        }
      } catch (_) {}
    }

    // Búsqueda por título + artista
    try {
      const q1 = [t0.title, t0.artist].filter(Boolean).join(' ');
      if (q1) {
        const json = await window.apiFetchRoot(ROUTES.deezerSearch(q1));
        const cand = (json?.data || []).find(x => x.preview);
        if (cand?.preview) {
          const main = cand.artist?.name || '';
          const contribs = Array.isArray(cand.contributors)
            ? cand.contributors.map(c => c.name).filter(n => n && n !== main)
            : [];
          Object.assign(t0, {
            dz_id: cand.id,
            preview: cand.preview,
            duration: cand.duration || 30,
            cover: cand.album?.cover || t0.cover || '',
            artist: main || t0.artist || '',
            contributors: contribs,
            album: cand.album?.title || t0.album || ''
          });
          captureTrackFireAndForget({
            id: cand.id,
            title: t0.title,
            duration: t0.duration,
            preview: t0.preview,
            artist: { id: cand.artist?.id, name: t0.artist },
            album:  { id: cand.album?.id, title: t0.album, cover: t0.cover }
          });
          if (t0.preview && !dzUrlExpired(t0.preview)) return true;
        }
      }
    } catch (_) {}

    // Búsqueda por título solo
    try {
      const q2 = (t0.title || '').trim();
      if (q2) {
        const json = await window.apiFetchRoot(ROUTES.deezerSearch(q2));
        const cand = (json?.data || []).find(x => x.preview);
        if (cand?.preview) {
          const main = cand.artist?.name || '';
          const contribs = Array.isArray(cand.contributors)
            ? cand.contributors.map(c => c.name).filter(n => n && n !== main)
            : [];
          Object.assign(t0, {
            dz_id: cand.id,
            preview: cand.preview,
            duration: cand.duration || 30,
            cover: cand.album?.cover || t0.cover || '',
            artist: main || t0.artist || '',
            contributors: contribs,
            album: cand.album?.title || t0.album || ''
          });
          captureTrackFireAndForget({
            id: cand.id,
            title: t0.title,
            duration: t0.duration,
            preview: t0.preview,
            artist: { id: cand.artist?.id, name: t0.artist },
            album:  { id: cand.album?.id, title: t0.album, cover: t0.cover }
          });
          if (t0.preview && !dzUrlExpired(t0.preview)) return true;
        }
      }
    } catch (_) {}

    return false;
  }

  // ====== Reproducción SIN delay para pistas sanas ======
  let playTxnId = 0;
  let playBusy  = false;
  let healedOnceFor = new Map();

  async function playIndex(idx, fromUserGesture = false) {
    if (idx < 0 || idx >= currentList.length) return;

    const myTxn = ++playTxnId;
    while (playBusy) { await new Promise(r => setTimeout(r, 12)); }
    playBusy = true;

    try {
      const t = currentList[idx];

      if (t.preview && !dzUrlExpired(t.preview)) {
        setIndex(idx);
        if (!loadTrack(t)) { setPlayUI(false); return; }

        try {
          const p = audio.play();
          if (p && typeof p.then === 'function') await p;
          setPlayUI(true);
          window.setCurrentTrack && window.setCurrentTrack(trackForStats(t));
          prefetchNext();
          captureTrackFireAndForget(t);
          loadEmotionsFor(t.id);
          healedOnceFor.set(idx, false);
        } catch (errPlayFast) {
          const healed = await healPreviewFor(idx);
          if (myTxn !== playTxnId) return;
          if (healed && loadTrack(currentList[idx])) {
            const p2 = audio.play();
            if (p2 && typeof p2.then === 'function') await p2;
            setPlayUI(true);
            window.setCurrentTrack && window.setCurrentTrack(trackForStats(currentList[idx]));
            prefetchNext();
            captureTrackFireAndForget(currentList[idx]);
            loadEmotionsFor(currentList[idx].id);
          } else {
            setPlayUI(false);
            console.warn('No se pudo curar preview (ruta rápida).');
          }
        }
        return;
      }

      const healed = await healPreviewFor(idx);
      if (myTxn !== playTxnId) return;
      if (!healed) { setPlayUI(false); return; }

      setIndex(idx);
      if (!loadTrack(currentList[idx])) { setPlayUI(false); return; }
      const p = audio.play();
      if (p && typeof p.then === 'function') await p;
      setPlayUI(true);
      window.setCurrentTrack && window.setCurrentTrack(trackForStats(currentList[idx]));
      prefetchNext();
      captureTrackFireAndForget(currentList[idx]);
      loadEmotionsFor(currentList[idx].id);
      healedOnceFor.set(idx, false);
    } catch (err) {
      setPlayUI(false);
      console.warn('playIndex error:', err);
    } finally {
      playBusy = false;
    }
  }
  window.playIndex = playIndex;

  // --- Prefetch siguiente ---
  let _nextAudio;
  function prefetchNext() {
    if (!currentList.length || currentIndex < 0) return;
    const nextIndex = (currentIndex + 1) % currentList.length;
    const n = currentList[nextIndex];
    if (!n?.preview || dzUrlExpired(n.preview)) return;
    try {
      if (_nextAudio) { _nextAudio.src = ''; _nextAudio = null; }
      _nextAudio = new Audio();
      _nextAudio.preload = 'auto';
      _nextAudio.src = n.preview;
    } catch(_) {}
  }

  try { audio.preload = 'auto'; } catch(_){}

  audio.addEventListener('error', async () => {
    if (currentIndex < 0 || !currentList[currentIndex]) return;
    if (healedOnceFor.get(currentIndex)) return;
    healedOnceFor.set(currentIndex, true);
    const ok = await healPreviewFor(currentIndex);
    if (ok && loadTrack(currentList[currentIndex])) {
      try {
        const p = audio.play();
        if (p && typeof p.then === 'function') await p;
        setPlayUI(true);
      } catch (_) { setPlayUI(false); }
    }
  });

  // Controles
  const btnPrev = document.getElementById('btn-prev');
  const btnNext = document.getElementById('btn-next');

  btnRepeatOne?.addEventListener('click', () => {
    repeatOne = !repeatOne;
    applyRepeatOne(repeatOne);
    localStorage.setItem('fs-repeat-one', JSON.stringify(repeatOne));
  });

  audio?.addEventListener('loadedmetadata', () => { audio.loop = repeatOne; });

  btnPlay?.addEventListener('click', async () => {
    if (!audio.src) {
      if (currentList.length) return playIndex(0, true);
      return;
    }
    if (audio.paused) {
      try { await audio.play(); setPlayUI(true); } catch { /* silencioso */ }
    } else {
      audio.pause();
      setPlayUI(false);
    }
  });

  btnPrev?.addEventListener('click', () => {
    if (!currentList.length) return;
    const prevIndex = (currentIndex - 1 + currentList.length) % currentList.length;
    playIndex(prevIndex, true);
  });
  btnNext?.addEventListener('click', () => {
    if (!currentList.length) return;
    const nextIndex = (currentIndex + 1) % currentList.length;
    playIndex(nextIndex, true);
  });

  // Seek / tiempo
  seekEl?.addEventListener('input', () => {
    const pct = Number(seekEl.value || 0) / 100;
    audio.currentTime = 30 * pct;
  });
  audio.addEventListener('timeupdate', () => {
    const cur = Math.min(30, audio.currentTime || 0);
    if (tCurEl) tCurEl.textContent = mmss(cur);
    if (seekEl) seekEl.value = String(Math.floor((cur / 30) * 100));
  });

  audio.addEventListener('ended', async () => {
    if (audio.loop) return; // repeat-one activo
    if (!currentList.length) return;
    const nextIndex = (currentIndex + 1) % currentList.length;
    await playIndex(nextIndex, true);
  });

  // Volumen
  if (volEl) {
    audio.volume = (Number(volEl.value) || 70) / 100;
    volEl.addEventListener('input', () => {
      audio.volume = (Number(volEl.value) || 0) / 100;
    });
  }

  // Marquee on resize
  window.addEventListener('resize', () => {
    setupMarquee(titleWrap);
    setupMarquee(artistWrap);
  });

  // ==== EMOCIONES: barra ====
  const EMO_MAP = { happy:'feliz', sad:'triste', love:'amor', angry:'enojado', calm:'calmada', neutral:'neutral' };
  const EMO_LABEL_ES = { feliz:'Feliz', triste:'Triste', enojado:'Enojado', amor:'Amor', calmada:'Calmada', neutral:'Neutral' };
  const LS_MOOD_KEY = 'fs_mood';

  // Pre-rehidratación de previews para emociones
  async function warmPreviews(list, howMany = 10, concurrency = 4) {
    const targets = list
      .map((t, i) => ({ t, i }))
      .filter(({ t }) => !t.preview || dzUrlExpired(t.preview))
      .slice(0, howMany);

    let cursor = 0;
    async function worker() {
      while (cursor < targets.length) {
        const idx = cursor++;
        await healPreviewFor(targets[idx].i);
      }
    }
    const workers = Array.from({ length: Math.min(concurrency, targets.length) }, worker);
    await Promise.all(workers).catch(()=>{});
  }

  async function loadEmotionList(emocionClave) {
    tbody.innerHTML = `<tr><td colspan="4" class="px-4 py-4 text-white/70">Cargando ${emocionClave}…</td></tr>`;
    try {
      const data = await window.apiFetchRoot(ROUTES.songsByEmotion(emocionClave, 25));
      if (!data) {
        tbody.innerHTML = `<tr><td colspan="4" class="px-4 py-4 text-white/70">Sin backend disponible (modo demo).</td></tr>`;
        return;
      }
      const items = (data.results || []).map(x => ({
        id: x.id,
        title: x.titulo,
        duration: x.duracion || 30,
        preview: x.preview || '',
        artist: x.artista || '',
        contributors: [],
        album: x.album || '',
        cover: x.cover || ''
      }));

      currentList = items;
      currentIndex = -1;
      window.currentList = currentList;
      window.currentIndex = currentIndex;


      if (!items.length) {
        tbody.innerHTML = `<tr><td colspan="4" class="px-4 py-4 text-white/70">Aún no hay canciones para <b>${emocionClave}</b>. Reproduce desde la búsqueda para sembrarlas ✨</td></tr>`;
        return;
      }

      tbody.innerHTML = items.map(formatRow).join('');
      wireRows();

      warmPreviews(currentList, 10, 4);
    } catch {
      tbody.innerHTML = `<tr><td colspan="4" class="px-4 py-4 text-red-300">Error cargando ${emocionClave}</td></tr>`;
    }
  }

  // === Reproducir desde el historial del perfil ===
    window.replayRecent = async function replayRecent(rec) {
      try {
        const artists = (rec.artists || '').split(',').map(s => s.trim()).filter(Boolean);
        const mainArtist = artists[0] || '';

        const t = {
          id: String(rec.id || ''),
          title: rec.title || '',
          duration: 30,
          preview: '',
          artist: mainArtist,
          contributors: artists.slice(1),
          album: '',
          cover: rec.cover || ''
        };

        currentList = [t];
        currentIndex = -1;
        window.currentList = currentList;
        window.currentIndex = currentIndex;


        await healPreviewFor(0);

        await playIndex(0, true);
      } catch (e) {
        console.warn('[FS] replayRecent fallo:', e);
      }
    };

  (function initEmojiBar(){
    const row = document.getElementById('fs-emoji-row');
    if (!row) return;

    const chips = row.querySelectorAll('.emoji-chip');

    function setActiveMood(key) {
      if (!EMO_MAP[key]) key = 'happy';
      const clave = EMO_MAP[key];
      chips.forEach(c => {
        const isActive = c.dataset.emoji === key;
        c.dataset.active = isActive ? 'true' : 'false';
        c.setAttribute('aria-pressed', isActive ? 'true' : 'false');
      });
      if (moodLabel) moodLabel.textContent = EMO_LABEL_ES[clave] || '—';
      localStorage.setItem(LS_MOOD_KEY, key);
      loadEmotionList(clave);
    }

    chips.forEach(btn => {
      btn.addEventListener('click', () => {
        const key = btn.getAttribute('data-emoji');
        setActiveMood(key);
      });
    });

    const startKey =
      localStorage.getItem(LS_MOOD_KEY) ||
      (row.querySelector('[data-active="true"]')?.getAttribute('data-emoji')) ||
      'happy';

    setActiveMood(startKey);
  })();

  // Búsqueda inicial opcional
  // const LAST_Q_KEY = 'fs_last_query';
  // const initialQ = localStorage.getItem(LAST_Q_KEY) || 'bad bunny';
  // doSearch(initialQ);
  // if (inpSearch) inpSearch.value = initialQ;



    // === API pública para reproducir una lista (usada por el modal) ===
    window.fsPlayTracks = async function fsPlayTracks(list, startIndex = 0) {
      try {
        if (!Array.isArray(list) || !list.length) return;

        // Normaliza al formato del player
        const items = list.map(x => ({
          id: x.id,
          title: x.title || x.titulo || '',
          duration: Number(x.duration || x.duracion || 30) || 30,
          preview: (x.preview || x.preview_url || ''),
          artist: x.artist || x.artista || '',
          contributors: Array.isArray(x.contributors) ? x.contributors : [],
          album: x.album || '',
          cover: x.cover || ''
        }));

        setList(items);
        setIndex(-1);

        // cura preview si falta y reproduce
        const first = Math.max(0, Math.min(startIndex, items.length - 1));
        await playIndex(first, true);
      } catch (e) {
        console.warn('[fsPlayTracks] fallo:', e);
      }
    };


});
