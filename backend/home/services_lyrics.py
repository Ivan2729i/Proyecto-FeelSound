import re
import requests

def _lrclib(title:str, artist:str):
    try:
        r = requests.get(
            "https://lrclib.net/api/get",
            params={"track_name": title or "", "artist_name": artist or ""},
            timeout=6
        )
        if r.status_code == 200:
            j = r.json()
            if j.get("plainLyrics"):
                return j["plainLyrics"]
            if j.get("syncedLyrics"):
                return re.sub(r"\[[0-9:.]+\]\s*", "", j["syncedLyrics"])
    except Exception:
        pass
    return None

def get_lyrics(title:str, artist:str):
    if not (title or "").strip():
        return None
    txt = _lrclib(title, artist)
    if txt and len(txt.split()) >= 6:
        return txt
    return None
