ESTO_TIENE_QUE_FALLAR = sin_comillas_ni_sentido
from django.contrib import admin
from django.urls import path, include, re_path
from django.conf import settings
from django.conf.urls.static import static
from django.views.generic import RedirectView
from django.views.static import serve
from django.http import HttpResponse
import os


# --- FUNCIÓN ESPÍA PARA DEPURAR ---
def debug_media_view(request):
    output = []
    output.append(f"<h1>Diagnóstico de Archivos</h1>")

    # 1. ¿Cuál es la ruta configurada?
    m_root = settings.MEDIA_ROOT
    output.append(f"<strong>MEDIA_ROOT configurado:</strong> {m_root}")

    # 2. ¿Existe la carpeta?
    if os.path.exists(m_root):
        output.append(f"<p style='color:green'>✅ La carpeta MEDIA_ROOT existe en el disco.</p>")

        # 3. ¿Qué hay dentro?
        output.append("<strong>Archivos encontrados:</strong><ul>")
        total_files = 0
        for root, dirs, files in os.walk(m_root):
            for file in files:
                full_path = os.path.join(root, file)
                # Quitamos la parte de la ruta absoluta para mostrar solo lo relativo
                rel_path = full_path.replace(m_root, '')
                output.append(f"<li>{rel_path}</li>")
                total_files += 1
        output.append("</ul>")

        if total_files == 0:
            output.append("<p style='color:red'>⚠️ La carpeta está VACÍA.</p>")
    else:
        output.append(f"<p style='color:red'>❌ CRÍTICO: La carpeta MEDIA_ROOT NO EXISTE en esa ruta.</p>")
        output.append(f"<p>Ruta actual del sistema (pwd): {os.getcwd()}</p>")

    return HttpResponse("".join(output))

urlpatterns = [
    path('debug-media-info/', debug_media_view),
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
