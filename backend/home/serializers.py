from rest_framework import serializers
from .models import Playlist

class PlaylistSerializer(serializers.ModelSerializer):
    class Meta:
        model = Playlist
        fields = (
            "id", "nombre", "descripcion",
            "es_publica",
            "fecha_creacion", "fecha_actualizacion",
            # cualquier métrica calculada que expongas
        )
        read_only_fields = ("id", "fecha_creacion", "fecha_actualizacion")

class PlaylistUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Playlist
        fields = ("nombre", "descripcion", "es_publica")

