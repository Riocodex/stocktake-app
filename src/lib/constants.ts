export const ROLES = {
  SUPER_ADMIN: "SUPER_ADMIN",
  OUTLET_ADMIN: "OUTLET_ADMIN",
} as const;

export type Role = (typeof ROLES)[keyof typeof ROLES];

export const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN: "Super admin",
  OUTLET_ADMIN: "Outlet admin",
};

export const STOCK_TAKE_STATUS = {
  DRAFT: "DRAFT",
  SUBMITTED: "SUBMITTED",
} as const;

/** Which side of the venue a count or a catalogue section belongs to. */
export const STOCK_AREAS = {
  BAR: "BAR",
  KITCHEN: "KITCHEN",
} as const;

export type StockArea = (typeof STOCK_AREAS)[keyof typeof STOCK_AREAS];

export const AREA_LABELS: Record<string, string> = {
  BAR: "Bar",
  KITCHEN: "Kitchen",
};

/** Catalogue sections that appear on both bar and kitchen counts. */
export const AREA_BOTH = "BOTH";

export const CATEGORY_AREAS: Record<string, StockArea | typeof AREA_BOTH> = {
  "Coffee & Tea": STOCK_AREAS.BAR,
  "Soft Drinks": STOCK_AREAS.BAR,
  "Wine & Beer": STOCK_AREAS.BAR,
  Spirits: STOCK_AREAS.BAR,
  Merch: STOCK_AREAS.BAR,
  "Dairy & Alternatives": STOCK_AREAS.KITCHEN,
  Bakery: STOCK_AREAS.KITCHEN,
  "Fruit & Veg": STOCK_AREAS.KITCHEN,
  "Dry Goods": STOCK_AREAS.KITCHEN,
  Packaging: AREA_BOTH,
};

export function categoryMatchesArea(
  categoryArea: string | null | undefined,
  stockArea: string | null | undefined,
) {
  if (!stockArea) return true;
  if (!categoryArea || categoryArea === AREA_BOTH) return true;
  return categoryArea === stockArea;
}

export const PHOTO_STATUS = {
  PENDING: "PENDING",
  ANALYZING: "ANALYZING",
  ANALYZED: "ANALYZED",
  FAILED: "FAILED",
} as const;

export const LINE_SOURCE = {
  AI: "AI",
  MANUAL: "MANUAL",
} as const;

export const UNITS = [
  "unit",
  "bottle",
  "can",
  "carton",
  "case",
  "keg",
  "kg",
  "g",
  "litre",
  "ml",
  "pack",
  "punnet",
  "tray",
  "box",
  "bag",
  "tin",
  "tub",
  "loaf",
  "slice",
  "block",
] as const;

/// A count is treated as a discrepancy worth flagging beyond this ratio.
export const VARIANCE_ALERT_RATIO = 0.25;

/// Below this model confidence a detected line is highlighted for review.
export const LOW_CONFIDENCE_THRESHOLD = 0.7;

/** Physical inventory wastage today; DISH reserved for future recipe wastage. */
export const WASTAGE_TARGET = {
  ITEM: "ITEM",
  DISH: "DISH",
} as const;

export const WASTAGE_REASONS = {
  SPOILED: "SPOILED",
  EXPIRED: "EXPIRED",
  DAMAGED: "DAMAGED",
  PREPARATION_WASTE: "PREPARATION_WASTE",
  OVERPRODUCTION: "OVERPRODUCTION",
  STAFF_ERROR: "STAFF_ERROR",
  OTHER: "OTHER",
} as const;

export type WastageReason =
  (typeof WASTAGE_REASONS)[keyof typeof WASTAGE_REASONS];

export const WASTAGE_REASON_LABELS: Record<WastageReason, string> = {
  SPOILED: "Spoiled",
  EXPIRED: "Expired",
  DAMAGED: "Damaged",
  PREPARATION_WASTE: "Preparation waste",
  OVERPRODUCTION: "Overproduction",
  STAFF_ERROR: "Staff error",
  OTHER: "Other",
};

export function isWastageReason(value: string): value is WastageReason {
  return Object.values(WASTAGE_REASONS).includes(value as WastageReason);
}

export const TRANSFER_STATUS = {
  DRAFT: "DRAFT",
  SENT: "SENT",
  RECEIVED: "RECEIVED",
  CANCELLED: "CANCELLED",
} as const;

export type TransferStatus =
  (typeof TRANSFER_STATUS)[keyof typeof TRANSFER_STATUS];

export const TRANSFER_STATUS_LABELS: Record<TransferStatus, string> = {
  DRAFT: "Draft",
  SENT: "Sent",
  RECEIVED: "Received",
  CANCELLED: "Cancelled",
};

export function isTransferStatus(value: string): value is TransferStatus {
  return Object.values(TRANSFER_STATUS).includes(value as TransferStatus);
}
