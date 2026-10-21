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

/** ITEM deducts stock; DISH records financial loss only (no ingredient deduction). */
export const WASTAGE_TARGET = {
  ITEM: "ITEM",
  DISH: "DISH",
} as const;

export type WastageTarget =
  (typeof WASTAGE_TARGET)[keyof typeof WASTAGE_TARGET];

export const WASTAGE_TARGET_LABELS: Record<WastageTarget, string> = {
  ITEM: "Item",
  DISH: "Dish",
};

export const DISH_WASTAGE_UNIT = "portion";

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

export const STOCK_MOVEMENT_TYPE = {
  STOCK_TAKE_ADJUSTMENT: "STOCK_TAKE_ADJUSTMENT",
  DELIVERY: "DELIVERY",
  WASTAGE: "WASTAGE",
  TRANSFER_OUT: "TRANSFER_OUT",
  TRANSFER_IN: "TRANSFER_IN",
  MANUAL_ADJUSTMENT: "MANUAL_ADJUSTMENT",
} as const;

export type StockMovementType =
  (typeof STOCK_MOVEMENT_TYPE)[keyof typeof STOCK_MOVEMENT_TYPE];

export const STOCK_MOVEMENT_TYPE_LABELS: Record<StockMovementType, string> = {
  STOCK_TAKE_ADJUSTMENT: "Stock take",
  DELIVERY: "Delivery",
  WASTAGE: "Wastage",
  TRANSFER_OUT: "Transfer out",
  TRANSFER_IN: "Transfer in",
  MANUAL_ADJUSTMENT: "Manual adjustment",
};

export function isStockMovementType(value: string): value is StockMovementType {
  return Object.values(STOCK_MOVEMENT_TYPE).includes(value as StockMovementType);
}

export const STOCK_MOVEMENT_REFERENCE = {
  STOCK_TAKE: "STOCK_TAKE",
  STOCK_TAKE_LINE: "STOCK_TAKE_LINE",
  DELIVERY: "DELIVERY",
  DELIVERY_LINE: "DELIVERY_LINE",
  WASTAGE: "WASTAGE",
  TRANSFER: "TRANSFER",
  TRANSFER_LINE: "TRANSFER_LINE",
} as const;

/** Menu sections for prepared Dishes (separate from inventory Category). */
export const DISH_CATEGORIES = [
  "Smoothies",
  "Juices",
  "Coffee",
  "Cocktails",
  "Soft drinks",
  "Starters",
  "Mains",
  "Burgers",
  "Pasta",
  "Salads",
  "Sides",
  "Desserts",
  "Breakfast",
  "Other",
] as const;

export type DishCategory = (typeof DISH_CATEGORIES)[number];

/** Default food-cost alert thresholds (%). Stored in AppSettings; overridable by SUPER_ADMIN. */
export const DEFAULT_FOOD_COST_WARNING_PERCENT = 30;
export const DEFAULT_FOOD_COST_CRITICAL_PERCENT = 35;

export const COST_ALERT_LEVEL = {
  HEALTHY: "HEALTHY",
  WARNING: "WARNING",
  CRITICAL: "CRITICAL",
  UNRESOLVED: "UNRESOLVED",
} as const;

export type CostAlertLevel =
  (typeof COST_ALERT_LEVEL)[keyof typeof COST_ALERT_LEVEL];

export const COST_ALERT_LEVEL_LABELS: Record<CostAlertLevel, string> = {
  HEALTHY: "Healthy",
  WARNING: "Warning",
  CRITICAL: "Critical",
  UNRESOLVED: "Unresolved",
};

/**
 * Minimum complete portions for AVAILABLE status.
 * Below this (but ≥ 1) → LOW. Zero → UNAVAILABLE.
 * Kept as a constant for now; wire into AppSettings when product wants UI edits.
 */
export const DEFAULT_AVAILABILITY_AVAILABLE_MIN_PORTIONS = 5;

export const AVAILABILITY_STATUS = {
  AVAILABLE: "AVAILABLE",
  LOW: "LOW",
  UNAVAILABLE: "UNAVAILABLE",
  UNRESOLVED: "UNRESOLVED",
} as const;

export type AvailabilityStatus =
  (typeof AVAILABILITY_STATUS)[keyof typeof AVAILABILITY_STATUS];

