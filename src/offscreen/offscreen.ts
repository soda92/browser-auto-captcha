import { createWorker } from 'tesseract.js';

let worker: Tesseract.Worker | null = null;

async function initWorker() {
  if (worker) return worker;

  console.log('Initializing Tesseract Worker...');
  worker = await createWorker('eng', 1, {
    workerPath: chrome.runtime.getURL('tesseract/worker.min.js'),
    corePath: chrome.runtime.getURL('tesseract/tesseract-core.wasm.js'),
    langPath: chrome.runtime.getURL('tesseract/'), // Must end with /
    logger: m => console.log(m),
  });
  console.log('Tesseract Worker Initialized');
  return worker;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'OCR_REQUEST') {
    (async () => {
      try {
        const w = await initWorker();
        if (!w) throw new Error('Worker failed to initialize');
        
        console.log('Recognizing...');
        const ret = await w.recognize(message.data);
        console.log('Result:', ret.data.text);
        
        sendResponse({ success: true, text: ret.data.text });
      } catch (error) {
        console.error('OCR Error:', error);
        sendResponse({ success: false, error: (error as Error).message });
      }
    })();
    return true; // Keep channel open
  }
});
