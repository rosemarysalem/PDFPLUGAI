// contentScript.js
(function() {
  // Only run if the content type is PDF or the URL ends with .pdf
  if (!window.location.href.match(/\.pdf($|\?)/i)) return;

  // Fetch the PDF as ArrayBuffer
  fetch(window.location.href)
    .then(response => response.arrayBuffer())
    .then(buffer => {
      // Convert ArrayBuffer to base64
      const bytes = new Uint8Array(buffer);
      let binary = '';
      for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      const base64 = btoa(binary);
      // Send to background script
      chrome.runtime.sendMessage({
        type: 'PDF_DATA_EXTRACTED',
        pdfDataBase64: base64,
        pdfUrl: window.location.href
      });
    })
    .catch(err => {
      // Optionally, notify background of failure
      chrome.runtime.sendMessage({
        type: 'PDF_DATA_EXTRACTED',
        pdfDataBase64: null,
        pdfUrl: window.location.href,
        error: err.message
      });
    });
})(); 