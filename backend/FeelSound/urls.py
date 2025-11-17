from django.contrib import admin
from django.urls import path, include, re_path
from django.conf import settings
from django.conf.urls.static import static
from django.views.generic import RedirectView
from django.views.static import serve

urlpatterns = [
    re_path(r'^media/(?P<path>.*)$', serve, {
        'document_root': settings.MEDIA_ROOT,
    }),
    path("admin/", admin.site.urls),
    path("accounts/", include("accounts.urls")),
    path('accounts/', include('allauth.urls')),
    path("", include("home.urls")),
    path("api/", include("api.urls")),
    path("api/v1/", include("accounts.api_urls")),
    path("", RedirectView.as_view(pattern_name="accounts:login", permanent=False), name="home"),
]
