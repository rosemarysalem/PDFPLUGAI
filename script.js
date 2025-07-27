// DOM Elements
const pdfInput = document.getElementById('pdfInput');
const uploadBtn = document.getElementById('uploadBtn');
const outputDiv = document.getElementById('output');
const pdfNameDiv = document.getElementById('pdfName');
const apiKeyInput = document.getElementById('apiKeyInput');
const questionInput = document.getElementById('questionInput');
const askBtn = document.getElementById('askBtn');
const pdfCanvas = document.getElementById('pdfCanvas');
const prevPageBtn = document.getElementById('prevPageBtn');
const nextPageBtn = document.getElementById('nextPageBtn');
const pageIndicator = document.getElementById('pageIndicator');

// New gamified elements
const suggestBtn = document.getElementById('suggestBtn');
const startQuizBtn = document.getElementById('startQuizBtn');
const featureGrid = document.getElementById('featureGrid');
const suggestionsSection = document.getElementById('suggestionsSection');
const quizSection = document.getElementById('quizSection');
const comprehensionLevel = document.getElementById('comprehensionLevel');
const scoreDisplay = document.getElementById('scoreDisplay');
const nextQuestionBtn = document.getElementById('nextQuestionBtn');
const finishQuizBtn = document.getElementById('finishQuizBtn');

// State variables
let lastPdfText = '';
let lastPdfFile = null;
let lastAIText = '';
let currentStudyMode = 'comprehension';
let currentComprehensionLevel = 'basic';
let quizData = [];
let currentQuizIndex = 0;
let quizScore = 0;
let suggestedQuestions = [];
let isQuizActive = false;

// Get configuration from config.js
const getConfig = () => {
  if (typeof window !== 'undefined' && (window.STUDYMIND_CONFIG || window.CRACKIT_CONFIG)) {
    return window.STUDYMIND_CONFIG || window.CRACKIT_CONFIG;
  }
  // Fallback configuration
  return {
    DEFAULT_API_KEY: '',
    AUTO_SAVE_API_KEY: true,
    DEFAULT_MODEL: 'gpt-4o',
    MAX_TOKENS: 1500
  };
};

let config = getConfig();

// Configure PDF.js worker
if (typeof window !== 'undefined' && window.pdfjsLib) {
  window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'pdf.worker.min.js';
}

window.addEventListener('DOMContentLoaded', async () => {
  // Set PDF.js worker path
  if (window.pdfjsLib) {
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'pdf.worker.min.js';
  }
  
  // Refresh config after DOM loads
  config = getConfig();
  
  // Initialize gamified features
  initializeStudyModes();
  initializeEventListeners();
  
  // Load default API key if available
  if (config && config.DEFAULT_API_KEY && !apiKeyInput.value) {
    apiKeyInput.value = config.DEFAULT_API_KEY;
    if (config.AUTO_SAVE_API_KEY && window.chrome && chrome.storage) {
      chrome.storage.local.set({ openai_api_key: config.DEFAULT_API_KEY });
    }
  }
  
  // Try to get web PDF data from background
  if (window.chrome && chrome.runtime && chrome.runtime.sendMessage) {
    chrome.runtime.sendMessage({ type: 'REQUEST_WEB_PDF' }, async (response) => {
      if (response && response.pdfDataBase64) {
        // Convert base64 to Blob
        const binary = atob(response.pdfDataBase64);
        const len = binary.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
          bytes[i] = binary.charCodeAt(i);
        }
        const blob = new Blob([bytes], { type: 'application/pdf' });
        const file = new File([blob], response.pdfUrl ? response.pdfUrl.split('/').pop() : 'web.pdf', { type: 'application/pdf' });
        lastPdfFile = file;
        pdfNameDiv.textContent = file.name + ' (from web)';
        showLoading('Processing PDF from web page...');
        try {
          const { text, numPages } = await extractTextAndRenderPDF(file);
          lastPdfText = text;
          showPDFLoadedMessage(numPages);
        } catch (err) {
          showError(`Error loading web PDF: ${err.message}`);
          pdfCanvas.style.display = 'none';
        }
      } else {
        // No web PDF found, show normal UI
        showWelcomeMessage();
      }
    });
  } else {
     showWelcomeMessage();
   }
});

// Make API request (supports both OpenAI and OpenRouter)
async function makeOpenAIRequest(messages, maxTokens = null) {
  const apiKey = apiKeyInput.value.trim();
  const service = document.getElementById('apiService')?.value || 'openai';
  
  if (!apiKey) {
    const serviceName = service === 'openrouter' ? 'OpenRouter' : 'OpenAI';
    throw new Error(`Please enter your ${serviceName} API key in the configuration section`);
  }
  
  const currentConfig = getConfig();
  
  // Configure API endpoint and model based on service
  let apiUrl, model, headers;
  
  if (service === 'openrouter') {
    apiUrl = 'https://openrouter.ai/api/v1/chat/completions';
    model = 'meta-llama/llama-3.2-11b-vision-instruct:free'; // Meta Llama model for OpenRouter
    headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      'HTTP-Referer': window.location.origin,
      'X-Title': 'StudyMind AI'
    };
  } else {
    apiUrl = 'https://api.openai.com/v1/chat/completions';
    model = currentConfig.DEFAULT_MODEL;
    headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    };
  }
  
  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: headers,
    body: JSON.stringify({
      model: model,
      messages: messages,
      max_tokens: maxTokens || currentConfig.MAX_TOKENS,
      temperature: 0.7
    })
  });
  
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const serviceName = service === 'openrouter' ? 'OpenRouter' : 'OpenAI';
    
    if (response.status === 401) {
      throw new Error(`Invalid API key. Please check your ${serviceName} API key and try again.`);
    } else if (response.status === 429) {
      throw new Error('Rate limit exceeded. Please try again in a few moments.');
    } else if (response.status === 403) {
      throw new Error('Access denied. Please check your API key permissions.');
    } else {
      throw new Error(errorData.error?.message || `${serviceName} API request failed with status ${response.status}`);
    }
  }
  
  return response.json();
}

// Helper function to get API key
async function getApiKey() {
  const apiKey = apiKeyInput.value.trim();
  if (!apiKey) {
    showError('Please enter your OpenAI API key.');
    return null;
  }
  return apiKey;
}

// Gamified Learning Functions
async function generateSuggestedQuestions() {
  if (!lastPdfText) {
    showError('Please upload a PDF first.');
    return;
  }
  
  showLoading('Generating suggested questions...');
  
  const prompt = `Based on this document content, generate 5 thoughtful study questions that would help someone understand the key concepts. Format as a numbered list:\n\n${lastPdfText.substring(0, 3000)}`;
  
  try {
    const data = await makeOpenAIRequest([{ role: 'user', content: prompt }], 1000);
    
    const questions = data.choices[0].message.content;
    suggestedQuestions = questions.split('\n').filter(q => q.trim() && /^\d+/.test(q.trim()));
    
    displaySuggestedQuestions(questions);
    
  } catch (error) {
    showError(`Error generating questions: ${error.message}`);
  }
}

function displaySuggestedQuestions(questions) {
  suggestionsSection.style.display = 'block';
  suggestionsSection.innerHTML = `
    <h3>💡 Suggested Study Questions</h3>
    <div class="suggestion-cards">
      ${questions.split('\n').filter(q => q.trim()).map(question => `
        <div class="suggestion-card">
          <p>${question}</p>
          <button onclick="useQuestion('${question.replace(/'/g, "\\'")}')">Use This Question</button>
        </div>
      `).join('')}
    </div>
  `;
}

function useQuestion(question) {
  questionInput.value = question.replace(/^\d+\.\s*/, '');
  questionInput.focus();
}

