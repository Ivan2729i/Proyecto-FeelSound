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

                # --- Lógica para "enviar" el correo a la consola ---
                current_site = get_current_site(request)
                mail_subject = 'Activa tu cuenta de FeelSound'
                message = render_to_string('accounts/acc_active_email.html', {
                    'user': user,
                    'domain': current_site.domain,
                    'uid': urlsafe_base64_encode(force_bytes(user.pk)),
                    'token': account_activation_token.make_token(user),
                })
                to_email = register_form.cleaned_data.get('email')
                email_message = EmailMessage(mail_subject, message, to=[to_email])
                email_message.send()

                messages.success(request, '¡Cuenta creada con éxito! Verifica tu cuenta para iniciar sesión.')

                # Reseteamos los forms y activamos la pestaña de login
                login_form = LoginForm()
                register_form = RegistrationForm()
                active_tab = 'login'
            else:
                # Si hay errores, mantenemos la pestaña de registro activa
                active_tab = 'register'

        # --- Lógica de Login ---
        elif request.POST.get('action') == 'login':
            login_form = LoginForm(request, data=request.POST)
            if login_form.is_valid():
                user = login_form.get_user()
                login(request, user)
                return redirect('accounts:dashboard')
            else:
                # Si el login no es válido, mantenemos la pestaña activa
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


@login_required
def home_view(request):
    return render(request, 'accounts/home.html')