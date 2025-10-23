from django.db.models import Q
from rest_framework import generics, permissions
from home.models import Cancion, CancionEmocion
from .serializers import CancionSerializer, CancionEmocionSerializer


class CancionListView(generics.ListAPIView):
    permission_classes = [permissions.AllowAny]
    serializer_class = CancionSerializer

    def get_queryset(self):
        q = self.request.query_params.get("query") or self.request.query_params.get("q") or ""
        qs = Cancion.objects.select_related("artista", "album").order_by("titulo")
        return qs.filter(Q(titulo__icontains=q) | Q(artista__nombre__icontains=q)) if q else qs


class CancionDetailView(generics.RetrieveAPIView):
    permission_classes = [permissions.AllowAny]
    serializer_class = CancionSerializer
    lookup_url_kwarg = "track_id"

    def get_queryset(self):
        return Cancion.objects.select_related("artista", "album")


class CancionEmocionesView(generics.ListAPIView):
    permission_classes = [permissions.AllowAny]
    serializer_class = CancionEmocionSerializer

    def get_queryset(self):
        return CancionEmocion.objects.filter(
            cancion_id=self.kwargs["track_id"]
        ).select_related("emocion").order_by("-score")

