<p align="center">
  <a href="http://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo-small.svg" width="120" alt="Nest Logo" /></a>
</p>

[circleci-image]: https://img.shields.io/circleci/build/github/nestjs/nest/master?token=abc123def456
[circleci-url]: https://circleci.com/gh/nestjs/nest

  <p align="center">A progressive <a href="http://nodejs.org" target="_blank">Node.js</a> framework for building efficient and scalable server-side applications.</p>
    <p align="center">
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/v/@nestjs/core.svg" alt="NPM Version" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/l/@nestjs/core.svg" alt="Package License" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/dm/@nestjs/common.svg" alt="NPM Downloads" /></a>
<a href="https://circleci.com/gh/nestjs/nest" target="_blank"><img src="https://img.shields.io/circleci/build/github/nestjs/nest/master" alt="CircleCI" /></a>
<a href="https://discord.gg/G7Qnnhy" target="_blank"><img src="https://img.shields.io/badge/discord-online-brightgreen.svg" alt="Discord"/></a>
<a href="https://opencollective.com/nest#backer" target="_blank"><img src="https://opencollective.com/nest/backers/badge.svg" alt="Backers on Open Collective" /></a>
<a href="https://opencollective.com/nest#sponsor" target="_blank"><img src="https://opencollective.com/nest/sponsors/badge.svg" alt="Sponsors on Open Collective" /></a>
  <a href="https://paypal.me/kamilmysliwiec" target="_blank"><img src="https://img.shields.io/badge/Donate-PayPal-ff3f59.svg" alt="Donate us"/></a>
    <a href="https://opencollective.com/nest#sponsor"  target="_blank"><img src="https://img.shields.io/badge/Support%20us-Open%20Collective-41B883.svg" alt="Support us"></a>
  <a href="https://twitter.com/nestframework" target="_blank"><img src="https://img.shields.io/twitter/follow/nestframework.svg?style=social&label=Follow" alt="Follow us on Twitter"></a>
