"""Servidor local del juego sin caché: el navegador siempre recibe la última versión.

Uso: python3 tools/serve.py [puerto]   (por defecto 8000)
`python3 -m http.server` no envía Cache-Control y el navegador puede seguir
usando módulos .js viejos después de editar el código.
"""
import http.server
import socketserver
import sys
import json
from pathlib import Path
from urllib.parse import urlsplit
from audio_playlist import playlist


class NoCache(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map,
                      '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm',
                      '.glb': 'model/gltf-binary', '.mp4': 'video/mp4'}

    def do_GET(self):
        if urlsplit(self.path).path == '/assets/audio/playlist.json':
            data = json.dumps(playlist(root)).encode('utf8')
            self.send_response(200)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.send_header('Content-Length', str(len(data)))
            self.end_headers()
            self.wfile.write(data)
            return
        super().do_GET()

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, must-revalidate')
        self.send_header('Expires', '0')
        super().end_headers()


port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
root = Path(__file__).resolve().parents[1]
handler = lambda *a, **k: NoCache(*a, directory=str(root), **k)
socketserver.ThreadingTCPServer.allow_reuse_address = True
with socketserver.ThreadingTCPServer(('127.0.0.1', port), handler) as server:
    print(f'Técnica Run en http://127.0.0.1:{port}/ (sin caché)')
    server.serve_forever()
