# Booking Service API

A production-minded **REST API for a service-booking system**. It demonstrates API design, PostgreSQL persistence and migrations, JWT authentication, role-based access control, request validation, pagination, automated testing, and OpenAPI documentation.

> This project is intentionally scoped as a backend portfolio service. Customers can register and manage their own bookings; administrators manage the service catalog, oversee all bookings, and can permanently remove a booking when necessary.

## Highlights

- **TypeScript + Express** REST API organized by routes, services, repositories, and middleware.
- **PostgreSQL** schema with versioned SQL migrations and indexes for common booking queries.
- **JWT access tokens** with bcrypt password hashing; no password hashes are returned by the API.
- **Role-based access control** for `customer` and `admin` roles, plus ownership checks for bookings.
- **Zod validation** at the API boundary, including UUID, pagination, date-time, and field-range validation.
- **Pagination** for service and booking collection endpoints using `page` and `limit` query parameters.
- **Booking rules**: only active services can be booked, the start time must be in the future, and a customer cannot create overlapping active bookings.
- **OpenAPI 3.0** specification and interactive Swagger UI.
- **Automated tests** covering authentication, authorization, validation, service CRUD, booking lifecycle, conflicts, migrations, and error handling.

## Tech stack

| Layer | Technology |
| --- | --- |
| Runtime | Node.js 20+ / TypeScript |
| Web framework | Express |
| Database | PostgreSQL 16 |
| Database access | `pg` with parameterized SQL |
| Migrations | Versioned SQL files with a lightweight migration runner |
| Auth | `jsonwebtoken`, `bcryptjs` |
| Validation | Zod |
| API documentation | OpenAPI 3.0 + Swagger UI |
| Testing | Vitest, pg-mem, node-mocks-http |

## Project structure

```text
.
├── src/
│   ├── config/          # Environment parsing and safety checks
│   ├── db/              # Pool factory, migrator, versioned SQL migrations
│   ├── errors/          # Consistent application error model
│   ├── middleware/      # Authentication, RBAC, validation, error handling
│   ├── repositories/    # Parameterized PostgreSQL data-access layer
│   ├── routes/          # HTTP endpoint definitions and input schemas
│   ├── services/        # Booking and authentication business rules
│   ├── app.ts           # Express application factory
│   └── server.ts        # HTTP server bootstrap and graceful shutdown
├── tests/               # Unit and integration tests
├── openapi.yaml         # OpenAPI 3.0 contract
├── docker-compose.yml   # Local PostgreSQL service
└── .env.example         # Environment variable template
```

## Quick start

### Prerequisites

- Node.js **20 or newer**
- Docker Desktop (recommended for local PostgreSQL)

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment variables

```bash
cp .env.example .env
```

Change `JWT_SECRET` to a long, unique random value. Do **not** commit `.env`.

### 3. Start PostgreSQL

```bash
docker compose up -d
```

The included Compose file starts PostgreSQL 16 on `localhost:5432` with a `booking_service` database. Its local-only credentials match `.env.example`.

### 4. Run migrations

```bash
npm run db:migrate
```

The migrator records successfully applied files in `schema_migrations`, making repeated runs safe.

### 5. Start the API

```bash
npm run dev
```

The API starts at `http://localhost:3000`.

| Resource | URL |
| --- | --- |
| Health check | `GET http://localhost:3000/health` |
| Swagger UI | `http://localhost:3000/docs` |
| OpenAPI file | `http://localhost:3000/openapi.yaml` |

For a production-style build:

```bash
npm run build
npm start
```

## Environment variables

| Variable | Required | Default | Purpose |
| --- | --- | --- | --- |
| `NODE_ENV` | No | `development` | `development`, `test`, or `production` |
| `PORT` | No | `3000` | HTTP port |
| `DATABASE_URL` | No | Local PostgreSQL URL | PostgreSQL connection string |
| `JWT_SECRET` | **Yes in production** | Development-only value | Secret used to sign/verify access tokens |
| `JWT_EXPIRES_IN` | No | `1h` | JWT access-token lifetime |
| `CORS_ORIGIN` | No | `http://localhost:3000` | Allowed browser origin |

The application fails fast if the development JWT secret is used in `production`.

## Authentication and roles

### Register and log in

```bash
curl -X POST http://localhost:3000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"customer@example.com","password":"SecurePass123!","firstName":"Jane"}'

curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"customer@example.com","password":"SecurePass123!"}'
```

Both calls return an `accessToken`. Send it on protected endpoints:

```http
Authorization: Bearer <accessToken>
```

### Roles

| Role | Permissions |
| --- | --- |
| `customer` | Register/login, view active services, create bookings, view only their own bookings, amend their own **pending** bookings, and cancel their own bookings |
| `admin` | All customer read permissions; create/update/deactivate services; view/update all bookings; permanently delete a booking |

