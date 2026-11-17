#!/usr/bin/env python3
"""Chatbot simple basé sur Groq. Serveur sans dépendance externe (stdlib uniquement)."""

import json
import os
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent
STATIC = ROOT / "static"
GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"
MAX_MESSAGES = 30  # taille maximale de l'historique envoyé au modèle


def load_env(path: Path) -> None:
    """Charge un fichier .env minimal (KEY=VALUE) sans écraser l'environnement."""
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


load_env(ROOT / ".env")

API_KEY = os.environ.get("GROQ_API_KEY", "")
MODEL = os.environ.get("GROQ_MODEL", "openai/gpt-oss-20b")
SYSTEM_PROMPT = os.environ.get(
    "SYSTEM_PROMPT",
    "Tu es un assistant sympathique et concis. Réponds dans la langue de l'utilisateur.",
)
HOST = os.environ.get("HOST", "127.0.0.1")
PORT = int(os.environ.get("PORT", "8000"))

CONTENT_TYPES = {".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8",
                 ".js": "text/javascript; charset=utf-8"}


class Handler(BaseHTTPRequestHandler):
    server_version = "SimpleChatbot/1.0"

    def log_message(self, fmt, *args):  # logs sobres, jamais de contenu de messages
        print(f"{self.address_string()} {fmt % args}")

    def _json(self, status: int, payload: dict) -> None:
        body = json.dumps(payload).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path == "/api/health":
            return self._json(200, {"ok": True, "model": MODEL, "configured": bool(API_KEY)})
        name = "index.html" if self.path in ("/", "") else self.path.lstrip("/").split("?")[0]
        file = (STATIC / name).resolve()
        if STATIC not in file.parents or not file.is_file():
            return self._json(404, {"error": "Introuvable"})
        data = file.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", CONTENT_TYPES.get(file.suffix, "application/octet-stream"))
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_POST(self):
        if self.path != "/api/chat":
            return self._json(404, {"error": "Introuvable"})
        if not API_KEY:
            return self._json(500, {"error": "GROQ_API_KEY n'est pas configurée (voir .env)."})
        try:
            length = int(self.headers.get("Content-Length", "0"))
            messages = json.loads(self.rfile.read(length))["messages"]
            clean = [{"role": m["role"], "content": str(m["content"])}
                     for m in messages if m.get("role") in ("user", "assistant")][-MAX_MESSAGES:]
        except (ValueError, KeyError, TypeError):
            return self._json(400, {"error": "Requête invalide."})

        payload = {
            "model": MODEL,
            "messages": [{"role": "system", "content": SYSTEM_PROMPT}] + clean,
            "stream": True,
            "temperature": 0.7,
        }
        req = urllib.request.Request(
            GROQ_URL, data=json.dumps(payload).encode(), method="POST",
            headers={"Authorization": f"Bearer {API_KEY}", "Content-Type": "application/json",
                     "User-Agent": "simple-chatbot/1.0"})
        try:
            upstream = urllib.request.urlopen(req, timeout=60)
        except urllib.error.HTTPError as e:
            detail = ""
            try:
                detail = json.loads(e.read()).get("error", {}).get("message", "")
            except Exception:
                pass
            return self._json(502, {"error": f"Groq a répondu {e.code}. {detail}".strip()})
        except Exception as e:
            return self._json(502, {"error": f"Groq injoignable : {e}"})

        # On relaie le flux SSE tel quel vers le navigateur.
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream")
        self.send_header("Cache-Control", "no-cache")
        self.end_headers()
        try:
            with upstream:
                for line in upstream:
                    self.wfile.write(line)
                    self.wfile.flush()
        except (BrokenPipeError, ConnectionResetError):
            pass


if __name__ == "__main__":
    if not API_KEY:
        print("⚠️  GROQ_API_KEY manquante : copiez .env.example vers .env et renseignez-la.")
    print(f"Chatbot prêt sur http://{HOST}:{PORT} (modèle : {MODEL})")
    ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()
