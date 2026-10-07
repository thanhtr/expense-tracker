// Shared "how much bank cash counts as spare, above the household's emergency-fund buffer"
// calculation. Originally lived only in app/api/fire/route.ts; extracted so
// money-capacity-service.ts (the Avios cash-plan's affordability check) can reuse the exact same
// definition of "spare cash" instead of a second, possibly-drifting copy.

export interface InvestableCashInput {
  bankTotal: number;
  avgMonthlyIncome: number;
  emergencyFundMonths: number;
}

export interface InvestableCash {
  bufferTarget: number;
  investableCash: number;
}

// Bank cash counts as available only above an emergency-fund buffer (emergencyFundMonths x
// trailing-12-month average income), so a household's safety net is never mistaken for money
// free to spend elsewhere (FIRE progress, or here, an Avios goal's cash plan).
export function computeInvestableCash({
  bankTotal,
  avgMonthlyIncome,
  emergencyFundMonths,
}: InvestableCashInput): InvestableCash {
  const bufferTarget = emergencyFundMonths * avgMonthlyIncome;
  const investableCash = Math.max(0, bankTotal - bufferTarget);
  return { bufferTarget, investableCash };
}
