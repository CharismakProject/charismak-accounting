export type ProductEdition = "standard" | "enterprise_custom";

export type EnterpriseCapability =
  | "multi_company_consolidation"
  | "bespoke_authority_matrix"
  | "enterprise_sso"
  | "erp_integrations"
  | "regional_reporting"
  | "custom_compliance";

export const STANDARD_ACTIVE_PROJECT_LIMIT = 25;

export function hasEnterpriseCapability(
  edition: ProductEdition,
  capabilities: Record<string, boolean> | null | undefined,
  capability: EnterpriseCapability,
) {
  return edition === "enterprise_custom" && capabilities?.[capability] === true;
}