async function startInteractiveQuiz() {
  if (!lastPdfText) {
    showError('Please upload a PDF first.');
    return;
  }
  
  showLoading('Creating your personalized quiz...');
  
  const prompt = `Create a 5-question multiple choice quiz based on this document. Each question should have 4 options (A, B, C, D) with only one correct answer. Format as JSON:\n\n{\n  "questions": [\n    {\n      "question": "Question text",\n      "options": ["A) Option 1", "B) Option 2", "C) Option 3", "D) Option 4"],\n      "correct": 0,\n      "explanation": "Why this answer is correct"\n    }\n  ]\n}\n\nDocument content:\n${lastPdfText.substring(0, 2500)}`;
  
  try {
    const data = await makeOpenAIRequest([{ role: 'user', content: prompt }], 1500);
    
    const content = data.choices[0].message.content;
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    
    if (jsonMatch) {
      quizData = JSON.parse(jsonMatch[0]);
      currentQuizIndex = 0;
      quizScore = 0;
      isQuizActive = true;
      displayQuizQuestion();
    } else {
      throw new Error('Could not parse quiz data');
    }
    
  } catch (error) {
    showError(`Error creating quiz: ${error.message}`);
  }
}

function displayQuizQuestion() {
  if (!quizData || currentQuizIndex >= quizData.questions.length) {
    finishQuiz();
    return;
  }
  
  const question = quizData.questions[currentQuizIndex];
  const progress = ((currentQuizIndex + 1) / quizData.questions.length) * 100;
  
  quizSection.style.display = 'block';
  quizSection.innerHTML = `
    <div class="quiz-header">
      <h3>🎯 Interactive Quiz</h3>
      <div class="quiz-progress">
        <div class="progress-bar">
          <div class="progress-fill" style="width: ${progress}%"></div>
        </div>
        <span>Question ${currentQuizIndex + 1} of ${quizData.questions.length}</span>
      </div>
      <div class="score-display">Score: ${quizScore}/${currentQuizIndex}</div>
    </div>
    
    <div class="quiz-question">
      <h4>${question.question}</h4>
      <div class="quiz-options">
        ${question.options.map((option, index) => `
          <label class="quiz-option">
            <input type="radio" name="quiz-answer" value="${index}">
            <span>${option}</span>
          </label>
        `).join('')}
      </div>
    </div>
    
    <div class="quiz-navigation">
      <button id="submit-answer" onclick="submitQuizAnswer()">Submit Answer</button>
      <button id="next-question" onclick="nextQuestion()" style="display: none;">Next Question</button>
      <button id="finish-quiz" onclick="finishQuiz()" style="display: none;">Finish Quiz</button>
    </div>
    
    <div id="answer-feedback" style="display: none;"></div>
  `;
}

function submitQuizAnswer() {
  const selectedAnswer = document.querySelector('input[name="quiz-answer"]:checked');
  
  if (!selectedAnswer) {
    showError('Please select an answer.');
    return;
  }
  
  const answerIndex = parseInt(selectedAnswer.value);
  const question = quizData.questions[currentQuizIndex];
  const isCorrect = answerIndex === question.correct;
  
  if (isCorrect) {
    quizScore++;
  }
  
  // Show feedback
  const feedbackDiv = document.getElementById('answer-feedback');
  feedbackDiv.style.display = 'block';
  feedbackDiv.innerHTML = `
    <div class="answer-feedback ${isCorrect ? 'correct' : 'incorrect'}">
      <strong>${isCorrect ? '✅ Correct!' : '❌ Incorrect'}</strong>
      <p>${question.explanation}</p>
      ${!isCorrect ? `<p><strong>Correct answer:</strong> ${question.options[question.correct]}</p>` : ''}
    </div>
  `;
  
  // Update UI
  document.getElementById('submit-answer').style.display = 'none';
  
  if (currentQuizIndex < quizData.questions.length - 1) {
    document.getElementById('next-question').style.display = 'inline-block';
  } else {
    document.getElementById('finish-quiz').style.display = 'inline-block';
  }
  
  // Update score display
  document.querySelector('.score-display').textContent = `Score: ${quizScore}/${currentQuizIndex + 1}`;
}

function nextQuestion() {
  currentQuizIndex++;
  displayQuizQuestion();
}

function finishQuiz() {
  isQuizActive = false;
  const percentage = Math.round((quizScore / quizData.questions.length) * 100);
  
  let performance = '';
  if (percentage >= 90) performance = '🏆 Excellent!';
  else if (percentage >= 70) performance = '👍 Good job!';
  else if (percentage >= 50) performance = '📚 Keep studying!';
  else performance = '💪 Practice more!';
  
  quizSection.innerHTML = `
    <div class="quiz-results">
      <h3>🎉 Quiz Complete!</h3>
      <div class="final-score">
        <div class="score-circle">
          <span class="score-number">${percentage}%</span>
          <span class="score-text">${performance}</span>
        </div>
      </div>
      <div class="score-breakdown">
        <p><strong>Final Score:</strong> ${quizScore} out of ${quizData.questions.length}</p>
        <p><strong>Accuracy:</strong> ${percentage}%</p>
      </div>
      <div class="quiz-actions">
        <button onclick="startInteractiveQuiz()">🔄 Retake Quiz</button>
        <button onclick="generateSuggestedQuestions()">💡 Get Study Questions</button>
        <button onclick="hideQuizSection()">✅ Done</button>
      </div>
    </div>
  `;
}

// Feature Functions for the four cards
async function executeDocumentAnalysis() {
  if (!lastPdfText) {
    showError('Please upload a PDF first.');
    return;
  }
  
  const apiKey = await getApiKey();
  if (!apiKey) return;
  
  showLoading('Analyzing document for key insights...');
  
  const prompt = `Perform a comprehensive analysis of this document. Provide:
1. Main themes and key concepts
2. Important facts and data points
3. Critical insights and takeaways
4. Potential areas for further study

Document content:
${lastPdfText.substring(0, 4000)}`;
  
  try {
    const response = await makeOpenAIRequest([{ role: 'user', content: prompt }]);
     const analysis = response.choices[0].message.content;
     lastAIText = analysis;
     formatAndDisplayContent(analysis);
     exportBtn.style.display = 'block';
  } catch (error) {
    console.error('Error analyzing document:', error);
    showError(`Failed to analyze document: ${error.message}`);
  }
}

async function generateFlashcards() {
  if (!lastPdfText) {
    showError('Please upload a PDF first.');
    return;
  }
  
  const apiKey = await getApiKey();
  if (!apiKey) return;
  
  showLoading('Creating interactive flashcards from document content...');
  
  const prompt = `Create up to 10 flashcards from this document. Format each as:
Front: [Question or term]
Back: [Answer or definition]

Focus on key concepts, important terms, and critical information. Keep answers concise but informative. Generate as many relevant flashcards as possible up to 10 cards to maximize learning value.

Document content:
${lastPdfText.substring(0, 4000)}`;
  
  try {
    const response = await makeOpenAIRequest([{ role: 'user', content: prompt }]);
    const flashcardsText = response.choices[0].message.content;
    lastAIText = flashcardsText;
    
    // Parse flashcards and create interactive cards
    displayInteractiveFlashcards(flashcardsText);
    exportBtn.style.display = 'block';
  } catch (error) {
    console.error('Error generating flashcards:', error);
    showError(`Failed to generate flashcards: ${error.message}`);
  }
}

