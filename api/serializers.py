from rest_framework import serializers
from home.models import Cancion, CancionEmocion

class CancionSerializer(serializers.ModelSerializer):
    artista = serializers.CharField(source="artista.nombre", read_only=True)
    album = serializers.CharField(source="album.titulo", read_only=True)
    cover = serializers.CharField(source="album.portada_url", read_only=True, allow_null=True)
    top_emocion = serializers.CharField(source="top_emocion.nombre", read_only=True, allow_null=True)

    class Meta:
        model = Cancion
        fields = [
            "id",
            "titulo",
            "artista",
            "album",
            "cover",
            "preview_url",
            "duracion",
            "deezer_id",
            "top_emocion",
        ]

class CancionEmocionSerializer(serializers.ModelSerializer):
    emocion = serializers.CharField(source="emocion.nombre", read_only=True)

    class Meta:
        model = CancionEmocion
        fields = ["emocion", "score", "source"]

