# Development Log - ReadEra Backup Reader

## 2026-05-06
- **Initial Analysis**: Analyzed the structure of `library.json`. Identified that words are stored in the `words` array, each containing a `data` object with the word itself (`word_key`) and a `ctxs` array containing usage examples (`ctx_title`). Documents are stored in the `docs` array, which allows mapping `doc_uri` to book titles.
- **Frontend Development**:
    - Created `index.html` with a clean UI for file loading and searching.
    - Implemented `style.css` for a modern, readable layout focusing on the vocabulary list.
    - Developed `app.js` to handle the logic:
        - Implemented `FileReader` API for manual JSON uploads.
        - Implemented `fetch` API for loading a local `library.json` file.
        - Created a mapping system to link words to their source books.
        - Added real-time search filtering for both words and their context.
- **Testing**: Verified the app by running a local Python HTTP server and confirming that `library.json` loads and displays correctly.
- **Sorting**: Implemented multiple sorting options:
    - Alphabetical (A-Z)
    - By number of examples (descending)
    - By "ratio" (position in book)
- **UI Improvements**: Moved examples under toggleable `<details>` spoilers to keep the interface clean.
- **Documentation**: Created `agents.md` to describe the application and `log.md` to document the development process.

## 2026-05-08
- **Frequency Sorting**:
    - Integrated a word frequency list (Top 10,000 English words) to help prioritize learning.
    - Added "Most Common First" and "Rare Words First" sorting options to the UI.
    - Implemented `frequency.json` generation and loading logic in `app.js`.
    - Updated `server.py` to serve JSON files with correct CORS headers.

## 2026-05-11
- **UI & UX Improvements**:
    - Styled the "Choose File" button to be consistent with the application's UI by using a custom label and hiding the default input.
    - Set "Number of Examples" as the default sorting variant in `index.html`.

## 2026-05-07
- **UI Redesign**:
    - Implemented a two-column layout in `index.html` and `style.css`.
    - Moved the word list to the left and added a sticky dictionary view on the right.
    - Added hover effects and click handlers to word items.
- **Backend Development**:
    - Created `server.py` to replace the basic `http.server`.
    - Ported Cambridge Dictionary scraping logic from `cambridge.py`.
    - Implemented a JSON-based caching system for dictionary requests to reduce latency and avoid rate limiting.
    - Added an API endpoint `/api/dictionary` for the frontend to fetch word info.
- **Frontend Integration**:
    - Updated `app.js` to fetch and render dictionary definitions when a word is clicked.
    - Added loading states and error handling for dictionary lookups.

## 2026-05-09
- **UI Enhancements**:
    - Implemented word highlighting in book examples.
    - Added `highlightWord` utility in `app.js` to wrap occurrences of the selected word in `<mark>` tags.
    - Updated `style.css` with styles for the `.highlight` class to make the word stand out in context.
    - Added "Copy as HTML" button to the example list for each word.
    - Implemented `copyExamplesAsHtml` to copy formatted examples to the clipboard.
    - Modified clipboard HTML format to use `<b>` tags for highlighting, added an `<hr>` separator, and put examples into an itemized list (`<ul>`).

## 2026-05-12
- **Highlighting Improvements**:
- Updated `highlightWord` in `app.js` to mark the entire word if it contains the selected word as a substring (e.g., highlighting "thinking" when "think" is selected).

## 2026-05-10
- **Anki Integration**:
    - Integrated with AnkiConnect API to allow syncing with local Anki decks.
    - Added "Hide words already in Anki" feature to filter out known vocabulary.
    - Implemented automatic field detection for Anki notes (supports Front, Word, Text fields).
    - Added UI controls for deck selection and manual synchronization.
    - Implemented a status indicator for Anki connection state.

## 2026-05-07
- **Cambridge Image Support**:
    - Updated `server.py` to scrape dictionary illustrations (images) from Cambridge Dictionary.
    - Modified `app.js` to render images in the dictionary view.
    - Added styling for dictionary images in `style.css`.
    - Updated `agents.md` to reflect the new feature.

## 2026-05-13
- **Word Grouping & Lemmatization**:
    - Integrated NLTK (Natural Language Toolkit) into the Python backend for accurate lemmatization.
    - Implemented `POST /api/lemmatize` endpoint in `server.py` to group verb tenses and plurals.
    - Added "Group similar words" toggle to `index.html`.
    - Updated `app.js` to merge grouped words and their usage examples.
    - Enhanced `highlightWord` to support highlighting all variations of a grouped word in examples.
    - Updated `style.css` to display word variations in the UI.

