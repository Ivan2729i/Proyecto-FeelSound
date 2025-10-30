from django.conf import settings
from .signals import get_fail, THRESHOLD, _ip_from_request

def hcaptcha_context(request):
    try:
        ip = _ip_from_request(request)
        fails = get_fail(ip)
    except Exception:
        fails = 0
    return {
        "HCAPTCHA_SITE_KEY": getattr(settings, "HCAPTCHA_SITE_KEY", ""),
        "LOGIN_REQUIRES_HCAPTCHA": fails >= THRESHOLD,
    }

