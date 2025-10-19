from django.core.management.base import BaseCommand
from home.models import Cancion, Emocion, CancionEmocion
from home.services_emociones import clasificar_6

class Command(BaseCommand):
    help = "Clasifica canciones (título/letra si la tienes) y actualiza top_emocion"

    def add_arguments(self, parser):
        parser.add_argument("--limit", type=int, default=200)
        parser.add_argument("--force", action="store_true", help="reclasifica aunque ya tenga top_emocion")

    def handle(self, *args, **opts):
        qs = Cancion.objects.all()
        if not opts["force"]:
            qs = qs.filter(top_emocion__isnull=True)
        qs = qs.order_by("id")[:opts["limit"]]

        emociones = {e.clave: e.id for e in Emocion.objects.all()}
        for s in qs:
            texto = s.titulo
            res = clasificar_6(texto or "")
            clave, scores = res["label"], res["scores"]
            emo_id = emociones[clave]

            CancionEmocion.objects.update_or_create(
                cancion=s, emocion_id=emo_id, source="goemotions",
                defaults={"score": scores[clave]}
            )
            s.top_emocion_id = emo_id
            s.emotion_scores = scores
            s.save(update_fields=["top_emocion_id","emotion_scores"])
            self.stdout.write(self.style.SUCCESS(f"[{s.id}] {s.titulo} → {clave}"))
