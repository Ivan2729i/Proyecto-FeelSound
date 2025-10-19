from django.contrib import admin
from .models import (
    Artista, Album, Cancion,
    Playlist, PlaylistCancion, Favorito, Historial,
    Emocion, CancionEmocion
)


@admin.register(Artista)
class ArtistaAdmin(admin.ModelAdmin):
    search_fields = ("nombre", "deezer_id")


@admin.register(Album)
class AlbumAdmin(admin.ModelAdmin):
    list_display = ("titulo", "artista", "fecha_lanzamiento")
    search_fields = ("titulo",)
    autocomplete_fields = ("artista",)


@admin.register(Cancion)
class CancionAdmin(admin.ModelAdmin):
    list_display = ("titulo", "artista", "album", "top_emocion")
    search_fields = ("titulo",)
    autocomplete_fields = ("artista", "album", "top_emocion")


@admin.register(Emocion)
class EmocionAdmin(admin.ModelAdmin):
    search_fields = ("nombre", "clave")


@admin.register(CancionEmocion)
class CancionEmocionAdmin(admin.ModelAdmin):
    list_display = ("cancion", "emocion", "source", "score", "created_at")
    list_filter = ("source", "emocion")
    autocomplete_fields = ("cancion", "emocion")


admin.site.register(Playlist)
admin.site.register(PlaylistCancion)
admin.site.register(Favorito)
admin.site.register(Historial)
