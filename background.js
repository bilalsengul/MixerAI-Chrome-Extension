chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
  if (message.action === 'findAITabs') {
    findAITabs().then(sendResponse).catch(error => {
      console.error('Error finding AI tabs:', error);
      sendResponse({ error: error.message });
    });
    return true; // Indicates async response
  }
  
  if (message.action === 'askAI') {
    console.log(`Attempting to ask ${message.ai} in tab ${message.tabId}`);
    askAI(message.ai, message.tabId, message.question)
      .then(sendResponse)
      .catch(error => {
        console.error(`Error asking ${message.ai}:`, error);
        // Send the error response back to the popup
        chrome.runtime.sendMessage({
          action: 'aiResponse',
          ai: message.ai,
          response: `Error: ${error.message}`
        });
        sendResponse({ error: error.message });
      });
    return true; // Indicates async response
  }
});

chrome.runtime.onConnect.addListener(function(port) {
  if (port.name === 'aiResponse') {
    console.log('Connection established for aiResponse');
    port.onMessage.addListener(function(message) {
      if (message.action === 'aiResponse') {
        console.log(`Received response from ${message.ai}:`, message.response.substring(0, 100) + '...');
        chrome.runtime.sendMessage({
          action: 'aiResponse',
          ai: message.ai,
          response: message.response
        });
      }
    });
  }
});

async function findAITabs() {
  const tabs = await chrome.tabs.query({});
  console.log('All tabs:', tabs.map(t => ({ id: t.id, url: t.url })));
  
  const aiTabs = {
    gemini: findTabWithPattern(tabs, ['gemini.google.com']),
    chatgpt: findTabWithPattern(tabs, ['chat.openai.com']),
    claude: findTabWithPattern(tabs, ['claude.ai'])
  };
  
  console.log('AI tabs found:', aiTabs);
  return aiTabs;
}

// Helper function to find tab with multiple possible URL patterns
function findTabWithPattern(tabs, patterns) {
  for (const pattern of patterns) {
    const tab = tabs.find(tab => tab.url && tab.url.includes(pattern));
    if (tab) return tab;
  }
  return null;
}

async function askAI(ai, tabId, question) {
  try {
    console.log(`Executing script in ${ai} tab ${tabId}`);
    await chrome.scripting.executeScript({
      target: { tabId: tabId },
      func: injectQuestion,
      args: [ai, question]
    });
    return { success: true };
  } catch (error) {
    console.error(`Error injecting script into ${ai} tab:`, error);
    throw error;
  }
}

