export const OPENAPI = {
  openapi: "3.1.0",
  info: {
    title: "AutoOpt public API",
    version: "1.0.0",
    description: "Workspace programs and streamed optimization runs.",
  },
  servers: [{ url: "/api/v1" }],
  components: {
    securitySchemes: {
      ApiKey: { type: "http", scheme: "bearer", bearerFormat: "AutoOpt key" },
    },
    schemas: {
      ProgramInput: {
        type: "object",
        required: ["projectId", "name", "source"],
        properties: {
          projectId: { type: "string" },
          name: { type: "string", maxLength: 80 },
          source: { type: "string", maxLength: 8000 },
          category: { type: "string", default: "mixed" },
        },
      },
      OptimizeInput: {
        type: "object",
        required: ["programId"],
        properties: {
          programId: { type: "string" },
          method: { type: "string", default: "greedy" },
          seed: { type: "integer", minimum: 0, default: 0 },
          useSmt: { type: "boolean", default: false },
          proveFinal: { type: "boolean", default: false },
          maxIterations: { type: "integer", minimum: 1, maximum: 1000 },
          nodeBudget: { type: ["integer", "null"], minimum: 1 },
        },
      },
    },
  },
  security: [{ ApiKey: [] }],
  paths: {
    "/programs": {
      get: {
        summary: "List workspace programs",
        description: "Requires programs:read. Results are ordered by id.",
        parameters: [
          { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 100 } },
          { name: "cursor", in: "query", schema: { type: "string" } },
        ],
        responses: { "200": { description: "Programs and next_cursor" } },
      },
      post: {
        summary: "Create a program",
        description: "Requires programs:write. The project must belong to the key's workspace.",
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/ProgramInput" } } },
        },
        responses: { "201": { description: "Program created" }, "404": { description: "Project not found" } },
      },
    },
    "/runs": {
      get: {
        summary: "List recent runs",
        description: "Requires runs:read. Results are ordered newest first.",
        parameters: [
          { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 100 } },
        ],
        responses: { "200": { description: "Workspace runs" } },
      },
    },
    "/runs/{id}": {
      get: {
        summary: "Get a run and its trace",
        description: "Requires runs:read.",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "Run and ordered events" }, "404": { description: "Run not found" } },
      },
    },
    "/optimize": {
      post: {
        summary: "Run a stored program",
        description: "Requires runs:write. Streams newline-delimited events and returns x-run-id.",
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/OptimizeInput" } } },
        },
        responses: {
          "200": { description: "Decision trace", content: { "application/x-ndjson": { schema: { type: "string" } } } },
          "429": { description: "Run quota reached" },
          "503": { description: "Compute service or method unavailable" },
        },
      },
    },
  },
} as const;