function displayInteractiveFlashcards(flashcardsText) {
  // Hide feature grid when showing results
  featureGrid.style.display = 'none';
  
  // Parse flashcards from the AI response
  const flashcards = parseFlashcards(flashcardsText);
  
  if (flashcards.length === 0) {
    showError('No flashcards could be parsed from the response.');
    return;
  }
  
  // Create interactive flashcard container
  let flashcardHTML = `
    <div class="flashcard-container">
      <div class="flashcard-header">
        <h3>📚 Interactive Flashcards (${flashcards.length} cards)</h3>
        <p>Click any card to flip and reveal the answer!</p>
      </div>
      <div class="flashcard-grid">
  `;
  
  flashcards.forEach((card, index) => {
    flashcardHTML += `
      <div class="flashcard" id="flashcard-${index}">
        <div class="flashcard-inner">
          <div class="flashcard-front">
            <div class="card-number">${index + 1}</div>
            <div class="card-content">
              <h4>Question:</h4>
              <p>${card.front}</p>
            </div>
            <div class="flip-hint">👆 Click to flip</div>
          </div>
          <div class="flashcard-back">
            <div class="card-number">${index + 1}</div>
            <div class="card-content">
              <h4>Answer:</h4>
              <p>${card.back}</p>
            </div>
            <div class="flip-hint">👆 Click to flip back</div>
          </div>
        </div>
      </div>
    `;
  });
  
  flashcardHTML += `
      </div>
      <div class="flashcard-controls">
        <button id="resetCardsBtn" class="control-btn">🔄 Reset All</button>
        <button id="showAllBtn" class="control-btn">👁️ Show All Answers</button>
        <button id="shuffleBtn" class="control-btn">🔀 Shuffle Cards</button>
      </div>
    </div>
  `;
  
  outputDiv.innerHTML = flashcardHTML;
  
  // Add CSS styles for flashcards if not already added
  addFlashcardStyles();
  
  // Add event listeners for flashcard interactions
  document.querySelectorAll('.flashcard').forEach((card, index) => {
    card.addEventListener('click', () => flipCard(index));
  });
  
  // Add event listeners for control buttons
  document.getElementById('resetCardsBtn').addEventListener('click', () => flipAllCards(false));
  document.getElementById('showAllBtn').addEventListener('click', () => flipAllCards(true));
  document.getElementById('shuffleBtn').addEventListener('click', shuffleFlashcards);
}

function parseFlashcards(text) {
  const flashcards = [];
  const lines = text.split('\n');
  let currentCard = { front: '', back: '' };
  let isParsingFront = false;
  let isParsingBack = false;
  
  for (let line of lines) {
    line = line.trim();
    
    if (line.toLowerCase().startsWith('front:')) {
      if (currentCard.front && currentCard.back) {
        flashcards.push({ ...currentCard });
      }
      currentCard = { front: line.substring(6).trim(), back: '' };
      isParsingFront = true;
      isParsingBack = false;
    } else if (line.toLowerCase().startsWith('back:')) {
      currentCard.back = line.substring(5).trim();
      isParsingFront = false;
      isParsingBack = true;
    } else if (line && isParsingFront && !currentCard.back) {
      currentCard.front += ' ' + line;
    } else if (line && isParsingBack) {
      currentCard.back += ' ' + line;
    }
  }
  
  // Add the last card if it's complete
  if (currentCard.front && currentCard.back) {
    flashcards.push(currentCard);
  }
  
  return flashcards;
}

function flipCard(index) {
  const card = document.getElementById(`flashcard-${index}`);
  if (card) {
    card.classList.toggle('flipped');
  }
}

function flipAllCards(showAnswers) {
  const cards = document.querySelectorAll('.flashcard');
  cards.forEach(card => {
    if (showAnswers) {
      card.classList.add('flipped');
    } else {
      card.classList.remove('flipped');
    }
  });
}

