document.addEventListener('DOMContentLoaded', () => {
    const loginTab = document.getElementById('login-tab');
    const registerTab = document.getElementById('register-tab');
    const loginForm = document.getElementById('login-form');
    const registerForm = document.getElementById('register-form');
    const contextDiv = document.getElementById('django-context');
    const activeTab = contextDiv.getAttribute('data-active-tab');

    function showLogin() {
        loginForm.classList.remove('hidden');
        registerForm.classList.add('hidden');

        // Estilos para la pestaña de Login (Activa)
        loginTab.classList.add('bg-[#4285F4]', 'text-white');
        loginTab.classList.remove('text-gray-400');

        // Estilos para la pestaña de Registro (Inactiva)
        registerTab.classList.remove('bg-[#4285F4]', 'text-white');
        registerTab.classList.add('text-gray-400');
    }

    function showRegister() {
        registerForm.classList.remove('hidden');
        loginForm.classList.add('hidden');

        // Estilos para la pestaña de Registro (Activa)
        registerTab.classList.add('bg-[#4285F4]', 'text-white');
        registerTab.classList.remove('text-gray-400');

        // Estilos para la pestaña de Login (Inactiva)
        loginTab.classList.remove('bg-[#4285F4]', 'text-white');
        loginTab.classList.add('text-gray-400');
    }

    loginTab.addEventListener('click', showLogin);
    registerTab.addEventListener('click', showRegister);

    // Activa la pestaña correcta al cargar la página
    if (activeTab === 'register') {
        showRegister();
    } else {
        showLogin();
    }
});

// --- Toasts auto-cierre + animación ---
document.addEventListener('DOMContentLoaded', () => {
  const toasts = document.querySelectorAll('.toast-msg');

  toasts.forEach((t) => {
    const type = t.dataset.type || '';
    const isLonger = type.includes('error') || type.includes('warning');
    const delay = isLonger ? 5000 : 3000;

    // Cerrar manualmente
    const closeBtn = t.querySelector('.close-toast');
    if (closeBtn) closeBtn.addEventListener('click', () => dismiss(t));

    // Auto-cerrar
    setTimeout(() => dismiss(t), delay);
  });

  function dismiss(el) {
    el.classList.add('opacity-0', 'translate-y-2');
    el.classList.add('transition-all', 'duration-500');
    el.classList.add('scale-95');

    setTimeout(() => el.remove(), 500);
  }
});

// Cambia iconos play/pause visualmente
document.getElementById('btn-play')?.addEventListener('click', (e) => {
  const btn = e.currentTarget;
  const playing = btn.dataset.state === 'playing';
  btn.dataset.state = playing ? 'paused' : 'playing';
  btn.setAttribute('aria-label', playing ? 'Reproducir' : 'Pausar');
  btn.querySelector('.icon-play')?.classList.toggle('hidden', !playing);
  btn.querySelector('.icon-pause')?.classList.toggle('hidden', playing);
});

//scroll
(function(){
  function setHeights(){
    const p = document.getElementById('fs-playerbar');
    const hPlayer = p ? p.offsetHeight : 0;
    const hHeader = 64;
    const extraTop = 112;
    const main = document.getElementById('fs-content');
    const panel = document.getElementById('fs-songs-scroll');
    if(main) main.style.height = `calc(100dvh - ${hHeader}px - ${hPlayer}px)`;
    if(panel) panel.style.height = `calc(100dvh - ${hHeader}px - ${hPlayer}px - ${extraTop}px)`;
  }
  window.addEventListener('load', setHeights);
  window.addEventListener('resize', setHeights);
})();

