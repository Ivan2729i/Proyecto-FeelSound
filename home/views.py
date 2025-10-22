from django.contrib.auth.decorators import login_required
from django.shortcuts import render
import requests
from django.http import JsonResponse, HttpResponseBadRequest, Http404
from django.views.decorators.http import require_GET, require_POST
from .models import Cancion, Emocion, CancionEmocion, Artista, Album
from django.db.models.functions import Random
from .services_lyrics import get_lyrics
from django.views.decorators.csrf import csrf_exempt
import json
from django.db import transaction, IntegrityError
import json, traceback
from django.conf import settings


# --- INICIO: LÓGICA DEL REPRODUCTOR ---

DEEZER_API = "https://api.deezer.com"

def _dz_get(path: str, params=None, timeout=7):
    """GET sencillo a Deezer con manejo básico de errores."""
    try:
        r = requests.get(f"{DEEZER_API}{path}", params=params or {}, timeout=timeout)
        r.raise_for_status()
        return r.json()
    except Exception:
        return {}

def _enrich_artist(artista, dz_id: str | None):
    """Completa imagen_url y fans_deezer si falta info y tenemos deezer_id."""
    if not dz_id or not artista:
        return artista
    data = _dz_get(f"/artist/{dz_id}") or {}
    img = data.get("picture_medium") or data.get("picture") or data.get("picture_big")
    fans = data.get("nb_fan")
    changed = False
    if img and not artista.imagen_url:
        artista.imagen_url = img; changed = True
    if fans is not None and not artista.fans_deezer:
        artista.fans_deezer = fans; changed = True
    if changed:
        artista.save(update_fields=["imagen_url", "fans_deezer"])
    return artista

def _enrich_album(album, dz_id: str | None):
    """Completa portada_url y fecha_lanzamiento si falta info y tenemos deezer_id."""
    if not dz_id or not album:
        return album
    data = _dz_get(f"/album/{dz_id}") or {}
    cover = data.get("cover_medium") or data.get("cover") or data.get("cover_big")
    fecha = data.get("release_date") or data.get("release_date_original")
    changed = False
    if cover and not album.portada_url:
        album.portada_url = cover; changed = True
    if fecha and not album.fecha_lanzamiento:
        album.fecha_lanzamiento = fecha; changed = True
    if changed:
        album.save(update_fields=["portada_url", "fecha_lanzamiento"])
    return album

@login_required
def dashboard(request):
    return render(request, 'home/dashboard.html')

@require_GET
def dz_search(request):
    q = request.GET.get("q", "").strip()
    t = request.GET.get("type", "track").strip()  # tipo de búsqueda: track, artist, album
    if not q:
        return HttpResponseBadRequest("Missing q")

    if t not in {"track", "artist", "album"}:
        t = "track"

    url = f"https://api.deezer.com/search/{t}"
    try:
        r = requests.get(url, params={"q": q}, timeout=7)
        r.raise_for_status()
        data = r.json()

        if t == "track":
            items = [{
                "id": x.get("id"),
                "title": x.get("title"),
                "duration": x.get("duration"),
                "preview": x.get("preview"),
                "artist": {
                    "id": x["artist"]["id"],
                    "name": x["artist"]["name"]
                } if x.get("artist") else None,
                "album": {
                    "id": x["album"]["id"],
                    "title": x["album"]["title"],
                    "cover": x["album"].get("cover_medium") or x["album"].get("cover")
                } if x.get("album") else None
            } for x in data.get("data", [])]
            return JsonResponse({"data": items})
        else:
            return JsonResponse(data)

    except requests.RequestException as e:
        return JsonResponse({"error": str(e)}, status=502)


@require_GET
def dz_track(request, track_id: int):
    try:
        r = requests.get(f"https://api.deezer.com/track/{track_id}", timeout=7)
        r.raise_for_status()
        return JsonResponse(r.json())
    except requests.RequestException as e:
        return JsonResponse({"error": str(e)}, status=502)

# --- FIN: LÓGICA DEL REPRODUCTOR ---

# --- INICIO: LÓGICA DE LAS EMOCIONES ---