function shuffleFlashcards() {
  const grid = document.querySelector('.flashcard-grid');
  if (!grid) return;
  
  const cards = Array.from(grid.children);
  
  // Shuffle array
  for (let i = cards.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
  
  // Re-append in new order
  cards.forEach(card => grid.appendChild(card));
}

function addFlashcardStyles() {
  // Check if styles already exist
  if (document.getElementById('flashcard-styles')) return;
  
  const style = document.createElement('style');
  style.id = 'flashcard-styles';
  style.textContent = `
    .flashcard-container {
      width: 100%;
      max-width: 1000px;
      margin: 20px auto;
      padding: 20px;
    }
    
    .flashcard-header {
      text-align: center;
      margin-bottom: 30px;
      color: #ffb300;
    }
    
    .flashcard-header h3 {
      margin: 0 0 10px 0;
      font-size: 1.5em;
    }
    
    .flashcard-header p {
      margin: 0;
      color: #ccc;
      font-size: 0.9em;
    }
    
    .flashcard-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: 15px;
      margin-bottom: 30px;
      max-width: 100%;
    }
    
    @media (min-width: 768px) {
      .flashcard-grid {
        grid-template-columns: repeat(2, 1fr);
      }
    }
    
    @media (min-width: 1200px) {
      .flashcard-grid {
        grid-template-columns: repeat(3, 1fr);
      }
    }
    
    .flashcard {
      background: transparent;
      width: 100%;
      height: 200px;
      perspective: 1000px;
      cursor: pointer;
    }
    
    .flashcard-inner {
      position: relative;
      width: 100%;
      height: 100%;
      text-align: center;
      transition: transform 0.6s;
      transform-style: preserve-3d;
    }
    
    .flashcard.flipped .flashcard-inner {
      transform: rotateY(180deg);
    }
    
    .flashcard-front, .flashcard-back {
      position: absolute;
      width: 100%;
      height: 100%;
      backface-visibility: hidden;
      border-radius: 12px;
      padding: 20px;
      box-sizing: border-box;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    }
    
    .flashcard-front {
      background: linear-gradient(135deg, #4b006e, #6a0080);
      color: white;
      border: 2px solid #e53935;
    }
    
    .flashcard-back {
      background: linear-gradient(135deg, #2d0036, #4b006e);
      color: white;
      transform: rotateY(180deg);
      border: 2px solid #ffb300;
    }
    
    .card-number {
      position: absolute;
      top: 10px;
      right: 15px;
      background: rgba(255,255,255,0.2);
      border-radius: 50%;
      width: 30px;
      height: 30px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: bold;
      font-size: 0.9em;
    }
    
    .card-content {
      flex: 1;
      display: flex;
      flex-direction: column;
      justify-content: center;
      padding: 10px 0;
    }
    
    .card-content h4 {
      margin: 0 0 10px 0;
      color: #ffb300;
      font-size: 1em;
    }
    
    .card-content p {
      margin: 0;
      font-size: 0.95em;
      line-height: 1.4;
    }
    
    .flip-hint {
      font-size: 0.8em;
      color: #ccc;
      margin-top: 5px;
    }
    
    .flashcard-controls {
      display: flex;
      justify-content: center;
      gap: 15px;
      flex-wrap: wrap;
      margin-top: 20px;
    }
    
    .control-btn {
      background: #e53935;
      color: white;
      border: none;
      border-radius: 8px;
      padding: 10px 20px;
      cursor: pointer;
      font-size: 0.9em;
      transition: all 0.3s;
      min-width: 140px;
    }
    
    .control-btn:hover {
      background: #d32f2f;
      transform: translateY(-2px);
    }
    
    @media (max-width: 768px) {
      .flashcard-grid {
        grid-template-columns: 1fr;
      }
      
      .flashcard {
        height: 180px;
      }
      
      .flashcard-front, .flashcard-back {
        padding: 15px;
      }
    }
  `;
  
  document.head.appendChild(style);
}

async function generateIntelligentSummary() {
  if (!lastPdfText) {
    showError('Please upload a PDF first.');
    return;
  }
  
  const apiKey = await getApiKey();
  if (!apiKey) return;
  
  // Show summary type selector for larger documents
  if (lastPdfText.length > 5000) {
    showSummaryTypeSelector();
    return;
  }
  
  // For smaller documents, generate comprehensive summary directly
  await generateComprehensiveSummary('comprehensive');
}

function showSummaryTypeSelector() {
  featureGrid.style.display = 'none';
  outputDiv.innerHTML = `
    <div class="card summary-selector">
      <div class="card-header">
        <span class="mode-indicator">📝 Smart Summary Options</span>
      </div>
      <div class="card-content">
        <p style="margin-bottom: 20px; color: #fff;">Choose your preferred summary type for this document:</p>
        
        <div class="summary-options">
          <button class="summary-option-btn" id="comprehensiveOption">
            <div class="option-icon">📄</div>
            <div class="option-title">Comprehensive Summary</div>
            <div class="option-desc">Complete overview of the entire document</div>
          </button>
          
          <button class="summary-option-btn" id="sectionedOption">
            <div class="option-icon">📑</div>
            <div class="option-title">Section-by-Section</div>
            <div class="option-desc">Detailed breakdown by document sections</div>
          </button>
          
          <button class="summary-option-btn" id="executiveOption">
            <div class="option-icon">⚡</div>
            <div class="option-title">Executive Summary</div>
            <div class="option-desc">Key points and main conclusions only</div>
          </button>
          
          <button class="summary-option-btn" id="detailedOption">
            <div class="option-icon">🔍</div>
            <div class="option-title">Detailed Analysis</div>
            <div class="option-desc">In-depth analysis with insights and implications</div>
          </button>
        </div>
      </div>
    </div>
  `;
  
  // Add event listeners to the newly created option buttons
  setTimeout(() => {
    const comprehensiveOption = document.getElementById('comprehensiveOption');
    const sectionedOption = document.getElementById('sectionedOption');
    const executiveOption = document.getElementById('executiveOption');
    const detailedOption = document.getElementById('detailedOption');
    
    if (comprehensiveOption) {
      comprehensiveOption.addEventListener('click', () => generateComprehensiveSummary('comprehensive'));
    }
    
    if (sectionedOption) {
      sectionedOption.addEventListener('click', () => generateComprehensiveSummary('sectioned'));
    }
    
    if (executiveOption) {
      executiveOption.addEventListener('click', () => generateComprehensiveSummary('executive'));
    }
    
    if (detailedOption) {
      detailedOption.addEventListener('click', () => generateComprehensiveSummary('detailed'));
    }
  }, 100);
}

async function generateComprehensiveSummary(summaryType) {
  const apiKey = await getApiKey();
  if (!apiKey) return;
  
  showLoading(`Creating ${summaryType} summary...`);
  
  const levelDescriptions = {
    basic: 'simple, clear language suitable for beginners',
    intermediate: 'moderate complexity for general audiences', 
    advanced: 'detailed technical language for experts and professionals'
  };
  
  const summaryPrompts = {
    comprehensive: `Create a comprehensive, full-document summary using ${levelDescriptions[currentComprehensionLevel]}. Write this as ONE COHESIVE BLOCK of text that flows naturally. Include:

• Executive overview of the main topic and purpose
• Key concepts, theories, and methodologies presented
• Main arguments, findings, and conclusions
• Important data, statistics, or evidence mentioned
• Practical applications and implications
• Future directions or recommendations if mentioned

Write this as a single, well-structured narrative summary that captures the essence of the entire document.`,
    
    sectioned: `Create a detailed section-by-section summary using ${levelDescriptions[currentComprehensionLevel]}. Organize this as ONE COHESIVE DOCUMENT with clear section headers. For each major section:

• Identify the main topic and purpose of each section
• Summarize key points and supporting details
• Note important data, examples, or case studies
• Explain how each section connects to the overall document theme

Present this as a flowing, comprehensive analysis that maintains narrative coherence throughout.`,
    
    executive: `Create a concise executive summary using ${levelDescriptions[currentComprehensionLevel]}. Write this as ONE UNIFIED BLOCK that includes:

• Document purpose and scope in 2-3 sentences
• 5-7 most critical findings or main points
• Key conclusions and their significance
• Primary recommendations or implications
• Bottom-line impact or takeaway message

Keep this focused, impactful, and written as a single coherent summary block.`,
    
    detailed: `Create an in-depth analytical summary using ${levelDescriptions[currentComprehensionLevel]}. Write this as ONE COMPREHENSIVE ANALYSIS that includes:

• Detailed context and background information
• Thorough explanation of methodologies or approaches
• Complete analysis of findings, data, and evidence
• Critical evaluation of arguments and conclusions
• Broader implications and significance
• Connections to related fields or topics
• Potential limitations or areas for further research

Present this as a scholarly, flowing analysis that maintains depth while remaining accessible.`
  };
  
  const prompt = `${summaryPrompts[summaryType]}

Document content:
${lastPdfText}`;
  
  try {
    const response = await makeOpenAIRequest([
      { role: 'system', content: 'You are an expert document analyst. Create comprehensive, well-structured summaries that flow as single cohesive blocks of text. Avoid bullet points or fragmented sections unless specifically requested.' },
      { role: 'user', content: prompt }
    ], 2000);
    
    const summary = response.choices[0].message.content;
    displayComprehensiveSummary(summary, summaryType);
    exportBtn.style.display = 'block';
  } catch (error) {
    console.error('Error generating summary:', error);
    showError(`Failed to generate summary: ${error.message}`);
  }
}

function displayComprehensiveSummary(summary, summaryType) {
  lastAIText = summary;
  featureGrid.style.display = 'none';
  
  const summaryTypeNames = {
    comprehensive: 'Comprehensive Summary',
    sectioned: 'Section-by-Section Summary', 
    executive: 'Executive Summary',
    detailed: 'Detailed Analysis'
  };
  
  const summaryIcons = {
    comprehensive: '📄',
    sectioned: '📑',
    executive: '⚡',
    detailed: '🔍'
  };
  
  outputDiv.innerHTML = `
    <div class="card comprehensive-summary">
      <div class="card-header">
        <span class="mode-indicator">${summaryIcons[summaryType]} ${summaryTypeNames[summaryType]}</span>
        ${currentComprehensionLevel ? `<span class="level-badge">${currentComprehensionLevel}</span>` : ''}
      </div>
      <div class="summary-content">
        ${summary.replace(/\n/g, '<br><br>')}
      </div>
      <div class="summary-actions">
        <button class="action-btn" id="copySummaryBtn">📋 Copy Summary</button>
        <button class="action-btn" id="comprehensiveBtn">📄 Comprehensive</button>
        <button class="action-btn" id="executiveBtn">⚡ Executive</button>
        <button class="action-btn" id="sectionedBtn">📑 Section-by-Section</button>
        <button class="action-btn" id="detailedBtn">🔍 Detailed Analysis</button>
        <button class="action-btn" id="changeTypeBtn">🔄 Change Type</button>
      </div>
    </div>
  `;
  
  // Add event listeners to the newly created buttons
  setTimeout(() => {
    const copySummaryBtn = document.getElementById('copySummaryBtn');
    const comprehensiveBtn = document.getElementById('comprehensiveBtn');
    const executiveBtn = document.getElementById('executiveBtn');
    const sectionedBtn = document.getElementById('sectionedBtn');
    const detailedBtn = document.getElementById('detailedBtn');
    const changeTypeBtn = document.getElementById('changeTypeBtn');
    
    if (copySummaryBtn) {
      copySummaryBtn.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(summary);
          copySummaryBtn.textContent = '✅ Copied!';
          setTimeout(() => {
            copySummaryBtn.textContent = '📋 Copy Summary';
          }, 2000);
        } catch (err) {
          showError('Failed to copy to clipboard');
        }
      });
    }
    
    if (comprehensiveBtn) {
      comprehensiveBtn.addEventListener('click', () => generateComprehensiveSummary('comprehensive'));
    }
    
    if (executiveBtn) {
      executiveBtn.addEventListener('click', () => generateComprehensiveSummary('executive'));
    }
    
    if (sectionedBtn) {
      sectionedBtn.addEventListener('click', () => generateComprehensiveSummary('sectioned'));
    }
    
    if (detailedBtn) {
      detailedBtn.addEventListener('click', () => generateComprehensiveSummary('detailed'));
    }
    
    if (changeTypeBtn) {
      changeTypeBtn.addEventListener('click', showSummaryTypeSelector);
    }
  }, 100);
}

