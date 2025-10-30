// --- Helper global para generar clave de localStorage única por usuario ---
function getStatsKey() {
  const ctx = document.getElementById('django-context');
  const email = ctx?.dataset?.email || '';
  const userId = ctx?.dataset?.user || '';
  return `fs_profile_stats_v1${email ? '::' + email : (userId ? '::' + userId : '')}`;
}

// ==== hCaptcha boot global (debe ir ANTES de cualquier DOMContentLoaded) ====
window.__fsCaptcha = {
  ready: false,
  rendered: { reg: false, login: false }
};

function __fsTryRender(idKey) {
  if (!window.__fsCaptcha.ready) return;
  const map = { reg: 'reg-captcha', login: 'login-captcha' };
  const domId = map[idKey];
  const el = document.getElementById(domId);
  if (!el || window.__fsCaptcha.rendered[idKey]) return;

  const sitekey = el.dataset.sitekey || '';
  if (!sitekey || !window.hcaptcha) return;

  window.hcaptcha.render(domId, { sitekey });
  window.__fsCaptcha.rendered[idKey] = true;
}

// Callback GLOBAL llamado por hCaptcha (?onload=onHcaptchaLoad)
window.onHcaptchaLoad = function onHcaptchaLoad() {
  window.__fsCaptcha.ready = true;
  __fsTryRender('reg');
  __fsTryRender('login');
};



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
        __fsTryRender('login');
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
        __fsTryRender('reg');
    }

    loginTab.addEventListener('click', showLogin);
    registerTab.addEventListener('click', showRegister);

    // Activa la pestaña correcta al cargar la página
    if (activeTab === 'register') {
      showRegister();
      __fsTryRender('reg');
    } else {
      showLogin();
      __fsTryRender('login');
    }

});

