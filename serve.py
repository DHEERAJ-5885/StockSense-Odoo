"""Tiny static server for the StockSense prototype.

Same as `python -m http.server`, but tells the browser never to cache, so edits to the
HTML files always show up (a stale cached login page was the usual cause of "old behaviour").

    python serve.py          # http://localhost:8000
    python serve.py 3000     # another port
"""
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer


class NoCacheHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, must-revalidate')
        self.send_header('Pragma', 'no-cache')
        super().end_headers()


if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    print(f'StockSense running at http://localhost:{port}  (Ctrl+C to stop)')
    ThreadingHTTPServer(('', port), NoCacheHandler).serve_forever()
