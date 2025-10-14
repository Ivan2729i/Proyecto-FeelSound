from django.contrib import messages
from django.dispatch import receiver
from django.contrib.auth.signals import (
    user_logged_in,
    user_login_failed,
)
from allauth.account.signals import user_signed_up


def _display_name(user):
    return user.get_full_name() or user.username or user.email or "usuario"


@receiver(user_logged_in, dispatch_uid="fs_user_logged_in")
def on_login(sender, request, user, **kwargs):
    if getattr(request, "session", None) and request.session.pop("fs_from_social_login", False):
        return

    used = getattr(request, "_fs_allauth_templates", set())
    if "account/messages/logged_in.txt" in used:
        return

    messages.success(request, f"Has iniciado sesión exitosamente como {_display_name(user)}.")


@receiver(user_login_failed, dispatch_uid="fs_user_login_failed")
def on_login_failed(sender, credentials, request, **kwargs):
    if request:
        messages.error(request, "Credenciales inválidas. Verifica tu correo/usuario o contraseña.")


@receiver(user_signed_up, dispatch_uid="fs_user_signed_up")
def on_signed_up(sender, request, user, **kwargs):
    messages.success(request, f"¡Bienvenido(a), {_display_name(user)}! Tu cuenta ha sido creada.")
