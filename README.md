# ReadEra Vocabulary Viewer

A simple, lightweight web application designed to parse and display vocabulary backups from the ReadEra book reader.

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
uv run server.py
```
The application will be available at `http://localhost:8000`.

### 4. Load Your Library
1. Export your library from ReadEra as a JSON file (usually named `library.json`).
2. Open the application in your browser.
3. Use the "Choose File" button to upload your `library.json`.
4. The application will remember your file and load it automatically on subsequent visits.
