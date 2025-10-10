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

# --- INICIO: LÓGICA DEL LOGIN ---

def login_register_view(request):
    login_form = LoginForm()
    register_form = RegistrationForm()
    active_tab = 'login'

    if request.method == 'POST':
        # --- Lógica de Registro ---
        if request.POST.get('action') == 'register':
            register_form = RegistrationForm(request.POST)
            if register_form.is_valid():
                first_name = register_form.cleaned_data.get('first_name')
                last_name = register_form.cleaned_data.get('last_name')
                email = register_form.cleaned_data.get('email')
                password = register_form.cleaned_data.get('password')
                user = register_form.save(commit=False)
                user.is_active = False
                user.save()

                mail_subject = 'Activa tu cuenta de FeelSound'

                uid = urlsafe_base64_encode(force_bytes(user.pk))
                token = account_activation_token.make_token(user)

                path = reverse('accounts:activate', args=[uid, token])
                if getattr(settings, 'APP_BASE_URL', ''):
                    activation_link = f"{settings.APP_BASE_URL}{path}"
                else:
                    activation_link = request.build_absolute_uri(path)

                message_html = render_to_string('accounts/acc_active_email.html', {
                    'user': user,
                    'activation_link': activation_link,
                })

                to_email = register_form.cleaned_data.get('email')

                email_message = EmailMessage(
                    subject=mail_subject,
                    body=message_html,
                    from_email=settings.DEFAULT_FROM_EMAIL,
                    to=[to_email],
                )
                email_message.content_subtype = "html"
                email_message.send(fail_silently=False)

                messages.success(request, '¡Cuenta creada con éxito! Verifica tu cuenta para iniciar sesión.')

                login_form = LoginForm()
                register_form = RegistrationForm()
                active_tab = 'login'
            else:
                active_tab = 'register'

        # --- Lógica de Login ---
        elif request.POST.get('action') == 'login':
            login_form = LoginForm(request, data=request.POST)
            if login_form.is_valid():
                user = login_form.get_user()
                login(request, user)
                return redirect('accounts:dashboard')
            else:
                active_tab = 'login'

    context = {
        'login_form': login_form,
        'register_form': register_form,
        'active_tab': active_tab
    }
    return render(request, 'accounts/login_register.html', context)


def activate(request, uidb64, token):
    try:
        uid = force_str(urlsafe_base64_decode(uidb64))
        user = User.objects.get(pk=uid)
    except(TypeError, ValueError, OverflowError, User.DoesNotExist):
        user = None

    if user is not None and account_activation_token.check_token(user, token):
        user.is_active = True
        user.save()
        messages.success(request, '¡Gracias por confirmar tu correo! Ahora puedes iniciar sesión.')
        return redirect('home')
    else:
        messages.error(request, 'El enlace de activación no es válido.')
        return redirect('home')

# --- FIN: LÓGICA DEL LOGIN ---

@login_required
def home_view(request):
    return render(request, 'accounts/home.html')