function hideQuizSection() {
  quizSection.style.display = 'none';
  isQuizActive = false;
}

// Reset application state for new PDF uploads
function resetApplicationState() {
  // Clear previous data
  lastPdfText = '';
  lastAIText = '';
  quizData = [];
  currentQuizIndex = 0;
  quizScore = 0;
  suggestedQuestions = [];
  isQuizActive = false;
  
  // Reset UI elements
  outputDiv.innerHTML = '';
  featureGrid.style.display = 'grid';
  suggestionsSection.style.display = 'none';
  quizSection.style.display = 'none';
  
  // Hide export button
  if (exportBtn) {
    exportBtn.style.display = 'none';
  }
  
  // Reset study mode to default
  currentStudyMode = 'comprehension';
  currentComprehensionLevel = 'basic';
  
  // Re-initialize feature cards to ensure they work
  setTimeout(() => {
    initializeFeatureCards();
  }, 100);
}

uploadBtn.addEventListener('click', async () => {
  if (!pdfInput.files.length) {
    showError('Please select a PDF file.');
    pdfNameDiv.textContent = '';
    pdfCanvas.style.display = 'none';
    return;
  }
  
  // Reset state for new PDF upload
  resetApplicationState();
  
  const file = pdfInput.files[0];
  lastPdfFile = file;
  pdfNameDiv.textContent = file.name;
  showLoading('Processing your PDF...');
  try {
    const { text, numPages } = await extractTextAndRenderPDF(file);
    lastPdfText = text;
    showPDFLoadedMessage(numPages);
  } catch (err) {
    showError(`Error: ${err.message}`);
    pdfCanvas.style.display = 'none';
  }
});

// URL PDF loading functionality
const loadUrlBtn = document.getElementById('loadUrlBtn');
const pdfUrlInput = document.getElementById('pdfUrlInput');

if (loadUrlBtn && pdfUrlInput) {
  loadUrlBtn.addEventListener('click', async () => {
    const url = pdfUrlInput.value.trim();
    if (!url) {
      showError('Please enter a PDF URL.');
      return;
    }
    
    if (!isValidUrl(url)) {
      showError('Please enter a valid URL.');
      return;
    }
    
    await loadPdfFromUrl(url);
  });
  
  // Allow Enter key to trigger URL loading
  pdfUrlInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      loadUrlBtn.click();
    }
  });
}

// Function to validate URL
function isValidUrl(string) {
  try {
    const url = new URL(string);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch (_) {
    return false;
  }
}

// Function to load PDF from URL
async function loadPdfFromUrl(url) {
  // Reset state for new PDF
  resetApplicationState();
  
  showLoading('Fetching PDF from URL...');
  
  try {
    // Create a proxy URL to handle CORS issues
    const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;
    
    const response = await fetch(proxyUrl);
    
    if (!response.ok) {
      throw new Error(`Failed to fetch PDF: ${response.status} ${response.statusText}`);
    }
    
    const contentType = response.headers.get('content-type');
    if (contentType && !contentType.includes('application/pdf')) {
      // Try direct URL if proxy doesn't work
      const directResponse = await fetch(url, { mode: 'no-cors' });
      if (!directResponse.ok) {
        throw new Error('The URL does not point to a valid PDF file. Please check the URL and try again.');
      }
    }
    
    const arrayBuffer = await response.arrayBuffer();
    const blob = new Blob([arrayBuffer], { type: 'application/pdf' });
    
    // Create a File object from the blob
    const fileName = url.split('/').pop() || 'web-document.pdf';
    const file = new File([blob], fileName, { type: 'application/pdf' });
    
    lastPdfFile = file;
    pdfNameDiv.textContent = `${fileName} (from URL)`;
    
    showLoading('Processing PDF from URL...');
    
    const { text, numPages } = await extractTextAndRenderPDF(file);
    lastPdfText = text;
    showPDFLoadedMessage(numPages);
    
    // Clear the URL input for next use
    pdfUrlInput.value = '';
    
  } catch (error) {
    console.error('Error loading PDF from URL:', error);
    
    // Try alternative approach for CORS issues
    if (error.message.includes('CORS') || error.message.includes('fetch')) {
      showError(`Unable to load PDF from URL due to CORS restrictions. Please try:\n1. Using a direct PDF link\n2. Downloading the PDF and uploading it instead\n3. Using a different PDF URL`);
    } else {
      showError(`Error loading PDF from URL: ${error.message}`);
    }
    
    pdfCanvas.style.display = 'none';
  }
}

// Initialize study modes and UI
function initializeStudyModes() {
  // Study mode buttons
  document.querySelectorAll('.mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentStudyMode = btn.dataset.mode;
      updateUIForMode();
    });
  });
  
  // Comprehension level indicators
  document.querySelectorAll('.level-indicator').forEach(indicator => {
    indicator.addEventListener('click', () => {
      selectLevel(indicator.dataset.level);
    });
  });
  
  // Feature cards event listeners
  document.querySelectorAll('.feature-card').forEach(card => {
    card.addEventListener('click', async () => {
      const feature = card.dataset.feature;
      if (!lastPdfText) {
        showError('Please upload a PDF first.');
        return;
      }
      
      const apiKey = await getApiKey();
      if (!apiKey) return;
      
      switch(feature) {
        case 'comprehension':
          await executeDocumentAnalysis();
          break;
        case 'quiz':
          await startInteractiveQuiz();
          break;
        case 'flashcards':
          await generateFlashcards();
          break;
        case 'summary':
          await generateIntelligentSummary();
          break;
        default:
          showError('Unknown feature selected.');
      }
    });
  });
}

// Document analysis function
async function executeDocumentAnalysis() {
  if (!lastPdfText) {
    showError('Please upload a PDF first.');
    return;
  }
  
  const apiKey = await getApiKey();
  if (!apiKey) return;
  
  showLoading('Analyzing document...');
  
  const levelDescriptions = {
    basic: 'simple language suitable for beginners',
    intermediate: 'moderate complexity for general audiences',
    advanced: 'detailed technical language for experts'
  };
  
  const prompt = `Analyze this document using ${levelDescriptions[currentComprehensionLevel]}. Provide:
1. Key concepts and main ideas
2. Important themes and arguments
3. Critical insights and takeaways
4. Potential questions for further study

Document content:
${lastPdfText.substring(0, 4000)}`;
  
  try {
    const response = await makeOpenAIRequest([{ role: 'user', content: prompt }]);
    const analysis = response.choices[0].message.content;
    lastAIText = analysis;
    displayOutput(analysis);
    exportBtn.style.display = 'block';
  } catch (error) {
    console.error('Error analyzing document:', error);
    showError(`Failed to analyze document: ${error.message}`);
  }
}