export const AVAILABILITY_STATUS_LABELS: Record<AvailabilityStatus, string> = {
  AVAILABLE: "Available",
  LOW: "Low",
  UNAVAILABLE: "Unavailable",
  UNRESOLVED: "Unresolved",
};

/** How staff place an order from a Purchasing card. */
export const ORDERING_METHOD = {
  WHATSAPP: "WHATSAPP",
  WEBSITE: "WEBSITE",
  INTERNAL: "INTERNAL",
} as const;

export type OrderingMethod =
  (typeof ORDERING_METHOD)[keyof typeof ORDERING_METHOD];

export const ORDERING_METHOD_LABELS: Record<OrderingMethod, string> = {
  WHATSAPP: "WhatsApp",
  WEBSITE: "Website",
  INTERNAL: "Internal",
};

export function isOrderingMethod(value: string): value is OrderingMethod {
  return Object.values(ORDERING_METHOD).includes(value as OrderingMethod);
}

export const ORDER_APPROVAL_STATUS = {
  PENDING: "PENDING",
  APPROVED: "APPROVED",
  REJECTED: "REJECTED",
} as const;

export type OrderApprovalStatus =
  (typeof ORDER_APPROVAL_STATUS)[keyof typeof ORDER_APPROVAL_STATUS];

export const ORDER_APPROVAL_STATUS_LABELS: Record<OrderApprovalStatus, string> =
  {
    PENDING: "Pending",
    APPROVED: "Approved",
    REJECTED: "Rejected",
  };

/** Demo destinations for sample ordering cards (not verified suppliers). */
export const DEMO_ORDERING_WHATSAPP_URL =
  "https://chat.whatsapp.com/F2YOng3M5M54afoHLR3Hyh";
export const DEMO_ORDERING_WEBSITE_URL = "https://tribemalta.com/mt/shop";

/** Invoice document lifecycle (capture & review only — never updates stock). */
export const INVOICE_STATUS = {
  UPLOADED: "UPLOADED",
  EXTRACTED: "EXTRACTED",
  NEEDS_REVIEW: "NEEDS_REVIEW",
  CONFIRMED: "CONFIRMED",
  FAILED: "FAILED",
} as const;

export type InvoiceStatus =
  (typeof INVOICE_STATUS)[keyof typeof INVOICE_STATUS];

export const INVOICE_STATUS_LABELS: Record<InvoiceStatus, string> = {
  UPLOADED: "Uploaded",
  EXTRACTED: "Extracted",
  NEEDS_REVIEW: "Needs review",
  CONFIRMED: "Confirmed",
  FAILED: "Failed",
};

export function isInvoiceStatus(value: string): value is InvoiceStatus {
  return Object.values(INVOICE_STATUS).includes(value as InvoiceStatus);
}

export const INVOICE_LINE_MATCH = {
  UNMATCHED: "UNMATCHED",
  SUGGESTED: "SUGGESTED",
  MATCHED: "MATCHED",
  SKIPPED: "SKIPPED",
} as const;

export type InvoiceLineMatchStatus =
  (typeof INVOICE_LINE_MATCH)[keyof typeof INVOICE_LINE_MATCH];

export const INVOICE_LINE_MATCH_LABELS: Record<InvoiceLineMatchStatus, string> =
  {
    UNMATCHED: "Unmatched",
    SUGGESTED: "Suggested",
    MATCHED: "Matched",
    SKIPPED: "Skipped",
  };

/** Header vs line-sum tolerance when reconciling invoice totals (EUR). */
export const INVOICE_TOTAL_TOLERANCE_EUR = 0.05;

/** Physical goods receiving progress (independent of document CONFIRMED). */
export const INVOICE_RECEIVING_STATUS = {
  NOT_RECEIVED: "NOT_RECEIVED",
  PARTIALLY_RECEIVED: "PARTIALLY_RECEIVED",
  FULLY_RECEIVED: "FULLY_RECEIVED",
} as const;

export type InvoiceReceivingStatus =
  (typeof INVOICE_RECEIVING_STATUS)[keyof typeof INVOICE_RECEIVING_STATUS];

export const INVOICE_RECEIVING_STATUS_LABELS: Record<
  InvoiceReceivingStatus,
  string
> = {
  NOT_RECEIVED: "Not received",
  PARTIALLY_RECEIVED: "Partially received",
  FULLY_RECEIVED: "Fully received",
};

/** Qty comparison tolerance in stock units when tracking remaining. */
export const INVOICE_RECEIVE_QTY_TOLERANCE = 0.001;
