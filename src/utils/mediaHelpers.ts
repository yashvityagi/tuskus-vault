import { GalleryItem } from '../types/gallery';

export function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 KB';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatDateShort(timestamp: number): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(timestamp));
}

export async function readFileAsHighResPhoto(file: File): Promise<{
  dataUrl: string;
  width: number;
  height: number;
  fileSizeBytes: number;
  mimeType: string;
}> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Failed to read image file'));
    reader.readAsDataURL(file);
  });

  const dimensions = await new Promise<{ width: number; height: number }>((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth || 1920, height: img.naturalHeight || 1440 });
    img.onerror = () => resolve({ width: 1920, height: 1440 });
    img.src = dataUrl;
  });

  return {
    dataUrl,
    width: dimensions.width,
    height: dimensions.height,
    fileSizeBytes: file.size,
    mimeType: file.type || 'image/jpeg',
  };
}

/**
 * Generates a high-resolution annotated spec-sheet PNG image with the photo,
 * Product ID, Label, Category, and Resolution for seamless sharing or saving.
 */
export async function generateAnnotatedShareSheetBlob(item: GalleryItem): Promise<Blob> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.crossOrigin = 'anonymous';
    el.onload = () => resolve(el);
    el.onerror = reject;
    el.src = item.imageDataUrl;
  });

  const canvas = document.createElement('canvas');
  const targetWidth = Math.max(img.naturalWidth || 1600, 1200);
  const scale = targetWidth / (img.naturalWidth || 1600);
  const imgHeight = Math.round((img.naturalHeight || 1200) * scale);
  const footerHeight = Math.round(targetWidth * 0.14);
  const padding = Math.round(targetWidth * 0.04);

  canvas.width = targetWidth + padding * 2;
  canvas.height = imgHeight + footerHeight + padding * 2;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Canvas 2D context unavailable');
  }

  // Background studio frame
  ctx.fillStyle = '#F4F4F0';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Draw crisp photo
  ctx.drawImage(img, padding, padding, targetWidth, imgHeight);

  // Subtle hairline divider below photo
  const metaTop = padding + imgHeight + Math.round(footerHeight * 0.28);
  ctx.strokeStyle = '#D4D4D8';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(padding, padding + imgHeight + Math.round(footerHeight * 0.14));
  ctx.lineTo(canvas.width - padding, padding + imgHeight + Math.round(footerHeight * 0.14));
  ctx.stroke();

  // Product ID (Monospace Left)
  const monoFontSize = Math.max(18, Math.round(targetWidth * 0.016));
  ctx.font = `600 ${monoFontSize}px "JetBrains Mono", monospace`;
  ctx.fillStyle = '#2563EB';
  ctx.fillText(`PRODUCT ID: ${item.productId}`, padding, metaTop + monoFontSize);

  // Product Label (Bold Title below ID)
  const titleFontSize = Math.max(24, Math.round(targetWidth * 0.024));
  ctx.font = `700 ${titleFontSize}px "Plus Jakarta Sans", sans-serif`;
  ctx.fillStyle = '#18181B';
  ctx.fillText(item.label, padding, metaTop + monoFontSize + titleFontSize + 12);

  // Right side metadata summary
  ctx.textAlign = 'right';
  ctx.font = `500 ${monoFontSize}px "JetBrains Mono", monospace`;
  ctx.fillStyle = '#52525B';
  ctx.fillText(
    `${item.category} · QTY: ${item.quantity} · ${item.width}×${item.height}px`,
    canvas.width - padding,
    metaTop + monoFontSize
  );

  ctx.font = `400 ${Math.round(monoFontSize * 0.88)}px "Plus Jakarta Sans", sans-serif`;
  ctx.fillStyle = '#71717A';
  ctx.fillText(
    `tuskusvault Local Archive · Status: ${item.status}`,
    canvas.width - padding,
    metaTop + monoFontSize + titleFontSize + 10
  );

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Failed to encode PNG blob'));
    }, 'image/png', 0.98);
  });
}
