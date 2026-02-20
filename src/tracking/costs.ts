import { logCost, getCostsByCategory, getTotalCosts } from "../agent/state.js";

export { logCost };

export function getCostSummary() {
  return {
    total: getTotalCosts(),
    byCategory: getCostsByCategory(),
  };
}
