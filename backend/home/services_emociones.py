from functools import lru_cache
import re
from langdetect import detect, LangDetectException
from transformers import pipeline
from pysentimiento import create_analyzer

# ===== Config =====
NEUTRAL = "neutral"
EMOS = ["feliz", "triste", "enojado", "amor", "calmada", NEUTRAL]


MIN_CONF        = 0.11
MIN_MARGIN      = 0.04
NEUTRAL_STEAL   = 0.16
NON_NEU_PRIOR   = 0.02
NEU_CAP_GAP     = 0.08
W_ES_PYS        = 0.60
W_ES_GOEMO      = 0.40

_GOEMAP = {
    "joy": "feliz", "sadness": "triste", "anger": "enojado",
    "love": "amor", "calm": "calmada", "neutral": "neutral",
    # familias
    "admiration":"feliz","approval":"feliz","amusement":"feliz","excitement":"feliz",
    "gratitude":"feliz","pride":"feliz","optimism":"feliz","relief":"feliz",
    "disappointment":"triste","grief":"triste","remorse":"triste",
    "annoyance":"enojado","disgust":"enojado","anger":"enojado",
    "desire":"amor","caring":"amor","love":"amor",
    "serenity":"calmada","calm":"calmada",
}

# Heurísticas por título / palabras clave
TRIGGERS = {
    "amor":   ["love","amor","te amo","te quiero","mi vida","mi amor","corazón","❤️","😍","🥰","beso","abrazo"],
    "enojado":["hate","odio","rabia","furia","ira","wtf","maldito","😡","enoj","enojo","maldita","maldición"],
    "triste": ["sad","triste","lloro","llorar","lágrima","💔","😢","solo","soledad","perdí","perderte"],
    "feliz":  ["happy","feliz","party","fiesta","bailar","yeah","😁","🎉","celebra","celebrar","brilla","sonríe"],
    "calmada":["calm","calma","relax","paz","peace","chill","😴","tranquilo","sereno","suave","brisa"],
}

LOVE_PAT = re.compile(r"\b(amor|te\s+amo|te\s+quiero|mi\s+vida|mi\s+amor|coraz[oó]n)\b", re.I)
CALM_PAT = re.compile(r"\b(calma|paz|tranquil[ao]s?|relajad[ao]s?|relajar|seren[ao]s?|suave[s]?)\b", re.I)

@lru_cache(maxsize=1)
def _pipe_en():
    return pipeline(
        "text-classification",
        model="SamLowe/roberta-base-go_emotions",
        top_k=None, truncation=True, max_length=512, return_all_scores=True
    )

@lru_cache(maxsize=1)
def _pipe_es():
    return create_analyzer(task="emotion", lang="es")

def _norm6(d: dict) -> dict:
    base = {k: 0.0 for k in EMOS}
    for k, v in (d or {}).items():
        if k in base:
            base[k] = float(v)
    s = sum(base.values()) or 1.0
    for k in base:
        base[k] /= s
    return base

def _boost_from_title(title: str) -> dict:
    title = (title or "").lower()
    bump = {k: 0.0 for k in EMOS}
    if not title:
        return bump
    for emo, words in TRIGGERS.items():
        if any(w in title for w in words):
            bump[emo] += 0.05
    return bump

def _heuristics_boost(text, scores):
    if LOVE_PAT.search(text or ""):
        scores["amor"] += 0.25
    if CALM_PAT.search(text or "") and scores["enojado"] < 0.25:
        scores["calmada"] += 0.20
    return scores

def _postprocess(scores: dict, title: str = "") -> tuple[str, dict]:
    for emo in EMOS:
        if emo != NEUTRAL:
            scores[emo] = scores.get(emo, 0.0) + NON_NEU_PRIOR

    boost = _boost_from_title(title)
    for k in EMOS:
        scores[k] = scores.get(k, 0.0) + boost.get(k, 0.0)
    scores = _heuristics_boost(title, scores)

    no_neu_max = max(scores.get(e, 0.0) for e in EMOS if e != NEUTRAL)
    cap = max(0.0, no_neu_max - NEU_CAP_GAP)
    if scores.get(NEUTRAL, 0.0) > cap:
        scores[NEUTRAL] = cap

    scores = _norm6(scores)

    ranked = sorted(scores.items(), key=lambda x: x[1], reverse=True)
    (top_emo, top_val), (_, second_val) = ranked[0], ranked[1]

    if top_val < MIN_CONF:
        if second_val >= MIN_CONF and (top_val - second_val) <= MIN_MARGIN:
            top_emo, top_val = ranked[1]
        else:
            top_emo = NEUTRAL

    if top_emo == NEUTRAL and (top_val - second_val) <= NEUTRAL_STEAL:
        for emo, val in ranked[1:]:
            if emo != NEUTRAL and val >= MIN_CONF:
                top_emo = emo
                break

    return top_emo, scores

def _scores_from_goemotions(text: str) -> dict:
    outs = _pipe_en()(text[:512])[0]
    agg = {k: 0.0 for k in EMOS}
    for it in outs:
        k6 = _GOEMAP.get(it["label"], NEUTRAL)
        agg[k6] += float(it["score"])
    return agg

def clasificar_6(texto: str, title: str = ""):
    texto = (texto or "").strip()

    if len(texto.split()) < 12:
        scores = _norm6({NEUTRAL: 0.55})
        label, mixed = _postprocess(scores, title=title)
        return {"label": label, "scores": mixed}

    try:
        lang = detect(texto)
    except LangDetectException:
        lang = "es"

    try:
        if lang.startswith("es"):
            es = _pipe_es().predict(texto)
            scores_es = {
                "feliz":   float(es.probas.get("joy", 0.0)),
                "triste":  float(es.probas.get("sadness", 0.0)),
                "enojado": float(es.probas.get("anger", 0.0)),
                "amor":    0.45 * float(es.probas.get("joy", 0.0)),
                "calmada": max(0.0, 0.35 - (es.probas.get("anger",0)+es.probas.get("fear",0)+es.probas.get("disgust",0))/3),
                "neutral": float(es.probas.get("others", 0.0)),
            }

            scores_go = _scores_from_goemotions(texto)
            scores = {k: W_ES_PYS*scores_es.get(k,0.0) + W_ES_GOEMO*scores_go.get(k,0.0) for k in EMOS}

            label, mixed = _postprocess(scores, title=title)
            return {"label": label, "scores": mixed}

        else:
            scores = _scores_from_goemotions(texto)
            label, mixed = _postprocess(scores, title=title)
            return {"label": label, "scores": mixed}

    except Exception:
        label, mixed = _postprocess({NEUTRAL: 1.0}, title=title)
        return {"label": label, "scores": mixed}
