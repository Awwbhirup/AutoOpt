# web

The application tier. Owns authentication, tenancy, and all persistence.

The optimization engine is a Python package and the compute service in
`../service` is a stateless HTTP surface over it. Nothing here does any
optimizing; it decides who may ask for one, asks, and keeps the answer.

## Setup

```bash
npm install
cp .env.example .env     # then fill in the values
npx prisma migrate dev
npm run dev
```

`.env` needs a Postgres connection string, an Auth.js secret, and GitHub OAuth
credentials. `.env.example` says where each one comes from.

The compute service has to be running for anything to be optimized:

```bash
make serve               # from the repository root, listens on :8000
```

## Layout

| path | what is in it |
|---|---|
| `app/` | routes, server actions, route handlers |
| `lib/authorize.ts` | every permission decision, in one function |
| `prisma/schema.prisma` | the whole data model |

## Checks

```bash
npm test                 # vitest
npm run typecheck        # tsc --noEmit
npm run lint             # eslint
```

## Known issues

`npm audit` reports a stack-exhaustion advisory in `deepmerge-ts`, reached
through `@prisma/config`. It is a build-time dependency of the Prisma CLI and
does not enter the application bundle. The only remedy npm offers is a
downgrade to an older Prisma, so it is being left alone and tracked here.
