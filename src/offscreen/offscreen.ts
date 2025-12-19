import { createWorker } from 'tesseract.js';

let worker: Tesseract.Worker | null = null;

async function initWorker() {
  if (worker) return worker;

  console.log('Initializing Tesseract Worker...');
  worker = await createWorker('eng', 1, {
    workerPath: chrome.runtime.getURL('tesseract/worker.min.js'),
    corePath: chrome.runtime.getURL('tesseract/tesseract-core.wasm.js'),
    langPath: chrome.runtime.getURL('tesseract/'),
    logger: m => console.log(m),
  });
  console.log('Tesseract Worker Initialized');
  return worker;
}

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
  devicePixelRatio: number;
}

async function cropImage(imageUri: string, rect?: Rect, applyFilter: boolean = false): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) return reject('No canvas context');

      let sourceX = 0, sourceY = 0, sourceW = img.width, sourceH = img.height;
      let destW = img.width, destH = img.height;

      if (rect) {
        const scale = rect.devicePixelRatio;
        sourceX = rect.x * scale;
        sourceY = rect.y * scale;
        sourceW = rect.width * scale;
        sourceH = rect.height * scale;
        // Use scaled dimensions for canvas to maintain resolution
        destW = sourceW;
        destH = sourceH;
      }

      canvas.width = destW;
      canvas.height = destH;

      // Draw the specific slice or full image
      ctx.drawImage(
        img,
        sourceX, sourceY, sourceW, sourceH, // Source
        0, 0, destW, destH // Dest
      );

      if (applyFilter) {
        // Simple binarization filter
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;
        for (let i = 0; i < data.length; i += 4) {
          const avg = (data[i] + data[i + 1] + data[i + 2]) / 3;
          const val = avg > 140 ? 255 : 0; // Slightly higher threshold
          data[i] = val;     // R
          data[i + 1] = val; // G
          data[i + 2] = val; // B
        }
        ctx.putImageData(imageData, 0, 0);
      }

      resolve(canvas.toDataURL());
    };
    img.onerror = reject;
    img.src = imageUri;
  });
}

function isValidResult(text: string): boolean {
  // Allow only 4 alphanumeric characters
  return /^[a-zA-Z0-9]{4}$/.test(text);
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'OCR_REQUEST') {
    (async () => {
      try {
        const w = await initWorker();
        if (!w) throw new Error('Worker failed to initialize');
        
        const { imageUri, rect } = message.data;

        // Attempt 1: Raw Crop
        console.log('OCR Attempt 1 (Raw)...');
        let croppedImage = await cropImage(imageUri, rect, false);
        let ret = await w.recognize(croppedImage);
        let cleanedText = ret.data.text.trim().replace(/[^a-zA-Z0-9]/g, '');

        if (isValidResult(cleanedText)) {
          console.log('Valid result found:', cleanedText);
          sendResponse({ success: true, text: cleanedText });
          return;
        }

        // Attempt 2: Binarized Crop (Retry)
        console.log(`Invalid result '${cleanedText}'. Retrying with filter...`);
        croppedImage = await cropImage(imageUri, rect, true); // applyFilter = true
        ret = await w.recognize(croppedImage);
        cleanedText = ret.data.text.trim().replace(/[^a-zA-Z0-9]/g, '');

        if (isValidResult(cleanedText)) {
           console.log('Valid result found after retry:', cleanedText);
           sendResponse({ success: true, text: cleanedText });
        } else {
           // Return best effort, but mark as potentially failed? 
           // Or just return it. The content script will just fill it.
           console.log(`Retry finished. Result: '${cleanedText}'`);
           sendResponse({ success: true, text: cleanedText });
        }

      } catch (error) {
        console.error('OCR Error:', error);
        sendResponse({ success: false, error: (error as Error).message });
      }
    })();
    return true; // Keep channel open
  }
});