// Change to func instead of function to fix Chrome MV3 issues
async function injectQuestion(ai, question) {
  console.log(`Running injectQuestion for ${ai} with question: ${question}`);
  const port = chrome.runtime.connect({ name: 'aiResponse' });
  
  let inputElement, sendButton;

  // Multiple possible selectors to try
  const selectors = {
    gemini: {
      input: [
        'textarea[aria-label="Input for sending a message"]',
        'textarea[placeholder="Enter a prompt here"]',
        'textarea.message-input',
        '.ProseMirror',
        'div[contenteditable="true"]'
      ],
      button: [
        'button[aria-label="Send message"]',
        'button.send-button',
        'button:has(svg)',
        'button[data-testid="send-button"]'
      ],
      response: [
        '.gemini-response-container',
        '.response-container',
        '.model-response',
        '.response-message',
        '.message-content',
        '.message-body',
        'div[data-testid="llm-response"]'
      ]
    },
    chatgpt: {
      input: [
        '#prompt-textarea',
        'textarea[data-id="root"]',
        'textarea[placeholder="Message ChatGPT…"]',
        'textarea'
      ],
      button: [
        'button[data-testid="send-button"]',
        'button.send-button',
        'button:has(svg)',
        'button[aria-label="Send message"]'
      ],
      response: [
        '.markdown',
        '[data-message-author-role="assistant"]',
        '.assistant-message',
        '.response-content',
        '.text-message-content',
        'div[data-testid="conversation-turn-"]',
        'div[data-message-author-role="assistant"]'
      ]
    },
    claude: {
      input: [
        'div[contenteditable="true"]',
        '.ProseMirror',
        'div[role="textbox"]',
        'textarea[placeholder="Message Claude…"]',
        '[data-slate-editor="true"]'
      ],
      button: [
        'button[aria-label="Send message"]',
        'button.send-button',
        'button:has(svg)',
        'button[type="submit"]',
        'button.sendButton'
      ],
      response: [
        '.claude-response',
        '.assistant-message',
        '.response-content',
        '[data-message-author-role="assistant"]',
        '.message-container:last-child',
        '.prose',
        '.chat-message-container .chat-message'
      ]
    }
  };
  
  try {
    // Log all available elements for debugging
    console.log('Available textareas:', Array.from(document.querySelectorAll('textarea')).map(el => {
      return { id: el.id, class: el.className, placeholder: el.placeholder };
    }));
    console.log('Available buttons:', Array.from(document.querySelectorAll('button')).map(el => {
      return { id: el.id, class: el.className, label: el.getAttribute('aria-label') };
    }));
    console.log('Available divs with contenteditable:', Array.from(document.querySelectorAll('div[contenteditable="true"]')).map(el => {
      return { id: el.id, class: el.className };
    }));
    
    // Try each selector until we find a match
    for (const inputSelector of selectors[ai].input) {
      const element = document.querySelector(inputSelector);
      if (element) {
        inputElement = element;
        console.log(`Found input element with selector: ${inputSelector}`);
        break;
      }
    }
    
    for (const buttonSelector of selectors[ai].button) {
      const element = document.querySelector(buttonSelector);
      if (element) {
        sendButton = element;
        console.log(`Found button element with selector: ${buttonSelector}`);
        break;
      }
    }
    
    if (!inputElement || !sendButton) {
      console.error(`Could not find input field or send button for ${ai}`);
      port.postMessage({
        action: 'aiResponse',
        ai: ai,
        response: 'Error: Could not find input field or send button. Check console for details.'
      });
      return;
    }
    
    // Input the question based on input type
    console.log(`Entering question for ${ai}`);
    if (inputElement.tagName === 'TEXTAREA') {
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value").set;
      nativeInputValueSetter.call(inputElement, question);
      inputElement.dispatchEvent(new Event('input', { bubbles: true }));
      console.log(`Set question in textarea for ${ai}`);
    } else if (inputElement.getAttribute('contenteditable') === 'true' || inputElement.classList.contains('ProseMirror')) {
      inputElement.textContent = question;
      inputElement.dispatchEvent(new Event('input', { bubbles: true }));
      
      // For some contenteditable fields, we need to simulate keypresses
      const event = new InputEvent('input', {
        bubbles: true,
        cancelable: true,
        inputType: 'insertText',
        data: question
      });
      inputElement.dispatchEvent(event);
      console.log(`Set question in contenteditable for ${ai}`);
    }
    
    // Wait a bit before clicking the send button
    setTimeout(() => {
      if (sendButton && !sendButton.disabled) {
        console.log(`Clicking send button for ${ai}`);
        sendButton.click();
        
        // Set up polling to find the response
        pollForResponse(ai, selectors[ai].response, port);
      } else {
        console.error(`Send button for ${ai} is disabled or not found`);
        port.postMessage({
          action: 'aiResponse',
          ai: ai,
          response: 'Error: Send button is disabled or not found.'
        });
      }
    }, 1500); // 1.5 seconds timeout
  } catch (error) {
    console.error(`Error in injectQuestion for ${ai}:`, error);
    port.postMessage({
      action: 'aiResponse',
      ai: ai,
      response: `Error: ${error.message}`
    });
  }
}

// Function to poll for responses
function pollForResponse(ai, responseSelectors, port) {
  console.log(`Starting polling for ${ai} responses`);
  let pollAttempts = 0;
  const maxAttempts = 30; // 30 seconds max
  
  const pollInterval = setInterval(() => {
    pollAttempts++;
    console.log(`Polling for ${ai} responses... attempt ${pollAttempts}/${maxAttempts}`);
    
    let responseElement = null;
    
    // Try each response selector
    for (const responseSelector of responseSelectors) {
      const elements = document.querySelectorAll(responseSelector);
      if (elements && elements.length > 0) {
        // Get the last (most recent) element matching the selector
        responseElement = elements[elements.length - 1];
        console.log(`Found response element with selector: ${responseSelector}`);
        break;
      }
    }
    
    if (responseElement) {
      const responseText = responseElement.textContent || responseElement.innerText;
      if (responseText && responseText.trim().length > 0) {
        console.log(`Found response text for ${ai}: ${responseText.substring(0, 50)}...`);
        
        port.postMessage({
          action: 'aiResponse',
          ai: ai,
          response: responseText
        });
        
        clearInterval(pollInterval);
        return;
      }
    } else {
      console.log(`No response element found yet for ${ai}`);
    }
    
    if (pollAttempts >= maxAttempts) {
      console.log(`Polling timeout for ${ai}`);
      clearInterval(pollInterval);
      port.postMessage({
        action: 'aiResponse',
        ai: ai,
        response: `Error: Timeout waiting for response from ${ai}.`
      });
    }
  }, 1000); // Check every second
} 