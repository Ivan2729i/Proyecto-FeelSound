from django.urls import path, reverse_lazy
from . import views
from django.contrib.auth import views as auth_views
from urllib.parse import urlparse
from django.conf import settings

app_name = 'accounts'

# --- Arma contexto para dominio/protocolo desde APP_BASE_URL ---
extra = {"site_name": "FeelSound"}
_base = getattr(settings, "APP_BASE_URL", "") or ""
if _base:
    _u = urlparse(_base)
    extra = {"domain": _u.netloc, "protocol": _u.scheme or "https"}


urlpatterns = [
    path('access/', views.login_register_view, name='login_register'),
    path('activate/<uidb64>/<token>/', views.activate, name='activate'),
    path('login/', views.login_register_view, name='login'),
    path('password_reset/', auth_views.PasswordResetView.as_view(
        template_name='accounts/password_reset_form.html',
        email_template_name='accounts/password_reset_email.txt',
        html_email_template_name='accounts/password_reset_email.html',
        subject_template_name='accounts/password_reset_subject.txt',
        extra_email_context=extra,
        success_url=reverse_lazy('accounts:password_reset_done'),
    ), name='password_reset'),
    path('password_reset/done/', auth_views.PasswordResetDoneView.as_view(
        template_name='accounts/password_reset_done.html'
    ), name='password_reset_done'),
    path('reset/<uidb64>/<token>/', auth_views.PasswordResetConfirmView.as_view(
        template_name='accounts/password_reset_confirm.html',
        success_url=reverse_lazy('accounts:password_reset_complete')
    ), name='password_reset_confirm'),
    path('reset/done/', auth_views.PasswordResetCompleteView.as_view(
        template_name='accounts/password_reset_complete.html'
    ), name='password_reset_complete'),
]
