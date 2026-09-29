import { z } from "zod";

export const keyScope = z.enum([
  "programs:read",
  "programs:write",
  "runs:read",
  "runs:write",
]);
export type KeyScope = z.infer<typeof keyScope>;
export const KEY_SCOPES = keyScope.options;
