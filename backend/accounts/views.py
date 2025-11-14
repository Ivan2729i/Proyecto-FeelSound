from django.shortcuts import render, redirect
from django.contrib.auth import login
from django.contrib import messages
from .forms import RegistrationForm, LoginForm
from .models import User
from django.contrib.auth.decorators import login_required
from django.core.mail import EmailMessage
from django.template.loader import render_to_string
from django.contrib.sites.shortcuts import get_current_site
from django.utils.http import urlsafe_base64_encode, urlsafe_base64_decode
from django.utils.encoding import force_bytes, force_str
from .tokens import account_activation_token
from django.conf import settings
from django.urls import reverse
from django.http import JsonResponse
from django.contrib.messages import get_messages
import json
from django.views.decorators.csrf import ensure_csrf_cookie
from django.http import HttpResponseBadRequest
from django.http import QueryDict
import logging
from django.template import loader, TemplateDoesNotExist
from django.http import HttpResponseRedirect



logger = logging.getLogger(__name__)
# --- INICIO: LÓGICA DEL LOGIN ---

def _wants_json(request):
    return (
        request.headers.get('x-requested-with') == 'XMLHttpRequest'
        or 'application/json' in (request.headers.get('Accept') or '')
    )

@ensure_csrf_cookie
def csrf_boot(request):
    return JsonResponse({"ok": True})

@ensure_csrf_cookie
def login_register_view(request):
    login_form = LoginForm()
    register_form = RegistrationForm()
    active_tab = 'login'

    if request.method == 'POST':
        ct = (request.headers.get('Content-Type') or request.META.get('CONTENT_TYPE') or '')
        if ct.startswith('application/json'):
            try:
                payload = json.loads(request.body.decode('utf-8'))
            except Exception:
                payload = {}
            data = QueryDict('', mutable=True)
            for k, v in (payload or {}).items():
                # Convertimos todo a str (QueryDict espera strings)
                data[k] = '' if v is None else str(v)
        else:
            data = request.POST

        action = data.get('action', '').strip()

        # ---------- Registro ----------
        if action == 'register':
            register_form = RegistrationForm(data)
            if register_form.is_valid():
                user = register_form.save(commit=False)
                user.is_active = False
                user.save()

                # Link de activación
                uid = urlsafe_base64_encode(force_bytes(user.pk))
                token = account_activation_token.make_token(user)
                path = reverse('accounts:activate', args=[uid, token])
                activation_link = request.build_absolute_uri(path)
                logger.info("Activation link generado: %s", activation_link)

                # ---------- EMAIL: seleccionar template con fallback ----------
                email_sent = True
                email_error = ""

                try:
                    tpl = loader.select_template([
                        'acc_active_email.html',
                        'pages/acc_active_email.html',
                        'frontend/pages/acc_active_email.html',
                    ])
                    message_html = tpl.render({
                        'user': user,
                        'activation_link': activation_link,
                    }, request)
                except TemplateDoesNotExist as e:
                    email_error = f"template-missing: {e}"
                    message_html = f"""
                        <html><body style="font-family:Arial,sans-serif">
                          <h2>Activa tu cuenta de FeelSound</h2>
                          <p>Hola {user.first_name or user.username},</p>
                          <p>Para activar tu cuenta haz clic en el siguiente enlace:</p>
                          <p><a href="{activation_link}">{activation_link}</a></p>
                        </body></html>
                    """
                except Exception as e:
                    email_sent = False
                    email_error = str(e)

                if email_sent:
                    try:
                        email_message = EmailMessage(
                            subject='Activa tu cuenta de FeelSound',
                            body=message_html,
                            from_email=getattr(settings, 'DEFAULT_FROM_EMAIL', None),
                            to=[user.email],
                        )
                        email_message.content_subtype = "html"
                        email_message.send(fail_silently=False)
                    except Exception as e:
                        email_sent = False
                        email_error = str(e)

                # Flash persistente
                request.session['fs_flash'] = {
                    "type": ("success" if email_sent else "warning"),
                    "title": "",
                    "text": ("¡Cuenta creada! Revisa tu correo para activarla."
                             if email_sent else
                             "Cuenta creada, pero no pude enviar el correo de activación."),
                }

                # Respuesta JSON para el fetch
                return JsonResponse({
                    "ok": True,
                    "message": ("¡Cuenta creada! Revisa tu correo para activarla."
                                if email_sent else
                                "Cuenta creada, pero no pude enviar el correo de activación."),
                    "email_sent": email_sent,
                    "email_error": email_error,
                }, status=200)
            else:
                if _wants_json(request):
                    return JsonResponse({"ok": False, "errors": register_form.errors.get_json_data()}, status=400)
                active_tab = 'register'

        # ---------- Login ----------
        elif action == 'login':
            login_form = LoginForm(request, data=data)
            if login_form.is_valid():
                user = login_form.get_user()
                login(request, user)

                # A dónde debe ir el front después de loguearse
                fe_base = getattr(settings, 'FRONTEND_BASE_URL', 'http://127.0.0.1:5500').rstrip('/')
                fe_redirect = f"{fe_base}/dashboard/#/"

                # Mensaje flash para que tu front lo lea en /api/flash/consume/
                request.session['fs_flash'] = {
                    "type": "success",
                    "title": "",
                    "text": f"¡Bienvenido, {user.username}!"
                }

                if _wants_json(request):
                    return JsonResponse({"ok": True, "redirect": fe_redirect}, status=200)
                return redirect('home:dashboard')
            else:
                if _wants_json(request):
                    return JsonResponse({"ok": False, "errors": login_form.errors.get_json_data()}, status=400)
                active_tab = 'login'
    context = {
        'login_form': login_form,
        'register_form': register_form,
        'active_tab': active_tab
    }
    return render(request, 'login_register.html', context)


def activate(request, uidb64, token):
    try:
        uid = force_str(urlsafe_base64_decode(uidb64))
        user = User.objects.get(pk=uid)
    except (TypeError, ValueError, OverflowError, User.DoesNotExist):
        user = None

    fe_base = getattr(
        settings,
        "FRONTEND_BASE_URL",
        "http://127.0.0.1:5500/pages/login_register.html#login",
    ).rstrip("/")

    fe_login = f"{fe_base}/#login"

    if user is not None and account_activation_token.check_token(user, token):
        user.is_active = True
        user.save()

        request.session["fs_flash"] = {
            "type": "success",
            "title": "",
            "text": "¡Gracias por confirmar tu correo! Ahora puedes iniciar sesión.",
        }
        return HttpResponseRedirect(fe_login)
    else:
        request.session["fs_flash"] = {
            "type": "error",
            "title": "",
            "text": "El enlace de activación no es válido o ya fue usado.",
        }
        return HttpResponseRedirect(fe_login)

# --- FIN: LÓGICA DEL LOGIN ---


def flash_consume(request):
    payload = request.session.pop("fs_flash", None)

    if not payload:
        storage = get_messages(request)
        first = next(iter(storage), None)
        if first:
            level = getattr(first, "level_tag", "info")
            payload = {"type": level, "text": str(first), "title": ""}

    return JsonResponse(payload or {}, status=200)