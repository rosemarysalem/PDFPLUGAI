// Configuration file for StudyMind AI Extension
// Set your OpenAI API key here to avoid entering it each time

const CONFIG = {
  // Replace 'your-api-key-here' with your actual OpenAI API key
  DEFAULT_API_KEY: '', // Example: 'sk-proj-abc123...'
  
  // Other configuration options
  AUTO_SAVE_API_KEY: true, // Whether to automatically save the API key
  DEFAULT_MODEL: 'gpt-4o', // Default OpenAI model to use
  MAX_TOKENS: 1500 // Maximum tokens for AI responses
};

// Make config available globally
if (typeof window !== 'undefined') {
  window.STUDYMIND_CONFIG = CONFIG;
  // Also keep the old name for backward compatibility
  window.CRACKIT_CONFIG = CONFIG;
}

// Export for module environments
if (typeof module !== 'undefined' && module.exports) {
  module.exports = CONFIG;
}