from django.urls import path
from . import views

app_name = "home"

urlpatterns = [
    path("dashboard/", views.dashboard, name="dashboard"),
    path("api/deezer/search/", views.dz_search, name="dz_search"),
    path("api/deezer/track/<int:track_id>/", views.dz_track, name="dz_track"),
    path("api/songs", views.songs_by_emotion, name="songs_by_emotion"),
    path("api/songs/<int:song_id>/vote", views.vote_song_emotion, name="vote_song_emotion"),
    path("api/capture/deezer-track", views.capture_deezer_track, name="capture_deezer_track"),
    path("api/v1/playlists/", views.playlists_list, name="playlists_list"),
    path("api/v1/playlists/create", views.create_playlist, name="pl_create"),
    path("api/v1/playlists/<int:pid>/", views.playlist_detail, name="playlist-detail"),
    path("api/v1/playlists/<int:pid>/share/copy-link", views.share_copy_link, name="share_copy_link"),
    path("api/v1/share/copy/preview", views.share_copy_preview, name="share_copy_preview"),
    path("api/v1/share/copy/import", views.share_copy_import, name="share_copy_import"),
    path("api/v1/me/summary/", views.MeSummaryView.as_view(), name="me-summary"),
    path("api/v1/me/summary",  views.MeSummaryView.as_view()),
]