// ===== Router simple por hash para alternar vistas =====
(function () {
  const $viewDashboard = document.getElementById('view-dashboard');
  const $viewProfile   = document.getElementById('view-profile');

  const $navDash  = document.querySelector('a[href="#/dashboard"]');
  const $navPerfil= document.querySelector('a[href="#/perfil"]');

  // --- Storage & Mock ---------------------------------
  const LS_KEY = 'fs_profile_stats_v1';
    function loadStats() {
      const def = {
        total_plays: 0,
        listening_ms_total: 0,
        mood_counts: { happy:0, sad:0, love:0, angry:0, calm:0, neutral:0 },
        recent_tracks: [],
        library_count: 0,
        favorites_count: 0
      };
      try {
        const raw = localStorage.getItem(LS_KEY);
        return raw ? Object.assign(def, JSON.parse(raw)) : def;
      } catch {
        return def;
      }
    }

  function saveStats(s) { localStorage.setItem(LS_KEY, JSON.stringify(s)); }

  // --- Render Perfil ---
  function formatListen(ms) {
    const h = Math.floor(ms/3600000);
    const m = Math.floor((ms%3600000)/60000);
    if (h && m) return `${h} h ${m} min`;
    if (h) return `${h} h`;
    return `${m} min`;
  }
  function favMood(moodCounts) {
    const entries = Object.entries(moodCounts || {});
    if (!entries.length) return '—';
    entries.sort((a,b)=> b[1]-a[1]);
    const map = { happy:'Felicidad 😁', sad:'Tristeza 😢', love:'Amor 🥰', angry:'Enojo 😡', calm:'Calma 😴', neutral:'Neutral 😐' };
    return map[entries[0][0]] || entries[0][0];
  }
  function renderProfile() {
    const stats = loadStats();

    document.getElementById('pf-listen-time').textContent    = formatListen(stats.listening_ms_total || 0);
    document.getElementById('pf-fav-mood').textContent       = favMood(stats.mood_counts);
    document.getElementById('pf-total-plays').textContent    = stats.total_plays || 0;
    document.getElementById('pf-library-count').textContent  = stats.library_count ?? 0;

    // Favoritos
    const favEl = document.getElementById('pf-fav-count');
    if (favEl) favEl.textContent = (stats.favorites_count ?? 0);

    // Recent (máx 3)
    const cont = document.getElementById('pf-recent-list');
    cont.innerHTML = '';
    (stats.recent_tracks || []).slice(0,3).forEach(t => {
      const row = document.createElement('div');
      row.className = 'flex items-center justify-between py-3 gap-3';

      row.innerHTML = `
        <div class="flex items-center gap-3 min-w-0">
          <img src="${t.cover || ''}" class="w-10 h-10 rounded-lg object-cover bg-white/10" alt="">
          <div class="min-w-0">
            <div class="text-white truncate">${t.title}</div>
            <div class="text-white/60 text-sm truncate">${t.artists}</div>
          </div>
        </div>
        <button class="text-[#B5179E] hover:opacity-80 text-sm shrink-0" data-replay="${t.id}">Reproducir nuevamente</button>
      `;
      cont.appendChild(row);
    });

    // Reproducir nuevamente
    cont.querySelectorAll('button[data-replay]').forEach(btn=>{
      btn.addEventListener('click', (e)=>{
        const id = e.currentTarget.getAttribute('data-replay');
        // playByTrackId(id);
        console.log('Reproducir nuevamente:', id);
      });
    });
  }

  // --- Mostrar vista -----
  function setActive(navEl, isActive) {
    if (!navEl) return;
    navEl.classList.toggle('bg-white/15', isActive);
    navEl.classList.toggle('text-white', isActive);
    navEl.classList.toggle('text-white/80', !isActive);
  }
  function showView(view) {
    const isProfile = view === 'perfil';
    $viewProfile.hidden  = !isProfile;
    $viewDashboard.hidden= isProfile;

    setActive($navPerfil, isProfile);
    setActive($navDash, !isProfile);

    if (isProfile) renderProfile();
  }

  function routeFromHash() {
    const h = (location.hash || '').toLowerCase();
    if (h.startsWith('#/perfil')) return showView('perfil');
    return showView('dashboard');
  }

  window.addEventListener('hashchange', routeFromHash);
  routeFromHash();
})();



