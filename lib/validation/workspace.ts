import { z } from "zod";

export const workspaceSchema = z.object({
  companyName: z.string().min(2, "Company name is required"),
  countryCode: z.string().length(2).default("NG"),
  currencyCode: z.string().length(3).default("NGN"),
  timezone: z.string().min(1).default("Africa/Lagos"),
});

export type WorkspaceInput = z.infer<typeof workspaceSchema>;
