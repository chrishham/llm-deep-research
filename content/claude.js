class ClaudeAutomation {
    constructor() {
        this.isInjected = false;
        this.messageListener = null;
        this.init();
    }

    init() {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.setup());
        } else {
            this.setup();
        }
    }

    setup() {
        if (!window.location.hostname.includes('claude.ai')) {
            return;
        }

        this.injectAutomationScript();
        this.setupMessageListener();
    }

    injectAutomationScript() {
        if (this.isInjected) return;

        const script = document.createElement('script');
        script.textContent = `
            window.claudeAutomation = {
                async submitPrompt(prompt) {
                    try {
                        // Wait for Claude's input area
                        await this.waitForElement('[contenteditable="true"]', 10000);
                        
                        // Find the input field
                        const inputField = document.querySelector('[contenteditable="true"][data-testid="chat-input"]') ||
                                         document.querySelector('div[contenteditable="true"]') ||
                                         document.querySelector('[placeholder*="Talk to Claude"]');
                        
                        if (!inputField) {
                            throw new Error('Could not find Claude input field');
                        }

                        // Clear and set content
                        inputField.focus();
                        inputField.innerHTML = '';
                        
                        // Insert prompt text
                        const textNode = document.createTextNode(prompt);
                        inputField.appendChild(textNode);
                        
                        // Trigger input events
                        inputField.dispatchEvent(new Event('input', { bubbles: true }));
                        inputField.dispatchEvent(new Event('change', { bubbles: true }));

                        // Wait for UI to update
                        await new Promise(resolve => setTimeout(resolve, 500));

                        // Find send button
                        const sendButton = document.querySelector('[data-testid="send-button"]') ||
                                         document.querySelector('button[aria-label*="Send"]') ||
                                         document.querySelector('button:has(svg[data-icon="send"])') ||
                                         document.querySelector('button svg[aria-label*="Send"]')?.closest('button');

                        if (!sendButton || sendButton.disabled) {
                            throw new Error('Send button not found or disabled');
                        }

                        sendButton.click();

                        // Wait for response
                        await this.waitForResponse();
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
                            // Look for Claude response indicators
                            const responseIndicators = [
                                '[data-testid="message-content"]',
                                '.claude-message',
                                '[data-message-author="assistant"]',
                                '.response-streaming',
                                'div[role="article"]'
                            ];

                            for (const selector of responseIndicators) {
                                const elements = document.querySelectorAll(selector);
                                if (elements.length > 0) {
                                    // Check if this is a new response (look for recent timestamp or streaming indicator)
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
                            
                            // Find the latest Claude response
                            const responseMessages = document.querySelectorAll('[data-testid="message-content"], .claude-message, [data-message-author="assistant"]');
                            const lastMessage = responseMessages[responseMessages.length - 1];
                            
                            if (!lastMessage) {
                                if (attempts >= maxAttempts) {
                                    reject(new Error('No Claude response found'));
                                    return;
                                }
                                setTimeout(checkComplete, 2000);
                                return;
                            }

                            const currentLength = lastMessage.textContent.length;
                            
                            if (currentLength === lastLength) {
                                stableCount++;
                            } else {
                                stableCount = 0;
                                lastLength = currentLength;
                            }

                            // Check for completion indicators
                            const isComplete = stableCount >= maxStableChecks ||
                                             !document.querySelector('.response-streaming') ||
                                             !document.querySelector('[data-testid="stop-button"]') ||
                                             !document.querySelector('.typing-indicator');

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
                    // Check if user is logged in to Claude
                    const loginIndicators = [
                        '[contenteditable="true"]',
                        '[data-testid="chat-input"]',
                        '[placeholder*="Talk to Claude"]'
                    ];

                    for (const selector of loginIndicators) {
                        if (document.querySelector(selector)) {
                            return { loggedIn: true };
                        }
                    }

                    // Check for login requirements
                    const loginRequired = [
                        'button:contains("Log in")',
                        'a[href*="login"]',
                        '.login-required',
                        'button:contains("Sign up")'
                    ];

                    for (const selector of loginRequired) {
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

        browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
            if (message.action === 'automatePrompt' && message.provider === 'claude') {
                this.automatePrompt(message.prompt)
                    .then(result => sendResponse(result))
                    .catch(error => sendResponse({ success: false, error: error.message }));
                return true;
            }
        });
    }

    async automatePrompt(prompt) {
        try {
            const loginStatus = await this.executeInPage('claudeAutomation.checkLoginStatus');
            
            if (!loginStatus.loggedIn) {
                return {
                    success: false,
                    error: 'Please log in to Claude first',
                    needsLogin: true
                };
            }

            const result = await this.executeInPage('claudeAutomation.submitPrompt', prompt);
            return result;
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    async executeInPage(functionCall, ...args) {
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            const resultId = 'claude_result_' + Date.now();
            
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
}

new ClaudeAutomation();