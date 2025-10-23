// === FeelSound · Deezer Simple API integration ===
document.addEventListener('DOMContentLoaded', () => {
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
  const moodLabel = document.getElementById('fs-mood-label');
  const btnRepeatOne = document.getElementById('btn-repeat-one');
  const emolistEl   = document.getElementById('fs-emotions');


  // Estado
  let currentList = [];
  let currentIndex = -1;

  // === Repeat One (repetir solo la canción actual) ===
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


  function dzUrlExpired(u) {
    try {
      const exp = Number(new URL(u).searchParams.get('exp'));
      if (!exp) return false;
      const now = Math.floor(Date.now() / 1000);
      return now >= (exp - 15);
    } catch {
      return false;
    }
  }

  // --- Helpers ---
  const mmss = secs => {
    secs = Math.max(0, Math.floor(+secs || 0));
    const m = Math.floor(secs / 60);
    const s = (secs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  // --- Normalizador para el payload ---
    function normalizeCapturePayload(input) {
      if (!input || typeof input !== 'object') return null;

      const id       = input.id ?? input.track_id ?? input.deezer_id ?? null;
      const title    = (typeof input.title === 'string' ? input.title : (input.titulo || '')).trim();
      const duration = Number(input.duration || input.duracion || 30) || 30;
      const preview  = (input.preview || input.preview_url || '').toString();

      // ARTISTA: permite string u objeto
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

      // ÁLBUM: permite string u objeto
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
        const r = await fetch(`/api/v1/tracks/${trackId}/emotions`, { headers: { "Accept": "application/json" }});
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const data = await r.json();
        // data = [{emocion:"Feliz", score:"0.92", source:"..."}, ...]
        renderEmotions(Array.isArray(data) ? data : []);
      } catch (err) {
        console.warn('Emotions error:', err);
        renderEmotions([]);
      }
    }


  // Línea de artistas para la tabla
  function artistsInlineText(t) {
    const list = [t.artist, ...(t.contributors || [])].filter(Boolean);
    return list.length > 1 ? `${t.artist} · ${list.slice(1).join(' · ')}` : (t.artist || '');
  }
  function artistsFullList(t) {
    return [t.artist, ...(t.contributors || [])].filter(Boolean).join(', ');
  }

  // --- Adaptar el track para Stats (plays/tiempo/recientes)
  function trackForStats(t) {
    return {
      id: t.id,
      title: t.title,
      artists: artistsFullList(t),
      cover: t.cover
    };
  }


  // --- Marquee infinito ---
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

    // Velocidad
    const pxPerSec = 60;
    const seconds  = Math.max(3, cycle / pxPerSec);

    wrapperEl.classList.remove('no-anim');
    track.style.setProperty('--marq-gap', `${gap}px`);
    track.style.setProperty('--marq-cycle', `${cycle}px`);
    track.style.setProperty('--marq-speed', `${seconds}s`);
  }

  // --- Render de filas (tabla) ---
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
        const res = await fetch(`/api/v1/tracks?query=${encodeURIComponent(q)}`, {
          headers: { "Accept": "application/json" }
        });
        if (!res.ok) throw new Error(`API ${res.status}`);
        const data = await res.json();
        const list = Array.isArray(data) ? data : (data.results || []);

        const items = list.map(x => ({
          id: x.id,
          title: x.titulo || '',
          duration: x.duracion || 30,
          preview: x.preview_url || '',
          artist: x.artista || '',
          contributors: [],
          album: x.album || '',
          cover: x.cover || '',
          top_emocion: x.top_emocion || null
        }));

        currentList = items;
        currentIndex = -1;

        if (!items.length) {
          tbody.innerHTML = `<tr><td colspan="4" class="px-4 py-4 text-white/70">Sin resultados.</td></tr>`;
          return;
        }

        tbody.innerHTML = items.map(formatRow).join('');
        wireRows();

        localStorage.setItem('fs_last_query', q);
      } catch (err) {
        tbody.innerHTML = `<tr><td colspan="4" class="px-4 py-4 text-red-300">Error: ${err}</td></tr>`;
      }
  }


  // Completa contributors pidiendo /track/:id y actualiza la línea visual
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
          chunk.map(t => fetch(`/api/deezer/track/${t.id}/`).then(r => r.json()).catch(() => null))
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
      } catch (_) { /* silencioso */ }
    }
  }

  // --- Reproducción ---
  function setPlayUI(isPlaying) {
    if (!btnPlay) return;
    btnPlay.dataset.state = isPlaying ? 'playing' : 'paused';
    if (iconPlay && iconPause) {
      iconPlay.classList.toggle('hidden', isPlaying);
      iconPause.classList.toggle('hidden', !isPlaying);
    }
  }

  function loadTrack(t) {
    if (!t.preview) { alert('Este track no tiene preview disponible.'); return false; }

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
      if (hasCover) {
        coverEl.classList.remove('img-placeholder');
        coverEl.src = t.cover;
      } else {
        coverEl.classList.add('img-placeholder');
        coverEl.src = def;
      }
    }
    if (tTotEl)  tTotEl.textContent = mmss(30); // previews ~30s
    if (seekEl)  seekEl.value = 0;

    renderEmotions([]);
    return true;
  }

  // --- Captura sin bloquear la reproducción ---
  function captureTrackFireAndForget(trackLike) {
    try {
      const payload = normalizeCapturePayload(trackLike);
      if (!payload || !payload.id || !payload.title) return;

      if (navigator.sendBeacon) {
        const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
        navigator.sendBeacon('/api/capture/deezer-track', blob);
      } else {
        fetch('/api/capture/deezer-track', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          keepalive: true,
        }).catch(() => {});
      }
    } catch (_) {}
  }

  async function playIndex(idx, fromUserGesture = false) {
    if (idx < 0 || idx >= currentList.length) return;

    let t = currentList[idx];
    const hasFreshPreview = !!t.preview && !dzUrlExpired(t.preview);
    if (fromUserGesture && hasFreshPreview) {
      currentIndex = idx;
      if (!loadTrack(t)) return;

      window.setCurrentTrack(trackForStats(t));
      const tryPlayFast = () => {
        const p = audio.play();
        if (p && typeof p.then === 'function') {
          return p.then(() => {
            setPlayUI(true);
            prefetchNext();
            captureTrackFireAndForget(t);
            loadEmotionsFor(t.id);
          });
        } else {
          setPlayUI(true);
          prefetchNext();
          captureTrackFireAndForget(t);
          loadEmotionsFor(t.id); // cargar emociones del track actual
          return Promise.resolve();
        }
      };

      tryPlayFast().catch(async () => {
        try {
          await ensurePreviewFor(idx, true);
          t = currentList[idx];
          if (!loadTrack(t)) return;
          window.setCurrentTrack(trackForStats(t));
          const p2 = audio.play();
          if (p2 && typeof p2.then === 'function') await p2;
          setPlayUI(true);
          prefetchNext();
          captureTrackFireAndForget(t);
          loadEmotionsFor(t.id); // cargar emociones del track actual
        } catch {
          setPlayUI(false);
          alert('No se pudo reproducir el preview. Prueba con otra pista.');
        }
      });

      if (dzUrlExpired(t.preview)) ensurePreviewFor(idx, true);
      return;
    }


    let triedRefresh = false;
    const tryPrepare = async () => {
      if (!currentList[idx].preview || dzUrlExpired(currentList[idx].preview)) {
        await ensurePreviewFor(idx, true);
        t = currentList[idx];
      }
      if (!loadTrack(t)) return false;
      currentIndex = idx;
      window.setCurrentTrack(trackForStats(t));
      audio.pause();
      audio.currentTime = 0;
      audio.load();
      return true;
    };

    const tryPlay = async () => {
      const p = audio.play();
      if (p && typeof p.then === 'function') await p;
      setPlayUI(true);
      prefetchNext();
      captureTrackFireAndForget(t);
      loadEmotionsFor(t.id);
    };
    try {
      const ok = await tryPrepare();
      if (!ok) return;
      await tryPlay();
    } catch (err) {
      console.warn('play failed, trying refresh...', err);
      if (!triedRefresh) {
        triedRefresh = true;
        await ensurePreviewFor(idx, true);
        const ok = await tryPrepare();
        if (ok) {
          try { await tryPlay(); return; } catch (_) {}
        }
      }
      setPlayUI(false);
      alert('No se pudo reproducir el preview (enlace expirado o bloqueo del navegador). Prueba con otra pista.');
    }
  }



  // --- Prefetch del siguiente preview ---
  let _nextAudio;
  function prefetchNext() {
    if (!currentList.length || currentIndex < 0) return;
    const nextIndex = (currentIndex + 1) % currentList.length;
    const n = currentList[nextIndex];
    if (!n?.preview) return;
    try {
      if (_nextAudio) { _nextAudio.src = ''; _nextAudio = null; }
      _nextAudio = new Audio();
      _nextAudio.preload = 'auto';
      _nextAudio.src = n.preview;
    } catch(_) {}
  }
  try {
    audio.preload = 'auto';
    // audio.crossOrigin = 'anonymous';
  } catch(_){}

  // Cuando empiece o termine, prepara el siguiente
  audio.addEventListener('play', prefetchNext);
  audio.addEventListener('ended', prefetchNext);

  // Si falla la carga del preview, refresca y reintenta 1 vez
    audio.addEventListener('error', async () => {
    if (currentIndex < 0 || !currentList[currentIndex]) return;
    try {
      await ensurePreviewFor(currentIndex, true);
      const t = currentList[currentIndex];
      if (!loadTrack(t)) return;
      window.setCurrentTrack(trackForStats(t));
      const p = audio.play();
      if (p && typeof p.then === 'function') await p;
      setPlayUI(true);
    } catch (_) {
      setPlayUI(false);
    }
  });

  // Botones
  const btnPrev = document.getElementById('btn-prev');
  const btnNext = document.getElementById('btn-next');

  // Toggle repeat-one
  btnRepeatOne?.addEventListener('click', () => {
    repeatOne = !repeatOne;
    applyRepeatOne(repeatOne);
    localStorage.setItem('fs-repeat-one', JSON.stringify(repeatOne));
  });

  audio?.addEventListener('loadedmetadata', () => {
    audio.loop = repeatOne;
  });


  btnPlay?.addEventListener('click', async () => {
    if (!audio.src) {
      if (currentList.length) return playIndex(0);
      return;
    }
    if (audio.paused) {
      await audio.play();
      setPlayUI(true);
    } else {
      audio.pause();
      setPlayUI(false);
    }
  });

  // Prev/Next
  btnPrev?.addEventListener('click', () => {
    if (!currentList.length) return;
    const prevIndex = (currentIndex - 1 + currentList.length) % currentList.length;
    playIndex(prevIndex);
  });
  btnNext?.addEventListener('click', () => {
    if (!currentList.length) return;
    const nextIndex = (currentIndex + 1) % currentList.length;
    playIndex(nextIndex);
  });

  // Seek y tiempos
  seekEl?.addEventListener('input', () => {
    const pct = Number(seekEl.value || 0) / 100;
    audio.currentTime = 30 * pct;
  });

  audio.addEventListener('timeupdate', () => {
    const cur = Math.min(30, audio.currentTime || 0);
    if (tCurEl) tCurEl.textContent = mmss(cur);
    if (seekEl) seekEl.value = String(Math.floor((cur / 30) * 100));
  });

  // Al terminar
  audio.addEventListener('ended', async () => {
    // Si repeat-one está activo, audio reinicia automáticamente.
    if (audio.loop) return;

    if (!currentList.length) return;
    const nextIndex = (currentIndex + 1) % currentList.length;
    await playIndex(nextIndex);
  });


  // Volumen
  if (volEl) {
    audio.volume = (Number(volEl.value) || 70) / 100;
    volEl.addEventListener('input', () => {
      audio.volume = (Number(volEl.value) || 0) / 100;
    });
  }

  // Recalcular marquee al cambiar tamaño
  window.addEventListener('resize', () => {
    setupMarquee(titleWrap);
    setupMarquee(artistWrap);
  });

  // --- Búsqueda automática inicial (última o por defecto) ---
  const LAST_Q_KEY = 'fs_last_query';
  const initialQ = localStorage.getItem(LAST_Q_KEY) || 'bad bunny';
  // doSearch(initialQ);
  // if (inpSearch) inpSearch.value = initialQ;


  // ==== EMOCIONES ====
    const ROUTES = {
      songsByEmotion: (e, limit=25) => `/api/songs?emocion=${encodeURIComponent(e)}&limit=${limit}`,
      captureTrack: `/api/capture/deezer-track`,
    };

    // Mapas de emoción: clave UI → API y etiqueta visible
    const EMO_MAP = { happy:'feliz', sad:'triste', love:'amor', angry:'enojado', calm:'calmada', neutral:'neutral' };
    const EMO_UI  = {  happy:'Feliz', sad:'Triste', love:'Amor', angry:'Enojado', calm:'Calmada', neutral:'Neutral' };
    const LS_MOOD_KEY = 'fs_mood';
    const EMO_LABEL_ES = {
        feliz: 'Feliz',
        triste: 'Triste',
        enojado: 'Enojado',
        amor: 'Amor',
        calmada: 'Calmada',
        neutral: 'Neutral',
    };

    async function captureDeezerTrack(trackLike) {
      try {
        const payload = normalizeCapturePayload(trackLike);
        if (!payload || !payload.id || !payload.title) return null;

        const r = await fetch('/api/capture/deezer-track', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        return await r.json().catch(() => null);
      } catch {
        return null;
      }
    }

    async function ensurePreviewFor(index, force=false) {
      const t = currentList[index];
      if (!t) return t;

      if (!force && t.preview && !dzUrlExpired(t.preview)) return t;

      const q = [t.title, t.artist].filter(Boolean).join(' ');
      try {
        const res = await fetch(`/api/deezer/search/?type=track&q=${encodeURIComponent(q)}`);
        const json = await res.json();
        const cand = (json.data || []).find(x => x.preview);
        if (!cand) return t;

        const main = cand.artist?.name || '';
        const contribs = Array.isArray(cand.contributors)
          ? cand.contributors.map(c => c.name).filter(n => n && n !== main)
          : [];

        t.dz_id       = cand.id;
        t.preview     = cand.preview || '';
        t.duration    = cand.duration || 30;
        t.cover       = cand.album?.cover || t.cover || '';
        t.artist      = main || t.artist || '';
        t.contributors= contribs;
        t.album       = cand.album?.title || t.album || '';

        captureTrackFireAndForget({
          id: cand.id,
          title: t.title,
          duration: t.duration,
          preview: t.preview,
          artist: { id: cand.artist?.id, name: t.artist },
          album:  { id: cand.album?.id, title: t.album, cover: t.cover }
        });

        return t;
      } catch {
        return t;
      }
    }

    // --- Reproducir un item del historial ---
    window.replayRecent = async function replayRecent(rec) {
      try {
        let d = null;
        try {
          d = await fetch(`/api/deezer/track/${rec.id}/`).then(r => r.json());
        } catch (_) { d = null; }

        let candidate = null;
        if (d && (d.preview || d.preview_url || d.previewURL)) {
          const main = d.artist?.name || (rec.artists || '').split(',')[0] || '';
          candidate = {
            id: d.id || rec.id,
            title: d.title || rec.title,
            duration: d.duration || 30,
            preview: d.preview || d.preview_url || d.previewURL || '',
            artist: main,
            contributors: Array.isArray(d.contributors) ? d.contributors.map(c=>c.name) : [],
            album: d.album?.title || '',
            cover: d.album?.cover || rec.cover || ''
          };
        }

        if (!candidate || !candidate.preview) {
          const firstArtist = (rec.artists || '').split(',')[0] || '';
          const q = [rec.title, firstArtist].filter(Boolean).join(' ');
          const res = await fetch(`/api/deezer/search/?type=track&q=${encodeURIComponent(q)}`);
          const json = await res.json().catch(()=>({}));
          const list = (json.data || []).filter(x => !!x.preview);

          if (list.length) {
            const x = list[0];
            const main = x.artist?.name || firstArtist;
            const contribs = Array.isArray(x.contributors)
              ? x.contributors.map(c => c.name).filter(n => n && n !== main)
              : [];
            candidate = {
              id: x.id,
              title: x.title || rec.title,
              duration: x.duration || 30,
              preview: x.preview || '',
              artist: main,
              contributors: contribs,
              album: x.album?.title || '',
              cover: x.album?.cover || rec.cover || ''
            };
          }
        }

        if (!candidate || !candidate.preview) {
          alert('No se encontró un preview reproducible para esta canción.');
          return;
        }

        currentList = [candidate];
        currentIndex = -1;
        await playIndex(0, /*fromUserGesture=*/true);
      } catch (err) {
        console.error('replayRecent error:', err);
        alert('No se pudo reproducir esta canción del historial.');
      }
    };


    // Cargar la tabla
    async function loadEmotionList(emocionClave) {
      tbody.innerHTML = `<tr><td colspan="4" class="px-4 py-4 text-white/70">Cargando ${emocionClave}…</td></tr>`;
      try {
        const r = await fetch(ROUTES.songsByEmotion(emocionClave, 25));
        const data = await r.json();
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

        if (!items.length) {
          tbody.innerHTML = `<tr><td colspan="4" class="px-4 py-4 text-white/70">Aún no hay canciones para <b>${emocionClave}</b>. Reproduce desde la búsqueda para sembrarlas ✨</td></tr>`;
          return;
        }

        tbody.innerHTML = items.map(formatRow).join('');
        wireRows();
      } catch (err) {
        tbody.innerHTML = `<tr><td colspan="4" class="px-4 py-4 text-red-300">Error cargando ${emocionClave}</td></tr>`;
      }
    }

    // Barra de emojis
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

      // Click chips
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

});
