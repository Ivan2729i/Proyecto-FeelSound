from django.contrib.auth.decorators import login_required
from django.shortcuts import render
import requests
from django.http import JsonResponse, HttpResponseBadRequest, Http404
from django.views.decorators.http import require_GET, require_POST
from .models import Cancion, Emocion, CancionEmocion, Artista, Album, Playlist, PlaylistCancion
from django.db.models.functions import Random
from .services_lyrics import get_lyrics
from django.views.decorators.csrf import csrf_exempt
import json
from django.db import transaction, IntegrityError
import json, traceback
from django.conf import settings
from django.shortcuts import redirect, get_object_or_404
from django.http import HttpResponseRedirect
from django.db import models
from django.views.decorators.http import require_http_methods
from django.utils.timezone import localtime
from django.core.cache import cache
from .utils_share import generate_share_token, verify_share_token, ShareTokenError
import time
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response



class MeSummaryView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        pl_count = Playlist.objects.filter(usuario=request.user).count()
        return Response({
            "playlists_count": pl_count
        })


# --- INICIO: LÓGICA DEL REPRODUCTOR ---

DEEZER_API = "https://api.deezer.com"

def _dz_get(path: str, params=None, timeout=7):
    try:
        r = requests.get(f"{DEEZER_API}{path}", params=params or {}, timeout=timeout)
        r.raise_for_status()
        return r.json()
    except Exception:
        return {}

def _enrich_artist(artista, dz_id: str | None):
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

# ---------- helpers mínimos para dar de alta canciones desde Deezer ----------
def _ensure_artist_from_dz(dz_artist):
    if not dz_artist:
        return None
    art, _ = Artista.objects.get_or_create(
        deezer_id=str(dz_artist.get("id")) if dz_artist.get("id") else None,
        defaults={
            "nombre": dz_artist.get("name", "")[:120],
            "imagen_url": dz_artist.get("picture_medium") or dz_artist.get("picture") or "",
        }
    )
    return _enrich_artist(art, str(dz_artist.get("id"))) if dz_artist.get("id") else art

def _ensure_album_from_dz(dz_album, artista):
    if not dz_album:
        return None
    alb, _ = Album.objects.get_or_create(
        deezer_id=str(dz_album.get("id")) if dz_album.get("id") else None,
        defaults={
            "titulo": dz_album.get("title", "")[:160],
            "artista": artista,
            "portada_url": dz_album.get("cover_medium") or dz_album.get("cover") or "",
        }
    )
    return _enrich_album(alb, str(dz_album.get("id"))) if dz_album.get("id") else alb

def _ensure_cancion_from_dz(track_id: int):
    try:
        return Cancion.objects.get(deezer_id=str(track_id))
    except Cancion.DoesNotExist:
        pass

    # Traer track de Deezer
    data = _dz_get(f"/track/{track_id}")
    if not data or not data.get("id"):
        return None

    dz_artist = data.get("artist") or {}
    dz_album  = data.get("album") or {}

    artista = _ensure_artist_from_dz(dz_artist)
    album   = _ensure_album_from_dz(dz_album, artista)

    # Crea Cancion con tus campos
    cancion = Cancion.objects.create(
        deezer_id=str(data["id"]),
        titulo=data.get("title", "")[:200],
        duracion=int(data.get("duration") or 30),
        preview_url=data.get("preview") or "",
        artista=artista,
        album=album,
    )
    return cancion


