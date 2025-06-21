class DeepSeekAutomation {
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
        if (!window.location.hostname.includes('chat.deepseek.com')) {
            return;
        }

        this.injectAutomationScript();
        this.setupMessageListener();
    }

    injectAutomationScript() {
        if (this.isInjected) return;

        const script = document.createElement('script');
        script.textContent = `
            window.deepseekAutomation = {
                async submitPrompt(prompt) {
                    try {
                        // Wait for DeepSeek's input area
                        await this.waitForElement('textarea, [contenteditable="true"]', 10000);
                        
                        // Find the input field
                        const inputField = document.querySelector('textarea[placeholder*="Ask DeepSeek"]') ||
                                         document.querySelector('textarea[placeholder*="Type a message"]') ||
                                         document.querySelector('div[contenteditable="true"]') ||
                                         document.querySelector('textarea[data-testid="chat-input"]') ||
                                         document.querySelector('textarea');
                        
                        if (!inputField) {
                            throw new Error('Could not find DeepSeek input field');
                        }

                        // Clear and set content
                        inputField.focus();
                        
                        if (inputField.tagName === 'TEXTAREA') {
                            inputField.value = '';
                            inputField.value = prompt;
                            inputField.dispatchEvent(new Event('input', { bubbles: true }));
                            inputField.dispatchEvent(new Event('change', { bubbles: true }));
                        } else {
                            inputField.innerHTML = '';
                            inputField.textContent = prompt;
                            inputField.dispatchEvent(new Event('input', { bubbles: true }));
                        }

                        // Wait for UI to update
                        await new Promise(resolve => setTimeout(resolve, 500));

                        // Find send button
                        const sendButton = document.querySelector('[data-testid="send-button"]') ||
                                         document.querySelector('button[aria-label*="Send"]') ||
                                         document.querySelector('button:has(svg[data-icon="send"])') ||
                                         document.querySelector('button[type="submit"]') ||
                                         Array.from(document.querySelectorAll('button')).find(btn => 
                                             btn.textContent.toLowerCase().includes('send') || 
                                             btn.querySelector('svg'));

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
                            // Look for DeepSeek response indicators
                            const responseIndicators = [
                                '[data-role="assistant"]',
                                '.message-content',
                                '.deepseek-response',
                                '.assistant-message',
                                '.response-text',
                                '.markdown-content'
                            ];

                            for (const selector of responseIndicators) {
                                const elements = document.querySelectorAll(selector);
                                if (elements.length > 0) {
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
                            
                            // Find the latest DeepSeek response
                            const responseMessages = document.querySelectorAll('[data-role="assistant"], .message-content, .deepseek-response, .assistant-message');
                            const lastMessage = responseMessages[responseMessages.length - 1];
                            
                            if (!lastMessage) {
                                if (attempts >= maxAttempts) {
                                    reject(new Error('No DeepSeek response found'));
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
                                             !document.querySelector('.streaming') ||
                                             !document.querySelector('[data-testid="stop-button"]') ||
                                             !document.querySelector('.loading-dots');

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
                    // Check if user is logged in to DeepSeek
                    const loginIndicators = [
                        'textarea[placeholder*="Ask DeepSeek"]',
                        'textarea[placeholder*="Type a message"]',
                        'div[contenteditable="true"]',
                        'textarea[data-testid="chat-input"]'
                    ];

                    for (const selector of loginIndicators) {
                        if (document.querySelector(selector)) {
                            return { loggedIn: true };
                        }
                    }

                    // Check for login requirements
                    const loginRequired = [
                        'button:contains("Log in")',
                        'button:contains("Sign in")',
                        'a[href*="login"]',
                        '.login-form',
                        'button:contains("登录")'  // Chinese login button
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
            if (message.action === 'automatePrompt' && message.provider === 'deepseek') {
                this.automatePrompt(message.prompt)
                    .then(result => sendResponse(result))
                    .catch(error => sendResponse({ success: false, error: error.message }));
                return true;
            }
        });
    }

    async automatePrompt(prompt) {
        try {
            const loginStatus = await this.executeInPage('deepseekAutomation.checkLoginStatus');
            
            if (!loginStatus.loggedIn) {
                return {
                    success: false,
                    error: 'Please log in to DeepSeek first',
                    needsLogin: true
                };
            }

            const result = await this.executeInPage('deepseekAutomation.submitPrompt', prompt);
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
            const resultId = 'deepseek_result_' + Date.now();
            
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

new DeepSeekAutomation();