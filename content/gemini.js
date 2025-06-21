class GeminiAutomation {
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
        if (!window.location.hostname.includes('gemini.google.com')) {
            return;
        }

        this.injectAutomationScript();
        this.setupMessageListener();
    }

    injectAutomationScript() {
        if (this.isInjected) return;

        const script = document.createElement('script');
        script.textContent = `
            window.geminiAutomation = {
                async submitPrompt(prompt) {
                    try {
                        // Wait for page to be ready
                        await this.waitForElement('div[contenteditable="true"]', 10000);
                        
                        // Find the input div
                        const inputDiv = document.querySelector('div[contenteditable="true"]') ||
                                        document.querySelector('textarea[aria-label*="Enter a prompt"]') ||
                                        document.querySelector('[data-test-id="input-area"]');
                        
                        if (!inputDiv) {
                            throw new Error('Could not find Gemini input field');
                        }

                        // Clear and set new content
                        inputDiv.focus();
                        inputDiv.innerHTML = '';
                        
                        // Insert the prompt
                        if (inputDiv.tagName === 'TEXTAREA') {
                            inputDiv.value = prompt;
                            inputDiv.dispatchEvent(new Event('input', { bubbles: true }));
                        } else {
                            inputDiv.textContent = prompt;
                            inputDiv.dispatchEvent(new Event('input', { bubbles: true }));
                        }

                        // Wait for UI to update
                        await new Promise(resolve => setTimeout(resolve, 500));

                        // Find and click send button
                        const sendButton = document.querySelector('button[aria-label*="Send"]') ||
                                         document.querySelector('button[data-test-id="send-button"]') ||
                                         document.querySelector('button:has(svg[aria-label*="Send"])') ||
                                         document.querySelector('button svg[data-icon="send"]')?.closest('button');

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
                            // Look for Gemini response indicators
                            const responseIndicators = [
                                '[data-response-id]',
                                '.model-response-container',
                                '.response-content',
                                'div[role="presentation"]:has(.markdown)',
                                '.gemini-response'
                            ];

                            for (const selector of responseIndicators) {
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
                            
                            // Find the latest response
                            const responseContainers = document.querySelectorAll('[data-response-id], .model-response-container');
                            const lastResponse = responseContainers[responseContainers.length - 1];
                            
                            if (!lastResponse) {
                                if (attempts >= maxAttempts) {
                                    reject(new Error('No response found'));
                                    return;
                                }
                                setTimeout(checkComplete, 2000);
                                return;
                            }

                            const currentLength = lastResponse.textContent.length;
                            
                            if (currentLength === lastLength) {
                                stableCount++;
                            } else {
                                stableCount = 0;
                                lastLength = currentLength;
                            }

                            // Check for completion
                            const isComplete = stableCount >= maxStableChecks ||
                                             !document.querySelector('.loading-indicator') ||
                                             !document.querySelector('[aria-label*="Generating"]');

                            if (isComplete) {
                                resolve(lastResponse.textContent.trim());
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
                    // Check if user is logged in to Gemini
                    const loginIndicators = [
                        'div[contenteditable="true"]',
                        'textarea[aria-label*="Enter a prompt"]',
                        'button[aria-label*="Send"]'
                    ];

                    for (const selector of loginIndicators) {
                        if (document.querySelector(selector)) {
                            return { loggedIn: true };
                        }
                    }

                    // Check for login requirements
                    const loginRequired = [
                        'button:contains("Sign in")',
                        'a[href*="accounts.google.com"]',
                        '.sign-in-required'
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
            if (message.action === 'automatePrompt' && message.provider === 'gemini') {
                this.automatePrompt(message.prompt)
                    .then(result => sendResponse(result))
                    .catch(error => sendResponse({ success: false, error: error.message }));
                return true;
            }
        });
    }

    async automatePrompt(prompt) {
        try {
            const loginStatus = await this.executeInPage('geminiAutomation.checkLoginStatus');
            
            if (!loginStatus.loggedIn) {
                return {
                    success: false,
                    error: 'Please log in to Gemini first',
                    needsLogin: true
                };
            }

            const result = await this.executeInPage('geminiAutomation.submitPrompt', prompt);
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
            const resultId = 'gemini_result_' + Date.now();
            
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

new GeminiAutomation();