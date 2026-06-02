// Claude Local Files — background service worker
// Gère la communication entre popup et content script

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'GET_STATUS') {
    // Vérifier si le serveur local est en ligne
    fetch('http://localhost:3747/ping', { signal: AbortSignal.timeout(1500) })
      .then(r => sendResponse({ online: r.ok }))
      .catch(() => sendResponse({ online: false }));
    return true; // async
  }
});
