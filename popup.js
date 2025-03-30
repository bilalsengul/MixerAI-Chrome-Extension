document.addEventListener('DOMContentLoaded', function() {
  const askButton = document.getElementById('askButton');
  const questionInput = document.getElementById('question');
  const loader = document.getElementById('loader');
  const status = document.getElementById('status');
  const geminiResponse = document.getElementById('geminiResponse');
  const chatgptResponse = document.getElementById('chatgptResponse');
  const claudeResponse = document.getElementById('claudeResponse');

  askButton.addEventListener('click', async function() {
    const question = questionInput.value.trim();
    
    if (!question) {
      status.textContent = 'Please enter a question';
      return;
    }
    
    clearResponses();
    showLoader(true);
    status.textContent = 'Finding AI tabs...';
    
    try {
      const tabs = await chrome.runtime.sendMessage({ action: 'findAITabs' });
      
      if (!tabs.gemini && !tabs.chatgpt && !tabs.claude) {
        status.textContent = 'Error: No AI tabs found. Please open Gemini, ChatGPT, and Claude in separate tabs.';
        showLoader(false);
        return;
      }
      
      status.textContent = 'Sending questions to AI services...';
      
      await sendQuestion(tabs, question);
      
    } catch (error) {
      status.textContent = 'Error: ' + error.message;
      showLoader(false);
    }
  });

  function clearResponses() {
    geminiResponse.textContent = '';
    chatgptResponse.textContent = '';
    claudeResponse.textContent = '';
  }

  function showLoader(show) {
    loader.style.display = show ? 'block' : 'none';
    askButton.disabled = show;
  }

  async function sendQuestion(tabs, question) {
    if (tabs.gemini) {
      status.textContent = 'Asking Gemini...';
      try {
        await chrome.runtime.sendMessage({ 
          action: 'askAI', 
          ai: 'gemini', 
          tabId: tabs.gemini.id, 
          question: question 
        });
      } catch (error) {
        geminiResponse.textContent = 'Error: ' + error.message;
      }
    }
    
    if (tabs.chatgpt) {
      status.textContent = 'Asking ChatGPT...';
      try {
        await chrome.runtime.sendMessage({ 
          action: 'askAI', 
          ai: 'chatgpt', 
          tabId: tabs.chatgpt.id, 
          question: question 
        });
      } catch (error) {
        chatgptResponse.textContent = 'Error: ' + error.message;
      }
    }
    
    if (tabs.claude) {
      status.textContent = 'Asking Claude...';
      try {
        await chrome.runtime.sendMessage({ 
          action: 'askAI', 
          ai: 'claude', 
          tabId: tabs.claude.id, 
          question: question 
        });
      } catch (error) {
        claudeResponse.textContent = 'Error: ' + error.message;
      }
    }
    
    status.textContent = 'Waiting for responses...';
  }

  chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
    if (message.action === 'aiResponse') {
      showLoader(false);
      status.textContent = `Received response from ${message.ai}`;
      
      switch(message.ai) {
        case 'gemini':
          geminiResponse.textContent = message.response;
          break;
        case 'chatgpt':
          chatgptResponse.textContent = message.response;
          break;
        case 'claude':
          claudeResponse.textContent = message.response;
          break;
      }
    }
  });
}); 