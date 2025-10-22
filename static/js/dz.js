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


  // Estado
  let currentList = [];
  let currentIndex = -1;

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
      const res = await fetch(`/api/deezer/search/?type=track&q=${encodeURIComponent(q)}`);
      const json = await res.json();

      const items = (json.data || []).map(x => {
        const main = x.artist?.name || '';
        const contribs = Array.isArray(x.contributors)
          ? x.contributors.map(c => c.name).filter(n => n && n !== main)
          : [];
        return {
          id: x.id,
          title: x.title,
          duration: x.duration,
          preview: x.preview,
          artist: main,
          contributors: contribs,
          album: x.album?.title || '',
          cover: x.album?.cover || ''
        };
      });

      currentList = items;
      currentIndex = -1;

      if (!items.length) {
        tbody.innerHTML = `<tr><td colspan="4" class="px-4 py-4 text-white/70">Sin resultados.</td></tr>`;
        return;
      }

      tbody.innerHTML = items.map(formatRow).join('');
      wireRows();
      enrichContributors(currentList);
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

    return true;
  }

  // --- Captura sin bloquear la reproducción ---
  function captureTrackFireAndForget(t) {
    try {
      const payload = {
        id: t.id,
        title: t.title,
        duration: t.duration || 30,
        preview: t.preview || '',
        artist: { name: t.artist || '' },
        album:  { title: t.album || '', cover: t.cover || '' }
      };

      if (navigator.sendBeacon) {
        const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
        navigator.sendBeacon('/api/capture/deezer-track', blob);
      } else {
        fetch('/api/capture/deezer-track', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          keepalive: true,
        }).catch(()=>{});
      }
    } catch(_) {}
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
          });
        } else {
          setPlayUI(true);
          prefetchNext();
          captureTrackFireAndForget(t);
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

  // Al terminar, avanzar en bucle a la siguiente
  audio.addEventListener('ended', async () => {
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

    async function captureDeezerTrack(trackObj) {
      try {
        const r = await fetch(ROUTES.captureTrack, {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify(trackObj)
        });
        return await r.json().catch(()=>null);
      } catch { return null; }
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

        t.id          = cand.id;
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

    // Cargar y pintar la tabla usando tu mismo formato
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

    // Barra de emojis → recordar selección, marcar activo, actualizar label y cargar lista
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
