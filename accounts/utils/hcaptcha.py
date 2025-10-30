import requests
from django.conf import settings

VERIFY_URL = "https://hcaptcha.com/siteverify"

def verify_hcaptcha(token: str, remoteip: str | None = None) -> tuple[bool, dict]:
    if not token:
        return False, {"error": "missing-token"}

    data = {"secret": settings.HCAPTCHA_SECRET_KEY, "response": token}
    if remoteip:
        data["remoteip"] = remoteip

    try:
        r = requests.post(VERIFY_URL, data=data, timeout=5)
        r.raise_for_status()
        payload = r.json()
        return bool(payload.get("success")), payload
    except Exception as e:
        return False, {"error": str(e)}