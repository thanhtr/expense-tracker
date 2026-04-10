/**
 * Constants and mappings for Splitwise sync
 */

export const USER_ID = parseInt(process.env.SPLITWISE_USER_ID || "2206773"); // Tung
export const WIFE_ID = parseInt(process.env.SPLITWISE_WIFE_ID || "14152499"); // Thuy
export const GROUP_ID = parseInt(process.env.SPLITWISE_GROUP_ID || "7014251"); // 🐷🐞

/**
 * Maps our custom categories to Splitwise category IDs
 * Reference: https://secure.splitwise.com/api/v3.0#get_expenses
 */
export const CATEGORY_MAP: Record<string, number> = {
  "Entertainment": 19,
  "Food & Dining": 25,
  "Food & Groceries": 12,
  "Dining Out": 13,
  "Transport": 31,
  "Travel": 35,
  "Subscriptions": 19,
  "Healthcare": 43,
  "Fitness": 24,
  "Hobbies": 19,
  "Utilities": 1,
  "Home": 27,
  "Rent": 3,
  "Shopping": 41,
  "Personal Care": 41,
};

// Fallback category when merchant is not mapped
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
