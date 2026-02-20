import { logRevenue, getRevenueBySource, getTotalRevenue } from "../agent/state.js";

export { logRevenue };

export function getRevenueSummary() {
  return {
    total: getTotalRevenue(),
    bySource: getRevenueBySource(),
  };
}
