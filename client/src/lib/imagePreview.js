// Downscales a picture in the browser before it is uploaded, and renders page one of a PDF
// for the file cabinet's hover preview. Both happen here rather than on the server because
// rendering needs a canvas, which the serverless functions do not have.

function drawToJpeg(source, width, height, max, quality) {
  const scale = Math.min(max / width, max / height, 1);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', quality);
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read that image.')); };
    img.src = url;
  });
}

// A square-ish avatar at 256px lands around 30 KB.
export async function resizeAvatar(file, max = 256) {
  const img = await loadImage(file);
  const dataUrl = drawToJpeg(img, img.naturalWidth, img.naturalHeight, max, 0.85);
  const blob = await (await fetch(dataUrl)).blob();
  return new File([blob], 'avatar.jpg', { type: 'image/jpeg' });
}

// Returns a data URL for the hover card, or null when the type has no sensible preview
// (Word, Excel and friends — those get a filetype glyph instead).
export async function makeThumbnail(file, max = 320) {
  if (file.type.startsWith('image/')) {
    try {
      const img = await loadImage(file);
      return drawToJpeg(img, img.naturalWidth, img.naturalHeight, max, 0.7);
    } catch { return null; }
  }
  if (file.type === 'application/pdf') {
    try {
      // Loaded only when a PDF is actually uploaded, so the renderer never costs anyone else
      // a download.
      const pdfjs = await import('pdfjs-dist');
      pdfjs.GlobalWorkerOptions.workerSrc = (await import('pdfjs-dist/build/pdf.worker.min.mjs')).default;
      const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
      const page = await doc.getPage(1);
      const base = page.getViewport({ scale: 1 });
      const scale = Math.min(max / base.width, max / base.height, 2);
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(viewport.width);
      canvas.height = Math.round(viewport.height);
      await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
      return canvas.toDataURL('image/jpeg', 0.7);
    } catch { return null; }
  }
  return null;
}
