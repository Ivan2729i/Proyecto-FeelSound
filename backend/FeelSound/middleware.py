# Para borrar caché de sesiones anteriores
class NoStoreForAuth:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        resp = self.get_response(request)
        try:
            if request.user.is_authenticated:
                resp.headers["Cache-Control"] = "no-store"
                resp.headers["Vary"] = "Cookie"
        except Exception:
            pass
        return resp
