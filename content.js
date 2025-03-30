chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'getPageType') {
    let pageType = 'unknown';
    
    if (window.location.href.includes('gemini.google.com')) {
      pageType = 'gemini';
    } else if (window.location.href.includes('chat.openai.com')) {
      pageType = 'chatgpt';
    } else if (window.location.href.includes('claude.ai')) {
      pageType = 'claude';
    }
    
    sendResponse({ pageType });
  }
}); 