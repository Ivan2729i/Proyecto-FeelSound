from pathlib import Path
import os
from decouple import config
from django.contrib.messages import constants as messages


# Build paths inside the project like this: BASE_DIR / 'subdir'.
BASE_DIR = Path(__file__).resolve().parent.parent


# Quick-start development settings - unsuitable for production
# See https://docs.djangoproject.com/en/5.2/howto/deployment/checklist/

DEBUG = config("DJANGO_DEBUG", default=False, cast=bool)

SECRET_KEY = config("DJANGO_SECRET_KEY", default=config("SECRET_KEY", default="dev-key"))

ALLOWED_HOSTS = [
    *[h.strip() for h in config("ALLOWED_HOSTS", default="*.ondigitalocean.app,localhost,127.0.0.1").split(",") if h.strip()],
]

APP_DOMAIN = config("APP_DOMAIN", default="feelsoundgit-gvi6t.ondigitalocean.app")

# Application definition

INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    'django.contrib.sites',
    'accounts.apps.AccountsConfig',
    'allauth',
    'allauth.account',
    'allauth.socialaccount',
    'allauth.socialaccount.providers.google',
    'home',
    'corsheaders',
    'rest_framework',
    'api',
]

if DEBUG:
    INSTALLED_APPS += ['debug_toolbar']

SITE_ID = 1

MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    "whitenoise.middleware.WhiteNoiseMiddleware",
    'corsheaders.middleware.CorsMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'FeelSound.middleware.NoStoreForAuth',
    'allauth.account.middleware.AccountMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.contrib.sites.middleware.CurrentSiteMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

if DEBUG:
    MIDDLEWARE += ['debug_toolbar.middleware.DebugToolbarMiddleware']

MESSAGE_STORAGE = "django.contrib.messages.storage.fallback.FallbackStorage"

AUTHENTICATION_BACKENDS = [
    'django.contrib.auth.backends.ModelBackend',
    'allauth.account.auth_backends.AuthenticationBackend',
]


ROOT_URLCONF = 'FeelSound.urls'

# === Paths ===
PROJECT_ROOT = BASE_DIR.parent
FRONTEND_DIR = PROJECT_ROOT / "frontend"
FRONTEND_PAGES_DIR = FRONTEND_DIR / "pages"
FRONTEND_STATIC_DIR = FRONTEND_DIR / "static"


TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [BASE_DIR / 'templates', FRONTEND_PAGES_DIR],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'accounts.context_processors.hcaptcha_context',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'FeelSound.wsgi.application'


# Database

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.mysql",
        "NAME": config("DB_NAME"),
        "USER": config("DB_USER"),
        "PASSWORD": config("DB_PASSWORD"),
        "HOST": config("DB_HOST"),
        "PORT": config("DB_PORT", default="25060", cast=int),
        "OPTIONS": {
            "charset": "utf8mb4",
            "ssl": {"ca": "/etc/ssl/certs/ca-certificates.crt"},
        },
    }
}



# Password validation
# https://docs.djangoproject.com/en/5.2/ref/settings/#auth-password-validators

AUTH_PASSWORD_VALIDATORS = [
    {
        'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator',
        'OPTIONS': {'min_length': 8}
    },
    {
        'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator',
    },
]

FEELSOUND_USE_LYRICS = True

# Redirecciones
AUTH_USER_MODEL = 'accounts.User'
LOGIN_URL = 'accounts:login'
LOGIN_REDIRECT_URL = 'home:dashboard'
LOGOUT_REDIRECT_URL = 'login'
ACCOUNT_LOGOUT_REDIRECT_URL = 'login'
SOCIALACCOUNT_LOGIN_ON_GET = True
ACCOUNT_LOGOUT_ON_GET = True
ACCOUNT_ADAPTER = "accounts.adapters.FeelSoundAccountAdapter"
SOCIALACCOUNT_ADAPTER = "accounts.adapters.CustomSocialAccountAdapter"
FRONTEND_LOGIN_PATH = "/pages/login_register.html"

# Internationalization
# https://docs.djangoproject.com/en/5.2/topics/i18n/

LANGUAGE_CODE = 'es-es'

TIME_ZONE = 'America/Mexico_City'

USE_I18N = True

USE_TZ = True


# --- Configuración de Archivos Estáticos ---
STATIC_URL = '/static/'
STATIC_ROOT = os.path.join(BASE_DIR, 'staticfiles')
STATICFILES_DIRS = [p for p in [BASE_DIR / 'static'] if p.exists()]

