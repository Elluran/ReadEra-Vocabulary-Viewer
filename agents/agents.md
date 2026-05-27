# ReadEra Vocabulary Viewer

A simple, lightweight web application designed to parse and display vocabulary backups from the ReadEra book reader.

## Features
- **JSON Parsing**: Specifically designed to handle the `library.json` format exported by ReadEra.
- **Word & Example Display**: Shows words looked up by the user along with the original context (examples) from the books.
- **Book Mapping**: Automatically associates each word with its source book title.
- **Search & Filter**: Real-time search functionality to find specific words or phrases within examples.
- **Auto-Loading**: Remembers the last opened library file and loads it automatically on page load.
- **Multi-Dictionary Integration**: Click on any word to fetch and display definitions, parts of speech, specialized labels (e.g., "specialized", "informal"), examples, and illustrations from Cambridge Dictionary or Merriam-Webster.
- **Audio Pronunciations**: Listen to and copy audio pronunciations (UK/US for Cambridge, US for Merriam-Webster) directly to the clipboard in binary format.
- **Request Caching**: Dictionary results are cached locally to improve performance and reduce network requests.
- **Global Example Search**: Option to search through all available examples in the library to find additional context for each word.
- **Add New Words**: Manually add new words to the library directly from the UI.
- **Book Management**: Toggle a book list view to include or exclude specific books from the vocabulary list and examples.
- **Anki Integration**: Sync with local Anki decks via AnkiConnect to hide known words and copy audio tags directly to Anki.

## Technical Stack
- **HTML5/CSS3**: Responsive two-column layout for word list and dictionary view.
- **Vanilla JavaScript**: Efficient DOM manipulation and asynchronous API calls.
- **Python Backend**: A lightweight custom server to handle dictionary scraping, caching, and word lemmatization.
- **Word Grouping**: Accurate lemmatization using NLTK to group different forms of the same word (e.g., "fling" and "flung").

## Project Structure

- **`app/`**: Core application logic.
    - **`server.py`**: Main Python backend handling API requests, scraping, and file management.
    - **`config/`**: Configuration management and schema validation.
    - **`dictionaries/`**: Scraper implementations for Cambridge and Merriam-Webster dictionaries.
    - **`processing/`**: Word processing utilities, including NLTK-based lemmatization.
    - **`static/`**: Frontend assets including `index.html`, `style.css`, and `app.js`.
- **`agents/`**: Documentation and logs for AI agents.
- **`tests/`**: Test suite for backend components and scrapers.
- **`pyproject.toml`**: Project dependencies and metadata managed by `uv`.
