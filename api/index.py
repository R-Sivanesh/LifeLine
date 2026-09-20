import sys
import os
import json
import traceback
import asyncio
from http.server import BaseHTTPRequestHandler
from urllib.parse import urlparse
from pathlib import Path

# Mark environment as Vercel serverless
os.environ["VERCEL"] = "1"

current_dir = Path(__file__).resolve().parent
root_dir = current_dir.parent
backend_dir = root_dir / "backend"

for p in (str(current_dir), str(backend_dir), str(root_dir)):
    if os.path.exists(p) and p not in sys.path:
        sys.path.insert(0, p)

# Import real FastAPI application
from app.main import app as fastapi_app

class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        self._handle_request('GET')

    def do_POST(self):
        self._handle_request('POST')

    def do_PUT(self):
        self._handle_request('PUT')

    def do_DELETE(self):
        self._handle_request('DELETE')

    def do_PATCH(self):
        self._handle_request('PATCH')

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', '*')
        self.end_headers()

    def _handle_request(self, method: str):
        parsed_url = urlparse(self.path)
        path = parsed_url.path
        query_string = parsed_url.query.encode('latin-1')
        
        headers = []
        for key, value in self.headers.items():
            headers.append((key.lower().encode('latin-1'), value.encode('latin-1')))
            
        content_length = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(content_length) if content_length > 0 else b''
        
        response_status = 200
        response_headers = []
        response_body = []
        
        scope = {
            'type': 'http',
            'asgi': {'version': '3.0'},
            'http_version': '1.1',
            'method': method,
            'path': path,
            'raw_path': path.encode('latin-1'),
            'query_string': query_string,
            'headers': headers,
            'server': ('localhost', 80),
        }
        
        async def receive():
            return {'type': 'http.request', 'body': body, 'more_body': False}
            
        async def send(message):
            nonlocal response_status, response_headers, response_body
            if message['type'] == 'http.response.start':
                response_status = message['status']
                for h_name, h_val in message.get('headers', []):
                    response_headers.append((h_name.decode('latin-1'), h_val.decode('latin-1')))
            elif message['type'] == 'http.response.body':
                response_body.append(message.get('body', b''))
                
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            loop.run_until_complete(fastapi_app(scope, receive, send))
        except Exception as exc:
            err_msg = json.dumps({
                "error": "FastAPI Execution Failure",
                "details": str(exc),
                "traceback": traceback.format_exc(),
                "path": path
            })
            response_status = 500
            response_headers = [('content-type', 'application/json')]
            response_body = [err_msg.encode('utf-8')]
        finally:
            loop.close()
            
        self.send_response(response_status)
        for h_name, h_val in response_headers:
            if h_name.lower() not in ('server', 'date'):
                self.send_header(h_name, h_val)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        for chunk in response_body:
            self.wfile.write(chunk)
