const priceFormatter = new Intl.NumberFormat("fr-FR", {
  maximumFractionDigits: 0,
});

export function formatPrice(price: number) {
  return `${priceFormatter.format(price)} F`;
}
