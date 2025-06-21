class BackgroundController {
    constructor() {
        this.processingJobs = new Map();
        this.initMessageListener();
        
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

    initMessageListener() {
        browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
            this.handleMessage(message, sender, sendResponse);
            return true; // Keep message channel open for async response
        });
    }

    async handleMessage(message, sender, sendResponse) {
        try {
            let response;

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

            sendResponse(response);
        } catch (error) {
            console.error('Background script error:', error);
            sendResponse({ success: false, error: error.message });
        }
    }

    async refinePrompt(query) {
        try {
            // Create or find ChatGPT tab for refinement
            const refinementPrompt = `You are an expert research assistant. Please refine and improve the following research query to make it more specific, comprehensive, and likely to yield high-quality results from AI language models.

Original query: "${query}"

Please provide a refined version that:
1. Is more specific and focused
2. Includes relevant context and scope
3. Suggests the type of analysis or perspective needed
4. Is clear about the desired output format

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
            const driveResult = await this.createDriveFolder();
            if (driveResult.success) {
                job.driveFolder = driveResult.folderId;
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
                    await this.saveToGoogleDrive(job.driveFolder, provider, result.response);
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
        const providerConfig = this.providers[provider];
        
        // Try to find existing tab
        const tabs = await browser.tabs.query({ url: `${providerConfig.url}/*` });
        
        if (tabs.length > 0) {
            // Use existing tab
            await browser.tabs.update(tabs[0].id, { active: true });
            return tabs[0];
        } else {
            // Create new tab
            const tab = await browser.tabs.create({
                url: providerConfig.newChatUrl || providerConfig.url,
                active: false
            });
            return tab;
        }
    }

    async waitForTabLoad(tabId, timeout = 10000) {
        return new Promise((resolve, reject) => {
            const startTime = Date.now();
            
            const checkTab = async () => {
                try {
                    const tab = await browser.tabs.get(tabId);
                    
                    if (tab.status === 'complete') {
                        resolve();
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

    async sendMessageToTab(tabId, message) {
        return new Promise((resolve, reject) => {
            browser.tabs.sendMessage(tabId, message, (response) => {
                if (browser.runtime.lastError) {
                    reject(new Error(browser.runtime.lastError.message));
                } else {
                    resolve(response || { success: false, error: 'No response from content script' });
                }
            });
        });
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

    async createDriveFolder() {
        try {
            // Get OAuth token
            const token = await this.getGoogleAuthToken();
            if (!token) {
                return { success: false, error: 'Google Drive authentication failed' };
            }

            const folderName = `LLM Research ${new Date().toISOString().split('T')[0]}`;
            
            const response = await fetch('https://www.googleapis.com/drive/v3/files', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    name: folderName,
                    mimeType: 'application/vnd.google-apps.folder',
                    parents: ['root']
                })
            });

            if (!response.ok) {
                throw new Error(`Drive API error: ${response.status}`);
            }

            const data = await response.json();
            return { success: true, folderId: data.id };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    async saveToGoogleDrive(folderId, provider, content) {
        try {
            const token = await this.getGoogleAuthToken();
            if (!token) return;

            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const filename = `${timestamp}_${provider}.md`;

            // Create file metadata
            const metadata = {
                name: filename,
                parents: [folderId]
            };

            // Create multipart upload
            const delimiter = '-------314159265358979323846';
            const close_delim = `\r\n--${delimiter}--`;
            
            let body = `--${delimiter}\r\n`;
            body += 'Content-Type: application/json\r\n\r\n';
            body += JSON.stringify(metadata) + '\r\n';
            body += `--${delimiter}\r\n`;
            body += 'Content-Type: text/markdown\r\n\r\n';
            body += content;
            body += close_delim;

            const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': `multipart/related; boundary="${delimiter}"`
                },
                body: body
            });

            return response.ok;
        } catch (error) {
            console.error('Error saving to Google Drive:', error);
            return false;
        }
    }

    async getGoogleAuthToken() {
        try {
            const result = await browser.identity.getAuthToken({ 
                interactive: true,
                scopes: ['https://www.googleapis.com/auth/drive.file']
            });
            return result.token;
        } catch (error) {
            console.error('Google auth error:', error);
            return null;
        }
    }

    async openDriveFolder() {
        try {
            const activeJobs = Array.from(this.processingJobs.values());
            if (activeJobs.length === 0) {
                return { success: false, error: 'No active research jobs' };
            }

            const latestJob = activeJobs[activeJobs.length - 1];
            if (latestJob.driveFolder) {
                browser.tabs.create({
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