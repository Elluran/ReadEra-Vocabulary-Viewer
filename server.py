import os
import json
import hashlib
import tomllib
from config_schema import Config
import uuid
import time
import requests
from bs4 import BeautifulSoup
from urllib.parse import urljoin
from http.server import HTTPServer, BaseHTTPRequestHandler
from socketserver import ThreadingMixIn
import urllib.parse
import nltk
from nltk.stem import WordNetLemmatizer
from nltk.corpus import wordnet

# Initialize NLTK
try:
    lemmatizer = WordNetLemmatizer()
    # Test if data is available
    lemmatizer.lemmatize("test")
except LookupError:
    print("NLTK data not found. Downloading...")
    nltk.download('wordnet')
    nltk.download('omw-1.4')
    lemmatizer = WordNetLemmatizer()

CACHE_DIR = "cache"
os.makedirs(CACHE_DIR, exist_ok=True)

def get_cache_path(word, dictionary="cambridge"):
    hash_name = hashlib.md5(f"{dictionary}_{word.lower()}".encode()).hexdigest()
    return os.path.join(CACHE_DIR, f"{hash_name}.json")

def get_cambridge_word_info(word: str):
    if not word:
        return {"error": "A word must be provided."}

    cache_path = get_cache_path(word, "cambridge")
    if os.path.exists(cache_path):
        try:
            with open(cache_path, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass

    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
    }
    url = f"https://dictionary.cambridge.org/dictionary/english/{word.strip().lower().replace(' ', '-')}"

    try:
        response = requests.get(url, headers=headers)
        response.raise_for_status()

        soup = BeautifulSoup(response.content, "html.parser")

        headword_el = soup.find("b", class_="ttn")
        actual_word = headword_el.text.strip() if headword_el else word

        # Extract IPA and Audio
        ipa_data = []
        
        # Cambridge uses various classes for pronunciations.
        # We look for all pronunciations in the entry body to catch variants for different POS
        # (e.g., "content" as noun vs adjective)
        pron_elements = soup.select(".pos-header .dpron-i, .pos-header .pron-info, .di-head .dpron-i, .di-head .pron-info")
        
        if not pron_elements:
            # Fallback to any pronunciation info if not in standard headers
            pron_elements = soup.select(".dpron-i, .pron-info")

        for pron in pron_elements:
            region = pron.find("span", class_=["region", "dregion"])
            region_text = region.text.strip() if region else ""
            
            ipa = pron.find("span", class_=["ipa", "dipa"])
            ipa_text = ipa.text.strip() if ipa else ""
            
            audio_btn = pron.find("span", class_=["daud", "audio_play_button"])
            audio_url = ""
            if audio_btn:
                audio_source = audio_btn.find("source", type="audio/mpeg")
                if audio_source and audio_source.get("src"):
                    audio_url = urljoin(url, audio_source.get("src"))
            
            if ipa_text or audio_url:
                # Avoid exact duplicates
                if not any(p["ipa"] == ipa_text and p["region"] == region_text and p["audio"] == audio_url for p in ipa_data):
                    ipa_data.append({
                        "region": region_text,
                        "ipa": ipa_text,
                        "audio": audio_url
                    })

        all_definition_entries = []
        entry_blocks = soup.find_all("div", class_="pr entry-body__el")
        if not entry_blocks:
            entry_blocks = soup.find_all("div", class_="entry-body")
        
        # If still no entry blocks, look for idioms or phrases which might contain definitions
        if not entry_blocks:
            entry_blocks = soup.find_all("div", class_=["idiom-block", "phrase-block"])

        if not entry_blocks:
            # Last resort: just find all def-blocks in the page if they are not inside standard entry blocks
            def_blocks = soup.find_all("div", class_="def-block")
            if def_blocks:
                entry_blocks = [soup] # Treat the whole soup as one block
            else:
                return {"error": f"No definitions found for the word '{actual_word}'."}

        for block in entry_blocks:
            part_of_speech = "not specified"
            pos_header = block.find("div", class_="pos-header")
            posgram_header = block.find("div", class_="posgram")

            block_labels = []
            if pos_header:
                pos_el = pos_header.find("span", class_="pos")
                if pos_el:
                    part_of_speech = pos_el.text.strip()
                
                # Extract labels from pos-header
                labels = pos_header.find_all("span", class_=["usage", "lab"])
                for l in labels:
                    text = l.text.strip()
                    if text and text not in block_labels:
                        block_labels.append(text)
            elif posgram_header:
                pos_el = posgram_header.find("span", class_="pos")
                if pos_el:
                    part_of_speech = pos_el.text.strip()

            # Find all definition blocks within this entry block
            def_blocks = block.find_all("div", class_="def-block")
            
            for def_block in def_blocks:
                description_el = def_block.find("div", class_="def")
                if not description_el:
                    continue
                
                description = description_el.text.strip()
                
                # Avoid duplicate definitions within the same word
                if any(d["description"] == description for d in all_definition_entries):
                    continue

                definition_entry = {}
                definition_entry["part_of_speech"] = part_of_speech.upper()
                definition_entry["description"] = description

                # Collect labels for this definition
                sense_labels = list(block_labels)
                
                # Check for labels at the sense level (dsense)
                parent_sense = def_block.find_parent("div", class_="pr dsense")
                if parent_sense:
                    labels = parent_sense.find_all("span", class_=["usage", "lab"], recursive=False)
                    for l in labels:
                        text = l.text.strip()
                        if text not in sense_labels:
                            sense_labels.append(text)
                
                # Check for labels inside def-block
                labels = def_block.find_all("span", class_=["usage", "lab"])
                for l in labels:
                    # Check if this label is inside a synonym section
                    is_synonym_label = False
                    parent = l.parent
                    while parent and parent != def_block:
                        classes = parent.get('class', [])
                        if any(c in ['dataset-synonyms', 'smartt', 'synonyms', 'related-words', 'xref'] for c in classes):
                            is_synonym_label = True
                            break
                        parent = parent.parent
                    
                    if not is_synonym_label:
                        text = l.text.strip()
                        if text not in sense_labels:
                            sense_labels.append(text)
                
                definition_entry["labels"] = sense_labels

                definition_entry["examples"] = []
                # Only extract examples that are NOT inside synonym/related word sections
                # Cambridge examples are usually in .examp blocks
                examp_blocks = def_block.find_all("div", class_="examp")
                if not examp_blocks:
                    # Fallback to just finding .eg spans if no .examp blocks
                    examples = def_block.find_all("span", class_="eg")
                    for ex in examples:
                        is_synonym_ex = False
                        parent = ex.parent
                        while parent and parent != def_block:
                            classes = parent.get('class', [])
                            if any(c in ['dataset-synonyms', 'smartt', 'synonyms', 'related-words', 'xref'] for c in classes):
                                is_synonym_ex = True
                                break
                            parent = parent.parent
                        if not is_synonym_ex:
                            definition_entry["examples"].append(ex.get_text().strip())
                else:
                    for ex_block in examp_blocks:
                        # Check if example is inside a synonym section
                        is_synonym_ex = False
                        parent = ex_block.parent
                        while parent and parent != def_block:
                            classes = parent.get('class', [])
                            if any(c in ['dataset-synonyms', 'smartt', 'synonyms', 'related-words', 'xref'] for c in classes):
                                is_synonym_ex = True
                                break
                            parent = parent.parent
                        
                        if not is_synonym_ex:
                            # Extract bold parts (lu) and example text (eg)
                            lu = ex_block.find("span", class_="lu")
                            eg = ex_block.find("span", class_="eg")
                            
                            example_html = ""
                            if lu:
                                example_html += f"<b>{lu.get_text().strip()}</b>"
                            if eg:
                                if example_html:
                                    example_html += " "
                                example_html += eg.get_text().strip()
                            
                            if not example_html and not lu and not eg:
                                # Fallback to full text if no specific spans found
                                example_html = ex_block.get_text().strip()
                                
                            if example_html:
                                definition_entry["examples"].append(example_html)

                # Extract images
                definition_entry["images"] = []
                # Cambridge often uses images with class 'dimg_i' or inside 'illustration'
                img_elements = def_block.select("img.dimg_i, .illustration img, amp-img.dimg_i, .illustration amp-img")
                for img in img_elements:
                    # Check if image is inside a synonym section
                    is_synonym_img = False
                    parent = img.parent
                    while parent and parent != def_block:
                        classes = parent.get('class', [])
                        if any(c in ['dataset-synonyms', 'smartt', 'synonyms', 'related-words', 'xref'] for c in classes):
                            is_synonym_img = True
                            break
                        parent = parent.parent
                    
                    if not is_synonym_img:
                        img_src = img.get("src") or img.get("data-src")
                        if img_src:
                            definition_entry["images"].append(urljoin(url, img_src))

                all_definition_entries.append(definition_entry)

        result = {
            "word": actual_word,
            "definitions": all_definition_entries,
            "pronunciations": ipa_data
        }
        
        # Save to cache
        with open(cache_path, "w", encoding="utf-8") as f:
            json.dump(result, f, ensure_ascii=False, indent=2)
            
        return result

    except requests.exceptions.HTTPError as e:
        if e.response.status_code == 404:
            return {"error": f"The word '{word}' was not found in the dictionary."}
        return {"error": f"Error fetching word data: {e}"}
    except Exception as e:
        return {"error": str(e)}

