// Shared chat UI manager for LiviChat character pages.
//
// Renders user/AI/system message bubbles into #chatHistory and sanitizes AI
// HTML so only safe links (<a>) and line breaks (<br>) survive.

class ChatManager {
    /**
     * @param {Object} options
     * @param {string} options.profileImg  Avatar image shown next to AI messages.
     * @param {string} [options.locale]    Locale used for message timestamps.
     */
    constructor({ profileImg, locale = 'ko-KR' }) {
        this.chatHistory = document.getElementById('chatHistory');
        this.conversationHistory = [];
        this.profileImg = profileImg;
        this.locale = locale;
        console.log('[ChatManager] Initialized');
    }

    addMessage(role, message) {
        if (!message || !message.trim()) return;

        const messageElement = document.createElement('div');
        messageElement.className = `message ${role}-message`;

        if (role === 'ai') {
            const profile = document.createElement('div');
            profile.className = 'message-profile';
            const characterImg = document.createElement('img');
            characterImg.src = this.profileImg;
            profile.appendChild(characterImg);
            messageElement.appendChild(profile);
        }

        const messageBubble = document.createElement('div');
        messageBubble.className = 'message-bubble';

        const content = document.createElement('div');
        content.className = 'message-content';
        if (role === 'ai') {
            // AI text may contain markdown links; render sanitized HTML.
            content.innerHTML = this._sanitizeHtml(message);
        } else {
            content.textContent = message;
        }
        messageBubble.appendChild(content);

        const time = document.createElement('span');
        time.className = 'message-time';
        time.textContent = new Date().toLocaleTimeString(this.locale, {
            hour: '2-digit',
            minute: '2-digit',
        });
        messageBubble.appendChild(time);

        messageElement.appendChild(messageBubble);
        this.chatHistory.appendChild(messageElement);
        this.chatHistory.scrollTop = this.chatHistory.scrollHeight;

        this.conversationHistory.push({
            role: role === 'user' ? 'user' : 'assistant',
            content: message,
        });
    }

    _sanitizeHtml(input) {
        // Convert markdown links [text](url) to <a>, then strip all but <a>/<br>.
        const processed = (input || '').replace(
            /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
            '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>'
        );

        const wrapper = document.createElement('div');
        wrapper.innerHTML = processed;

        const allowed = new Set(['A', 'BR']);
        for (const el of wrapper.querySelectorAll('*')) {
            const tag = el.tagName;
            if (!allowed.has(tag)) {
                el.replaceWith(document.createTextNode(el.textContent || ''));
                continue;
            }
            if (tag === 'A') {
                const href = el.getAttribute('href') || '';
                if (!/^https?:\/\//i.test(href)) {
                    el.replaceWith(document.createTextNode(el.textContent || ''));
                    continue;
                }
                el.setAttribute('target', '_blank');
                el.setAttribute('rel', 'noopener noreferrer');
                for (const attr of [...el.attributes]) {
                    if (!['href', 'target', 'rel'].includes(attr.name.toLowerCase())) {
                        el.removeAttribute(attr.name);
                    }
                }
            }
        }
        return wrapper.innerHTML.replace(/\n/g, '<br>');
    }

    addSystemMessage(message) {
        const messageElement = document.createElement('div');
        messageElement.className = 'message system-message';
        messageElement.textContent = message;
        this.chatHistory.appendChild(messageElement);
        this.chatHistory.scrollTop = this.chatHistory.scrollHeight;
    }
}

// Export for use by characterApp.js and the per-character entry scripts.
window.ChatManager = ChatManager;
