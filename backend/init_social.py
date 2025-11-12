import os
from django.contrib.sites.models import Site
from allauth.socialaccount.models import SocialApp

# 1) SITE localhost (+ variante con puerto)
site, _ = Site.objects.update_or_create(
    id=1, defaults={"domain": "localhost", "name": "localhost"}
)
Site.objects.get_or_create(
    domain="localhost:8000", defaults={"name": "localhost:8000"}
)

# 2) SocialApp de Google desde variables de entorno
cid = os.environ.get("GOOGLE_CLIENT_ID") or ""
csec = os.environ.get("GOOGLE_CLIENT_SECRET") or ""

app, _ = SocialApp.objects.get_or_create(
    provider="google",
    name="Google",
    defaults={"client_id": cid, "secret": csec},
)

changed = False
if cid and app.client_id != cid:
    app.client_id = cid
    changed = True
if csec and app.secret != csec:
    app.secret = csec
    changed = True
if changed:
    app.save()

# 3) Asociar el SocialApp al Site
app.sites.add(site)
print(" Sites & Google SocialApp configurados")