@require_GET
def songs_by_emotion(request):
    clave = request.GET.get("emocion", "neutral").strip().lower()
    try:
        limit = min(int(request.GET.get("limit", "25")), 50)
    except ValueError:
        limit = 25

    try:
        emo = Emocion.objects.get(clave=clave)
    except Emocion.DoesNotExist:
        raise Http404("Emoción no existe")

    qs = (Cancion.objects
          .select_related("artista", "album", "top_emocion")
          .filter(top_emocion=emo)
          .order_by(Random())[:limit])

    data = []
    for s in qs:
        data.append({
            # usa el deezer_id para que tu player funcione igual
            "id": int(s.deezer_id) if s.deezer_id and s.deezer_id.isdigit() else s.id,
            "titulo": s.titulo,
            "duracion": s.duracion or 30,
            "preview": s.preview_url or "",              # <-- importante
            "artista": s.artista.nombre if s.artista else "",
            "album": s.album.titulo if s.album else "",
            "cover": s.album.portada_url if s.album else "",  # <-- importante
            "top_emocion": emo.clave,
        })

    return JsonResponse({"emocion": emo.clave, "count": len(data), "results": data})


@login_required
@require_POST
def vote_song_emotion(request, song_id: int):
    emocion = (request.POST.get("emocion") or "").strip().lower()
    if emocion not in {"feliz","triste","enojado","amor","calmada","neutral"}:
        return HttpResponseBadRequest("emocion inválida")

    try:
        score = float(request.POST.get("score", "1.0"))
    except ValueError:
        score = 1.0
    score = max(0.0, min(1.0, score))

    try:
        c = Cancion.objects.select_for_update().get(id=song_id)
    except Cancion.DoesNotExist:
        return HttpResponseBadRequest("canción no existe")

    emo = Emocion.objects.get(clave=emocion)

    CancionEmocion.objects.update_or_create(
        cancion=c, emocion=emo, source="user", created_by=request.user,
        defaults={"score": score}
    )

    agg = {"feliz":0.0,"triste":0.0,"enojado":0.0,"amor":0.0,"calmada":0.0,"neutral":0.0}
    for se in c.emociones.select_related("emocion").all():
        k = se.emocion.clave
        w = float(se.score) * (1.0 if se.source == "user" else 0.7)
        agg[k] += w

    total = sum(agg.values()) or 1.0
    for k in agg: agg[k] /= total
    top = max(agg, key=agg.get)

    c.top_emocion = Emocion.objects.get(clave=top)
    c.emotion_scores = agg
    c.save(update_fields=["top_emocion","emotion_scores"])

    return JsonResponse({"ok": True, "top_emocion": c.top_emocion.clave, "scores": agg})


# --- Helpers de normalización ---
def _as_text(v, *prefer_keys):
    if isinstance(v, str):
        return v
    if isinstance(v, dict):
        for k in prefer_keys:
            val = v.get(k)
            if isinstance(val, str):
                return val
        if isinstance(v.get('name'), dict):
            return _as_text(v['name'], *prefer_keys) or ""
        if isinstance(v.get('title'), dict):
            return _as_text(v['title'], *prefer_keys) or ""
        return ""
    return ""

def _as_id(v):
    if isinstance(v, dict):
        if 'id' in v:
            return v['id']
        if isinstance(v.get('name'), dict) and 'id' in v['name']:
            return v['name']['id']
        if isinstance(v.get('title'), dict) and 'id' in v['title']:
            return v['title']['id']
    return None


