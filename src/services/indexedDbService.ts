import { GalleryItem } from '../types/gallery';

const DB_NAME = 'TuskusVaultInventoryDB';
const DB_VERSION = 1;
const ITEMS_STORE = 'gallery_items';
const CATEGORIES_STORE = 'categories';

export const DEFAULT_CATEGORIES: string[] = [
  'General',
  'Apparel',
  'Hardware',
  'Accessories',
  'Archive',
];

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      if (!db.objectStoreNames.contains(ITEMS_STORE)) {
        const store = db.createObjectStore(ITEMS_STORE, { keyPath: 'id' });
        store.createIndex('category', 'category', { unique: false });
        store.createIndex('productId', 'productId', { unique: false });
        store.createIndex('createdAt', 'createdAt', { unique: false });
      }

      if (!db.objectStoreNames.contains(CATEGORIES_STORE)) {
        db.createObjectStore(CATEGORIES_STORE, { keyPath: 'name' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function initializeAndLoadGallery(): Promise<{
  items: GalleryItem[];
  categories: string[];
}> {
  // Clean up legacy sample DB if present so old sample data is completely purged
  try {
    indexedDB.deleteDatabase('VaultFrameInventoryDB');
  } catch {
    // Ignore if blocked or unsupported
  }

  await openDatabase();
  const items = await getAllItems();
  const categories = await getAllCategories();
  return { items, categories };
}

export async function getAllItems(): Promise<GalleryItem[]> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(ITEMS_STORE, 'readonly');
    const store = tx.objectStore(ITEMS_STORE);
    const request = store.getAll();
    request.onsuccess = () => {
      const results = (request.result as GalleryItem[]) || [];
      results.sort((a, b) => b.createdAt - a.createdAt);
      resolve(results);
    };
    request.onerror = () => reject(request.error);
  });
}

export async function saveGalleryItem(item: GalleryItem): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([ITEMS_STORE, CATEGORIES_STORE], 'readwrite');
    tx.objectStore(ITEMS_STORE).put(item);
    if (item.category && item.category.trim()) {
      tx.objectStore(CATEGORIES_STORE).put({
        name: item.category.trim(),
        createdAt: Date.now(),
      });
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function deleteGalleryItem(id: string): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(ITEMS_STORE, 'readwrite');
    tx.objectStore(ITEMS_STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getAllCategories(): Promise<string[]> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(CATEGORIES_STORE, 'readonly');
    const store = tx.objectStore(CATEGORIES_STORE);
    const req = store.getAll();
    req.onsuccess = () => {
      const records = (req.result as { name: string }[]) || [];
      const names = Array.from(new Set([...DEFAULT_CATEGORIES, ...records.map((r) => r.name)]));
      resolve(names);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function addCategoryToDb(categoryName: string): Promise<void> {
  const cleaned = categoryName.trim();
  if (!cleaned) return;
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(CATEGORIES_STORE, 'readwrite');
    tx.objectStore(CATEGORIES_STORE).put({ name: cleaned, createdAt: Date.now() });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function clearAllGalleryData(): Promise<{ items: GalleryItem[]; categories: string[] }> {
  const db = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction([ITEMS_STORE, CATEGORIES_STORE], 'readwrite');
    tx.objectStore(ITEMS_STORE).clear();
    tx.objectStore(CATEGORIES_STORE).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  return {
    items: [],
    categories: DEFAULT_CATEGORIES,
  };
}

export async function importGalleryItems(items: GalleryItem[]): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([ITEMS_STORE, CATEGORIES_STORE], 'readwrite');
    const itemStore = tx.objectStore(ITEMS_STORE);
    const catStore = tx.objectStore(CATEGORIES_STORE);

    for (const item of items) {
      if (item.id && item.productId && item.label && item.imageDataUrl) {
        itemStore.put(item);
        if (item.category) {
          catStore.put({ name: item.category, createdAt: Date.now() });
        }
      }
    }

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
