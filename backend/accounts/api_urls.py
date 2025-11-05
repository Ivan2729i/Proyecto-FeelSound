from django.urls import path
from .views import flash_consume
from .api import me, me_avatar


app_name = "accounts_api"

urlpatterns = [
    path("flash/consume/", flash_consume, name="flash_consume"),
    path("me", me, name="me"),
    path("me/avatar", me_avatar, name="me_avatar"),
]
