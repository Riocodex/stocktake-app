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
] as const;

/// A count is treated as a discrepancy worth flagging beyond this ratio.
export const VARIANCE_ALERT_RATIO = 0.25;

/// Below this model confidence a detected line is highlighted for review.
export const LOW_CONFIDENCE_THRESHOLD = 0.7;
