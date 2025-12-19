const OFFSCREEN_DOCUMENT_PATH = 'src/offscreen/index.html';

async function hasDocument() {
  // @ts-ignore
  if ('getContexts' in chrome.runtime) {
    // @ts-ignore
    const contexts = await chrome.runtime.getContexts({
      contextTypes: ['OFFSCREEN_DOCUMENT'],
    });
    return contexts.length > 0;
  } else {
    // @ts-ignore
    const matchedClients = await clients.matchAll();
    // @ts-ignore
    return matchedClients.some((client) => {
      return client.url.includes(OFFSCREEN_DOCUMENT_PATH);
    });
  }
}

async function setupOffscreenDocument(path: string) {
  if (await hasDocument()) {
    return;
  }

  // create offscreen document
  if ('offscreen' in chrome) {
    // @ts-ignore
    await chrome.offscreen.createDocument({
      url: path,
      reasons: ['BLOBS'],
      justification: 'OCR processing',
    });
  } else {
    // Fallback or error for browsers without offscreen API
    console.error('Offscreen API not supported');
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'SOLVE_CAPTCHA') {
    (async () => {
      try {
        await setupOffscreenDocument(OFFSCREEN_DOCUMENT_PATH);
        const response = await chrome.runtime.sendMessage({
          action: 'OCR_REQUEST',
          data: message.data,
        });
        sendResponse(response);
      } catch (error) {
        console.error('Error in background OCR:', error);
        sendResponse({ error: (error as Error).message });
      }
    })();
    return true; // Keep channel open
  }
});
