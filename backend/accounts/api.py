import json, mimetypes, uuid, os
from django.contrib.auth.decorators import login_required
from django.http import JsonResponse, HttpResponseBadRequest
from django.views.decorators.http import require_http_methods
from django.views.decorators.csrf import csrf_exempt
from django.core.files.base import ContentFile
from django.core.files.storage import default_storage

@login_required
@require_http_methods(["GET", "PATCH"])
def me(request):
    u = request.user
    if request.method == "GET":
        return JsonResponse({
            "id": u.id,
            "username": u.username,
            "email": u.email,
            "first_name": u.first_name,
            "last_name": u.last_name,
            "bio": u.bio or "",
            "avatar_url": request.build_absolute_uri(u.profile_picture.url) if u.profile_picture else "",
            "date_joined": u.date_joined.isoformat(),
        })

    # PATCH
    try:
        data = json.loads(request.body or "{}")
    except Exception:
        return HttpResponseBadRequest("Invalid JSON")

    errors = {}
    username = data.get("username")
    bio = data.get("bio")

    if username is not None:
        username = username.strip()
        if not username:
            errors.setdefault("username", []).append("El nombre de usuario no puede estar vacío.")
        elif len(username) > 150:
            errors.setdefault("username", []).append("Máximo 150 caracteres.")
        else:
            from django.contrib.auth import get_user_model
            User = get_user_model()
            if User.objects.filter(username=username).exclude(pk=u.pk).exists():
                errors.setdefault("username", []).append("Ese nombre de usuario ya está en uso.")
            else:
                u.username = username

    if bio is not None:
        u.bio = (bio or "").strip()[:500]

    if errors:
        return JsonResponse({"ok": False, "errors": errors}, status=400)

    u.save()
    return JsonResponse({
        "ok": True,
        "username": u.username,
        "bio": u.bio or "",
    })


@login_required
@require_http_methods(["POST"])
def me_avatar(request):
    f = request.FILES.get("avatar")
    if not f:
        return JsonResponse({"ok": False, "detail": "Falta archivo 'avatar'."}, status=400)

    if f.size > 3 * 1024 * 1024:
        return JsonResponse({"ok": False, "detail": "Máx 3 MB."}, status=400)

    ctype = f.content_type or mimetypes.guess_type(f.name)[0] or ""
    if not ctype.startswith("image/"):
        return JsonResponse({"ok": False, "detail": "Solo imágenes."}, status=400)

    u = request.user

    # Guarda el nombre ANTERIOR leyendo desde DB (más fiable que usar el objeto en memoria)
    from django.contrib.auth import get_user_model
    User = get_user_model()
    old_name = User.objects.only("profile_picture").get(pk=u.pk).profile_picture.name

    # Guarda la nueva imagen con nombre aleatorio
    ext = os.path.splitext(f.name)[1].lower() or mimetypes.guess_extension(ctype) or ".jpg"
    new_name = f"profile_pics/{uuid.uuid4().hex}{ext}"
    u.profile_picture.save(new_name, f, save=True)

    # Borra el archivo anterior (si existe y es distinto)
    try:
        if old_name and old_name != u.profile_picture.name and u.profile_picture.storage.exists(old_name):
            u.profile_picture.storage.delete(old_name)
    except Exception:
        pass

    return JsonResponse({
        "ok": True,
        "avatar_url": request.build_absolute_uri(u.profile_picture.url)
    })