@csrf_exempt
@require_POST
def capture_deezer_track(request):
    CLASSIFY_ON_CAPTURE = True

    try:
        payload = json.loads(request.body.decode("utf-8"))
        print("[capture] payload:", payload)
    except Exception as e:
        return JsonResponse({"ok": False, "error": f"JSON inválido: {e}"}, status=400)

    dz_track_id = payload.get("id")
    title = (payload.get("title") or "").strip()
    if not dz_track_id or not title:
        return JsonResponse({"ok": False, "error": "payload incompleto (id/title)"}, status=400)

    duration  = int(payload.get("duration") or 30)
    preview   = (payload.get("preview") or "")[:500]

    # --- Normalización robusta del payload ----
    art = payload.get("artist") or {}
    alb = payload.get("album") or {}

    artist_name = _as_text(art.get("name"), "name", "title").strip()
    album_title = (_as_text(alb.get("title"), "title", "name") or "—").strip()

    artist_dzid_raw = art.get("id")
    album_dzid_raw = alb.get("id")
    if not artist_dzid_raw:
        artist_dzid_raw = _as_id(art.get("name"))
    if not album_dzid_raw:
        album_dzid_raw = _as_id(alb.get("title"))

    artist_dzid = str(artist_dzid_raw) if artist_dzid_raw else None
    album_dzid = str(album_dzid_raw) if album_dzid_raw else None

    album_cover = ""
    if isinstance(alb.get("cover"), str):
        album_cover = alb["cover"]
    elif isinstance(alb.get("title"), dict):
        c = alb["title"].get("cover")
        album_cover = c if isinstance(c, str) else ""

    if not artist_dzid or not album_dzid or not artist_name or not album_title or not album_cover:
        t = _dz_get(f"/track/{dz_track_id}") or {}
        a = t.get("artist") or {}
        al = t.get("album") or {}
        artist_dzid = artist_dzid or (str(a.get("id")) if a.get("id") else None)
        artist_name = artist_name or (a.get("name") or "")
        album_dzid  = album_dzid  or (str(al.get("id")) if al.get("id") else None)
        album_title = album_title or (al.get("title") or "—")
        album_cover = album_cover or (al.get("cover") or "")

    try:
        with transaction.atomic():
            # --- ARTISTA ---
            if artist_dzid:
                artista, _ = Artista.objects.update_or_create(
                    deezer_id=artist_dzid,
                    defaults={"nombre": artist_name or "—"}
                )
            else:
                artista, _ = Artista.objects.get_or_create(nombre=artist_name or "—")

            _enrich_artist(artista, artist_dzid)

            # --- ÁLBUM ---
            if album_dzid:
                album, _ = Album.objects.update_or_create(
                    deezer_id=album_dzid,
                    defaults={
                        "titulo": album_title or "—",
                        "artista": artista,
                        "portada_url": album_cover or ""
                    }
                )
            else:
                album, _ = Album.objects.get_or_create(
                    artista=artista, titulo=album_title or "—",
                    defaults={"portada_url": album_cover or ""}
                )

            _enrich_album(album, album_dzid)

            # --- CANCIÓN ---
            cancion, created = Cancion.objects.update_or_create(
                deezer_id=str(dz_track_id),
                defaults={
                    "titulo": title,
                    "duracion": duration,
                    "preview_url": preview,
                    "artista": artista,
                    "album": album,
                }
            )

            # --- CLASIFICACIÓN  ---
            if CLASSIFY_ON_CAPTURE and not cancion.top_emocion_id:
                from .services_emociones import clasificar_6

                USE_LYRICS = getattr(settings, "FEELSOUND_USE_LYRICS", True)

                lyrics = ""
                if USE_LYRICS:
                    lyrics = get_lyrics(title, artist_name) or ""

                texto = f"{title} - {artist_name}".strip()
                if lyrics:
                    texto = f"{texto}\n\n{lyrics}"

                res = clasificar_6(texto, title=title)
                clave, scores = res["label"], res["scores"]

                emo = Emocion.objects.get(clave=clave)
                CancionEmocion.objects.update_or_create(
                    cancion=cancion, emocion=emo, source="goemotions",
                    defaults={"score": float(scores.get(clave, 0.0))}
                )
                cancion.top_emocion = emo
                cancion.emotion_scores = scores
                cancion.save(update_fields=["top_emocion", "emotion_scores"])

    except Exception as e:
        print("[capture] ERROR:", repr(e))
        traceback.print_exc()
        return JsonResponse({"ok": False, "error": f"{type(e).__name__}: {e}"}, status=500)

    return JsonResponse({
        "ok": True,
        "song_id": cancion.id,
        "created": created,
        "top_emocion": cancion.top_emocion.clave if cancion.top_emocion_id else None,
    })

# --- FIN: LÓGICA DE LAS EMOCIONES ---