// Global function for level selection (called from HTML)
function selectLevel(level) {
  document.querySelectorAll('.level-indicator').forEach(i => i.classList.remove('active'));
  const selectedIndicator = document.querySelector(`[data-level="${level}"]`);
  if (selectedIndicator) {
    selectedIndicator.classList.add('active');
  }
  currentComprehensionLevel = level;
  
  // Visual feedback
  const levelNames = {
    basic: '🟢 Basic Level Selected',
    intermediate: '🟡 Intermediate Level Selected', 
    advanced: '🔴 Advanced Level Selected'
  };
  
  // Show brief feedback
  const feedback = document.createElement('div');
  feedback.style = 'position: fixed; top: 20px; right: 20px; background: #4caf50; color: white; padding: 10px 15px; border-radius: 5px; z-index: 1000; font-size: 0.9em;';
  feedback.textContent = levelNames[level];
  document.body.appendChild(feedback);
  
  setTimeout(() => {
    if (feedback.parentNode) {
      feedback.parentNode.removeChild(feedback);
    }
  }, 2000);
}



function initializeEventListeners() {
  // Suggest questions button
  if (suggestBtn) {
    suggestBtn.addEventListener('click', generateSuggestedQuestions);
  }
  
  // Start quiz button
  if (startQuizBtn) {
    startQuizBtn.addEventListener('click', startInteractiveQuiz);
  }
  
  // Smart Summary button
  const smartSummaryBtn = document.getElementById('smartSummaryBtn');
  if (smartSummaryBtn) {
    smartSummaryBtn.addEventListener('click', async () => {
      if (!lastPdfText) {
        showError('Please upload a PDF first.');
        return;
      }
      await generateIntelligentSummary();
    });
  }
  
  // Create dedicated Create Flashcards button
  const createFlashcardsBtn = document.createElement('button');
  createFlashcardsBtn.id = 'createFlashcardsBtn';
  createFlashcardsBtn.textContent = '📚 Create Flashcards';
  createFlashcardsBtn.style = 'background: #9c27b0; color: #fff; border: none; border-radius: 5px; padding: 8px 18px; cursor: pointer; font-size: 1em; display: none;';
  createFlashcardsBtn.addEventListener('click', generateFlashcards);
  
  // Insert the button after the Start Quiz button
  if (startQuizBtn && startQuizBtn.parentNode) {
    startQuizBtn.parentNode.insertBefore(createFlashcardsBtn, startQuizBtn.nextSibling);
  }
  
  // Feature card event listeners - THIS WAS MISSING!
  initializeFeatureCards();
  
  // Quiz navigation buttons (these are created dynamically, so they might not exist yet)
  // They will be handled via onclick attributes in the HTML
}

// Initialize feature card click handlers
function initializeFeatureCards() {
  // Remove any existing listeners first to prevent duplicates
  document.querySelectorAll('.feature-card').forEach(card => {
    const newCard = card.cloneNode(true);
    card.parentNode.replaceChild(newCard, card);
  });
  
  // Add fresh event listeners
  document.querySelectorAll('.feature-card').forEach(card => {
    card.addEventListener('click', async () => {
      if (!lastPdfText) {
        showError('Please upload a PDF first.');
        return;
      }
      
      const feature = card.dataset.feature;
      
      // Add visual feedback
      card.style.transform = 'scale(0.95)';
      setTimeout(() => {
        card.style.transform = 'scale(1)';
      }, 150);
      
      // Execute the appropriate function based on feature type
      switch (feature) {
        case 'comprehension':
          await executeDocumentAnalysis();
          break;
        case 'quiz':
          await startInteractiveQuiz();
          break;
        case 'flashcards':
          await generateFlashcards();
          break;
        case 'summary':
          await generateIntelligentSummary();
          break;
        default:
          showError('Unknown feature selected.');
      }
    });
    
    // Add hover effects
    card.addEventListener('mouseenter', () => {
      card.style.transform = 'translateY(-2px)';
      card.style.boxShadow = '0 8px 25px rgba(255, 179, 0, 0.3)';
    });
    
    card.addEventListener('mouseleave', () => {
      card.style.transform = 'translateY(0)';
      card.style.boxShadow = '0 4px 15px rgba(0, 0, 0, 0.3)';
    });
  });
}

function updateUIForMode() {
  // Hide all sections first
  suggestionsSection.style.display = 'none';
  quizSection.style.display = 'none';
  comprehensionLevel.style.display = 'none';
  startQuizBtn.style.display = 'none';
  
  const createFlashcardsBtn = document.getElementById('createFlashcardsBtn');
  if (createFlashcardsBtn) {
    createFlashcardsBtn.style.display = 'none';
  }
  
  // Update placeholder text
  const placeholders = {
    comprehension: 'Ask a detailed question about the document for deep analysis...',
    quiz: 'Let AI generate quiz questions to test your understanding...',
    flashcards: 'Create flashcards for key concepts and terms...',
    summary: 'Request a summary at your preferred comprehension level...'
  };
  
  questionInput.placeholder = placeholders[currentStudyMode] || questionInput.placeholder;
  
  // Show relevant UI elements
  if (currentStudyMode === 'comprehension') {
    comprehensionLevel.style.display = 'flex';
  } else if (currentStudyMode === 'quiz') {
    startQuizBtn.style.display = 'inline-block';
  } else if (currentStudyMode === 'flashcards' && createFlashcardsBtn) {
    createFlashcardsBtn.style.display = 'inline-block';
  }
}

function showWelcomeMessage() {
  featureGrid.style.display = 'grid';
  outputDiv.innerHTML = `
    <div class="card">
      <strong>🎉 Welcome to StudyMind AI!</strong>
      <p style="font-size: 1.1em; margin: 15px 0;">Transform any PDF into an interactive learning experience with AI-powered study tools.</p>
      
      <div style="background: #2d0036; padding: 15px; border-radius: 8px; margin: 15px 0; border-left: 4px solid #ffb300;">
        <strong style="color: #ffb300;">🚀 Getting Started (3 Easy Steps):</strong>
        <ol style="margin: 10px 0; padding-left: 20px; color: #fff;">
          <li><strong>📤 Upload:</strong> Click "Upload & Parse PDF" to select your document</li>
          <li><strong>🔑 API Key:</strong> Enter your OpenAI or OpenRouter API key above</li>
          <li><strong>🎓 Learn:</strong> Click any feature card below or use the study mode buttons</li>
        </ol>
      </div>
      
      <p style="color: #ffb300; font-weight: bold; margin: 15px 0;">📚 Available Study Modes:</p>
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 10px; margin: 10px 0;">
        <div style="background: #4b006e; padding: 10px; border-radius: 6px; text-align: center;">
          <div style="font-size: 1.5em;">🧠</div>
          <strong>Document Analysis</strong><br>
          <small style="color: #ccc;">Deep insights & key concepts</small>
        </div>
        <div style="background: #4b006e; padding: 10px; border-radius: 6px; text-align: center;">
          <div style="font-size: 1.5em;">🎯</div>
          <strong>Interactive Quiz</strong><br>
          <small style="color: #ccc;">Test your understanding</small>
        </div>
        <div style="background: #4b006e; padding: 10px; border-radius: 6px; text-align: center;">
          <div style="font-size: 1.5em;">📚</div>
          <strong>Smart Flashcards</strong><br>
          <small style="color: #ccc;">Memorize key terms</small>
        </div>
        <div style="background: #4b006e; padding: 10px; border-radius: 6px; text-align: center;">
          <div style="font-size: 1.5em;">📝</div>
          <strong>Smart Summary</strong><br>
          <small style="color: #ccc;">Concise overviews</small>
        </div>
      </div>
    </div>
  `;
}

function showPDFLoadedMessage(numPages) {
  featureGrid.style.display = 'grid';
  outputDiv.innerHTML = `
    <div class="card">
      <strong>✅ PDF Successfully Loaded!</strong>
      <p>📄 Document contains ${numPages} page(s) and is ready for analysis.</p>
      <p>🎓 Choose your learning mode above and start exploring with AI-powered study tools!</p>
    </div>
  `;
}

