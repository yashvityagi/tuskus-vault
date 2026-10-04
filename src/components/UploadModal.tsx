import React, { useState, useRef, useEffect } from 'react';
import { X, Upload, Image as ImageIcon, Check } from 'lucide-react';
import { GalleryItem, InventoryStatus } from '../types/gallery';
import { readFileAsHighResPhoto, formatBytes } from '../utils/mediaHelpers';

interface UploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (item: GalleryItem) => Promise<void>;
  categories: string[];
  initialItem?: GalleryItem | null;
}

const STATUS_OPTIONS: InventoryStatus[] = ['In Stock', 'Low Stock', 'Sample', 'Archived'];

export const UploadModal: React.FC<UploadModalProps> = ({
  isOpen,
  onClose,
  onSave,
  categories,
  initialItem,
}) => {
  const [productId, setProductId] = useState('');
  const [label, setLabel] = useState('');
  const [category, setCategory] = useState(categories[0] || 'Horology');
  const [customCategory, setCustomCategory] = useState('');
  const [isAddingCustomCategory, setIsAddingCustomCategory] = useState(false);
  const [quantity, setQuantity] = useState('1');
  const [unitValue, setUnitValue] = useState('450');
  const [status, setStatus] = useState<InventoryStatus>('In Stock');
  const [notes, setNotes] = useState('');
  const [featured, setFeatured] = useState(false);

  const [imageDataUrl, setImageDataUrl] = useState('');
  const [width, setWidth] = useState(0);
  const [height, setHeight] = useState(0);
  const [fileSizeBytes, setFileSizeBytes] = useState(0);
  const [mimeType, setMimeType] = useState('image/jpeg');

  const [isDragging, setIsDragging] = useState(false);
  const [isProcessingFile, setIsProcessingFile] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    setErrorMsg('');
    if (initialItem) {
      setProductId(initialItem.productId);
      setLabel(initialItem.label);
      setCategory(initialItem.category);
      setIsAddingCustomCategory(false);
      setCustomCategory('');
      setQuantity(String(initialItem.quantity));
      setUnitValue(String(initialItem.unitValue));
      setStatus(initialItem.status);
      setNotes(initialItem.notes);
      setFeatured(Boolean(initialItem.featured));
      setImageDataUrl(initialItem.imageDataUrl);
      setWidth(initialItem.width);
      setHeight(initialItem.height);
      setFileSizeBytes(initialItem.fileSizeBytes);
      setMimeType(initialItem.mimeType);
    } else {
      const randomDigits = Math.floor(1000 + Math.random() * 9000);
      setProductId(`TV-${randomDigits}`);
      setLabel('');
      setCategory(categories[0] || 'General');
      setIsAddingCustomCategory(false);
      setCustomCategory('');
      setQuantity('1');
      setUnitValue('0');
      setStatus('In Stock');
      setNotes('');
      setFeatured(false);
      setImageDataUrl('');
      setWidth(0);
      setHeight(0);
      setFileSizeBytes(0);
      setMimeType('image/jpeg');
    }
  }, [isOpen, initialItem, categories]);

  if (!isOpen) return null;

  const handleFileSelect = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      setErrorMsg('Please select a valid high-resolution image file (JPEG, PNG, WebP, AVIF).');
      return;
    }
    setErrorMsg('');
    setIsProcessingFile(true);
    try {
      const result = await readFileAsHighResPhoto(file);
      setImageDataUrl(result.dataUrl);
      setWidth(result.width);
      setHeight(result.height);
      setFileSizeBytes(result.fileSizeBytes);
      setMimeType(result.mimeType);

      if (!label.trim()) {
        const cleanName = file.name
          .replace(/\.[^/.]+$/, '')
          .replace(/[-_]+/g, ' ')
          .replace(/\b\w/g, (l) => l.toUpperCase());
        setLabel(cleanName);
      }
    } catch {
      setErrorMsg('Could not process the selected photograph.');
    } finally {
      setIsProcessingFile(false);
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      await handleFileSelect(file);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!imageDataUrl) {
      setErrorMsg('Please upload a product photograph before saving.');
      return;
    }
    if (!productId.trim()) {
      setErrorMsg('Please assign a unique Product ID / SKU code.');
      return;
    }
    if (!label.trim()) {
      setErrorMsg('Please provide a descriptive Product Label.');
      return;
    }

    const finalCategory = isAddingCustomCategory
      ? customCategory.trim() || 'Uncategorized'
      : category;

    setIsSaving(true);
    try {
      const now = Date.now();
      const item: GalleryItem = {
        id: initialItem ? initialItem.id : `item-${now}-${Math.random().toString(36).slice(2, 7)}`,
        productId: productId.trim().toUpperCase(),
        label: label.trim(),
        category: finalCategory,
        quantity: Math.max(0, parseInt(quantity, 10) || 0),
        unitValue: Math.max(0, parseFloat(unitValue) || 0),
        status,
        notes: notes.trim(),
        imageDataUrl,
        width: width || 1600,
        height: height || 1200,
        fileSizeBytes: fileSizeBytes || 350000,
        mimeType,
        createdAt: initialItem ? initialItem.createdAt : now,
        updatedAt: now,
        featured,
      };
      await onSave(item);
      onClose();
    } catch {
      setErrorMsg('Failed to store item in local IndexedDB. Check storage quota.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/70 backdrop-blur-xs p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-upload-title"
    >
      <div className="bg-[#F4F4F0] border border-zinc-300 rounded-2xl w-full max-w-3xl overflow-hidden shadow-xl my-8">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-200 bg-white">
          <div>
            <h2 id="modal-upload-title" className="text-lg font-bold tracking-tight text-zinc-900">
              {initialItem ? 'Edit Inventory Record & Asset' : 'Register High-Resolution Asset'}
            </h2>
            <p className="text-xs text-zinc-500 mt-0.5">
              Stored directly in browser IndexedDB for zero-cloud privacy and permanent offline durability
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-zinc-500 hover:text-zinc-900 rounded-lg hover:bg-zinc-100 transition-colors"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {errorMsg && (
            <div className="p-3.5 rounded-lg bg-red-50 border border-red-200 text-xs font-medium text-red-700">
              {errorMsg}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
            {/* Left column: Photo dropzone */}
            <div className="md:col-span-5 flex flex-col">
              <label className="block text-xs font-semibold text-zinc-700 mb-2">
                High-Resolution Photograph *
              </label>
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`relative flex-1 min-h-[240px] rounded-xl border-2 border-dashed transition-colors cursor-pointer flex flex-col items-center justify-center overflow-hidden bg-white ${
                  isDragging
                    ? 'border-blue-600 bg-blue-50/40'
                    : 'border-zinc-300 hover:border-zinc-400'
                }`}
              >
                {imageDataUrl ? (
                  <div className="relative w-full h-full flex flex-col">
                    <img
                      src={imageDataUrl}
                      alt={label || 'Uploaded preview'}
                      referrerPolicy="no-referrer"
                      className="w-full h-56 object-cover"
                    />
                    <div className="p-2.5 bg-zinc-900 text-zinc-200 text-xs font-mono flex items-center justify-between">
                      <span>{width} × {height} px</span>
                      <span>·</span>
                      <span>{formatBytes(fileSizeBytes)}</span>
                    </div>
                  </div>
                ) : (
                  <div className="p-6 text-center">
                    <div className="w-10 h-10 rounded-lg bg-zinc-100 text-zinc-700 flex items-center justify-center mx-auto mb-3">
                      {isProcessingFile ? (
                        <span className="w-4 h-4 border-2 border-zinc-700 border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <Upload className="w-5 h-5" />
                      )}
                    </div>
                    <p className="text-xs font-semibold text-zinc-800">
                      Drop high-res photo here or click to browse
                    </p>
                    <p className="text-xs text-zinc-500 mt-1">
                      Uncompressed local storage in IndexedDB
                    </p>
                  </div>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleFileSelect(file);
                  }}
                />
              </div>

              {imageDataUrl && (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="mt-2 text-xs font-medium text-blue-600 hover:text-blue-800 flex items-center justify-center gap-1.5 py-1"
                >
                  <ImageIcon className="w-3.5 h-3.5" />
                  Replace Photograph
                </button>
              )}
            </div>

            {/* Right column: Product ID, Label & Inventory Metadata */}
            <div className="md:col-span-7 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="product-id-input" className="block text-xs font-semibold text-zinc-700 mb-1.5">
                    Product ID / SKU *
                  </label>
                  <input
                    id="product-id-input"
                    type="text"
                    required
                    value={productId}
                    onChange={(e) => setProductId(e.target.value)}
                    placeholder="e.g. SKU-4092-TI"
                    className="w-full px-3.5 py-2 text-sm font-mono bg-white border border-zinc-300 rounded-lg text-zinc-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>

                <div>
                  <label htmlFor="status-select" className="block text-xs font-semibold text-zinc-700 mb-1.5">
                    Inventory Status
                  </label>
                  <select
                    id="status-select"
                    value={status}
                    onChange={(e) => setStatus(e.target.value as InventoryStatus)}
                    className="w-full px-3.5 py-2 text-sm bg-white border border-zinc-300 rounded-lg text-zinc-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
                  >
                    {STATUS_OPTIONS.map((st) => (
                      <option key={st} value={st}>
                        {st}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label htmlFor="product-label-input" className="block text-xs font-semibold text-zinc-700 mb-1.5">
                  Product Label / Title *
                </label>
                <input
                  id="product-label-input"
                  type="text"
                  required
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder="e.g. Calibre 09 Brushed Titanium Chronograph"
                  className="w-full px-3.5 py-2 text-sm bg-white border border-zinc-300 rounded-lg text-zinc-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>

              {/* Category selector or custom category input */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label htmlFor="category-select" className="block text-xs font-semibold text-zinc-700">
                    Category Classification *
                  </label>
                  <button
                    type="button"
                    onClick={() => setIsAddingCustomCategory(!isAddingCustomCategory)}
                    className="text-xs font-medium text-blue-600 hover:underline"
                  >
                    {isAddingCustomCategory ? 'Choose existing category' : '+ New category'}
                  </button>
                </div>

                {isAddingCustomCategory ? (
                  <input
                    type="text"
                    required
                    value={customCategory}
                    onChange={(e) => setCustomCategory(e.target.value)}
                    placeholder="Enter new category name (e.g. Glassware)"
                    className="w-full px-3.5 py-2 text-sm bg-white border border-zinc-300 rounded-lg text-zinc-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                ) : (
                  <select
                    id="category-select"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full px-3.5 py-2 text-sm bg-white border border-zinc-300 rounded-lg text-zinc-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
                  >
                    {categories.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="qty-input" className="block text-xs font-semibold text-zinc-700 mb-1.5">
                    Stock Quantity (Units)
                  </label>
                  <input
                    id="qty-input"
                    type="number"
                    min="0"
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    className="w-full px-3.5 py-2 text-sm font-mono bg-white border border-zinc-300 rounded-lg text-zinc-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
                <div>
                  <label htmlFor="val-input" className="block text-xs font-semibold text-zinc-700 mb-1.5">
                    Unit Valuation (USD)
                  </label>
                  <input
                    id="val-input"
                    type="number"
                    min="0"
                    step="1"
                    value={unitValue}
                    onChange={(e) => setUnitValue(e.target.value)}
                    className="w-full px-3.5 py-2 text-sm font-mono bg-white border border-zinc-300 rounded-lg text-zinc-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="notes-input" className="block text-xs font-semibold text-zinc-700 mb-1.5">
                  Technical Specifications & Inspection Notes
                </label>
                <textarea
                  id="notes-input"
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Materials, serial batch details, lighting setup, or storage location..."
                  className="w-full px-3.5 py-2 text-sm bg-white border border-zinc-300 rounded-lg text-zinc-900 focus:outline-none focus:ring-2 focus:ring-blue-600 resize-none"
                />
              </div>

              <label className="flex items-center gap-2.5 cursor-pointer select-none pt-1">
                <input
                  type="checkbox"
                  checked={featured}
                  onChange={(e) => setFeatured(e.target.checked)}
                  className="w-4 h-4 rounded text-blue-600 focus:ring-blue-600 border-zinc-300"
                />
                <span className="text-xs font-medium text-zinc-700">
                  Feature as wide showcase tile (2×2 Bento span) in gallery grid
                </span>
              </label>
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-zinc-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-zinc-700 bg-white border border-zinc-300 rounded-lg hover:bg-zinc-100 transition-colors whitespace-nowrap"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving || isProcessingFile}
              className="px-5 py-2 text-xs font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-1.5 whitespace-nowrap disabled:opacity-50"
            >
              <Check className="w-4 h-4" />
              {isSaving ? 'Persisting to IndexedDB...' : initialItem ? 'Save Changes' : 'Save to Local Archive'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
