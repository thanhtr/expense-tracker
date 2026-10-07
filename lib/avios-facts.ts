// Every number here comes from a page that was read and confirmed on VERIFIED_ON. Nothing in
// this file is an estimate — if a rate changes, re-read the source before editing the value.
// See PROJECT_SUMMARY.md "Avios goal tracking" for the fact-check this is based on.

export const VERIFIED_ON = '2026-10-07';

export const AVIOS_SOURCES = {
  upgrade: {
    label: 'finnair.com — Use Avios on a travel class upgrade',
    url: 'https://www.finnair.com/fi-en/finnair-plus/collect-and-use-avios/use-avios-on-travel-class-upgrade',
  },
  subscription: {
    label: 'finnair.com — Avios subscription',
    url: 'https://www.finnair.com/fi-en/finnair-plus/buy--transfer-or-exchange-avios/avios-subscription',
  },
  buyAvios: {
    label: 'finnair.com — Buy, transfer or exchange Avios',
    url: 'https://www.finnair.com/fi-en/finnair-plus/buy--transfer-or-exchange-avios',
  },
  amexTransfer: {
    label: 'americanexpress.com/fi-fi — Membership Rewards → Finnair Plus',
    url: 'https://www.americanexpress.com/fi-fi/rewards/membership-rewards/partner/Finnair-Plus/FINN-01',
  },
  amexPlatinum: {
    label: 'americanexpress.com/fi-fi — Platinum Card',
    url: 'https://www.americanexpress.com/fi-fi/maksukortti/platinum-card/',
  },
  visa: {
    label: 'finnair.com — Finnair Visa credit card',
    url: 'https://www.finnair.com/fi-en/finnair-plus/finnair-visa-credit-card',
  },
  flightEarn: {
    label: 'finnair.com — Collect Avios and tier points from flights',
    url: 'https://www.finnair.com/fi-en/finnair-plus/collect-and-use-avios/collect-avios-and-tier-points-from-flights',
  },
  expiry: {
    label: 'finnair.com — When do my Avios expire?',
    url: 'https://www.finnair.com/us-en/frequently-asked-questions/finnair-plus/when-do-my-avios-expire--1905922',
  },
  silverTier: {
    label: 'finnair.com — Finnair Plus Silver',
    url: 'https://www.finnair.com/fi-en/finnair-plus/finnair-plus-membership-tiers-and-benefits/finnair-plus-silver',
  },
  salePriceBlog: {
    label: 'loyaltylobby.com — Finnair Avios sale coverage (blog, unverified)',
    url: 'https://loyaltylobby.com/?s=finnair+avios+sale',
  },
} as const;

export type AviosSourceId = keyof typeof AVIOS_SOURCES;

/** Avios needed per passenger, one direction, for a Business-class upgrade on long-haul
 * (Japan, Singapore, most of Asia, North America). Round trip needs double. Source: `upgrade`. */
export const UPGRADE_AVIOS_PER_PAX_DIRECTION = 40_000;

/** Official Avios subscription rate (4,000/mo plan): €628.80/yr ÷ 48,000 Avios. The only
 * confirmed, dependable price per Avios — used as the conservative baseline everywhere in this
 * app. Source: `subscription`. */
export const SUBSCRIPTION_EUR_PER_AVIOS = 628.80 / 48_000;

/** Maximum Avios purchasable per calendar year. Source: `buyAvios`. */
export const PURCHASE_CAP_PER_YEAR = 200_000;

/** Amex Membership Rewards → Finnair Avios transfer: 17 MR = 10 Avios, in multiples of 17 MR.
 * Source: `amexTransfer`. */
export const MR_PER_TRANSFER_UNIT = 17;
export const AVIOS_PER_TRANSFER_UNIT = 10;

/** Amex Platinum (Finland) earns 2 Membership Rewards points per €1 of general spend (4/€ on
 * selected travel partners, not modelled here). Source: `amexPlatinum`. */
export const AMEX_MR_PER_EUR = 2;

/** Finnair Visa (Aktia) Avios earned per €1 of card spend, by Finnair Plus tier. No Avios on
 * bill payments, cash withdrawals or bank transfers. Source: `visa`. */
export const VISA_AVIOS_PER_EUR = { basic: 1.0, silver: 1.2 } as const;

/** Avios earned per €1 of Finnair flight spend (base fare + surcharge + extras), by tier.
 * Source: `flightEarn`. */
export const FLIGHT_AVIOS_PER_EUR = { basic: 6, silver: 7 } as const;

export type FinnairTier = keyof typeof VISA_AVIOS_PER_EUR;

/** Avios expire once 18 months pass with no collecting or spending activity at all (Silver+
 * members: no expiry during the tracking period, not modelled here since tier isn't tracked).
 * Source: `expiry`. */
export const AVIOS_EXPIRY_MONTHS = 18;

/** Rounds an Avios shortfall up to the nearest whole Amex MR transfer (multiples of 17 MR /
 * 10 Avios), returning the MR points needed. */
export function aviosToMrPoints(avios: number): number {
  const units = Math.ceil(avios / AVIOS_PER_TRANSFER_UNIT);
  return units * MR_PER_TRANSFER_UNIT;
}