def get_merriam_webster_word_info(word: str):
    if not word:
        return {"error": "A word must be provided."}

    cache_path = get_cache_path(word, "merriam")
    if os.path.exists(cache_path):
        try:
            with open(cache_path, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass

    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
    }
    url = f"https://www.merriam-webster.com/dictionary/{word.strip().lower().replace(' ', '%20')}"

    try:
        response = requests.get(url, headers=headers)
        response.raise_for_status()

        soup = BeautifulSoup(response.content, "html.parser")

        headword_el = soup.find("h1", class_="hword")
        actual_word = headword_el.text.strip() if headword_el else word

        # Extract IPA and Audio
        ipa_data = []
        
        # Merriam-Webster pronunciations
        pron_elements = soup.select(".word-attributions .prons, .headword-row .prons")
        for pron in pron_elements:
            # IPA is often in .mw
            ipa_el = pron.find("span", class_="mw")
            ipa_text = ipa_el.text.strip() if ipa_el else ""
            
            audio_btn = pron.find("a", class_="play-pron")
            audio_url = ""
            if audio_btn:
                # MW uses data attributes for audio
                lang = audio_btn.get("data-lang", "en_us")
                dir = audio_btn.get("data-dir", "")
                file = audio_btn.get("data-file", "")
                if file:
                    # MW audio URL structure: https://media.merriam-webster.com/audio/prons/[lang]/mp3/[dir]/[file].mp3
                    audio_url = f"https://media.merriam-webster.com/audio/prons/{lang}/mp3/{dir}/{file}.mp3"
            
            if ipa_text or audio_url:
                if not any(p["ipa"] == ipa_text and p["audio"] == audio_url for p in ipa_data):
                    ipa_data.append({
                        "region": "US",
                        "ipa": ipa_text,
                        "audio": audio_url
                    })

        all_definition_entries = []
        
        # MW has multiple entries (entry-1, entry-2, etc.)
        entries = soup.select(".entry-word-section-container")
        
        for entry in entries:
            # Part of speech
            pos_el = entry.find("h2", class_="parts-of-speech")
            part_of_speech = pos_el.text.strip() if pos_el else "not specified"
            
            # Definitions are in .vg
            vg_blocks = entry.select(".vg")
            for vg in vg_blocks:
                # Each vg can have multiple senses
                # Senses can be grouped in .vg-sseq-entry-item
                # Inside there might be .sb-0, .sb-1 etc. which contain .sense
                senses = vg.select(".sense")
                if not senses:
                    # Fallback to vg-sseq-entry-item if no .sense blocks
                    senses = vg.select(".vg-sseq-entry-item")

                for sense in senses:
                    # Description is in .dt
                    dt = sense.find("span", class_="dt")
                    if not dt:
                        continue
                    
                    # Clean up description (MW has some internal tags like .mw_t_bc)
                    dt_text_el = dt.find("span", class_="dtText")
                    if not dt_text_el:
                        continue
                    
                    description = dt_text_el.get_text().strip().lstrip(": ")
                    if not description:
                        continue

                    # Check for sub-sense letter (a, b, etc.)
                    sense_letter_el = sense.find("span", class_="sense-letter")
                    if sense_letter_el:
                        description = f"({sense_letter_el.get_text().strip()}) {description}"

                    definition_entry = {
                        "part_of_speech": part_of_speech.upper(),
                        "description": description,
                        "labels": [],
                        "examples": [],
                        "images": []
                    }

                    # Extract images for MW
                    # MW often has images in .art-container or similar
                    art_container = sense.find("div", class_="art-container")
                    if art_container:
                        img = art_container.find("img")
                        if img:
                            img_src = img.get("src") or img.get("data-src")
                            if img_src:
                                definition_entry["images"].append(urljoin(url, img_src))

                    # Labels (sls, labels)
                    labels = sense.select(".sl, .lbl")
                    for l in labels:
                        definition_entry["labels"].append(l.get_text().strip())

                    # Examples are in .ex-sent within the sense
                    examples = sense.select(".ex-sent")
                    for ex in examples:
                        # Avoid nested examples being added twice
                        if ex.find_parent("span", class_="ex-sent"):
                            continue
                        
                        # Remove author/source attribution (marked with .aq)
                        aq = ex.find("span", class_="aq")
                        if aq:
                            aq.decompose()
                            
                        ex_text = ex.get_text().strip()
                        if ex_text:
                            # Remove leading/trailing dashes or other artifacts if they remain
                            ex_text = ex_text.strip("— ").strip()
                            if ex_text:
                                definition_entry["examples"].append(ex_text)

                    all_definition_entries.append(definition_entry)

        if not all_definition_entries:
            return {"error": f"No definitions found for the word '{actual_word}'."}

        result = {
            "word": actual_word,
            "definitions": all_definition_entries,
            "pronunciations": ipa_data
        }
        
        # Save to cache
        with open(cache_path, "w", encoding="utf-8") as f:
            json.dump(result, f, ensure_ascii=False, indent=2)
            
        return result

    except requests.exceptions.HTTPError as e:
        if e.response.status_code == 404:
            return {"error": f"The word '{word}' was not found in Merriam-Webster."}
        return {"error": f"Error fetching word data: {e}"}
    except Exception as e:
        return {"error": str(e)}

def get_wordnet_pos(treebank_tag):
    if treebank_tag.startswith('J'):
        return wordnet.ADJ
    elif treebank_tag.startswith('V'):
        return wordnet.VERB
    elif treebank_tag.startswith('N'):
        return wordnet.NOUN
    elif treebank_tag.startswith('R'):
        return wordnet.ADV
    else:
        return wordnet.NOUN

def lemmatize_words(words):
    results = {}
    for word in words:
        w = word.lower()
        # Group verb tenses (flung -> fling)
        v_lemma = lemmatizer.lemmatize(w, pos=wordnet.VERB)
        if v_lemma != w:
            results[word] = v_lemma
        else:
            # Group plurals (cats -> cat)
            n_lemma = lemmatizer.lemmatize(w, pos=wordnet.NOUN)
            results[word] = n_lemma
    return results

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
                        result = get_merriam_webster_word_info(word)
                    else:
                        result = get_cambridge_word_info(word)
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
            config_path = 'config.toml'
            if os.path.exists(config_path):
                try:
                    with open(config_path, 'rb') as f:
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
    server_address = ('', port)
    httpd = server_class(server_address, handler_class)
    print(f"Starting server on port {port}...")
    httpd.serve_forever()

if __name__ == "__main__":
    run()
