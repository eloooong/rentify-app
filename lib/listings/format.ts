/**
 * Formats integer minor units as money, e.g. 12000 PHP -> "₱120". Whole
 * amounts drop the decimals; others keep two (₱120.50).
 */
export function formatMoney(minor: number, currency = "PHP"): string {
  const amount = minor / 100;
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency,
    minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(amount);
}
