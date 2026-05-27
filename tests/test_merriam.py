import unittest
import os
import json
import shutil
import sys

# Add parent directory to path to import server
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from server import get_merriam_webster_word_info, CACHE_DIR, get_cache_path

class TestMerriamWebsterScraper(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        # Backup existing cache if it exists
        cls.cache_backup = CACHE_DIR + "_backup_merriam"
        if os.path.exists(CACHE_DIR):
            if os.path.exists(cls.cache_backup):
                shutil.rmtree(cls.cache_backup)
            shutil.copytree(CACHE_DIR, cls.cache_backup)
            shutil.rmtree(CACHE_DIR)
        os.makedirs(CACHE_DIR, exist_ok=True)

    @classmethod
    def tearDownClass(cls):
        # Restore cache backup
        if os.path.exists(CACHE_DIR):
            shutil.rmtree(CACHE_DIR)
        if os.path.exists(cls.cache_backup):
            shutil.move(cls.cache_backup, CACHE_DIR)

    def test_merriam_webster_scraper_basic(self):
        """Test Merriam-Webster scraper with a common word."""
        word = "world"
        result = get_merriam_webster_word_info(word, CACHE_DIR, get_cache_path)
        
        self.assertNotIn("error", result)
        self.assertEqual(result["word"].lower(), "world")
        self.assertTrue(len(result["definitions"]) > 0)
        
        # Check structure of a definition
        first_def = result["definitions"][0]
        self.assertIn("part_of_speech", first_def)
        self.assertIn("description", first_def)
        self.assertIn("examples", first_def)
        self.assertIn("labels", first_def)
        self.assertIn("images", first_def)

    def test_merriam_webster_scraper_not_found(self):
        """Test Merriam-Webster scraper with a non-existent word."""
        word = "thisisnotarealword12345"
        result = get_merriam_webster_word_info(word, CACHE_DIR, get_cache_path)
        self.assertIn("error", result)

    def test_caching(self):
        """Test that results are cached."""
        word = "apple"
        # First call to populate cache
        get_merriam_webster_word_info(word, CACHE_DIR, get_cache_path)
        
        # Check if cache file exists
        cache_path = get_cache_path(word, "merriam")
        self.assertTrue(os.path.exists(cache_path), f"Cache file {cache_path} should exist")
        
        # Modify cache file to verify it's being used
        with open(cache_path, "r", encoding="utf-8") as f:
            data = json.load(f)
        
        data["word"] = "cached_apple"
        
        with open(cache_path, "w", encoding="utf-8") as f:
            json.dump(data, f)
            
        # Second call should return cached data
        result = get_merriam_webster_word_info(word, CACHE_DIR, get_cache_path)
        self.assertEqual(result["word"], "cached_apple")

if __name__ == "__main__":
    unittest.main()