const extractionModeDiv = document.createElement('div');
extractionModeDiv.style = 'display: flex; align-items: center; gap: 8px; margin-bottom: 10px;';
extractionModeDiv.innerHTML = `<label for="extractionMode" style="color:#ffb300;">AI Scope:</label>
<select id="extractionMode" style="background:#4b006e;color:#fff;border-radius:5px;padding:4px 10px;border:1px solid #e53935;">
  <option value="full">Full PDF</option>
  <option value="page">Current Page</option>
</select>`;
document.querySelector('.upload').appendChild(extractionModeDiv);
const extractionMode = document.getElementById('extractionMode');

let allPageTexts = [];

// Patch extractTextAndRenderPDF to store all page texts
async function extractTextAndRenderPDF(file) {
  const arrayBuffer = await file.arrayBuffer();
  pdfDoc = await window['pdfjsLib'].getDocument({ data: arrayBuffer }).promise;
  totalPages = pdfDoc.numPages;
  currentPage = 1;
  await renderPage(currentPage);
  let fullText = '';
  allPageTexts = [];
  for (let i = 1; i <= pdfDoc.numPages; i++) {
    const page = await pdfDoc.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items.map(item => item.str).join(' ');
    fullText += pageText + '\n';
    allPageTexts.push(pageText);
  }
  updatePageIndicator();
  return { text: fullText.slice(0, 8000), numPages: pdfDoc.numPages };
}

// Patch askBtn click to use extractionMode
askBtn.addEventListener('click', async () => {
  const question = questionInput.value.trim();
  if (!question) {
    showError('Please enter a question.');
    return;
  }
  
  const apiKey = await getApiKey();
  if (!apiKey) return;
  
  showLoading('AI is analyzing your question...');
  
  try {
    let contextText = '';
    
    if (extractionMode.value === 'page' && allPageTexts && allPageTexts[currentPage-1]) {
      contextText = allPageTexts[currentPage-1];
    } else if (lastPdfText) {
      contextText = lastPdfText;
    } else {
      showError('No PDF content available. Please upload a PDF or browse to a PDF page.');
      return;
    }
    
    // Enhanced prompt based on study mode and comprehension level
    let prompt = '';
    const levelInstructions = {
      basic: 'Provide a simple, easy-to-understand explanation suitable for beginners.',
      intermediate: 'Provide a detailed explanation with moderate complexity.',
      advanced: 'Provide a comprehensive, in-depth analysis with technical details.'
    };
    
    switch (currentStudyMode) {
      case 'comprehension':
        prompt = `${levelInstructions[currentComprehensionLevel]} Answer this question about the document: "${question}"\n\nDocument content:\n${contextText.substring(0, 4000)}`;
        break;
      case 'flashcards':
        prompt = `Create flashcard-style content for: "${question}". Format as:\n\n**Front:** [Key concept/question]\n**Back:** [Answer/explanation]\n\nBased on this document:\n${contextText.substring(0, 3000)}`;
        break;
      case 'summary':
        prompt = `${levelInstructions[currentComprehensionLevel]} Create a summary focusing on: "${question}"\n\nDocument content:\n${contextText.substring(0, 4000)}`;
        break;
      default:
        prompt = `Based on the following document content, please answer this question: "${question}"\n\nDocument content:\n${contextText.substring(0, 4000)}`;
    }
    
    const data = await makeOpenAIRequest([{ role: 'user', content: prompt }], (window.CRACKIT_CONFIG && window.CRACKIT_CONFIG.MAX_TOKENS) || 1000);
    
    const answer = data.choices[0].message.content;
    displayOutput(answer);
    
    // Clear the input
    questionInput.value = '';
    
  } catch (error) {
    showError(`Error: ${error.message}`);
  }
});

async function generateStudyNotes(text) {
  showLoading('Generating study notes with AI...');
  const prompt = `Turn this text into study notes with:\n\nA short summary\n\n10 flashcards (Q/A format)\n\n3 multiple choice quiz questions\n\n${text}`;
  try {
    const data = await makeOpenAIRequest([
      { role: 'system', content: 'You are a helpful assistant that creates study notes from PDF text.' },
      { role: 'user', content: prompt }
    ], (window.CRACKIT_CONFIG && window.CRACKIT_CONFIG.MAX_TOKENS) || 800);
    
    const aiText = data.choices?.[0]?.message?.content || 'No response from AI.';
    displayOutput(aiText);
  } catch (err) {
    showError(`AI Error: ${err.message}`);
  }
}

async function askAIAboutPDF(apiKey, pdfText, question) {
  showLoading('Asking AI...');
  const prompt = `${question}\n\nPDF Content:\n${pdfText}`;
  try {
    const data = await makeOpenAIRequest([
      { role: 'system', content: 'You are a helpful assistant that answers questions about PDF content.' },
      { role: 'user', content: prompt }
    ], (window.CRACKIT_CONFIG && window.CRACKIT_CONFIG.MAX_TOKENS) || 800);
    
    const aiText = data.choices?.[0]?.message?.content || 'No response from AI.';
    return aiText;
  } catch (err) {
    showError(`AI Error: ${err.message}`);
    return err.message;
  }
}

function displayOutput(text) {
  lastAIText = text;
  exportBtn.style.display = text && text.length > 0 ? '' : 'none';
  
  // Hide feature grid when showing results
  featureGrid.style.display = 'none';
  
  // For flashcards, use the interactive display function
  if (currentStudyMode === 'flashcards') {
    displayInteractiveFlashcards(text);
    return;
  }
  
  // Enhanced formatting for other study modes
  const formattedContent = formatRegularContent(text);
  outputDiv.innerHTML = formattedContent;
}

function formatRegularContent(text) {
  const blocks = text.split(/(Summary|Flashcard|Quiz|\n\n|\n(?=Q:|A:|\d+\.))/i).filter(Boolean);
  let content = '';
  
  blocks.forEach(block => {
    const trimmed = block.trim();
    if (trimmed.length > 0) {
      // Add study mode indicator
      const modeIcon = {
        comprehension: '🧠',
        summary: '📝',
        flashcards: '📚',
        quiz: '🎯'
      };
      
      const icon = modeIcon[currentStudyMode] || '💡';
      
      // Highlight headings and format content
      let html = trimmed.replace(/^(Summary|Flashcard|Quiz|Q\d*\:|A\:|\d+\.)/i, match => `<strong>${match}</strong>`);
      html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
      html = html.replace(/\n/g, '<br>');
      
      content += `
        <div class="card study-card">
          <div class="card-header">
            <span class="mode-indicator">${icon} ${currentStudyMode.charAt(0).toUpperCase() + currentStudyMode.slice(1)} Mode</span>
            ${currentComprehensionLevel ? `<span class="level-badge">${currentComprehensionLevel}</span>` : ''}
          </div>
          <div class="card-content">${html}</div>
          <button class="copy-btn" onclick="navigator.clipboard.writeText('${trimmed.replace(/'/g, "\\'")}')">📋 Copy</button>
        </div>
      `;
    }
  });
  
  return content;
}

function updatePageIndicator() {
  pageIndicator.textContent = `Page ${currentPage} of ${totalPages}`;
  prevPageBtn.disabled = currentPage <= 1;
  nextPageBtn.disabled = currentPage >= totalPages;
}

