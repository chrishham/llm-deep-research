class BackgroundController {
    constructor() {
        this.processingJobs = new Map();
        this.initMessageListener();
        this.initBrowserActionListener();
        
        // Provider URLs for web automation
        this.providers = {
            openai: {
                name: 'OpenAI ChatGPT',
                url: 'https://chat.openai.com',
                newChatUrl: 'https://chat.openai.com/?model=gpt-4'
            },
            gemini: {
                name: 'Google Gemini',
                url: 'https://gemini.google.com',
                newChatUrl: 'https://gemini.google.com/app'
            },
            claude: {
                name: 'Anthropic Claude',
                url: 'https://claude.ai',
                newChatUrl: 'https://claude.ai/chat/new'
            },
            grok: {
                name: 'Grok',
                url: 'https://grok.x.ai',
                newChatUrl: 'https://grok.x.ai'
            },
            deepseek: {
                name: 'DeepSeek',
                url: 'https://chat.deepseek.com',
                newChatUrl: 'https://chat.deepseek.com'
            }
        };
    }

    getBrowserAPI() {
        return typeof browser !== 'undefined' ? browser : chrome;
    }

    initMessageListener() {
        const browserAPI = this.getBrowserAPI();
        browserAPI.runtime.onMessage.addListener((message, sender, sendResponse) => {
            console.log('Background received message:', message);
            this.handleMessage(message, sender, sendResponse);
            return true; // Keep message channel open for async response
        });
    }

    initBrowserActionListener() {
        const browserAPI = this.getBrowserAPI();
        browserAPI.browserAction.onClicked.addListener((tab) => {
            // Open popup as a new tab instead of popup
            browserAPI.tabs.create({
                url: 'popup/popup.html',
                active: true
            });
        });
    }

    async handleMessage(message, sender, sendResponse) {
        try {
            let response;
            console.log('Processing action:', message.action);

            switch (message.action) {
                case 'refinePrompt':
                    response = await this.refinePrompt(message.query);
                    break;
                case 'refineWithFeedback':
                    response = await this.refineWithFeedback(
                        message.originalQuery,
                        message.currentRefinement,
                        message.feedback
                    );
                    break;
                case 'submitToProviders':
                    response = await this.submitToProviders(message.prompt, message.providers);
                    break;
                case 'getProgress':
                    response = this.getProgress();
                    break;
                case 'openDriveFolder':
                    response = await this.openDriveFolder();
                    break;
                default:
                    response = { success: false, error: 'Unknown action' };
            }

            console.log('Sending response:', response);
            sendResponse(response);
        } catch (error) {
            console.error('Background script error:', error);
            const errorResponse = { success: false, error: error.message };
            console.log('Sending error response:', errorResponse);
            sendResponse(errorResponse);
        }
    }

    async refinePrompt(query) {
        try {
            // For testing purposes, provide a simple refined version
            // TODO: Replace with actual ChatGPT automation once tabs are working
            const refinedPrompt = `Research Analysis: ${query}

Please provide a comprehensive analysis that includes:
1. Current state and key developments in ${query}
2. Historical context and evolution
3. Major challenges and opportunities
4. Expert perspectives and diverse viewpoints
5. Data-driven insights and statistics where available
6. Future trends and implications
7. Actionable recommendations

Format your response with clear sections and cite relevant sources where possible.`;

            return {
                success: true,
                refinedPrompt: refinedPrompt
            };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    async refineWithFeedback(originalQuery, currentRefinement, feedback) {
        try {
            const refinementPrompt = `You are an expert research assistant. I need you to further refine a research query based on user feedback.

Original query: "${originalQuery}"
Current refined version: "${currentRefinement}"
User feedback: "${feedback}"

Please provide an improved version that addresses the user's feedback while maintaining the improvements from the current refinement.

Respond with only the refined query, no explanations or additional text.`;

            const result = await this.automateProvider('openai', refinementPrompt);
            
            if (result.success) {
                return {
                    success: true,
                    refinedPrompt: result.response
                };
            } else {
                return result;
            }
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    async submitToProviders(prompt, providers) {
        try {
            const jobId = Date.now().toString();
            const job = {
                id: jobId,
                prompt,
                providers: providers.reduce((acc, provider) => {
                    acc[provider] = { status: 'pending', result: null, error: null, tabId: null };
                    return acc;
                }, {}),
                startTime: new Date(),
                driveFolder: null
            };

            this.processingJobs.set(jobId, job);

            // Create Google Drive folder
            const driveResult = await this.createDriveFolderForResearch();
            if (driveResult.success) {
                job.driveFolder = driveResult.folderId;
                job.driveTabId = driveResult.tabId;
            }

            // Submit to all providers in parallel
            const promises = providers.map(provider => 
                this.submitToProvider(jobId, provider, prompt)
            );

            // Don't wait for all to complete, let them run async
            Promise.allSettled(promises);

            return { success: true, jobId };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    async submitToProvider(jobId, provider, prompt) {
        const job = this.processingJobs.get(jobId);
        if (!job) return;

        try {
            job.providers[provider].status = 'running';

            const result = await this.automateProvider(provider, prompt);

            if (result.success) {
                job.providers[provider].status = 'completed';
                job.providers[provider].result = result.response;
                
                // Save to Google Drive
                if (job.driveFolder) {
                    await this.saveToGoogleDrive(job.driveTabId, provider, result.response);
                }
            } else {
                job.providers[provider].status = 'failed';
                job.providers[provider].error = result.error;
            }
        } catch (error) {
            job.providers[provider].status = 'failed';
            job.providers[provider].error = error.message;
        }
    }

    async automateProvider(provider, prompt) {
        try {
            const providerConfig = this.providers[provider];
            if (!providerConfig) {
                throw new Error(`Unknown provider: ${provider}`);
            }

            // Create or find existing tab for this provider
            const tab = await this.getOrCreateProviderTab(provider);
            
            // Wait for tab to load
            await this.waitForTabLoad(tab.id);

            // Send automation message to content script
            const result = await this.sendMessageToTab(tab.id, {
                action: 'automatePrompt',
                provider: provider,
                prompt: prompt
            });

            return result;
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    async getOrCreateProviderTab(provider) {
        const browserAPI = this.getBrowserAPI();
        const providerConfig = this.providers[provider];
        
        // Try to find existing tab
        const tabs = await browserAPI.tabs.query({ url: `${providerConfig.url}/*` });
        
        if (tabs.length > 0) {
            // Use existing tab
            await browserAPI.tabs.update(tabs[0].id, { active: true });
            return tabs[0];
        } else {
            // Create new tab
            const tab = await browserAPI.tabs.create({
                url: providerConfig.newChatUrl || providerConfig.url,
                active: false
            });
            return tab;
        }
    }

    async waitForTabLoad(tabId, timeout = 15000) {
        const browserAPI = this.getBrowserAPI();
        return new Promise((resolve, reject) => {
            const startTime = Date.now();
            
            const checkTab = async () => {
                try {
                    const tab = await browserAPI.tabs.get(tabId);
                    
                    if (tab.status === 'complete') {
                        // Add additional delay to ensure content script is loaded
                        setTimeout(resolve, 2000);
                        return;
                    }
                    
                    if (Date.now() - startTime > timeout) {
                        reject(new Error('Tab load timeout'));
                        return;
                    }
                    
                    setTimeout(checkTab, 500);
                } catch (error) {
                    reject(error);
                }
            };
            
            checkTab();
        });
    }

    async sendMessageToTab(tabId, message, timeout = 10000) {
        const browserAPI = this.getBrowserAPI();
        return new Promise((resolve, reject) => {
            console.log(`Sending message to tab ${tabId}:`, message);
            
            // Add timeout to prevent hanging
            const timeoutId = setTimeout(() => {
                reject(new Error('Message timeout - content script may not be loaded'));
            }, timeout);

            browserAPI.tabs.sendMessage(tabId, message, (response) => {
                clearTimeout(timeoutId);
                
                console.log(`Response from tab ${tabId}:`, response, 'Error:', browserAPI.runtime.lastError);
                
                if (browserAPI.runtime.lastError) {
                    const error = browserAPI.runtime.lastError.message;
                    // Provide more specific error information
                    if (error.includes('Receiving end does not exist')) {
                        reject(new Error('Content script not loaded on tab. Please refresh the page and try again.'));
                    } else {
                        reject(new Error(error));
                    }
                } else {
                    resolve(response || { success: false, error: 'No response from content script' });
                }
            });
        });
    }

    async verifyContentScript(tabId, scriptPath) {
        const browserAPI = this.getBrowserAPI();
        
        // First, check if the content script is already responding
        try {
            const response = await this.sendMessageToTab(tabId, { action: 'ping' }, 3000);
            console.log('Initial ping response:', response);
            
            if (response && typeof response === 'object' && response.success === true) {
                console.log('Content script already loaded and responding');
                return true;
            }
        } catch (error) {
            console.log('Content script not responding to initial ping:', error.message);
        }

        // Check if script is already loaded but not responding by examining the page
        try {
            const checkScriptLoaded = await browserAPI.tabs.executeScript(tabId, {
                code: 'typeof window.GoogleDriveAutomation !== "undefined" && window.driveAutomation instanceof window.GoogleDriveAutomation'
            });
            
            if (checkScriptLoaded && checkScriptLoaded[0] === true) {
                console.log('Script is loaded but not responding, trying to reinitialize...');
                
                // Try to reinitialize the message listener
                await browserAPI.tabs.executeScript(tabId, {
                    code: `
                        if (window.driveAutomation && window.driveAutomation.setupMessageListener) {
                            window.driveAutomation.setupMessageListener();
                        }
                    `
                });
                
                await new Promise(resolve => setTimeout(resolve, 1000));
                
                // Try ping again
                const retryResponse = await this.sendMessageToTab(tabId, { action: 'ping' }, 3000);
                console.log('Retry ping response:', retryResponse);
                if (retryResponse && typeof retryResponse === 'object' && retryResponse.success === true) {
                    return true;
                }
            }
        } catch (checkError) {
            console.log('Could not check if script is loaded:', checkError.message);
        }

        // Script not loaded or not working, try manual injection
        console.log('Attempting manual script injection for', scriptPath);
        try {
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            await browserAPI.tabs.executeScript(tabId, { 
                file: scriptPath,
                runAt: 'document_idle'
            });
            
            await new Promise(resolve => setTimeout(resolve, 3000));
            
            const retryResponse = await this.sendMessageToTab(tabId, { action: 'ping' }, 5000);
            console.log('Final ping response:', retryResponse);
            
            return retryResponse && typeof retryResponse === 'object' && retryResponse.success === true;
        } catch (injectionError) {
            console.error('Failed to inject content script:', injectionError);
            return false;
        }
    }

    getProgress() {
        const activeJobs = Array.from(this.processingJobs.values());
        if (activeJobs.length === 0) {
            return { progress: {}, allCompleted: true };
        }

        const latestJob = activeJobs[activeJobs.length - 1];
        const progress = latestJob.providers;
        const allCompleted = Object.values(progress).every(p => 
            p.status === 'completed' || p.status === 'failed'
        );

        return { progress, allCompleted };
    }

    async createDriveFolderForResearch() {
        const folderName = `LLM Research ${new Date().toISOString().split('T')[0]}`;
        return await this.createDriveFolder(folderName);
    }

    async saveToGoogleDrive(driveTabId, provider, content) {
        try {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const filename = `${timestamp}_${provider}.md`;

            const result = await this.sendMessageToTab(driveTabId, {
                action: 'uploadFile',
                fileName: filename,
                content: content
            });

            return result.success;
        } catch (error) {
            console.error('Error saving to Google Drive:', error);
            return false;
        }
    }

    async createDriveFolder(folderName) {
        const browserAPI = this.getBrowserAPI();
        try {
            // Open Google Drive in a new tab
            const tab = await browserAPI.tabs.create({
                url: 'https://drive.google.com',
                active: false
            });

            // Wait for tab to load completely
            await this.waitForTabLoad(tab.id, 20000);
            
            // Verify content script is loaded and inject if necessary
            const scriptReady = await this.verifyContentScript(tab.id, 'content/googledrive.js');
            if (!scriptReady) {
                throw new Error('Failed to load Google Drive content script');
            }
            
            // Send message using the improved sendMessageToTab method
            const result = await this.sendMessageToTab(tab.id, {
                action: 'createFolder',
                folderName: folderName
            });

            if (result.success) {
                return { success: true, folderId: result.folderId, tabId: tab.id };
            } else {
                return { success: false, error: result.error };
            }
        } catch (error) {
            console.error('Drive folder creation error:', error);
            return { success: false, error: error.message };
        }
    }

    async openDriveFolder() {
        const browserAPI = this.getBrowserAPI();
        try {
            const activeJobs = Array.from(this.processingJobs.values());
            if (activeJobs.length === 0) {
                return { success: false, error: 'No active research jobs' };
            }

            const latestJob = activeJobs[activeJobs.length - 1];
            if (latestJob.driveFolder) {
                browserAPI.tabs.create({
                    url: `https://drive.google.com/drive/folders/${latestJob.driveFolder}`
                });
                return { success: true };
            } else {
                return { success: false, error: 'Drive folder not created' };
            }
        } catch (error) {
            return { success: false, error: error.message };
        }
    }
}

// Initialize background script
new BackgroundController();