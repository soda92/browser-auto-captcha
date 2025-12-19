const fs = require('fs');
const path = require('path');
const https = require('https');
const { execSync } = require('child_process');

const PUBLIC_DIR = path.join(__dirname, '../public/tesseract');
const NODE_MODULES = path.join(__dirname, '../node_modules');

// Ensure public directory exists
if (!fs.existsSync(PUBLIC_DIR)) {
  fs.mkdirSync(PUBLIC_DIR, { recursive: true });
}

// Files to copy from node_modules
const FILES_TO_COPY = [
  {
    src: path.join(NODE_MODULES, 'tesseract.js/dist/worker.min.js'),
    dest: path.join(PUBLIC_DIR, 'worker.min.js'),
  },
  {
    src: path.join(NODE_MODULES, 'tesseract.js-core/tesseract-core.wasm.js'),
    dest: path.join(PUBLIC_DIR, 'tesseract-core.wasm.js'),
  },
];

console.log('Copying Tesseract files...');
FILES_TO_COPY.forEach(({ src, dest }) => {
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, dest);
    console.log(`Copied: ${path.basename(src)}`);
  } else {
    console.error(`Error: Could not find ${src}. Run 'npm install' first.`);
  }
});

// Download trained data
const TRAINED_DATA_URL = 'https://github.com/naptha/tessdata/raw/gh-pages/4.0.0/eng.traineddata.gz';
const TRAINED_DATA_DEST = path.join(PUBLIC_DIR, 'eng.traineddata.gz');

if (!fs.existsSync(TRAINED_DATA_DEST)) {
  console.log('Downloading eng.traineddata.gz...');
  const file = fs.createWriteStream(TRAINED_DATA_DEST);
  https.get(TRAINED_DATA_URL, (response) => {
    response.pipe(file);
    file.on('finish', () => {
      file.close();
      console.log('Download complete.');
    });
  }).on('error', (err) => {
    fs.unlink(TRAINED_DATA_DEST, () => {}); // Delete the file async
    console.error('Error downloading file:', err.message);
  });
} else {
  console.log('eng.traineddata.gz already exists.');
}
