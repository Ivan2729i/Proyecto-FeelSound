from django.urls import path
from .views import CancionListView, CancionDetailView, CancionEmocionesView, MeView, AvatarUploadView


urlpatterns = [
    path("v1/tracks", CancionListView.as_view(), name="api_tracks_list"),
    path("v1/tracks/<int:track_id>", CancionDetailView.as_view(), name="api_track_detail"),
    path("v1/tracks/<int:track_id>/emotions", CancionEmocionesView.as_view(), name="api_track_emotions"),
    path("v1/me", MeView.as_view(), name="me"),
    path("v1/me/avatar", AvatarUploadView.as_view(), name="me-avatar"),

]
