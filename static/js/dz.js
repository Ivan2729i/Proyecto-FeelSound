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

  // Estado
  let currentList = [];
  let currentIndex = -1;

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
        playIndex(idx);
      });
    });
  };

  // --- Búsqueda ---
  if (inpSearch) {
    inpSearch.addEventListener('keydown', async (e) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      await doSearch((inpSearch.value || '').trim());
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

    if (coverEl) coverEl.src = t.cover || '';
    if (tTotEl)  tTotEl.textContent = mmss(30); // previews ~30s
    if (seekEl)  seekEl.value = 0;

    return true;
  }

  async function playIndex(idx) {
    if (idx < 0 || idx >= currentList.length) return;
    const t = currentList[idx];
    if (!loadTrack(t)) return;
    currentIndex = idx;
    await audio.play();
    setPlayUI(true);
  }

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
  doSearch(initialQ);
  if (inpSearch) inpSearch.value = initialQ;
});
