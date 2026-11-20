export function isTaxReviewRequired(product: {
  taxRateBps?: unknown;
  extensions?: unknown;
}): boolean {
  const extensions =
    typeof product.extensions === "object" && product.extensions !== null
      ? (product.extensions as Record<string, unknown>)
      : {};

  if (
    extensions.taxReviewRequired === true ||
    extensions.taxReviewStatus === "TAX_REVIEW_REQUIRED"
  ) {
    return true;
  }

  const taxRateBps = product.taxRateBps;
  if (
    typeof taxRateBps !== "number" ||
    !Number.isInteger(taxRateBps) ||
    taxRateBps < 0 ||
    taxRateBps > 10000
  ) {
    return true;
  }

  return false;
}
