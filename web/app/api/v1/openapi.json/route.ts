import { OPENAPI } from "@/lib/api/spec";

export function GET() {
  return Response.json(OPENAPI, { headers: { "cache-control": "public, max-age=3600" } });
}
