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
    gemini: tabs.find(tab => tab.url && tab.url.includes('gemini.google.com')),
    chatgpt: tabs.find(tab => tab.url && tab.url.includes('chat.openai.com')),
    claude: tabs.find(tab => tab.url && tab.url.includes('claude.ai'))
  };
  
  console.log('AI tabs found:', aiTabs);
  return aiTabs;
}

async function askAI(ai, tabId, question) {
  try {
    console.log(`Executing script in ${ai} tab ${tabId}`);
    await chrome.scripting.executeScript({
      target: { tabId: tabId },
      function: injectQuestion,
      args: [ai, question]
    });
    return { success: true };
  } catch (error) {
    console.error(`Error injecting script into ${ai} tab:`, error);
    throw error;
  }
}

function injectQuestion(ai, question) {
  console.log(`Running injectQuestion for ${ai} with question: ${question}`);
  const port = chrome.runtime.connect({ name: 'aiResponse' });
  
  let inputElement, sendButton;
  let responseObserver;

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
        '.message-body'
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
        'div[data-testid="conversation-turn-"]'
      ]
    },
    claude: {
      input: [
        'div[contenteditable="true"]',
        '.ProseMirror',
        'div[role="textbox"]',
        'textarea[placeholder="Message Claude…"]'
      ],
      button: [
        'button[aria-label="Send message"]',
        'button.send-button',
        'button:has(svg)',
        'button[type="submit"]'
      ],
      response: [
        '.claude-response',
        '.assistant-message',
        '.response-content',
        '[data-message-author-role="assistant"]',
        '.message-container:last-child',
        '.prose'
      ]
    }
  };
  
  // Log all available elements for debugging
  console.log('Available textareas:', Array.from(document.querySelectorAll('textarea')).map(el => el.outerHTML));
  console.log('Available buttons:', Array.from(document.querySelectorAll('button')).map(el => el.outerHTML.substring(0, 100)));
  console.log('Available divs with contenteditable:', Array.from(document.querySelectorAll('div[contenteditable="true"]')).map(el => el.outerHTML.substring(0, 100)));
  
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
  
  const setupResponseObserver = () => {
    console.log(`Setting up response observer for ${ai}`);
    
    // Function to poll for responses
    const pollForResponses = () => {
      console.log(`Polling for ${ai} responses...`);
      let responseElement = null;
      
      // Try each response selector
      for (const responseSelector of selectors[ai].response) {
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
          
          return true; // Stop polling
        }
      } else {
        console.log(`No response element found yet for ${ai}`);
      }
      
      return false; // Continue polling
    };
    
    // Start polling for responses
    const startPolling = () => {
      console.log(`Starting polling for ${ai} responses`);
      const pollInterval = setInterval(() => {
        const found = pollForResponses();
        if (found) {
          console.log(`Stopping polling for ${ai} - response found`);
          clearInterval(pollInterval);
        }
      }, 1000); // Check every second
      
      // Stop polling after 30 seconds in case of no response
      setTimeout(() => {
        clearInterval(pollInterval);
        console.log(`Polling timeout for ${ai}`);
      }, 30000);
    };
    
    startPolling();
  };
  
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
      setupResponseObserver();
    } else {
      console.error(`Send button for ${ai} is disabled or not found`);
      port.postMessage({
        action: 'aiResponse',
        ai: ai,
        response: 'Error: Send button is disabled or not found.'
      });
    }
  }, 1500); // Increased timeout to 1.5 seconds
} 