import type { CatalogAttribute, CatalogFee } from "./types";

export function isFeeAttribute(attribute: CatalogAttribute) {
  return (
    /^(ALX|CRSF)$/i.test(attribute.name) ||
    /\bfee(?:s)?\b/i.test(attribute.description)
  );
}

/** Campus-qualified fees are alternatives, never amounts to add together. */
export function feesForCampus(
  attributes: CatalogAttribute[],
  campusCode: string,
): CatalogFee[] {
  const campus =
    campusCode.toUpperCase() === "ATI" ? "WST" : campusCode.toUpperCase();
  const fees = new Map<string, CatalogFee>();
  for (const attribute of attributes) {
    if (!isFeeAttribute(attribute) || !attribute.description) continue;
    const prefix = attribute.description.split(/course fee/i)[0];
    const campusCodes = /course fee/i.test(attribute.description)
      ? [
          ...new Set(
            (prefix.match(/\b(?:COL|ATI|WST|NWK|LMA|MNS|MRN)\b/gi) ?? []).map(
              (code) =>
                code.toUpperCase() === "ATI" ? "WST" : code.toUpperCase(),
            ),
          ),
        ]
      : [];
    if (campusCodes.length && !campusCodes.includes(campus)) continue;
    const rawAmount =
      attribute.description.match(/\$\s*([\d,]+(?:\.\d{1,2})?)/)?.[1] ??
      (attribute.name === "ALX" ? attribute.value : "");
    const amount =
      rawAmount && Number.isFinite(Number(rawAmount.replaceAll(",", "")))
        ? Number(rawAmount.replaceAll(",", ""))
        : null;
    const fee: CatalogFee = {
      kind:
        attribute.name === "ALX"
          ? "textbook"
          : attribute.name === "CRSF"
            ? "course"
            : "other",
      amount,
      description: attribute.description,
      campusCodes,
    };
    fees.set(fee.description, fee);
  }
  return [...fees.values()];
}
