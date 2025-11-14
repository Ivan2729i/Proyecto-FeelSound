import re
from langdetect import detect, LangDetectException

# ===== Config =====
NEUTRAL = "neutral"
EMOS = ["feliz", "triste", "enojado", "amor", "calmada", NEUTRAL]

# Palabras clave por emoción (es + en + emojis)
TRIGGERS = {
    "amor": [
        "love", "amor", "te amo", "te quiero", "mi vida", "mi amor",
        "corazón", "corazon", "❤️", "😍", "🥰", "beso", "abrazo"
    ],
    "enojado": [
        "hate", "odio", "rabia", "furia", "ira", "wtf", "maldito",
        "maldita", "maldicion", "maldición", "😡", "enoj", "enojo"
    ],
    "triste": [
        "sad", "triste", "lloro", "llorar", "lágrima", "lagrima", "💔",
        "😢", "solo", "soledad", "perdí", "perdi", "perderte"
    ],
    "feliz": [
        "happy", "feliz", "party", "fiesta", "bailar", "yeah",
        "😁", "🎉", "celebra", "celebrar", "brilla", "sonríe", "sonrie"
    ],
    "calmada": [
        "calm", "calma", "relax", "paz", "peace", "chill", "😴",
        "tranquilo", "tranquila", "sereno", "serena", "suave", "brisa"
    ],
}

LOVE_PAT = re.compile(
    r"\b(amor|te\s+amo|te\s+quiero|mi\s+vida|mi\s+amor|coraz[oó]n)\b",
    re.I
)
CALM_PAT = re.compile(
    r"\b(calma|paz|tranquil[ao]s?|relajad[ao]s?|relajar|seren[ao]s?|suave[s]?)\b",
    re.I
)

def _norm6(d: dict) -> dict:
    """Normaliza el diccionario de scores a prob distrib (suma=1)."""
    base = {k: 0.0 for k in EMOS}
    for k, v in (d or {}).items():
        if k in base:
            base[k] = float(v)
    s = sum(base.values()) or 1.0
    for k in base:
        base[k] /= s
    return base

def _scores_from_keywords(text: str) -> dict:
    """
    Construye scores en base a palabras clave en el texto.
    Muy ligero, sin modelos pesados.
    """
    text = (text or "").lower()
    scores = {k: 0.0 for k in EMOS}

    if not text.strip():
        scores[NEUTRAL] = 1.0
        return scores

    # Conteo muy simple de ocurrencias
    for emo, words in TRIGGERS.items():
        for w in words:
            if w in text:
                scores[emo] += 0.25  # cada match suma un poquito

    # Boost especiales
    if LOVE_PAT.search(text):
        scores["amor"] += 0.5
    if CALM_PAT.search(text) and scores["enojado"] < 0.4:
        scores["calmada"] += 0.4

    # Si nada matchéa, neutro
    if all(v == 0 for v in scores.values()):
        scores[NEUTRAL] = 1.0

    return scores

def _postprocess(scores: dict, title: str = "") -> tuple[str, dict]:
    """
    Post-procesa scores para escoger la emoción final.
    """
    scores = _norm6(scores)
    ranked = sorted(scores.items(), key=lambda x: x[1], reverse=True)
    (top_emo, top_val) = ranked[0]

    # Umbral mínimo muy simple
    MIN_CONF = 0.30
    if top_val < MIN_CONF:
        top_emo = NEUTRAL

    return top_emo, scores

def clasificar_6(texto: str, title: str = ""):
    texto = (texto or "").strip()
    full = f"{title or ''}\n\n{texto}".strip()

    # Textos muy cortos → neutro o heurísticas de título
    if len(full.split()) < 4:
        scores = _scores_from_keywords(full)
        label, mixed = _postprocess(scores, title=title)
        return {"label": label, "scores": mixed}

    # Detectar idioma solo para logging / posible ajuste futuro
    try:
        lang = detect(full)
    except LangDetectException:
        lang = "es"

    # Por ahora usamos la misma lógica para es/en, solo con keywords
    scores = _scores_from_keywords(full)

    # Pequeño ajuste si es inglés (por ejemplo, subimos un poco neutral
    # si casi no hay triggers)
    if lang.startswith("en") and max(scores.values()) < 0.4:
        scores[NEUTRAL] += 0.2

    label, mixed = _postprocess(scores, title=title)
    return {"label": label, "scores": mixed}
