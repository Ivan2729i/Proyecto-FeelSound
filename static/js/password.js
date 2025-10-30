document.addEventListener('DOMContentLoaded', () => {
  // Delegación: todos los botones con data-password-toggle
  document.querySelectorAll('[data-password-toggle]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const targetId = btn.dataset.target;
      if (!targetId) return;
      const input = document.getElementById(targetId);
      if (!input) return;

      const isHidden = input.type === 'password';
      // Cambia tipo
      input.type = isHidden ? 'text' : 'password';

      // Actualiza aria-label / title
      btn.setAttribute('aria-label', isHidden ? 'Ocultar contraseña' : 'Mostrar contraseña');
      btn.setAttribute('title', isHidden ? 'Ocultar contraseña' : 'Mostrar contraseña');

      // Cambia iconos (usa data-icon)
      const eyeOpen = btn.querySelector('[data-icon="eye-open"]');
      const eyeClosed = btn.querySelector('[data-icon="eye-closed"]');
      if (eyeOpen && eyeClosed) {
        if (isHidden) {
          eyeOpen.classList.remove('hidden');
          eyeClosed.classList.add('hidden');
        } else {
          eyeOpen.classList.add('hidden');
          eyeClosed.classList.remove('hidden');
        }
      }
    });
  });

  // Opcional: si tienes campos con autocomplete/llenado automático y quieres que
  // el icono refleje estado al cargar, sincroniza:
  document.querySelectorAll('[data-password]').forEach(input => {
    const id = input.id;
    if (!id) return;
    // Busca botón asociado
    const btn = document.querySelector(`[data-password-toggle][data-target="${id}"]`);
    if (!btn) return;
    const eyeOpen = btn.querySelector('[data-icon="eye-open"]');
    const eyeClosed = btn.querySelector('[data-icon="eye-closed"]');
    // Asegurarse que al inicio muestre el estado "oculto"
    if (eyeOpen && eyeClosed) {
      eyeOpen.classList.add('hidden');
      eyeClosed.classList.remove('hidden');
    }
  });
});
