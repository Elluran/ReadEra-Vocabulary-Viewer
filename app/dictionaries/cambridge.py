import os
import json
import requests
from bs4 import BeautifulSoup
from urllib.parse import urljoin

def get_cambridge_word_info(word: str, cache_dir: str, get_cache_path_func):
    if not word:
        return {"error": "A word must be provided."}

    cache_path = get_cache_path_func(word, "cambridge")
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
