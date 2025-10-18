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
    // Animación (Tailwind v3 ya incluye transform en las utilities de translate)
    el.classList.add('opacity-0', 'translate-y-2');   // desliza y desvanece
    el.classList.add('transition-all', 'duration-500');

    // Opcional: leve escala para “shrink”
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
    const hPlayer = p ? p.offsetHeight : 0;   // ej. 92~100px
    const hHeader = 64;                       // tu h-16
    const extraTop = 112;                     // ~ 7rem para títulos
    const main = document.getElementById('fs-content');
    const panel = document.getElementById('fs-songs-scroll');
    if(main) main.style.height = `calc(100dvh - ${hHeader}px - ${hPlayer}px)`;
    if(panel) panel.style.height = `calc(100dvh - ${hHeader}px - ${hPlayer}px - ${extraTop}px)`;
  }
  window.addEventListener('load', setHeights);
  window.addEventListener('resize', setHeights);
})();
