# Gemini Chatbox (Local)

A lightweight local web app that keeps Gemini chats organized on disk.

## Purpose
- Lightweight wrapper to call Gemini via API without working in a notebook.
- Personal-use app that mimics the Gemini web experience for people who prefer API usage instead of a monthly subscription.
- No personal data or API keys are included in this repo; the app reads the key from local environment variables.

## What it does
- Runs a local web UI in your browser.
- Stores chat history in `data/chatbox.db` (SQLite).
- Lets you add/edit/delete model names.
- Keeps a local `interaction_id` per chat so you can continue the thread.

## Setup
1. Install Python dependencies:

```bash
pip install -r requirements.txt
```

2. Ensure your API key is set:

```bash
setx GEMINI_API_KEY "YOUR_KEY"
```

3. Double-click `start.bat`.

The app opens at http://127.0.0.1:8000

## Notes
- The app uses the `google.genai` interactions API and stores the latest `interaction_id` so chats can continue without resending full history.
- The default models are:
  - gemini-3-flash-preview
  - gemini-3-pro-preview
  - deep-research-pro-preview-12-2025

## Data location
- SQLite database: `data/chatbox.db`
- Static UI: `static/`
