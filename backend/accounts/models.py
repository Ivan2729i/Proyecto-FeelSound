from django.db import models
from django.contrib.auth.models import AbstractUser
import os, uuid


def profile_pic_random_path(instance, filename):
    ext = os.path.splitext(filename)[1].lower() or ".jpg"
    return f"profile_pics/{uuid.uuid4().hex}{ext}"


class User(AbstractUser):

    bio = models.TextField(
        'Biografía',
        max_length=500,
        blank=True,
        null=True
    )
    profile_picture = models.ImageField(
        "Foto de perfil",
        upload_to=profile_pic_random_path,
        blank=True,
        null=True,
    )

    # --- Campos para la integración con Deezer ---
    deezer_id = models.CharField(
        'Deezer User ID',
        max_length=255,
        unique=True,
        blank=True,
        null=True
    )

    def __str__(self):
        return self.username