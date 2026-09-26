/**
 * Estimated EMI, for live preview while an officer types a tenure.
 *
 * This mirrors the backend's EmiCalculator so the figure shown before approval
 * matches the one the server later persists. The server's value is
 * authoritative and is what the UI displays after approval.
 */
export function estimateEmi(principal, annualRatePct, tenureMonths) {
  const p = Number(principal);
  const months = Number(tenureMonths);

  if (!Number.isFinite(p) || p <= 0 || !Number.isFinite(months) || months <= 0) {
    return null;
  }

  const rate = Number(annualRatePct);
  if (!Number.isFinite(rate) || rate === 0) {
    return Math.round((p / months) * 100) / 100;
  }

  const monthlyRate = rate / 12 / 100;
  const growth = (1 + monthlyRate) ** months;
  const emi = (p * monthlyRate * growth) / (growth - 1);

  return Math.round(emi * 100) / 100;
}

/** Client-side total interest, shown alongside the EMI. */
export function totalInterest(principal, emi, tenureMonths) {
  const p = Number(principal);
  const months = Number(tenureMonths);
  if (!Number.isFinite(p) || !Number.isFinite(emi) || !Number.isFinite(months)) return null;
  return Math.round((emi * months - p) * 100) / 100;
}
