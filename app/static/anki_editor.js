class AnkiEditor {
    constructor() {
        this.ankiCardMode = document.getElementById('ankiCardMode');
        this.ankiModeBar = document.getElementById('ankiModeBar');
        this.ankiCardPreview = document.getElementById('ankiCardPreview');
        this.activeWordContainer = document.getElementById('activeWordContainer');
        this.deckSelect = document.getElementById('deckSelect');
        this.addCardBtn = document.getElementById('addCardBtn');
        this.cancelAnkiBtn = document.getElementById('cancelAnkiBtn');
        this.previewName = document.getElementById('previewName');
        this.previewContext = document.getElementById('previewContext');
        this.previewBack = document.getElementById('previewBack');

        this.isAnkiMode = false;
        this.currentCardData = {
            name: '',
            context: '',
            back: '',
            definitions: [],
            bookExamples: []
        };
        this.savedScrollPosition = 0;

        this.initEventListeners();
    }

    initEventListeners() {
        this.addCardBtn.addEventListener('click', async () => {
            await this.addCardToAnki();
        });

        this.cancelAnkiBtn.addEventListener('click', () => {
            this.exitAnkiMode();
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.isAnkiMode) {
                this.exitAnkiMode();
            }
        });
    }

    updateAnkiModeUI() {
        if (this.isAnkiMode) {
            document.body.classList.add('anki-mode-on');
            this.ankiCardMode.style.display = 'block';
            this.ankiModeBar.style.display = 'block';
            this.ankiCardPreview.style.display = 'block';
        } else {
            document.body.classList.remove('anki-mode-on');
            this.ankiCardMode.style.display = 'none';
            this.ankiModeBar.style.display = 'none';
            this.ankiCardPreview.style.display = 'none';
        }
    }

    enterAnkiMode(wordKey, lastFetchedData) {
        // Save current scroll position before entering Anki mode
        this.savedScrollPosition = window.scrollY;

        this.isAnkiMode = true;
        this.currentCardData = {
            name: wordKey,
            context: '',
            back: '',
            definitions: [], // Array of { html, previewHtml }
            bookExamples: []
        };
        
        // Auto-add transcription and audio if available
        if (lastFetchedData && lastFetchedData.word.toLowerCase() === wordKey.toLowerCase()) {
            this.populateAnkiBack(lastFetchedData);
        }

        this.updatePreview();
        this.updateAnkiModeUI();
        
        // Move the active word element to the right column
        const activeWordEl = document.querySelector(`.word-item[data-word="${wordKey.replace(/'/g, "\\'")}"]`);
        if (activeWordEl) {
            this.activeWordContainer.innerHTML = '';
            const clone = activeWordEl.cloneNode(true);
            this.activeWordContainer.appendChild(clone);
        }

        // Trigger definition fetch in app.js
        window.dispatchEvent(new CustomEvent('ankiModeEntered', { detail: { wordKey } }));
        
        // Scroll to top
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    exitAnkiMode() {
        this.isAnkiMode = false;
        this.currentCardData = { name: '', context: '', back: '', definitions: [], bookExamples: [] };
        this.activeWordContainer.innerHTML = '';
        this.updatePreview();
        this.updateAnkiModeUI();

        // Restore scroll position after exiting Anki mode
        // Use a small timeout to ensure rendering is complete
        setTimeout(() => {
            window.scrollTo({ top: this.savedScrollPosition, behavior: 'instant' });
        }, 0);

        window.dispatchEvent(new CustomEvent('ankiModeExited'));
    }

    populateAnkiBack(data) {
        const ukPron = data.pronunciations.find(p => p.region === 'UK') || data.pronunciations[0];
        if (ukPron) {
            let backContent = '';
            if (ukPron.ipa) backContent += `/${ukPron.ipa}/ `;
            if (ukPron.audio) {
                const filename = 'readera_' + ukPron.audio.split('/').pop().replace(/[^a-zA-Z0-9.-]/g, '_');
                backContent += `[sound:${filename}]`;
                // Pre-store audio in Anki
                window.invokeAnki('storeMediaFile', {
                    filename: filename,
                    url: ukPron.audio
                }).catch(console.error);
            }
            this.currentCardData.back = backContent;
            this.updatePreview();
        }
    }

    updatePreview() {
        this.previewName.innerHTML = this.currentCardData.name;
        this.previewContext.innerHTML = this.currentCardData.context;
        
        // Combine definitions and book examples, ensuring examples are at the bottom
        let backHtml = this.currentCardData.back; // This contains transcription/audio
        if (this.currentCardData.definitions.length > 0) {
            if (backHtml) backHtml += '\n';
            // Use preview-specific HTML for the preview pane
            backHtml += this.currentCardData.definitions.map(d => d.previewHtml).join('\n');
        }
        if (this.currentCardData.bookExamples.length > 0) {
            backHtml += '<hr>\n<ul style="text-align: left;">\n';
            backHtml += this.currentCardData.bookExamples.map(ex => `<li>${ex}</li>`).join('\n');
            backHtml += '\n</ul>';
        }
        
        this.previewBack.innerHTML = backHtml;
    }

    addDefinitionToCard(entry) {
        const html = window.formatDefinitionHtml(entry);
        const previewHtml = window.formatDefinitionHtml(entry, true);
        
        if (this.currentCardData.definitions.some(d => d.html === html)) return;
        
        // Store images in Anki if present
        if (entry.images && entry.images.length > 0) {
            entry.images.forEach(img => {
                const filename = 'readera_' + img.split('/').pop().replace(/[^a-zA-Z0-9.-]/g, '_');
                window.invokeAnki('storeMediaFile', {
                    filename: filename,
                    url: img
                }).catch(err => console.error('Failed to store image in Anki:', err));
            });
        }
        
        this.currentCardData.definitions.push({ html, previewHtml });
        this.updatePreview();
    }

    addExampleToField(btn, field) {
        const exampleItem = btn.closest('.example-item');
        if (!exampleItem) return;

        // Get the text, but we need to remove the actions div
        const clone = exampleItem.cloneNode(true);
        const actions = clone.querySelector('.example-actions');
        if (actions) actions.remove();
        
        let example = clone.innerHTML.trim();
        // Convert <mark> to <b>
        example = example.replace(/<mark class="highlight">(.*?)<\/mark>/gi, '<b>$1</b>');

        if (field === 'context') {
            this.currentCardData.context = example;
        } else if (field === 'back') {
            if (this.currentCardData.bookExamples.includes(example)) return;
            this.currentCardData.bookExamples.push(example);
        }
        this.updatePreview();
    }

    async addCardToAnki() {
        const deckName = this.deckSelect.value;
        if (!deckName) {
            alert('Please select a deck');
            return;
        }

        try {
            const models = await window.invokeAnki('modelNames');
            let modelName = models.find(m => m === "ReadEra") || models[0];

            // Get model field names to ensure we are using the correct ones
            const modelFields = await window.invokeAnki('modelFieldNames', { modelName });
            const fields = {};
            
            // Map our data to whatever fields the user has, prioritizing exact matches
            const fieldMapping = {
                "Name": ["Name", "Word", "Front", "Text"],
                "Context": ["Context", "Sentence", "Example"],
                "Back": ["Back", "Definition", "Meaning"]
            };

            for (const [ourField, possibleNames] of Object.entries(fieldMapping)) {
                const actualName = modelFields.find(f =>
                    f === ourField || possibleNames.includes(f)
                );
                if (actualName) {
                    if (ourField === "Back") {
                        // Combine transcription/audio with the actual card HTML (not preview HTML)
                        let backHtml = this.currentCardData.back;
                        if (this.currentCardData.definitions.length > 0) {
                            if (backHtml) backHtml += '\n';
                            backHtml += this.currentCardData.definitions.map(d => d.html).join('\n');
                        }
                        if (this.currentCardData.bookExamples.length > 0) {
                            backHtml += '<hr>\n<ul style="text-align: left;">\n';
                            backHtml += this.currentCardData.bookExamples.map(ex => `<li>${ex}</li>`).join('\n');
                            backHtml += '\n</ul>';
                        }
                        fields[actualName] = backHtml;
                    } else {
                        fields[actualName] = this.currentCardData[ourField.toLowerCase()];
                    }
                }
            }

            // If we couldn't map fields automatically, fallback to positional mapping for the first 3 fields
            if (Object.keys(fields).length === 0 || !fields[modelFields[0]]) {
                if (modelFields[0]) fields[modelFields[0]] = this.currentCardData.name;
                if (modelFields[1]) fields[modelFields[1]] = this.currentCardData.context;
                if (modelFields[2]) {
                    let backHtml = this.currentCardData.back;
                    if (this.currentCardData.definitions.length > 0) {
                        if (backHtml) backHtml += '\n';
                        backHtml += this.currentCardData.definitions.map(d => d.html).join('\n');
                    }
                    if (this.currentCardData.bookExamples.length > 0) {
                        backHtml += '<hr>\n<ul style="text-align: left;">\n';
                        backHtml += this.currentCardData.bookExamples.map(ex => `<li>${ex}</li>`).join('\n');
                        backHtml += '\n</ul>';
                    }
                    fields[modelFields[2]] = backHtml;
                }
            }

            const note = {
                deckName: deckName,
                modelName: modelName,
                fields: fields,
                options: {
                    allowDuplicate: true
                },
                tags: ["readera"]
            };

            await window.invokeAnki('addNote', { note });
            this.exitAnkiMode();
        } catch (err) {
            console.error('Failed to add card:', err);
            alert('Failed to add card: ' + err.message + '\nMake sure you have a model with fields: Name, Context, Back');
        }
    }
}

window.ankiEditor = new AnkiEditor();
