// ============================================================================
//  FeelSound · Password_Reset
// ============================================================================
(function () {
  const API_ORIGIN =
    (window.API && window.API.origin) ||
    (window.FEEL?.env?.API_BASE?.replace(/\/api(?:\/v1)?\/?$/, "")) ||
    "http://127.0.0.1:8000";

  // Adónde mandar tras éxito
  const FRONT_BASE = (window.FEEL?.env?.FRONTEND_BASE_URL || location.origin).replace(/\/+$/,'');
  const RESET_DONE_PATH = (window.FEEL?.env?.RESET_DONE_PATH || "/pages/password_reset_done.html");
  const RESET_DONE_URL = new URL(RESET_DONE_PATH, FRONT_BASE).toString();

  const $form = document.getElementById("fs-reset-form");
  const $err  = document.getElementById("err-email");
  if (!$form) return;
  const $btn = $form.querySelector('button[type="submit"]');

  function getCookie(name) {
    const m = document.cookie.match('(^|;)\\s*' + name + '\\s*=\\s*([^;]+)');
    return m ? m.pop() : '';
  }

  (async function ensureCsrf() {
    try {
      await fetch(`${API_ORIGIN}/accounts/csrf/`, {
        credentials: "include",
        headers: { "Accept": "application/json" }
      });
    } catch {}
  })();

  function uiError(msg) {
    if ($err) { $err.textContent = msg || "Ocurrió un error."; $err.classList.remove("hidden"); }
    window.Flash?.error?.(msg);
  }
  function uiClear() {
    if ($err) { $err.textContent = ""; $err.classList.add("hidden"); }
  }

  async function sendPasswordReset(email) {
    const url = `${API_ORIGIN}/accounts/password_reset/`;
    const r = await fetch(url, {
      method: "POST",
      credentials: "include",
      redirect: "follow",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "X-CSRFToken": getCookie("csrftoken"),
      },
      body: new URLSearchParams({ email })
    });

    if (r.ok || r.status === 302) return { ok: true, status: r.status };

    let text = "";
    try { text = await r.text(); } catch {}
    return { ok: false, status: r.status, body: text.slice(0, 300) };
  }

  $form.addEventListener("submit", async (e) => {
    e.preventDefault();
    uiClear();

    const email = (document.getElementById("id_email")?.value || "").trim();
    if (!email) return uiError("Escribe tu correo.");

    const old = $btn?.textContent;
    if ($btn) { $btn.textContent = "Enviando…"; $btn.disabled = true; }

    try {
      await fetch(`${API_ORIGIN}/accounts/csrf/`, {
        credentials: "include",
        headers: { "Accept": "application/json" }
      }).catch(()=>{});

      const res = await sendPasswordReset(email);

      if (!res.ok) {
        if (res.status === 403) return uiError("CSRF bloqueó la petición.");
        if (res.status === 404) return uiError("Ruta no encontrada.");
        if (res.status === 500) return uiError("Error del servidor al enviar el email.");
        return uiError("No se pudo enviar el correo de recuperación.");
      }

      window.Flash?.success?.("Si el correo existe, te enviamos un enlace para restablecer la contraseña.");
      window.location.href = RESET_DONE_URL;

    } catch (err) {
      console.error("password_reset:", err);
      uiError("Error de red. Verifica que el backend (:8000) esté activo.");
    } finally {
      if ($btn) { $btn.textContent = old || "Enviar Enlace de Recuperación"; $btn.disabled = false; }
    }
  });
})();
