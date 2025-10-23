from django.urls import path
from .views import CancionListView, CancionDetailView, CancionEmocionesView


urlpatterns = [
    path("v1/tracks", CancionListView.as_view(), name="api_tracks_list"),
    path("v1/tracks/<int:track_id>", CancionDetailView.as_view(), name="api_track_detail"),
    path("v1/tracks/<int:track_id>/emotions", CancionEmocionesView.as_view(), name="api_track_emotions"),

]
