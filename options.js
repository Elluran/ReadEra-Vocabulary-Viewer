class OptionsManager {
    constructor() {
        this.optionsBtn = document.getElementById('optionsBtn');
        this.optionsModal = document.getElementById('optionsModal');
        this.optionsList = document.getElementById('optionsList');
        this.closeOptionsBtn = this.optionsModal.querySelector('.close');
        this.configOptions = {};

        this.init();
    }

    init() {
        this.optionsBtn.addEventListener('click', async () => {
            await this.fetchConfig();
            this.renderOptions();
            this.optionsModal.style.display = 'block';
        });

        this.closeOptionsBtn.addEventListener('click', () => {
            this.optionsModal.style.display = 'none';
        });

        window.addEventListener('click', (e) => {
            if (e.target === this.optionsModal) {
                this.optionsModal.style.display = 'none';
            }
        });
    }

    async fetchConfig() {
        try {
            const response = await fetch('/api/config');
            if (!response.ok) throw new Error('Failed to fetch config');
            const config = await response.json();
            this.configOptions = config.options || {};
        } catch (err) {
            console.error('Error fetching config:', err);
        }
    }

    renderOptions() {
        this.optionsList.innerHTML = '';
        
        for (const [key, value] of Object.entries(this.configOptions)) {
            const optionItem = document.createElement('div');
            optionItem.className = 'option-item';
            
            let labelText = key.replace(/_/g, ' ');
            labelText = labelText.charAt(0).toUpperCase() + labelText.slice(1);
            const checkboxId = `opt-${key}`;
            
            optionItem.innerHTML = `
                <label for="${checkboxId}">${labelText}</label>
                <input type="checkbox" id="${checkboxId}" ${value ? 'checked' : ''}>
            `;
            
            const checkbox = optionItem.querySelector('input');
            checkbox.addEventListener('change', async () => {
                this.configOptions[key] = checkbox.checked;
                await this.saveConfig();
                console.log(`Option ${key} changed to ${checkbox.checked}`);
                
                // Dispatch event so other parts of the app can react
                window.dispatchEvent(new CustomEvent('configChanged', { detail: { key, value: checkbox.checked } }));
            });
            
            this.optionsList.appendChild(optionItem);
        }
        
        if (Object.keys(this.configOptions).length === 0) {
            this.optionsList.innerHTML = '<p class="message">No options found in config.toml</p>';
        }
    }

    getOption(key) {
        return this.configOptions[key];
    }

    async saveConfig() {
        try {
            const response = await fetch('/api/config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ options: this.configOptions })
            });
            if (!response.ok) throw new Error('Failed to save config');
        } catch (err) {
            console.error('Error saving config:', err);
            alert('Failed to save configuration');
        }
    }
}

// Initialize the options manager
const optionsManager = new OptionsManager();
