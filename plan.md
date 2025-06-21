# LLM Deep Research – Firefox Extension (Chrome Port Planned)

## Goal  
Provide a single GUI that lets users enter, refine and dispatch a deep-research prompt to all major LLMs, then save each model’s response as `.md`/`.docx` in Google Drive.

---

## 1. User Interface  
- Toolbar icon → popup window styled with **Tailwind CSS**  
- Text area for **Initial Query**  
- **Refine Prompt** button triggers an **HTMX**-driven dialog:  
  1. Send the user’s query to ChatGPT for reformulation  
  2. Display the suggested revision inline  
  3. Ask “Does this capture your intent?”  
     - If **No**: show an HTMX form to collect feedback and re-submit for refinement  
     - If **Yes**: lock in the final prompt and proceed  

---

## 2. ChatGPT Integration & Authentication  
- Background script opens `https://chatgpt.com/' in a hidden tab on first use (or when logout is detected)  
- Auto-login via stored browser credentials or prompt manual login  
- Content scripts inject and submit the prompt/refinement cycle  

---

## 3. Multi-Provider Submission  
After user confirmation, send the final prompt **in parallel** to:  
- **OpenAI ChatGPT** (latest “Turbo” or reasoning mode)  
- **Google Gemini** (“Ultra” mode)  
- **Grok** (“Deliberation” mode)  
- **Anthropic Claude** (latest steerable mode)  
- **DeepSeek** (research-level model)  

Implementation via each provider’s REST API or SDK, handled asynchronously.

---

## 4. Results Storage  
1. On first run, request **Google Drive OAuth2** authorization  
2. Create (or locate) a Drive folder named `LLM Deep Research`  
3. For each provider response:  
   - Save as Markdown (`.md`) and Word (`.docx`)  
   - Filename format: `YYYYMMDD_HHMMSS_providerName.md` / `.docx`  
   - Upload into the `LLM Deep Research` folder  

---

## 5. Architecture & Tech Stack  

### Frontend (Extension UI)  
- **WebExtensions API** (Firefox, cross-browser compatible)  
- **Tailwind CSS** for styling  
- **HTMX** for inline interactions  

### Backend Services (if required)  
- **Go + Gin** framework for any server-side proxy, auth handling, or orchestration  

### Extension Background Script  
- Manages multi-provider API calls (`fetch`/`axios`)  
- Handles Google Drive OAuth2 flow and file uploads  

### Content Scripts  
- Automate `chat.openai.com` login  
- Automate prompt injection and submission  

### Future Chrome Support  
- Adhere to the WebExtensions spec  
- Abstract Firefox-only APIs via polyfills or conditional logic  