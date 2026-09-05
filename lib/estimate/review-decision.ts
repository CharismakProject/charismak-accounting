import type { BoqRecipeFamily, BoqSupplyResponsibility } from "./sectioned-boq";
import type { MaterialRecipeParameters, MaterializeDecision } from "./material-recipe-engine";

export type ReviewedBoqDecision = MaterializeDecision & {
  costCode: string;
  recipeFamily: BoqRecipeFamily;
  supplyResponsibility: BoqSupplyResponsibility;
  confirmed: boolean;
  edited?: boolean;
  parameters?: MaterialRecipeParameters;
};

export type ReviewedBoqDecisionMap = Record<string, ReviewedBoqDecision>;

export function isReviewedBoqDecisionComplete(decision: ReviewedBoqDecision | undefined) {
  return Boolean(
    decision?.confirmed &&
    decision.costCode &&
    decision.recipeFamily !== "needs_review" &&
    decision.supplyResponsibility !== "unknown"
  );
}
