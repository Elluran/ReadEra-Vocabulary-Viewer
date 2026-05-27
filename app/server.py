import os
import json
import hashlib
import tomllib
from app.config.config import Config, save_config, ensure_config_exists, CONFIG_PATH
import uuid
import time
import requests
from http.server import HTTPServer, BaseHTTPRequestHandler
from socketserver import ThreadingMixIn
import urllib.parse

from app.dictionaries.cambridge import get_cambridge_word_info
from app.dictionaries.merriam import get_merriam_webster_word_info
from app.processing.word import lemmatize_words

CACHE_DIR = "cache"
os.makedirs(CACHE_DIR, exist_ok=True)


def get_cache_path(word, dictionary="cambridge"):
    hash_name = hashlib.md5(f"{dictionary}_{word.lower()}".encode()).hexdigest()
    return os.path.join(CACHE_DIR, f"{hash_name}.json")


class DictionaryHandler(BaseHTTPRequestHandler):
    def do_POST(self):
        parsed_url = urllib.parse.urlparse(self.path)
        path = parsed_url.path

        if path == '/api/lemmatize':
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            try:
                data = json.loads(post_data)
                words = data.get('words', [])
                if not isinstance(words, list):
                    self.send_error(400, "Words must be a list")
                    return
                
                lemmas = lemmatize_words(words)
                
                self.send_response(200)
                self.send_header('Content-type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(json.dumps(lemmas).encode())
            except Exception as e:
                self.send_error(500, f"Internal server error: {e}")
        elif path == '/api/add_word':
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            try:
                data = json.loads(post_data)
                word = data.get('word', '').strip()
                library_path = data.get('library', 'library.json')
                
                if not word:
                    self.send_error(400, "Word is required")
                    return

                if not os.path.exists(library_path):
                    # Fallback to library.json if the specified one doesn't exist
                    library_path = 'library.json'

                if not os.path.exists(library_path):
                    self.send_error(500, "Library file not found")
                    return

                with open(library_path, 'r', encoding='utf-8') as f:
                    library = json.load(f)

                # Check if word already exists
                if any(w['data']['word_key'].lower() == word.lower() for w in library.get('words', [])):
                    self.send_response(200)
                    self.send_header('Content-type', 'application/json')
                    self.send_header('Access-Control-Allow-Origin', '*')
                    self.end_headers()
                    self.wfile.write(json.dumps({"status": "exists", "message": "Word already exists"}).encode())
                    return

                # Create new word entry
                word_uri = str(uuid.uuid4())
                timestamp = int(time.time() * 1000)
                new_word = {
                    "ctxs": [],
                    "data": {
                        "doc_uri": "",
                        "group_id": 0,
                        "title_case": 0,
                        "word_color": 0,
                        "word_insert_time": timestamp,
                        "word_key": word,
                        "word_lang": "en",
                        "word_modified_time": timestamp,
                        "word_title": word,
                        "word_uri": word_uri
                    },
                    "forms": [
                        {
                            "form_key": word,
                            "form_title": word,
                            "form_uri": str(uuid.uuid4())
                        }
                    ],
                    "uri": word_uri
                }

                if 'words' not in library:
                    library['words'] = []
                library['words'].append(new_word)

                with open(library_path, 'w', encoding='utf-8') as f:
                    json.dump(library, f, ensure_ascii=False, indent=2)

                self.send_response(200)
                self.send_header('Content-type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(json.dumps({"status": "success", "word": new_word}).encode())
            except Exception as e:
                self.send_error(500, f"Internal server error: {e}")
        elif path == '/api/upload':
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            try:
                data = json.loads(post_data)
                filename = data.get('filename')
                content = data.get('content')
                if not filename or not content:
                    self.send_error(400, "Filename and content required")
                    return
                
                # Basic security check
                if not filename.endswith('.json') or '..' in filename or '/' in filename or '\\' in filename:
                    self.send_error(400, "Invalid filename")
                    return

                with open(filename, 'w', encoding='utf-8') as f:
                    json.dump(content, f, ensure_ascii=False, indent=2)

                self.send_response(200)
                self.send_header('Content-type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(json.dumps({"status": "success"}).encode())
            except Exception as e:
                self.send_error(500, f"Internal server error: {e}")
        elif path == '/api/config':
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            try:
                data = json.loads(post_data)
                
                # Validate with Pydantic
                config = Config(**data)
                
                # Save to config.toml
                save_config(config)

                self.send_response(200)
                self.send_header('Content-type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(json.dumps({"status": "success"}).encode())
            except Exception as e:
                self.send_error(500, f"Internal server error: {e}")
        else:
            self.send_error(404)

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def do_GET(self):
        # Use urllib.parse to correctly handle the path and query
        parsed_url = urllib.parse.urlparse(self.path)
        path = parsed_url.path
        query = urllib.parse.parse_qs(parsed_url.query)

        if path == '/api/dictionary':
            word = query.get('word', [None])[0]
            dictionary = query.get('dict', ['cambridge'])[0]
            if word:
                try:
                    if dictionary == 'merriam':
                        result = get_merriam_webster_word_info(word, CACHE_DIR, get_cache_path)
                    else:
                        result = get_cambridge_word_info(word, CACHE_DIR, get_cache_path)
                    self.send_response(200)
                    self.send_header('Content-type', 'application/json')
                    self.send_header('Access-Control-Allow-Origin', '*')
                    self.end_headers()
                    self.wfile.write(json.dumps(result).encode())
                except Exception as e:
                    self.send_error(500, f"Internal server error: {e}")
            else:
                self.send_error(400, "Word parameter missing")
        elif path == '/api/proxy_audio':
            audio_url = query.get('url', [None])[0]
            if audio_url:
                try:
                    headers = {
                        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
                    }
                    resp = requests.get(audio_url, headers=headers, stream=True)
                    resp.raise_for_status()
                    
                    self.send_response(200)
                    self.send_header('Content-type', 'audio/mpeg')
                    self.send_header('Content-Disposition', 'attachment; filename="audio.mp3"')
                    self.send_header('Access-Control-Allow-Origin', '*')
                    self.end_headers()
                    for chunk in resp.iter_content(chunk_size=8192):
                        self.wfile.write(chunk)
                except Exception as e:
                    self.send_error(500, f"Error proxying audio: {e}")
            else:
                self.send_error(400, "URL parameter missing")
        elif path == '/api/config':
            if os.path.exists(CONFIG_PATH):
                try:
                    with open(CONFIG_PATH, 'rb') as f:
                        config_data = tomllib.load(f)
                    
                    # Validate with Pydantic
                    config = Config(**config_data)
                    
                    self.send_response(200)
                    self.send_header('Content-type', 'application/json')
                    self.send_header('Access-Control-Allow-Origin', '*')
                    self.end_headers()
                    self.wfile.write(config.model_dump_json().encode())
                except Exception as e:
                    self.send_error(500, f"Error reading or validating config: {e}")
            else:
                self.send_error(404, "Config file not found")
        else:
            # Serve static files
            if path == '/':
                path = '/index.html'
            
            # Remove leading slash for local file path
            local_path = path.lstrip('/')
            
            # Check in app/static first
            # Since server.py is now in app/, we need to look for static files relative to the project root
            # or adjust the path. The current working directory is expected to be the project root.
            static_path = os.path.join('app', 'static', local_path)
            if os.path.exists(static_path) and os.path.isfile(static_path):
                local_path = static_path
            
            if os.path.exists(local_path) and os.path.isfile(local_path):
                self.send_response(200)
                if path.endswith('.html'):
                    self.send_header('Content-type', 'text/html')
                elif path.endswith('.css'):
                    self.send_header('Content-type', 'text/css')
                elif path.endswith('.js'):
                    self.send_header('Content-type', 'application/javascript')
                elif path.endswith('.json'):
                    self.send_header('Content-type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                with open(local_path, 'rb') as f:
                    self.wfile.write(f.read())
            else:
                self.send_error(404, f"File not found: {path}")

class ThreadedHTTPServer(ThreadingMixIn, HTTPServer):
    """Handle requests in a separate thread."""

def run(server_class=ThreadedHTTPServer, handler_class=DictionaryHandler, port=8000):
    ensure_config_exists()
    server_address = ('', port)
    httpd = server_class(server_address, handler_class)
    print(f"Starting server on port {port}...")
    httpd.serve_forever()

if __name__ == "__main__":
    run()
