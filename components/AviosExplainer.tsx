'use client';

import { useState } from 'react';
import { SourceLinks } from './SourceLinks';
import {
  AVIOS_SOURCES,
  VERIFIED_ON,
  UPGRADE_AVIOS_PER_PAX_DIRECTION,
  SUBSCRIPTION_EUR_PER_AVIOS,
  PURCHASE_CAP_PER_YEAR,
  MR_PER_TRANSFER_UNIT,
  AVIOS_PER_TRANSFER_UNIT,
  AMEX_MR_PER_EUR,
  VISA_AVIOS_PER_EUR,
  FLIGHT_AVIOS_PER_EUR,
} from '@/lib/avios-facts';
import { fmtNumber } from '@/lib/utils';

const S = (...ids: (keyof typeof AVIOS_SOURCES)[]) => ids.map((id) => AVIOS_SOURCES[id]);

export function AviosExplainer() {
  const [open, setOpen] = useState(false);
  return (
    <div className="dash-card overflow-hidden text-[13px]">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-5 py-[12px] text-[13px] font-semibold hover:bg-[var(--surface-2)] transition-colors"
      >
        <span>How Avios work here</span>
        <span className="text-[var(--fg-3)] text-[11px]">{open ? '▲ collapse' : '▼ expand'}</span>
      </button>

      {open && (
        <div className="border-t border-[var(--border)] px-5 py-4 space-y-5 leading-relaxed text-[var(--fg-2)]">
          <p className="text-[var(--fg-3)]">
            Every rate below links to the Finnair/Amex page that confirms it, read {VERIFIED_ON}. Anything without a
            source link is this model&apos;s own assumption, stated as one.
          </p>

          <section className="space-y-2">
            <h3 className="font-semibold text-[var(--fg-1)]">What an upgrade costs</h3>
            <p>
              An Economy→Business upgrade on long-haul Asia or North America routes costs{' '}
              <span className="mono font-medium">{fmtNumber(UPGRADE_AVIOS_PER_PAX_DIRECTION)}</span> Avios per
              passenger, per direction — a return trip for two needs four times that. Paying via customer service
              instead of online adds 1,000 Avios per direction. Only Basic and Silver members can redeem Avios for an
              upgrade this way.
            </p>
            <SourceLinks sources={S('upgrade')} />
          </section>

          <section className="space-y-2">
            <h3 className="font-semibold text-[var(--fg-1)]">What an Avios costs in €</h3>
            <p>
              The only confirmed, dependable price is Finnair&apos;s own subscription: €628.80/yr for 4,000 Avios/mo,
              or <span className="mono font-medium">€{SUBSCRIPTION_EUR_PER_AVIOS.toFixed(4)}</span> per Avios — too
              small a unit price for 2-decimal € formatting to show accurately, so it&apos;s spelled out here.
              That&apos;s the figure this app uses everywhere it needs a € price. You can buy up to{' '}
              {fmtNumber(PURCHASE_CAP_PER_YEAR)} Avios per calendar year.
            </p>
            <p className="text-[var(--fg-3)]">
              Flash sales are reported at up to 40% off (≈€0.0126/Avios), but that figure only comes from travel
              blogs, not an official Finnair page, and the standard (non-sale) cash price isn&apos;t public either —
              both are shown here as context, never used in the numbers above.
            </p>
            <SourceLinks sources={S('subscription', 'buyAvios', 'salePriceBlog')} />
          </section>

          <section className="space-y-2">
            <h3 className="font-semibold text-[var(--fg-1)]">Avios in Amex Membership Rewards</h3>
            <p>
              Amex transfers in fixed blocks: {MR_PER_TRANSFER_UNIT} MR → {AVIOS_PER_TRANSFER_UNIT} Avios, so a
              shortfall always rounds up to a whole multiple of {MR_PER_TRANSFER_UNIT} MR. Amex Platinum (Finland)
              earns {AMEX_MR_PER_EUR} MR per €1 of general spend — about{' '}
              {((AMEX_MR_PER_EUR / MR_PER_TRANSFER_UNIT) * AVIOS_PER_TRANSFER_UNIT).toFixed(2)} Avios/€ once
              converted, close to the Finnair Visa at Silver. The card costs €65/mo today, rising to €75/mo from 1
              Nov 2026.
            </p>
            <SourceLinks sources={S('amexTransfer', 'amexPlatinum')} />
          </section>

          <section className="space-y-2">
            <h3 className="font-semibold text-[var(--fg-1)]">Why keeping Silver status pays</h3>
            <p>
              The Finnair Visa earns {VISA_AVIOS_PER_EUR.basic} Avios/€ at Basic but{' '}
              {VISA_AVIOS_PER_EUR.silver} Avios/€ at Silver; flights earn {FLIGHT_AVIOS_PER_EUR.basic} vs{' '}
              {FLIGHT_AVIOS_PER_EUR.silver} Avios/€. Silver+ members also keep their Avios from expiring during the
              tracking period, where Basic members lose theirs after 18 months of no activity. €1,500+ of card spend
              in any calendar month earns 500 tier points toward the 15,000 needed to requalify for Silver — so
              normal spending, not a separate renewal cost, is what keeps the higher rate.
            </p>
            <SourceLinks sources={S('visa', 'flightEarn', 'expiry', 'silverTier')} />
          </section>

          <section className="space-y-2">
            <h3 className="font-semibold text-[var(--fg-1)]">How the cash plan works</h3>
            <p>
              Separately from the Avios math above, the cash plan checks whether your real household cash flow can
              fund it — entirely from transactions and assets, never a manually-set savings goal. Rolling 12-month
              net income (income − expenses) minus that same window&apos;s actual investing leaves a discretionary
              monthly amount (this can go negative, if you&apos;re investing more than you&apos;re earning). Bank
              balance above your FIRE emergency buffer counts as a one-time top-up on top of that monthly flow. Each
              tracked flight&apos;s real economy fare plus its Avios shortfall (priced at the subscription rate — the
              conservative baseline, not a hoped-for sale) is checked against that combined capacity, accumulated up
              to the flight&apos;s date, with every Avios goal competing for the same pool. Buying during a flash
              sale would only improve on this, never worsen it.
            </p>
          </section>

          <section className="space-y-2">
            <h3 className="font-semibold text-[var(--fg-1)]">Tier points</h3>
            <p>
              Tracking tier points toward Silver requalification uses the exact same goal mechanism as Avios — just
              create a goal with unit &quot;Tier points&quot; instead of &quot;Avios&quot;; nothing new to learn.
              Balance readings are the single source of truth for every goal: a reading may silently include a
              purchased or bonus top-up, so a one-off bulk buy or welcome bonus can make the observed pace above look
              more optimistic than ongoing earn really is.
            </p>
          </section>

          <section className="space-y-2">
            <h3 className="font-semibold text-[var(--fg-1)]">Corrections to the original plan</h3>
            <p className="text-[var(--fg-3)]">
              An earlier household strategy document made several claims that don&apos;t hold up against the sources
              above:
            </p>
            <ul className="list-disc pl-5 space-y-1">
              <li>&quot;Abandon Silver status&quot; has the economics backwards — keeping it costs nothing extra and raises the earn rate (1.2 vs 1.0 Avios/€ on the card, 7 vs 6 on flights), and Avios don&apos;t expire while you hold it.</li>
              <li>Amex Platinum earns 2 MR/€, not 1/€ as the plan assumed.</li>
              <li>The welcome bonus is 100,000 MR split 50,000 at month 7 and 50,000 at month 13 — not a single 75,000 MR bonus.</li>
              <li>The Platinum fee rises to €75/mo from 1 Nov 2026, not €65/mo indefinitely.</li>
              <li>The plan&apos;s &quot;effective seat cost ≈€526&quot; doesn&apos;t reconcile with its own cited inputs.</li>
            </ul>
          </section>
        </div>
      )}
    </div>
  );
}
