export type {
  CouncilExecutionContext,
  CustomerQuoteInput,
  CustomerQuoteResult,
  ExtendedAnalysisInput,
  ServiceBenchmarkInput,
} from "./operations/atlassian-client";

export {
  analyzeCompetitors,
  calculateServiceFee,
  generateLocalizedCampaign,
} from "./operations/market-tools";

export { exportStrategyToConfluence } from "./operations/confluence-publisher";

export {
  createCustomerQuote,
  createJiraMarketingEpics,
} from "./operations/jira-publisher";

export const handler = async () => ({
  status: "ready",
  tools: [
    "analyzeCompetitors",
    "calculateServiceFee",
    "generateLocalizedCampaign",
    "exportStrategyToConfluence",
    "createJiraMarketingEpics",
    "createCustomerQuote",
  ],
});
