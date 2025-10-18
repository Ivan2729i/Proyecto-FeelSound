from django.contrib.auth.decorators import login_required
from django.shortcuts import render
import requests
from django.http import JsonResponse, HttpResponseBadRequest
from django.views.decorators.http import require_GET


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
