const API = {
    async invokeAnki(action, params = {}) {
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
    },

    async fetchConfig() {
        const response = await fetch('/api/config');
        if (!response.ok) throw new Error('Failed to fetch config');
        return await response.json();
    },

    async uploadLibrary(filename, data) {
        const response = await fetch('/api/upload', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ filename, content: data })
        });
        if (!response.ok) throw new Error('Failed to upload library to server');
        return await response.json();
    },

    async addWord(word, library) {
        const response = await fetch('/api/add_word', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ word, library })
        });
        if (!response.ok) throw new Error('Failed to add word');
        return await response.json();
    },

    async fetchLemmas(words) {
        const response = await fetch('/api/lemmatize', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ words })
        });
        if (!response.ok) throw new Error('Failed to fetch lemmas');
        return await response.json();
    },

    async fetchDictionary(word, dict) {
        const response = await fetch(`/api/dictionary?word=${encodeURIComponent(word)}&dict=${dict}`);
        if (!response.ok) throw new Error(`Failed to fetch ${dict} definition`);
        return await response.json();
    }
};

window.API = API;
