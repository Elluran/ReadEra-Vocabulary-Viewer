const Renderer = {
    highlightWord(text, words) {
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
    },

    updateCounter(filteredCount, totalCount) {
        const wordCounter = document.getElementById('wordCounter');
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
    },

    renderWords(words, options = {}) {
        const { currentWord, docMap, onWordClick } = options;
        const wordList = document.getElementById('wordList');
        if (!wordList) return;

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
                    <details class="example-spoiler" ${(window.ankiEditor && window.ankiEditor.isAnkiMode) ? 'open' : ''}>
                        <summary>Show Examples (${word.ctxs.length})</summary>
                        <div class="example-list-container">
                            <button class="copy-examples-btn" onclick="event.stopPropagation(); copyExamplesAsHtml(this, '${wordKey.replace(/'/g, "\\'")}')">
                                Copy
                            </button>
                            <div class="example-list">
                                ${word.ctxs.map((ctx, idx) => `
                                    <div class="example-item">
                                        ${this.highlightWord(ctx.ctx_title, allVariations)}
                                        <div class="example-actions anki-only">
                                            <button class="ex-action-btn" onclick="event.stopPropagation(); window.ankiEditor.addExampleToField(this, 'context')">context</button>
                                            <button class="ex-action-btn" onclick="event.stopPropagation(); window.ankiEditor.addExampleToField(this, 'back')">back</button>
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
                        <div class="word-title-row">
                            <h2 class="word-title">${word.data.word_key}</h2>
                            ${variations.length > 0 ? `<span class="variations">(${variations.join(', ')})</span>` : ''}
                            <button class="make-card-btn" onclick="event.stopPropagation(); window.ankiEditor.enterAnkiMode('${wordKey.replace(/'/g, "\\'")}', lastFetchedData)">make a card</button>
                        </div>
                        ${variations.length > 0 ? `<div class="variations">(${variations.join(', ')})</div>` : ''}
                    </div>
                    <span class="book-title">${bookTitle}</span>
                </div>
                ${examplesHtml}
            `;
            wordDiv.addEventListener('click', () => {
                if (onWordClick) onWordClick(word, wordDiv);
            });
            wordList.appendChild(wordDiv);
        });
    },

    renderBookList(options = {}) {
        const { docMap, excludedBooks, searchExcludedBooks, onSearchExcludedToggle, onBookToggle } = options;
        const wordList = document.getElementById('wordList');
        const wordCounter = document.getElementById('wordCounter');
        if (!wordList) return;

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
            if (onSearchExcludedToggle) onSearchExcludedToggle(searchExcludedToggle.checked);
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
                if (onBookToggle) onBookToggle(uri, checkbox.checked);
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
    },

    renderDefinition(data, options = {}) {
        const { currentDictionary } = options;
        const dictionaryView = document.getElementById('dictionaryView');
        if (!dictionaryView) return;

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
                            <button class="add-to-card-btn anki-only" onclick="window.ankiEditor.addDefinitionToCard(lastFetchedData.definitions[${index}])">
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
};