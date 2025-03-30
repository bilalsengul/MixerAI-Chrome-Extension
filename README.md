# Mixer AI Chrome Extension

A Chrome extension that allows you to ask questions to multiple AI services (Gemini, ChatGPT, and Claude) simultaneously and compare their responses.

## Features

- Ask one question to Gemini, ChatGPT, and Claude all at once
- See responses from each AI side by side
- Uses your existing browser tabs with signed-in accounts (no API keys needed)
- Free to use with your existing AI subscriptions

## Installation

1. Clone or download this repository
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" using the toggle in the top-right corner
4. Click "Load unpacked" and select the folder containing this extension
5. The Mixer AI extension will now appear in your extensions list

## Usage

1. Open separate tabs for:
   - Gemini (https://gemini.google.com/)
   - ChatGPT (https://chat.openai.com/)
   - Claude (https://claude.ai/)
   
2. Sign in to each service with your accounts

3. Click the Mixer AI extension icon in your Chrome toolbar

4. Type your question in the textarea and click "Ask All AIs"

5. The extension will automatically send your question to each AI service and display their responses

## Troubleshooting

- If you don't see responses, make sure all three AI services are open in separate tabs and you're signed in
- If the extension can't find the input fields or buttons, it may be due to UI changes in the AI services. Please check for updates to the extension.
- Make sure you have granted the extension permissions to access the AI service websites

## Privacy

This extension operates entirely on your local machine and does not send any data to external servers. All communication happens between your browser tabs and the AI services you're already using.

## License

MIT 