async function renderPage(pageNum) {
  if (!pdfDoc) return;
  const page = await pdfDoc.getPage(pageNum);
  const viewport = page.getViewport({ scale: 1.5 });
  pdfCanvas.height = viewport.height;
  pdfCanvas.width = viewport.width;
  pdfCanvas.style.display = 'block';
  const renderContext = {
    canvasContext: pdfCanvas.getContext('2d'),
    viewport: viewport
  };
  await page.render(renderContext).promise;
  currentPage = pageNum;
  updatePageIndicator();
}

prevPageBtn.addEventListener('click', () => {
  if (currentPage > 1) {
    renderPage(currentPage - 1);
  }
});
nextPageBtn.addEventListener('click', () => {
  if (currentPage < totalPages) {
    renderPage(currentPage + 1);
  }
});

// Load API key from storage or config
async function loadApiKey() {
  if (window.chrome && chrome.storage && chrome.storage.local) {
    try {
      const result = await chrome.storage.local.get(['openai_api_key', 'api_service']);
      if (result.openai_api_key) {
        apiKeyInput.value = result.openai_api_key;
        apiKeyInput.style.background = '#2d0036';
        apiKeyInput.style.borderColor = '#4b006e';
        
        // Set service selector
        const serviceSelector = document.getElementById('apiService');
        if (serviceSelector && result.api_service) {
          serviceSelector.value = result.api_service;
          updateApiKeyPlaceholder();
        }
        
        // Validate the loaded key
        const service = serviceSelector?.value || 'openai';
        await validateApiKey(result.openai_api_key, service);
        return;
      }
    } catch (error) {
      console.log('Could not load from storage:', error);
    }
  }
  
  // Fallback to config default
  if (config && config.DEFAULT_API_KEY) {
    apiKeyInput.value = config.DEFAULT_API_KEY;
    apiKeyInput.style.background = '#2d0036';
    apiKeyInput.style.borderColor = '#4b006e';
    
    // Auto-save if enabled
    if (config.AUTO_SAVE_API_KEY && window.chrome && chrome.storage) {
      try {
        await chrome.storage.local.set({ openai_api_key: config.DEFAULT_API_KEY });
      } catch (error) {
        console.log('Could not save to storage:', error);
      }
    }
    
    // Validate the default key
    const service = document.getElementById('apiService')?.value || 'openai';
    await validateApiKey(config.DEFAULT_API_KEY, service);
  }
}

// API key validation and UI feedback
const apiKeyContainer = document.createElement('div');
apiKeyContainer.style = 'display: flex; align-items: center; gap: 8px; margin: 10px 0;';

// Move API key input to container
const apiKeyParent = apiKeyInput.parentNode;
apiKeyParent.insertBefore(apiKeyContainer, apiKeyInput);
apiKeyContainer.appendChild(apiKeyInput);

// Add validation checkmark
const validationIcon = document.createElement('span');
validationIcon.id = 'apiValidationIcon';
validationIcon.style = 'font-size: 1.2em; display: none;';
apiKeyContainer.appendChild(validationIcon);

// Use existing service selector instead of creating duplicate
const serviceSelector = document.getElementById('apiService');

// Add forget button
const forgetBtn = document.createElement('button');
forgetBtn.textContent = 'Forget Key';
forgetBtn.style = 'background:#e53935;color:#fff;border:none;border-radius:5px;padding:4px 12px;margin-left:8px;cursor:pointer;font-size:0.95em;';
apiKeyContainer.appendChild(forgetBtn);

// Update placeholder based on service
function updateApiKeyPlaceholder() {
  const service = serviceSelector.value;
  if (service === 'openrouter') {
    apiKeyInput.placeholder = 'Enter OpenRouter API Key';
  } else {
    apiKeyInput.placeholder = 'Enter OpenAI API Key (or set DEFAULT_API_KEY in config.js)';
  }
}

serviceSelector.addEventListener('change', updateApiKeyPlaceholder);
updateApiKeyPlaceholder();

// API key validation function
async function validateApiKey(apiKey, service) {
  const validationIcon = document.getElementById('apiValidationIcon');
  
  if (!apiKey.trim()) {
    validationIcon.style.display = 'none';
    return false;
  }
  
  try {
    const testUrl = service === 'openrouter' 
      ? 'https://openrouter.ai/api/v1/models'
      : 'https://api.openai.com/v1/models';
    
    const response = await fetch(testUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (response.ok) {
      validationIcon.textContent = '✅';
      validationIcon.style.display = 'inline';
      validationIcon.style.color = '#4caf50';
      return true;
    } else {
      validationIcon.textContent = '❌';
      validationIcon.style.display = 'inline';
      validationIcon.style.color = '#f44336';
      return false;
    }
  } catch (error) {
    validationIcon.textContent = '❌';
    validationIcon.style.display = 'inline';
    validationIcon.style.color = '#f44336';
    return false;
  }
}

// Load stored key or use default
loadApiKey();

// Save key on change and validate
apiKeyInput.addEventListener('change', async () => {
  const service = document.getElementById('apiService').value;
  if (window.chrome && chrome.storage && chrome.storage.local) {
    chrome.storage.local.set({ 
      openai_api_key: apiKeyInput.value,
      api_service: service
    });
  }
  await validateApiKey(apiKeyInput.value, service);
});

// Validate on service change
serviceSelector.addEventListener('change', async () => {
  const service = serviceSelector.value;
  if (window.chrome && chrome.storage && chrome.storage.local) {
    chrome.storage.local.set({ api_service: service });
  }
  await validateApiKey(apiKeyInput.value, service);
});

// Forget key
forgetBtn.addEventListener('click', () => {
  apiKeyInput.value = '';
  document.getElementById('apiValidationIcon').style.display = 'none';
  if (window.chrome && chrome.storage && chrome.storage.local) {
    chrome.storage.local.remove(['openai_api_key', 'api_service']);
  }
  apiKeyInput.focus();
});

// Add tooltips for navigation buttons
prevPageBtn.title = 'Go to previous page';
nextPageBtn.title = 'Go to next page';
askBtn.title = 'Ask the AI about the PDF (uses your API key)';
uploadBtn.title = 'Upload a PDF from your computer';

// Add Smart Summary button functionality
const smartSummaryBtn = document.getElementById('smartSummaryBtn');
if (smartSummaryBtn) {
  smartSummaryBtn.addEventListener('click', async () => {
    if (!pdfText) {
      showError('Please upload and parse a PDF first.');
      return;
    }
    await generateComprehensiveSummary('comprehensive');
  });
  smartSummaryBtn.title = 'Generate a comprehensive summary of the PDF';
}

// Add aria-live region for accessibility
let ariaLive = document.getElementById('ariaLive');
if (!ariaLive) {
  ariaLive = document.createElement('div');
  ariaLive.id = 'ariaLive';
  ariaLive.setAttribute('aria-live', 'polite');
  ariaLive.style = 'position:absolute;left:-9999px;height:1px;width:1px;overflow:hidden;';
  document.body.appendChild(ariaLive);
}
function announce(msg) {
  ariaLive.textContent = msg;
}

// Improved error display
function showError(msg) {
  outputDiv.innerHTML = `<div class="card" style="border-left:5px solid #e53935;background:#6e0036;">${msg}</div>`;
  announce(msg);
}

// Improved loading overlay
function showLoading(msg) {
  outputDiv.innerHTML = `<div class="spinner"></div><div class="loading">${msg}</div>`;
  announce(msg);
}

let exportBtn = document.createElement('button');
exportBtn.textContent = 'Download AI Answer';
exportBtn.style = 'background:#4b006e;color:#fff;border:none;border-radius:5px;padding:6px 18px;margin:10px 0;cursor:pointer;font-size:1em;display:none;';
exportBtn.onclick = () => {
  if (!lastAIText) return;
  const blob = new Blob([lastAIText], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'ai_answer.txt';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
};
document.querySelector('.upload').appendChild(exportBtn);