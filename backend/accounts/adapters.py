# accounts/adapters.py
from allauth.account.adapter import DefaultAccountAdapter
from allauth.socialaccount.adapter import DefaultSocialAccountAdapter
from allauth.account.utils import perform_login
from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.utils.translation import gettext_lazy as _
from .utils.hcaptcha import verify_hcaptcha
from .signals import THRESHOLD, get_fail, _ip_from_request

User = get_user_model()

# === Adapter para ACCOUNT ===
class FeelSoundAccountAdapter(DefaultAccountAdapter):
    def add_message(self, request, level, message_template, message_context=None, extra_tags=''):
        ret = super().add_message(request, level, message_template, message_context, extra_tags)
        try:
            used = getattr(request, "_fs_allauth_templates", set())
            used.add(message_template)
            setattr(request, "_fs_allauth_templates", used)
        except Exception:
            pass
        return ret

    def clean_signup(self, request, form):
        token = request.POST.get("h-captcha-response")
        ok, _ = verify_hcaptcha(token, request.META.get("REMOTE_ADDR"))
        if not ok:
            raise ValidationError(_("Verificación hCaptcha fallida en registro."))
        return super().clean_signup(request, form)

    def clean_credentials(self, request, form):
        ip = _ip_from_request(request)
        fails = get_fail(ip)
        if fails >= THRESHOLD:
            token = request.POST.get("h-captcha-response")
            ok, _ = verify_hcaptcha(token, request.META.get("REMOTE_ADDR"))
            if not ok:
                raise ValidationError(_("Verificación hCaptcha fallida. Intenta de nuevo."))
        return super().clean_credentials(request, form)


# === Adapter para SOCIALACCOUNT (Google) ===
class CustomSocialAccountAdapter(DefaultSocialAccountAdapter):
    def pre_social_login(self, request, sociallogin):
        try:
            request.session['fs_from_social_login'] = True
        except Exception:
            pass

        if sociallogin.is_existing:
            return

        email = sociallogin.user.email or None
        if not email:
            return

        try:
            existing_user = User.objects.get(email__iexact=email)
        except User.DoesNotExist:
            return

        sociallogin.connect(request, existing_user)
        perform_login(request, existing_user, email_verification='optional')
        return

    def is_open_for_signup(self, request, sociallogin):
        return True

