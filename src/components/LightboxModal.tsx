import React, { useState, useEffect } from 'react';
import {
  X,
  Share2,
  Download,
  Copy,
  Check,
  Edit3,
  Trash2,
  ChevronLeft,
  ChevronRight,
  FileImage,
} from 'lucide-react';
import { GalleryItem } from '../types/gallery';
import {
  formatBytes,
  formatCurrency,
  formatDateShort,
  generateAnnotatedShareSheetBlob,
} from '../utils/mediaHelpers';

interface LightboxModalProps {
  item: GalleryItem | null;
  onClose: () => void;
  onEdit: (item: GalleryItem) => void;
  onDelete: (id: string) => void;
  onPrev?: () => void;
  onNext?: () => void;
  hasPrev?: boolean;
  hasNext?: boolean;
}

export const LightboxModal: React.FC<LightboxModalProps> = ({
  item,
  onClose,
  onEdit,
  onDelete,
  onPrev,
  onNext,
  hasPrev,
  hasNext,
}) => {
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);
  const [isExportingCard, setIsExportingCard] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    setConfirmDelete(false);
    setFeedbackMessage(null);
  }, [item]);

  useEffect(() => {
    if (!item) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft' && onPrev && hasPrev) onPrev();
      if (e.key === 'ArrowRight' && onNext && hasNext) onNext();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [item, onClose, onPrev, onNext, hasPrev, hasNext]);

  if (!item) return null;

  const triggerToast = (msg: string) => {
    setFeedbackMessage(msg);
    setTimeout(() => {
      setFeedbackMessage((prev) => (prev === msg ? null : prev));
    }, 3200);
  };

  const handleDownloadOriginal = () => {
    const link = document.createElement('a');
    link.href = item.imageDataUrl;
    const ext = item.mimeType.split('/')[1] || 'jpg';
    link.download = `${item.productId}_${item.label.toLowerCase().replace(/[^a-z0-9]+/g, '_')}.${ext}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    triggerToast('Downloaded original high-resolution image');
  };

  const handleDownloadSpecSheet = async () => {
    setIsExportingCard(true);
    try {
      const blob = await generateAnnotatedShareSheetBlob(item);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${item.productId}_Inventory_SpecSheet.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      triggerToast('Exported high-res annotated Product ID spec sheet');
    } catch {
      triggerToast('Could not generate annotated spec sheet');
    } finally {
      setIsExportingCard(false);
    }
  };

  const handleNativeShare = async () => {
    setIsExportingCard(true);
    try {
      const blob = await generateAnnotatedShareSheetBlob(item);
      const file = new File([blob], `${item.productId}_SpecSheet.png`, { type: 'image/png' });

      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          title: `${item.productId} — ${item.label}`,
          text: `${item.label} (${item.productId}) · Category: ${item.category} · Status: ${item.status}`,
          files: [file],
        });
        triggerToast('Shared annotated product sheet');
        return;
      }

      if (navigator.clipboard && window.ClipboardItem) {
        await navigator.clipboard.write([
          new ClipboardItem({
            'image/png': blob,
          }),
        ]);
        triggerToast('Copied annotated Product ID spec sheet image to clipboard');
        return;
      }

      // Fallback: download the spec sheet directly
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${item.productId}_Inventory_SpecSheet.png`;
      link.click();
      URL.revokeObjectURL(url);
      triggerToast('Downloaded annotated share sheet');
    } catch (err: unknown) {
      if (err instanceof Error && err.name !== 'AbortError') {
        triggerToast('Copied product specification summary to clipboard');
        navigator.clipboard?.writeText(
          `${item.productId} | ${item.label} | Category: ${item.category} | Qty: ${item.quantity} | Value: ${formatCurrency(item.unitValue)}`
        );
      }
    } finally {
      setIsExportingCard(false);
    }
  };

  const handleCopyMetadata = async () => {
    const summary = `Product ID: ${item.productId}\nLabel: ${item.label}\nCategory: ${item.category}\nStatus: ${item.status}\nStock Qty: ${item.quantity} units\nUnit Value: ${formatCurrency(item.unitValue)}\nResolution: ${item.width}×${item.height}px\nNotes: ${item.notes || 'N/A'}`;
    try {
      await navigator.clipboard.writeText(summary);
      triggerToast('Copied Product ID & inventory metadata to clipboard');
    } catch {
      triggerToast('Failed to copy to clipboard');
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-[#050505]/95 text-zinc-100 flex flex-col lg:flex-row overflow-hidden"
      role="dialog"
      aria-modal="true"
      aria-label={`High resolution inspection for ${item.label}`}
    >
      {/* Left / Main High-Resolution Viewport */}
      <div className="relative flex-1 flex items-center justify-center p-6 lg:p-12 select-none overflow-hidden bg-[#050505]">
        {/* Top Left Kicker inside Viewer */}
        <div className="absolute top-5 left-6 z-10 flex items-center gap-2 text-xs font-mono text-zinc-400">
          <span className="text-white font-semibold">{item.productId}</span>
          <span aria-hidden="true">·</span>
          <span>{item.width} × {item.height} px</span>
          <span aria-hidden="true">·</span>
          <span>{formatBytes(item.fileSizeBytes)}</span>
        </div>

        {/* Previous / Next Navigation Arrows */}
        {hasPrev && onPrev && (
          <button
            type="button"
            onClick={onPrev}
            className="absolute left-4 z-10 p-3 rounded-full bg-zinc-900/80 text-zinc-200 hover:bg-zinc-800 hover:text-white border border-zinc-800 transition-colors"
            aria-label="Previous item"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
        )}

        <img
          src={item.imageDataUrl}
          alt={item.label}
          referrerPolicy="no-referrer"
          className="max-h-[82vh] max-w-full object-contain rounded-lg shadow-2xl"
        />

        {hasNext && onNext && (
          <button
            type="button"
            onClick={onNext}
            className="absolute right-4 z-10 p-3 rounded-full bg-zinc-900/80 text-zinc-200 hover:bg-zinc-800 hover:text-white border border-zinc-800 transition-colors"
            aria-label="Next item"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Right / Specification & Sharing Drawer */}
      <div className="w-full lg:w-[420px] bg-zinc-950 border-t lg:border-t-0 lg:border-l border-zinc-800 flex flex-col justify-between overflow-y-auto">
        <div className="p-6 space-y-6">
          {/* Top Action Bar */}
          <div className="flex items-center justify-between pb-4 border-b border-zinc-800">
            <div className="text-xs font-mono text-zinc-400">
              <span>{item.category}</span>
              <span className="mx-1.5" aria-hidden="true">·</span>
              <span
                className={
                  item.status === 'In Stock'
                    ? 'text-emerald-400'
                    : item.status === 'Low Stock'
                    ? 'text-amber-400'
                    : 'text-zinc-400'
                }
              >
                {item.status}
              </span>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-900 transition-colors"
              aria-label="Close lightbox"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Primary Product Identifier & Title */}
          <div>
            <div className="text-xs font-mono uppercase tracking-wider text-blue-400 mb-1">
              Product ID: {item.productId}
            </div>
            <h2 className="text-2xl font-bold tracking-tight text-white font-display">
              {item.label}
            </h2>
          </div>

          {/* Tabular Inventory Metrics */}
          <div className="grid grid-cols-2 gap-4 py-4 border-y border-zinc-800/80 font-mono tabular-nums">
            <div>
              <div className="text-xs text-zinc-500 font-sans">On-Hand Stock</div>
              <div className="text-lg font-semibold text-white mt-0.5">
                {item.quantity} units
              </div>
            </div>
            <div>
              <div className="text-xs text-zinc-500 font-sans">Unit Valuation</div>
              <div className="text-lg font-semibold text-white mt-0.5">
                {formatCurrency(item.unitValue)}
              </div>
            </div>
            <div>
              <div className="text-xs text-zinc-500 font-sans">Total Line Value</div>
              <div className="text-sm font-medium text-zinc-300 mt-0.5">
                {formatCurrency(item.quantity * item.unitValue)}
              </div>
            </div>
            <div>
              <div className="text-xs text-zinc-500 font-sans">Cataloged Date</div>
              <div className="text-sm font-medium text-zinc-300 mt-0.5">
                {formatDateShort(item.createdAt)}
              </div>
            </div>
          </div>

          {/* Notes */}
          <div>
            <h3 className="text-xs font-semibold text-zinc-400 mb-2">
              Inspection & Material Notes
            </h3>
            <p className="text-sm text-zinc-300 leading-relaxed">
              {item.notes || 'No additional inspection notes recorded for this inventory item.'}
            </p>
          </div>

          {/* Seamless Share & Export Suite */}
          <div className="space-y-2.5 pt-2">
            <h3 className="text-xs font-semibold text-zinc-400 mb-2">
              Share & High-Resolution Export
            </h3>

            {feedbackMessage && (
              <div className="p-3 rounded-lg bg-blue-950/90 border border-blue-700 text-xs text-blue-200 flex items-center gap-2">
                <Check className="w-4 h-4 shrink-0 text-blue-400" />
                <span>{feedbackMessage}</span>
              </div>
            )}

            <button
              type="button"
              onClick={handleNativeShare}
              disabled={isExportingCard}
              className="w-full py-2.5 px-4 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold transition-colors flex items-center justify-center gap-2 whitespace-nowrap"
            >
              <Share2 className="w-4 h-4" />
              {isExportingCard ? 'Rendering Annotated Sheet...' : 'Share Annotated Product Sheet'}
            </button>

            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={handleDownloadSpecSheet}
                disabled={isExportingCard}
                className="py-2 px-3 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-200 text-xs font-medium transition-colors flex items-center justify-center gap-1.5 whitespace-nowrap"
              >
                <FileImage className="w-3.5 h-3.5" />
                Save Spec PNG
              </button>

              <button
                type="button"
                onClick={handleDownloadOriginal}
                className="py-2 px-3 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-200 text-xs font-medium transition-colors flex items-center justify-center gap-1.5 whitespace-nowrap"
              >
                <Download className="w-3.5 h-3.5" />
                Raw Photo
              </button>
            </div>

            <button
              type="button"
              onClick={handleCopyMetadata}
              className="w-full py-2 px-3 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 text-xs font-medium transition-colors flex items-center justify-center gap-1.5 whitespace-nowrap"
            >
              <Copy className="w-3.5 h-3.5" />
              Copy SKU & Metadata Summary
            </button>
          </div>
        </div>

        {/* Footer Record Actions */}
        <div className="p-6 border-t border-zinc-800 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => {
              onClose();
              onEdit(item);
            }}
            className="flex-1 py-2 px-4 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-200 text-xs font-medium transition-colors flex items-center justify-center gap-1.5 whitespace-nowrap"
          >
            <Edit3 className="w-3.5 h-3.5" />
            Edit SKU / Photo
          </button>

          {confirmDelete ? (
            <button
              type="button"
              onClick={() => {
                onDelete(item.id);
                onClose();
              }}
              className="py-2 px-4 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-semibold transition-colors whitespace-nowrap"
            >
              Confirm Delete
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="py-2 px-3 rounded-lg bg-zinc-900 hover:bg-red-950/60 border border-zinc-800 hover:border-red-800 text-zinc-400 hover:text-red-300 text-xs font-medium transition-colors flex items-center gap-1.5 whitespace-nowrap"
              aria-label="Delete item"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Delete
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
