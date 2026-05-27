class OptionsManager {
    constructor() {
        this.optionsBtn = document.getElementById('optionsBtn');
        this.optionsModal = document.getElementById('optionsModal');
        this.optionsList = document.getElementById('optionsList');
        this.closeOptionsBtn = this.optionsModal.querySelector('.close');
        this.config = {
            options: {},
            dictionaries: {}
        };

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
            this.config = config;
        } catch (err) {
            console.error('Error fetching config:', err);
        }
    }

    renderOptions() {
        this.optionsList.innerHTML = '';
        
        // Render Options section
        if (this.config.options) {
            this.renderSection('Options', this.config.options, 'options');
        }

        // Render Dictionaries section
        if (this.config.dictionaries) {
            this.renderSection('Dictionaries', this.config.dictionaries, 'dictionaries');
        }
        
        if (this.optionsList.innerHTML === '') {
            this.optionsList.innerHTML = '<p class="message">No options found in config.toml</p>';
        }
    }

    renderSection(title, sectionData, sectionKey) {
        const sectionHeader = document.createElement('h3');
        sectionHeader.textContent = title;
        sectionHeader.style.marginTop = '15px';
        sectionHeader.style.marginBottom = '10px';
        sectionHeader.style.borderBottom = '1px solid #eee';
        sectionHeader.style.paddingBottom = '5px';
        this.optionsList.appendChild(sectionHeader);

        for (const [key, value] of Object.entries(sectionData)) {
            const optionItem = document.createElement('div');
            optionItem.className = 'option-item';
            
            let labelText = key.replace(/_/g, ' ');
            labelText = labelText.charAt(0).toUpperCase() + labelText.slice(1);
            const checkboxId = `opt-${sectionKey}-${key}`;
            
            optionItem.innerHTML = `
                <label for="${checkboxId}">${labelText}</label>
                <input type="checkbox" id="${checkboxId}" ${value ? 'checked' : ''}>
            `;
            
            const checkbox = optionItem.querySelector('input');
            checkbox.addEventListener('change', async () => {
                this.config[sectionKey][key] = checkbox.checked;
                await this.saveConfig();
                console.log(`Option ${sectionKey}.${key} changed to ${checkbox.checked}`);
                
                // Dispatch event so other parts of the app can react
                window.dispatchEvent(new CustomEvent('configChanged', {
                    detail: { section: sectionKey, key, value: checkbox.checked }
                }));
            });
            
            this.optionsList.appendChild(optionItem);
        }
    }

    getOption(section, key) {
        return this.config[section] ? this.config[section][key] : undefined;
    }

    async saveConfig() {
        try {
            const response = await fetch('/api/config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(this.config)
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
