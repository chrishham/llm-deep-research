class PopupController {
    constructor() {
        this.queryInput = document.getElementById('queryInput');
        this.refineBtn = document.getElementById('refineBtn');
        this.submitBtn = document.getElementById('submitBtn');
        this.mainForm = document.getElementById('mainForm');
        this.refinementDialog = document.getElementById('refinementDialog');
        this.refinedPrompt = document.getElementById('refinedPrompt');
        this.acceptRefinement = document.getElementById('acceptRefinement');
        this.rejectRefinement = document.getElementById('rejectRefinement');
        this.feedbackForm = document.getElementById('feedbackForm');
        this.feedbackInput = document.getElementById('feedbackInput');
        this.submitFeedback = document.getElementById('submitFeedback');
        this.cancelFeedback = document.getElementById('cancelFeedback');
        this.progressSection = document.getElementById('progressSection');
        this.progressList = document.getElementById('progressList');
        this.statusMessage = document.getElementById('statusMessage');
        this.settingsBtn = document.getElementById('settingsBtn');
        
        // New elements for results display
        this.resultsSection = document.getElementById('resultsSection');
        this.promptDisplay = document.getElementById('promptDisplay');
        this.aiResponsesGrid = document.getElementById('aiResponsesGrid');
        this.copyPromptBtn = document.getElementById('copyPromptBtn');
        this.copyAllResponsesBtn = document.getElementById('copyAllResponsesBtn');
        this.newQueryBtn = document.getElementById('newQueryBtn');

        this.currentQuery = '';
        this.finalPrompt = '';
        this.isProcessing = false;

        this.initEventListeners();
        this.loadSavedQuery();
        this.checkForSavedResults();
    }

    initEventListeners() {
        this.refineBtn.addEventListener('click', () => this.handleRefinePrompt());
        this.submitBtn.addEventListener('click', () => this.handleSubmitAll());
        this.acceptRefinement.addEventListener('click', () => this.handleAcceptRefinement());
        this.rejectRefinement.addEventListener('click', () => this.handleRejectRefinement());
        this.submitFeedback.addEventListener('click', () => this.handleSubmitFeedback());
        this.cancelFeedback.addEventListener('click', () => this.handleCancelFeedback());
        this.settingsBtn.addEventListener('click', () => this.handleSettings());
        
        // New event listeners for results display
        this.copyPromptBtn.addEventListener('click', () => this.handleCopyPrompt());
        this.copyAllResponsesBtn.addEventListener('click', () => this.handleCopyAllResponses());
        this.newQueryBtn.addEventListener('click', () => this.handleNewQuery());
        
        this.queryInput.addEventListener('input', () => this.saveQuery());
        
        // Auto-resize textarea
        this.queryInput.addEventListener('input', this.autoResizeTextarea);
        this.feedbackInput.addEventListener('input', this.autoResizeTextarea);
    }

    autoResizeTextarea(e) {
        e.target.style.height = 'auto';
        e.target.style.height = e.target.scrollHeight + 'px';
    }

    saveQuery() {
        this.getBrowserAPI().storage.local.set({ currentQuery: this.queryInput.value });
    }

    async loadSavedQuery() {
        try {
            const result = await this.getBrowserAPI().storage.local.get('currentQuery');
            if (result.currentQuery) {
                this.queryInput.value = result.currentQuery;
            }
        } catch (error) {
            console.error('Error loading saved query:', error);
        }
    }

    async checkForSavedResults() {
        // Removed saved results functionality
    }



    getBrowserAPI() {
        return typeof browser !== 'undefined' ? browser : chrome;
    }

    showStatus(message, type = 'info') {
        this.statusMessage.textContent = message;
        this.statusMessage.className = `mt-4 p-3 rounded-md status-${type}`;
        this.statusMessage.classList.remove('hidden');
        
        if (type !== 'error') {
            setTimeout(() => {
                this.statusMessage.classList.add('hidden');
            }, 3000);
        }
    }

    setButtonsDisabled(disabled) {
        this.refineBtn.disabled = disabled;
        this.submitBtn.disabled = disabled;
        this.acceptRefinement.disabled = disabled;
        this.rejectRefinement.disabled = disabled;
        this.submitFeedback.disabled = disabled;
    }

    async handleRefinePrompt() {
        const query = this.queryInput.value.trim();
        if (!query) {
            this.showStatus('Please enter a research query first.', 'error');
            return;
        }

        this.setButtonsDisabled(true);
        this.showStatus('Opening ChatGPT to refine your prompt...', 'info');

        try {
            const response = await this.sendToBackground('refinePrompt', { query });
            
            if (response.success) {
                this.showRefinementDialog(response.refinedPrompt);
            } else {
                this.showStatus(`Failed to refine prompt: ${response.error}`, 'error');
            }
        } catch (error) {
            this.showStatus('Error refining prompt. Please try again.', 'error');
            console.error('Refinement error:', error);
        } finally {
            this.setButtonsDisabled(false);
        }
    }

    showRefinementDialog(refinedPrompt) {
        this.refinedPrompt.textContent = refinedPrompt;
        this.mainForm.classList.add('hidden');
        this.refinementDialog.classList.remove('hidden');
        this.feedbackForm.classList.add('hidden');
    }

    handleAcceptRefinement() {
        this.finalPrompt = this.refinedPrompt.textContent;
        this.queryInput.value = this.finalPrompt;
        this.saveQuery();
        this.hideRefinementDialog();
        this.showStatus('Prompt refined successfully!', 'success');
    }

    handleRejectRefinement() {
        this.feedbackForm.classList.remove('hidden');
        this.feedbackInput.focus();
    }

    async handleSubmitFeedback() {
        const feedback = this.feedbackInput.value.trim();
        if (!feedback) {
            this.showStatus('Please provide feedback for refinement.', 'error');
            return;
        }

        this.setButtonsDisabled(true);
        this.showStatus('Sending feedback to ChatGPT for refinement...', 'info');

        try {
            const originalQuery = this.queryInput.value;
            const currentRefinement = this.refinedPrompt.textContent;
            
            const response = await this.sendToBackground('refineWithFeedback', {
                originalQuery,
                currentRefinement,
                feedback
            });

            if (response.success) {
                this.refinedPrompt.textContent = response.refinedPrompt;
                this.feedbackForm.classList.add('hidden');
                this.feedbackInput.value = '';
            } else {
                this.showStatus(`Failed to refine prompt: ${response.error}`, 'error');
            }
        } catch (error) {
            this.showStatus('Error refining prompt. Please try again.', 'error');
            console.error('Refinement error:', error);
        } finally {
            this.setButtonsDisabled(false);
        }
    }

    handleCancelFeedback() {
        this.feedbackForm.classList.add('hidden');
        this.feedbackInput.value = '';
    }

    hideRefinementDialog() {
        this.refinementDialog.classList.add('hidden');
        this.mainForm.classList.remove('hidden');
    }

    async handleSubmitAll() {
        const query = this.queryInput.value.trim();
        if (!query) {
            this.showStatus('Please enter a research query first.', 'error');
            return;
        }

        const selectedProviders = this.getSelectedProviders();
        if (selectedProviders.length === 0) {
            this.showStatus('Please select at least one LLM provider.', 'error');
            return;
        }

        this.isProcessing = true;
        this.setButtonsDisabled(true);
        
        // Clear previous results and show loading columns immediately
        this.showLoadingResults(selectedProviders, query);
        
        try {
            const response = await this.sendToBackground('submitToProviders', {
                prompt: query,
                providers: selectedProviders
            });

            if (response.success) {
                const providerNames = selectedProviders.map(p => p === 'openai' ? 'ChatGPT' : p.charAt(0).toUpperCase() + p.slice(1)).join(', ');
                this.showStatus(`Submitting to ${providerNames}... Please wait for the complete response.`, 'info');
                this.monitorProgress();
            } else {
                this.showStatus(`Failed to submit research: ${response.error}`, 'error');
            }
        } catch (error) {
            this.showStatus('Error submitting research. Please try again.', 'error');
            console.error('Submission error:', error);
        }
    }

    getSelectedProviders() {
        const checkboxes = document.querySelectorAll('.provider-checkbox:checked');
        return Array.from(checkboxes).map(cb => cb.value);
    }

    showLoadingResults(providers, query) {
        // Clear any previous results
        this.aiResponsesGrid.innerHTML = '';
        
        // Set the prompt display
        this.promptDisplay.value = query;
        
        // Create loading columns for each provider
        providers.forEach(provider => {
            this.createLoadingColumn(provider);
        });
        
        // Set up grid layout
        this.aiResponsesGrid.style.display = 'grid';
        this.aiResponsesGrid.style.gridTemplateColumns = `repeat(${providers.length}, 1fr)`;
        this.aiResponsesGrid.style.gap = '16px';
        
        // Hide main form and show results section
        this.mainForm.classList.add('hidden');
        this.progressSection.classList.add('hidden');
        this.resultsSection.classList.remove('hidden');
    }

    createLoadingColumn(provider) {
        const providerName = this.getProviderDisplayName(provider);
        const column = document.createElement('div');
        column.className = 'ai-response-column loading flex flex-col h-full';
        column.id = `column-${provider}`;
        column.innerHTML = `
            <div class="mb-2 flex items-center justify-between flex-shrink-0">
                <h4 class="text-sm font-semibold text-gray-800">${providerName}</h4>
                <div class="loading-indicator">
                    <div class="spinner"></div>
                </div>
            </div>
            <div class="flex-1 flex items-center justify-center loading-content">
                <div class="text-center">
                    <div class="text-lg mb-2 pulse-animation">⏳</div>
                    <div class="text-sm text-gray-600">Waiting for response...</div>
                </div>
            </div>
        `;
        
        this.aiResponsesGrid.appendChild(column);
    }

    async monitorProgress() {
        while (this.isProcessing) {
            try {
                const response = await this.sendToBackground('getProgress');
                this.updateProgress(response.progress);
                
                if (response.allCompleted) {
                    this.isProcessing = false;
                    this.showResults(response.progress);
                    break;
                }
                
                await new Promise(resolve => setTimeout(resolve, 2000));
            } catch (error) {
                console.error('Error monitoring progress:', error);
                break;
            }
        }
    }

    updateProgress(progressData) {
        Object.entries(progressData).forEach(([provider, status]) => {
            const column = document.getElementById(`column-${provider}`);
            if (column) {
                this.updateColumnStatus(column, provider, status);
            }
        });
    }

    updateColumnStatus(column, provider, status) {
        const loadingIndicator = column.querySelector('.loading-indicator');
        const loadingContent = column.querySelector('.loading-content');
        
        switch (status.status) {
            case 'running':
                column.className = 'ai-response-column loading flex flex-col h-full';
                if (loadingContent) {
                    loadingContent.innerHTML = `
                        <div class="text-center">
                            <div class="text-lg mb-2 pulse-animation">⏳</div>
                            <div class="text-sm text-blue-600">Generating response...</div>
                        </div>
                    `;
                }
                break;
            case 'completed':
                if (status.result) {
                    this.populateColumnWithResult(column, provider, status.result);
                }
                break;
            case 'failed':
                this.populateColumnWithError(column, provider, status.error || 'Unknown error');
                break;
        }
    }

    showResults(progressData) {
        // Final status check - count completed and failed providers
        const completedProviders = [];
        const failedProviders = [];
        
        Object.entries(progressData).forEach(([provider, data]) => {
            if (data.status === 'completed' && data.result) {
                completedProviders.push(this.getProviderDisplayName(provider));
            } else if (data.status === 'failed') {
                failedProviders.push(`${this.getProviderDisplayName(provider)}: ${data.error}`);
            }
        });
        
        // Save the first result for persistence
        const firstResult = Object.values(progressData).find(data => data.status === 'completed' && data.result);
        if (firstResult) {
            this.saveResults(firstResult.result);
        }
        
        // Show final status
        if (completedProviders.length > 0) {
            this.showStatus(`Completed: ${completedProviders.join(', ')}`, 'success');
        }
        if (failedProviders.length > 0) {
            this.showStatus(`Failed: ${failedProviders.join(', ')}`, 'error');
        }
    }
    
    getProviderDisplayName(provider) {
        const displayNames = {
            'openai': 'ChatGPT',
            'deepseek': 'DeepSeek',
            'gemini': 'Gemini',
            'claude': 'Claude',
            'grok': 'Grok'
        };
        return displayNames[provider] || provider.charAt(0).toUpperCase() + provider.slice(1);
    }
    
    populateColumnWithResult(column, provider, response) {
        const providerName = this.getProviderDisplayName(provider);
        column.className = 'ai-response-column completed flex flex-col h-full';
        column.innerHTML = `
            <div class="mb-2 flex items-center justify-between flex-shrink-0">
                <h4 class="text-sm font-semibold text-gray-800">${providerName}</h4>
                <button class="copy-response-btn text-xs bg-gray-500 hover:bg-gray-600 text-white px-2 py-1 rounded" data-provider="${providerName}">
                    Copy
                </button>
            </div>
            <textarea 
                class="w-full p-3 border border-gray-300 rounded-md bg-white text-sm font-mono resize-none flex-1"
                readonly
                placeholder="Response will appear here..."
            >${response}</textarea>
        `;
        
        // Add copy functionality to the individual copy button
        const copyBtn = column.querySelector('.copy-response-btn');
        copyBtn.addEventListener('click', () => {
            const textarea = column.querySelector('textarea');
            this.copyText(textarea.value, `${providerName} response`);
        });
    }

    populateColumnWithError(column, provider, error) {
        const providerName = this.getProviderDisplayName(provider);
        column.className = 'ai-response-column failed flex flex-col h-full';
        column.innerHTML = `
            <div class="mb-2 flex items-center justify-between flex-shrink-0">
                <h4 class="text-sm font-semibold text-gray-800">${providerName}</h4>
                <span class="text-xs text-red-600 font-medium">Failed</span>
            </div>
            <div class="flex-1 flex items-center justify-center">
                <div class="text-center text-red-600">
                    <div class="text-lg mb-2">❌</div>
                    <div class="text-sm">Failed to get response</div>
                    <div class="text-xs mt-1 text-gray-600">${error}</div>
                </div>
            </div>
        `;
    }

    saveResults(result) {
        try {
            const resultsData = {
                result: result,
                timestamp: new Date().toISOString(),
                query: this.queryInput.value
            };
            this.getBrowserAPI().storage.local.set({ lastResults: resultsData });
            console.log('Results saved to local storage');
        } catch (error) {
            console.error('Failed to save results:', error);
        }
    }

    async loadSavedResults() {
        try {
            const result = await this.getBrowserAPI().storage.local.get('lastResults');
            if (result.lastResults && result.lastResults.result) {
                console.log('Found saved results from:', result.lastResults.timestamp);
                return result.lastResults;
            }
        } catch (error) {
            console.error('Error loading saved results:', error);
        }
        return null;
    }

    async handleCopyPrompt() {
        try {
            await navigator.clipboard.writeText(this.promptDisplay.value);
            this.showStatus('Prompt copied to clipboard!', 'success');
        } catch (error) {
            console.error('Failed to copy prompt:', error);
            this.showStatus('Failed to copy prompt to clipboard', 'error');
        }
    }

    async handleCopyAllResponses() {
        try {
            const responses = [];
            const columns = this.aiResponsesGrid.querySelectorAll('.ai-response-column');
            
            columns.forEach(column => {
                const providerName = column.querySelector('h4').textContent;
                const response = column.querySelector('textarea').value;
                responses.push(`=== ${providerName} ===\n${response}\n`);
            });
            
            const combinedText = responses.join('\n');
            await navigator.clipboard.writeText(combinedText);
            this.showStatus('All responses copied to clipboard!', 'success');
        } catch (error) {
            console.error('Failed to copy responses:', error);
            this.showStatus('Failed to copy responses to clipboard', 'error');
        }
    }
    
    async copyText(text, description) {
        try {
            await navigator.clipboard.writeText(text);
            this.showStatus(`${description} copied to clipboard!`, 'success');
        } catch (error) {
            console.error(`Failed to copy ${description}:`, error);
            this.showStatus(`Failed to copy ${description} to clipboard`, 'error');
        }
    }

    handleNewQuery() {
        // Reset the UI back to the main form
        this.resultsSection.classList.add('hidden');
        this.progressSection.classList.add('hidden');
        this.mainForm.classList.remove('hidden');
        this.refinementDialog.classList.add('hidden');
        
        // Clear the AI responses grid and prompt display
        this.aiResponsesGrid.innerHTML = '';
        this.promptDisplay.value = '';
        
        // Clear the query input
        this.queryInput.value = '';
        this.saveQuery();
        
        // Reset state
        this.isProcessing = false;
        this.setButtonsDisabled(false);
        
        
        // Focus on query input
        this.queryInput.focus();
    }

    async handleViewResults() {
        try {
            const response = await this.sendToBackground('openDriveFolder');
            if (!response.success) {
                this.showStatus('Failed to open Google Drive folder.', 'error');
            }
        } catch (error) {
            this.showStatus('Error opening results.', 'error');
            console.error('Error opening results:', error);
        }
    }

    handleSettings() {
        // TODO: Implement settings panel
        this.showStatus('Settings panel coming soon!', 'info');
    }

    async sendToBackground(action, data = {}) {
        return new Promise((resolve, reject) => {
            const browserAPI = this.getBrowserAPI();
            const message = { action, ...data };
            
            console.log('Sending message to background:', message);
            
            browserAPI.runtime.sendMessage(message, response => {
                if (browserAPI.runtime.lastError) {
                    console.error('Runtime error:', browserAPI.runtime.lastError);
                    reject(browserAPI.runtime.lastError);
                } else if (!response) {
                    console.error('No response from background script');
                    reject(new Error('No response from background script'));
                } else {
                    console.log('Received response:', response);
                    resolve(response);
                }
            });
        });
    }
}

// Initialize popup when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new PopupController();
});