document.addEventListener('DOMContentLoaded', function() {
  const askButton = document.getElementById('askButton');
  const questionInput = document.getElementById('question');
  const spinner = document.getElementById('spinner');
  const status = document.getElementById('status');
  const errorContainer = document.getElementById('errorContainer');
  const geminiResponse = document.getElementById('geminiResponse');
  const chatgptResponse = document.getElementById('chatgptResponse');
  const claudeResponse = document.getElementById('claudeResponse');
  const themeToggle = document.getElementById('theme-toggle');

  // Theme handling
  initTheme();
  
  themeToggle.addEventListener('click', () => {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    
    setTheme(newTheme);
    
    // Save theme preference
    chrome.storage.local.set({ theme: newTheme });
  });
  
  function initTheme() {
    // Check for saved theme preference or use system preference
    chrome.storage.local.get('theme', (data) => {
      if (data.theme) {
        setTheme(data.theme);
      } else {
        // Use system preference as default if available
        if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
          setTheme('dark');
        }
      }
      
      // Listen for system theme changes
      window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
        chrome.storage.local.get('theme', (data) => {
          if (!data.theme) {
            // Only change automatically if user hasn't set a preference
            setTheme(e.matches ? 'dark' : 'light');
          }
        });
      });
    });
  }
  
  function setTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
  }

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
      
      // Find AI tabs
      const tabs = await chrome.runtime.sendMessage({ action: 'findAITabs' });
      
      // Check which AI services are available and open missing ones
      const missingAIs = [];
      const availableAIs = [];
      const openTabPromises = [];
      
      // For each missing AI, open a new tab
      if (!tabs.gemini) {
        missingAIs.push('Gemini');
        openTabPromises.push(openAITab('gemini'));
      } else {
        availableAIs.push('Gemini');
      }
      
      if (!tabs.chatgpt) {
        missingAIs.push('ChatGPT');
        openTabPromises.push(openAITab('chatgpt'));
      } else {
        availableAIs.push('ChatGPT');
      }
      
      if (!tabs.claude) {
        missingAIs.push('Claude');
        openTabPromises.push(openAITab('claude'));
      } else {
        availableAIs.push('Claude');
      }
      
      // If there are missing AIs, wait for the tabs to open
      if (missingAIs.length > 0) {
        setStatus(`Opening tabs for: ${missingAIs.join(', ')}...`);
        
        // Wait for all tabs to open
        const openResults = await Promise.all(openTabPromises);
        
        // Update our available tabs
        const updatedTabs = await chrome.runtime.sendMessage({ action: 'findAITabs' });
        Object.assign(tabs, updatedTabs);
        
        // Update available AIs
        availableAIs.length = 0;
        if (tabs.gemini) availableAIs.push('Gemini');
        if (tabs.chatgpt) availableAIs.push('ChatGPT');
        if (tabs.claude) availableAIs.push('Claude');
      }
      
      if (availableAIs.length === 0) {
        setError('Could not open any AI tabs. Please check if you have the required permissions.');
        showLoading(false);
        geminiResponse.classList.remove('loading');
        chatgptResponse.classList.remove('loading');
        claudeResponse.classList.remove('loading');
        return;
      }
      
      setStatus(`Sending questions to: ${availableAIs.join(', ')}...`);
      await sendQuestions(tabs, question);
      
    } catch (error) {
      setError('Error: ' + error.message);
      showLoading(false);
    }
  });

  // Function to open a tab for an AI service
  async function openAITab(ai) {
    return chrome.runtime.sendMessage({ action: 'openAITab', ai: ai });
  }

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
      geminiResponse.textContent = 'Error: Could not connect to Gemini.';
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
      chatgptResponse.textContent = 'Error: Could not connect to ChatGPT.';
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
      claudeResponse.textContent = 'Error: Could not connect to Claude.';
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