# LLM Deep Research - Firefox Extension

## Project Overview
A Firefox extension that allows users to submit research queries to multiple LLM providers simultaneously and save responses to Google Drive.

## Tech Stack
- **Frontend**: WebExtensions API, Tailwind CSS, HTMX
- **Backend**: Go + Gin (for proxy/auth if needed)
- **Storage**: Google Drive API integration
- **LLM Providers**: OpenAI, Google Gemini, Grok, Anthropic Claude, DeepSeek

## Development Commands
```bash
# Install dependencies
npm install

# Run extension in development mode with auto-reload
npm run dev

# Build extension for distribution
npm run build

# Lint extension code
npm run lint

# Create zip file for distribution
npm run zip

# Start Firefox with extension loaded
npm start
```

## Project Structure
- `manifest.json` - Extension manifest
- `popup/` - Extension popup UI
- `background/` - Background scripts for API calls
- `content/` - Content scripts for ChatGPT automation
- `styles/` - Tailwind CSS styles
- `src/` - Core application logic

## Key Features
1. **Web Automation**: Automates web interfaces of ChatGPT, Gemini, Claude, Grok, and DeepSeek
2. **Prompt Refinement**: Uses ChatGPT web interface for query improvement
3. **Multi-Provider Support**: Parallel submission to 5+ LLM providers via browser automation
4. **Google Drive Integration**: OAuth2 authentication and file storage
5. **No API Keys**: Works entirely through web automation - no paid API access needed
6. **Cross-Browser Ready**: Built with WebExtensions standard for Chrome compatibility

## Development Notes
- Use WebExtensions API for cross-browser compatibility
- Implement OAuth2 flow for Google Drive access
- Handle web automation timing and error conditions
- Content scripts inject automation logic into each provider's website
- Background script manages tab creation and coordination
- Follow Firefox extension security guidelines