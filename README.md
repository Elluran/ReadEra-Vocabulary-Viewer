# ReadEra Vocabulary Viewer

A simple, lightweight web application designed to parse and display vocabulary backups from the ReadEra book reader.


<img width="2462" height="1262" alt="Screenshot" src="https://github.com/user-attachments/assets/806dabb9-107a-4dae-83ad-7162241f0260" />

## Features
- **JSON Parsing**: Handles `library.json` exports from ReadEra.
- **Word & Example Display**: Shows words with their original book context and highlighting.
- **Multi-Dictionary Integration**: Fetch definitions, parts of speech, and illustrations from Cambridge Dictionary and Merriam-Webster.
- **Audio Pronunciations**: Copy UK/US audio pronunciations directly to the clipboard.
- **Anki Integration**: Sync with Anki via AnkiConnect to hide known words and manage decks.
- **Advanced Sorting & Filtering**: Sort by frequency, number of examples, or date; real-time search with debouncing.
- **Word Grouping**: Uses NLTK lemmatization to group different forms of the same word.
- **Book Management**: Filter vocabulary by specific books.
- **Global Search**: Search for word occurrences across all books in your library.

## Setup Instructions

### 1. Prerequisites
- Python 3.13 or higher
- [uv](https://github.com/astral-sh/uv)

### 2. Install Dependencies
```bash
uv sync
```

### 3. Run the Application
```bash
uv run readera-server
```
or
```bash
uv run -m app.server
```
The application will be available at `http://localhost:8000`.

### 4. Load Your Library
1. Export your library from ReadEra as a JSON file (usually named `library.json`).
2. Open the application in your browser.
3. Use the "Choose File" button to upload your `library.json`.
4. The application will remember your file and load it automatically on subsequent visits.

### 5. Anki Integration (Optional)
To sync your vocabulary with Anki and hide words you already know:
1. Install the [AnkiConnect](https://ankiweb.net/shared/info/2055492159) plugin in Anki.
2. Ensure Anki is running.
3. The application will automatically attempt to sync on startup.
4. Use the "Sync Anki" button to manually refresh the word list.
5. Enable "Hide words already in Anki" to filter your view.

## Run tests
```bash
uv run python3 -m unittest discover tests
```