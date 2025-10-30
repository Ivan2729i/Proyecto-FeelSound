from django.contrib import messages
from django.dispatch import receiver
from allauth.account.signals import user_signed_up
from django.core.cache import cache
from django.contrib.auth.signals import user_login_failed, user_logged_in

# --- Config ---
THRESHOLD = 3              # a partir de 3 fallos se muestra hCaptcha
WINDOW_SECONDS = 10 * 60   # ventana de conteo: 10 min

# --- Helpers ---
def _display_name(user):
    return user.get_full_name() or user.username or user.email or "usuario"

def _ip_from_request(request):
    xff = request.META.get("HTTP_X_FORWARDED_FOR")
    if xff:
        return xff.split(",")[0].strip()
    return request.META.get("REMOTE_ADDR", "0.0.0.0")

def _cache_key(ip: str) -> str:
    return f"fs:login:fail:{ip}"

def inc_fail(ip: str):
    key = _cache_key(ip)
    val = cache.get(key, 0) + 1
    cache.set(key, val, timeout=WINDOW_SECONDS)
    return val

def reset_fail(ip: str):
    cache.delete(_cache_key(ip))

def get_fail(ip: str) -> int:
    return cache.get(_cache_key(ip), 0)

# --- Señales ---

@receiver(user_logged_in, dispatch_uid="fs_logged_in_handler")
def handle_logged_in(sender, request, user, **kwargs):
    ip = _ip_from_request(request)
    reset_fail(ip)

    if getattr(request, "session", None) and request.session.pop("fs_from_social_login", False):
        return

    used = getattr(request, "_fs_allauth_templates", set())
    if "account/messages/logged_in.txt" in used:
        return

    messages.success(request, f"Has iniciado sesión exitosamente como {_display_name(user)}.")

@receiver(user_login_failed, dispatch_uid="fs_login_failed_handler")
def handle_login_failed(sender, credentials, request, **kwargs):
    if not request:
        return
    messages.error(request, "Credenciales inválidas. Verifica tu correo/usuario o contraseña.")
    ip = _ip_from_request(request)
    inc_fail(ip)

@receiver(user_signed_up, dispatch_uid="fs_user_signed_up_handler")
def handle_signed_up(sender, request, user, **kwargs):
    messages.success(request, f"¡Bienvenido(a), {_display_name(user)}! Tu cuenta ha sido creada.")

