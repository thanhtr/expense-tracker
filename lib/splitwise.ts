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
  payment?: boolean; // true for debt-settlement payments between members, not real expenses
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

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30_000);

  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      headers,
      cache: "no-store", // Always fetch fresh from Splitwise
      signal: controller.signal,
    });
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error(`Splitwise API request timed out after 30s: ${path}`);
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }

  const data = await response.json() as Record<string, unknown>;

  // Splitwise quirk: HTTP 200 but still has errors
  // Errors can be array, object with error arrays, or string field
  let hasErrors = false;
  let errorMsg = '';

  if (!response.ok) {
    hasErrors = true;
    errorMsg = response.statusText;
  } else if (data.errors) {
    // Handle array of errors: [{ base: ["message"] }, ...]
    if (Array.isArray(data.errors) && data.errors.length > 0) {
      hasErrors = true;
      errorMsg = String(data.errors[0]);
    }
    // Handle object with error arrays: { base: ["message"], field: ["error"] }
    else if (typeof data.errors === 'object' && !Array.isArray(data.errors)) {
      const errorObj = data.errors as Record<string, unknown>;
      const errorKeys = Object.keys(errorObj);
      // Only treat as error if there are actual error entries with non-empty arrays
      if (errorKeys.length > 0) {
        for (const key of errorKeys) {
          const messages = errorObj[key];
          if (Array.isArray(messages) && messages.length > 0) {
            hasErrors = true;
            errorMsg = `${key}: ${String(messages[0])}`;
            break;
          }
        }
      }
    }
  } else if (data.error) {
    hasErrors = true;
    errorMsg = String(data.error);
  }

  if (hasErrors) {
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
 * Get a single expense by ID
 * Searches within a 90-day rolling window to avoid fetching all expenses.
 * Throws if the expense is not found in that window (sentinel/very old expenses
 * are not expected to be looked up by this path).
 */
export async function getExpenseById(id: number): Promise<SplitwiseExpense> {
  const datedAfter = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
    .toISOString()
    .split('T')[0];
  const expenses = await getAllExpenses({ datedAfter });
  const expense = expenses.find(e => e.id === id);
  if (!expense) {
    throw new Error(`Expense with ID ${id} not found in the last 90 days`);
  }
  return expense;
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
 * Build count map of dedup keys from existing Splitwise expenses.
 * Uses a Map<key, count> so that N identical purchases on the same day
 * are each counted separately — allowing a second legitimate purchase
 * to be created even when one already exists in Splitwise.
 */
export function buildExistingKeys(expenses: SplitwiseExpense[]): Map<string, number> {
  const keys = new Map<string, number>();
  for (const exp of expenses) {
    if (exp.deleted_at === null || !exp.deleted_at) {
      const dateStr = exp.date.slice(0, 10); // YYYY-MM-DD
      const cost = parseFloat(exp.cost).toFixed(2);
      const key = makeDedupKey(dateStr, exp.description, cost);
      keys.set(key, (keys.get(key) ?? 0) + 1);
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
