import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Search,
  Plus,
  Share2,
  Edit3,
  LayoutGrid,
  Table as TableIcon,
  Download,
  Upload as UploadIcon,
  Trash2,
  Check,
  ArrowUpDown,
  FolderPlus,
  Image as ImageIcon,
  X,
} from 'lucide-react';
import { GalleryItem } from './types/gallery';
import {
  initializeAndLoadGallery,
  saveGalleryItem,
  deleteGalleryItem,
  addCategoryToDb,
  clearAllGalleryData,
  importGalleryItems,
} from './services/indexedDbService';
import {
  formatBytes,
  formatCurrency,
  formatDateShort,
  generateAnnotatedShareSheetBlob,
} from './utils/mediaHelpers';
import { UploadModal } from './components/UploadModal';
import { LightboxModal } from './components/LightboxModal';

type ViewMode = 'bento' | 'ledger';
type SortField = 'createdAt' | 'productId' | 'label' | 'unitValue' | 'quantity';

export default function App() {
  const [items, setItems] = useState<GalleryItem[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Filter & Search states
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('All');
  const [sortBy, setSortBy] = useState<SortField>('createdAt');
  const [sortAsc, setSortAsc] = useState<boolean>(false);
  const [viewMode, setViewMode] = useState<ViewMode>('bento');

  // Modals & Interactive States
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<GalleryItem | null>(null);
  const [lightboxItem, setLightboxItem] = useState<GalleryItem | null>(null);

  // Inline quick Product ID / Label edit in Ledger or Card
  const [inlineEditId, setInlineEditId] = useState<string | null>(null);
  const [inlineProductId, setInlineProductId] = useState<string>('');
  const [inlineLabel, setInlineLabel] = useState<string>('');

  // New Category Modal / Popover
  const [isAddingCategory, setIsAddingCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');

  // Confirm Clear Vault state
  const [confirmClearAll, setConfirmClearAll] = useState(false);

  // Toast notification
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const backupInputRef = useRef<HTMLInputElement>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((prev) => (prev === msg ? null : prev));
    }, 3200);
  };

  useEffect(() => {
    let mounted = true;
    initializeAndLoadGallery()
      .then(({ items: loadedItems, categories: loadedCats }) => {
        if (!mounted) return;
        setItems(loadedItems);
        setCategories(loadedCats);
      })
      .catch((err) => {
        console.error('IndexedDB initialization error:', err);
      })
      .finally(() => {
        if (mounted) setIsLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  // Filtered and sorted items
  const filteredItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return items
      .filter((item) => {
        const matchesCat =
          selectedCategory === 'All' ||
          item.category.toLowerCase() === selectedCategory.toLowerCase();
        const matchesStatus =
          statusFilter === 'All' || item.status === statusFilter;
        const matchesQuery =
          !q ||
          item.productId.toLowerCase().includes(q) ||
          item.label.toLowerCase().includes(q) ||
          item.category.toLowerCase().includes(q) ||
          item.notes.toLowerCase().includes(q);
        return matchesCat && matchesStatus && matchesQuery;
      })
      .sort((a, b) => {
        let comparison = 0;
        if (sortBy === 'createdAt') comparison = a.createdAt - b.createdAt;
        else if (sortBy === 'productId') comparison = a.productId.localeCompare(b.productId);
        else if (sortBy === 'label') comparison = a.label.localeCompare(b.label);
        else if (sortBy === 'unitValue') comparison = a.unitValue - b.unitValue;
        else if (sortBy === 'quantity') comparison = a.quantity - b.quantity;
        return sortAsc ? comparison : -comparison;
      });
  }, [items, selectedCategory, statusFilter, searchQuery, sortBy, sortAsc]);

  // Aggregate Inventory Metrics
  const stats = useMemo(() => {
    const totalAssets = items.length;
    const totalUnits = items.reduce((acc, i) => acc + i.quantity, 0);
    const totalValuation = items.reduce((acc, i) => acc + i.quantity * i.unitValue, 0);
    const totalBytes = items.reduce((acc, i) => acc + (i.fileSizeBytes || 0), 0);
    return { totalAssets, totalUnits, totalValuation, totalBytes };
  }, [items]);

  // Category Counts
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { All: items.length };
    for (const cat of categories) {
      counts[cat] = 0;
    }
    for (const item of items) {
      counts[item.category] = (counts[item.category] || 0) + 1;
    }
    return counts;
  }, [items, categories]);

  const handleSaveItem = async (newItem: GalleryItem) => {
    await saveGalleryItem(newItem);
    setItems((prev) => {
      const exists = prev.some((i) => i.id === newItem.id);
      if (exists) {
        return prev.map((i) => (i.id === newItem.id ? newItem : i));
      }
      return [newItem, ...prev];
    });
    if (!categories.includes(newItem.category)) {
      setCategories((prev) => [...prev, newItem.category]);
    }
    showToast(`Saved ${newItem.productId} (${newItem.label}) to tuskusvault`);
  };

  const handleDeleteItem = async (id: string) => {
    const target = items.find((i) => i.id === id);
    await deleteGalleryItem(id);
    setItems((prev) => prev.filter((i) => i.id !== id));
    if (target) {
      showToast(`Removed ${target.productId} from tuskusvault`);
    }
  };

  const handleQuickShareCard = async (e: React.MouseEvent, item: GalleryItem) => {
    e.stopPropagation();
    try {
      const blob = await generateAnnotatedShareSheetBlob(item);
      const file = new File([blob], `${item.productId}_SpecSheet.png`, { type: 'image/png' });

      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          title: `${item.productId} — ${item.label}`,
          text: `${item.label} (${item.productId}) · Category: ${item.category}`,
          files: [file],
        });
        showToast(`Shared ${item.productId} spec sheet`);
        return;
      }

      if (navigator.clipboard && window.ClipboardItem) {
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
        showToast(`Copied ${item.productId} annotated spec sheet to clipboard`);
        return;
      }

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${item.productId}_SpecSheet.png`;
      a.click();
      URL.revokeObjectURL(url);
      showToast(`Downloaded ${item.productId} annotated spec sheet`);
    } catch {
      navigator.clipboard?.writeText(`${item.productId} — ${item.label} (${item.category})`);
      showToast(`Copied ${item.productId} summary to clipboard`);
    }
  };

  const startInlineEdit = (e: React.MouseEvent, item: GalleryItem) => {
    e.stopPropagation();
    setInlineEditId(item.id);
    setInlineProductId(item.productId);
    setInlineLabel(item.label);
  };

  const saveInlineEdit = async (e: React.FormEvent, item: GalleryItem) => {
    e.preventDefault();
    e.stopPropagation();
    if (!inlineProductId.trim() || !inlineLabel.trim()) return;
    const updated: GalleryItem = {
      ...item,
      productId: inlineProductId.trim().toUpperCase(),
      label: inlineLabel.trim(),
      updatedAt: Date.now(),
    };
    await handleSaveItem(updated);
    setInlineEditId(null);
  };

  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = newCategoryName.trim();
    if (!cleaned) return;
    await addCategoryToDb(cleaned);
    if (!categories.includes(cleaned)) {
      setCategories((prev) => [...prev, cleaned]);
    }
    setSelectedCategory(cleaned);
    setNewCategoryName('');
    setIsAddingCategory(false);
    showToast(`Created category "${cleaned}"`);
  };

  const handleExportArchiveJson = () => {
    const payload = {
      exportedAt: new Date().toISOString(),
      app: 'tuskusvault',
      itemCount: items.length,
      items,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `tuskusvault_archive_${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
    showToast(`Exported ${items.length} records to local JSON bundle`);
  };

  const handleImportArchiveJson = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const importedList: GalleryItem[] = Array.isArray(parsed)
        ? parsed
        : Array.isArray(parsed.items)
        ? parsed.items
        : [];
      if (importedList.length === 0) {
        showToast('No valid inventory records found in JSON file');
        return;
      }
      await importGalleryItems(importedList);
      const { items: refreshedItems, categories: refreshedCats } =
        await initializeAndLoadGallery();
      setItems(refreshedItems);
      setCategories(refreshedCats);
      showToast(`Imported ${importedList.length} records into tuskusvault`);
    } catch {
      showToast('Failed to parse archive JSON file');
    } finally {
      if (backupInputRef.current) backupInputRef.current.value = '';
    }
  };

  const handleClearVault = async () => {
    setIsLoading(true);
    try {
      const { items: clearedItems, categories: defaultCats } = await clearAllGalleryData();
      setItems(clearedItems);
      setCategories(defaultCats);
      setSelectedCategory('All');
      setSearchQuery('');
      setConfirmClearAll(false);
      showToast('Cleared all records from tuskusvault IndexedDB');
    } finally {
      setIsLoading(false);
    }
  };

  // Lightbox navigation index
  const currentLightboxIndex = useMemo(() => {
    if (!lightboxItem) return -1;
    return filteredItems.findIndex((i) => i.id === lightboxItem.id);
  }, [lightboxItem, filteredItems]);

  return (
    <div className="min-h-screen flex flex-col bg-[#F4F4F0] text-zinc-900">
      {/* Strict 3-Zone Top Bar Contract */}
      <header className="sticky top-0 z-30 flex items-center justify-between px-6 lg:px-10 py-4 bg-[#F4F4F0]/95 backdrop-blur-xs border-b border-zinc-200">
        {/* Zone 1: Single text element wordmark */}
        <a
          href="#top"
          onClick={(e) => {
            e.preventDefault();
            setSelectedCategory('All');
            setSearchQuery('');
          }}
          className="text-xl font-extrabold tracking-tight text-zinc-950 font-display whitespace-nowrap"
        >
          tuskusvault
        </a>

        {/* Zone 2: 4 Clean Text Navigation Links */}
        <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-zinc-600">
          <button
            type="button"
            onClick={() => setViewMode('bento')}
            className={`hover:text-zinc-950 transition-colors whitespace-nowrap cursor-pointer ${
              viewMode === 'bento'
                ? 'text-zinc-950 underline underline-offset-8 decoration-2 decoration-blue-600'
                : ''
            }`}
          >
            Visual Gallery
          </button>
          <button
            type="button"
            onClick={() => setViewMode('ledger')}
            className={`hover:text-zinc-950 transition-colors whitespace-nowrap cursor-pointer ${
              viewMode === 'ledger'
                ? 'text-zinc-950 underline underline-offset-8 decoration-2 decoration-blue-600'
                : ''
            }`}
          >
            Inventory Ledger
          </button>
          <button
            type="button"
            onClick={handleExportArchiveJson}
            className="hover:text-zinc-950 transition-colors whitespace-nowrap cursor-pointer"
          >
            Export Archive
          </button>
          <button
            type="button"
            onClick={() => backupInputRef.current?.click()}
            className="hover:text-zinc-950 transition-colors whitespace-nowrap cursor-pointer"
          >
            Import Bundle
          </button>
        </nav>

        {/* Zone 3: Primary Action */}
        <div className="flex items-center gap-3">
          <input
            ref={backupInputRef}
            type="file"
            accept="application/json"
            className="hidden"
            onChange={handleImportArchiveJson}
          />
          <button
            type="button"
            onClick={() => {
              setEditingItem(null);
              setIsUploadOpen(true);
            }}
            className="px-4 py-2 text-xs font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer shadow-xs"
          >
            <Plus className="w-4 h-4" />
            Upload Photo &amp; SKU
          </button>
        </div>
      </header>

      {/* Toast Notification Banner */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-40 flex items-center gap-2.5 px-4 py-3 rounded-xl bg-zinc-900 text-white text-xs font-medium shadow-lg border border-zinc-700">
          <Check className="w-4 h-4 text-blue-400 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Main Content Container */}
      <main className="flex-1 max-w-[1440px] w-full mx-auto px-6 lg:px-10 py-8 space-y-8">
        {/* Editorial Split Header & Local Durability Summary */}
        <section className="flex flex-col lg:flex-row lg:items-end justify-between gap-6 pb-8 border-b border-zinc-200">
          <div className="max-w-2xl">
            <div className="text-xs font-mono text-zinc-500 mb-2">
              TUSKUSVAULT LOCAL INDEXEDDB · ZERO CLOUD DEPENDENCY · OFFLINE DURABLE
            </div>
            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-zinc-950 font-display text-balance">
              High-Resolution Photography &amp; Product SKU Archive
            </h1>
            <p className="text-sm sm:text-base text-zinc-600 mt-2.5 leading-relaxed">
              Upload your high-resolution photos, assign custom Product IDs and labels, and filter across categories. Everything is saved directly to your browser’s local IndexedDB database.
            </p>
          </div>

          {/* Unboxed Tabular Summary Metrics */}
          <div className="flex flex-wrap items-center gap-x-8 gap-y-4 pt-2 lg:pt-0 font-mono tabular-nums">
            <div>
              <div className="text-xs font-sans text-zinc-500">Cataloged Assets</div>
              <div className="text-2xl font-bold text-zinc-950">{stats.totalAssets}</div>
            </div>
            <div className="h-8 w-px bg-zinc-300 hidden sm:block" />
            <div>
              <div className="text-xs font-sans text-zinc-500">Total Stock Units</div>
              <div className="text-2xl font-bold text-zinc-950">{stats.totalUnits}</div>
            </div>
            <div className="h-8 w-px bg-zinc-300 hidden sm:block" />
            <div>
              <div className="text-xs font-sans text-zinc-500">Archive Valuation</div>
              <div className="text-2xl font-bold text-zinc-950">
                {formatCurrency(stats.totalValuation)}
              </div>
            </div>
            <div className="h-8 w-px bg-zinc-300 hidden sm:block" />
            <div>
              <div className="text-xs font-sans text-zinc-500">Local IndexedDB Footprint</div>
              <div className="text-2xl font-bold text-blue-600">
                {formatBytes(stats.totalBytes)}
              </div>
            </div>
          </div>
        </section>

        {/* Intuitive Search Bar & Category Filter Controls */}
        <section className="space-y-4">
          <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4">
            {/* Search Input */}
            <div className="relative flex-1 max-w-2xl">
              <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search tuskusvault by Product ID, label, category, or notes..."
                aria-label="Search inventory by Product ID, label, or category"
                className="w-full pl-10 pr-9 py-2.5 text-sm bg-white border border-zinc-300 rounded-xl text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-600 transition-shadow"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-700"
                  aria-label="Clear search query"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Right Controls: Status Filter, Sort, View Switcher */}
            <div className="flex flex-wrap items-center gap-2.5">
              {/* Status Filter */}
              <select
                aria-label="Filter by stock status"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-3 py-2 text-xs font-medium bg-white border border-zinc-300 rounded-lg text-zinc-700 focus:outline-none focus:ring-2 focus:ring-blue-600"
              >
                <option value="All">All Statuses</option>
                <option value="In Stock">In Stock</option>
                <option value="Low Stock">Low Stock</option>
                <option value="Sample">Sample</option>
                <option value="Archived">Archived</option>
              </select>

              {/* Sort Field */}
              <div className="flex items-center bg-white border border-zinc-300 rounded-lg overflow-hidden">
                <select
                  aria-label="Sort inventory by field"
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as SortField)}
                  className="px-3 py-2 text-xs font-medium bg-transparent text-zinc-700 focus:outline-none"
                >
                  <option value="createdAt">Sort: Date Added</option>
                  <option value="productId">Sort: Product ID</option>
                  <option value="label">Sort: Label</option>
                  <option value="unitValue">Sort: Unit Value</option>
                  <option value="quantity">Sort: Stock Qty</option>
                </select>
                <button
                  type="button"
                  onClick={() => setSortAsc(!sortAsc)}
                  className="px-2.5 py-2 border-l border-zinc-200 text-zinc-600 hover:text-zinc-950 hover:bg-zinc-50 transition-colors"
                  title={sortAsc ? 'Ascending order' : 'Descending order'}
                  aria-label="Toggle sort direction"
                >
                  <ArrowUpDown className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Segmented View Toggle (Bento Grid vs Inventory Ledger) */}
              <div className="flex items-center gap-1 p-1 bg-zinc-200/80 rounded-lg">
                <button
                  type="button"
                  onClick={() => setViewMode('bento')}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                    viewMode === 'bento'
                      ? 'bg-white text-zinc-950 shadow-xs'
                      : 'text-zinc-600 hover:text-zinc-950'
                  }`}
                >
                  <LayoutGrid className="w-3.5 h-3.5" />
                  Gallery Grid
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('ledger')}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                    viewMode === 'ledger'
                      ? 'bg-white text-zinc-950 shadow-xs'
                      : 'text-zinc-600 hover:text-zinc-950'
                  }`}
                >
                  <TableIcon className="w-3.5 h-3.5" />
                  SKU Ledger
                </button>
              </div>
            </div>
          </div>

          {/* Interactive Category Filter Bar (Segmented Controls) */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <div className="flex flex-wrap items-center gap-1.5 p-1 bg-zinc-200/70 rounded-xl">
              <button
                type="button"
                onClick={() => setSelectedCategory('All')}
                className={`px-3.5 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
                  selectedCategory === 'All'
                    ? 'bg-white text-zinc-950 shadow-xs font-semibold'
                    : 'text-zinc-600 hover:text-zinc-950'
                }`}
              >
                All Categories ({categoryCounts.All || 0})
              </button>

              {categories.map((cat) => {
                const count = categoryCounts[cat] ?? 0;
                const isActive = selectedCategory.toLowerCase() === cat.toLowerCase();
                return (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setSelectedCategory(cat)}
                    className={`px-3.5 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap cursor-pointer tabular-nums ${
                      isActive
                        ? 'bg-white text-zinc-950 shadow-xs font-semibold'
                        : 'text-zinc-600 hover:text-zinc-950'
                    }`}
                  >
                    {cat} ({count})
                  </button>
                );
              })}

              {isAddingCategory ? (
                <form onSubmit={handleAddCategory} className="flex items-center gap-1 pl-1">
                  <input
                    type="text"
                    value={newCategoryName}
                    onChange={(e) => setNewCategoryName(e.target.value)}
                    placeholder="New category..."
                    autoFocus
                    className="px-2.5 py-1 text-xs bg-white border border-zinc-300 rounded-md text-zinc-900 focus:outline-none focus:ring-2 focus:ring-blue-600 w-32"
                  />
                  <button
                    type="submit"
                    className="px-2.5 py-1 text-xs font-semibold bg-blue-600 text-white rounded-md hover:bg-blue-700"
                  >
                    Add
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsAddingCategory(false)}
                    className="px-2 py-1 text-xs text-zinc-500 hover:text-zinc-800"
                  >
                    Cancel
                  </button>
                </form>
              ) : (
                <button
                  type="button"
                  onClick={() => setIsAddingCategory(true)}
                  className="px-3 py-1.5 text-xs font-medium text-blue-600 hover:text-blue-800 rounded-lg flex items-center gap-1 whitespace-nowrap cursor-pointer"
                >
                  <FolderPlus className="w-3.5 h-3.5" />
                  New Category
                </button>
              )}
            </div>

            {/* Active Filter Status & Quick Reset */}
            {(selectedCategory !== 'All' || statusFilter !== 'All' || searchQuery.trim() !== '') && (
              <div className="flex items-center gap-3 text-xs text-zinc-600">
                <span>
                  Showing <strong className="font-mono text-zinc-950">{filteredItems.length}</strong> of{' '}
                  <strong className="font-mono text-zinc-950">{items.length}</strong> records
                </span>
                <span>·</span>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedCategory('All');
                    setStatusFilter('All');
                    setSearchQuery('');
                  }}
                  className="font-medium text-blue-600 hover:underline cursor-pointer"
                >
                  Reset filters
                </button>
              </div>
            )}
          </div>
        </section>

        {/* Loading State */}
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[1, 2, 3].map((n) => (
              <div
                key={n}
                className="h-80 rounded-2xl bg-zinc-200/70 animate-pulse border border-zinc-200"
              />
            ))}
          </div>
        ) : filteredItems.length === 0 ? (
          /* Clean Empty State Ready for User Data */
          <div className="bg-white border border-zinc-200 rounded-2xl p-12 text-center max-w-xl mx-auto my-8">
            <div className="w-12 h-12 rounded-xl bg-zinc-100 text-zinc-700 flex items-center justify-center mx-auto mb-4">
              <ImageIcon className="w-6 h-6" />
            </div>
            <h2 className="text-lg font-bold text-zinc-900">
              {items.length === 0
                ? 'tuskusvault is Empty & Ready for Your Photos'
                : 'No Matching Product Photos Found'}
            </h2>
            <p className="text-sm text-zinc-600 mt-1.5 leading-relaxed">
              {items.length === 0
                ? 'All sample records have been cleared. Upload your first high-resolution photo and assign its Product ID / SKU and category to store it permanently in your browser’s local IndexedDB.'
                : `No items matched your filter (${selectedCategory !== 'All' ? `Category: ${selectedCategory}` : 'All Categories'}${searchQuery ? `, Search: "${searchQuery}"` : ''}).`}
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3 mt-6">
              {(selectedCategory !== 'All' || statusFilter !== 'All' || searchQuery) && (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedCategory('All');
                    setStatusFilter('All');
                    setSearchQuery('');
                  }}
                  className="px-4 py-2 text-xs font-semibold text-zinc-800 bg-zinc-100 hover:bg-zinc-200 rounded-lg transition-colors cursor-pointer"
                >
                  Clear All Filters
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  setEditingItem(null);
                  setIsUploadOpen(true);
                }}
                className="px-5 py-2.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs"
              >
                <Plus className="w-4 h-4" />
                Upload Your First Photo &amp; SKU
              </button>
              {items.length === 0 && (
                <button
                  type="button"
                  onClick={() => backupInputRef.current?.click()}
                  className="px-4 py-2.5 text-xs font-medium text-zinc-700 border border-zinc-300 hover:bg-zinc-50 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <UploadIcon className="w-3.5 h-3.5" />
                  Import JSON Backup
                </button>
              )}
            </div>
          </div>
        ) : viewMode === 'bento' ? (
          /* Media-First Bento & Editorial Grid */
          <section
            aria-label="Product Photography Gallery"
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 auto-rows-fr"
          >
            {filteredItems.map((item) => {
              const isEditingThis = inlineEditId === item.id;
              return (
                <article
                  key={item.id}
                  onClick={() => setLightboxItem(item)}
                  className={`group bg-white border border-zinc-200 rounded-2xl overflow-hidden flex flex-col justify-between transition-transform duration-150 hover:-translate-y-0.5 cursor-pointer ${
                    item.featured && selectedCategory === 'All' && !searchQuery
                      ? 'md:col-span-2'
                      : 'col-span-1'
                  }`}
                >
                  {/* Image Container */}
                  <div className="relative aspect-4/3 w-full bg-zinc-100 overflow-hidden">
                    <img
                      src={item.imageDataUrl}
                      alt={`${item.label} (${item.productId})`}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                    />
                    {/* Subtle bottom gradient scrim for quick actions on hover */}
                    <div className="absolute inset-x-0 bottom-0 p-4 bg-gradient-to-t from-black/80 via-black/35 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-150 flex items-end justify-between">
                      <span className="text-xs font-mono text-zinc-200">
                        {item.width} × {item.height} px · {formatBytes(item.fileSizeBytes)}
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={(e) => startInlineEdit(e, item)}
                          className="px-2.5 py-1.5 rounded-lg bg-white/95 hover:bg-white text-zinc-900 text-xs font-medium flex items-center gap-1 shadow-xs"
                          title="Quick edit Product ID & Label"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                          Edit ID
                        </button>
                        <button
                          type="button"
                          onClick={(e) => handleQuickShareCard(e, item)}
                          className="px-2.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium flex items-center gap-1 shadow-xs"
                          title="Share annotated Product ID spec sheet"
                        >
                          <Share2 className="w-3.5 h-3.5" />
                          Share
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Card Body: Clean Unboxed Metadata with Typographic Separators */}
                  <div className="p-5 flex-1 flex flex-col justify-between space-y-3">
                    {isEditingThis ? (
                      <form
                        onSubmit={(e) => saveInlineEdit(e, item)}
                        onClick={(e) => e.stopPropagation()}
                        className="space-y-2.5"
                      >
                        <div>
                          <label className="block text-[11px] font-mono text-zinc-500">
                            PRODUCT ID / SKU
                          </label>
                          <input
                            type="text"
                            value={inlineProductId}
                            onChange={(e) => setInlineProductId(e.target.value)}
                            className="w-full px-2.5 py-1 text-xs font-mono border border-zinc-300 rounded-md text-zinc-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
                            autoFocus
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-mono text-zinc-500">
                            PRODUCT LABEL
                          </label>
                          <input
                            type="text"
                            value={inlineLabel}
                            onChange={(e) => setInlineLabel(e.target.value)}
                            className="w-full px-2.5 py-1 text-xs border border-zinc-300 rounded-md text-zinc-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
                          />
                        </div>
                        <div className="flex items-center gap-2 pt-1">
                          <button
                            type="submit"
                            className="px-3 py-1 text-xs font-semibold bg-blue-600 text-white rounded-md hover:bg-blue-700"
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setInlineEditId(null);
                            }}
                            className="px-2.5 py-1 text-xs text-zinc-600 hover:text-zinc-900"
                          >
                            Cancel
                          </button>
                        </div>
                      </form>
                    ) : (
                      <div>
                        {/* Quiet 1-line unboxed text kicker with typographic separators */}
                        <div className="flex items-center gap-2 text-xs font-mono text-zinc-500">
                          <span className="font-semibold text-blue-600">{item.productId}</span>
                          <span aria-hidden="true">·</span>
                          <span>{item.category}</span>
                          <span aria-hidden="true">·</span>
                          <span
                            className={
                              item.status === 'In Stock'
                                ? 'text-emerald-700'
                                : item.status === 'Low Stock'
                                ? 'text-amber-700'
                                : 'text-zinc-500'
                            }
                          >
                            {item.status}
                          </span>
                        </div>

                        {/* Primary Product Label */}
                        <h3 className="text-base font-bold text-zinc-900 mt-1.5 group-hover:text-blue-600 transition-colors line-clamp-1">
                          {item.label}
                        </h3>

                        {item.notes && (
                          <p className="text-xs text-zinc-600 mt-1 line-clamp-2 leading-relaxed">
                            {item.notes}
                          </p>
                        )}
                      </div>
                    )}

                    {/* Bottom Tabular Inventory Bar */}
                    <div className="pt-3 border-t border-zinc-100 flex items-center justify-between text-xs text-zinc-500 font-mono tabular-nums">
                      <div>
                        <span>QTY: {item.quantity}</span>
                        <span className="mx-1.5" aria-hidden="true">·</span>
                        <span className="text-zinc-900 font-semibold">
                          {formatCurrency(item.unitValue)}
                        </span>
                      </div>
                      <span>{formatDateShort(item.createdAt)}</span>
                    </div>
                  </div>
                </article>
              );
            })}
          </section>
        ) : (
          /* High-Density SKU Inventory Ledger View */
          <section
            aria-label="Product SKU Inventory Ledger"
            className="bg-white border border-zinc-200 rounded-2xl overflow-hidden"
          >
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-zinc-200 bg-zinc-50/80 text-xs font-semibold text-zinc-600">
                    <th className="py-3.5 pl-6 pr-3">Photo</th>
                    <th className="py-3.5 px-3">Product ID / SKU</th>
                    <th className="py-3.5 px-3">Product Label</th>
                    <th className="py-3.5 px-3">Category</th>
                    <th className="py-3.5 px-3">Status</th>
                    <th className="py-3.5 px-3 text-right">Stock Qty</th>
                    <th className="py-3.5 px-3 text-right">Unit Value</th>
                    <th className="py-3.5 px-3 text-right">Resolution</th>
                    <th className="py-3.5 pl-3 pr-6 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200 text-sm">
                  {filteredItems.map((item) => (
                    <tr
                      key={item.id}
                      onClick={() => setLightboxItem(item)}
                      className="hover:bg-zinc-50/90 transition-colors cursor-pointer"
                    >
                      <td className="py-2.5 pl-6 pr-3 w-16">
                        <img
                          src={item.imageDataUrl}
                          alt={item.label}
                          referrerPolicy="no-referrer"
                          className="w-12 h-9 object-cover rounded-md border border-zinc-200 bg-zinc-100"
                        />
                      </td>
                      <td className="py-2.5 px-3 font-mono text-xs font-semibold text-blue-600 whitespace-nowrap">
                        {item.productId}
                      </td>
                      <td className="py-2.5 px-3 font-medium text-zinc-900 max-w-xs truncate">
                        {item.label}
                      </td>
                      <td className="py-2.5 px-3 text-xs text-zinc-600 whitespace-nowrap">
                        {item.category}
                      </td>
                      <td className="py-2.5 px-3 text-xs whitespace-nowrap">
                        <span
                          className={
                            item.status === 'In Stock'
                              ? 'text-emerald-700 font-medium'
                              : item.status === 'Low Stock'
                              ? 'text-amber-700 font-medium'
                              : 'text-zinc-600'
                          }
                        >
                          {item.status}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-xs tabular-nums text-zinc-900">
                        {item.quantity}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-xs tabular-nums text-zinc-900">
                        {formatCurrency(item.unitValue)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-xs tabular-nums text-zinc-500 whitespace-nowrap">
                        {item.width}×{item.height}
                      </td>
                      <td
                        className="py-2.5 pl-3 pr-6 text-right whitespace-nowrap"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingItem(item);
                              setIsUploadOpen(true);
                            }}
                            className="p-1.5 text-zinc-500 hover:text-zinc-900 rounded-md hover:bg-zinc-100 transition-colors"
                            title="Edit SKU & Photo"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => handleQuickShareCard(e, item)}
                            className="p-1.5 text-zinc-500 hover:text-blue-600 rounded-md hover:bg-blue-50 transition-colors"
                            title="Share Annotated Spec Sheet"
                          >
                            <Share2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </main>

      {/* Quiet Functional Footer */}
      <footer className="mt-16 border-t border-zinc-200 bg-[#F4F4F0] py-6 px-6 lg:px-10">
        <div className="max-w-[1440px] mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-zinc-500">
          <div>
            tuskusvault Local Inventory Archive · All high-resolution images and SKU records are stored locally in your browser via IndexedDB.
          </div>
          <div className="flex items-center gap-5">
            <button
              type="button"
              onClick={handleExportArchiveJson}
              className="hover:text-zinc-900 transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              Backup Local DB (JSON)
            </button>
            <button
              type="button"
              onClick={() => backupInputRef.current?.click()}
              className="hover:text-zinc-900 transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <UploadIcon className="w-3.5 h-3.5" />
              Restore Backup
            </button>
            {items.length > 0 && (
              confirmClearAll ? (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleClearVault}
                    className="text-red-600 font-semibold hover:underline cursor-pointer"
                  >
                    Confirm Clear All
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmClearAll(false)}
                    className="text-zinc-500 hover:text-zinc-800 cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmClearAll(true)}
                  className="hover:text-red-600 transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Clear Vault Data
                </button>
              )
            )}
          </div>
        </div>
      </footer>

      {/* Upload / Edit Modal */}
      <UploadModal
        isOpen={isUploadOpen}
        onClose={() => {
          setIsUploadOpen(false);
          setEditingItem(null);
        }}
        onSave={handleSaveItem}
        categories={categories}
        initialItem={editingItem}
      />

      {/* Fullscreen High-Res Lightbox & Share Modal */}
      <LightboxModal
        item={lightboxItem}
        onClose={() => setLightboxItem(null)}
        onEdit={(item) => {
          setEditingItem(item);
          setIsUploadOpen(true);
        }}
        onDelete={handleDeleteItem}
        hasPrev={currentLightboxIndex > 0}
        hasNext={currentLightboxIndex >= 0 && currentLightboxIndex < filteredItems.length - 1}
        onPrev={() => {
          if (currentLightboxIndex > 0) {
            setLightboxItem(filteredItems[currentLightboxIndex - 1]);
          }
        }}
        onNext={() => {
          if (currentLightboxIndex >= 0 && currentLightboxIndex < filteredItems.length - 1) {
            setLightboxItem(filteredItems[currentLightboxIndex + 1]);
          }
        }}
      />
    </div>
  );
}
