// Auth.js owns both verbs here. The handlers come from auth.ts so the provider
// configuration has exactly one definition.
import { handlers } from "@/auth";

export const { GET, POST } = handlers;
