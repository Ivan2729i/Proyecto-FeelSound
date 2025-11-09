from django.urls import path
from .views import (
    CancionListView, CancionDetailView, CancionEmocionesView,
    MeView, AvatarUploadView,
)
from .views_auth import CsrfView, SessionLoginView, SessionLogoutView, PublicConfigView


app_name = "api"

urlpatterns = [
    path("v1/csrf", CsrfView.as_view(), name="csrf"),
    path("v1/session/login", SessionLoginView.as_view(), name="session-login"),
    path("v1/session/logout", SessionLogoutView.as_view(), name="session-logout"),
    path("v1/me", MeView.as_view(), name="me"),
    path("v1/me/avatar", AvatarUploadView.as_view(), name="me-avatar"),
    path("v1/tracks", CancionListView.as_view(), name="api_tracks_list"),
    path("v1/tracks/<int:track_id>", CancionDetailView.as_view(), name="api_track_detail"),
    path("v1/tracks/<int:track_id>/emotions", CancionEmocionesView.as_view(), name="api_track_emotions"),path("v1/public-config", PublicConfigView.as_view(), name="public-config"),
]
