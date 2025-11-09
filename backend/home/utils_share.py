import base64, hmac, json, os, time, secrets, hashlib
from django.conf import settings
from django.utils.timezone import now

def _b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")

def _b64url_decode(s: str) -> bytes:
    pad = "=" * ((4 - len(s) % 4) % 4)
    return base64.urlsafe_b64decode((s + pad).encode("ascii"))

def generate_share_token(pid: int, typ: str = "copy") -> str:
    iat = int(time.time())
    exp = int(time.time() + settings.SHARE_TTL_DAYS * 24 * 3600)
    payload = {
        "pid": int(pid),
        "typ": typ,
        "iat": iat,
        "exp": exp,
        "nonce": secrets.token_urlsafe(8),
        "ver": 1,
    }
    body = _b64url(json.dumps(payload, separators=(",", ":")).encode("utf-8"))
    sig  = hmac.new(
        key=settings.SHARE_SECRET.encode("utf-8"),
        msg=body.encode("ascii"),
        digestmod=hashlib.sha256
    ).digest()
    return f"{body}.{_b64url(sig)}"

class ShareTokenError(Exception):
    pass

def verify_share_token(token: str) -> dict:
    try:
        body, sig_b64 = token.split(".", 1)
    except ValueError:
        raise ShareTokenError("token_malformed")

    expected = hmac.new(
        key=settings.SHARE_SECRET.encode("utf-8"),
        msg=body.encode("ascii"),
        digestmod=hashlib.sha256
    ).digest()
    try:
        sig = _b64url_decode(sig_b64)
    except Exception:
        raise ShareTokenError("signature_invalid")

    if not hmac.compare_digest(sig, expected):
        raise ShareTokenError("signature_invalid")

    try:
        payload = json.loads(_b64url_decode(body).decode("utf-8"))
    except Exception:
        raise ShareTokenError("payload_invalid")

    if payload.get("typ") != "copy":
        raise ShareTokenError("type_invalid")

    if int(payload.get("exp", 0)) < int(time.time()) - 120:  # 2 min de tolerancia reloj
        raise ShareTokenError("token_expired")

    if not isinstance(payload.get("pid"), int):
        raise ShareTokenError("payload_invalid")

    return payload
