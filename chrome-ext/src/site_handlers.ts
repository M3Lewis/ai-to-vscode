
export interface SiteHandler {
    name: string;
    description: string;
    match(hostname: string): boolean;
    /**
     * Get the target element that represents the "latest answer".
     * This is used to determine where to inject the copy button or where to copy from.
     */
    getTarget(): HTMLElement | null;
    /**
     * Start observing the DOM for changes (e.g. new answers generated).
     * @param onUpdate Callback function to trigger when a relevant update is detected
     */
    startObserver(onUpdate: () => void): void;
    dispose?(): void;
}

export class DeepWikiHandler implements SiteHandler {
    name = 'DeepWiki';
    description = 'Handles dynamic answer selection on DeepWiki.com based on data-query-index';
    private observer: MutationObserver | null = null;

    match(hostname: string): boolean {
        return hostname.includes('deepwiki.com');
    }

    getTarget(): HTMLElement | null {
        // Query all potential answer containers
        const answers = document.querySelectorAll('div[data-query-index]');
        if (answers.length === 0) return null;

        let maxIndex = -1;
        let latestAnswer: HTMLElement | null = null;

        for (let i = 0; i < answers.length; i++) {
            const el = answers[i] as HTMLElement;
            const indexStr = el.getAttribute('data-query-index');
            if (indexStr) {
                const index = parseInt(indexStr, 10);
                if (!isNaN(index) && index > maxIndex) {
                    maxIndex = index;
                    latestAnswer = el;
                }
            }
        }

        // The user provided structure shows the container is a div with class flex etc.
        // But the actual content bubble is a specific child with p-4, rounded-md, etc.
        if (latestAnswer) {
            const container = latestAnswer as HTMLElement;
            // We search for the inner bubble. 
            // Using a combination of distinctive classes to be robust but specific.
            const contentBubble = container.querySelector('div.relative.flex.flex-col.rounded-md.p-4');
            if (contentBubble) {
                return contentBubble as HTMLElement;
            }
            // Fallback: search for something resembling the bubble if the exact chain differs
            // The user's provided class string implies it has border and specific bg
            const fallbackBubble = container.querySelector('div.border-\\[0.5px\\].bg-\\[\\#f8f8f8\\]') ||
                container.querySelector('div.dark\\:bg-\\[\\#141414\\]');

            if (fallbackBubble) return fallbackBubble as HTMLElement;

            // If we can't find the specific bubble, return the wrapper (better than nothing)
            return container;
        }

        return null;
    }

    startObserver(onUpdate: () => void): void {
        if (this.observer) {
            this.observer.disconnect();
        }

        this.observer = new MutationObserver((mutations) => {
            let shouldUpdate = false;
            for (const mutation of mutations) {
                if (mutation.type === 'childList') {
                    // Check added nodes for data-query-index
                    mutation.addedNodes.forEach(node => {
                        if (node.nodeType === Node.ELEMENT_NODE) {
                            const el = node as HTMLElement;
                            if (el.hasAttribute('data-query-index') || el.querySelector('[data-query-index]')) {
                                shouldUpdate = true;
                            }
                        }
                    });
                }
            }

            if (shouldUpdate) {
                console.log('[DeepWikiHandler] New answer detected, updating...');
                onUpdate();
            }
        });

        // Observe document.body since we don't know the exact parent from the snippet
        // Ideally we would observe the container of the answers if we knew it
        document.body.addEventListener('DOMContentLoaded', () => {
            // ensure body exists
        });

        if (document.body) {
            this.observer.observe(document.body, { childList: true, subtree: true });
        }
    }

    dispose() {
        if (this.observer) {
            this.observer.disconnect();
            this.observer = null;
        }
    }
}
