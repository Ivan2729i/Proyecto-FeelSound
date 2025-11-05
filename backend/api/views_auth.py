from django.http import JsonResponse
from django.views.decorators.csrf import ensure_csrf_cookie
from django.utils.decorators import method_decorator
from django.views import View
from django.contrib.auth import authenticate, login, logout
from django.conf import settings

@method_decorator(ensure_csrf_cookie, name="dispatch")
class CsrfView(View):
    def get(self, request):
        return JsonResponse({"detail": "ok", "csrftoken": request.META.get("CSRF_COOKIE", "")})

class SessionLoginView(View):
    def post(self, request):
        try:
            import json
            data = json.loads(request.body.decode("utf-8"))
        except Exception:
            return JsonResponse({"detail": "JSON inválido"}, status=400)

        username = (data.get("username") or "").strip()
        password = data.get("password") or ""
        user = authenticate(request, username=username, password=password)
        if not user:
            return JsonResponse({"detail": "Credenciales inválidas"}, status=401)

        login(request, user)
        return JsonResponse({
            "detail": "ok",
            "user": {
                "id": user.id,
                "username": user.username,
                "email": user.email,
                "first_name": user.first_name,
                "last_name": user.last_name,
            }
        })

class SessionLogoutView(View):
    def post(self, request):
        logout(request)
        return JsonResponse({"detail": "ok"})

class PublicConfigView(View):
    def get(self, request):
        return JsonResponse({
            "hcaptcha_sitekey": getattr(settings, "HCAPTCHA_SITE_KEY", ""),
        })