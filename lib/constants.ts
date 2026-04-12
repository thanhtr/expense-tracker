/**
 * Constants and mappings for Splitwise sync
 */

export const USER_ID = parseInt(process.env.SPLITWISE_USER_ID || "2206773"); // Tung
export const WIFE_ID = parseInt(process.env.SPLITWISE_WIFE_ID || "14152499"); // Thuy
export const GROUP_ID = parseInt(process.env.SPLITWISE_GROUP_ID || "7014251"); // 🐷🐞

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

/**
 * Mapping from account name to user ID (who paid)
 * All accounts belong to Tung (USER_ID)
 */
export const ACCOUNT_TO_USER: Record<string, number> = {
  "OP Bank": USER_ID,
  "Amex": USER_ID,
  "Finnair Visa": USER_ID,
};
