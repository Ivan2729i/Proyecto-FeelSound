# accounts/views.py

from django.shortcuts import render, redirect
from django.contrib.auth import login
from django.contrib import messages
from .forms import RegistrationForm, LoginForm
from .models import User
from django.contrib.auth.decorators import login_required


# (Quitamos las importaciones de email por ahora, como pediste)

def login_register_view(request):
    # Por defecto, los formularios están vacíos
    login_form = LoginForm()
    register_form = RegistrationForm()
    active_tab = 'login'

    if request.method == 'POST':
        # --- Lógica de Registro (Tu código, que ya funciona) ---
        if request.POST.get('action') == 'register':
            register_form = RegistrationForm(request.POST)
            if register_form.is_valid():
                first_name = register_form.cleaned_data.get('first_name')
                last_name = register_form.cleaned_data.get('last_name')
                username = register_form.cleaned_data.get('username')
                email = register_form.cleaned_data.get('email')
                password = register_form.cleaned_data.get('password')

                User.objects.create_user(
                    username=username, email=email, password=password,
                    first_name=first_name, last_name=last_name
                )
                messages.success(request, '¡Cuenta creada con éxito! Ya puedes iniciar sesión.')

                # Reseteamos los forms y activamos la pestaña de login
                login_form = LoginForm()
                register_form = RegistrationForm()
                active_tab = 'login'
            else:
                # Si hay errores, mantenemos la pestaña de registro activa
                active_tab = 'register'

        # --- Lógica de Login (Corregida y Simplificada) ---
        elif request.POST.get('action') == 'login':
            login_form = LoginForm(request, data=request.POST)
            if login_form.is_valid():
                # El formulario ya hizo la autenticación. Solo obtenemos el usuario.
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


# Las vistas 'activate' y 'home_view' no necesitan cambios por ahora
def activate(request, uidb64, token):
    pass  # Lógica de activación pendiente


@login_required
def home_view(request):
    return render(request, 'accounts/home.html')