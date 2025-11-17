// ============================================================================
//  FeelSound · Main
// ============================================================================

// ---------- Identidad de usuario para localStorage ----------
function getStatsKey() {
  const email = localStorage.getItem('fs_user_email') || '';
  const userId = localStorage.getItem('fs_user_id') || '';
  const tag = email || userId || 'guest';
  return `fs_profile_stats_v1::${tag}`;
}

// ====== User Store + Hidratación global ======
window.FEEL = window.FEEL || {};
FEEL.env = FEEL.env || {};

// --- Limpieza de estado por cambio de usuario ---
const OWNER_KEY = "fs_owner_id_v3";
const PREFIXES  = ["fs_", "feelsound_", "dz_"];
const STATS_PREFIX = "fs_profile_stats_v1::";

function wipeUserState() {
  try {
    // localStorage / sessionStorage
    for (const k of Object.keys(localStorage)) {
      if (PREFIXES.some(p => k.startsWith(p)) && !k.startsWith(STATS_PREFIX)) {
        localStorage.removeItem(k);
      }
    }
    for (const k of Object.keys(sessionStorage)) {
      if (PREFIXES.some(p => k.startsWith(p)) && !k.startsWith(STATS_PREFIX)) {
        sessionStorage.removeItem(k);
      }
    }
    // CacheStorage (si hay Service Worker)
    if (window.caches) {
      caches.keys().then(ns => ns.forEach(n => caches.delete(n)));
    }
  } catch {}
}

