export type InventoryStatus = 'In Stock' | 'Low Stock' | 'Archived' | 'Sample';

export interface GalleryItem {
  id: string;
  productId: string; // e.g., "VF-CHR-001"
  label: string;     // Product title / label
  category: string;  // e.g., "Horology", "Lighting", "Ceramics", "Optics", "Acoustics"
  quantity: number;
  unitValue: number;
  status: InventoryStatus;
  notes: string;
  imageDataUrl: string;
  width: number;
  height: number;
  fileSizeBytes: number;
  mimeType: string;
  createdAt: number;
  updatedAt: number;
  featured?: boolean;
}

export interface CategoryRecord {
  name: string;
  createdAt: number;
}
