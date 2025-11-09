
document.addEventListener('DOMContentLoaded', () => {
  // Alterna visibilidad al hacer click en el botón
  document.querySelectorAll('[data-password-toggle]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const targetId = btn.dataset.target;
      if (!targetId) return;
      const input = document.getElementById(targetId);
      if (!input) return;

      const toShow = input.type === 'password';
      input.type = toShow ? 'text' : 'password';

      // Accesibilidad
      btn.setAttribute('aria-label', toShow ? 'Ocultar contraseña' : 'Mostrar contraseña');
      btn.setAttribute('title', toShow ? 'Ocultar contraseña' : 'Mostrar contraseña');

      // Iconos
      const eyeOpen   = btn.querySelector('[data-icon="eye-open"]');   // icono de "ver"
      const eyeClosed = btn.querySelector('[data-icon="eye-closed"]'); // icono de "oculto"
      if (eyeOpen && eyeClosed) {
        eyeOpen.classList.toggle('hidden', !toShow);
        eyeClosed.classList.toggle('hidden', toShow);
      }
    });

    // Sincroniza iconos al cargar
    const targetId = btn.dataset.target;
    if (!targetId) return;
    const input = document.getElementById(targetId);
    if (!input) return;

    const eyeOpen   = btn.querySelector('[data-icon="eye-open"]');
    const eyeClosed = btn.querySelector('[data-icon="eye-closed"]');
    if (eyeOpen && eyeClosed) {
      const isHidden = input.type === 'password';
      eyeOpen.classList.toggle('hidden', isHidden);
      eyeClosed.classList.toggle('hidden', !isHidden);
    }
  });
});
