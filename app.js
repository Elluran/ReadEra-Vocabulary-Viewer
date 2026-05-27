let allWords = [];
let docMap = {};
let frequencyMap = {};
let ankiWords = new Set();

const fileInput = document.getElementById('fileInput');
const searchInput = document.getElementById('searchInput');
const sortSelect = document.getElementById('sortSelect');
const wordList = document.getElementById('wordList');
const dictionaryView = document.getElementById('dictionaryView');
const hideAnkiToggle = document.getElementById('hideAnkiToggle');
const syncAnkiBtn = document.getElementById('syncAnkiBtn');
const ankiStatus = document.getElementById('ankiStatus');
const groupWordsToggle = document.getElementById('groupWordsToggle');
const searchAllExamplesToggle = document.getElementById('searchAllExamplesToggle');
const addWordInput = document.getElementById('addWordInput');
const addWordBtn = document.getElementById('addWordBtn');
const dictTabs = document.querySelectorAll('.dict-tab');
const wordCounter = document.getElementById('wordCounter');
const toggleBookListBtn = document.getElementById('toggleBookListBtn');

// Anki Card Mode Elements
const ankiCardMode = document.getElementById('ankiCardMode');
const ankiCardPreview = document.getElementById('ankiCardPreview');
const activeWordContainer = document.getElementById('activeWordContainer');
const deckSelect = document.getElementById('deckSelect');
const addCardBtn = document.getElementById('addCardBtn');
const cancelAnkiBtn = document.getElementById('cancelAnkiBtn');
const previewName = document.getElementById('previewName');
const previewContext = document.getElementById('previewContext');
const previewBack = document.getElementById('previewBack');

let lemmaMap = {}; // original_word -> lemma
let currentWord = null;
let currentDictionary = 'cambridge';
let dictionaryCache = {}; // word -> { cambridge: data, merriam: data }
let searchTimeout = null;
let excludedBooks = new Set();
let isBookListView = false;
let searchExcludedBooks = false;
let isAnkiMode = false;
let currentCardData = {
    name: '',
    context: '',
    back: '',
    definitions: [],
    bookExamples: []
};

fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = async (event) => {
        try {
            const data = JSON.parse(event.target.result);
            
            // Upload to server so it can be fetched later
            const response = await fetch('/api/upload', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ filename: file.name, content: data })
            });

            if (!response.ok) throw new Error('Failed to upload library to server');

            localStorage.setItem('lastLibraryFile', file.name);
            processData(data);
        } catch (err) {
            alert('Error processing JSON: ' + err.message);
        }
    };
    reader.readAsText(file);
});

async function loadLibrary(filename) {
    try {
        const response = await fetch(filename);
        if (!response.ok) throw new Error(`Failed to fetch ${filename}`);
        const data = await response.json();
        localStorage.setItem('lastLibraryFile', filename);
        processData(data);
    } catch (err) {
        console.error(`Error loading ${filename}:`, err);
        wordList.innerHTML = `<p class="message">Error loading ${filename}. Please select a file manually.</p>`;
    }
}

searchInput.addEventListener('input', (e) => {
    if (searchTimeout) {
        clearTimeout(searchTimeout);
    }
    searchTimeout = setTimeout(() => {
        filterAndRender();
    }, 300); // Wait 300ms after last input
});

sortSelect.addEventListener('change', (e) => {
    localStorage.setItem('sortOption', sortSelect.value);
    sortWords();
    filterAndRender();
});

hideAnkiToggle.addEventListener('change', () => {
    localStorage.setItem('hideAnki', hideAnkiToggle.checked);
    filterAndRender();
});

groupWordsToggle.addEventListener('change', async () => {
    localStorage.setItem('groupWords', groupWordsToggle.checked);
    if (groupWordsToggle.checked && Object.keys(lemmaMap).length === 0) {
        await fetchLemmas();
    }
    filterAndRender();
});

searchAllExamplesToggle.addEventListener('change', () => {
    localStorage.setItem('searchAllExamples', searchAllExamplesToggle.checked);
    filterAndRender();
});

syncAnkiBtn.addEventListener('click', async () => {
    await syncWithAnki();
});

addWordBtn.addEventListener('click', async () => {
    const word = addWordInput.value.trim();
    if (!word) return;

    try {
        const response = await fetch('/api/add_word', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                word,
                library: localStorage.getItem('lastLibraryFile') || 'library.json'
            })
        });

        if (!response.ok) throw new Error('Failed to add word');
        
        const result = await response.json();
        if (result.status === 'success') {
            allWords.push(result.word);
            addWordInput.value = '';
            filterAndRender();
            // Automatically show definition for the new word
            currentWord = result.word.data.word_key;
            fetchDefinition(currentWord);
        } else if (result.status === 'exists') {
            alert('Word already exists in library');
            // Still show definition if it exists
            currentWord = word;
            fetchDefinition(currentWord);
        }
    } catch (err) {
        alert('Error adding word: ' + err.message);
    }
});

addWordInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        addWordBtn.click();
    }
});

dictTabs.forEach(tab => {
    tab.addEventListener('click', () => {
        if (tab.classList.contains('active')) return;
        
        dictTabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        currentDictionary = tab.dataset.dict;
        localStorage.setItem('currentDictionary', currentDictionary);
        
        if (currentWord) {
            renderCurrentDefinition();
        }
    });
});

toggleBookListBtn.addEventListener('click', () => {
    isBookListView = !isBookListView;
    toggleBookListBtn.classList.toggle('active', isBookListView);
    filterAndRender();
});

addCardBtn.addEventListener('click', async () => {
    await addCardToAnki();
});

cancelAnkiBtn.addEventListener('click', () => {
    exitAnkiMode();
});

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isAnkiMode) {
        exitAnkiMode();
    }
});

async function invokeAnki(action, params = {}) {
    try {
        const response = await fetch('http://localhost:8765', {
            method: 'POST',
            body: JSON.stringify({ action, version: 6, params })
        });
        const result = await response.json();
        if (result.error) throw new Error(result.error);
        return result.result;
    } catch (err) {
        console.error('AnkiConnect error:', err);
        throw err;
    }
}

async function syncWithAnki() {
    syncAnkiBtn.disabled = true;
    syncAnkiBtn.innerText = 'Syncing...';
    ankiStatus.className = 'status-dot';
    ankiStatus.title = 'Connecting...';

    try {
        // Check if AnkiConnect is available
        await invokeAnki('version');
        
        // Find notes in all decks
        const query = `deck:*`;
        const noteIds = await invokeAnki('findNotes', { query });
        const notes = await invokeAnki('notesInfo', { notes: noteIds });
        
        ankiWords = new Set();
        notes.forEach(note => {
            // Try common field names for the word
            const wordField = note.fields.Front || note.fields.Word || note.fields.Text || Object.values(note.fields)[0];
            if (wordField && wordField.value) {
                // Strip HTML tags if any
                const cleanWord = wordField.value.replace(/<[^>]*>/g, '').trim().toLowerCase();
                ankiWords.add(cleanWord);
            }
        });

        ankiStatus.className = 'status-dot online';
        ankiStatus.title = `Connected. Found ${ankiWords.size} words in all decks`;
        console.log(`Synced ${ankiWords.size} words from all Anki decks`);
        
        // Fetch decks for the selector
        const decks = await invokeAnki('deckNames');
        const currentDeck = localStorage.getItem('selectedAnkiDeck');
        deckSelect.innerHTML = decks.map(deck => 
            `<option value="${deck}" ${deck === currentDeck ? 'selected' : ''}>${deck}</option>`
        ).join('');
        
        deckSelect.addEventListener('change', () => {
            localStorage.setItem('selectedAnkiDeck', deckSelect.value);
        });

        if (hideAnkiToggle.checked) {
            filterAndRender();
        }
    } catch (err) {
        ankiStatus.className = 'status-dot offline';
        ankiStatus.title = 'Connection failed. Make sure Anki is running and AnkiConnect is installed.';
        console.warn('Failed to sync with Anki:', err.message);
    } finally {
        syncAnkiBtn.disabled = false;
        syncAnkiBtn.innerText = 'Sync Anki';
    }
}

