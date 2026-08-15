import { SignJWT, importPKCS8 } from 'jose';

const BASE_URL = 'https://api.enablebanking.com';

let cachedJwt: string | null = null;
let jwtExpiresAt = 0;

async function buildJwt(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedJwt && now < jwtExpiresAt - 60) return cachedJwt;

  const appId = process.env.ENABLE_BANKING_APP_ID!;
  const rawKey = process.env.ENABLE_BANKING_PRIVATE_KEY!.replace(/\\n/g, '\n');
  const privateKey = await importPKCS8(rawKey, 'RS256');

  const exp = now + 3600;
  cachedJwt = await new SignJWT({})
    .setProtectedHeader({ alg: 'RS256', kid: appId })
    .setIssuer('enablebanking.com')
    .setAudience('api.enablebanking.com')
    .setIssuedAt(now)
    .setExpirationTime(exp)
    .sign(privateKey);

  jwtExpiresAt = exp;
  return cachedJwt;
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const jwt = await buildJwt();
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      'Authorization': `Bearer ${jwt}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Enable Banking ${path} → ${res.status}: ${body}`);
  }
  return res.json();
}

export interface Institution {
  name: string;
  id: string;
  bic: string;
  logo?: string;
  countries: string[];
}

export interface EBTransaction {
  entry_reference?: string;
  transaction_id?: string;
  booking_date: string;
  transaction_amount: { amount: string; currency: string };
  credit_debit_indicator: 'CRDT' | 'DBIT';
  creditor?: { name?: string };
  debtor?: { name?: string };
  remittance_information?: string[];
}

export async function listInstitutions(country = 'FI'): Promise<Institution[]> {
  const data = await request<{ aspsps: Institution[] }>(`/aspsps?country=${country}`);
  return data.aspsps;
}

export async function startAuth(aspspId: string, redirectUrl: string): Promise<{ url: string }> {
  return request('/auth', {
    method: 'POST',
    body: JSON.stringify({
      aspsp: { name: aspspId, country: 'FI' },
      state: aspspId,
      redirect_url: redirectUrl,
      access: { valid_until: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString() },
    }),
  });
}

export async function getSession(sessionId: string): Promise<{ accounts: { uid: string; account_id: { iban?: string } }[] }> {
  return request(`/sessions/${sessionId}`);
}

export async function getTransactions(accountId: string, dateFrom: string, dateTo: string): Promise<EBTransaction[]> {
  const data = await request<{ transactions: EBTransaction[] }>(
    `/accounts/${accountId}/transactions?date_from=${dateFrom}&date_to=${dateTo}`
  );
  return data.transactions ?? [];
}
