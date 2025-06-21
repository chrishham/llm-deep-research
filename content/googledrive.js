// Google Drive automation script
if (typeof window.GoogleDriveAutomation === 'undefined') {
    class GoogleDriveAutomation {
        constructor() {
            this.isInitialized = false;
            this.setupMessageListener();
            this.isInitialized = true;
            console.log('Google Drive automation script initialized');
        }

        setupMessageListener() {
            const browserAPI = typeof browser !== 'undefined' ? browser : chrome;
            
            // Create bound handler if it doesn't exist
            if (!this.boundHandleMessage) {
                this.boundHandleMessage = this.handleMessage.bind(this);
            }
            
            // Remove any existing listeners to prevent duplicates
            if (browserAPI.runtime.onMessage.hasListener(this.boundHandleMessage)) {
                console.log('Removing existing message listener');
                browserAPI.runtime.onMessage.removeListener(this.boundHandleMessage);
            }
            
            console.log('Adding new message listener');
            browserAPI.runtime.onMessage.addListener(this.boundHandleMessage);
        }

    handleMessage(message, sender, sendResponse) {
        console.log('Google Drive content script received:', message);
        
        try {
            switch (message.action) {
                case 'ping':
                    console.log('Responding to ping with success');
                    sendResponse({ success: true, message: 'Google Drive content script ready' });
                    return false; // Synchronous response
                    
                case 'createFolder':
                    this.createFolder(message.folderName)
                        .then(result => {
                            console.log('Folder creation result:', result);
                            sendResponse(result);
                        })
                        .catch(error => {
                            console.error('Folder creation error:', error);
                            sendResponse({ success: false, error: error.message });
                        });
                    return true; // Asynchronous response
                    
                case 'uploadFile':
                    this.uploadFile(message.fileName, message.content, message.folderId)
                        .then(uploadResult => {
                            console.log('Upload result:', uploadResult);
                            sendResponse(uploadResult);
                        })
                        .catch(error => {
                            console.error('Upload error:', error);
                            sendResponse({ success: false, error: error.message });
                        });
                    return true; // Asynchronous response
                    
                default:
                    console.log('Unknown action:', message.action);
                    sendResponse({ success: false, error: 'Unknown action' });
                    return false; // Synchronous response
            }
        } catch (error) {
            console.error('Google Drive automation error:', error);
            sendResponse({ success: false, error: error.message });
            return false; // Synchronous response
        }
    }

    async waitForElement(selector, timeout = 10000) {
        return new Promise((resolve, reject) => {
            const element = document.querySelector(selector);
            if (element) {
                resolve(element);
                return;
            }

            const observer = new MutationObserver(() => {
                const element = document.querySelector(selector);
                if (element) {
                    observer.disconnect();
                    resolve(element);
                }
            });

            observer.observe(document.body, {
                childList: true,
                subtree: true
            });

            setTimeout(() => {
                observer.disconnect();
                reject(new Error(`Element ${selector} not found within ${timeout}ms`));
            }, timeout);
        });
    }

    async createFolder(folderName) {
        try {
            // Wait for Drive to load - updated selectors for new UI
            await this.waitForElement('.ZHllM, [data-tooltip="New"], [aria-label*="New"], .a-s-T', 15000);
            
            // Click "New" button - updated to handle new structure
            const newButton = document.querySelector('.ZHllM button.brbsPe') ||
                            document.querySelector('.ZHllM button') ||
                            document.querySelector('[data-tooltip="New"]') ||
                            document.querySelector('[aria-label*="New"]') ||
                            document.querySelector('.a-s-T') ||
                            Array.from(document.querySelectorAll('button')).find(btn => 
                                btn.textContent && btn.textContent.toLowerCase().includes('new'));
            
            if (!newButton) {
                throw new Error('Could not find New button');
            }
            
            console.log('Clicking New button:', newButton);
            newButton.click();

            // Wait for dropdown and click "Folder"
            await new Promise(resolve => setTimeout(resolve, 1500));
            
            // Try multiple selectors for the folder option
            const folderOption = document.querySelector('[role="menuitem"] [data-tooltip="Folder"]') || 
                                document.querySelector('[aria-label*="Folder"]') ||
                                document.querySelector('[role="menuitem"] span:contains("Folder")') ||
                                Array.from(document.querySelectorAll('[role="menuitem"], .VfPpkd-rymPhb-ibnC6b')).find(el => 
                                    el.textContent && el.textContent.toLowerCase().includes('folder')) ||
                                Array.from(document.querySelectorAll('div[role="menuitem"]')).find(el => 
                                    el.querySelector('span') && el.querySelector('span').textContent.toLowerCase().includes('folder'));
            
            if (!folderOption) {
                console.log('Available menu items:', Array.from(document.querySelectorAll('[role="menuitem"]')).map(el => el.textContent));
                throw new Error('Could not find Folder option in menu');
            }
            
            console.log('Clicking Folder option:', folderOption);
            folderOption.click();

            // Wait for folder name input and enter name
            await new Promise(resolve => setTimeout(resolve, 1500));
            
            // Updated selectors for new dialog
            const nameInput = document.querySelector('input[aria-label*="Name"]') ||
                            document.querySelector('input[aria-label*="name"]') ||
                            document.querySelector('input[placeholder*="folder"]') ||
                            document.querySelector('.docs-dialog input[type="text"]') ||
                            document.querySelector('div[role="dialog"] input[type="text"]') ||
                            document.querySelector('input[type="text"]:not([hidden])') ||
                            document.querySelector('[data-testid="folder-name-input"]');
            
            if (!nameInput) {
                console.log('Available inputs:', Array.from(document.querySelectorAll('input')).map(inp => ({
                    type: inp.type,
                    label: inp.getAttribute('aria-label'),
                    placeholder: inp.placeholder,
                    visible: inp.offsetParent !== null
                })));
                throw new Error('Could not find folder name input');
            }
            
            console.log('Found name input:', nameInput);
            nameInput.focus();
            nameInput.select();
            nameInput.value = folderName;
            nameInput.dispatchEvent(new Event('input', { bubbles: true }));
            nameInput.dispatchEvent(new Event('change', { bubbles: true }));

            // Click Create button - updated selectors
            await new Promise(resolve => setTimeout(resolve, 500));
            const createButton = document.querySelector('button[aria-label*="Create"]') ||
                               document.querySelector('button[data-mdc-dialog-action="ok"]') ||
                               document.querySelector('div[role="dialog"] button[data-mdc-dialog-action="accept"]') ||
                               document.querySelector('[data-testid="create-button"]') ||
                               Array.from(document.querySelectorAll('button')).find(btn => 
                                   btn.textContent && btn.textContent.toLowerCase().includes('create')) ||
                               Array.from(document.querySelectorAll('button')).find(btn => 
                                   btn.textContent && btn.textContent.toLowerCase().includes('ok'));
            
            if (!createButton) {
                console.log('Available buttons:', Array.from(document.querySelectorAll('button')).map(btn => btn.textContent));
                throw new Error('Could not find Create button');
            }
            
            console.log('Clicking Create button:', createButton);
            createButton.click();

            // Wait for folder to be created and get its ID
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            // Try to find the newly created folder
            const folderElement = Array.from(document.querySelectorAll('[data-target], .a-s-fa-Ha-pa, [role="gridcell"]')).find(el => 
                el.textContent && el.textContent.includes(folderName));
            
            const folderId = folderElement ? folderElement.getAttribute('data-target') : `folder_${Date.now()}`;

            return { success: true, folderId: folderId };
        } catch (error) {
            console.error('Create folder error:', error);
            return { success: false, error: error.message };
        }
    }

    async uploadFile(fileName, content, folderId) {
        try {
            // Navigate to the folder if folderId is provided
            if (folderId && folderId !== `folder_${Date.now()}`) {
                // Click on the folder to enter it
                const folderElement = document.querySelector(`[data-target="${folderId}"]`);
                if (folderElement) {
                    folderElement.click();
                    await new Promise(resolve => setTimeout(resolve, 2000));
                }
            }

            // Create a file blob
            const blob = new Blob([content], { type: 'text/plain' });
            const file = new File([blob], fileName, { type: 'text/plain' });

            // Try to find upload button or drag area
            const uploadButton = document.querySelector('[data-tooltip*="Upload"]') ||
                               document.querySelector('input[type="file"]');
            
            if (uploadButton) {
                if (uploadButton.tagName === 'INPUT') {
                    // Direct file input
                    const dataTransfer = new DataTransfer();
                    dataTransfer.items.add(file);
                    uploadButton.files = dataTransfer.files;
                    uploadButton.dispatchEvent(new Event('change', { bubbles: true }));
                } else {
                    // Click upload button first
                    uploadButton.click();
                    await new Promise(resolve => setTimeout(resolve, 1000));
                    
                    const fileInput = document.querySelector('input[type="file"]');
                    if (fileInput) {
                        const dataTransfer = new DataTransfer();
                        dataTransfer.items.add(file);
                        fileInput.files = dataTransfer.files;
                        fileInput.dispatchEvent(new Event('change', { bubbles: true }));
                    }
                }
            } else {
                // Try drag and drop to main area
                const dropArea = document.querySelector('[role="main"]') || document.body;
                const dropEvent = new DragEvent('drop', {
                    bubbles: true,
                    cancelable: true,
                    dataTransfer: new DataTransfer()
                });
                dropEvent.dataTransfer.items.add(file);
                dropArea.dispatchEvent(dropEvent);
            }

            return { success: true, fileName: fileName };
        } catch (error) {
            console.error('Upload file error:', error);
            return { success: false, error: error.message };
        }
    }
    }

    // Initialize the automation when the script loads
    window.GoogleDriveAutomation = GoogleDriveAutomation;
    window.driveAutomation = new GoogleDriveAutomation();
} else {
    console.log('Google Drive automation script already loaded');
}