function filterAndRender() {
    if (isBookListView) {
        renderBookList();
        return;
    }

    const term = searchInput.value.toLowerCase();
    const hideAnki = hideAnkiToggle.checked;
    const groupWords = groupWordsToggle.checked;
    const searchAll = searchAllExamplesToggle.checked;

    // 1. Initial copy and basic book filtering for examples
    let processedWords = allWords.map(w => ({
        ...w,
        ctxs: w.ctxs.filter(ctx => !excludedBooks.has(ctx.doc_uri))
    }));

    // 2. Global Example Search (if enabled)
    if (searchAll) {
        // Collect all unique contexts from all words
        const allContexts = [];
        const seenContexts = new Set();
        allWords.forEach(w => {
            w.ctxs.forEach(ctx => {
                const isExcluded = excludedBooks.has(ctx.doc_uri);
                if ((!isExcluded || searchExcludedBooks) && !seenContexts.has(ctx.ctx_title)) {
                    allContexts.push(ctx);
                    seenContexts.add(ctx.ctx_title);
                }
            });
        });

        // For each word, find all contexts that contain it
        processedWords.forEach(w => {
            const wordKey = (w.data.word_key || "").toLowerCase();
            const variations = w.variations ? Array.from(w.variations) : [wordKey];
            
            allContexts.forEach(ctx => {
                const text = ctx.ctx_title.toLowerCase();
                const matches = variations.some(v => {
                    const escaped = v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                    const regex = new RegExp(`\\b${escaped}\\b`, 'i');
                    return regex.test(text);
                });

                if (matches) {
                    if (!w.ctxs.some(c => c.ctx_title === ctx.ctx_title)) {
                        w.ctxs.push(ctx);
                    }
                }
            });
        });
    }

    // 3. Filter out words that are from excluded books
    processedWords = processedWords.filter(w =>
        !w.data.doc_uri || !excludedBooks.has(w.data.doc_uri)
    );

    if (groupWords && Object.keys(lemmaMap).length > 0) {
        const groups = {};
        processedWords.forEach(w => {
            const wordKey = (w.data.word_key || "").toLowerCase();
            const lemma = lemmaMap[wordKey] || wordKey;
            
            if (!groups[lemma]) {
                groups[lemma] = {
                    data: { ...w.data, word_key: lemma },
                    ctxs: [...w.ctxs],
                    variations: new Set([wordKey])
                };
            } else {
                // Merge contexts
                w.ctxs.forEach(ctx => {
                    if (!groups[lemma].ctxs.some(c => c.ctx_title === ctx.ctx_title)) {
                        groups[lemma].ctxs.push(ctx);
                    }
                });
                groups[lemma].variations.add(wordKey);
            }
        });
        processedWords = Object.values(groups);
    }

    sortWords(processedWords);

    const filtered = processedWords.filter(w => {
        const wordKey = (w.data.word_key || "").toLowerCase();
        const variations = Array.from(w.variations || [wordKey]);
        
        // Search filter
        const matchesSearch = wordKey.includes(term) ||
            variations.some(v => v.includes(term)) ||
            w.ctxs.some(ctx => ctx.ctx_title.toLowerCase().includes(term));
        
        if (!matchesSearch) return false;

        // Anki filter
        if (hideAnki) {
            if (ankiWords.has(wordKey)) return false;
            if (w.variations && Array.from(w.variations).every(v => ankiWords.has(v))) return false;
        }

        return true;
    });
    renderWords(filtered);
    updateCounter(filtered.length, processedWords.length);
    
    if (isAnkiMode) {
        document.body.classList.add('anki-mode-on');
        ankiCardMode.style.display = 'block';
        ankiCardPreview.style.display = 'block';
    } else {
        document.body.classList.remove('anki-mode-on');
        ankiCardMode.style.display = 'none';
        ankiCardPreview.style.display = 'none';
    }
}

function updateCounter(filteredCount, totalCount) {
    if (!wordCounter) return;
    if (filteredCount === totalCount) {
        wordCounter.innerText = `Showing all ${totalCount} entries`;
    } else {
        wordCounter.innerText = `Showing ${filteredCount} of ${totalCount} entries`;
    }
}

function sortWords(words = allWords) {
    const sortBy = sortSelect.value;
    words.sort((a, b) => {
        if (sortBy === 'alphabetical') {
            const wordA = (a.data.word_key || "").toLowerCase();
            const wordB = (b.data.word_key || "").toLowerCase();
            return wordA.localeCompare(wordB);
        } else if (sortBy === 'frequency_desc') {
            const rankA = frequencyMap[(a.data.word_key || "").toLowerCase()] || 99999;
            const rankB = frequencyMap[(b.data.word_key || "").toLowerCase()] || 99999;
            return rankA - rankB;
        } else if (sortBy === 'frequency_asc') {
            const rankA = frequencyMap[(a.data.word_key || "").toLowerCase()] || 99999;
            const rankB = frequencyMap[(b.data.word_key || "").toLowerCase()] || 99999;
            return rankB - rankA;
        } else if (sortBy === 'examples') {
            return (b.ctxs?.length || 0) - (a.ctxs?.length || 0);
        } else if (sortBy === 'ratio') {
            const getRatio = (word) => {
                try {
                    // Try to get ratio from the first context's position
                    if (word.ctxs && word.ctxs.length > 0) {
                        const pos = JSON.parse(word.ctxs[0].ctx_position);
                        return pos.ratio || 0;
                    }
                } catch (e) {}
                return 0;
            };
            return getRatio(a) - getRatio(b);
        } else if (sortBy === 'date_desc') {
            const timeA = a.data.word_modified_time || a.data.word_insert_time || 0;
            const timeB = b.data.word_modified_time || b.data.word_insert_time || 0;
            return timeB - timeA;
        } else if (sortBy === 'date_asc') {
            const timeA = a.data.word_modified_time || a.data.word_insert_time || 0;
            const timeB = b.data.word_modified_time || b.data.word_insert_time || 0;
            return timeA - timeB;
        }
        return 0;
    });
}

async function fetchLemmas() {
    const words = allWords.map(w => (w.data.word_key || "").toLowerCase());
    if (words.length === 0) return;

    try {
        const response = await fetch('/api/lemmatize', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ words })
        });
        if (!response.ok) throw new Error('Failed to fetch lemmas');
        lemmaMap = await response.json();
    } catch (err) {
        console.error('Lemmatization error:', err);
    }
}

