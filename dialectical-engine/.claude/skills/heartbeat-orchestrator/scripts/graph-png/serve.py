import http.server,sys,pathlib
D=pathlib.Path(sys.argv[2])
class H(http.server.BaseHTTPRequestHandler):
    def _cors(self): self.send_header('Access-Control-Allow-Origin','*'); self.send_header('Access-Control-Allow-Methods','POST, OPTIONS'); self.send_header('Access-Control-Allow-Headers','content-type')
    def do_OPTIONS(self): self.send_response(204); self._cors(); self.end_headers()
    def do_POST(self):
        n=int(self.headers.get('content-length','0')); body=self.rfile.read(n)
        name=pathlib.Path(self.path).name; name=''.join(c for c in name if c.isalnum() or c in '-_.')
        (D/name).write_bytes(body); self.send_response(200); self._cors(); self.end_headers(); self.wfile.write(b'ok')
        sys.stderr.write(f'saved {name} {n}\n'); sys.stderr.flush()
    def do_GET(self):
        name=pathlib.Path(self.path.split('?')[0]).name; f=D/name
        if not f.is_file(): self.send_response(404); self.end_headers(); return
        ct='text/html; charset=utf-8' if name.endswith('.html') else 'application/javascript' if name.endswith('.js') else 'application/octet-stream'
        b=f.read_bytes(); self.send_response(200); self.send_header('Content-Type',ct); self.send_header('Content-Length',str(len(b))); self.end_headers(); self.wfile.write(b)
    def log_message(self,*a): pass
http.server.ThreadingHTTPServer(('127.0.0.1',int(sys.argv[1])),H).serve_forever()
