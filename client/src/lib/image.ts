/** Crops an image file to a centred square and scales it down, returning a small JPEG (typically 10-40 KB). */
export const squareThumbnail = async (file: File, size = 256, quality = 0.88): Promise<Blob> => {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('That file could not be read as an image.'));
      el.src = url;
    });
    const side = Math.min(img.naturalWidth, img.naturalHeight);
    if (!side) throw new Error('That file could not be read as an image.');
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Your browser cannot resize images.');
    ctx.fillStyle = '#ffffff'; // transparent PNGs would otherwise turn black in a JPEG
    ctx.fillRect(0, 0, size, size);
    ctx.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, size, size);
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not process the image.'))), 'image/jpeg', quality));
  } finally {
    URL.revokeObjectURL(url);
  }
};
