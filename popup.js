document.addEventListener('DOMContentLoaded', function() {
  const askButton = document.getElementById('askButton');
  const questionInput = document.getElementById('question');
  const spinner = document.getElementById('spinner');
  const status = document.getElementById('status');
  const errorContainer = document.getElementById('errorContainer');
  const geminiResponse = document.getElementById('geminiResponse');
  const chatgptResponse = document.getElementById('chatgptResponse');
  const claudeResponse = document.getElementById('claudeResponse');

  // Add event listeners for copy buttons
  document.querySelectorAll('.copy-btn').forEach(button => {
    button.addEventListener('click', function() {
      const source = this.getAttribute('data-source');
      let content = '';
      
      switch(source) {
        case 'gemini':
          content = geminiResponse.textContent;
          break;
        case 'chatgpt':
          content = chatgptResponse.textContent;
          break;
        case 'claude':
          content = claudeResponse.textContent;
          break;
      }
      
      if (content && !content.includes('Error:')) {
        navigator.clipboard.writeText(content).then(() => {
          const originalText = this.textContent;
          this.textContent = 'Copied!';
          setTimeout(() => {
            this.textContent = originalText;
          }, 2000);
        });
      }
    });
  });

  askButton.addEventListener('click', async function() {
    const question = questionInput.value.trim();
    
    if (!question) {
      setError('Please enter a question');
      return;
    }
    
    clearResponses();
    clearError();
    showLoading(true);
    setStatus('Finding AI tabs...');
    
    try {
      // Set all responses to loading state
      geminiResponse.classList.add('loading');
      chatgptResponse.classList.add('loading');
      claudeResponse.classList.add('loading');
      
      const tabs = await chrome.runtime.sendMessage({ action: 'findAITabs' });
      
      // Check which AI services are available
      let availableAIs = [];
      
      if (tabs.gemini) availableAIs.push('Gemini');
      if (tabs.chatgpt) availableAIs.push('ChatGPT');
      if (tabs.claude) availableAIs.push('Claude');
      
      if (availableAIs.length === 0) {
        setError('No AI tabs found. Please open Gemini, ChatGPT, and Claude in separate tabs.');
        showLoading(false);
        geminiResponse.classList.remove('loading');
        chatgptResponse.classList.remove('loading');
        claudeResponse.classList.remove('loading');
        return;
      }
      
      setStatus(`Found tabs for: ${availableAIs.join(', ')}. Sending questions...`);
      
      await sendQuestions(tabs, question);
      
    } catch (error) {
      setError('Error: ' + error.message);
      showLoading(false);
    }
  });

  function clearResponses() {
    geminiResponse.textContent = '';
    geminiResponse.classList.remove('error', 'loading');
    
    chatgptResponse.textContent = '';
    chatgptResponse.classList.remove('error', 'loading');
    
    claudeResponse.textContent = '';
    claudeResponse.classList.remove('error', 'loading');
  }

  function setError(message) {
    errorContainer.textContent = message;
    errorContainer.style.display = 'block';
  }

  function clearError() {
    errorContainer.textContent = '';
    errorContainer.style.display = 'none';
  }

  function showLoading(show) {
    spinner.style.display = show ? 'block' : 'none';
    askButton.disabled = show;
  }

  function setStatus(message) {
    status.textContent = message;
  }

  async function sendQuestions(tabs, question) {
    // Process Gemini
    if (tabs.gemini) {
      try {
        await chrome.runtime.sendMessage({ 
          action: 'askAI', 
          ai: 'gemini', 
          tabId: tabs.gemini.id, 
          question: question 
        });
      } catch (error) {
        geminiResponse.textContent = 'Error: ' + error.message;
        geminiResponse.classList.remove('loading');
        geminiResponse.classList.add('error');
      }
    } else {
      geminiResponse.textContent = 'Error: No Gemini tab found. Please open https://gemini.google.com/ in a tab.';
      geminiResponse.classList.remove('loading');
      geminiResponse.classList.add('error');
    }
    
    // Process ChatGPT
    if (tabs.chatgpt) {
      try {
        await chrome.runtime.sendMessage({ 
          action: 'askAI', 
          ai: 'chatgpt', 
          tabId: tabs.chatgpt.id, 
          question: question 
        });
      } catch (error) {
        chatgptResponse.textContent = 'Error: ' + error.message;
        chatgptResponse.classList.remove('loading');
        chatgptResponse.classList.add('error');
      }
    } else {
      chatgptResponse.textContent = 'Error: No ChatGPT tab found. Please open https://chat.openai.com/ in a tab.';
      chatgptResponse.classList.remove('loading');
      chatgptResponse.classList.add('error');
    }
    
    // Process Claude
    if (tabs.claude) {
      try {
        await chrome.runtime.sendMessage({ 
          action: 'askAI', 
          ai: 'claude', 
          tabId: tabs.claude.id, 
          question: question 
        });
      } catch (error) {
        claudeResponse.textContent = 'Error: ' + error.message;
        claudeResponse.classList.remove('loading');
        claudeResponse.classList.add('error');
      }
    } else {
      claudeResponse.textContent = 'Error: No Claude tab found. Please open https://claude.ai/ in a tab.';
      claudeResponse.classList.remove('loading');
      claudeResponse.classList.add('error');
    }
    
    // Set status to waiting for responses if at least one AI is being queried
    if (tabs.gemini || tabs.chatgpt || tabs.claude) {
      setStatus('Waiting for responses...');
    } else {
      showLoading(false);
      setStatus('No AI services available.');
    }
  }

  chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
    if (message.action === 'aiResponse') {
      const responseElement = document.getElementById(`${message.ai}Response`);
      
      if (responseElement) {
        responseElement.classList.remove('loading');
        
        if (message.response.includes('Error:')) {
          responseElement.classList.add('error');
        }
        
        responseElement.textContent = message.response;
        setStatus(`Received response from ${message.ai}`);
        
        // Check if all responses are received
        const stillLoading = [
          geminiResponse.classList.contains('loading'),
          chatgptResponse.classList.contains('loading'),
          claudeResponse.classList.contains('loading')
        ];
        
        if (!stillLoading.includes(true)) {
          showLoading(false);
          setStatus('All responses received');
        }
      }
    }
  });
}); 