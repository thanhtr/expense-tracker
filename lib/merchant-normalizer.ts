/**
 * Normalize merchant names for consistent matching in learned rules
 * Removes legal suffixes (OY, AB, LTD, etc.) and converts to lowercase
 */
export function normalizeMerchant(merchant: string): string {
  if (!merchant) return '';

  let normalized = merchant.toLowerCase().trim();

  // Remove common legal suffixes
  const suffixes = [
    /\s+o\.?y\.?$/i,      // OY (Finnish)
    /\s+a\.?b\.?$/i,      // AB (Swedish)
    /\s+ltd\.?$/i,        // LTD
    /\s+inc\.?$/i,        // INC
    /\s+gmbh\.?$/i,       // GmbH
    /\s+sa\.?$/i,         // SA
    /\s+s\.?p\.?a\.?$/i,  // SPA
    /\s+d\.?o\.?o\.?$/i,  // DOO (Serbian/Croatian)
    /\s+s\.?r\.?o\.?$/i,  // SRO (Czech)
    /\s+spółka\s+z\s+ograniczoną\s+odpowiedzialnością$/i, // Polish LLC
  ];

  for (const suffix of suffixes) {
    normalized = normalized.replace(suffix, '');
  }

  // Strip Finnish city/location suffixes e.g. "S-Market Kerava" → "s-market"
  const finnishCities = [
    'helsinki', 'espoo', 'vantaa', 'tampere', 'turku', 'oulu',
    'kerava', 'järvenpää', 'hyvinkää', 'kirkkonummi', 'nurmijärvi',
    'tuusula', 'klaukkala', 'lohja', 'porvoo', 'lahti', 'kuopio',
  ];
  for (const city of finnishCities) {
    const candidate = normalized.replace(new RegExp(`\\s+${city}$`, 'i'), '').trim();
    if (candidate.length > 3) normalized = candidate;
  }

  // Strip trailing branch numbers e.g. "Alko 001" → "alko"
  const candidateBranch = normalized.replace(/\s+\d{1,3}$/, '').trim();
  if (candidateBranch.length > 3) normalized = candidateBranch;

  // Remove extra whitespace
  normalized = normalized.replace(/\s+/g, ' ').trim();

  return normalized;
}