@login_required
@require_GET
def dashboard(request):
    target = f"{settings.FRONTEND_BASE_URL.rstrip('/')}/pages/dashboard.html#/"
    resp = HttpResponseRedirect(target)
    resp["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
    resp["Pragma"] = "no-cache"
    resp["Vary"] = "Cookie"
    return resp


@require_GET
def dz_search(request):
    q = request.GET.get("q", "").strip()
    t = request.GET.get("type", "track").strip()
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
            "id": int(s.deezer_id) if s.deezer_id and s.deezer_id.isdigit() else s.id,
            "titulo": s.titulo,
            "duracion": s.duracion or 30,
            "preview": s.preview_url or "",
            "artista": s.artista.nombre if s.artista else "",
            "album": s.album.titulo if s.album else "",
            "cover": s.album.portada_url if s.album else "",
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
    CLASSIFY_ON_CAPTURE = str(getattr(settings, "FEELSOUND_CLASSIFY_ON_CAPTURE", "true")).lower() == "true"
    USE_LYRICS          = str(getattr(settings, "FEELSOUND_USE_LYRICS", "true")).lower() == "true"

    # ---- 1) Leer payload JSON o FormData ----
    data = {}
    ct = (request.META.get("CONTENT_TYPE") or "").lower()
    if "application/json" in ct:
        try:
            data = json.loads((request.body or b"").decode("utf-8") or "{}")
        except json.JSONDecodeError as e:
            return JsonResponse({"ok": False, "error": f"JSON inválido: {e}"}, status=400)
    else:
        data = request.POST.dict()  # soporta FormData

    # helper para tomar claves equivalentes
    def pick(*keys, default=""):
        for k in keys:
            v = data.get(k)
            if v not in (None, "", []):
                return v
        return default

    dz_track_id = str(pick("deezer_id", "id")).strip()
    title       = pick("title", "titulo").strip()
    preview     = pick("preview", "preview_url")
    artist_name = pick("artist", "artista")
    album_title = pick("album")
    cover_url   = pick("cover", "portada", "portada_url")
    try:
        duration = int(pick("duration", "duracion", default=30) or 30)
    except (TypeError, ValueError):
        duration = 30

    if not dz_track_id or not title:
        return JsonResponse({"ok": False, "error": "payload incompleto (id/title)"}, status=400)

    # Campos anidados estilo TU payload original
    artist_obj = data.get("artist") or {}
    album_obj  = data.get("album") or {}
    if isinstance(artist_obj, dict):
        artist_name = artist_name or artist_obj.get("name") or artist_obj.get("title") or ""
        artist_dzid = artist_obj.get("id") or _as_id(artist_obj.get("name"))
    else:
        artist_dzid = None

    if isinstance(album_obj, dict):
        album_title = album_title or album_obj.get("title") or album_obj.get("name") or "—"
        album_dzid  = album_obj.get("id") or _as_id(album_obj.get("title"))
        if not cover_url:
            if isinstance(album_obj.get("cover"), str):
                cover_url = album_obj["cover"]
            elif isinstance(album_obj.get("title"), dict) and isinstance(album_obj["title"].get("cover"), str):
                cover_url = album_obj["title"]["cover"]
    else:
        album_dzid = None
        album_title = album_title or "—"

    # ---- 2) Completar con Deezer si faltan cosas (no crítico) ----
    try:
        if not (artist_name and album_title and cover_url):
            t = _dz_get(f"/track/{dz_track_id}") or {}
            a = t.get("artist") or {}
            al = t.get("album") or {}
            artist_dzid = artist_dzid or (str(a.get("id")) if a.get("id") else None)
            artist_name = (artist_name or a.get("name") or "").strip()
            album_dzid  = album_dzid  or (str(al.get("id")) if al.get("id") else None)
            album_title = (album_title or al.get("title") or "—").strip()
            cover_url   = cover_url or (al.get("cover") or "")
    except Exception:
        # No bloqueamos captura si Deezer falla
        pass

    # Defaults defensivos
    artist_name = artist_name or "—"
    album_title = album_title or "—"
    cover_url   = cover_url or ""

    # ---- 3) Upsert transaccional, pero sin romper ante detalles menores ----
    try:
        with transaction.atomic():

            # ARTISTA
            if artist_dzid:
                artista, _ = Artista.objects.update_or_create(
                    deezer_id=str(artist_dzid),
                    defaults={"nombre": artist_name[:255] or "—"}
                )
            else:
                artista, _ = Artista.objects.get_or_create(
                    nombre=(artist_name[:255] or "—")
                )

            try:
                _enrich_artist(artista, artist_dzid)
            except Exception:
                pass

            # ÁLBUM
            if album_dzid:
                album, _ = Album.objects.update_or_create(
                    deezer_id=str(album_dzid),
                    defaults={
                        "titulo": album_title[:255] or "—",
                        "artista": artista,
                        "portada_url": cover_url[:500],
                    }
                )
            else:
                album, _ = Album.objects.get_or_create(
                    artista=artista, titulo=(album_title[:255] or "—"),
                    defaults={"portada_url": cover_url[:500]}
                )

            try:
                _enrich_album(album, album_dzid)
            except Exception:
                pass

            # CANCIÓN
            cancion, created = Cancion.objects.update_or_create(
                deezer_id=str(dz_track_id),
                defaults={
                    "titulo": title[:255],
                    "duracion": int(duration or 30),
                    "preview_url": preview[:500] if isinstance(preview, str) else "",
                    "artista": artista,
                    "album": album,
                }
            )

            # CLASIFICACIÓN (no crítica)
            if CLASSIFY_ON_CAPTURE and not cancion.top_emocion_id:
                try:
                    texto = f"{title} - {artist_name}".strip()
                    if USE_LYRICS:
                        try:
                            lyrics = get_lyrics(title, artist_name) or ""
                        except Exception:
                            lyrics = ""
                        if lyrics:
                            texto = f"{texto}\n\n{lyrics}"

                    res = clasificar_6(texto, title=title)
                    clave, scores = res.get("label"), res.get("scores", {})
                    if clave:
                        emo = Emocion.objects.get(clave=clave)
                        CancionEmocion.objects.update_or_create(
                            cancion=cancion, emocion=emo, source="goemotions",
                            defaults={"score": float(scores.get(clave, 0.0))}
                        )
                        cancion.top_emocion = emo
                        cancion.emotion_scores = scores
                        cancion.save(update_fields=["top_emocion", "emotion_scores"])
                except Exception:
                    # Logea y sigue
                    traceback.print_exc()

    except Exception as e:
        print("[capture] ERROR:", repr(e))
        traceback.print_exc()
        return JsonResponse({"ok": False, "error": f"{type(e).__name__}: {e}"}, status=500)

    # Respuesta ligera (puedes dejar JSON si quieres)
    return JsonResponse({
        "ok": True,
        "song_id": cancion.id,
        "created": created,
        "top_emocion": cancion.top_emocion.clave if cancion.top_emocion_id else None,
    }, status=201)

# --- FIN: LÓGICA DE LAS EMOCIONES ---


# --- INICIO: API PLAYLISTS (listar/crear) ---

@login_required
@require_GET
def playlists_list(request):
    # Playlists del usuario
    qs = (Playlist.objects
          .filter(usuario=request.user)
          .order_by("-id"))

    ids = [p.id for p in qs]
    if not ids:
        return JsonResponse({"data": []})

    # Conteo de canciones por playlist
    counts = dict(
        PlaylistCancion.objects
        .filter(playlist_id__in=ids)
        .values_list("playlist_id")
        .annotate(c=models.Count("id"))
    )

    # Duración total
    dur_map = dict(
        PlaylistCancion.objects
        .filter(playlist_id__in=ids)
        .annotate(ms=models.F("cancion__duracion") * 1000)
        .values("playlist_id")
        .annotate(total_ms=models.Sum("ms"))
        .values_list("playlist_id", "total_ms")
    )

    covers_map = {pid: [] for pid in ids}
    for pc in (PlaylistCancion.objects
               .filter(playlist_id__in=ids)
               .select_related("cancion__album")
               .order_by("playlist_id", "posicion", "id")):
        pid = pc.playlist_id
        if len(covers_map[pid]) >= 4:
            continue
        cover = getattr(getattr(pc.cancion, "album", None), "portada_url", "") or ""
        if cover:
            covers_map[pid].append(cover)

    data = []
    for p in qs:
        pid = p.id
        fc_local = localtime(p.fecha_creacion)
        data.append({
            "id": pid,
            "nombre": p.nombre,
            "fecha_creacion": fc_local.isoformat(),
            "track_count": int(counts.get(pid, 0)),
            "duration_ms": int(dur_map.get(pid) or 0),
            "covers": covers_map.get(pid, []),
        })
    return JsonResponse({"data": data})


# -------- Helper: garantizar canción local desde un Deezer ID --------
def _fetch_deezer_track_json(track_id: int) -> dict:
    r = requests.get(f"https://api.deezer.com/track/{track_id}", timeout=6)
    r.raise_for_status()
    return r.json()

def ensure_cancion_from_deezer_id(deezer_id: int) -> Cancion:
    c = Cancion.objects.filter(deezer_id=deezer_id).first()
    if c:
        return c

    data = _fetch_deezer_track_json(deezer_id)
    titulo = data.get("title") or ""
    dur_seg = int(data.get("duration") or 0)

    # TODO: si tu modelo requiere álbum/artista no nulos, crea/relaciónalos aquí.
    c = Cancion.objects.create(
        deezer_id=deezer_id,
        titulo=titulo,
        duracion=dur_seg,
    )
    return c


@login_required
@require_POST
def create_playlist(request):
    # ---------- Parseo seguro ----------
    try:
        payload = json.loads(request.body.decode("utf-8"))
    except Exception:
        return JsonResponse({"ok": False, "error": "JSON inválido"}, status=400)

    # ---------- Campos ----------
    nombre      = (payload.get("nombre") or "").strip()
    descripcion = (payload.get("descripcion") or "").strip()
    es_publica  = bool(payload.get("es_publica", False))
    tracks      = payload.get("tracks") or []

    # ---------- Validaciones ----------
    if len(nombre) < 3:
        return JsonResponse({"ok": False, "error": "El nombre debe tener al menos 3 caracteres."}, status=400)
    if not isinstance(tracks, list) or not tracks:
        return JsonResponse({"ok": False, "error": "Agrega al menos una canción."}, status=400)

    # normalizar a int
    try:
        dz_ids = [int(t) for t in tracks]
    except ValueError:
        return JsonResponse({"ok": False, "error": "tracks debe ser lista de enteros."}, status=400)

    if Playlist.objects.filter(usuario=request.user, nombre__iexact=nombre).exists():
        return JsonResponse(
            {"ok": False, "error": "Ya tienes una playlist con ese nombre."},
            status=409
        )

    try:
        with transaction.atomic():
            # ---------- Crear playlist ----------
            pl = Playlist.objects.create(
                nombre=nombre,
                descripcion=descripcion,
                es_publica=es_publica,
                usuario=request.user,
            )

            # ---------- Vincular canciones ----------
            local_ids = []
            pos_map   = {}
            for idx, dz_id in enumerate(dz_ids, start=1):
                c = ensure_cancion_from_deezer_id(dz_id)
                local_ids.append(c.id)
                pos_map[c.id] = idx

            canciones_qs = Cancion.objects.filter(id__in=local_ids)
            items = [
                PlaylistCancion(playlist=pl, cancion=c, posicion=pos_map.get(c.id))
                for c in canciones_qs
            ]
            PlaylistCancion.objects.bulk_create(items, ignore_conflicts=True)

            track_count = len(items)
            duration_ms = (canciones_qs.aggregate(
                total=models.Sum(models.F("duracion"))
            )["total"] or 0) * 1000

    except IntegrityError:
        return JsonResponse(
            {"ok": False, "error": "Ya tienes una playlist con ese nombre."},
            status=409
        )

    # ---------- OK ----------
    return JsonResponse({
        "ok": True,
        "playlist": {
            "id": pl.id,
            "nombre": pl.nombre,
            "descripcion": getattr(pl, "descripcion", ""),
            "es_publica": pl.es_publica,
            "track_count": track_count,
            "duration_ms": duration_ms,
        }
    }, status=201)


@login_required
@require_http_methods(["GET", "DELETE", "PATCH", "PUT"])
def playlist_detail(request, pid: int):
    pl = get_object_or_404(Playlist, id=pid, usuario=request.user)

    # DELETE: borrar playlist (con sus enlaces)
    if request.method == "DELETE":
        PlaylistCancion.objects.filter(playlist=pl).delete()
        pl.delete()
        return JsonResponse({
            "deleted": True,
            "redirect": "/pages/dashboard.html#/playlists"
        }, status=200)

    # PATCH/PUT: nombre/descripcion o add/remove de canción
    if request.method in ("PATCH", "PUT"):
        try:
            data = json.loads(request.body or '{}')
        except Exception:
            data = {}

        # --- BLOQUEA campos de fecha que pudieran venir del front ---
        for k in ("fecha_creacion", "created_at", "fecha_actualizacion", "updated_at"):
            if k in data:
                data.pop(k, None)

        action = (data.get('action') or '').lower()
        track_id = data.get('track_id')

        # 1) Actualizar nombre/descripcion (solo si VIENEN en el payload)
        changed = False

        if 'nombre' in data:
            nombre = (data.get('nombre') or '').strip()
            if nombre:  # no sobre-escribas con vacío
                pl.nombre = nombre
                changed = True

        if 'descripcion' in data:
            # aquí sí permitimos string vacío si explícitamente lo mandan
            descripcion = (data.get('descripcion') or '')
            pl.descripcion = descripcion
            changed = True

        if 'es_publica' in data:
            pl.es_publica = bool(data.get('es_publica'))
            changed = True

        if changed:
            # Guarda SOLO los campos que de verdad cambiaron
            update_fields = []
            if 'nombre' in data and (data.get('nombre') or '').strip():
                update_fields.append('nombre')
            if 'descripcion' in data:
                update_fields.append('descripcion')
            if 'es_publica' in data:
                update_fields.append('es_publica')

            if update_fields:
                pl.save(update_fields=update_fields)

        # 2) Agregar / quitar canción (opcional, igual que antes)
        if action in ('add', 'remove'):
            if not track_id:
                return JsonResponse({'detail': 'track_id requerido'}, status=400)

            # Canción puede venir como id interno o deezer_id
            cancion = (Cancion.objects.filter(id=track_id).first() or
                       Cancion.objects.filter(deezer_id=str(track_id)).first())
            if not cancion:
                return JsonResponse({'detail': 'Canción no encontrada'}, status=404)

            if action == 'add':
                PlaylistCancion.objects.get_or_create(playlist=pl, cancion=cancion)
            else:  # remove
                PlaylistCancion.objects.filter(playlist=pl, cancion=cancion).delete()

        return JsonResponse({'ok': True})

    # GET: detalle como ya lo tenías
    pcs = (PlaylistCancion.objects
           .filter(playlist=pl)
           .select_related("cancion__artista", "cancion__album")
           .order_by("posicion", "id"))

    tracks = []
    total_ms = 0
    for pc in pcs:
        c = pc.cancion
        dur = int(c.duracion or 30)
        total_ms += dur * 1000
        tracks.append({
            "id": int(c.deezer_id) if (c.deezer_id and str(c.deezer_id).isdigit()) else c.id,
            "title": c.titulo,
            "duration": dur,
            "preview": c.preview_url or "",
            "artist": c.artista.nombre if c.artista else "",
            "album":  c.album.titulo if c.album else "",
            "cover":  c.album.portada_url if c.album else "",
        })

    return JsonResponse({
        "id": pl.id,
        "nombre": pl.nombre,
        "descripcion": pl.descripcion or "",
        "track_count": len(tracks),
        "duration_ms": total_ms,
        "tracks": tracks,
    })

# --- FIN: API PLAYLISTS ---


# --- INICIO: COMPARTIR PLAYLISTS ---

def _rate_limit(request, key_prefix: str, limit: int = 15, window: int = 60):
    ip = request.META.get("REMOTE_ADDR") or "unknown"
    key = f"rl:{key_prefix}:{ip}"
    cur = cache.get(key) or 0
    if cur >= limit:
        return JsonResponse({"detail": "Too many requests"}, status=429)
    # inicia ventana si no existe
    if cur == 0:
        cache.set(key, 1, timeout=window)
    else:
        cache.incr(key)
    return None


def _resolve_copy_name(user, base_name: str) -> str:
    base = base_name.strip()
    if not Playlist.objects.filter(usuario=user, nombre=base).exists():
        return base
    # primera colisión → "(copia)"
    name = f"{base} (copia)"
    if not Playlist.objects.filter(usuario=user, nombre=name).exists():
        return name
    # siguientes → "(copia N)"
    n = 2
    while True:
        name_n = f"{base} (copia {n})"
        if not Playlist.objects.filter(usuario=user, nombre=name_n).exists():
            return name_n
        n += 1


@login_required
@require_POST
def share_copy_link(request, pid: int):
    hit = _rate_limit(request, "share_link", limit=15, window=60)
    if hit:
        return hit

    pl = get_object_or_404(Playlist, id=pid, usuario=request.user)

    token = generate_share_token(pl.id)

    # arma URL de preview (si luego quieres que sea tu frontend, cambia el path)
    url = f"{request.scheme}://{request.get_host()}/api/v1/share/copy/preview?token={token}"

    # TTL (días) y caducidad en unix
    ttl_days   = getattr(settings, "SHARE_TTL_DAYS", 3)
    expires_at = int(time.time() + ttl_days * 86400)

    return JsonResponse({
        "url": url,
        "token": token,
        "ttl_days": ttl_days,
        "expires_at": expires_at,
    }, status=200)


@require_GET
def share_copy_preview(request):
    # rate-limit
    hit = _rate_limit(request, "share_preview", limit=15, window=60)
    if hit: return hit

    token = (request.GET.get("token") or "").strip()
    if not token:
        return JsonResponse({"detail": "token requerido"}, status=400)
    try:
        payload = verify_share_token(token)
    except ShareTokenError as e:
        return JsonResponse({"detail": str(e)}, status=400)

    pid = int(payload["pid"])
    pl = Playlist.objects.filter(id=pid).first()
    if not pl:
        return JsonResponse({"detail": "playlist_not_found"}, status=404)

    # compón preview SIN datos del dueño
    pcs = (PlaylistCancion.objects
           .filter(playlist=pl)
           .select_related("cancion__album")
           .order_by("posicion", "id"))
    covers, total_ms = [], 0
    for pc in pcs:
        c = pc.cancion
        if len(covers) < 4:
            cover = getattr(getattr(c, "album", None), "portada_url", "") or ""
            if cover: covers.append(cover)
        total_ms += int(c.duracion or 0) * 1000

    return JsonResponse({
        "token_ok": True,
        "name": pl.nombre,
        "tracks_count": pcs.count(),
        "duration_ms": total_ms,
        "covers": covers,
        "expires_at": payload["exp"],  # unix ts
    })

@login_required
@require_POST
def share_copy_import(request):
    # rate-limit
    hit = _rate_limit(request, "share_import", limit=15, window=60)
    if hit: return hit

    data = json.loads(request.body or "{}")
    token = (data.get("token") or "").strip()
    if not token:
        return JsonResponse({"detail": "token requerido"}, status=400)

    try:
        payload = verify_share_token(token)
    except ShareTokenError as e:
        return JsonResponse({"detail": str(e)}, status=400)

    src = Playlist.objects.filter(id=int(payload["pid"])).first()
    if not src:
        return JsonResponse({"detail": "playlist_not_found"}, status=404)

    # nombre destino resuelto
    final_name = _resolve_copy_name(request.user, src.nombre)
    # crea destino (privada por defecto)
    dest = Playlist.objects.create(
        nombre=final_name,
        descripcion=src.descripcion or "",
        es_publica=False,
        usuario=request.user,
    )

    # duplica canciones preservando posición
    pcs = (PlaylistCancion.objects
           .filter(playlist=src)
           .select_related("cancion")
           .order_by("posicion", "id"))

    bulk = []
    for pc in pcs:
        c = pc.cancion
        # si por alguna razón no está la canción, recupérala por deezer_id
        if not isinstance(c.id, int) or not c:
            # muy improbable; por si acaso
            if c and c.deezer_id:
                c = ensure_cancion_from_deezer_id(int(c.deezer_id))
            else:
                # si no hay deezer_id, salta ese ítem
                continue
        bulk.append(PlaylistCancion(playlist=dest, cancion=c, posicion=pc.posicion))

    if bulk:
        PlaylistCancion.objects.bulk_create(bulk, ignore_conflicts=True)

    # calcula duración
    total_ms = ( PlaylistCancion.objects
                .filter(playlist=dest)
                .aggregate(s=models.Sum('cancion__duracion'))['s'] or 0
    ) * 1000

    return JsonResponse({
        "ok": True,
        "new_id": dest.id,
        "name": dest.nombre,
        "track_count": len(bulk),
        "duration_ms": total_ms
    }, status=201)


