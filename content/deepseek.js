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

        // Due to CSP restrictions, we'll handle automation directly in the content script
        // instead of injecting a script into the page
        window.deepseekAutomation = {
                async submitPrompt(prompt) {
                    try {
                        console.log('DeepSeek automation starting...');
                        console.log('Current URL:', window.location.href);
                        console.log('Page title:', document.title);
                        
                        // Wait for DeepSeek's input area
                        console.log('Waiting for input elements...');
                        await this.waitForElement('textarea, [contenteditable="true"], #chat-input', 15000);
                        
                        // Find the input field
                        console.log('Looking for input field...');
                        const inputField = document.querySelector('#chat-input') ||
                                         document.querySelector('textarea[placeholder*="Ask DeepSeek"]') ||
                                         document.querySelector('textarea[placeholder*="Type a message"]') ||
                                         document.querySelector('div[contenteditable="true"]') ||
                                         document.querySelector('textarea[data-testid="chat-input"]') ||
                                         document.querySelector('textarea');
                        
                        console.log('Input field found:', inputField);
                        if (!inputField) {
                            console.log('Available textareas:', document.querySelectorAll('textarea'));
                            console.log('Available contenteditable elements:', document.querySelectorAll('[contenteditable="true"]'));
                            throw new Error('Could not find DeepSeek input field');
                        }

                        // Use the proper DeepSeek method to fill the textarea
                        console.log('Setting text in DeepSeek input field:', prompt.substring(0, 50) + '...');
                        
                        // DeepSeek uses a contenteditable div that requires innerHTML with <p> tag
                        if (inputField.id === 'chat-input') {
                            console.log('Using DeepSeek-specific method for chat-input');
                            
                            // Clear any existing placeholder content and add the new text inside a paragraph
                            inputField.innerHTML = prompt;
                            console.log('Set innerHTML with <p> tag');
                            
                            // Set focus to the input area
                            inputField.focus();
                            
                            // Dispatch an 'input' event to let the web application know the content has changed
                            const inputEvent = new Event('input', {
                                bubbles: true,
                                cancelable: true,
                            });
                            inputField.dispatchEvent(inputEvent);
                            console.log('Dispatched input event');
                            
                        } else {
                            console.log('Using fallback method for other input types');
                            // Fallback for other input types
                            if (inputField.tagName === 'TEXTAREA') {
                                inputField.value = prompt;
                                inputField.dispatchEvent(new Event('input', { bubbles: true }));
                            } else if (inputField.contentEditable === 'true') {
                                inputField.innerHTML = '<p>' + prompt + '</p>';
                                inputField.dispatchEvent(new Event('input', { bubbles: true }));
                            }
                        }
                        
                        // Verify the text was set correctly
                        const currentContent = inputField.innerHTML || inputField.value || inputField.textContent;
                        console.log('Final content check:', currentContent.substring(0, 100) + '...');

                        // Wait for UI to update
                        await new Promise(resolve => setTimeout(resolve, 1000));

                        // Find send button
                        console.log('Looking for send button...');
                        const sendButton = document.querySelector('button[aria-label*="Send"]') ||
                                         document.querySelector('[data-testid="send-button"]') ||
                                         document.querySelector('button[type="submit"]') ||
                                         document.querySelector('button:has(svg)') ||
                                         document.querySelector('form button') ||
                                         Array.from(document.querySelectorAll('button')).find(btn => {
                                             const text = btn.textContent.toLowerCase();
                                             return text.includes('send') || text.includes('submit') || 
                                                    btn.querySelector('svg') || btn.querySelector('path');
                                         });

                        console.log('Send button found:', sendButton);
                        if (!sendButton || sendButton.disabled) {
                            console.log('Available buttons:', document.querySelectorAll('button'));
                            console.log('Send button not found, trying Enter key...');
                            
                            // Fallback: try pressing Enter key
                            inputField.focus();
                            const enterEvent = new KeyboardEvent('keydown', {
                                key: 'Enter',
                                code: 'Enter',
                                keyCode: 13,
                                which: 13,
                                bubbles: true
                            });
                            inputField.dispatchEvent(enterEvent);
                            
                            // Also try keyup
                            const enterUpEvent = new KeyboardEvent('keyup', {
                                key: 'Enter',
                                code: 'Enter',
                                keyCode: 13,
                                which: 13,
                                bubbles: true
                            });
                            inputField.dispatchEvent(enterUpEvent);
                            
                            console.log('Enter key pressed');
                        } else {
                            console.log('Clicking send button...');
                            sendButton.click();
                        }

                        // Wait for response
                        console.log('Waiting for response to start...');
                        await this.waitForResponse();
                        console.log('Response started, waiting for completion...');
                        const response = await this.waitForCompleteResponse();
                        console.log('Response completed:', response.substring(0, 100) + '...');
                        
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
                            reject(new Error('Element ' + selector + ' not found within timeout'));
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
                                '.ds-markdown-paragraph',
                                'p.ds-markdown-paragraph',
                                '[data-role="assistant"]',
                                '.message-content',
                                '.deepseek-response',
                                '.assistant-message',
                                '.response-text',
                                '.markdown-content',
                                '[role="assistant"]',
                                '.message[data-role="assistant"]',
                                '.chat-message',
                                '.response-message'
                            ];
                            
                            console.log('Checking for response indicators...');
                            for (const selector of responseIndicators) {
                                const elements = document.querySelectorAll(selector);
                                console.log('Selector ' + selector + ': found ' + elements.length + ' elements');
                                if (elements.length > 0) {
                                    console.log('Response detected!');
                                    resolve();
                                    return;
                                }
                            }
                            
                            // Also check for any new messages in the chat
                            const allMessages = document.querySelectorAll('.message, [class*="message"], [class*="chat"]');
                            console.log('Total messages found: ' + allMessages.length);
                            if (allMessages.length > 0) {
                                console.log('Messages detected, checking for new content...');
                                // Simple check: if there are more elements than before
                                if (!window.deepseekMessageCount) {
                                    window.deepseekMessageCount = allMessages.length;
                                } else if (allMessages.length > window.deepseekMessageCount) {
                                    console.log('New message detected!');
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
                            const responseMessages = document.querySelectorAll('.ds-markdown-paragraph, p.ds-markdown-paragraph, [data-role="assistant"], [role="assistant"], .message-content, .deepseek-response, .assistant-message, .message[data-role="assistant"]');
                            let lastMessage = responseMessages[responseMessages.length - 1];
                            
                            // If no specific response found, try to find any messages and get the last one
                            if (!lastMessage) {
                                const allMessages = document.querySelectorAll('.message, [class*="message"], [class*="chat"]');
                                console.log('No specific response found, checking all messages: ' + allMessages.length);
                                if (allMessages.length > 1) {
                                    lastMessage = allMessages[allMessages.length - 1]; // Get the last message
                                }
                            }
                            
                            console.log('Last message element:', lastMessage);
                            
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
                                // For DeepSeek, collect all markdown paragraphs from the latest response
                                const allMarkdownParagraphs = document.querySelectorAll('.ds-markdown-paragraph, p.ds-markdown-paragraph');
                                if (allMarkdownParagraphs.length > 0) {
                                    // Get all paragraphs from what appears to be the latest message
                                    const responseText = Array.from(allMarkdownParagraphs)
                                        .map(p => p.textContent.trim())
                                        .filter(text => text.length > 0)
                                        .join('\n\n');
                                    console.log('Collected DeepSeek response:', responseText.substring(0, 100) + '...');
                                    resolve(responseText);
                                } else {
                                    resolve(lastMessage.textContent.trim());
                                }
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
                    console.log('Checking DeepSeek login status...');
                    console.log('Current URL:', window.location.href);
                    console.log('Page title:', document.title);
                    
                    // Check if user is logged in to DeepSeek
                    const loginIndicators = [
                        '#chat-input',
                        'textarea[placeholder*="Ask DeepSeek"]',
                        'textarea[placeholder*="Type a message"]',
                        'div[contenteditable="true"]',
                        'textarea[data-testid="chat-input"]'
                    ];

                    for (const selector of loginIndicators) {
                        const element = document.querySelector(selector);
                        console.log('Checking login indicator ' + selector + ':', element);
                        if (element) {
                            return { loggedIn: true };
                        }
                    }

                    // Check for login requirements
                    const loginRequired = [
                        'button:contains("Log in")',
                        'button:contains("Sign in")',
                        'a[href*="login"]',
                        '.login-form',
                        'button:contains("登录")',  // Chinese login button
                        '[data-testid="login"]',
                        '.login-button'
                    ];

                    for (const selector of loginRequired) {
                        const element = document.querySelector(selector);
                        console.log('Checking login required indicator ' + selector + ':', element);
                        if (element) {
                            return { loggedIn: false, needsLogin: true };
                        }
                    }

                    // If page doesn't seem to be loading properly
                    if (document.body.innerText.length < 100) {
                        console.log('Page seems empty, might be loading...');
                        return { loggedIn: false, needsLogin: false, pageLoading: true };
                    }

                    return { loggedIn: false, needsLogin: false };
                }
            };
        
        this.isInjected = true;
    }

    setupMessageListener() {
        if (this.messageListener) return;

        browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
            if (message.action === 'ping') {
                sendResponse({ success: true, provider: 'deepseek' });
                return true;
            }
            
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
            console.log('DeepSeek automatePrompt called with:', prompt.substring(0, 100) + '...');
            
            // Call automation functions directly instead of injecting scripts
            const loginStatus = await window.deepseekAutomation.checkLoginStatus();
            console.log('Login status:', loginStatus);
            
            if (loginStatus.pageLoading) {
                return {
                    success: false,
                    error: 'DeepSeek page is still loading. Please wait and try again.'
                };
            }
            
            if (!loginStatus.loggedIn) {
                if (loginStatus.needsLogin) {
                    return {
                        success: false,
                        error: 'Please log in to DeepSeek first. Visit https://chat.deepseek.com/ and log in, then try again.',
                        needsLogin: true
                    };
                } else {
                    return {
                        success: false,
                        error: 'DeepSeek interface not found. The page might not have loaded properly or the interface has changed.'
                    };
                }
            }

            console.log('Login check passed, submitting prompt...');
            const result = await window.deepseekAutomation.submitPrompt(prompt);
            console.log('Automation result:', result);
            return result;
        } catch (error) {
            console.error('DeepSeek automation error:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

}

new DeepSeekAutomation();