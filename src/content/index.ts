console.log('[AutoCaptcha] Content script loaded');

let isEnabled = true;

// Initialize state
chrome.storage.local.get(['enabled'], (result) => {
  const res = result as any;
  isEnabled = res.enabled !== undefined ? res.enabled : true;
});

// Listen for changes
chrome.storage.onChanged.addListener((changes) => {
  if (changes.enabled) {
    isEnabled = !!changes.enabled.newValue;
    console.log('[AutoCaptcha] Enabled state changed to:', isEnabled);
  }
});

const OBSERVER_CONFIG = { childList: true, subtree: true };
const VOCODE_PATTERN = 'voCode';

function isCaptchaImage(img: HTMLImageElement): boolean {
  return !!(img.src && img.src.includes(VOCODE_PATTERN) && !img.dataset.ocrProcessed);
}

async function captureImageViaCanvas(img: HTMLImageElement): Promise<string> {
  return new Promise((resolve, reject) => {
    try {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('No context');
      
      // Draw image to canvas
      ctx.drawImage(img, 0, 0);
      
      // Attempt to get data URL (throws if tainted)
      const dataUrl = canvas.toDataURL('image/png');
      resolve(dataUrl);
    } catch (e) {
      reject(e);
    }
  });
}

async function solveCaptcha(img: HTMLImageElement) {
  if (!isEnabled) return;

  try {
    img.dataset.ocrProcessed = 'true'; // Mark as processed
    console.log('[AutoCaptcha] Found captcha:', img.src);

    let messageData;

    // Method 1: Try Canvas (Best for one-time tokens, if CORS allows)
    try {
      console.log('[AutoCaptcha] Attempting Canvas capture...');
      const base64 = await captureImageViaCanvas(img);
      messageData = { image: base64 };
      console.log('[AutoCaptcha] Canvas capture successful.');
    } catch (e) {
      console.warn('[AutoCaptcha] Canvas capture failed (likely CORS). Falling back to Screenshot.', e);
      
      // Method 2: Fallback to Screenshot
      // Scroll into view to ensure we can capture it
      img.scrollIntoView({ behavior: 'instant', block: 'center', inline: 'center' });
      // Allow a brief moment for scroll to settle
      await new Promise(r => setTimeout(r, 100));

      const rect = img.getBoundingClientRect();
      messageData = {
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
        devicePixelRatio: window.devicePixelRatio
      };
    }
    
    console.log('[AutoCaptcha] Sending for OCR...');
    const response = await chrome.runtime.sendMessage({
      action: 'SOLVE_CAPTCHA',
      data: messageData,
    });

    if (response && response.success) {
      const text = response.text;
      console.log('[AutoCaptcha] Solved:', text);
      fillInput(img, text);
    } else {
      console.error('[AutoCaptcha] Failed to solve:', response?.error);
    }
  } catch (error) {
    console.error('[AutoCaptcha] Error processing captcha:', error);
  }
}

function fillInput(img: HTMLImageElement, text: string) {
  // Heuristic: Find nearest input
  // 1. Check siblings
  let input = img.parentElement?.querySelector('input[type="text"], input:not([type])');
  
  // 2. Check parent's siblings (common in table layouts)
  if (!input) {
     input = img.closest('div, tr, p, form')?.querySelector('input[type="text"], input:not([type])');
  }

  if (input && input instanceof HTMLInputElement) {
    console.log('[AutoCaptcha] Filling input:', input);
    input.value = text;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    
    // Visual feedback
    input.style.backgroundColor = '#e6fffa';
    input.style.border = '2px solid #38b2ac';
  } else {
    console.warn('[AutoCaptcha] Could not find input field for captcha');
  }
}

const observer = new MutationObserver((mutations) => {
  for (const mutation of mutations) {
    mutation.addedNodes.forEach((node) => {
      if (node instanceof HTMLElement) {
        if (node instanceof HTMLImageElement && isCaptchaImage(node)) {
          solveCaptcha(node);
        }
        // Check children
        const images = node.querySelectorAll('img');
        images.forEach((img) => {
          if (isCaptchaImage(img)) {
            solveCaptcha(img);
          }
        });
      }
    });
  }
});

// Start observing
observer.observe(document.body, OBSERVER_CONFIG);

// Process existing
document.querySelectorAll('img').forEach((img) => {
  if (isCaptchaImage(img)) {
    solveCaptcha(img);
  }
});
