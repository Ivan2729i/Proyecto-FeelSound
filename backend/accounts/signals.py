from django.contrib import messages
from django.dispatch import receiver
from allauth.account.signals import user_signed_up
from django.core.cache import cache
from django.contrib.auth.signals import (
    user_login_failed, user_logged_in, user_logged_out
)
from django.db.models.signals import pre_save, post_delete
from django.dispatch import receiver
from django.contrib.auth import get_user_model



# --- Config ---
THRESHOLD = 3
WINDOW_SECONDS = 10 * 60

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

# --- Flash a sesión para frontend desacoplado ---
def _flash(request, type_, text, title=""):
    try:
        request.session["fs_flash"] = {"type": type_, "text": text, "title": title}
    except Exception:
        pass

# --- Señales ---

@receiver(user_logged_in, dispatch_uid="fs_logged_in_handler")
def handle_logged_in(sender, request, user, **kwargs):
    # limpia contador de fallos por IP
    ip = _ip_from_request(request)
    reset_fail(ip)

    msg = f"Has iniciado sesión como {_display_name(user)}."
    messages.success(request, msg)
    _flash(request, "success", msg, "¡Bienvenido!")

@receiver(user_login_failed, dispatch_uid="fs_login_failed_handler")
def handle_login_failed(sender, credentials, request, **kwargs):
    if not request:
        return
    msg = "Credenciales inválidas. Verifica tu correo/usuario o contraseña."
    messages.error(request, msg)
    _flash(request, "error", msg)
    ip = _ip_from_request(request)
    inc_fail(ip)

@receiver(user_signed_up, dispatch_uid="fs_user_signed_up_handler")
def handle_signed_up(sender, request, user, **kwargs):
    msg = f"¡Bienvenido(a), {_display_name(user)}! Tu cuenta ha sido creada."
    messages.success(request, msg)
    _flash(request, "success", msg, "Cuenta creada")

@receiver(user_logged_out, dispatch_uid="fs_logged_out_handler")
def handle_logged_out(sender, request, user, **kwargs):
    msg = "Sesión cerrada correctamente."
    messages.success(request, msg)
    _flash(request, "success", msg, "Hasta pronto")


# ======= Borrar fotos en perfil dashboard ===========
User = get_user_model()

@receiver(pre_save, sender=User)
def delete_old_avatar_on_change(sender, instance, **kwargs):
    if not instance.pk:
        return
    try:
        old_file = sender.objects.only("profile_picture").get(pk=instance.pk).profile_picture
    except sender.DoesNotExist:
        return
    new_file = instance.profile_picture
    if old_file and old_file.name and old_file != new_file:
        try:
            if old_file.storage.exists(old_file.name):
                old_file.storage.delete(old_file.name)
        except Exception:
            pass

@receiver(post_delete, sender=User)
def delete_avatar_on_delete(sender, instance, **kwargs):
    f = instance.profile_picture
    if f and f.name:
        try:
            if f.storage.exists(f.name):
                f.storage.delete(f.name)
        except Exception:
            pass


