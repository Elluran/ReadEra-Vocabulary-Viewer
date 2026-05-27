import os
import json
import requests
from bs4 import BeautifulSoup
from urllib.parse import urljoin

def get_merriam_webster_word_info(word: str, cache_dir: str, get_cache_path_func):
    if not word:
        return {"error": "A word must be provided."}

    cache_path = get_cache_path_func(word, "merriam")
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
