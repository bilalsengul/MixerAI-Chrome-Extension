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
    gemini: findTabWithPattern(tabs, ['gemini.google.com', 'bard.google.com']),
    chatgpt: findTabWithPattern(tabs, ['chat.openai.com']),
    claude: findTabWithPattern(tabs, ['claude.ai', 'anthropic.com'])
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
    
    // First, check if the tab is still valid
    try {
      await chrome.tabs.get(tabId);
    } catch (error) {
      throw new Error(`Tab ${tabId} no longer exists. Please open the ${ai} website.`);
    }
    
    // Then attempt to execute script
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
        'div[contenteditable="true"]',
        'textarea[placeholder="Message Gemini…"]'
      ],
      button: [
        'button[aria-label="Send message"]',
        'button.send-button',
        'button:has(svg)',
        'button[data-testid="send-button"]',
        'button[aria-label="Send"]'
      ],
      response: [
        '.gemini-response-container',
        '.response-container',
        '.model-response',
        '.response-message',
        '.message-content',
        '.message-body',
        'div[data-testid="llm-response"]',
        '.conversation-container > div:last-child'
      ]
    },
    chatgpt: {
      input: [
        '#prompt-textarea',
        'textarea[data-id="root"]',
        'textarea[placeholder="Message ChatGPT…"]',
        'textarea',
        'textarea[placeholder="Message"]'
      ],
      button: [
        'button[data-testid="send-button"]',
        'button.send-button',
        'button:has(svg)',
        'button[aria-label="Send message"]',
        'form button'
      ],
      response: [
        '.markdown',
        '[data-message-author-role="assistant"]',
        '.assistant-message',
        '.response-content',
        '.text-message-content',
        'div[data-testid="conversation-turn-"]',
        'div[data-message-author-role="assistant"]',
        '.chat-message.assistant'
      ]
    },
    claude: {
      input: [
        'div[contenteditable="true"]',
        '.ProseMirror',
        'div[role="textbox"]',
        'textarea[placeholder="Message Claude…"]',
        '[data-slate-editor="true"]',
        'div[placeholder="Enter your message..."]'
      ],
      button: [
        'button[aria-label="Send message"]',
        'button.send-button',
        'button:has(svg)',
        'button[type="submit"]',
        'button.sendButton',
        'form button[type="submit"]'
      ],
      response: [
        '.claude-response',
        '.assistant-message',
        '.response-content',
        '[data-message-author-role="assistant"]',
        '.message-container:last-child',
        '.prose',
        '.chat-message-container .chat-message',
        '.chat-messages .message.assistant',
        '.chatHistory .content:last-child'
      ]
    }
  };
  
  try {
    // Log info about the page to help with debugging
    console.log('Current URL:', window.location.href);
    console.log('Page title:', document.title);
    
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
    
    // If not found, try a more aggressive approach by searching for any possible input
    if (!inputElement) {
      const possibleInputs = [
        ...Array.from(document.querySelectorAll('textarea')),
        ...Array.from(document.querySelectorAll('div[contenteditable="true"]')),
        ...Array.from(document.querySelectorAll('[role="textbox"]'))
      ];
      
      if (possibleInputs.length > 0) {
        // Take the first visible input element
        inputElement = possibleInputs.find(el => {
          const style = window.getComputedStyle(el);
          return style.display !== 'none' && style.visibility !== 'hidden';
        });
        
        if (inputElement) {
          console.log('Found input element using fallback method:', inputElement);
        }
      }
    }
    
    // If not found, try a more aggressive approach for the send button
    if (!sendButton && inputElement) {
      // Find the closest form and its submit button
      const form = inputElement.closest('form');
      if (form) {
        sendButton = form.querySelector('button[type="submit"]') || 
                     form.querySelector('button:last-child');
        
        if (sendButton) {
          console.log('Found send button using form fallback method:', sendButton);
        }
      }
      
      // If still not found, look for buttons near the input
      if (!sendButton) {
        const parent = inputElement.parentElement;
        if (parent) {
          // Find nearby buttons
          const nearbyButtons = [];
          let currentNode = parent;
          for (let i = 0; i < 3; i++) { // Check up to 3 levels up
            const buttons = currentNode.querySelectorAll('button');
            nearbyButtons.push(...buttons);
            if (currentNode.parentElement) {
              currentNode = currentNode.parentElement;
            } else {
              break;
            }
          }
          
          // Filter to find likely send buttons
          if (nearbyButtons.length > 0) {
            sendButton = nearbyButtons.find(btn => {
              const text = btn.textContent.toLowerCase();
              const ariaLabel = (btn.getAttribute('aria-label') || '').toLowerCase();
              return text.includes('send') || ariaLabel.includes('send') || 
                     btn.innerHTML.includes('svg') || // Likely an icon button
                     text === '' || // Empty buttons are often icon buttons
                     btn.closest('form') !== null; // Buttons in the same form
            });
            
            if (sendButton) {
              console.log('Found send button using proximity fallback:', sendButton);
            }
          }
        }
      }
    }
    
    if (!inputElement || !sendButton) {
      console.error(`Could not find input field or send button for ${ai}`);
      port.postMessage({
        action: 'aiResponse',
        ai: ai,
        response: `Error: Could not find input field or send button on the ${ai} website. Please make sure you're on the chat interface.`
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
  const maxAttempts = 40; // 40 seconds max
  let lastResponse = '';
  let stableCount = 0;
  
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
    
    // If still not found, try a more aggressive approach
    if (!responseElement) {
      // Look for text that appears after sending the message
      // This is a fallback when selectors don't work
      const messageContainers = [
        ...document.querySelectorAll('.message'),
        ...document.querySelectorAll('.chat-message'),
        ...document.querySelectorAll('.conversation-turn'),
        ...document.querySelectorAll('.response'),
        ...document.querySelectorAll('[role="region"]')
      ];
      
      if (messageContainers.length > 0) {
        // Get the last message container
        responseElement = messageContainers[messageContainers.length - 1];
        console.log('Found response element using fallback method:', responseElement);
      }
    }
    
    if (responseElement) {
      const responseText = responseElement.textContent || responseElement.innerText;
      if (responseText && responseText.trim().length > 0) {
        console.log(`Found response text for ${ai}: ${responseText.substring(0, 50)}...`);
        
        // Check if the response has stabilized (stopped changing)
        if (responseText === lastResponse) {
          stableCount++;
          // If the text hasn't changed for 3 polls (3 seconds), consider it complete
          if (stableCount >= 3) {
            port.postMessage({
              action: 'aiResponse',
              ai: ai,
              response: responseText
            });
            
            clearInterval(pollInterval);
            return;
          }
        } else {
          // Response is still changing, reset stable count
          stableCount = 0;
          lastResponse = responseText;
          
          // Still provide updates while typing
          if (pollAttempts % 3 === 0) { // Send partial updates every 3 seconds
            port.postMessage({
              action: 'aiResponse',
              ai: ai,
              response: responseText
            });
          }
        }
      }
    } else {
      console.log(`No response element found yet for ${ai}`);
    }
    
    if (pollAttempts >= maxAttempts) {
      console.log(`Polling timeout for ${ai}`);
      clearInterval(pollInterval);
      
      // Send whatever response we've captured so far, or an error if none
      if (lastResponse) {
        port.postMessage({
          action: 'aiResponse',
          ai: ai,
          response: lastResponse
        });
      } else {
        port.postMessage({
          action: 'aiResponse',
          ai: ai,
          response: `Error: Timeout waiting for response from ${ai}.`
        });
      }
    }
  }, 1000); // Check every second
} 