from django.db import migrations

def seed_emociones(apps, schema_editor):
    Emocion = apps.get_model("home", "Emocion")
    data = [
        ("feliz", "Feliz"),
        ("triste", "Triste"),
        ("enojado", "Enojado"),
        ("amor", "Amor"),
        ("calmada", "Calmada"),
        ("neutral", "Neutral"),
    ]
    for clave, nombre in data:
        Emocion.objects.get_or_create(clave=clave, defaults={"nombre": nombre})

class Migration(migrations.Migration):
    dependencies = [
        ("home", "0001_initial"),
    ]
    operations = [
        migrations.RunPython(seed_emociones, migrations.RunPython.noop),
    ]
