function discountedPrice(price, pct){
  if (!pct || pct <= 0) return price;
  return Math.max(0, Math.round(price * (1 - pct / 100)));
}

/** Shape a DB product row for the public API (adds computed discounted prices, hides internal columns). */
function toPublicProduct(row){
  const perks = JSON.parse(row.perks || '[]');
  const hasDiscount = Boolean(row.discount_pct && row.discount_pct > 0);
  const base = {
    id: row.id,
    type: row.type,
    name: row.name,
    perks,
    sortOrder: row.sort_order,
    discount: hasDiscount ? { pct: row.discount_pct, label: row.discount_label || `-${row.discount_pct}%` } : null,
  };
  if (row.type === 'rank') {
    return {
      ...base,
      color: row.color,
      permTag: row.perm_tag,
      monthTag: row.month_tag,
      price: row.price,
      priceFinal: discountedPrice(row.price, row.discount_pct),
      priceMonthly: row.price_monthly,
      priceMonthlyFinal: discountedPrice(row.price_monthly, row.discount_pct),
    };
  }
  return {
    ...base,
    qty: row.qty,
    tag: row.coin_tag,
    price: row.price,
    priceFinal: discountedPrice(row.price, row.discount_pct),
  };
}

module.exports = { discountedPrice, toPublicProduct };
