// ============================================================================
//  FeelSound · Config
// ============================================================================

(function () {
  const qs = new URLSearchParams(location.search);
  const apiOverride = qs.get("api"); // p.ej. ?api=https://miapp.com/api/v1

  const ORIGIN = window.location.origin;            // https://feelsoundgit-gvi6t.ondigitalocean.app
  const DEFAULT_V1 = `${ORIGIN}/api/v1`;

  // Si te pasan ?api=... (full), lo usamos. Si no, DEFAULT_V1.
  const v1Base = (apiOverride ? apiOverride : DEFAULT_V1).replace(/\/+$/, "");

  // === Config global ===
  window.API = {
    v1Base,                  // p.ej. https://.../api/v1
    origin: ORIGIN,          // p.ej. https://...
    withCredentials: true,
    timeoutMs: 12000,
  };

  // === CSRF helpers ===
  function getCookie(name) {
    const m = document.cookie.match("(^|;)\\s*" + name + "\\s*=\\s*([^;]+)");
    return m ? decodeURIComponent(m.pop()) : "";
  }

  async function ensureCsrf() {
    if (getCookie("csrftoken")) return true;
    try {
      await fetch(`${window.API.v1Base}/csrf`, { credentials: "include" });
      return !!getCookie("csrftoken");
    } catch {
      return false;
    }
  }

  function needsCsrf(method) {
    const m = (method || "GET").toUpperCase();
    return !["GET", "HEAD", "OPTIONS", "TRACE"].includes(m);
  }

  function isFormData(body) {
    return typeof FormData !== "undefined" && body instanceof FormData;
  }

  async function coreFetch(url, opts = {}) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), window.API.timeoutMs);

    const final = { credentials: "include", signal: ctrl.signal, ...opts };
    final.method = (final.method || "GET").toUpperCase();
    final.headers = new Headers(final.headers || {});

    if (final.method === "GET" && typeof final.cache === "undefined") {
      final.cache = "no-store";
    }

    if (needsCsrf(final.method)) {
      const ok = await ensureCsrf();
      if (ok) {
        const token = getCookie("csrftoken");
        if (token) final.headers.set("X-CSRFToken", token);
      }
    }

    if (!isFormData(final.body) && !final.headers.has("Content-Type") && final.body && typeof final.body === "object") {
      final.headers.set("Content-Type", "application/json");
    }

    try {
      const res = await fetch(url, final);
      clearTimeout(timer);
      if (!res.ok) throw Object.assign(new Error("HTTP " + res.status), { res });
      const ct = res.headers.get("content-type") || "";
      return ct.includes("application/json") ? res.json() : res.text();
    } catch (e) {
      clearTimeout(timer);
      throw e;
    }
  }

  // === Helpers públicos ===
  window.apiFetchV1 = function apiFetchV1(path, opts = {}) {
    const p = path.startsWith("/") ? path : `/${path}`;
    const u = path.startsWith("http") ? path : `${window.API.v1Base}${p}`;
    return coreFetch(u, opts);
  };

  window.apiFetchRoot = function apiFetchRoot(path, opts = {}) {
    const p = path.startsWith("/") ? path : `/${path}`;
    const u = path.startsWith("http") ? path : `${window.API.origin}${p}`;
    return coreFetch(u, opts);
  };

  // === Salud ===
  window.apiHealth = async function apiHealth() {
    try {
      let r = await fetch(`${window.API.origin}/api/health`, { credentials: "include" });
      if (!r.ok) r = await fetch(`${window.API.origin}/health`, { credentials: "include" });
      return r.ok;
    } catch { return false; }
  };

  // === Config pública (hCaptcha, etc.) ===
  window.PUBLIC_CONF = { hcaptcha_sitekey: "" };

  window.loadPublicConfig = async function loadPublicConfig() {
    try {
      const data = await fetch(`${window.API.v1Base}/public-config`, { credentials: "include" })
        .then(r => r.json());
      window.PUBLIC_CONF = data || {};
      window.HCAPTCHA_SITEKEY = window.PUBLIC_CONF.hcaptcha_sitekey || "";
    } catch (e) {
      console.warn("No se pudo cargar public-config:", e);
    }
  };

  window.loadPublicConfig();

  // === AUTH helpers ===
  window.AUTH = {
    googleLoginUrl() {
      return `${window.API.origin}/accounts/google/login/?process=login`;
    },
  };

  document.addEventListener("DOMContentLoaded", () => {
    const btn = document.getElementById("btn-google");
    if (btn) btn.setAttribute("href", window.AUTH.googleLoginUrl());
  });

  console.log("[FeelSound] v1Base:", window.API.v1Base, "| origin:", window.API.origin);
})();