// ======== Stats ========
(function () {
  const LS_KEY = 'fs_profile_stats_v1';
  const audio  = document.getElementById('fs-audio');

  // Estado en memoria para la sesión actual
  let sessionStartMs = null;
  let countedPlayForTrack = false;
  let currentTrack = null;

  // -------- Storage helpers ----------
  function loadStats() {
    const def = {
      total_plays: 0,
      listening_ms_total: 0,
      mood_counts: { happy:0, sad:0, love:0, angry:0, calm:0, neutral:0 },
      recent_tracks: [],
      library_count: 0,
      favorites_count: 0
    };
    try {
      const raw = localStorage.getItem('fs_profile_stats_v1');
      return raw ? Object.assign(def, JSON.parse(raw)) : def;
    } catch {
      return def;
    }
  }
  function saveStats(s) {
    localStorage.setItem(LS_KEY, JSON.stringify(s));
  }
  const stats = loadStats();

  // -------- Formatos ----------
  function formatListen(ms) {
    const h = Math.floor(ms/3600000);
    const m = Math.floor((ms%3600000)/60000);
    if (h && m) return `${h} h ${m} min`;
    if (h) return `${h} h`;
    return `${m} min`;
  }
  function favMoodLabel(moodCounts) {
    const map = { happy:'Felicidad 😁', sad:'Tristeza 😢', love:'Amor 🥰', angry:'Enojo 😡', calm:'Calma 😴', neutral:'Neutral 😐' };
    const entries = Object.entries(moodCounts || {});
    if (!entries.length) return '—';
    entries.sort((a,b)=> b[1]-a[1]);
    return map[entries[0][0]] || entries[0][0];
  }

  // --------- Render en Perfil ----------
  window.renderProfileStats = function renderProfileStats() {
    const elTime = document.getElementById('pf-listen-time');
    const elMood = document.getElementById('pf-fav-mood');
    const elPlays= document.getElementById('pf-total-plays');
    const elFavs = document.getElementById('pf-fav-count');

    if (elTime) elTime.textContent = formatListen(stats.listening_ms_total || 0);
    if (elMood) elMood.textContent = favMoodLabel(stats.mood_counts);
    if (elPlays) elPlays.textContent = stats.total_plays || 0;
    if (elFavs) elFavs.textContent = (stats.favorites_count ?? 0);
  };

  // --------- Registro de recientes (máx 3) ----------
  function pushRecent(track) {
    if (!track || !track.id) return;
    const last = stats.recent_tracks[0];
    if (last && last.id === track.id) return;

    stats.recent_tracks.unshift({
      id: track.id,
      title: track.title,
      artists: track.artists,
      cover: track.cover,
      started_at_ts: Date.now()
    });
    stats.recent_tracks = stats.recent_tracks.slice(0,3);
  }

  // --------- Play count real ----------
  function countPlayOnce() {
    if (countedPlayForTrack || !currentTrack) return;
    stats.total_plays += 1;
    countedPlayForTrack = true;
    pushRecent(currentTrack);
    saveStats(stats);
  }

  // --------- Tiempo de escucha real ----------
  function startSession() {
    if (sessionStartMs === null) sessionStartMs = Date.now();
  }
  function endSession() {
    if (sessionStartMs !== null) {
      stats.listening_ms_total += (Date.now() - sessionStartMs);
      sessionStartMs = null;
      saveStats(stats);
    }
  }

  // --------- Hooks del audio ----------
  if (audio) {
    audio.addEventListener('play', () => {
      startSession();
      countPlayOnce();
    });
    audio.addEventListener('pause', () => {
      endSession();
    });
    audio.addEventListener('ended', () => {
      endSession();
      countedPlayForTrack = false;
    });
  }

  // Seguridad
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) endSession();
    else if (!audio || !audio.paused) startSession();
  });
  window.addEventListener('beforeunload', () => { endSession(); });

  // --------- Integración: cuando cambias de canción ----------
  window.setCurrentTrack = function setCurrentTrack(track) {
    if (!track || !track.id) return;
    endSession();

    currentTrack = track;
    countedPlayForTrack = false;
  };

  if (window.fsCurrentTrack) {
    window.setCurrentTrack(window.fsCurrentTrack);
  }

  // --------- Emociones: clicks ----------
  document.querySelectorAll('.emoji-chip[data-emoji]').forEach(btn=>{
    btn.addEventListener('click', (e)=>{
      const mood = e.currentTarget.getAttribute('data-emoji');
      if (!stats.mood_counts[mood]) stats.mood_counts[mood] = 0;
      stats.mood_counts[mood] += 1;
      saveStats(stats);
      window.renderProfileStats();
    });
  });

  // --------- MOCK de favoritos (contador) ----------
  window.fsFavMock = {
    add()  { stats.favorites_count = (stats.favorites_count||0) + 1; saveStats(stats); window.renderProfileStats(); },
    remove(){ stats.favorites_count = Math.max(0, (stats.favorites_count||0)-1); saveStats(stats); window.renderProfileStats(); }
  };

  window.renderProfileStats();
})();
