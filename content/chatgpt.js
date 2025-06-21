class ChatGPTAutomation {
    constructor() {
        this.isInjected = false;
        this.messageListener = null;
        this.init();
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
        if (!window.location.hostname.includes('chat.openai.com')) {
            return;
        }

        this.injectAutomationScript();
        this.setupMessageListener();
    }

    injectAutomationScript() {
        if (this.isInjected) return;

        const script = document.createElement('script');
        script.textContent = `
            window.chatGPTAutomation = {
                async submitPrompt(prompt) {
                    try {
                        // Wait for page to be ready
                        await this.waitForElement('[data-testid="send-button"], textarea[placeholder*="Message"]');
                        
                        // Find the input textarea
                        const textarea = document.querySelector('textarea[placeholder*="Message"]') || 
                                       document.querySelector('#prompt-textarea') ||
                                       document.querySelector('textarea[data-id="root"]');
                        
                        if (!textarea) {
                            throw new Error('Could not find ChatGPT input textarea');
                        }

                        // Clear existing content and set new prompt
                        textarea.value = '';
                        textarea.focus();
                        
                        // Simulate typing to trigger React's onChange
                        const inputEvent = new Event('input', { bubbles: true });
                        textarea.value = prompt;
                        textarea.dispatchEvent(inputEvent);

                        // Wait a moment for React to process
                        await new Promise(resolve => setTimeout(resolve, 500));

                        // Find and click send button
                        const sendButton = document.querySelector('[data-testid="send-button"]') ||
                                         document.querySelector('button[data-testid="send-button"]') ||
                                         document.querySelector('button svg[data-icon="send"]')?.closest('button') ||
                                         document.querySelector('button:has(svg)');

                        if (!sendButton || sendButton.disabled) {
                            throw new Error('Send button not found or disabled');
                        }

                        sendButton.click();

                        // Wait for response to start
                        await this.waitForResponse();
                        
                        // Wait for response to complete
                        const response = await this.waitForCompleteResponse();
                        
                        return { success: true, response };
                    } catch (error) {
                        return { success: false, error: error.message };
                    }
                },

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
                            reject(new Error(\`Element \${selector} not found within timeout\`));
                        }, timeout);
                    });
                },

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
                                '.markdown'
                            ];

                            for (const selector of streamingIndicators) {
                                if (document.querySelector(selector)) {
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
                },

                async waitForCompleteResponse(timeout = 120000) {
                    return new Promise((resolve, reject) => {
                        let lastLength = 0;
                        let stableCount = 0;
                        const maxStableChecks = 3;
                        let attempts = 0;
                        const maxAttempts = timeout / 2000;

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
                                setTimeout(checkComplete, 2000);
                                return;
                            }

                            const currentLength = lastMessage.textContent.length;
                            
                            // Check if response has stopped growing
                            if (currentLength === lastLength) {
                                stableCount++;
                            } else {
                                stableCount = 0;
                                lastLength = currentLength;
                            }

                            // Check for completion indicators
                            const isComplete = stableCount >= maxStableChecks || 
                                             !document.querySelector('.result-streaming') ||
                                             !document.querySelector('[data-testid="stop-button"]');

                            if (isComplete) {
                                resolve(lastMessage.textContent.trim());
                                return;
                            }

                            if (attempts >= maxAttempts) {
                                reject(new Error('Response did not complete within timeout'));
                                return;
                            }

                            setTimeout(checkComplete, 2000);
                        };

                        setTimeout(checkComplete, 2000);
                    });
                },

                async checkLoginStatus() {
                    // Check various indicators that user is logged in
                    const loginIndicators = [
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
                        'button:contains("Log in")',
                        'button:contains("Sign up")',
                        '.login-form',
                        '[data-testid="login-button"]'
                    ];

                    for (const selector of loginPageIndicators) {
                        if (document.querySelector(selector)) {
                            return { loggedIn: false, needsLogin: true };
                        }
                    }

                    return { loggedIn: false, needsLogin: false };
                }
            };
        `;

        document.documentElement.appendChild(script);
        this.isInjected = true;
    }

    setupMessageListener() {
        if (this.messageListener) return;

        this.messageListener = (event) => {
            if (event.source !== window) return;
            
            if (event.data.type === 'CHATGPT_AUTOMATION_REQUEST') {
                this.handleAutomationRequest(event.data);
            }
        };

        window.addEventListener('message', this.messageListener);

        // Also listen for extension messages
        browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
            if (message.action === 'automatePrompt') {
                this.automatePrompt(message.prompt)
                    .then(result => sendResponse(result))
                    .catch(error => sendResponse({ success: false, error: error.message }));
                return true;
            }
        });
    }

    async handleAutomationRequest(data) {
        try {
            let result;
            
            switch (data.action) {
                case 'submitPrompt':
                    result = await this.executeInPage('chatGPTAutomation.submitPrompt', data.prompt);
                    break;
                case 'checkLogin':
                    result = await this.executeInPage('chatGPTAutomation.checkLoginStatus');
                    break;
                default:
                    throw new Error(`Unknown action: ${data.action}`);
            }

            window.postMessage({
                type: 'CHATGPT_AUTOMATION_RESPONSE',
                requestId: data.requestId,
                result
            }, '*');
        } catch (error) {
            window.postMessage({
                type: 'CHATGPT_AUTOMATION_RESPONSE',
                requestId: data.requestId,
                error: error.message
            }, '*');
        }
    }

    async executeInPage(functionCall, ...args) {
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            const resultId = 'automation_result_' + Date.now();
            
            script.textContent = `
                (async () => {
                    try {
                        const result = await ${functionCall}(${args.map(arg => JSON.stringify(arg)).join(', ')});
                        window['${resultId}'] = { success: true, result };
                    } catch (error) {
                        window['${resultId}'] = { success: false, error: error.message };
                    }
                })();
            `;

            document.documentElement.appendChild(script);
            script.remove();

            // Poll for result
            const checkResult = () => {
                const result = window[resultId];
                if (result) {
                    delete window[resultId];
                    if (result.success) {
                        resolve(result.result);
                    } else {
                        reject(new Error(result.error));
                    }
                } else {
                    setTimeout(checkResult, 100);
                }
            };

            checkResult();
        });
    }

    async automatePrompt(prompt) {
        try {
            // Check if user is logged in
            const loginStatus = await this.executeInPage('chatGPTAutomation.checkLoginStatus');
            
            if (!loginStatus.loggedIn) {
                return {
                    success: false,
                    error: 'Please log in to ChatGPT first',
                    needsLogin: true
                };
            }

            // Submit the prompt
            const result = await this.executeInPage('chatGPTAutomation.submitPrompt', prompt);
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