function absUrl(u) {
  if (!u) return '';
  if (/^https?:\/\//i.test(u)) return u;
  const base = (window.API?.origin || '').replace(/\/+$/,'');
  return `${base}${u.startsWith('/') ? '' : '/'}${u}`;
}
function bust(u) {
  if (!u) return u;
  return u + (u.includes('?') ? '&' : '?') + 't=' + Date.now();
}



const UserStore = (() => {
  let user = null;
  const subs = new Set();
  function set(u){ user = u; subs.forEach(fn=>fn(user)); }
  function get(){ return user; }
  function subscribe(fn){ subs.add(fn); return () => subs.delete(fn); }
  return { set, get, subscribe };
})();

function renderHeaderUser(u) {
  const top = document.getElementById('pf-username-top') || document.getElementById('top-username');
  if (!top) return;
  if (u?.username) top.textContent = '@' + u.username;
  else if (u?.email) top.textContent = u.email;
  else top.textContent = '@invitado';
}

let __lastUserId = undefined;
let __bootFetched = false;

// --- Limpieza fuerte y broadcast de cambio de sesión ---
function broadcastSessionSwitch(prevOwner, curOwner){
  try {
    // Cerrar modales, limpiar layout, etc.
    try { document.getElementById('pl-modal')?.classList.add('hidden'); } catch {}
    document.body.style.overflow = '';

    // Señal global
    document.dispatchEvent(new CustomEvent('feel:session-switched', {
      detail: { prev: prevOwner, curr: curOwner }
    }));
  } catch {}
}

let __meAbort = null;
function __sameStr(a,b){ return String(a ?? '') === String(b ?? ''); }

async function hydrateUser({ force = false } = {}) {
  const CKEY = 'fs_user_cache_v1';
  if (!__bootFetched) { force = true; __bootFetched = true; }

  const cachedObj = JSON.parse(localStorage.getItem(CKEY) || 'null');
  const fresh = cachedObj && (Date.now() - cachedObj.ts) < 60_000;

  // owner actual (si existe) y owner del caché
  const ownerLS   = localStorage.getItem(OWNER_KEY) || null;
  const cacheOwner= (cachedObj && (cachedObj.owner ?? cachedObj.data?.id ?? null));
  const cacheMatchesOwner = __sameStr(ownerLS, cacheOwner);

  // Si el caché no pertenece al owner actual, lo ignoramos y lo purgamos
  if (cachedObj && !cacheMatchesOwner) {
      try { localStorage.removeItem(CKEY); } catch {}
  }

  // Usamos caché SOLO si: no hay force, está fresco y coincide el owner
  if (!force && fresh && cacheMatchesOwner && cachedObj?.data) {
      const u = cachedObj.data;
      if (__lastUserId !== u?.id) {
        __lastUserId = u?.id;
        UserStore.set(u);
        renderHeaderUser(u);
        document.dispatchEvent(new CustomEvent('feel:user-ready', { detail: u }));
      } else {
        UserStore.set(u);
        renderHeaderUser(u);
      }
  }


  if (force || !fresh) {
      try {
        if (__meAbort) { __meAbort.abort(); }
        __meAbort = new AbortController();

        const data = await window.apiFetchV1('/me', { cache: 'no-store', signal: __meAbort.signal });

        const prevOwner = localStorage.getItem(OWNER_KEY);
        const curOwner  = (data?.id != null) ? String(data.id) : null;

        if (prevOwner && curOwner && prevOwner !== curOwner) {
           // limpia estado transitorio, pero NO borres todas las stats
           wipeUserState();
           broadcastSessionSwitch(prevOwner, curOwner);
        }
        if (curOwner) localStorage.setItem(OWNER_KEY, curOwner);

        localStorage.setItem(CKEY, JSON.stringify({ ts: Date.now(), owner: curOwner, data }));
        if (data?.email) localStorage.setItem('fs_user_email', data.email);
        if (data?.id)    localStorage.setItem('fs_user_id', String(data.id));

        if (__lastUserId !== data?.id) {
          __lastUserId = data?.id;
          UserStore.set(data);
          renderHeaderUser(data);
          document.dispatchEvent(new CustomEvent('feel:user-ready', { detail: data }));
        } else {
          UserStore.set(data);
          renderHeaderUser(data);
        }
        return data;

      } catch (e) {
        console.warn('hydrateUser:', e);
        if (__lastUserId !== null) {
          __lastUserId = null;
          UserStore.set(null);
          renderHeaderUser(null);
          document.dispatchEvent(new CustomEvent('feel:user-ready', { detail: null }));
        }
        return null;

      } finally {
        __meAbort = null;
      }
  }

  return cachedObj?.data || null;
}


document.addEventListener('DOMContentLoaded', () => {
  hydrateUser({ force: true });
});

UserStore.subscribe(renderHeaderUser);

// --- Forzar cache:'no-store' en TODAS las llamadas apiFetchV1 por defecto ---
(function hardenApiFetchV1(){
  function wrap(){
    if (typeof window.apiFetchV1 !== 'function' || window.apiFetchV1.__wrapped) return;
    const orig = window.apiFetchV1;
    const fn = (path, opts = {}) => {
      return orig(path, { cache: 'no-store', ...opts });
    };
    fn.__wrapped = true;
    window.apiFetchV1 = fn;
  }
  // Intenta ahora y reintenta cuando la app queda lista
  wrap();
  window.addEventListener('load', wrap);
  document.addEventListener('feel:user-ready', wrap);
})();



// ---------- Login/Register tabs ----------
document.addEventListener('DOMContentLoaded', () => {
  const loginTab = document.getElementById('login-tab');
  const registerTab = document.getElementById('register-tab');
  const loginForm = document.getElementById('login-form');
  const registerForm = document.getElementById('register-form');

  function showLogin() {
    if (!loginForm || !registerForm) return;
    loginForm.classList.remove('hidden');
    registerForm.classList.add('hidden');
    if (loginTab && registerTab) {
      loginTab.classList.add('bg-[#4285F4]', 'text-white');
      loginTab.classList.remove('text-gray-400');
      registerTab.classList.remove('bg-[#4285F4]', 'text-white');
      registerTab.classList.add('text-gray-400');
    }
    showLoginCaptcha(needsLoginCaptcha());
    if (needsLoginCaptcha()) { __fsRenderSoon('login'); }
  }

  function showRegister() {
    if (!loginForm || !registerForm) return;
    registerForm.classList.remove('hidden');
    loginForm.classList.add('hidden');
    if (loginTab && registerTab) {
      registerTab.classList.add('bg-[#4285F4]', 'text-white');
      registerTab.classList.remove('text-gray-400');
      loginTab.classList.remove('bg-[#4285F4]', 'text-white');
      loginTab.classList.add('text-gray-400');
    }
    showLoginCaptcha(false);
    window.__fsCaptcha.want.reg = true;
    __fsRenderSoon('reg');
  }

  loginTab?.addEventListener('click', showLogin);
  registerTab?.addEventListener('click', showRegister);

  if (registerTab?.dataset.active === 'true') showRegister();
  else showLogin();
});

// ---------- Toasts auto-close ----------
document.addEventListener('DOMContentLoaded', () => {
  const toasts = document.querySelectorAll('.toast-msg');
  const dismiss = (el) => {
    el.classList.add('opacity-0', 'translate-y-2', 'transition-all', 'duration-500', 'scale-95');
    setTimeout(() => el.remove(), 500);
  };
  toasts.forEach((t) => {
    const type = t.dataset.type || '';
    const delay = (type.includes('error') || type.includes('warning')) ? 5000 : 3000;
    t.querySelector('.close-toast')?.addEventListener('click', () => dismiss(t));
    setTimeout(() => dismiss(t), delay);
  });
});

// ---------- Botón play/pause ----------
document.getElementById('btn-play')?.addEventListener('click', (e) => {
  const btn = e.currentTarget;
  const playing = btn.dataset.state === 'playing';
  btn.dataset.state = playing ? 'paused' : 'playing';
  btn.setAttribute('aria-label', playing ? 'Reproducir' : 'Pausar');
  btn.querySelector('.icon-play')?.classList.toggle('hidden', !playing);
  btn.querySelector('.icon-pause')?.classList.toggle('hidden', playing);
});

// ---------- Ajustes de alturas ----------
(function(){
  function setHeights(){
    const p = document.getElementById('fs-playerbar');
    const hPlayer = p ? p.offsetHeight : 0;
    const hHeader = 64;
    const extraTop = 112;
    const main = document.getElementById('fs-content');
    const panel = document.getElementById('fs-songs-scroll');
     const vh = window.innerHeight || document.documentElement.clientHeight;

    if (main)  main.style.height  = (vh - hHeader - hPlayer) + 'px';
    if (panel) panel.style.height = (vh - hHeader - hPlayer - extraTop) + 'px';

    document.documentElement.style.setProperty('--fs-player-h', `${hPlayer}px`);
  }
  window.addEventListener('load', setHeights);
  window.addEventListener('resize', setHeights);
})();


// ===== Router simple por hash (dashboard/perfil) =====
(function () {
  const $viewDashboard = document.getElementById('view-dashboard');
  const $viewProfile   = document.getElementById('view-profile');
  const $viewPL        = document.getElementById('view-playlists');
  const $viewCreate    = document.getElementById('view-pl-create');
  const $navDash       = document.querySelector('a[href="#/dashboard"]');
  const $navPerfil     = document.querySelector('a[href="#/perfil"]');
  const $navPL         = document.querySelector('a[href="#/playlists"]');
  const $navCreate     = document.querySelector('a[href="#/playlist/new"]');


  function loadStats() {
    const LS_KEY = getStatsKey();
    const def = {
      total_plays: 0,
      listening_ms_total: 0,
      mood_counts: { happy:0, sad:0, love:0, angry:0, calm:0, neutral:0 },
      recent_tracks: [],
      library_count: 0,
      playlists_count: 0
    };
    try {
      const raw = localStorage.getItem(LS_KEY);
      return raw ? Object.assign(def, JSON.parse(raw)) : def;
    } catch { return def; }
  }
  function saveStats(s) {
    const LS_KEY = getStatsKey();
    localStorage.setItem(LS_KEY, JSON.stringify(s));
  }

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
  const escAttr = (s) => String(s ?? '').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

    function clearProfile() {
        try {
          const avatarEl = document.getElementById('pf-avatar');
          const nameEl   = document.getElementById('pf-name');
          const userEl   = document.getElementById('pf-username');
          const bioEl    = document.getElementById('pf-bio');
          const emailEl  = document.getElementById('pf-email');
          const memberEl = document.getElementById('pf-member-since');
          const topU     = document.getElementById('pf-username-top');

          // Avatar: volver al default
          if (avatarEl) {
            const def = avatarEl.dataset.defaultSrc
                     || avatarEl.getAttribute('data-default-src')
                     || avatarEl.src;
            avatarEl.src = def || '';
          }

          if (nameEl)   nameEl.textContent    = 'Usuario';
          if (userEl)   userEl.textContent    = 'usuario';
          if (bioEl)    bioEl.textContent     = 'Amante de la música';
          if (emailEl)  emailEl.textContent   = 'usuario@example.com';
          if (memberEl) memberEl.textContent  = '—';
          if (topU)     topU.textContent      = '@invitado';

          // Stats a cero
          const z = (id, val) => {
            const el = document.getElementById(id);
            if (el) el.textContent = val;
          };
          z('pf-listen-time', '0 min');
          z('pf-fav-mood',   '—');
          z('pf-total-plays','0');
          z('pf-pl-count',   '0');

          // Recientes vacío
          document.getElementById('pf-recent-list')?.replaceChildren();
        } catch {}
    }

  // Cuando llega el usuario (o null), pinta o limpia
  document.addEventListener('feel:user-ready', (ev) => {
      const me = ev.detail;
      if (!document.getElementById('view-profile')) return;
      if (me) {
        paintUser(me);
        if (!document.getElementById('view-profile')?.hidden) renderProfile();
      } else {
        clearProfile();
      }
  });

  // Al cambiar de sesión, limpia inmediatamente
  document.addEventListener('feel:session-switched', () => {
      clearProfile();
      try { document.getElementById('pf-recent-list')?.replaceChildren(); } catch {}
  });


  // ===== Perfil: origen de datos =====
  async function fetchMe() {
    if (!window.API?.v1Base) throw new Error('API no configurada (front puro)');
    return window.apiFetchV1('/me');
  }

  function fmtJoined(iso) {
    try {
      return new Intl.DateTimeFormat('es-MX', { day:'numeric', month:'long', year:'numeric' })
        .format(new Date(iso));
    } catch { return '—'; }
  }

  function paintUser(me) {
    const avatarEl = document.getElementById('pf-avatar');
    const nameEl   = document.getElementById('pf-name');
    const userEl   = document.getElementById('pf-username');
    const bioEl    = document.getElementById('pf-bio');
    const emailEl  = document.getElementById('pf-email');
    const memberEl = document.getElementById('pf-member-since');

    const full = `${me.first_name ?? ''} ${me.last_name ?? ''}`.trim();
    if (nameEl)  nameEl.textContent = full || (me.username ?? 'Usuario');
    if (userEl)  userEl.textContent = me.username ?? 'usuario';
    if (bioEl)   bioEl.textContent  = (me.bio ?? '').trim() || 'Amante de la música';
    if (emailEl) emailEl.textContent= me.email ?? 'usuario@example.com';
    if (memberEl) memberEl.textContent = fmtJoined(me.date_joined || memberEl?.dataset?.joined || new Date().toISOString());

    if (avatarEl) {
      const def = avatarEl.dataset.defaultSrc || avatarEl.getAttribute('src');
      const raw = me.avatar_url || me.avatar || '';   // soporta ambos nombres
      const chosen = raw ? absUrl(raw) : def;
      avatarEl.src = chosen || def;
    }
    const topU = document.getElementById('pf-username-top');
    if (topU) topU.textContent = '@' + (me.username ?? 'usuario');
  }

  function bindEditModal() {
    const modal = document.getElementById('pf-edit-modal');
    const btnOpen = document.getElementById('pf-edit-btn');
    const btnCancel = document.getElementById('pf-cancel');
    const form = document.getElementById('pf-edit-form');

    const inpUser = document.getElementById('pf-inp-username');
    const inpBio  = document.getElementById('pf-inp-bio');
    const inpAvatar = document.getElementById('pf-inp-avatar');
    const errUser = document.getElementById('pf-username-error');

    const drop = document.getElementById('pf-drop');
    const preview = document.getElementById('pf-edit-preview');
    const fileName = document.getElementById('pf-file-name');
    const clearBtn = document.getElementById('pf-clear-avatar');
    const errAvatar = document.getElementById('pf-avatar-error');
    const saveBtn = document.getElementById('pf-save-btn');

    if (!btnOpen || !form) return;

    const MAX_MB = 3, MAX_BYTES = MAX_MB * 1024 * 1024;

    function setPreviewFromCurrent() {
      const current = document.getElementById('pf-avatar')?.src;
      if (preview) preview.src = current || '';
      if (fileName) fileName.textContent = 'PNG/JPG · máx 3 MB';
      errAvatar?.classList.add('hidden');
    }

    function open() {
      const curUser = (document.getElementById('pf-username')?.textContent || '').trim();
      const curBio  = (document.getElementById('pf-bio')?.textContent || '').trim();
      if (inpUser) inpUser.value = curUser;
      if (inpBio)  inpBio.value  = (curBio === 'Amante de la música') ? '' : curBio;

      setPreviewFromCurrent();
      if (inpAvatar) inpAvatar.value = '';
      errUser?.classList.add('hidden');

      modal?.classList.remove('hidden');
      modal?.classList.add('flex');
    }
    function close() {
      modal?.classList.add('hidden');
      modal?.classList.remove('flex');
      if (inpAvatar) inpAvatar.value = '';
    }

    function handleFile(file) {
      errAvatar?.classList.add('hidden');
      if (!/^image\/(png|jpe?g|webp|gif)$/i.test(file.type)) {
        if (errAvatar) { errAvatar.textContent = 'Formato no soportado. Usa PNG/JPG/WEBP/GIF.'; errAvatar.classList.remove('hidden'); }
        if (inpAvatar) inpAvatar.value = '';
        return;
      }
      if (file.size > MAX_BYTES) {
        if (errAvatar) { errAvatar.textContent = `La imagen supera ${MAX_MB} MB.`; errAvatar.classList.remove('hidden'); }
        if (inpAvatar) inpAvatar.value = '';
        return;
      }
      if (fileName) fileName.textContent = file.name;
      const reader = new FileReader();
      reader.onload = () => { if (preview) preview.src = reader.result; };
      reader.readAsDataURL(file);
    }

    drop?.addEventListener('click', (e) => {
      if (e.target.closest('#pf-clear-avatar')) return;
      if (e.target.closest('label[for="pf-inp-avatar"]')) return;
      if (inpAvatar) inpAvatar.value = '';
      inpAvatar?.click();
    });

    ['dragenter','dragover'].forEach(ev=>{
      drop?.addEventListener(ev, e=>{ e.preventDefault(); drop.classList.add('ring-2','ring-white/30'); });
    });
    ['dragleave','drop'].forEach(ev=>{
      drop?.addEventListener(ev, e=>{ e.preventDefault(); drop.classList.remove('ring-2','ring-white/30'); });
    });
    drop?.addEventListener('drop', e=>{
      const f = e.dataTransfer.files?.[0];
      if (f) { if (inpAvatar) inpAvatar.files = e.dataTransfer.files; handleFile(f); }
    });

    document.querySelector('label[for="pf-inp-avatar"]')?.addEventListener('click', (e) => {
      e.stopPropagation();
      if (inpAvatar) inpAvatar.value = '';
    });

    inpAvatar?.addEventListener('change', ()=>{
      const f = inpAvatar.files?.[0];
      if (f) handleFile(f);
    });

    clearBtn?.addEventListener('click', (e)=>{
      e.stopPropagation();
      if (inpAvatar) inpAvatar.value = '';
      setPreviewFromCurrent();
    });

    btnOpen?.addEventListener('click', open);
    btnCancel?.addEventListener('click', close);

    // Guardar
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      errUser?.classList.add('hidden');
      const oldText = saveBtn?.textContent;
      if (saveBtn) { saveBtn.textContent = 'Guardando…'; saveBtn.disabled = true; }

      const curUser = (document.getElementById('pf-username')?.textContent || '').trim();
      const curBio  = (document.getElementById('pf-bio')?.textContent || '').trim();
      const newUser = inpUser?.value.trim();
      const newBio  = inpBio?.value.trim();
      const needPatch  = (newUser && newUser !== curUser) || (newBio !== '' && newBio !== curBio);
      const needUpload = !!(inpAvatar && inpAvatar.files && inpAvatar.files.length);

      try {
        if (!window.API?.v1Base) {
          if (newUser && newUser !== curUser) document.getElementById('pf-username').textContent = newUser;
          document.getElementById('pf-bio').textContent = (newBio || '').trim() || 'Amante de la música';
          if (needUpload) {
            const f = inpAvatar.files[0];
            const r = new FileReader();
            r.onload = () => {
              const avatarEl = document.getElementById('pf-avatar');
              if (avatarEl) avatarEl.src = r.result;
            };
            r.readAsDataURL(f);
          }
          close();
          return;
        }

        if (needPatch) {
          const patchObj = {
            ...(newUser && newUser !== curUser ? { username: newUser } : {}),
            ...(newBio  !== curBio             ? { bio: newBio }       : {}),
          };

        await window.apiFetchV1('/me', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(patchObj),
          });

          if (newUser && newUser !== curUser) {
              const userSpan = document.getElementById('pf-username');
              if (userSpan) userSpan.textContent = newUser;

              const topU = document.getElementById('pf-username-top');
              if (topU) topU.textContent = '@' + newUser;

              const nameEl = document.getElementById('pf-name');
              if (nameEl && nameEl.textContent.trim() === curUser) {
                nameEl.textContent = newUser;
              }
          }
          document.getElementById('pf-bio').textContent = (newBio || '').trim() || 'Amante de la música';
        }

        if (needUpload) {
          const fd = new FormData();
          fd.append('avatar', inpAvatar.files[0]);

          const out = await window.apiFetchV1('/me/avatar', { method: 'POST', body: fd });

          let avatar_url = '';
          if (out && typeof out === 'object') {
            avatar_url = out.avatar_url || out.avatar || out.url || '';
          }
          if (!avatar_url) {
            const me2 = await window.apiFetchV1('/me');
            avatar_url = me2?.avatar_url || me2?.avatar || '';
          }

          if (avatar_url) {
            const u = bust(absUrl(avatar_url));
            const avatarEl = document.getElementById('pf-avatar');
            const preview  = document.getElementById('pf-edit-preview');
            if (avatarEl) avatarEl.src = u;
            if (preview)  preview.src  = u;
          }
        }

        // Refresca caché/estado para mantener header y perfil consistentes
        await hydrateUser({ force: true });

        close();
            } catch (err) {
        console.error(err);
        let msg = 'No se pudo guardar los cambios.';

        try {
          const data   = err?.data || err?.response || null;
          const errors = data?.errors || data;

          if (errors) {
            let raw =
              errors.username ||
              errors.non_field_errors ||
              errors.detail ||
              errors.error ||
              null;

            if (!raw && typeof errors === 'string') {
              raw = errors;
            }

            if (raw) {
              if (Array.isArray(raw))       msg = String(raw[0]);
              else if (typeof raw === 'string') msg = raw;
              else if (raw.message)         msg = String(raw.message);
            }
          }
        } catch (_) {}

        if (errUser) {
          errUser.textContent = msg;
          errUser.classList.remove('hidden');
        }
        // resalta el input si el problema es el username
        if (inpUser && /usuario|username/i.test(msg)) {
          inpUser.classList.add('border-red-500');
        }
      } finally {
        if (saveBtn) { saveBtn.textContent = oldText; saveBtn.disabled = false; }
      }
    });
  }

  let pfBootstrapped = false;
  async function ensureProfileBootstrapped() {
    if (pfBootstrapped) return;
    pfBootstrapped = true;
    bindEditModal();
    try {
      let me = UserStore.get();
      if (!me) me = await hydrateUser({ force: true });

      if (me) {
        paintUser(me);
      } else if (!window.API?.v1Base) {
        const demoName = localStorage.getItem('fs_user_name') || 'Usuario';
        paintUser({ username: 'usuario', email:'usuario@example.com', first_name: demoName, date_joined: new Date().toISOString() });
      }
    } catch (e) { console.warn(e); }
  }

  function renderProfile() {
    const stats = loadStats();
    const $time = document.getElementById('pf-listen-time');
    const $favm = document.getElementById('pf-fav-mood');
    const $plays= document.getElementById('pf-total-plays');
    const $favs = document.getElementById('pf-pl-count');
    if ($time)  $time.textContent  = formatListen(stats.listening_ms_total || 0);
    if ($favm)  $favm.textContent  = favMood(stats.mood_counts);
    if ($plays) $plays.textContent = stats.total_plays || 0;
    if ($favs)  $favs.textContent  = (stats.playlists_count ?? 0);

    const cont = document.getElementById('pf-recent-list');
    if (!cont) return;
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
        <button class="fs-replay-link shrink-0"
          data-replay="${escAttr(t.id)}"
          data-title="${escAttr(t.title)}"
          data-artists="${escAttr(t.artists)}"
          data-cover="${escAttr(t.cover)}">Reproducir nuevamente</button>
      `;
      cont.appendChild(row);
    });
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

  window.refreshPlaylistsCount = async function refreshPlaylistsCount() {
      try {
        if (!window.API?.v1Base) return;
        const data = await window.apiFetchV1('/me/summary/', { cache: 'no-store' });
        if (data && typeof data.playlists_count === 'number') {
          window.setPlaylistsCount(data.playlists_count);
        }
      } catch (e) {
        console.warn('No pude obtener /me/summary', e);
      }
  };

  function setActive(navEl, isActive) {
    if (!navEl) return;
    navEl.classList.toggle('bg-white/15', isActive);
    navEl.classList.toggle('text-white', isActive);
    navEl.classList.toggle('text-white/80', !isActive);
  }

  async function showView(view) {
      const isProfile   = view === 'perfil';
      const isDashboard = view === 'dashboard';
      const isPlaylists = view === 'playlists';
      const isCreate    = view === 'pl-create';

      if ($viewDashboard) $viewDashboard.hidden = !isDashboard;
      if ($viewProfile)   $viewProfile.hidden   = !isProfile;
      if ($viewPL)        $viewPL.hidden        = !isPlaylists;
      if ($viewCreate)    $viewCreate.hidden    = !isCreate;

      setActive($navDash,   isDashboard);
      setActive($navPerfil, isProfile);
      setActive($navPL,     isPlaylists);
      setActive($navCreate, isCreate);

      // pinta con lo que haya en memoria
      const cachedUser = UserStore.get();
      if (isProfile) {
        await ensureProfileBootstrapped();
        renderProfile();
        window.refreshPlaylistsCount();
      }
      if (!cachedUser) renderHeaderUser(null);

      // refresca en background SIN bloquear la vista
      hydrateUser({ force: true }).then((u) => {
        if (isProfile) { renderProfile(); }
      }).catch(()=>{});

      // Notifica cambio de vista
      document.dispatchEvent(new CustomEvent('feel:view-changed', { detail: { view } }));
  }

  async function routeFromHash() {
    const h = (location.hash || '').toLowerCase();
    if (h.startsWith('#/perfil'))        return showView('perfil');
    if (h.startsWith('#/playlists'))     return showView('playlists');
    if (h.startsWith('#/playlist/new'))  return showView('pl-create');
    return showView('dashboard');
  }

  window.addEventListener('hashchange', () => { routeFromHash(); });
  routeFromHash();

  // Si la sesión cambia (logout/login con otro usuario), forzamos navegación limpia y repintado
  document.addEventListener('feel:session-switched', async () => {
    location.hash = '#/dashboard';
    await routeFromHash();
  });

  document.addEventListener('feel:playlist-created', () => window.refreshPlaylistsCount());
  document.addEventListener('feel:playlist-deleted',  () => window.refreshPlaylistsCount());

})();


// ======== Stats (player, emociones, favoritos) ========
(function () {
  let LS_KEY = getStatsKey();
  const audio  = document.getElementById('fs-audio');

  let stats = null;
  let sessionStartMs = null;
  let countedPlayForTrack = false;
  let currentTrack = null;

  function loadStats() {
    const def = {
      total_plays: 0,
      listening_ms_total: 0,
      mood_counts: { happy:0, sad:0, love:0, angry:0, calm:0, neutral:0 },
      recent_tracks: [],
      library_count: 0,
      playlists_count: 0
    };
    try {
      const raw = localStorage.getItem(LS_KEY);
      return raw ? Object.assign(def, JSON.parse(raw)) : def;
    } catch { return def; }
  }
  function saveStats(s) { localStorage.setItem(LS_KEY, JSON.stringify(s)); }

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

  function initStatsForCurrentUser() {
    LS_KEY = getStatsKey();
    stats = loadStats();
    window.renderProfileStats(); // actualiza cuadros del perfil si están a la vista
  }

  // API usada por el perfil
  window.renderProfileStats = function renderProfileStats() {
    if (!stats) initStatsForCurrentUser();
    const elTime = document.getElementById('pf-listen-time');
    const elMood = document.getElementById('pf-fav-mood');
    const elPlays= document.getElementById('pf-total-plays');
    const elFavs = document.getElementById('pf-pl-count');
    if (elTime) elTime.textContent = formatListen(stats.listening_ms_total || 0);
    if (elMood) elMood.textContent = favMoodLabel(stats.mood_counts);
    if (elPlays) elPlays.textContent = stats.total_plays || 0;
    if (elFavs) elFavs.textContent = (stats.playlists_count ?? 0);
  };

  function pushRecent(track) {
    if (!stats) initStatsForCurrentUser();
    if (!track) return;
    const norm = v => (v || '').toString().trim().toLowerCase();
    const sameTrack = (a, b) => {
      if (a?.id && b?.id) return String(a.id) === String(b.id);
      return norm(a?.title) === norm(b?.title) && norm(a?.artists) === norm(b?.artists);
    };
    stats.recent_tracks = (stats.recent_tracks || []).filter(t => !sameTrack(t, track));
    stats.recent_tracks.unshift({
      id: track.id, title: track.title, artists: track.artists, cover: track.cover, started_at_ts: Date.now()
    });
    stats.recent_tracks = stats.recent_tracks.slice(0, 3);
    saveStats(stats);
  }

  function countPlayOnce() {
    if (!stats) initStatsForCurrentUser();
    if (countedPlayForTrack || !currentTrack) return;
    stats.total_plays += 1;
    countedPlayForTrack = true;
    pushRecent(currentTrack);
    saveStats(stats);
  }

  function startSession() { if (sessionStartMs === null) sessionStartMs = Date.now(); }
  function endSession() {
    if (!stats) initStatsForCurrentUser();
    if (sessionStartMs !== null) {
      stats.listening_ms_total += (Date.now() - sessionStartMs);
      sessionStartMs = null;
      saveStats(stats);
    }
  }

  if (audio) {
    audio.addEventListener('play', () => { startSession(); });
    audio.addEventListener('pause', () => { endSession(); });
    audio.addEventListener('ended', () => {
      endSession();
      countPlayOnce();
      countedPlayForTrack = false;
    });
  }
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) endSession();
    else if (!audio || !audio.paused) startSession();
  });
  window.addEventListener('beforeunload', () => { endSession(); });

  window.setCurrentTrack = function setCurrentTrack(track) {
    if (!track || !track.id) return;
    endSession();
    currentTrack = track;
    countedPlayForTrack = false;
  };

  // Re-inicializa stats cuando cambia / llega el usuario
  document.addEventListener('feel:user-ready', initStatsForCurrentUser);
  document.addEventListener('feel:session-switched', () => {
    initStatsForCurrentUser();
    try { document.getElementById('pf-recent-list')?.replaceChildren(); } catch {}
  });

  // Arranque
  initStatsForCurrentUser();
})();

window.markMoodClick = function markMoodClick(mood) {
  const LS_KEY = getStatsKey();
  const raw = localStorage.getItem(LS_KEY);
  const stats = raw ? JSON.parse(raw) : {};
  stats.mood_counts = Object.assign({ happy:0, sad:0, love:0, angry:0, calm:0, neutral:0 }, stats.mood_counts || {});
  if (stats.mood_counts[mood] != null) {
    stats.mood_counts[mood] += 1;
    localStorage.setItem(LS_KEY, JSON.stringify(stats));
    if (typeof window.renderProfileStats === 'function') window.renderProfileStats();
  }
};

// Delegación: cualquier botón con data-mood-click="happy|sad|love|angry|calm|neutral"
document.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-mood-click]');
  if (!btn) return;
  const mood = btn.getAttribute('data-mood-click');
  if (mood) window.markMoodClick(mood);
});


window.setPlaylistsCount = function setPlaylistsCount(n) {
  try {
    const LS_KEY = getStatsKey();
    const raw = localStorage.getItem(LS_KEY);
    const obj = raw ? JSON.parse(raw) : {};
    obj.playlists_count = Math.max(0, parseInt(n || 0, 10));
    localStorage.setItem(LS_KEY, JSON.stringify(obj));
    if (typeof window.renderProfileStats === 'function') {
      window.renderProfileStats();
    }
  } catch {}
};

document.addEventListener('feel:playlists-updated', (ev) => {
  if (typeof ev.detail?.count === 'number') {
    window.setPlaylistsCount(ev.detail.count);
  }
});


// --- Hook de mensajes backend ---
(function () {
  const BE = window.API?.origin || 'http://127.0.0.1:8000';

  async function pullFlashOnce() {
    try {
      const r = await fetch(`${BE.replace(/\/+$/,'')}/api/v1/flash/consume/`, {
        credentials: 'include',
        headers: { 'Accept': 'application/json' },
        cache: 'no-store'
      });
      if (!r.ok) return;
      const data = await r.json().catch(() => null);
      if (data && (data.text || data.title)) {
        window.Flash?.show?.(data);
      }
    } catch (_) {}
  }

  document.addEventListener('DOMContentLoaded', pullFlashOnce);
})();


// Estado global
window.__fsCaptcha = window.__fsCaptcha || {
  ready: false,
  rendered: { reg: false, login: false },
  ids: {},
  want: { reg: false, login: false }
}

function __fsTryRender(idKey) {
  const map = { reg: 'reg-captcha', login: 'login-captcha' };
  const domId = map[idKey];
  const el = document.getElementById(domId);

  // Si no hay host o aún no está listo, agenda y sal
  if (!el || !window.hcaptcha || !window.__fsCaptcha.ready) {
    window.__fsCaptcha.want[idKey] = true;
    return;
  }
  if (window.__fsCaptcha.rendered[idKey]) return;

  const sitekey = (window.PUBLIC_CONF && window.PUBLIC_CONF.hcaptcha_sitekey)
               || window.HCAPTCHA_SITEKEY || el.dataset.sitekey || '';
  if (!sitekey) return;

  const wid = window.hcaptcha.render(domId, {
    sitekey,
    callback: () => {
      document.querySelectorAll('[data-field-error="captcha"]').forEach(n => n.remove());
    }
  });
  window.__fsCaptcha.rendered[idKey] = true;
  window.__fsCaptcha.ids[idKey] = wid;
}

window.onHcaptchaLoad = function onHcaptchaLoad() {
  window.__fsCaptcha.ready = true;
  if (window.__fsCaptcha.want.reg)   __fsTryRender('reg');
  if (needsLoginCaptcha() && window.__fsCaptcha.want.login) __fsTryRender('login');
};

function __fsRenderSoon(idKey) {
  requestAnimationFrame(() => setTimeout(() => __fsTryRender(idKey), 0));
}

document.addEventListener('DOMContentLoaded', () => {
  window.__fsCaptcha.want.reg = true;
  __fsRenderSoon('reg');

  // Login solo si ya se alcanzó el umbral
  showLoginCaptcha(needsLoginCaptcha());
  if (needsLoginCaptcha()) __fsRenderSoon('login');
});


// === Control de fallos de login y captcha condicional ===
const LOGIN_FAIL_KEY = 'fs_login_fail_count_v2';
function getLoginFails(){
  const v = sessionStorage.getItem(LOGIN_FAIL_KEY);
  return parseInt(v || '0', 10);
}
function setLoginFails(n){
  sessionStorage.setItem(LOGIN_FAIL_KEY, String(n));
}
function needsLoginCaptcha(){ return getLoginFails() >= 3; }

function showLoginCaptcha(show){
  const host = document.getElementById('login-captcha');
  if (!host) return;
  host.classList.toggle('hidden', !show);
  if (show) __fsTryRender('login');
}

document.addEventListener('DOMContentLoaded', () => {
  if (!sessionStorage.getItem('fs_login_attempted')) {
    setLoginFails(0);
  }
  // Refresca visibilidad del host
  showLoginCaptcha(needsLoginCaptcha());
});


// ===================== Registro =====================
(function () {
  const API_ORIGIN =
    (window.API && window.API.origin) ||
    (window.FEEL?.env?.API_BASE?.replace(/\/api(?:\/v1)?\/?$/,'') ) ||
    "http://127.0.0.1:8000";

  function getCookie(name) {
    const m = document.cookie.match('(^|;)\\s*' + name + '\\s*=\\s*([^;]+)');
    return m ? m.pop() : '';
  }
  function clearFieldErrors(formEl) {
    formEl?.querySelectorAll('[data-field-error]').forEach(n => n.remove());
    formEl?.querySelectorAll('.border-red-500').forEach(inp => inp.classList.remove('border-red-500'));
  }
  function setFieldError(inputId, message) {
    const inp = document.getElementById(inputId);
    if (!inp) return;
    inp.classList.add('border-red-500');
    const msg = document.createElement('div');
    msg.setAttribute('data-field-error', '1');
    msg.className = 'mt-1 text-xs text-red-500';
    msg.textContent = message;
    inp.insertAdjacentElement('afterend', msg);
  }
  function setCaptchaError(message) {
    const host = document.getElementById('reg-captcha');
    if (!host) return;
    host.parentElement?.querySelectorAll('[data-field-error="captcha"]').forEach(n => n.remove());
    const msg = document.createElement('div');
    msg.setAttribute('data-field-error', 'captcha');
    msg.className = 'mt-2 text-xs text-red-500 text-center';
    msg.textContent = message;
    host.insertAdjacentElement('afterend', msg);
  }
  function firstErrorText(v) {
    if (!v) return 'Campo inválido';
    if (Array.isArray(v)) {
      const x = v[0];
      return typeof x === 'string' ? x : (x?.message || x?.code || 'Campo inválido');
    }
    return typeof v === 'object' ? (v.message || 'Campo inválido') : String(v);
  }
  function getHCaptchaTokenReg() {
    const area = document.querySelector('#fs-register-form textarea[name="h-captcha-response"]');
    if (area && area.value) return area.value;
    if (window.hcaptcha) {
      const wid = window.__fsCaptcha?.ids?.reg;
      const t = (wid !== undefined) ? window.hcaptcha.getResponse(wid) : window.hcaptcha.getResponse();
      return t || '';
    }
    return '';
  }

  (async function ensureCsrf() {
    try {
      await fetch(`${API_ORIGIN}/accounts/csrf/`, {
        credentials: 'include',
        headers: { 'Accept': 'application/json' }
      });
    } catch {}
  })();

  const $form = document.getElementById('fs-register-form');
  const $btn  = document.getElementById('btn-register');
  if ($form) $form.addEventListener('submit', e => e.preventDefault());

  $btn?.addEventListener('click', async () => {
    clearFieldErrors($form);
    document.querySelectorAll('[data-field-error="captcha"]').forEach(n => n.remove());

    const first_name = document.getElementById('register-first-name')?.value.trim() || '';
    const last_name  = document.getElementById('register-last-name')?.value.trim()  || '';
    const username   = document.getElementById('register-username')?.value.trim()   || '';
    const email      = document.getElementById('register-email')?.value.trim()      || '';
    const password   = document.getElementById('register-password')?.value          || '';
    const password2  = document.getElementById('register-password2')?.value         || '';

    const htoken = getHCaptchaTokenReg();
    if (!htoken) {
      setCaptchaError('Por favor, completa el captcha.');
      document.getElementById('reg-captcha')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

    const payload = {
      action: 'register',
      first_name, last_name, username, email, password, password2,
      'h-captcha-response': htoken
    };

    const oldText = $btn.textContent;
    $btn.textContent = 'Creando cuenta…';
    $btn.disabled = true;

    try {
      const r = await fetch(`${API_ORIGIN}/accounts/login-register/`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
          'X-CSRFToken': getCookie('csrftoken')
        },
        body: JSON.stringify(payload)
      });

      const data = await r.json().catch(() => null);

      if (r.status === 400 || (data && data.ok === false)) {
        const errors = (data && data.errors) || {};
        const map = {
          first_name: 'register-first-name',
          last_name: 'register-last-name',
          username: 'register-username',
          email: 'register-email',
          password: 'register-password',
          password2: 'register-password2'
        };
        let firstErrId = null;

        Object.entries(errors).forEach(([field, arr]) => {
          if (field === '__all__') return;
          const id = map[field];
          if (!id) return;
          setFieldError(id, firstErrorText(arr));
          if (!firstErrId) firstErrId = id;
        });

        if (errors.__all__) {
          window.Flash?.error?.(firstErrorText(errors.__all__));
        } else if (!Object.keys(errors).length) {
          window.Flash?.error?.((data && data.detail) || 'Revisa los campos del formulario.');
        }

        if (firstErrId) document.getElementById(firstErrId)?.focus();
        return;
      }

      if (r.ok && data && data.ok === true) {
          // Toast
          if (data.email_sent === false) {
            window.Flash?.warning?.(data.message || 'Cuenta creada, pero el correo no pudo enviarse.');
          } else {
            window.Flash?.success?.(data.message || '¡Cuenta creada! Revisa tu correo para activarla.');
          }

          // Limpiar errores de estilos
          clearFieldErrors($form);
          ['register-first-name','register-last-name','register-username','register-email','register-password','register-password2']
            .forEach(id => document.getElementById(id)?.classList.remove('border-red-500'));

          // Limpiar formulario y captcha
          $form?.reset();
          const capArea = document.querySelector('#fs-register-form textarea[name="h-captcha-response"]');
          if (capArea) capArea.value = '';
          try { window.hcaptcha?.reset(window.__fsCaptcha?.ids?.reg); } catch {}

          // Ir a la pestaña de login
          document.getElementById('login-tab')?.click();

          return;
      }

      window.Flash?.error?.('Respuesta inesperada del servidor.');
    } catch (e) {
      window.Flash?.error?.('Error de red. Verifica el backend en :8000');
      console.error(e);
    } finally {
      $btn.textContent = oldText;
      $btn.disabled = false;
    }
  });
})();



// ===================== Login =====================
(function () {
  try {
    const API_ORIGIN =
      (window.API && window.API.origin) ||
      (window.FEEL?.env?.API_BASE?.replace(/\/api(?:\/v1)?\/?$/, "")) ||
      "http://127.0.0.1:8000";

    const $form = document.getElementById("fs-login-form");
    const $btn  = document.getElementById("btn-login");
    const $u    = document.getElementById("id_username");
    const $p    = document.getElementById("id_password");
    if (!$form || !$btn || !$u || !$p) return;

    // Helpers ligeros
    const getCookie = (name) => {
      try {
        const m = document.cookie.match('(^|;)\\s*' + name + '\\s*=\\s*([^;]+)');
        return m ? m.pop() : "";
      } catch { return ""; }
    };
    const clearFieldErrors = (formEl) => {
      try {
        formEl?.querySelectorAll("[data-field-error]").forEach(n => n.remove());
        formEl?.querySelectorAll(".border-red-500").forEach(inp => inp.classList.remove("border-red-500"));
      } catch {}
    };
    const setFieldError = (id, msg) => {
      try {
        const inp = document.getElementById(id);
        if (!inp) return;
        inp.classList.add("border-red-500");
        const node = document.createElement("div");
        node.setAttribute("data-field-error", "1");
        node.className = "mt-1 text-xs text-red-500";
        node.textContent = msg || "Campo inválido";
        inp.insertAdjacentElement("afterend", node);
      } catch {}
    };
    const firstErrorText = (v) => {
      if (!v) return "Campo inválido";
      if (Array.isArray(v)) { const x=v[0]; return typeof x==="string"?x:(x?.message||x?.code||"Campo inválido"); }
      return typeof v==="object" ? (v.message || "Campo inválido") : String(v);
    };
    function toast(type, text) {
      try {
        if (window.Flash?.[type]) return window.Flash[type](text);
        if (window.Flash?.show)   return window.Flash.show({ type, text });
      } catch {}
      console.log(`[Toast ${type}]`, text);
    }


    const getHCaptchaTokenLogin = () => {
      try {
        const area = document.querySelector('#fs-login-form textarea[name="h-captcha-response"]');
        if (area && area.value) return area.value;
        if (window.hcaptcha) {
          const wid = window.__fsCaptcha?.ids?.login;
          const t = (wid !== undefined) ? window.hcaptcha.getResponse(wid) : window.hcaptcha.getResponse();
          return t || "";
        }
      } catch {}
      return "";
    };

    // Asegura cookie CSRF
    (async function ensureCsrf() {
      try {
        await fetch(`${API_ORIGIN}/accounts/csrf/`, {
          credentials: "include",
          headers: { "Accept": "application/json" }
        });
      } catch {}
    })();

    // Evitar submit nativo
    $form.addEventListener("submit", (e) => e.preventDefault());

    async function doLogin() {
      try {
        clearFieldErrors($form);

        const username = ($u.value || "").trim();
        const password = $p.value || "";
        const htoken   = getHCaptchaTokenLogin();

        if (needsLoginCaptcha() && !htoken) {
          toast('error', 'Por seguridad, completa el captcha para continuar.');
          showLoginCaptcha(true);
          return;
        }

        // Payload
        const payload = {
          action: "login",
          username,
          login: username,
          email: username,
          password,
          ...(htoken ? { "h-captcha-response": htoken } : {})
        };

        const oldText = $btn.textContent;
        $btn.textContent = "Entrando…";
        $btn.disabled = true;

        const r = await fetch(`${API_ORIGIN}/accounts/login-register/`, {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
            "Accept": "application/json",
            "X-Requested-With": "XMLHttpRequest",
            "X-CSRFToken": getCookie("csrftoken"),
          },
          body: JSON.stringify(payload),
        });

        let data = null;
        try { data = await r.clone().json(); } catch { data = null; }

        // --- ERROR DE VALIDACIÓN ---
        if (r.status === 400 || (data && data.ok === false)) {
          const errs = (data && data.errors) || {};
          if (errs.username || errs.login || errs.email)
            setFieldError("id_username", firstErrorText(errs.username || errs.login || errs.email));
          if (errs.password)
            setFieldError("id_password", firstErrorText(errs.password));
          if (errs.__all__ || errs.non_field_errors)
            toast("error", firstErrorText(errs.__all__ || errs.non_field_errors));
          if (!Object.keys(errs).length)
            toast("error", (data && data.detail) || "No se pudo iniciar sesión.");

          //  Incrementamos de fallos
          const fails = getLoginFails() + 1;
          setLoginFails(fails);
          if (fails >= 3) {
            showLoginCaptcha(true);
            __fsRenderSoon('login');
            toast('warning', 'Has tenido varios intentos. Completa el captcha para continuar.');
          }
          return;
        }

        // --- ÉXITO ---
        if (r.ok && data && data.ok === true) {
          setLoginFails(0);
          try { window.hcaptcha?.reset(window.__fsCaptcha?.ids?.login); } catch {}
          const to = data.redirect
            || ((window.FEEL?.env?.FRONTEND_BASE_URL || "http://127.0.0.1:5500").replace(/\/+$/,"") + "/pages/dashboard.html#/");
          window.location.href = to;
          return;
        }

        // --- CUALQUIER OTRO CASO ---
        toast("error", "Respuesta inesperada del servidor.");
      } catch (e) {
        console.error("LOGIN JS ERROR", e);
        toast("error", "Error en el script de login.");
      } finally {
        $btn.textContent = "Iniciar Sesión";
        $btn.disabled = false;
      }
    }

    // Click y Enter
    $btn.addEventListener("click", (e) => { e.preventDefault(); doLogin(); });
    $form.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); doLogin(); }
    });

  } catch (e) {
    console.error("LOGIN BOOT ERROR", e);
  }


// --- Limpieza visual al cambiar de sesión (cierre de modales y contenedores) ---
document.addEventListener('feel:session-switched', () => {
  // Cierra modales conocidos
  ['pl-modal','pl-del-modal','pf-edit-modal','pl-share-modal','pl-import-modal'].forEach(id=>{
    const el = document.getElementById(id);
    if (el) el.classList.add('hidden');
  });
  document.body.style.overflow = '';

  // Limpia contenedores que puedan tener datos del usuario anterior
  try { document.getElementById('pl-grid')?.replaceChildren(); } catch {}
  try { document.getElementById('pf-recent-list')?.replaceChildren(); } catch {}

  // Resetea referencias transitorias (si las usas en otros módulos)
  try { window._currentPlTracks = []; } catch {}
  try { window._editingPlaylistId = null; } catch {}
});


// ============== LOGOUT CONTROLADO ==============
(function () {
  console.log("[FeelSound] logout script cargado");

  const API_ORIGIN =
    (window.API && window.API.origin) ||
    (window.FEEL?.env?.API_BASE?.replace(/\/api(?:\/v1)?\/?$/,"")) ||
    window.location.origin;  // fallback seguro

  async function doLogout() {
    console.log("[FeelSound] haciendo logout... API_ORIGIN =", API_ORIGIN);

    try {
      await fetch(`${API_ORIGIN}/accounts/logout/`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Accept': 'application/json' }
      });
    } catch (e) {
      console.warn("Error en /accounts/logout/:", e);
    }

    // Limpia TODO rastro local del usuario
    try { localStorage.removeItem('fs_user_cache_v1'); } catch {}
    try { localStorage.removeItem('fs_user_email'); localStorage.removeItem('fs_user_id'); } catch {}
    try { localStorage.removeItem('fs_owner_id_v3'); } catch {}
    try { sessionStorage.clear(); } catch {}
    try { wipeUserState(); } catch {}

    try { __lastUserId = null; UserStore.set(null); } catch {}
    try { broadcastSessionSwitch(null, null); } catch {}

    // ===== RUTA CORRECTA DEL LOGIN =====
    const FE_BASE =
      (window.FEEL?.env?.FRONTEND_BASE_URL || window.location.origin)
        .replace(/\/+$/,"");   // sin slash final

    const loginUrl = FE_BASE + "/#login";
    console.log("[FeelSound] redirect logout ->", loginUrl);
    location.replace(loginUrl);
  }

  // La dejo global por si quieres llamarla desde HTML o consola
  window.doFsLogout = doLogout;

  // --- Delegación de eventos: funciona aunque el botón se agregue después ---
  document.addEventListener('click', function (e) {
    const target = e.target.closest('#btn-logout,[data-logout]');
    if (!target) return;
    e.preventDefault();
    doLogout();
  });
})();




})();

