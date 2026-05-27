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
                await window.invokeAnki('storeMediaFile', {
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
            const clone = item.cloneNode(true);
            const actions = clone.querySelector('.example-actions');
            if (actions) actions.remove();
            let content = clone.innerHTML.trim();
            content = content.replace(/<mark class="highlight">(.*?)<\/mark>/gi, '<b>$1</b>');
            return `<li style="text-align: left;">${content}</li>`;
        })
        .join('\n');
    
    const html = `<hr>\n<ul style="text-align: left;">\n${items}\n</ul>`;
    
    await copyToClipboard(html, btn);
}

window.formatDefinitionHtml = function(entry, forPreview = false) {
    const posHtml = entry.part_of_speech && entry.part_of_speech !== 'NOT SPECIFIED'
        ? `<b style="color: #2980b9;">${entry.part_of_speech.toLowerCase()}</b> `
        : '';
    const labelsHtml = entry.labels && entry.labels.length > 0
        ? `<i style="color: #666;">(${entry.labels.join(', ')})</i> `
        : '';
    const examples = entry.examples.map(ex => `<li style="text-align: left;">${ex}</li>`).join('\n');
    let imagesHtml = '';
    if (entry.images && entry.images.length > 0) {
        imagesHtml = `<div style="text-align: left; margin-top: 10px;">\n` +
            entry.images.map(img => {
                if (forPreview) {
                    return `<img src="${img}" style="max-width: 100%; height: auto;">`;
                }
                const filename = 'readera_' + img.split('/').pop().replace(/[^a-zA-Z0-9.-]/g, '_');
                return `<img src="${filename}">`;
            }).join('\n') +
            `\n</div>\n`;
    }
    return `<div>\n<div style="text-align: left;">${posHtml}${labelsHtml}<b>${entry.description}</b></div>\n${imagesHtml}<ul style="text-align: left;">\n${examples}\n</ul>\n</div>`;
}

async function copyDefinitionAsHtml(btn, index) {
    if (!window.lastFetchedData || !window.lastFetchedData.definitions[index]) return;
    const entry = window.lastFetchedData.definitions[index];
    const html = formatDefinitionHtml(entry);
    await copyToClipboard(html, btn);
}

async function copyAllDefinitionsAsHtml(btn) {
    if (!window.lastFetchedData || !window.lastFetchedData.definitions) return;
    const html = window.lastFetchedData.definitions
        .map(entry => formatDefinitionHtml(entry))
        .join('\n\n');
    await copyToClipboard(html, btn);
}
