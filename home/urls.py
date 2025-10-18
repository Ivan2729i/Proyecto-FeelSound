from django.urls import path
from . import views

app_name = "home"

urlpatterns = [
    path("dashboard/", views.dashboard, name="dashboard"),
    path("api/deezer/search/", views.dz_search, name="dz_search"),
    path("api/deezer/track/<int:track_id>/", views.dz_track, name="dz_track"),
]
