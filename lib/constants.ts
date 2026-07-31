/**
 * Splitwise category IDs for all categories and subcategories
 * Maps category/subcategory names to their IDs from Splitwise API
 */
export const CATEGORY_MAP: Record<string, number> = {
  // Utilities
  "Utilities": 1,
  "Cleaning": 48,
  "Electricity": 5,
  "Heat/gas": 6,
  "Trash": 37,
  "TV/Phone/Internet": 8,
  "Water": 7,

  // Uncategorized
  "Uncategorized": 2,
  "General": 18,

  // Food and drink
  "Food and drink": 25,
  "Dining out": 13,
  "Groceries": 12,
  "Liquor": 38,

  // Entertainment
  "Entertainment": 19,
  "Games": 20,
  "Movies": 21,
  "Music": 22,
  "Sports": 24,

  // Home
  "Home": 27,
  "Electronics": 39,
  "Furniture": 16,
  "Household supplies": 14,
  "Maintenance": 17,
  "Mortgage": 4,
  "Rent": 3,
  "Services": 30,
  "Pets": 29,

  // Transportation
  "Transportation": 31,
  "Bicycle": 46,
  "Bus/train": 32,
  "Car": 15,
  "Gas/fuel": 33,
  "Hotel": 47,
  "Parking": 9,
  "Plane": 35,
  "Taxi": 36,

  // Life
  "Life": 40,
  "Childcare": 50,
  "Clothing": 41,
  "Education": 49,
  "Gifts": 42,
  "Insurance": 10,
  "Medical expenses": 43,
  "Taxes": 45,
};

// Default category
export const DEFAULT_CATEGORY_ID = 18; // General

export const ACCOUNT_NAMES = ["OP Bank", "Amex", "Finnair Visa"] as const;
