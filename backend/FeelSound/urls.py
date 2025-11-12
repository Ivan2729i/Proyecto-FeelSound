from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static
from django.views.generic import RedirectView

urlpatterns = [
    path("", RedirectView.as_view(pattern_name="accounts:login", permanent=False), name="home"),
    path("admin/", admin.site.urls),
    path("accounts/", include("accounts.urls")),
    path('accounts/', include('allauth.urls')),
    path("", include("home.urls")),
    path("api/", include("api.urls")),
    path("api/v1/", include("accounts.api_urls")),
] + static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)


