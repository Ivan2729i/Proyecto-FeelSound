from django import forms
import re

from django.contrib.auth import authenticate

from .models import User
from django.contrib.auth.forms import AuthenticationForm

# --- INICIO: LÓGICA FORMULARIO DE REGISTRO CON VALIDACIONES ---

NAME_RE = re.compile(r"^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ' ]+$")
PWD_RE  = re.compile(
    r"""
    ^
    (?=.*[a-z])          # Al menos una minúscula
    (?=.*[A-Z])          # Al menos una mayúscula
    (?=.*\d)             # Al menos un número
    (?=.*[^A-Za-z0-9])   # Al menos un caracter especial
    .{8,}                # Mínimo 8 caracteres
    $
    """,
    re.VERBOSE
)

def _require_letters_min2(value: str, label: str) -> str:
    v = (value or "").strip()
    if not v:
        raise forms.ValidationError(f"{label} es requerido.")
    if len(v) < 2:
        raise forms.ValidationError(f"{label} debe tener al menos 2 caracteres.")
    if not NAME_RE.match(v):
        raise forms.ValidationError(f"{label} solo puede contener letras, acentos o espacios.")
    # Si puso varias palabras en NOMBRE, cada una debe tener >= 2 caracteres
    parts = [p for p in re.split(r"\s+", v) if p]
    for p in parts:
        if len(p) < 2:
            raise forms.ValidationError(f"Cada parte del {label.lower()} debe tener al menos 2 caracteres.")
    return v

def _require_two_surnames(value: str) -> str:
    v = (value or "").strip()
    if not v:
        raise forms.ValidationError("Los apellidos son requeridos.")
    if not NAME_RE.match(v):
        raise forms.ValidationError("Los apellidos solo pueden contener letras, acentos o espacios.")
    parts = [p for p in re.split(r"\s+", v) if p]
    if len(parts) != 2:
        raise forms.ValidationError("Debes ingresar dos apellidos (paterno y materno).")
    for p in parts:
        if len(p) < 2:
            raise forms.ValidationError("Cada apellido debe tener al menos 2 caracteres.")
    return v

def _validate_password_strength(pwd: str):
    if not PWD_RE.match(pwd or ""):
        raise forms.ValidationError(
            "La contraseña debe tener mínimo 8 caracteres, una mayúscula, "
            "una minúscula, un número y un carácter especial."
        )


class RegistrationForm(forms.Form):
    first_name = forms.CharField(max_length=150, required=True, label="Nombre(s)")
    last_name = forms.CharField(max_length=150, required=True, label="Apellidos")
    username = forms.CharField(max_length=150, required=True, label="Nombre de Usuario")
    email = forms.EmailField(required=True)
    password = forms.CharField(widget=forms.PasswordInput, required=True, label="Contraseña")
    password2 = forms.CharField(label="Confirmar contraseña", widget=forms.PasswordInput, required=True)

    def clean_first_name(self):
        return _require_letters_min2(self.cleaned_data.get('first_name'), "Nombre")

    def clean_last_name(self):
        return _require_two_surnames(self.cleaned_data.get('last_name'))

    def clean_username(self):
        username = self.cleaned_data.get('username', '').strip()
        if not username:
            raise forms.ValidationError("El nombre de usuario es requerido.")
        if ' ' in username:
            raise forms.ValidationError("El nombre de usuario no puede contener espacios.")
        if User.objects.filter(username__iexact=username).exists():
            raise forms.ValidationError("Este nombre de usuario ya está en uso.")
        return username

    def clean_email(self):
        email = self.cleaned_data.get('email', '').lower()
        if User.objects.filter(email=email).exists():
            raise forms.ValidationError("Este correo electrónico ya está registrado.")
        return email

    def clean_password(self):
        password = self.cleaned_data.get('password')
        _validate_password_strength(password)
        return password

    def clean_password2(self):
        password = self.cleaned_data.get('password')
        password2 = self.cleaned_data.get('password2')
        if password and password2 and password != password2:
            raise forms.ValidationError("Las contraseñas no coinciden.")
        return password2

    def save(self, commit=True):
        user = User.objects.create_user(
            username=self.cleaned_data.get('username'),
            email=self.cleaned_data.get('email'),
            password=self.cleaned_data.get('password'),
            first_name=self.cleaned_data.get('first_name'),
            last_name=self.cleaned_data.get('last_name')
        )
        if commit:
            user.save()
        return user

# --- FIN: LÓGICA FORMULARIO DE REGISTRO CON VALIDACIONES ---

# --- INICIO: LÓGICA FORMULARIO DE LOGIN CON VALIDACIONES ---

class LoginForm(AuthenticationForm):
    error_messages = {
        'invalid_login': (
            "El email/usuario o la contraseña son incorrectos. "
            "Por favor, inténtalo de nuevo."
        ),
        'inactive': ("Esta cuenta está inactiva."),
    }

    username = forms.CharField(
        label="Email o Nombre de Usuario",
        widget=forms.TextInput(attrs={'autofocus': True})
    )

    def clean(self):
        username_or_email = self.cleaned_data.get('username')
        password = self.cleaned_data.get('password')

        if username_or_email and password:
            username_to_auth = username_or_email

            # Si contiene '@', intentamos encontrar el usuario por su email
            if '@' in username_or_email:
                try:
                    user_obj = User.objects.get(email=username_or_email)
                    username_to_auth = user_obj.username
                except User.DoesNotExist:
                    raise forms.ValidationError(
                        "No se encontró ninguna cuenta con este correo electrónico."
                    )

            self.user_cache = authenticate(self.request, username=username_to_auth, password=password)

            if self.user_cache is None:
                raise self.get_invalid_login_error()
            else:
                self.confirm_login_allowed(self.user_cache)

        return self.cleaned_data

# --- FIN: LÓGICA FORMULARIO DE LOGIN CON VALIDACIONES ---

