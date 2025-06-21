class ChatGPTAutomation {
    constructor() {
        this.messageListener = null;
        this.init();
    }

    getBrowserAPI() {
        return typeof browser !== 'undefined' ? browser : chrome;
    }

    init() {
        // Wait for page to be ready
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.setup());
        } else {
            this.setup();
        }
    }

    setup() {
        // Check if we're on ChatGPT
        if (!window.location.hostname.includes('chat.openai.com') && 
            !window.location.hostname.includes('chatgpt.com')) {
            return;
        }

        console.log('ChatGPT content script loaded and ready');
        this.setupMessageListener();
    }

    async waitForElement(selector, timeout = 10000) {
        return new Promise((resolve, reject) => {
            const element = document.querySelector(selector);
            if (element) {
                resolve(element);
                return;
            }

            const observer = new MutationObserver((mutations, obs) => {
                const element = document.querySelector(selector);
                if (element) {
                    obs.disconnect();
                    resolve(element);
                }
            });

            observer.observe(document.body, {
                childList: true,
                subtree: true
            });

            setTimeout(() => {
                observer.disconnect();
                reject(new Error(`Element ${selector} not found within timeout`));
            }, timeout);
        });
    }

    async submitPrompt(prompt) {
        try {
            console.log('Starting ChatGPT automation with prompt:', prompt.substring(0, 100) + '...');
            
            // Wait for page to be ready - look for placeholder elements
            await this.waitForElement('.placeholder, [data-testid="send-button"]', 15000);
            
            // Find the input element - prioritize .placeholder selector
            const inputElement = document.querySelector('.placeholder') ||
                                document.querySelector('textarea[placeholder*="Message"]') || 
                                document.querySelector('#prompt-textarea') ||
                                document.querySelector('textarea[data-id="root"]') ||
                                document.querySelector('textarea');
            
            if (!inputElement) {
                throw new Error('Could not find ChatGPT input element');
            }

            console.log('Found input element:', inputElement, 'Type:', inputElement.tagName);

            // Clear existing content and set new prompt
            if (inputElement.tagName === 'TEXTAREA' || inputElement.tagName === 'INPUT') {
                // Handle textarea/input elements
                inputElement.value = '';
                inputElement.focus();
                inputElement.value = prompt;
                inputElement.dispatchEvent(new Event('input', { bubbles: true }));
                inputElement.dispatchEvent(new Event('change', { bubbles: true }));
            } else {
                // Handle contenteditable elements (like .placeholder)
                inputElement.focus();
                inputElement.textContent = '';
                inputElement.textContent = prompt;
                
                // Trigger input events for contenteditable
                inputElement.dispatchEvent(new Event('input', { bubbles: true }));
                inputElement.dispatchEvent(new Event('change', { bubbles: true }));
                
                // Also try the 'paste' event which sometimes works better for contenteditable
                const pasteEvent = new ClipboardEvent('paste', {
                    clipboardData: new DataTransfer()
                });
                pasteEvent.clipboardData.setData('text/plain', prompt);
                inputElement.dispatchEvent(pasteEvent);
            }

            // Wait a moment for React to process
            await new Promise(resolve => setTimeout(resolve, 1000));

            // Find and click send button - try multiple approaches
            const sendButton = document.querySelector('[data-testid="send-button"]') ||
                             document.querySelector('button[data-testid="send-button"]') ||
                             document.querySelector('button[aria-label*="Send"]') ||
                             document.querySelector('button[title*="Send"]') ||
                             Array.from(document.querySelectorAll('button')).find(btn => 
                                 btn.querySelector('svg') && !btn.disabled) ||
                             Array.from(document.querySelectorAll('button')).find(btn => 
                                 btn.textContent.toLowerCase().includes('send') && !btn.disabled);

            if (!sendButton) {
                throw new Error('Send button not found');
            }
            
            if (sendButton.disabled) {
                throw new Error('Send button is disabled - make sure prompt was entered correctly');
            }

            console.log('Clicking send button:', sendButton);
            sendButton.click();

            // Wait for response to start
            await this.waitForResponse();
            
            // Wait for response to complete
            const response = await this.waitForCompleteResponse();
            
            console.log('ChatGPT automation completed successfully');
            return { success: true, response };
        } catch (error) {
            console.error('ChatGPT automation failed:', error);
            return { success: false, error: error.message };
        }
    }

    async waitForResponse(timeout = 30000) {
        return new Promise((resolve, reject) => {
            let attempts = 0;
            const maxAttempts = timeout / 1000;

            const checkForResponse = () => {
                // Look for streaming response indicators
                const streamingIndicators = [
                    '.result-streaming',
                    '[data-message-author-role="assistant"]',
                    '.group:has([data-message-author-role="assistant"])',
                    '.markdown',
                    '[data-testid*="conversation"]'
                ];

                for (const selector of streamingIndicators) {
                    if (document.querySelector(selector)) {
                        console.log('Response started, found element:', selector);
                        resolve();
                        return;
                    }
                }

                attempts++;
                if (attempts >= maxAttempts) {
                    reject(new Error('Response did not start within timeout'));
                    return;
                }

                setTimeout(checkForResponse, 1000);
            };

            checkForResponse();
        });
    }

    async waitForCompleteResponse(timeout = 1200000) {
        return new Promise((resolve, reject) => {
            let lastLength = 0;
            let stableCount = 0;
            const maxStableChecks = 5; // Increased from 3 to 5 for more reliability
            let attempts = 0;
            const maxAttempts = timeout / 3000; // Check every 3 seconds - up to 20 minutes

            const checkComplete = () => {
                attempts++;
                
                // Find the latest assistant message
                const assistantMessages = document.querySelectorAll('[data-message-author-role="assistant"]');
                const lastMessage = assistantMessages[assistantMessages.length - 1];
                
                if (!lastMessage) {
                    if (attempts >= maxAttempts) {
                        reject(new Error('No assistant message found'));
                        return;
                    }
                    setTimeout(checkComplete, 3000);
                    return;
                }

                const currentLength = lastMessage.textContent.length;
                
                // Look for multiple completion indicators
                const streamingElement = document.querySelector('.result-streaming');
                const stopButton = document.querySelector('[data-testid="stop-button"]');
                const regenerateButton = document.querySelector('[data-testid="regenerate-button"]') || 
                                       Array.from(document.querySelectorAll('button')).find(btn => 
                                           btn.textContent && btn.textContent.toLowerCase().includes('regenerate'));
                const isTyping = document.querySelector('[data-testid*="typing"]') || 
                               document.querySelector('.typing-indicator') ||
                               document.querySelector('[aria-label*="typing"]');
                
                console.log(`Response check - Length: ${currentLength}, Stable: ${stableCount}, Streaming: ${!!streamingElement}, Stop btn: ${!!stopButton}, Regen btn: ${!!regenerateButton}, Typing: ${!!isTyping}`);
                
                // Check if response has stopped growing
                if (currentLength === lastLength && currentLength > 0) {
                    stableCount++;
                } else {
                    stableCount = 0;
                    lastLength = currentLength;
                }

                // Multiple indicators for completion
                const lengthStable = stableCount >= maxStableChecks;
                const noStreaming = !streamingElement;
                const noStopButton = !stopButton;
                const hasRegenerateButton = !!regenerateButton;
                const notTyping = !isTyping;
                
                // Response is complete if:
                // 1. Length has been stable for multiple checks AND
                // 2. No streaming indicators AND
                // 3. Either no stop button OR regenerate button appeared AND
                // 4. No typing indicators
                const isComplete = lengthStable && 
                                 noStreaming && 
                                 (noStopButton || hasRegenerateButton) && 
                                 notTyping &&
                                 currentLength > 10; // Ensure we have substantial content

                if (isComplete) {
                    console.log('Response fully completed - all indicators confirm completion');
                    // Wait one more moment to be absolutely sure
                    setTimeout(() => {
                        const finalMessage = document.querySelectorAll('[data-message-author-role="assistant"]');
                        const finalText = finalMessage[finalMessage.length - 1]?.textContent?.trim() || '';
                        resolve(finalText);
                    }, 2000);
                    return;
                }

                if (attempts >= maxAttempts) {
                    console.log('Timeout reached, returning current response');
                    resolve(lastMessage.textContent.trim());
                    return;
                }

                setTimeout(checkComplete, 3000);
            };

            // Start checking after a brief delay
            setTimeout(checkComplete, 3000);
        });
    }

    async checkLoginStatus() {
        // Check various indicators that user is logged in
        const loginIndicators = [
            '.placeholder',
            '[data-testid="send-button"]',
            'textarea[placeholder*="Message"]',
            '[data-testid="composer-text-input"]'
        ];

        for (const selector of loginIndicators) {
            if (document.querySelector(selector)) {
                return { loggedIn: true };
            }
        }

        // Check for login page indicators
        const loginPageIndicators = [
            'a[href*="login"]',
            'button[data-testid="login-button"]',
            '.auth-form'
        ];

        for (const selector of loginPageIndicators) {
            if (document.querySelector(selector)) {
                return { loggedIn: false, needsLogin: true };
            }
        }

        return { loggedIn: false, needsLogin: false };
    }

    setupMessageListener() {
        if (this.messageListener) return;

        // Listen for extension messages directly
        const browserAPI = this.getBrowserAPI();
        browserAPI.runtime.onMessage.addListener((message, sender, sendResponse) => {
            console.log('ChatGPT content script received:', message);
            
            switch (message.action) {
                case 'ping':
                    console.log('Responding to ping with success');
                    sendResponse({ success: true, message: 'ChatGPT content script ready' });
                    return false; // Synchronous response
                    
                case 'automatePrompt':
                    this.automatePrompt(message.prompt)
                        .then(result => {
                            console.log('Automation result:', result);
                            sendResponse(result);
                        })
                        .catch(error => {
                            console.error('Automation error:', error);
                            sendResponse({ success: false, error: error.message });
                        });
                    return true; // Asynchronous response
                    
                default:
                    console.log('Unknown action:', message.action);
                    sendResponse({ success: false, error: 'Unknown action' });
                    return false; // Synchronous response
            }
        });
    }

    async automatePrompt(prompt) {
        try {
            // Check if user is logged in
            const loginStatus = await this.checkLoginStatus();
            
            if (!loginStatus.loggedIn) {
                return {
                    success: false,
                    error: 'Please log in to ChatGPT first',
                    needsLogin: true
                };
            }

            // Submit the prompt directly
            const result = await this.submitPrompt(prompt);
            return result;
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }
}

// Initialize the automation
new ChatGPTAutomation();