## 2026-05-14
- **Global Example Search**:
    - Added "Search all examples" toggle to `index.html`.
    - Implemented logic in `app.js` to scan all contexts in the library for occurrences of each word.
    - Updated `filterAndRender` to dynamically augment word examples when the feature is enabled.
    - Added styling for the new control in `style.css`.

## 2026-05-15
- **Audio Download Support**:
    - Added download buttons for audio pronunciations in the dictionary view.
    - Implemented `downloadAudio` utility in `app.js` to handle file downloads via Blob API.
    - Updated `style.css` with styles for the new download button.
- **Manual Word Addition**:
    - Added "Add new word" input and button to `index.html`.
    - Implemented `POST /api/add_word` endpoint in `server.py` to update `library.json`.
    - Added frontend logic in `app.js` to handle word addition and UI updates.
    - Styled the new addition interface in `style.css`.

## 2026-05-25
- **Book Management**:
    - Added a book list view to manage (include/exclude) books from the vocabulary list and examples.
    - Implemented a toggle button with a list icon to switch between the word list and book management view.
    - Added persistence for excluded books using `localStorage`.
    - Updated `filterAndRender` to dynamically exclude words and examples from selected books.

## 2026-05-25
- **Library Persistence Fix**:
    - Implemented `/api/upload` endpoint in `server.py` to allow the frontend to save uploaded JSON files to the server.
    - Updated `app.js` to automatically upload manually selected library files to the server.
    - Modified `loadLibrary` to fetch the last used library file from the server on startup.
    - Updated `addWord` to specify the current library file when adding new words, ensuring they are saved to the correct file.

## 2026-05-16
- **Part of Speech Labels**:
    - Updated `app.js` to display part-of-speech labels (e.g., NOUN, VERB) in the dictionary view.
    - Enhanced `formatDefinitionHtml` to include part-of-speech information when copying definitions to the clipboard.
    - Updated `agents.md` to reflect the addition of part-of-speech information in the dictionary integration.
- **Merriam-Webster Support**:
- Implemented Merriam-Webster scraping in `server.py`.
- Added dictionary tabs to the UI in `index.html` and `style.css` to switch between Cambridge and Merriam-Webster.
- Updated `app.js` to handle dictionary switching and fetch data from the selected source.
- Updated `agents.md` to reflect multi-dictionary support.
- **UI Improvements**:
- Moved specialized labels (e.g., "specialized", "informal") above the definition text in the dictionary view and clipboard HTML for better readability.
- **Sorting**:
- Added "Newest First" and "Oldest First" sorting options based on the time of the last encounter (word modification time).

## 2026-05-27
- **Options Menu**:
    - Added an options button to the header that opens a modal with settings.
    - Implemented `/api/config` endpoint in `server.py` to serve settings from `config.toml`.
    - Added a dummy option "enable anki cards editor" to `config.toml`.
    - Styled the options modal and list in `style.css`.
    - Implemented `OptionsManager` in a separate [`options.js`](options.js) to handle fetching and displaying options.
    - Added server-side configuration validation using Pydantic with a dedicated [`config_schema.py`](config_schema.py).

## 2026-05-16
- **UI Enhancements**:
    - Added a word counter to the main panel that displays the number of entries currently shown versus the total number of entries in the library.
    - Implemented `updateCounter` in `app.js` to dynamically update the count whenever filters or search terms change.
    - Styled the counter with a clean, pill-shaped design in `style.css`.

## 2026-05-18
- **Search Optimization**:
    - Implemented a debounce mechanism for the search input in `app.js`.
    - Added a 300ms delay to prevent excessive filtering and rendering while the user is typing, improving performance and reducing lag.
- **Persistence & UX**:
    - Removed the manual "Load library.json" button.
    - Implemented auto-loading of the last used library file using `localStorage`.
    - Updated the UI to show a loading state during initial file fetch.
    - Added persistence for UI options (sorting, filters, dictionary selection) using `localStorage`.
    - Implemented automatic Anki synchronization on application startup.

## 2026-05-26
- **Audio Clipboard Integration**:
    - Replaced audio download buttons with "Copy to Clipboard" buttons.
    - Implemented `copyAudioToClipboard` in `app.js` to fetch audio via proxy and copy it as a binary Blob to the clipboard.
    - Updated `style.css` to reflect the change from download to copy functionality.
    - Updated `agents.md` to reflect the new audio handling feature.
