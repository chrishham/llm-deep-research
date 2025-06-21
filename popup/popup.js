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
        this.viewResultsBtn = document.getElementById('viewResultsBtn');
        this.statusMessage = document.getElementById('statusMessage');
        this.settingsBtn = document.getElementById('settingsBtn');

        this.currentQuery = '';
        this.finalPrompt = '';
        this.isProcessing = false;

        this.initEventListeners();
        this.loadSavedQuery();
    }

    initEventListeners() {
        this.refineBtn.addEventListener('click', () => this.handleRefinePrompt());
        this.submitBtn.addEventListener('click', () => this.handleSubmitAll());
        this.acceptRefinement.addEventListener('click', () => this.handleAcceptRefinement());
        this.rejectRefinement.addEventListener('click', () => this.handleRejectRefinement());
        this.submitFeedback.addEventListener('click', () => this.handleSubmitFeedback());
        this.cancelFeedback.addEventListener('click', () => this.handleCancelFeedback());
        this.viewResultsBtn.addEventListener('click', () => this.handleViewResults());
        this.settingsBtn.addEventListener('click', () => this.handleSettings());
        
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
        this.showProgressSection(selectedProviders);
        
        try {
            const response = await this.sendToBackground('submitToProviders', {
                prompt: query,
                providers: selectedProviders
            });

            if (response.success) {
                this.showStatus('Opening tabs and submitting to all providers!', 'success');
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

    showProgressSection(providers) {
        this.progressList.innerHTML = '';
        
        providers.forEach(provider => {
            const item = document.createElement('div');
            item.className = 'progress-item progress-pending';
            item.innerHTML = `
                <span class="font-medium capitalize">${provider}</span>
                <span class="text-sm text-gray-500">Pending</span>
            `;
            item.id = `progress-${provider}`;
            this.progressList.appendChild(item);
        });

        this.mainForm.classList.add('hidden');
        this.progressSection.classList.remove('hidden');
    }

    async monitorProgress() {
        while (this.isProcessing) {
            try {
                const response = await this.sendToBackground('getProgress');
                this.updateProgress(response.progress);
                
                if (response.allCompleted) {
                    this.isProcessing = false;
                    this.viewResultsBtn.classList.remove('hidden');
                    this.showStatus('Research completed! Results saved to Google Drive.', 'success');
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
            const item = document.getElementById(`progress-${provider}`);
            if (item) {
                const statusSpan = item.querySelector('.text-sm');
                item.className = `progress-item progress-${status.status}`;
                
                switch (status.status) {
                    case 'running':
                        statusSpan.innerHTML = '<div class="spinner"></div>';
                        break;
                    case 'completed':
                        statusSpan.innerHTML = '<span class="text-green-600">✓ Completed</span>';
                        break;
                    case 'failed':
                        statusSpan.innerHTML = '<span class="text-red-600">✗ Failed</span>';
                        break;
                    default:
                        statusSpan.innerHTML = '<span class="text-gray-500">Pending</span>';
                }
            }
        });
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