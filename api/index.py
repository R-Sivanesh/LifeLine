import sys
import os
import json
import traceback
import asyncio
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

def handler(environ, start_response):
    """
    Robust WSGI-to-ASGI bridge for Vercel Python serverless runtime.
    """
    path = environ.get('PATH_INFO', '')
    query_string = environ.get('QUERY_STRING', '').encode('latin-1')
    method = environ.get('REQUEST_METHOD', 'GET')
    
    headers = []
    for k, v in environ.items():
        if k.startswith('HTTP_'):
            header_name = k[5:].replace('_', '-').lower().encode('latin-1')
            headers.append((header_name, str(v).encode('latin-1')))
        elif k in ('CONTENT_TYPE', 'CONTENT_LENGTH') and v:
            header_name = k.replace('_', '-').lower().encode('latin-1')
            headers.append((header_name, str(v).encode('latin-1')))
            
    content_length = int(environ.get('CONTENT_LENGTH') or 0)
    body = environ['wsgi.input'].read(content_length) if ('wsgi.input' in environ and content_length > 0) else b''
    
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
        'server': (environ.get('SERVER_NAME', 'localhost'), int(environ.get('SERVER_PORT', 80))),
    }
    
    async def receive():
        return {'type': 'http.request', 'body': body, 'more_body': False}
        
    async def send(message):
        nonlocal response_status, response_headers, response_body
        if message['type'] == 'http.response.start':
            response_status = message['status']
            for name, val in message.get('headers', []):
                response_headers.append((name.decode('latin-1'), val.decode('latin-1')))
        elif message['type'] == 'http.response.body':
            response_body.append(message.get('body', b''))
            
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        loop.run_until_complete(fastapi_app(scope, receive, send))
    except Exception as exc:
        err_msg = json.dumps({"error": "FastAPI Execution Failed", "details": str(exc), "traceback": traceback.format_exc()})
        response_status = 500
        response_headers = [('content-type', 'application/json')]
        response_body = [err_msg.encode('utf-8')]
    finally:
        loop.close()
        
    status_str = f"{response_status} Status"
    start_response(status_str, response_headers)
    return response_body

# Also expose app for ASGI environments
app = fastapi_app
