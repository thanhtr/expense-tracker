// Every number here comes from a page that was read and confirmed on VERIFIED_ON, with one
// deliberate exception: SALE_EUR_PER_AVIOS, a blog-sourced planning assumption, clearly labelled
// as such. If an official rate changes, re-read the source before editing the value.
// See PROJECT_SUMMARY.md "Avios goal tracking" for the fact-check this is based on.

export const VERIFIED_ON = '2026-10-07';

export const AVIOS_SOURCES = {
  upgrade: {
    label: 'finnair.com — Use Avios on a travel class upgrade',
    url: 'https://www.finnair.com/fi-en/finnair-plus/collect-and-use-avios/use-avios-on-travel-class-upgrade',
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

/** Avios sale price: flash sales are reported at up to 40% off, ≈€0.0126/Avios. This is a
 * blog-sourced, unverified figure — not an official Finnair rate — but it's the planning
 * assumption used everywhere this app prices an Avios shortfall, since the household plan is to
 * buy only during a sale, never at full/subscription price. A real sale could be priced
 * differently; treat this as a reasonable estimate, not a quote. Source: `salePriceBlog`. */
export const SALE_EUR_PER_AVIOS = 0.0126;

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

/** Amex Platinum (Finland) bonus rate: 4 MR per €1 on selected airline/hotel partners (the
 * official partner list isn't fetchable, so which merchants qualify is left to a user-configured
 * `CardEarnRule`, not hardcoded here). Source: `amexPlatinum`. */
export const AMEX_BONUS_MR_PER_EUR = 4;

/** Finnair Visa tier-points requalification: €1,500+ of qualifying card spend in a calendar
 * month earns 500 tier points toward the 15,000 needed for Silver. Source: `visa`. */
export const TIER_POINTS_MONTHLY_SPEND_THRESHOLD_EUR = 1_500;
export const TIER_POINTS_PER_QUALIFYING_MONTH = 500;

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

/** Converts a held (untransferred) Amex MR balance into its Avios equivalent, rounding down to
 * the nearest whole transfer unit — only whole 17-MR units are actually transferable, so a
 * partial unit isn't real spendable Avios yet. Inverse of `aviosToMrPoints`. */
export function mrToAvios(mr: number): number {
  const units = Math.floor(mr / MR_PER_TRANSFER_UNIT);
  return units * AVIOS_PER_TRANSFER_UNIT;
}
