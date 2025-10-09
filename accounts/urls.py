from django.urls import path
from . import views

app_name = 'accounts'

urlpatterns = [
    path('access/', views.login_register_view, name='login_register'),
]