# --- Configuración de mensajes ---
MESSAGE_TAGS = {
    messages.DEBUG:   'debug',
    messages.INFO:    'info',
    messages.SUCCESS: 'success',
    messages.WARNING: 'warning',
    messages.ERROR:   'error',
}

# --- Configuración de Archivos Multimedia ---
MEDIA_URL = '/media/'
MEDIA_ROOT = os.path.join(BASE_DIR, 'media')

# --- Email (Gmail) ---
EMAIL_BACKEND = "django.core.mail.backends.smtp.EmailBackend"
EMAIL_HOST = "smtp.gmail.com"
EMAIL_PORT = 587
EMAIL_USE_TLS = True
EMAIL_USE_SSL = False

# Política de email y registro con Google
ACCOUNT_SIGNUP_FIELDS = ['email*', 'password1*', 'password2*']
ACCOUNT_UNIQUE_EMAIL = True
ACCOUNT_EMAIL_VERIFICATION = "none"
SOCIALACCOUNT_AUTO_SIGNUP = True

# Credenciales por variables de entorno
EMAIL_HOST_USER = config("EMAIL_HOST_USER")
EMAIL_HOST_PASSWORD = config("EMAIL_HOST_PASSWORD")
DEFAULT_FROM_EMAIL = config("DEFAULT_FROM_EMAIL", default=EMAIL_HOST_USER)

EMAIL_TIMEOUT = 20


# Configuración del Captcha
HCAPTCHA_SITE_KEY  = config("HCAPTCHA_SITE_KEY", default="")
HCAPTCHA_SECRET_KEY = config("HCAPTCHA_SECRET_KEY", default="")

CACHES = {
    "default": {
        "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
        "LOCATION": "fs-cache",
    }
}


# ====================== Conexion Front-Back ==========================
FRONTEND_BASE_URL = config("FRONTEND_BASE_URL", default=f"https://{APP_DOMAIN}")

ACCOUNT_ALLOWED_REDIRECT_DOMAINS = [
    "127.0.0.1:5500",
    "localhost:5500",
    "feelsound.mx",
]

# === CORS  ===
CORS_ALLOWED_ORIGINS = [
    f"https://{APP_DOMAIN}",
    "http://localhost:5500",
    "http://127.0.0.1:5500",
]
CORS_ALLOW_CREDENTIALS = True

# === CSRF  ===
CSRF_TRUSTED_ORIGINS = [
    f"https://{APP_DOMAIN}",
    "http://localhost:5500",
    "http://127.0.0.1:5500",
]


# Cookies
SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')
SESSION_COOKIE_SAMESITE = "Lax"
CSRF_COOKIE_SAMESITE    = "Lax"
SESSION_COOKIE_SECURE = not DEBUG
CSRF_COOKIE_SECURE    = not DEBUG


# Google
ACCOUNT_DEFAULT_HTTP_PROTOCOL = "https"
SOCIALACCOUNT_PROVIDERS = {
    "google": {
        "APP": {
            "client_id": config("GOOGLE_CLIENT_ID", default=""),
            "secret": config("GOOGLE_CLIENT_SECRET", default=""),
            "key": "",
        },
        "SCOPE": ["email", "profile"],
        "AUTH_PARAMS": {"access_type": "online"},
    }
}



# Configuración de API REST
REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "rest_framework.authentication.SessionAuthentication",
    ],
    "DEFAULT_PERMISSION_CLASSES": [
        "rest_framework.permissions.IsAuthenticatedOrReadOnly",
    ],
}


# Conf Compartir
SHARE_SECRET = os.environ.get("FEELSOUND_SHARE_SECRET", "cambia-esto-en-produccion")
SHARE_TTL_DAYS = int(os.environ.get("FEELSOUND_SHARE_TTL_DAYS", "3"))


# Default primary key field type
# https://docs.djangoproject.com/en/5.2/ref/settings/#default-auto-field

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

INTERNAL_IPS = [
    "127.0.0.1",
]

# Para correr el frontend
# npm run dev

# Para correr el servidor
# python manage.py runserver

# Para correr tailwind con el atajo
#  npm run tailwind:watch

# Para instalarlo
# npm install tailwindcss @tailwindcss/cli

# Crear input y poner lo que puse dentro

# Para correr tailwind
# npx tailwindcss -i ./static/css/input.css -o ./static/css/output.css --watch