// CSRF helper
function getCookie(name) {
  const m = document.cookie.match('(^|;)\\s*' + name + '\\s*=\\s*([^;]+)');
  return m ? m.pop() : '';
}
const CSRF = getCookie('csrftoken');


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

  const LS_KEY = getStatsKey();
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

  // helper para escapar atributos HTML
  const escAttr = (s) =>
    String(s ?? '')
      .replace(/&/g,'&amp;')
      .replace(/"/g,'&quot;')
      .replace(/</g,'&lt;')
      .replace(/>/g,'&gt;');

  // ===== Datos de usuario real (perfil) =====
    let pfBootstrapped = false;

    function fmtJoined(iso) {
      try {
        return new Intl.DateTimeFormat('es-MX', { day:'numeric', month:'long', year:'numeric' })
          .format(new Date(iso));
      } catch { return '—'; }
    }

    async function fetchMe() {
      const r = await fetch('/api/v1/me', { credentials: 'include' });
      if (!r.ok) throw new Error('No se pudo cargar el perfil');
      return r.json();
    }

    function paintUser(me) {
      const avatarEl = document.getElementById('pf-avatar');
      const nameEl   = document.getElementById('pf-name');
      const userEl   = document.getElementById('pf-username');
      const bioEl    = document.getElementById('pf-bio');
      const emailEl  = document.getElementById('pf-email');
      const memberEl = document.getElementById('pf-member-since');

      // Nombre visible
      const full = `${me.first_name ?? ''} ${me.last_name ?? ''}`.trim();
      nameEl.textContent = full || me.username;

      // Username, bio, email
      userEl.textContent = me.username ?? '';
      bioEl.textContent  = (me.bio ?? '').trim() || 'Amante de la música';
      emailEl.textContent= me.email ?? '';

      // Miembro desde
      const tplISO = memberEl.dataset.joined;
      memberEl.textContent = fmtJoined(me.date_joined || tplISO);

      const def = avatarEl.dataset.defaultSrc || avatarEl.getAttribute('src');
      const google = avatarEl.dataset.googlePhoto;
      const chosen = me.avatar_url || google || def;
      avatarEl.src = chosen || def;
    }

    // Modal editar
    function bindEditModal() {
      const modal     = document.getElementById('pf-edit-modal');
      const btnOpen   = document.getElementById('pf-edit-btn');
      const btnCancel = document.getElementById('pf-cancel');
      const form      = document.getElementById('pf-edit-form');

      const inpUser   = document.getElementById('pf-inp-username');
      const inpBio    = document.getElementById('pf-inp-bio');
      const inpAvatar = document.getElementById('pf-inp-avatar');
      const errUser   = document.getElementById('pf-username-error');

      // avatar UI
      const drop      = document.getElementById('pf-drop');
      const preview   = document.getElementById('pf-edit-preview');
      const fileName  = document.getElementById('pf-file-name');
      const clearBtn  = document.getElementById('pf-clear-avatar');
      const errAvatar = document.getElementById('pf-avatar-error');
      const saveBtn   = document.getElementById('pf-save-btn');

      if (!btnOpen || !form) return;

      const MAX_MB = 3;
      const MAX_BYTES = MAX_MB * 1024 * 1024;

      function setPreviewFromCurrent() {
        const current = document.getElementById('pf-avatar')?.src;
        preview.src = current || '';
        fileName.textContent = 'PNG/JPG · máx 3 MB';
        errAvatar.classList.add('hidden');
      }

      function open() {
        const curUser = (document.getElementById('pf-username')?.textContent || '').trim();
        const curBio  = (document.getElementById('pf-bio')?.textContent || '').trim();
        inpUser.value = curUser;
        inpBio.value  = (curBio === 'Amante de la música') ? '' : curBio;

        setPreviewFromCurrent();
        if (inpAvatar) inpAvatar.value = '';
        errUser.classList.add('hidden');

        modal.classList.remove('hidden');
        modal.classList.add('flex');
      }

      function close() {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
        if (inpAvatar) inpAvatar.value = '';
      }

      function handleFile(file) {
        errAvatar.classList.add('hidden');

        if (!/^image\/(png|jpe?g|webp|gif)$/i.test(file.type)) {
          errAvatar.textContent = 'Formato no soportado. Usa PNG/JPG/WEBP/GIF.';
          errAvatar.classList.remove('hidden');
          if (inpAvatar) inpAvatar.value = '';
          return;
        }
        if (file.size > MAX_BYTES) {
          errAvatar.textContent = `La imagen supera ${MAX_MB} MB.`;
          errAvatar.classList.remove('hidden');
          if (inpAvatar) inpAvatar.value = '';
          return;
        }
        fileName.textContent = file.name;
        const reader = new FileReader();
        reader.onload = () => { preview.src = reader.result; };
        reader.readAsDataURL(file);
      }

      // Click en toda la dropzone abre selector
      drop.addEventListener('click', (e) => {
        if (e.target.closest('#pf-clear-avatar')) return;

        if (e.target.closest('label[for="pf-inp-avatar"]')) return;

        if (inpAvatar) inpAvatar.value = '';
        inpAvatar?.click();
      });

      ['dragenter','dragover'].forEach(ev=>{
        drop.addEventListener(ev, e=>{ e.preventDefault(); drop.classList.add('ring-2','ring-white/30'); });
      });
      ['dragleave','drop'].forEach(ev=>{
        drop.addEventListener(ev, e=>{ e.preventDefault(); drop.classList.remove('ring-2','ring-white/30'); });
      });
      drop.addEventListener('drop', e=>{
        const f = e.dataTransfer.files?.[0];
        if (f) { if (inpAvatar) inpAvatar.files = e.dataTransfer.files; handleFile(f); }
      });

      const labelPicker = document.querySelector('label[for="pf-inp-avatar"]');
      labelPicker?.addEventListener('click', (e) => {
        e.stopPropagation();
        if (inpAvatar) inpAvatar.value = '';
      });

      inpAvatar?.addEventListener('change', ()=>{
        const f = inpAvatar.files?.[0];
        if (f) handleFile(f);
      });

      // Quitar selección
      clearBtn.addEventListener('click', (e)=>{
        e.stopPropagation();
        if (inpAvatar) inpAvatar.value = '';
        setPreviewFromCurrent();
      });

      btnOpen.addEventListener('click', open);
      btnCancel?.addEventListener('click', close);

      // Guardar
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        errUser.classList.add('hidden');

        const oldText = saveBtn.textContent;
        saveBtn.textContent = 'Guardando…';
        saveBtn.disabled = true;

        const curUser = (document.getElementById('pf-username')?.textContent || '').trim();
        const curBio  = (document.getElementById('pf-bio')?.textContent || '').trim();
        const newUser = inpUser.value.trim();
        const newBio  = inpBio.value.trim();

        const needPatch  = (newUser && newUser !== curUser) || (newBio !== '' && newBio !== curBio);
        const needUpload = !!(inpAvatar && inpAvatar.files && inpAvatar.files.length);

        try {
          if (needPatch) {
            const r = await fetch('/api/v1/me', {
              method: 'PATCH',
              credentials: 'include',
              headers: { 'Content-Type': 'application/json', 'X-CSRFToken': CSRF },
              body: JSON.stringify({
                ...(newUser && newUser !== curUser ? { username: newUser } : {}),
                ...(newBio  !== curBio           ? { bio: newBio } : {}),
              }),
            });
            if (!r.ok) {
              const data = await r.json().catch(()=> ({}));
              const msg = data?.username?.[0] || data?.detail || 'No se pudo actualizar.';
              errUser.textContent = msg;
              errUser.classList.remove('hidden');
              return;
            }
            if (newUser && newUser !== curUser) document.getElementById('pf-username').textContent = newUser;
            document.getElementById('pf-bio').textContent = (newBio || '').trim() || 'Amante de la música';
          }

          if (needUpload) {
            const fd = new FormData();
            fd.append('avatar', inpAvatar.files[0]);
            const up = await fetch('/api/v1/me/avatar', {
              method: 'POST',
              credentials: 'include',
              headers: { 'X-CSRFToken': CSRF },
              body: fd,
            });
            if (!up.ok) {
              const data = await up.json().catch(()=> ({}));
              errUser.textContent = data?.detail || 'No se pudo subir la imagen.';
              errUser.classList.remove('hidden');
              return;
            }
            const { avatar_url } = await up.json().catch(()=> ({}));
            if (avatar_url) {
              const avatarEl = document.getElementById('pf-avatar');
              avatarEl.src = avatar_url + (avatar_url.includes('?') ? '&' : '?') + 't=' + Date.now();
            }
          }

          close();
        } finally {
          saveBtn.textContent = oldText;
          saveBtn.disabled = false;
        }
      });
    }

    async function ensureProfileBootstrapped() {
      if (pfBootstrapped) return;
      pfBootstrapped = true;
      bindEditModal();
      try {
        const me = await fetchMe();
        paintUser(me);
      } catch (e) {
        console.warn(e);
      }
    }

  function renderProfile() {
    const stats = loadStats();

    document.getElementById('pf-listen-time').textContent    = formatListen(stats.listening_ms_total || 0);
    document.getElementById('pf-fav-mood').textContent       = favMood(stats.mood_counts);
    document.getElementById('pf-total-plays').textContent    = stats.total_plays || 0;

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
        <button
          class="fs-replay-link shrink-0"
          data-replay="${escAttr(t.id)}"
          data-title="${escAttr(t.title)}"
          data-artists="${escAttr(t.artists)}"
          data-cover="${escAttr(t.cover)}" >
          Reproducir nuevamente
        </button>
      `;
      cont.appendChild(row);
    });

    // Reproducir nuevamente
    cont.querySelectorAll('button[data-replay]').forEach(btn=>{
      btn.addEventListener('click', () => {
        const rec = {
          id: btn.getAttribute('data-replay'),
          title: btn.getAttribute('data-title') || '',
          artists: btn.getAttribute('data-artists') || '',
          cover: btn.getAttribute('data-cover') || ''
        };
        if (window.replayRecent) window.replayRecent(rec);
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

    if (isProfile) {
      ensureProfileBootstrapped();
      renderProfile();
    }
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
  const LS_KEY = getStatsKey();
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

  // --------- Registro de recientes (máx 3, sin duplicados) ----------
  function pushRecent(track) {
    if (!track) return;

    const norm = v => (v || '').toString().trim().toLowerCase();
    const sameTrack = (a, b) => {
      if (a?.id && b?.id) return String(a.id) === String(b.id);
      return norm(a?.title) === norm(b?.title) && norm(a?.artists) === norm(b?.artists);
    };
    stats.recent_tracks = (stats.recent_tracks || []).filter(t => !sameTrack(t, track));
    // Insertar al frente
    stats.recent_tracks.unshift({
      id: track.id,
      title: track.title,
      artists: track.artists,
      cover: track.cover,
      started_at_ts: Date.now()
    });
    // Máximo 3
    stats.recent_tracks = stats.recent_tracks.slice(0, 3);
    saveStats(stats);
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
