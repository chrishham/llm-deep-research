# LLM Deep Research - Firefox Extension

A Firefox extension that allows users to submit research queries to multiple LLM providers simultaneously and save responses to Google Drive.

## Features

- **Multi-Provider Web Automation**: Automatically opens and submits queries to ChatGPT, Gemini, Claude, Grok, and DeepSeek web interfaces
- **Prompt Refinement**: Uses ChatGPT web interface to refine and improve your research queries
- **Google Drive Integration**: Automatically save all responses as Markdown files to Google Drive
- **Real-time Progress**: Monitor the progress of queries across all providers
- **No API Keys Required**: Works entirely through web automation - no paid API access needed
- **Modern UI**: Clean, responsive interface built with Tailwind CSS

## Installation

### Prerequisites
- Firefox browser
- Accounts with the LLM providers you want to use (ChatGPT, Gemini, Claude, Grok, DeepSeek)
- Google account for Drive integration

### Setup
1. Download or clone this repository
2. Install development dependencies:
   ```bash
   npm install
   ```

3. Log in to the LLM providers you want to use in Firefox

4. Load the extension in Firefox:
   - Open `about:debugging`
   - Click "This Firefox"
   - Click "Load Temporary Add-on"
   - Select the `manifest.json` file

### Development
```bash
# Run extension in development mode with auto-reload
npm run dev

# Build extension for distribution
npm run build

# Lint extension code
npm run lint

# Create zip file for distribution
npm run zip
```

## Configuration

### Provider Login
The extension works by automating the web interfaces of LLM providers. Make sure you're logged in to:

- **ChatGPT**: Log in at https://chat.openai.com
- **Gemini**: Log in at https://gemini.google.com
- **Claude**: Log in at https://claude.ai
- **Grok**: Log in at https://grok.x.ai
- **DeepSeek**: Log in at https://chat.deepseek.com

The extension will automatically open these sites and submit your queries.

### Google Drive
The extension will automatically prompt for Google Drive permissions when first used. It will create a folder called "LLM Research YYYY-MM-DD" for each research session.

## Usage

1. Click the extension icon to open the popup
2. Enter your research question in the text area
3. (Optional) Click "Refine Prompt" to improve your query using ChatGPT's web interface
4. Select which LLM providers you want to query
5. Click "Submit to All" - the extension will open tabs for each provider and submit your query
6. Monitor progress in real-time as each provider responds
7. Once complete, click "View Results in Drive" to see all responses

## File Structure

```
llm-deep-research/
├── manifest.json           # Extension manifest
├── popup/
│   ├── popup.html         # Extension popup interface
│   └── popup.js           # Popup logic and UI handling
├── background/
│   └── background.js      # Background script for API calls
├── content/
│   └── chatgpt.js         # ChatGPT automation script
├── styles/
│   └── popup.css          # Custom CSS styles
├── icons/
│   └── icon-*.svg         # Extension icons
└── src/
    ├── utils/             # Utility functions
    └── providers/         # Provider-specific implementations
```

## Privacy & Security

- No API keys required - works entirely through web automation
- All interactions happen directly in your browser with the providers' websites
- Google Drive integration only requests file creation permissions  
- No user data is collected or stored by this extension
- Uses your existing login sessions with each provider

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

MIT License - see LICENSE file for details

## Support

For issues and feature requests, please use the GitHub issue tracker.

## Roadmap

- [ ] Chrome extension port
- [ ] Custom provider configurations
- [ ] Response comparison tools
- [ ] Export to other formats (PDF, DOCX)
- [ ] Batch processing capabilities
- [ ] Response quality metrics# llm-deep-research
