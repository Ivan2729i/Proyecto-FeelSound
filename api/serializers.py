from rest_framework import serializers
from home.models import Cancion, CancionEmocion
from django.contrib.auth import get_user_model


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


User = get_user_model()

class MeSerializer(serializers.ModelSerializer):
    avatar_url = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            "username", "email", "first_name", "last_name",
            "date_joined", "bio", "avatar_url"
        ]
        extra_kwargs = {
            "username": {"required": False},
            "bio": {"required": False, "allow_blank": True},
            "first_name": {"required": False, "allow_blank": True},
            "last_name": {"required": False, "allow_blank": True},
        }

    def get_avatar_url(self, obj):
        if getattr(obj, "profile_picture", None):
            try:
                url = obj.profile_picture.url
                if url:
                    return url
            except Exception:
                pass
        try:
            sa = obj.socialaccount_set.filter(provider="google").first()
            pic = (sa.extra_data or {}).get("picture") if sa else ""
            if pic:
                return pic
        except Exception:
            pass
        # sin foto
        return ""