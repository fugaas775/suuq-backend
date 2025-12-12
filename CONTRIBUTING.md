# Contributing to Suuq Backend

Thanks for helping improve the Suuq API. This guide covers the local workflow, database/migrations, testing, and handling secrets.

## Getting started

- Use Node.js 20+ (`.nvmrc` provided): `nvm use`.
- Install deps: `yarn install`.
- Copy or create `.env` (see sample in `README.md`). Keep secrets out of git.
- Start Postgres locally; Redis is optional but recommended for throttling/cache/idempotency consistency.

## Running the app

- Dev: `yarn start:dev` (http://localhost:3000).
- Build: `yarn build`; Prod run: `yarn start:prod` (or `pm2 start ecosystem.production.config.js --env production`).
- Swagger docs: enable with `SWAGGER_ENABLED=true` then visit `/api/docs`.

## Database & migrations

- Config is in `src/data-source.ts`; supports `DATABASE_URL` or `DB_*` envs.
- Apply migrations: `yarn typeorm migration:run`.
- Create migrations: `yarn typeorm migration:generate -n <Name>` (run after updating entities).
- Auto-migrate on startup is off in production by default; set `AUTO_MIGRATE=true` only if acceptable for that environment.

## Seeds

- Admin user: `yarn seed:admin` (or reset with `yarn seed:admin:reset`).
- Users: `yarn seed:user:create` / `yarn seed:user:reset`.
- Data: `yarn seed:countries`, `yarn seed:categories`, `yarn seed:products` as needed.

## Tests & quality

- Unit: `yarn test`; Watch: `yarn test:watch`; Coverage: `yarn test:cov`.
- E2E: `yarn test:e2e` (uses `test/jest-e2e.json`).
- Lint/format: `yarn lint` and `yarn format`.
- Git hooks: `yarn prepare` installs `simple-git-hooks`. Pre-commit runs `lint-staged` (Prettier + ESLint) and executes related Jest tests for staged specs. If hooks feel slow, stage fewer files or set `HUSKY=0` temporarily (but fix before pushing).

## Security & env handling

- Do not commit `.env` or secrets. Use `.env.local`/`.env.production` per environment and rotate leaked credentials immediately.
- Keep `ALLOWED_ORIGINS` scoped; prefer `TRUST_PROXY=1` behind a reverse proxy.
- Enable Sentry (`SENTRY_DSN`) in non-local envs for observability; PII is scrubbed in the client configuration.
- Protect `/metrics` at the edge when `METRICS_ENABLED=true`; admin endpoints already send `Cache-Control: no-store`.

## Pull requests

- Keep changes focused; include migration and seed updates when schema/data changes.
- Add/adjust tests for new logic; prefer fast unit coverage for business rules.
- Note any new env vars in `README.md` and deployment docs.
