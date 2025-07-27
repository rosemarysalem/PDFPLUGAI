chrome.action.onClicked.addListener(() => {
  chrome.tabs.create({ url: chrome.runtime.getURL('dashboard.html') });
});

// Listen for messages from content script and relay PDF data to dashboard
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'PDF_DATA_EXTRACTED') {
    // Store PDF data in chrome storage for dashboard access
    chrome.storage.local.set({
      'webPdfData': message.pdfDataBase64,
      'webPdfUrl': message.pdfUrl
    });
    sendResponse({ status: 'ok' });
  }
  
  if (message.type === 'REQUEST_WEB_PDF') {
    chrome.storage.local.get(['webPdfData', 'webPdfUrl'], (result) => {
      sendResponse({ 
        pdfDataBase64: result.webPdfData, 
        pdfUrl: result.webPdfUrl 
      });
    });
    return true; // Keep message channel open for async response
  }
});