</p>
  <!--[![Backers on Open Collective](https://opencollective.com/nest/backers/badge.svg)](https://opencollective.com/nest#backer)
  [![Sponsors on Open Collective](https://opencollective.com/nest/sponsors/badge.svg)](https://opencollective.com/nest#sponsor)-->

## Description

[Nest](https://github.com/nestjs/nest) framework TypeScript starter repository.

## Business License Verification Flow

The platform supports two verification methods for vendors:

1. Automatic (Ethiopia / eTrade scraping)
2. Manual (document upload & admin review)

### Automatic Flow (Ethiopia)
Endpoint: `POST /api/verification/check-license`

Request body:
```json
{ "businessLicenseNumber": "<license-number>" }
```

Behavior:
- Authenticated vendor (role VENDOR or DELIVERER) calls endpoint.
- Service posts the license number to the Ethiopian eTrade checker.
- Scrapes returned HTML table for: tradeName, legalCondition, capital, registeredDate, renewalDate, status.
- If status === `Valid`, user is updated:
  - `verificationStatus = APPROVED`
  - `verificationMethod = AUTOMATIC`
  - `businessLicenseInfo` JSON populated
  - `businessLicenseNumber` stored
- On failure (not found / not valid) a 404 NotFoundException is returned; user is not modified.

### Manual Flow (All Countries)
Endpoint: `POST /api/verification/request` (multipart form-data)

Field: `documents` (array of files: png, jpeg, jpg, pdf, doc, docx — max 10MB each)

Behavior:
- Stores uploaded files in DigitalOcean Spaces (path: `verification/<userId>/<timestamp>_<filename>`)
- Updates user:
  - `verificationStatus = PENDING`
  - `verificationDocuments = [ { url, name } ]`
- Admin back-office will later review and set APPROVED / REJECTED along with rejection reason.

### Relevant User Columns
| Column | Purpose |
|--------|---------|
| verificationStatus | UNVERIFIED | PENDING | APPROVED | REJECTED | SUSPENDED |
| verificationMethod | NONE | AUTOMATIC | MANUAL |
| businessLicenseInfo | JSON details returned from automatic checker |
| businessLicenseNumber | Raw license number provided by vendor |
| verificationDocuments | JSON array of uploaded manual docs |
| verificationRejectionReason | Admin supplied reason when REJECTED |
| verificationReviewedBy / verificationReviewedAt | Admin audit metadata |

### Startup Safety Patch (Temporary)
`AppService.onModuleInit` performs a lightweight column existence check for newly added verification columns. This was an interim resiliency measure when migrations were failing in production. It should be safe to remove once migrations run reliably.

### Testing
E2E-lite tests:
- `verification-check-license.e2e-spec.ts` (success & invalid license failure paths)

### Future Improvements
- Add rate limiting / debounce for repeated failed license lookups.
- Cache successful license lookups for 24h.
- Add admin endpoint to override automatic result.
- Country adapter pattern for future automatic verifiers (plug-in architecture).


## Project setup

```bash
$ yarn install
```

## Compile and run the project

```bash
# development
$ yarn run start

# watch mode
$ yarn run start:dev

# production mode
$ yarn run start:prod
```

## Production hardening (new)

This backend includes several production-oriented features.

### New endpoints

- Metrics (Prometheus): `GET /metrics` (requires `METRICS_ENABLED=true`)
- Health: `GET /api/health`, `GET /api/health/ready`, `GET /status`, `GET /pdown`

### Idempotency for writes

- For POST/PUT/PATCH requests, sending header `Idempotency-Key: <unique-id>` will cache successful 2xx responses for a short TTL (default 10 minutes) and return the same response for retries. Configure TTL with `IDEMPOTENCY_TTL_SEC`.

### Rate limiting

- Global rate limiting is enabled. For multi-instance deployments, provide Redis to make limits consistent across instances.
- Env: `REDIS_URL` or `REDIS_HOST/REDIS_PORT/REDIS_PASSWORD`, plus `THROTTLE_TTL` (ms), `THROTTLE_LIMIT` (requests per TTL).

### Metrics and observability

- `METRICS_ENABLED=true` to expose `/metrics` in Prometheus format. Protect this endpoint at the edge (e.g., /metrics only accessible internally).
- Optional Sentry error tracking: set `SENTRY_DSN` (and optionally `SENTRY_ENVIRONMENT`, `SENTRY_TRACES_SAMPLE_RATE`, `SENTRY_PROFILES_SAMPLE_RATE`). Sensitive fields and headers are scrubbed before sending.

### Feature flags and phased rollout

- A lightweight feature flag system driven by env vars and request headers:
  - Client should send `X-App-Version` (e.g., `1.2.3`), and optionally `X-Device-Id` for stable percentage bucketing.
  - Enable a flag with `FEATURE_<FLAG>_ENABLED=true`
  - Minimum version gate: `FEATURE_<FLAG>_MIN_VERSION=1.2.0`
  - Percentage rollout: `FEATURE_<FLAG>_PCT=25` (0–100)
  - Example: `FEATURE_NEW_CHECKOUT_ENABLED=true`, `FEATURE_NEW_CHECKOUT_MIN_VERSION=1.5.0`, `FEATURE_NEW_CHECKOUT_PCT=20`
- Usage in a controller:
  - Decorate a route with `@RequireFeature('NEW_CHECKOUT')` and apply the `FeatureFlagGuard` (either at controller or route level) if you want guard enforcement; otherwise, inject `FeatureFlagsService` and check programmatically.

### Database pool tuning

- TypeORM is configured with pool and timeout options; tune via env:
  - `DB_POOL_MAX` (default 10)
  - `DB_IDLE_TIMEOUT_MS` (default 10000)
  - `DB_CONNECT_TIMEOUT_MS` (default 5000)
  - `DB_STATEMENT_TIMEOUT_MS` (default 15000)
  - `DB_SLOW_MS` (default 300) for slow query logging threshold

### Migrations and startup

- Auto-migrations default to OFF in production. Set `AUTO_MIGRATE=true` only if you accept migrations at boot; otherwise run migrations in CI/CD before reload.

## Run tests

```bash
# unit tests
$ yarn run test

# e2e tests
$ yarn run test:e2e

# test coverage
$ yarn run test:cov
```

## Deployment

When you're ready to deploy your NestJS application to production, there are some key steps you can take to ensure it runs as efficiently as possible. Check out the [deployment documentation](https://docs.nestjs.com/deployment) for more information.

If you are looking for a cloud-based platform to deploy your NestJS application, check out [Mau](https://mau.nestjs.com), our official platform for deploying NestJS applications on AWS. Mau makes deployment straightforward and fast, requiring just a few simple steps:

```bash
$ yarn install -g @nestjs/mau
$ mau deploy
```

With Mau, you can deploy your application in just a few clicks, allowing you to focus on building features rather than managing infrastructure.

## Resources

Check out a few resources that may come in handy when working with NestJS:

- Visit the [NestJS Documentation](https://docs.nestjs.com) to learn more about the framework.
- For questions and support, please visit our [Discord channel](https://discord.gg/G7Qnnhy).
- To dive deeper and get more hands-on experience, check out our official video [courses](https://courses.nestjs.com/).
- Deploy your application to AWS with the help of [NestJS Mau](https://mau.nestjs.com) in just a few clicks.
- Visualize your application graph and interact with the NestJS application in real-time using [NestJS Devtools](https://devtools.nestjs.com).
- Need help with your project (part-time to full-time)? Check out our official [enterprise support](https://enterprise.nestjs.com).
- To stay in the loop and get updates, follow us on [X](https://x.com/nestframework) and [LinkedIn](https://linkedin.com/company/nestjs).
- Looking for a job, or have a job to offer? Check out our official [Jobs board](https://jobs.nestjs.com).

## Support

Nest is an MIT-licensed open source project. It can grow thanks to the sponsors and support by the amazing backers. If you'd like to join them, please [read more here](https://docs.nestjs.com/support).

## Stay in touch

- Author - [Kamil Myśliwiec](https://twitter.com/kammysliwiec)
- Website - [https://nestjs.com](https://nestjs.com/)
- Twitter - [@nestframework](https://twitter.com/nestframework)

## License

Nest is [MIT licensed](https://github.com/nestjs/nest/blob/master/LICENSE).
