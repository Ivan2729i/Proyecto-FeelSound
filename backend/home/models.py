from django.db import models
from django.conf import settings


class Artista(models.Model):
    deezer_id = models.CharField(max_length=64, null=True, blank=True, unique=True)
    nombre = models.CharField(max_length=255)
    imagen_url = models.URLField(max_length=255, null=True, blank=True)
    fans_deezer = models.IntegerField(null=True, blank=True)
    def __str__(self): return self.nombre


class Album(models.Model):
    deezer_id = models.CharField(max_length=64, null=True, blank=True)
    titulo = models.CharField(max_length=200)
    fecha_lanzamiento = models.DateField(null=True, blank=True)
    portada_url = models.URLField(max_length=255, null=True, blank=True)
    artista = models.ForeignKey(Artista, on_delete=models.CASCADE, related_name="albums")
    class Meta:
        unique_together = [("titulo", "artista")]
        indexes = [models.Index(fields=["artista"])]
    def __str__(self): return f"{self.titulo} – {self.artista.nombre}"


class Cancion(models.Model):
    deezer_id = models.CharField(max_length=64, null=True, blank=True, unique=True)
    titulo = models.CharField(max_length=200)
    duracion = models.IntegerField(null=True, blank=True)  # segundos
    preview_url = models.TextField(blank=True, null=True)
    album = models.ForeignKey(Album, on_delete=models.SET_NULL, null=True, blank=True, related_name="canciones")
    artista = models.ForeignKey(Artista, on_delete=models.SET_NULL, null=True, blank=True, related_name="canciones")
    top_emocion = models.ForeignKey("Emocion", on_delete=models.SET_NULL, null=True, blank=True, related_name="canciones_top")
    emotion_scores = models.JSONField(null=True, blank=True)  # {"feliz":0.7,...}
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [
            models.Index(fields=["top_emocion"]),
            models.Index(fields=["artista"]),
            models.Index(fields=["album"]),
        ]
    def __str__(self): return self.titulo


class Playlist(models.Model):
    nombre = models.CharField(max_length=80)
    portada_url = models.URLField(max_length=255, null=True, blank=True)
    fecha_creacion = models.DateField(auto_now_add=True)
    es_publica = models.BooleanField(default=False)
    usuario = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="playlists")
    class Meta:
        unique_together = [("usuario", "nombre")]
    def __str__(self): return f"{self.nombre} ({'pública' if self.es_publica else 'privada'})"


class PlaylistCancion(models.Model):
    playlist = models.ForeignKey(Playlist, on_delete=models.CASCADE, related_name="items")
    cancion  = models.ForeignKey(Cancion, on_delete=models.CASCADE, related_name="+")
    posicion = models.IntegerField(null=True, blank=True)
    added_at = models.DateTimeField(auto_now_add=True)
    class Meta:
        unique_together = [("playlist", "cancion")]
        indexes = [models.Index(fields=["playlist"])]


class Favorito(models.Model):
    usuario = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="favoritos")
    cancion = models.ForeignKey(Cancion, on_delete=models.CASCADE, related_name="favorited_by")
    created_at = models.DateTimeField(auto_now_add=True)
    class Meta:
        unique_together = [("usuario", "cancion")]
        indexes = [models.Index(fields=["usuario"]), models.Index(fields=["cancion"])]


class Historial(models.Model):
    usuario = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="historial")
    cancion = models.ForeignKey(Cancion, on_delete=models.CASCADE, related_name="reproducciones")
    fecha_reproduccion = models.DateTimeField(auto_now_add=True)
    segundos_escuchados = models.IntegerField(null=True, blank=True)
    completo = models.BooleanField(default=False)
    class Meta:
        indexes = [
            models.Index(fields=["usuario", "fecha_reproduccion"]),
            models.Index(fields=["cancion", "fecha_reproduccion"]),
        ]


class Emocion(models.Model):
    clave = models.SlugField(max_length=16, unique=True)
    nombre = models.CharField(max_length=40, unique=True)
    def __str__(self): return self.nombre


class CancionEmocion(models.Model):
    SOURCE_CHOICES = (("goemotions", "goemotions"), ("user", "user"))
    cancion = models.ForeignKey(Cancion, on_delete=models.CASCADE, related_name="emociones")
    emocion = models.ForeignKey(Emocion, on_delete=models.CASCADE, related_name="anotaciones")
    score = models.DecimalField(max_digits=5, decimal_places=4, default=1.0)  # 0–1
    source = models.CharField(max_length=16, choices=SOURCE_CHOICES, default="goemotions")
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL)
    created_at = models.DateTimeField(auto_now_add=True)
    class Meta:
        unique_together = [("cancion", "emocion", "source")]
        indexes = [
            models.Index(fields=["emocion"]),
            models.Index(fields=["cancion", "emocion"]),
            models.Index(fields=["source"]),
        ]
    def __str__(self): return f"{self.cancion.titulo} → {self.emocion.nombre} ({self.source})"