Public registration always creates a `customer`. This prevents privilege escalation. In a real deployment, provision the initial administrator through an audited back-office process, protected seed job, or direct database administration—not through a public endpoint. For local development only, after registering an account, you may promote it with:

```sql
UPDATE users SET role = 'admin' WHERE email = 'admin@example.com';
```

Log in again afterwards so the issued token contains the admin role.

## API endpoints

The complete contract, request/response shapes, and schemas live in [`openapi.yaml`](./openapi.yaml) and are rendered in Swagger UI at `/docs`.

| Method | Endpoint | Access | Description |
| --- | --- | --- | --- |
| `POST` | `/api/v1/auth/register` | Public | Register a customer account |
| `POST` | `/api/v1/auth/login` | Public | Obtain a JWT access token |
| `GET` | `/api/v1/auth/me` | Authenticated | Get current user |
| `GET` | `/api/v1/services` | Public | List active services (paginated) |
| `GET` | `/api/v1/services/:serviceId` | Public | Get an active service |
| `POST` | `/api/v1/services` | Admin | Create a service |
| `PATCH` | `/api/v1/services/:serviceId` | Admin | Update a service |
| `DELETE` | `/api/v1/services/:serviceId` | Admin | Soft-delete by deactivating a service |
| `GET` | `/api/v1/bookings` | Authenticated | List own bookings, or all bookings for admin (paginated) |
| `POST` | `/api/v1/bookings` | Authenticated | Create a booking for the current user |
| `GET` | `/api/v1/bookings/:bookingId` | Owner or admin | Get a booking |
| `PATCH` | `/api/v1/bookings/:bookingId` | Owner or admin | Update/cancel a booking within role rules |
| `DELETE` | `/api/v1/bookings/:bookingId` | Admin | Permanently delete a booking |

### Pagination

Collection endpoints use these query parameters:

```http
GET /api/v1/services?page=2&limit=20
GET /api/v1/bookings?page=1&limit=10&status=confirmed
```

`page` starts at `1`; `limit` defaults to `20` and is capped at `100`. Responses include metadata:

```json
{
  "data": [],
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 0,
    "totalPages": 0
  }
}
```

## Database design

The initial migration creates three application tables:

| Table | Key fields | Purpose |
| --- | --- | --- |
| `users` | `email` (unique), `password_hash`, `role` | Customer and administrator identities |
| `services` | `name`, `duration_minutes`, `price_cents`, `active` | Bookable catalog entries |
| `bookings` | `customer_id`, `service_id`, `starts_at`, `ends_at`, `status` | Reservations made by customers |

Foreign keys preserve referential integrity. Check constraints restrict roles, statuses, durations, prices, and booking date ordering. Indexes support customer-history, service-schedule, and status queries.

## Security notes

- Passwords are hashed with **bcrypt** (cost factor 12).
- Tokens are signed with a required 32+ character secret in production and have a configurable expiry.
- Database calls use `$1`-style **parameterized queries**, never string interpolation of untrusted data.
- Registration cannot assign roles; public users always become customers.
- RBAC is enforced separately from ownership checks so a customer cannot access another customer’s bookings.
- Request-size, validation, CORS, Helmet security headers, and centralized error responses are configured at the application boundary.
- Booking conflicts are checked before creation or rescheduling. For a horizontally scaled production deployment, protect this rule against concurrent writes with a PostgreSQL exclusion constraint or a transaction/locking strategy suited to the booking policy.

## Testing and quality checks

```bash
npm test          # Runs unit + integration tests and enforces coverage thresholds
npm run typecheck # Type-checks source files without emitting JavaScript
npm run lint      # Runs ESLint
npm run build     # Compiles TypeScript to dist/
```

The test suite uses a fresh in-memory PostgreSQL-compatible database for each scenario, runs the real SQL migrations, and injects requests into the actual Express middleware/router stack. This provides integration coverage without requiring a running test database. The latest local run produced **91.83% statements, 82.84% branches, 92.30% functions, and 91.83% lines**—above the enforced 80% statement/function/line targets and 75% branch target.

## Migration workflow

1. Add a new, ordered `.sql` file under `src/db/migrations/` (for example, `002_add_staff_notes.sql`).
2. Write forward-only schema changes.
3. Run `npm run db:migrate` locally and in your deployment pipeline.
4. Never modify a migration that has been applied to a shared environment.

## Suggested production improvements

- Use a managed PostgreSQL service with encrypted backups and TLS validation appropriate to your platform.
- Store `JWT_SECRET` in a managed secret store and implement key rotation.
- Add refresh-token rotation, password-reset flows, email verification, and rate limiting.
- Add audit logging for role changes and administrator actions.
- Enforce scheduling capacity/availability with an exclusion constraint or transactional locking.
- Add structured logs, metrics, tracing, health/readiness probes, and CI/CD migration gates.

## License

Add the license appropriate for your GitHub repository (for example, MIT) before publishing.