async function processData(data) {
    if (!data.words || !data.docs) {
        alert('Invalid ReadEra backup format');
        return;
    }

    // Create a map for quick document lookup
    docMap = {};
    data.docs.forEach(doc => {
        docMap[doc.uri] = doc.data.doc_title || doc.data.doc_file_name_title || 'Unknown Book';
    });

    // Load excluded books from localStorage
    const savedExcluded = localStorage.getItem('excludedBooks');
    if (savedExcluded) {
        excludedBooks = new Set(JSON.parse(savedExcluded));
    }

    allWords = data.words;
    lemmaMap = {}; // Reset lemmas for new data
    
    if (groupWordsToggle.checked) {
        await fetchLemmas();
    }
    
    sortWords();
    filterAndRender();
}

function highlightWord(text, words) {
    if (!words) return text;
    const wordList = Array.isArray(words) ? words : [words];
    if (wordList.length === 0) return text;

    // Sort by length descending to match longer variations first
    const sortedWords = [...wordList].sort((a, b) => b.length - a.length);
    const escapedWords = sortedWords.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    const pattern = escapedWords.join('|');

    // Match the whole word containing any of the variations, case-insensitive
    const regex = new RegExp(`(\\b\\w*(?:${pattern})\\w*\\b)`, 'gi');
    return text.replace(regex, '<mark class="highlight">$1</mark>');
}

function updateCounter(filteredCount, totalCount) {
    if (!wordCounter) return;
    if (totalCount === 0) {
        wordCounter.innerText = '';
        return;
    }
    if (filteredCount === totalCount) {
        wordCounter.innerText = `Showing all ${totalCount} entries`;
    } else {
        wordCounter.innerText = `Showing ${filteredCount} of ${totalCount} entries`;
    }
}

