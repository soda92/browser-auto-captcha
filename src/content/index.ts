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

async function convertImageToBase64(url: string): Promise<string> {
  const response = await fetch(url);
  const blob = await response.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

async function solveCaptcha(img: HTMLImageElement) {
  if (!isEnabled) return;

  try {
    img.dataset.ocrProcessed = 'true'; // Mark as processed
    console.log('[AutoCaptcha] Found captcha:', img.src);

    const base64 = await convertImageToBase64(img.src);
    
    console.log('[AutoCaptcha] Sending for OCR...');
    const response = await chrome.runtime.sendMessage({
      action: 'SOLVE_CAPTCHA',
      data: base64,
    });

    if (response && response.success) {
      const text = response.text.trim().replace(/[^a-zA-Z0-9]/g, '');
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
