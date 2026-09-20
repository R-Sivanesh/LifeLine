from http.server import BaseHTTPRequestHandler
import json
import sys
import os

class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200)
        self.send_header('Content-type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        data = {
            "status": "ok",
            "service": "LifeLine Direct Handler",
            "python_version": sys.version,
            "cwd": os.getcwd(),
            "sys_path": sys.path
        }
        self.wfile.write(json.dumps(data).encode())