function renderWords(words) {
    if (words.length === 0) {
        wordList.innerHTML = '<p class="message">No words found.</p>';
        return;
    }

    wordList.innerHTML = '';
    words.forEach(word => {
        const wordDiv = document.createElement('div');
        wordDiv.className = 'word-item' + (currentWord === word.data.word_key ? ' active' : '');
        wordDiv.dataset.word = word.data.word_key;

        const bookTitle = docMap[word.data.doc_uri] || 'Unknown Book';
        const wordKey = word.data.word_key;
        const variations = word.variations ? Array.from(word.variations).filter(v => v !== wordKey) : [];
        const allVariations = word.variations ? Array.from(word.variations) : [wordKey];

        let examplesHtml = '';
        if (word.ctxs && word.ctxs.length > 0) {
            examplesHtml = `
                <details class="example-spoiler" ${isAnkiMode ? 'open' : ''}>
                    <summary>Show Examples (${word.ctxs.length})</summary>
                    <div class="example-list-container">
                        <button class="copy-examples-btn" onclick="event.stopPropagation(); copyExamplesAsHtml(this, '${wordKey.replace(/'/g, "\\'")}')">
                            Copy
                        </button>
                        <div class="example-list">
                            ${word.ctxs.map((ctx, idx) => `
                                <div class="example-item">
                                    ${highlightWord(ctx.ctx_title, allVariations)}
                                    <div class="example-actions anki-only">
                                        <button class="ex-action-btn" onclick="event.stopPropagation(); addExampleToField('${wordKey.replace(/'/g, "\\'")}', ${idx}, 'context')">context</button>
                                        <button class="ex-action-btn" onclick="event.stopPropagation(); addExampleToField('${wordKey.replace(/'/g, "\\'")}', ${idx}, 'back')">back</button>
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                </details>
            `;
        }

        wordDiv.innerHTML = `
            <div class="word-header">
                <div class="word-title-group">
                    <h2 class="word-title">
                        ${word.data.word_key}
                        ${variations.length > 0 ? `<span class="variations">(${variations.join(', ')})</span>` : ''}
                    </h2>
                    <button class="make-card-btn" onclick="event.stopPropagation(); enterAnkiMode('${wordKey.replace(/'/g, "\\'")}')">make a card</button>
                </div>
                <span class="book-title">${bookTitle}</span>
            </div>
            ${examplesHtml}
        `;
        wordDiv.addEventListener('click', () => {
            if (currentWord === word.data.word_key) return;
            
            // Update active state in UI
            document.querySelectorAll('.word-item.active').forEach(el => el.classList.remove('active'));
            wordDiv.classList.add('active');
            
            currentWord = word.data.word_key;
            fetchDefinition(currentWord);
        });
        wordList.appendChild(wordDiv);
    });
}

function renderBookList() {
    wordList.innerHTML = `
        <div class="book-list-view">
            <div class="book-list-header">
                <h2>Manage Books</h2>
                <label class="search-excluded-toggle">
                    <input type="checkbox" id="searchExcludedToggle"> Search examples in excluded books
                </label>
            </div>
            <div id="bookItemsContainer"></div>
        </div>
    `;

    const searchExcludedToggle = document.getElementById('searchExcludedToggle');
    searchExcludedToggle.checked = searchExcludedBooks;
    searchExcludedToggle.addEventListener('change', () => {
        searchExcludedBooks = searchExcludedToggle.checked;
        localStorage.setItem('searchExcludedBooks', searchExcludedBooks);
        filterAndRender();
    });
    
    const container = document.getElementById('bookItemsContainer');
    const sortedDocs = Object.entries(docMap).sort((a, b) => a[1].localeCompare(b[1]));
    
    sortedDocs.forEach(([uri, title]) => {
        const bookDiv = document.createElement('div');
        bookDiv.className = 'book-item';
        
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.id = `book-${uri}`;
        checkbox.checked = !excludedBooks.has(uri);
        
        checkbox.addEventListener('change', () => {
            if (checkbox.checked) {
                excludedBooks.delete(uri);
            } else {
                excludedBooks.add(uri);
            }
            localStorage.setItem('excludedBooks', JSON.stringify(Array.from(excludedBooks)));
            filterAndRender();
        });
        
        const label = document.createElement('label');
        label.htmlFor = `book-${uri}`;
        label.innerText = title;
        
        bookDiv.appendChild(checkbox);
        bookDiv.appendChild(label);
        container.appendChild(bookDiv);
    });

    if (wordCounter) {
        wordCounter.innerText = `Managing ${sortedDocs.length} books`;
    }
}


function renderDefinition(data) {
    if (data.error) {
        dictionaryView.innerHTML = `<div class="dictionary-placeholder"><p>${data.error}</p></div>`;
        return;
    }

    let html = `
        <div class="dict-header">
            <h2>${data.word}</h2>
            ${data.definitions && data.definitions.length > 1 ? `
                <button class="copy-all-btn" onclick="copyAllDefinitionsAsHtml(this)">
                    Copy All
                </button>
            ` : ''}
        </div>
    `;

    if (data.pronunciations && data.pronunciations.length > 0) {
        html += `<div class="pron-container">`;
        data.pronunciations.forEach(pron => {
            const ipaEscaped = (pron.ipa || "").replace(/'/g, "\\'");
            html += `
                <div class="pron-item">
                    <span class="pron-region">${pron.region}</span>
                    ${pron.ipa ? `<span class="pron-ipa" onclick="copyToClipboard('${ipaEscaped}', this)" title="Click to copy">${pron.ipa}</span>` : ''}
                    <div class="pron-actions">
                        ${pron.audio ? `
                            <button class="audio-btn" onclick="new Audio('${pron.audio}').play()" title="Play audio">
                                <svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M14,3.23V5.29C16.89,6.15 19,8.83 19,12C19,15.17 16.89,17.85 14,18.71V20.77C18,19.86 21,16.28 21,12C21,7.72 18,4.14 14,3.23M16.5,12C16.5,10.23 15.5,8.71 14,7.97V16.04C15.5,15.29 16.5,13.77 16.5,12M3,9V15H7L12,20V4L7,9H3Z"/></svg>
                            </button>
                            <button class="copy-audio-btn" onclick="copyAudioToClipboard('${pron.audio}', this)" title="Copy audio to clipboard">
                                <svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M21,3V15.5A3.5,3.5 0 0,1 17.5,19A3.5,3.5 0 0,1 14,15.5A3.5,3.5 0 0,1 17.5,12C18.04,12 18.55,12.12 19,12.34V6.47L9,8.6V17.5A3.5,3.5 0 0,1 5.5,21A3.5,3.5 0 0,1 2,17.5A3.5,3.5 0 0,1 5.5,14C6.04,14 6.55,14.12 7,14.34V4L21,1V3Z"/></svg>
                            </button>
                        ` : ''}
                        ${pron.ipa ? `
                        <button class="copy-btn" onclick="copyToClipboard('${ipaEscaped}', this)" title="Copy IPA">
                            <svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M19,21H8V7H19M19,5H8A2,2 0 0,0 6,7V21A2,2 0 0,0 8,23H19A2,2 0 0,0 21,21V7A2,2 0 0,0 19,5M16,1H4A2,2 0 0,0 2,3V17H4V3H16V1Z"/></svg>
                        </button>
                        ` : ''}
                    </div>
                </div>
            `;
        });
        html += `</div>`;
    }
    
    if (data.definitions && data.definitions.length > 0) {
        if (currentDictionary === 'merriam') {
            html += `<hr class="dict-separator">`;
        }
        data.definitions.forEach((entry, index) => {
            html += `
                <div class="dict-entry" data-index="${index}">
                    <div class="dict-entry-header">
                        <div class="dict-def">
                            <div class="dict-labels">
                                <span class="dict-pos-label">${entry.part_of_speech}</span>
                                ${entry.labels && entry.labels.length > 0 ?
                                    entry.labels.map(label => `<span class="dict-label">${label}</span>`).join('')
                                    : ''}
                            </div>
                            <div class="dict-description">${entry.description}</div>
                        </div>
                        <button class="copy-def-btn" onclick="copyDefinitionAsHtml(this, ${index})">
                            Copy
                        </button>
                        <button class="add-to-card-btn anki-only" onclick="addDefinitionToCard(${index})">
                            add
                        </button>
                    </div>
                    ${entry.images && entry.images.length > 0 ? `
                        <div class="dict-images">
                            ${entry.images.map(img => `<img src="${img}" class="dict-img" loading="lazy" onclick="window.open('${img}', '_blank')">`).join('')}
                        </div>
                    ` : ''}
                    ${entry.examples.map(ex => `<div class="dict-eg">${ex}</div>`).join('')}
                </div>
            `;
        });
    } else {
        html += `<p>No definitions found.</p>`;
    }
    
    dictionaryView.innerHTML = html;
}

async function copyAudioToClipboard(url, btn) {
    try {
        const proxyUrl = `/api/proxy_audio?url=${encodeURIComponent(url)}`;
        const response = await fetch(proxyUrl);
        if (!response.ok) throw new Error('Failed to fetch audio');
        let blob = await response.blob();
        
        // The Async Clipboard API (navigator.clipboard.write) has very limited support for MIME types.
        // Most browsers only support text/plain, text/html, and image/png.
        // However, some browsers allow other types if they are explicitly enabled or in specific environments.
        // For audio, we'll try to copy it as its native type.
        
        // If the blob is audio/mpeg, we try to copy it.
        // Note: Chrome currently (as of 2024) still has limited support for non-standard types in ClipboardItem.
        try {
            const data = [new ClipboardItem({
                [blob.type]: blob
            })];
            await navigator.clipboard.write(data);
        } catch (e) {
            // Fallback for browsers (like Chrome) that don't support audio types in ClipboardItem.
            // For Anki users, we can try to use AnkiConnect to store the media file directly,
            // and then copy the [sound:...] tag to the clipboard.
            try {
                const absoluteUrl = url.startsWith('http') ? url : new URL(url, window.location.href).href;
                const filename = 'readera_' + absoluteUrl.split('/').pop().replace(/[^a-zA-Z0-9.-]/g, '_');
                
                // Try to store the file in Anki via AnkiConnect
                await invokeAnki('storeMediaFile', {
                    filename: filename,
                    url: absoluteUrl
                });
                
                // If successful, copy the Anki sound tag to the clipboard
                const soundTag = `[sound:${filename}]`;
                await navigator.clipboard.writeText(soundTag);
            } catch (ankiError) {
                // If AnkiConnect fails or is not available, fallback to copying the URL
                console.warn('AnkiConnect media storage failed, falling back to URL:', ankiError);
                const absoluteUrl = url.startsWith('http') ? url : new URL(url, window.location.href).href;
                const html = `<a href="${absoluteUrl}">${absoluteUrl}</a>`;
                const blobHtml = new Blob([html], { type: 'text/html' });
                const blobText = new Blob([absoluteUrl], { type: 'text/plain' });
                
                const fallbackData = [new ClipboardItem({
                    'text/html': blobHtml,
                    'text/plain': blobText
                })];
                await navigator.clipboard.write(fallbackData);
            }
        }
        
        const originalTitle = btn.title;
        btn.title = "Copied!";
        btn.classList.add('copied');
        
        setTimeout(() => {
            btn.title = originalTitle;
            btn.classList.remove('copied');
        }, 1000);
    } catch (err) {
        console.error('Failed to copy audio: ', err);
        alert('Failed to copy audio to clipboard');
    }
}

async function copyToClipboard(text, el) {
    try {
        await navigator.clipboard.writeText(text);
        const originalTitle = el.title || "";
        const originalText = el.innerText;
        
        if (el.tagName === 'BUTTON' && el.innerText.trim() !== "") {
            el.innerText = "Copied!";
        } else {
            el.title = "Copied!";
        }
        
        el.classList.add('copied');
        setTimeout(() => {
            if (el.tagName === 'BUTTON' && el.innerText.trim() !== "") {
                el.innerText = originalText;
            } else {
                el.title = originalTitle;
            }
            el.classList.remove('copied');
        }, 1000);
    } catch (err) {
        console.error('Failed to copy: ', err);
    }
}

async function copyExamplesAsHtml(btn, word) {
    const exampleList = btn.nextElementSibling;
    if (!exampleList) return;
    
    // Create a clean HTML version of the examples
    // Replace <mark class="highlight">...</mark> with <b>...</b> for the clipboard
    const items = Array.from(exampleList.querySelectorAll('.example-item'))
        .map(item => {
            let content = item.innerHTML;
            content = content.replace(/<mark class="highlight">(.*?)<\/mark>/gi, '<b>$1</b>');
            return `<li style="text-align: left;">${content}</li>`;
        })
        .join('\n');
    
    const html = `<hr>\n<ul style="text-align: left;">\n${items}\n</ul>`;
    
    await copyToClipboard(html, btn);
}

let lastFetchedData = null;

async function fetchDefinition(word) {
    currentWord = word;
    dictionaryView.innerHTML = `<div class="dictionary-placeholder"><p>Loading definitions for "${word}"...</p></div>`;
    
    if (!dictionaryCache[word]) {
        dictionaryCache[word] = { cambridge: null, merriam: null };
    }

    const fetchDict = async (dict) => {
        try {
            const response = await fetch(`/api/dictionary?word=${encodeURIComponent(word)}&dict=${dict}`);
            if (!response.ok) throw new Error(`Failed to fetch ${dict} definition`);
            const data = await response.json();
            dictionaryCache[word][dict] = data;
            if (currentWord === word && currentDictionary === dict) {
                renderCurrentDefinition();
            }
        } catch (err) {
            console.error(`Error fetching ${dict}:`, err);
            dictionaryCache[word][dict] = { error: err.message };
            if (currentWord === word && currentDictionary === dict) {
                renderCurrentDefinition();
            }
        }
    };

    // Fetch both in parallel
    await Promise.all([
        fetchDict('cambridge'),
        fetchDict('merriam')
    ]);
}

function renderCurrentDefinition() {
    if (!currentWord || !dictionaryCache[currentWord]) return;
    
    const data = dictionaryCache[currentWord][currentDictionary];
    if (data) {
        lastFetchedData = data;
        renderDefinition(data);
        
        // If in Anki mode and back is empty, auto-populate transcription/audio
        if (isAnkiMode && !currentCardData.back) {
            populateAnkiBack(data);
        }
    } else {
        dictionaryView.innerHTML = `<div class="dictionary-placeholder"><p>Loading ${currentDictionary === 'cambridge' ? 'Cambridge' : 'Merriam-Webster'} definition for "${currentWord}"...</p></div>`;
    }
}

function populateAnkiBack(data) {
    const ukPron = data.pronunciations.find(p => p.region === 'UK') || data.pronunciations[0];
    if (ukPron) {
        let backContent = '';
        if (ukPron.ipa) backContent += `/${ukPron.ipa}/ `;
        if (ukPron.audio) {
            const filename = 'readera_' + ukPron.audio.split('/').pop().replace(/[^a-zA-Z0-9.-]/g, '_');
            backContent += `[sound:${filename}]`;
            // Pre-store audio in Anki
            invokeAnki('storeMediaFile', {
                filename: filename,
                url: ukPron.audio
            }).catch(console.error);
        }
        currentCardData.back = backContent;
        updatePreview();
    }
}

function formatDefinitionHtml(entry) {
    const posHtml = entry.part_of_speech && entry.part_of_speech !== 'NOT SPECIFIED'
        ? `<b style="color: #2980b9;">${entry.part_of_speech.toLowerCase()}</b> `
        : '';
    const labelsHtml = entry.labels && entry.labels.length > 0
        ? `<i style="color: #666;">(${entry.labels.join(', ')})</i> `
        : '';
    const examples = entry.examples.map(ex => `<li style="text-align: left;">${ex}</li>`).join('\n');
    return `<div>\n<div style="text-align: left;">${posHtml}${labelsHtml}<b>${entry.description}</b></div>\n<ul style="text-align: left;">\n${examples}\n</ul>\n</div>`;
}

async function copyDefinitionAsHtml(btn, index) {
    if (!lastFetchedData || !lastFetchedData.definitions[index]) return;
    const entry = lastFetchedData.definitions[index];
    const html = formatDefinitionHtml(entry);
    await copyToClipboard(html, btn);
}

async function copyAllDefinitionsAsHtml(btn) {
    if (!lastFetchedData || !lastFetchedData.definitions) return;
    const html = lastFetchedData.definitions
        .map(entry => formatDefinitionHtml(entry))
        .join('\n\n');
    await copyToClipboard(html, btn);
}

function enterAnkiMode(wordKey) {
    isAnkiMode = true;
    currentWord = wordKey;
    currentCardData = {
        name: wordKey,
        context: '',
        back: '',
        definitions: [],
        bookExamples: []
    };
    
    // Auto-add transcription and audio if available
    if (lastFetchedData && lastFetchedData.word.toLowerCase() === wordKey.toLowerCase()) {
        populateAnkiBack(lastFetchedData);
    }

    updatePreview();
    filterAndRender();
    
    // Move the active word element to the right column
    const activeWordEl = document.querySelector(`.word-item[data-word="${wordKey.replace(/'/g, "\\'")}"]`);
    if (activeWordEl) {
        activeWordContainer.innerHTML = '';
        const clone = activeWordEl.cloneNode(true);
        activeWordContainer.appendChild(clone);
    }

    fetchDefinition(wordKey);
    
    // Scroll to top
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function exitAnkiMode() {
    isAnkiMode = false;
    currentCardData = { name: '', context: '', back: '', definitions: [], bookExamples: [] };
    activeWordContainer.innerHTML = '';
    updatePreview();
    filterAndRender();
}

function updatePreview() {
    previewName.innerHTML = currentCardData.name;
    previewContext.innerHTML = currentCardData.context;
    
    // Combine definitions and book examples, ensuring examples are at the bottom
    let backHtml = currentCardData.back; // This contains transcription/audio
    if (currentCardData.definitions.length > 0) {
        if (backHtml) backHtml += '\n';
        backHtml += currentCardData.definitions.join('\n');
    }
    if (currentCardData.bookExamples.length > 0) {
        backHtml += '<hr>\n<ul style="text-align: left;">\n';
        backHtml += currentCardData.bookExamples.map(ex => `<li>${ex}</li>`).join('\n');
        backHtml += '\n</ul>';
    }
    
    previewBack.innerHTML = backHtml;
}

function addDefinitionToCard(index) {
    if (!lastFetchedData || !lastFetchedData.definitions[index]) return;
    const entry = lastFetchedData.definitions[index];
    const html = formatDefinitionHtml(entry);
    
    if (currentCardData.definitions.includes(html)) return;
    
    currentCardData.definitions.push(html);
    updatePreview();
}

function addExampleToField(wordKey, exampleIdx, field) {
    const word = allWords.find(w => w.data.word_key === wordKey);
    if (!word || !word.ctxs[exampleIdx]) return;
    
    let example = word.ctxs[exampleIdx].ctx_title;
    // Highlight word in example
    const variations = word.variations ? Array.from(word.variations) : [wordKey];
    example = highlightWord(example, variations).replace(/<mark class="highlight">(.*?)<\/mark>/gi, '<b>$1</b>');

    if (field === 'context') {
        currentCardData.context = example;
    } else if (field === 'back') {
        if (currentCardData.bookExamples.includes(example)) return;
        currentCardData.bookExamples.push(example);
    }
    updatePreview();
}

async function addCardToAnki() {
    const deckName = deckSelect.value;
    if (!deckName) {
        alert('Please select a deck');
        return;
    }

    const note = {
        deckName: deckName,
        modelName: "Basic",
        fields: {
            "Name": currentCardData.name,
            "Сontext": currentCardData.context,
            "Back": previewBack.innerHTML
        },
        options: {
            allowDuplicate: true
        },
        tags: ["readera"]
    };

    try {
        const models = await invokeAnki('modelNames');
        let modelName = models.find(m => m === "ReadEra") || models[0];
        note.modelName = modelName;

        await invokeAnki('addNote', { note });
        alert('Card added successfully!');
        exitAnkiMode();
    } catch (err) {
        console.error('Failed to add card:', err);
        alert('Failed to add card: ' + err.message + '\nMake sure you have a model with fields: Name, Сontext, Back');
    }
}

// Load frequency data on startup
async function loadFrequencyData() {
    try {
        const response = await fetch('frequency.json');
        if (response.ok) {
            frequencyMap = await response.json();
            console.log('Frequency data loaded');
        }
    } catch (err) {
        console.warn('Could not load frequency data:', err);
    }
}

async function init() {
    // Load saved options
    const savedSort = localStorage.getItem('sortOption');
    if (savedSort) sortSelect.value = savedSort;

    const savedHideAnki = localStorage.getItem('hideAnki');
    if (savedHideAnki !== null) hideAnkiToggle.checked = savedHideAnki === 'true';

    const savedGroupWords = localStorage.getItem('groupWords');
    if (savedGroupWords !== null) groupWordsToggle.checked = savedGroupWords === 'true';

    const savedSearchAll = localStorage.getItem('searchAllExamples');
    if (savedSearchAll !== null) searchAllExamplesToggle.checked = savedSearchAll === 'true';

    const savedSearchExcluded = localStorage.getItem('searchExcludedBooks');
    if (savedSearchExcluded !== null) searchExcludedBooks = savedSearchExcluded === 'true';

    const savedDict = localStorage.getItem('currentDictionary');
    if (savedDict) {
        currentDictionary = savedDict;
        dictTabs.forEach(tab => {
            tab.classList.toggle('active', tab.dataset.dict === currentDictionary);
        });
    }

    await loadFrequencyData();
    
    const lastFile = localStorage.getItem('lastLibraryFile') || 'library.json';
    
    // Load library and sync with Anki in parallel
    await Promise.all([
        loadLibrary(lastFile),
        syncWithAnki()
    ]);
}

init();
