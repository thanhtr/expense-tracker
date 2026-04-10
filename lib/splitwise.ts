/**
 * Splitwise API client (server-side only)
 * Handles authentication, pagination, and error handling
 */

const SPLITWISE_BASE = "https://secure.splitwise.com/api/v3.0";

export interface SplitwiseExpense {
  id: number;
  date: string;
  description: string;
  cost: string;
  users: Array<{
    user?: { id: number; first_name: string; last_name: string };
    user_id: number;
    paid_share: string | number;
    owed_share?: string | number;
  }>;
  category?: {
    id: number;
    name: string;
  };
  details?: string | null; // JSON string stored in Splitwise
  deleted_at?: string | null;
}

/**
 * Make a request to Splitwise API
 * Handles the quirk where HTTP 200 doesn't guarantee success; must check "errors" field
 */
async function swFetch<T>(
  path: string,
  init?: RequestInit
): Promise<T> {
  const apiKey = process.env.SPLITWISE_API_KEY;
  if (!apiKey) {
    throw new Error("SPLITWISE_API_KEY not set in environment variables");
  }

  const url = `${SPLITWISE_BASE}${path}`;

  const headers = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    ...init?.headers,
  };

  const response = await fetch(url, {
    ...init,
    headers,
    cache: "no-store", // Always fetch fresh from Splitwise
  });

  const data = await response.json() as Record<string, unknown>;

  // Splitwise quirk: HTTP 200 but still has errors
  // Check for actual error messages, not empty arrays
  if (!response.ok || (Array.isArray(data.errors) && data.errors.length > 0)) {
    const errorMsg = (Array.isArray(data.errors) ? data.errors[0] : data.error) || response.statusText;
    throw new Error(`Splitwise API error: ${errorMsg}`);
  }

  return data as T;
}

/**
 * Fetch all expenses with pagination (Splitwise max = 200/request)
 */
export async function getAllExpenses(params: {
  datedAfter?: string;
  datedBefore?: string;
}): Promise<SplitwiseExpense[]> {
  const allExpenses: SplitwiseExpense[] = [];
  let offset = 0;
  const limit = 200;

  while (true) {
    const queryParams = new URLSearchParams({
      limit: limit.toString(),
      offset: offset.toString(),
    });

    if (params.datedAfter) {
      queryParams.append("dated_after", params.datedAfter);
    }
    if (params.datedBefore) {
      queryParams.append("dated_before", params.datedBefore);
    }

    const response = await swFetch<{ expenses: SplitwiseExpense[] }>(
      `/get_expenses?${queryParams.toString()}`
    );

    const expenses = response.expenses || [];
    allExpenses.push(...expenses);

    // Stop when we get fewer than limit results
    if (expenses.length < limit) {
      break;
    }

    offset += limit;
  }

  return allExpenses;
}

/**
 * Create an expense in Splitwise
 */
export async function createExpense(
  body: Record<string, unknown>
): Promise<void> {
  await swFetch("/create_expense", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

/**
 * Delete an expense from Splitwise
 */
export async function deleteExpense(id: number): Promise<void> {
  await swFetch(`/delete_expense/${id}`, {
    method: "POST",
  });
}

/**
 * Generate dedup key matching Python CLI: "date|merchant|cost"
 */
export function makeDedupKey(
  date: string,
  merchant: string,
  cost: string
): string {
  return `${date}|${merchant}|${cost}`;
}

/**
 * Build set of dedup keys from existing Splitwise expenses
 */
export function buildExistingKeys(expenses: SplitwiseExpense[]): Set<string> {
  const keys = new Set<string>();
  for (const exp of expenses) {
    if (exp.deleted_at === null || !exp.deleted_at) {
      const dateStr = exp.date.slice(0, 10); // YYYY-MM-DD
      const cost = parseFloat(exp.cost).toFixed(2);
      const key = makeDedupKey(dateStr, exp.description, cost);
      keys.add(key);
    }
  }
  return keys;
}

/**
 * Parse details JSON from Splitwise expense
 * Format: {"account": "...", "category": "..."}
 */
export function parseExpenseDetails(
  detailsStr?: string | null
): { account?: string; category?: string } {
  if (!detailsStr) return {};
  try {
    return JSON.parse(detailsStr);
  } catch {
    return {};
  }
}
