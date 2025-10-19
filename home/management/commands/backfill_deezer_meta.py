from django.core.management.base import BaseCommand
from home.models import Cancion, Artista, Album
from home.views import _dz_get


class Command(BaseCommand):
    help = "Rellena deezer_id e info (artista/album) usando track deezer_id existente"

    def add_arguments(self, parser):
        parser.add_argument("--limit", type=int, default=500)

    def handle(self, *args, **opts):
        qs = Cancion.objects.all().select_related("artista","album")
        done = 0
        for c in qs.iterator():
            try:
                if not c.deezer_id:
                    continue
                t = _dz_get(f"/track/{c.deezer_id}")

                a = t.get("artist", {}) or {}
                al = t.get("album", {}) or {}

                # Artista
                if c.artista:
                    if a.get("id") and not c.artista.deezer_id:
                        c.artista.deezer_id = str(a["id"])
                    if not c.artista.imagen_url:
                        c.artista.imagen_url = a.get("picture_medium") or a.get("picture")
                    if not c.artista.fans_deezer and a.get("nb_fan") is not None:
                        c.artista.fans_deezer = a.get("nb_fan")
                    c.artista.save()

                # Álbum
                if c.album:
                    if al.get("id") and not c.album.deezer_id:
                        c.album.deezer_id = str(al["id"])
                    if not c.album.portada_url:
                        c.album.portada_url = al.get("cover_medium") or al.get("cover")
                    if not c.album.fecha_lanzamiento:
                        if al.get("id"):
                            ad = _dz_get(f"/album/{al['id']}")
                            c.album.fecha_lanzamiento = ad.get("release_date") or ad.get("release_date_original")
                    c.album.save()

                done += 1
                if done >= opts["limit"]:
                    break
            except Exception as e:
                self.stderr.write(f"[skip {c.id}] {e}")
        self.stdout.write(self.style.SUCCESS(f"Backfill completado: {done} filas"))

