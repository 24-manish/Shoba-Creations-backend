# Shoba Creations Backend

A basic REST backend for an e-commerce application. It provides a frontend-facing HTTP API, authentication, catalog browsing, cart management, checkout, and admin operations.

## Technology

- Node.js 20 or newer
- Express 5
- PostgreSQL
- `pg` for database access
- Zod for request validation
- `jsonwebtoken` for JWT authentication
- `bcryptjs` for password hashing
- Helmet for security headers
- CORS for frontend access
- Node's built-in test runner

## Architecture

The backend is split into clear layers:

```text
Frontend
   |
   v
Express routes
   |
   v
Controllers
   |
   v
Services
   |
   v
Repositories
   |
   v
PostgreSQL
```

### Request flow

1. A frontend sends an HTTP request to an Express route.
2. Middleware checks CORS, JSON parsing, authentication, roles, and validation.
3. A controller receives the validated request and sends it to a service.
4. A service applies business rules and coordinates repositories.
5. Repositories execute parameterized SQL queries.
6. The API returns a consistent JSON response.

This keeps frontend concerns separate from database concerns and prevents controllers from containing SQL.

### Middleware order in `src/app.js`

The order is load-bearing, because several of these depend on or constrain the
ones before them:

```text
1  disable x-powered-by
2  helmet            (CSP off, crossOriginResourcePolicy: cross-origin)
3  cors              (allow-list from CORS_ORIGIN, credentials: true)
4  cookieParser
5  express.json      (1 MB)
6  express.urlencoded(1 MB)
7  apiRateLimiter    (300/min per IP — everything below is subject to it)
8  /uploads          static, maxAge 7d, index off, dotfiles deny
9  GET /health
10 GET /api/health
11 CSRF check on /api (login and register exempt)
12 /api/auth, /api/cart, /api/wishlist, /api/orders, /api/admin
13 /api               mounted last, so it cannot shadow the above
14 notFoundHandler
15 errorHandler
```

Two consequences worth remembering: static image requests consume the rate-limit
budget, and CSRF is enforced on *every* non-GET `/api` path — including
`POST /api/auth/refresh`, `/logout` and `/logout-everywhere` — because it is
registered before the routers rather than inside them.

## Project structure

```text
Shoba Creations - Backend/
├── .env.example
├── .gitignore
├── BACKEND_OVERVIEW.md
├── package.json
├── package-lock.json
├── db/
│   ├── migrations/
│   │   ├── 001_initial_schema.sql
│   │   ├── 002_storefront_domain.sql
│   │   ├── 003_orders_payment_and_inventory.sql
│   │   └── 004_editorial_content.sql
│   └── seeds/
│       ├── 001_catalog.sql
│       └── 002_editorial_content.sql
├── scripts/
│   ├── migrate.js
│   └── seed.js
├── src/
│   ├── config/
│   │   └── env.js
│   ├── controllers/
│   │   ├── admin-controller.js
│   │   ├── auth-controller.js
│   │   ├── cart-controller.js
│   │   ├── category-controller.js
│   │   ├── editorial-controller.js
│   │   ├── order-controller.js
│   │   ├── product-controller.js
│   │   └── wishlist-controller.js
│   ├── db/
│   │   └── pool.js
│   ├── middleware/
│   │   ├── async-handler.js
│   │   ├── auth.js
│   │   ├── csrf.js
│   │   ├── error-handler.js
│   │   ├── rate-limit.js
│   │   ├── upload.js
│   │   └── validate.js
│   ├── repositories/
│   │   ├── cart-repository.js
│   │   ├── category-repository.js
│   │   ├── editorial-repository.js
│   │   ├── order-repository.js
│   │   ├── product-repository.js
│   │   ├── refresh-token-repository.js
│   │   ├── user-repository.js
│   │   └── wishlist-repository.js
│   ├── routes/
│   │   ├── admin-routes.js
│   │   ├── auth-routes.js
│   │   ├── cart-routes.js
│   │   ├── index.js
│   │   ├── order-routes.js
│   │   └── wishlist-routes.js
│   ├── services/
│   │   ├── auth-service.js
│   │   ├── cart-service.js
│   │   ├── category-service.js
│   │   ├── editorial-service.js
│   │   ├── order-service.js
│   │   ├── product-service.js
│   │   ├── session-service.js
│   │   ├── slug.js
│   │   └── wishlist-service.js
│   ├── app.js
│   ├── http.js
│   ├── schemas.js
│   └── server.js
├── tests/
│   ├── helpers/
│   │   ├── database.js
│   │   ├── env.js
│   │   └── server.js
│   ├── admin.test.js
│   ├── app.test.js
│   ├── auth.test.js
│   ├── cart.test.js
│   ├── catalogue.test.js
│   ├── editorial.test.js
│   ├── orders.test.js
│   └── wishlist.test.js
└── uploads/                  # created on boot if absent; not gitignored
```

Every layer follows the same four steps — `routes` parse and authorise,
`controllers` shape the HTTP response, `services` hold the rules and throw
`AppError`, `repositories` are the only files that contain SQL. `src/http.js`
holds the two envelope helpers shared by all controllers.

There is no `devDependencies` block and no linter, formatter or coverage tool
configured for this project.

## Prerequisites

Install:

- Node.js 20 or newer
- A running PostgreSQL database
- A PostgreSQL database and user that the application can access

The database must allow the `pgcrypto` extension. The initial migration enables it to generate UUID primary keys.

## Environment configuration

Copy the example environment file:

```powershell
Copy-Item .env.example .env
```

Then edit `.env`. `.env.example` already carries the full list with working
defaults; only `JWT_SECRET`, `DATABASE_URL` and the admin credentials really
need changing:

```dotenv
PORT=3000
NODE_ENV=development
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/shoba_creations
DATABASE_SSL=false
DATABASE_SCHEMA=public
JWT_SECRET=replace-with-a-long-random-secret
ACCESS_TOKEN_TTL=15m
REFRESH_TOKEN_TTL_DAYS=7
COOKIE_SECURE=false
CORS_ORIGIN=http://localhost:5173
UPLOAD_DIR=uploads
UPLOAD_MAX_BYTES=5242880
UPLOAD_MAX_FILES=6
FREE_SHIPPING_THRESHOLD=9999
STANDARD_SHIPPING_COST=299
EXPRESS_SHIPPING_COST=599
COD_HANDLING_FEE=50
ADMIN_NAME=Meera Chen
ADMIN_EMAIL=
ADMIN_PASSWORD=
```

### Environment variables

Every value is read in `src/config/env.js` and the resulting object is frozen.
There are **20** distinct variables. `NODE_ENV` appears more than once in that
file — it feeds `nodeEnv`, `isProduction`, the cookie prefix and the `secure`
fallback — but it is one variable.

| Variable | Required | Default | Description |
|---|---:|---|---|
| `DATABASE_URL` | Yes | — | PostgreSQL connection string. |
| `JWT_SECRET` | Yes | — | Secret used to sign and verify access tokens. |
| `PORT` | No | `3000` | HTTP port. Must be 1–65535. |
| `NODE_ENV` | No | `development` | Runtime environment. Drives the cookie prefix and `secure` flag. |
| `DATABASE_SSL` | No | `false` | Set to `true` when the database requires SSL. |
| `DATABASE_SCHEMA` | No | `public` | Schema the pool sets as `search_path`. Must match `^[a-z_][a-z0-9_]*$`. Tests use a separate schema rather than a separate database. |
| `ACCESS_TOKEN_TTL` | No | `15m` | Access-token lifetime. Accepts `s`, `m`, `h`, `d` suffixes. |
| `REFRESH_TOKEN_TTL_DAYS` | No | `7` | Refresh-token lifetime in days. |
| `COOKIE_SECURE` | No | `NODE_ENV=production` | Forces the `Secure` cookie flag on in development. |
| `CORS_ORIGIN` | No | `http://localhost:5173` | Allowed frontend origin. Multiple origins can be comma-separated. |
| `ADMIN_EMAIL` | For seed admin | — | Email the seed script uses to create or update the admin. |
| `ADMIN_NAME` | No | `Administrator` | Display name for the seeded admin. |
| `ADMIN_PASSWORD` | For seed admin | — | Admin password. Must be at least 8 characters. |
| `UPLOAD_DIR` | No | `uploads` | Directory for uploaded images, resolved against `process.cwd()`. |
| `UPLOAD_MAX_BYTES` | No | `5242880` | Per-file upload limit, 5 MB. |
| `UPLOAD_MAX_FILES` | No | `6` | Files per upload request. |
| `FREE_SHIPPING_THRESHOLD` | No | `9999` | Order subtotal at and above which shipping is free, in paise. |
| `STANDARD_SHIPPING_COST` | No | `299` | Standard shipping, in paise. |
| `EXPRESS_SHIPPING_COST` | No | `599` | Express shipping, in paise. |
| `COD_HANDLING_FEE` | No | `50` | Added when `payment_method` is `cod`, in paise. |

There is no `JWT_EXPIRES_IN`; the access-token lifetime is `ACCESS_TOKEN_TTL`.
Anything missing is a hard failure at boot, not a fallback — `assertServerConfig`
in `env.js` throws for `DATABASE_URL`, `JWT_SECRET`, an out-of-range `PORT` and
a malformed `DATABASE_SCHEMA`, and `src/server.js` calls it before `listen()`.

Use a long random value for `JWT_SECRET`. Do not commit `.env` to source control.

## Installation

From PowerShell:

```powershell
cd "D:\New folder\vs workspace\Shoba Creations - Backend"
npm install
```

## Database setup

The migration script creates a `schema_migrations` table and applies SQL files in filename order. A migration is applied only once.

Run migrations:

```powershell
npm run db:migrate
```

Run the catalog seed:

```powershell
npm run db:seed
```

The seed inserts the real Shoba Creations catalogue: seven categories and seventeen
products, complete with the editorial fields the storefront renders.

- Sarees, Jewellery, Beauty, Ethnic Wear, Handbags, Accessories, Gift Collections

The seed is re-runnable. Categories and products are upserted by slug and the gallery is
rebuilt, and `stock` plus `is_active` are restored to the documented baseline, so
replaying it undoes catalogue edits and any stock a test run consumed.

The five demo customer accounts all share the password `Shoba@2026`:

- `meera@example.com`
- `jon.bell@example.com`
- `aisha.patel@example.com`
- `orders@northlinestudio.co`
- `elena.rossi@example.com`

If `ADMIN_EMAIL` and `ADMIN_PASSWORD` are both set, the seed script also creates or updates an admin account. Leaving them empty skips admin creation. There is no API that can create an admin, so this is the only way to obtain one.

Run the migration and seed together:

```powershell
npm run db:migrate; npm run db:seed
```

## Running the server

Development mode with automatic restart:

```powershell
npm run dev
```

Normal production-style start:

```powershell
npm start
```

The default server URL is:

```text
http://localhost:3000
```

The health endpoint is:

```text
GET http://localhost:3000/health
```

A second health route is available at `/api/health`.

## API response format

The API answers **55 endpoints**: 2 health, 9 auth, 9 public catalogue and
content, 5 cart, 4 wishlist, 4 orders, and 22 admin. Verified by counting route
registrations in `src/routes/` plus the two inline health routes in `src/app.js`.
Adding a route without documenting it here makes the total stop matching.

Successful responses use:

```json
{
  "success": true,
  "data": {}
}
```

Errors use:

```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable message",
    "details": []
  }
}
```

The `details` field is included for validation failures when field-level issues are available.

## Authentication

Sessions are **cookie-based, not bearer tokens**. Login and registration set httpOnly
cookies and the browser sends them automatically; there is no `Authorization` header
and the server does not read one.

| Cookie | HttpOnly | Purpose |
|---|---|---|
| `sc_at` | yes | Short-lived access token (a JWT) |
| `sc_rt` | yes | Rotating refresh token |
| `sc_csrf` | **no** | Double-submit CSRF token, readable by JavaScript |

The names are prefixed with `__Host-` in production, which is what `env.cookiePrefix`
does.

A cross-origin client must therefore send `credentials: 'include'` on every request,
and the server must list the client's origin in `CORS_ORIGIN` (the default
`http://localhost:5173` matches the Vite dev server).

### CSRF

Every state-changing request under `/api` must echo the `sc_csrf` cookie in a header:

```http
X-CSRF-Token: <value of the sc_csrf cookie>
```

`GET /api/auth/csrf` issues the token. `POST /api/auth/login` and
`POST /api/auth/register` are the only exempt paths, because a first-time visitor has
no CSRF cookie yet. A missing or mismatched token is rejected with
`403 CSRF_TOKEN_INVALID`.

### Sessions

`POST /api/auth/refresh` re-issues the access cookie from the refresh cookie.
Refresh tokens rotate on every use and reuse is detected, which revokes the whole
token family. `POST /api/auth/logout-everywhere` revokes every session for the user.

Passwords are hashed with bcrypt before they are stored. Password hashes are never
returned by the API.

The `role` field is either:

- `customer`
- `admin`

Admin routes require both a valid session and the `admin` role.

### Rate limiting

Two independent limiters live in `src/middleware/rate-limit.js`. Both are
in-process `Map`s keyed by a generator function, both set `X-RateLimit-Limit` and
`X-RateLimit-Remaining` on every response, and both return `429 RATE_LIMITED`
with a `Retry-After` header once the budget is gone.

| Limiter | Window | Budget | Key | Applies to |
|---|---|---:|---|---|
| `apiRateLimiter` | 60 s | 300 | `req.ip` | Every request, mounted in `app.js` before `/uploads` |
| `authRateLimiter` | 15 min | 20 | `req.ip` + lowercased `req.body.email` | `POST /api/auth/login`, `POST /api/auth/register`, `POST /api/auth/change-password` |

Keying the auth limiter on the email as well as the address is what stops one
client from locking a known account out by spraying passwords at it from many
IPs.

The frontend depends on this budget in a way worth stating: `apiClient.ts` lists
`/api/auth/login` and `/api/auth/register` in `NO_REFRESH_PATHS`, so a `401`
from them is never refreshed-and-replayed. Without that exclusion a single wrong
password would send the login request twice and burn two of the twenty
attempts.

Both limiters are per-process. They are correct for one node and **not** correct
behind more than one instance, where each node keeps its own count. A shared
store such as Redis is required before this API is scaled horizontally.

There is no per-account lockout and no captcha, so the 20-per-15-minutes budget
is the entire brute-force defence.

## Public endpoints

### Health

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/health` | Basic server health check |
| `GET` | `/api/health` | API-prefixed health check |

### Categories

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/categories` | List all categories |

### Products

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/products` | List active products |
| `GET` | `/api/products/featured` | List the featured products |
| `GET` | `/api/products/:slug` | Get one active product by slug, with related products |

`GET /api/products` accepts these optional query parameters:

| Parameter | Description |
|---|---|
| `category` | Category slug, lowercased display name, or category UUID |
| `search` | Case-insensitive product name/description search |
| `sort` | `featured`, `newest`, `price_asc`, `price_desc` or `name` |
| `minPrice` | Inclusive lower price bound |
| `maxPrice` | Inclusive upper price bound |
| `inStock` | `true` to exclude sold-out products |
| `isFeatured` | `true` to return only featured products |
| `isNew` | `true` to return only newly arrived products |
| `page` | Page number, default `1` |
| `limit` | Results per page, default `20`, maximum `100` |

The public list never returns archived products. `includeInactive` is accepted by the
shared query schema for internal reuse, but the storefront path forces it to `false`
after applying the caller's filters, so it cannot be passed in from outside. On the
admin list it also defaults to `false`, so archived rows there require
`?includeInactive=true` explicitly.

Example:

```text
GET /api/products?category=sarees&search=silk&page=1&limit=10
```

Listings answer `{ items, pagination: { page, limit, total, totalPages } }`. The product
detail answers `{ product, related }`, so a detail page does not need a second request
for related items.

### Product and image shape

A product carries the catalogue and editorial fields (`price`, `compareAtPrice`,
`discountLabel`, `rating`, `reviewCount`, `stock`, `reorderPoint`, `colors`,
`colorOptions`, `sizes`, `fabric`, `occasion`, `collection`, `region`, `artisan`,
`details`, `care`, `tone`, `badge`, `isNew`, `isFeatured`, `isActive`, `category`,
`categorySlug`, `categoryId`) plus `images`:

```json
"images": [
  { "id": "uuid", "src": "/uploads/8f2c....png", "alt": "Kanjeevaram Silk Saree", "position": 0 }
]
```

`images` is always an array, ordered by `position`, and uses `src` as its only URL key
everywhere in the API. Upload, reorder and delete all answer with the full updated
product, so a client can replace its state from any of the three without re-fetching.
The storefront endpoints and the admin endpoints share that projection.

Cart and wishlist line items are deliberately leaner than a full product: a cart needs
`productId`, `name`, `slug`, `price`, `compareAtPrice`, `stock`, `isActive`, `category`
and an image, not the editorial copy.

### Editorial content

Stories, testimonials and site imagery live in the database rather than in the bundle, so
copy and imagery can be changed without a frontend deploy. Only published rows are ever
served publicly.

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/content/home` | Everything the homepage needs, in one request |
| `GET` | `/api/content/stories` | Published stories, newest first |
| `GET` | `/api/content/stories/:slug` | One published story |
| `GET` | `/api/content/testimonials` | Published testimonials |
| `GET` | `/api/content/images` | The four fixed site images, as an object |

The list endpoints (`stories`, `testimonials`) accept an optional `limit`.
`GET /api/content/images` accepts no parameters at all. The shapes are:

```json
"story":       { "id", "slug", "title", "excerpt", "body", "imageUrl", "imageAlt",
                 "readTime", "authorName", "sortOrder", "isPublished",
                 "publishedAt", "createdAt", "updatedAt" }
"testimonial": { "id", "name", "city", "quote", "rating", "imageUrl", "imageAlt",
                 "sortOrder", "isPublished", "createdAt", "updatedAt" }
"image":       { "id", "key", "url", "alt", "width", "height", "isActive",
                 "createdAt", "updatedAt" }
```

A testimonial carries an optional `userId` as well, which is `null` for seeded
rows.

`GET /api/content/home` answers `{ stories, testimonials, images }`, so a first paint
needs one request instead of three. An unknown story slug answers `404`
`STORY_NOT_FOUND`.

`GET /api/content/images` does **not** return a list of whatever rows exist. It
returns a fixed object of four named slots, remapped to camelCase by
`editorial-service.js`, with `null` for any slot that has no active row:

```json
{ "images": { "hero": {…}, "heroSecondary": {…}, "palace": {…}, "palaceSecondary": {…} } }
```

The database keys behind those four are `hero`, `hero_secondary`, `palace` and
`palace_secondary`. There is no dotted namespace and no per-category tile — a
client cannot ask for an arbitrary key, because the set of slots is compiled
into the service rather than read from the table.

The frontend reads `url` and `alt` from these rows, pins relative paths to
`VITE_API_BASE_URL`, and falls back to a generated tone-based placeholder only
when a slot is absent, so a missing image never breaks a layout.

## Authentication endpoints

All nine are mounted at `/api/auth`. Register, Login and Current user are
covered in detail below, with request bodies, responses and error codes; this
table is the complete set.

| Method | Endpoint | Description | Middleware |
|---|---|---|---|
| `POST` | `/api/auth/register` | Create an account, start a cookie session, merge guest state → `201` | `authRateLimiter`, `validate` |
| `POST` | `/api/auth/login` | Verify credentials, start a cookie session, merge guest state | `authRateLimiter`, `validate` |
| `POST` | `/api/auth/refresh` | Rotate the refresh token, re-issue `sc_at` and `sc_csrf` | CSRF |
| `POST` | `/api/auth/logout` | Revoke the refresh-token family, clear all three cookies | CSRF |
| `GET` | `/api/auth/csrf` | Issue a fresh double-submit token, returns `{ csrfToken }` | — (GET is exempt) |
| `GET` | `/api/auth/me` | Public profile plus the live cart and wishlist | `authenticate` |
| `PATCH` | `/api/auth/me` | Update `name`, `phone`, `city`. **Email is not accepted** | `authenticate`, `validate` |
| `POST` | `/api/auth/change-password` | Require the current password, rehash at cost 12, revoke every refresh token | `authenticate`, `authRateLimiter`, `validate` |
| `POST` | `/api/auth/logout-everywhere` | Revoke every refresh token for the user, clear cookies | `authenticate` |

Only `GET /api/auth/csrf` is exempt from CSRF by virtue of being a safe method;
`refresh`, `logout` and `logout-everywhere` are all POSTs and so must echo
`X-CSRF-Token` like any other write.

### Register

```http
POST /api/auth/register
Content-Type: application/json
```

Request body:

```json
{
  "name": "Customer Name",
  "email": "customer@example.com",
  "password": "password123"
}
```

Response data contains the public user. The session is set through the `sc_at`,
`sc_rt` and `sc_csrf` cookies rather than in the response body.

### Login

```http
POST /api/auth/login
Content-Type: application/json
```

Request body:

```json
{
  "email": "customer@example.com",
  "password": "password123"
}
```

Response data contains the public user and the session cookies are set. Login and
registration also accept a `guestState` object holding a guest cart or wishlist, which
is merged into the account.

#### Failed sign-in responses

This is the contract the storefront's login screens depend on:

| Condition | Status | `code` | `message` |
|---|---:|---|---|
| Email not registered | `401` | `INVALID_CREDENTIALS` | `Email or password is incorrect` |
| Password does not match | `401` | `INVALID_CREDENTIALS` | `Email or password is incorrect` |
| `users.is_active = false` | `403` | `ACCOUNT_DISABLED` | `This account has been deactivated` |
| Refresh token expired, revoked or replayed | `401` | `SESSION_EXPIRED` | `Your session has expired. Please sign in again.` |
| Wrong `currentPassword` on change-password | `401` | `INVALID_CREDENTIALS` | `Current password is incorrect` |
| Over the attempt budget | `429` | `RATE_LIMITED` | `Too many requests. Please try again shortly.` |

The two credential failures are deliberately indistinguishable. `authenticate()`
in `src/services/auth-service.js` looks the user up, and when there is no match
it still runs `bcrypt.compare` against a `DUMMY_HASH` before throwing, so an
unknown email and a wrong password cost the same wall-clock time as well as
returning the same status, code and message. Nothing downstream — including the
frontend — can use this endpoint to enumerate accounts.

`password` is validated as `min(1).max(72)` here rather than with the
registration minimum of 8. An 8-character floor on the login path would reject a
malformed password before the account was even consulted, which is a timing and
message difference an attacker could measure.

### Current user

```http
GET /api/auth/me
Cookie: sc_at=<access token>
```

Returns the authenticated user's public profile.

## Cart endpoints

All cart endpoints require authentication.

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/cart` | Get the current user's cart and total |
| `POST` | `/api/cart/items` | Add a product or increase its quantity |
| `PATCH` | `/api/cart/items` | Set an item's quantity |
| `DELETE` | `/api/cart/items/:productId` | Remove an item |
| `DELETE` | `/api/cart` | Empty the whole cart |

`PATCH /api/cart/items` takes `productId` in the **body**, not the path, alongside
`quantity`, `selectedColor` and `selectedSize`. A quantity of `0` removes the line.

`DELETE /api/cart/items/:productId` disambiguates variants with `?color=` and
`?size=` query parameters. Those two query parameters are read but not
schema-validated, so an unknown colour silently matches the line whose colour is
null rather than returning a validation error.

Quantity is capped at **10 per line** (`MAX_QUANTITY_PER_LINE` in
`cart-service.js`), which is stricter than the `1..99` the request schema
accepts: anything above 10 is refused with `400 QUANTITY_LIMIT_EXCEEDED`.

Add-item body:

```json
{
  "productId": "product-uuid",
  "quantity": 2
}
```

Update-item body:

```json
{
  "quantity": 3
}
```

The cart service checks that the product is active and that the requested quantity does not exceed available stock.

## Wishlist endpoints

All wishlist endpoints require authentication.

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/wishlist` | List saved products as `{ wishlist: { items, count, productIds } }` |
| `POST` | `/api/wishlist/:productId` | Save a product |
| `DELETE` | `/api/wishlist/:productId` | Unsave one product |
| `DELETE` | `/api/wishlist` | Clear the whole wishlist |

Saving is idempotent, because `wishlists` is keyed on the `(user_id, product_id)`
pair rather than a surrogate id — a second `POST` of the same product succeeds
instead of failing on a duplicate. A product that has since been archived can
still be saved; the storefront will simply not list it.

Removing a product that is not on the wishlist answers
`404 WISHLIST_ITEM_NOT_FOUND`, which is the one place this resource returns 404
for an absence that is expected to be possible.

`GET /api/wishlist` returns items in `created_at DESC` order and includes a
`productIds` array alongside the full `items`, so a client can diff the saved
set without walking every row. Unlike a cart line, a wishlist item **is** a full
product row — a saved product is rendered from the same components as a
catalogue tile, so it needs the whole shape.

## Order endpoints

All order endpoints require authentication.

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/orders` | Create an order from the current cart |
| `GET` | `/api/orders` | List the current user's orders |
| `GET` | `/api/orders/:orderNumber` | Get one of the current user's orders |
| `POST` | `/api/orders/:orderNumber/cancel` | Cancel one of the current user's orders |

The path parameter is the human order number (`SC-10482`), not a UUID. Asking
for another user's order number returns `404 ORDER_NOT_FOUND` rather than `403`,
so the endpoint does not confirm that an order exists.

Create-order body:

```json
{
  "shippingName": "Customer Name",
  "shippingEmail": "customer@example.com",
  "shippingAddress": "123 Example Street, City, Country"
}
```

Checkout runs in a PostgreSQL transaction. It:

1. Locks each product row `FOR UPDATE` and snapshots its price.
2. Calculates the total from those current prices, plus shipping and any COD
   handling fee.
3. Creates the order with an allocated `SC-` number.
4. Writes the line items, each carrying its own name, price and slug snapshot.
5. Decrements stock through a guarded update that will not go negative.
6. Writes an `inventory_movements` row per line, so every sale leaves an audit
   trail of `previous_stock`, `delta` and `resulting_stock`.
7. Clears the cart.
8. Rolls back the entire operation if any item cannot be purchased.

`POST /api/orders/:orderNumber/cancel` is the customer-facing counterpart: it
restores stock, writes a `cancellation` movement against each line, and is
idempotent — cancelling an already-cancelled order succeeds rather than
failing.

The first implementation does not integrate a payment provider. `payment_method`
(`upi`, `card`, `cod`) and `payment_status` (`pending`, `paid`, `refunded`,
`failed`) are recorded, but nothing is charged and nothing is confirmed.

## Admin endpoints

Every `/api/admin` endpoint requires an admin session. There are 22:

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/admin/dashboard` | Revenue and order aggregates, a 30-day series, recent orders, best sellers, low stock and catalogue totals — the whole admin home page in one request |
| `GET` | `/api/admin/low-stock` | Active products at or below their reorder point, for the inventory watch list |

The remaining twenty are grouped below.

### Products

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/admin/products` | List products (archived rows need `?includeInactive=true`) |
| `POST` | `/api/admin/products` | Create a product |
| `PATCH` | `/api/admin/products/:id` | Update a product |
| `DELETE` | `/api/admin/products/:id` | Soft-delete a product |
| `POST` | `/api/admin/products/:id/restore` | Un-archive a product |
| `DELETE` | `/api/admin/products/:id/permanent` | Permanently delete one product (query: `?force=true`) |
| `POST` | `/api/admin/products/bulk-archive` | Archive many products at once |
| `POST` | `/api/admin/products/bulk-restore` | Un-archive many products at once |
| `POST` | `/api/admin/products/bulk-purge` | Permanently delete many products at once |
| `POST` | `/api/admin/products/:id/images` | Upload images (multipart, field `images`) |
| `PUT` | `/api/admin/products/:id/images` | Reorder the gallery |
| `DELETE` | `/api/admin/products/:id/images/:imageId` | Delete one gallery image |

Archived products are excluded by default here, the same as the storefront;
`listAdmin` defaults `includeInactive` to `false`, so `?includeInactive=true` is
required to see them.

Delete is implemented as a soft delete by setting `is_active` to `false`; `POST /:id/restore` flips it back.

Permanent deletes are refused with `409 PRODUCT_IN_ORDER_HISTORY` while any `order_items` row references the product. Pass `force=true` to purge anyway — the order line keeps its own name/price snapshot, so a purge never rewrites history. Purging removes the product's files from disk, and the `product_images`, `wishlists`, `cart_items` and `inventory_movements` rows go with it via `ON DELETE CASCADE`. There is no `wishlist_items` table; the wishlist table is `wishlists`.

The three image routes all answer with the full updated product, so the editor
replaces its state from whichever one it called. Upload accepts up to
`UPLOAD_MAX_FILES` (6) files per request, each up to `UPLOAD_MAX_BYTES` (5 MB),
capped at 12 images per product. Reorder requires `imageIds` to be exactly this
product's complete set, so a partial list is rejected rather than silently
partially applied.

Bulk bodies:

```json
{ "productIds": ["product-uuid", "product-uuid"] }
```

`POST /api/admin/products/bulk-purge` additionally accepts `"force": true`. Bulk archive and bulk restore respond `{ "productIds": [...] }`; bulk purge responds `{ "products": [...] }`. A single order-linked product blocks the whole bulk purge (wholesale refusal) unless `force` is set.

Create-product body example:

```json
{
  "name": "Example Product",
  "description": "A product description",
  "price": 19.99,
  "stock": 20,
  "categoryId": "category-uuid",
  "imageUrl": "https://example.com/product.jpg",
  "isActive": true
}
```

SKUs are server-generated: create and update reject them from the request body and the product is assigned `SC-` followed by eight random uppercase characters, unique across the catalogue. The SKU is therefore read-only to admin clients.

### Categories

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/admin/categories` | List categories |
| `POST` | `/api/admin/categories` | Create a category |
| `PATCH` | `/api/admin/categories/:id` | Update a category |
| `DELETE` | `/api/admin/categories/:id` | Delete a category |

Deleting a category is **refused** with `409 CATEGORY_IN_USE` while any product
still references it. This is checked explicitly in `category-service.js` before
the delete is issued, so the `ON DELETE SET NULL` on the foreign key is never
reached through the API — an administrator must move or purge the products
first. Note that `POST /api/admin/categories` applies no request schema at all.

### Orders

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/admin/orders` | List all orders with pagination |
| `GET` | `/api/admin/orders/:orderNumber` | Get any order, with its legal next transitions |
| `PATCH` | `/api/admin/orders/:orderNumber/status` | Update order status |

Allowed order statuses:

```text
processing
packed
shipped
delivered
cancelled
```

There is no `pending` status. A new order starts at `processing`. The legal
transitions are:

```text
processing → packed | cancelled
packed     → shipped | cancelled
shipped    → delivered
delivered  → (terminal)
cancelled  → processing        (reinstatement)
```

Cancellation from `processing` or `packed` restores stock and writes the
matching inventory movement. `cancelled → processing` is the one move back from
a terminal state: it re-reserves the stock and records a movement with reason
`reinstatement`. Anything not in the table above is refused with
`409 INVALID_STATUS_TRANSITION`, so the transition rules live in exactly one
place (`order-service.js`) and the admin UI reads them from the same source via
`availableTransitions`.

Update body:

```json
{
  "status": "processing"
}
```

### Users

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/admin/users` | List public user information |

The admin user list never includes password hashes.

## Database schema

The initial migration creates the following tables.

### `users`

Stores account identity and authorization role.

- `id`: UUID primary key
- `email`: unique login email
- `password_hash`: bcrypt password hash
- `name`: display name
- `role`: `customer` or `admin`
- timestamps

### `categories`

Stores product categories.

- `id`: UUID primary key
- `name`: unique category name
- `slug`: unique URL-friendly identifier
- `description`
- timestamps

### `products`

Stores the catalog.

- `id`: UUID primary key
- `category_id`: optional category relationship
- `name`
- `slug`
- `description`
- `price`
- `stock`
- `image_url`
- `is_active`
- timestamps

### `carts`

Stores one cart per user.

- `id`: UUID primary key
- `user_id`: unique user relationship
- timestamps

### `cart_items`

Stores products and quantities in a cart.

- `id`: UUID primary key
- `cart_id`
- `product_id`
- `quantity`
- timestamps
- unique constraint on `(cart_id, product_id)`

### `orders`

Stores the order header and shipping details.

- `id`: UUID primary key
- `user_id`
- `status`
- `total`
- shipping name, email, and address
- timestamps

### `order_items`

Stores immutable product snapshots for an order.

- `id`: UUID primary key
- `order_id`
- optional `product_id`
- `product_name`
- `unit_price`
- `quantity`
- `line_total`

Keeping the product name and price on `order_items` preserves the order history if a product is later renamed, repriced, archived, or deleted.

The migrations create **fourteen** tables across four files. A fifteenth,
`schema_migrations`, is created by `scripts/migrate.js` itself before any
migration is applied, which is why it is listed last in this section.

The seven tables documented in detail above come from `001_initial_schema.sql`;
the rest are listed here because the storefront and admin UI both depend on them.

### `product_images`

One row per gallery image, ordered by `position`.

- `id`: UUID primary key
- `product_id`: cascades on delete
- `url`, `alt`
- `position`: `SMALLINT`, indexed with `product_id`
- `created_at`

### `wishlists`

The saved-products table. It is named `wishlists`, not `wishlist_items`, and it
has **no surrogate key** — the primary key is the pair itself:

- `(user_id, product_id)`: composite primary key, both cascading on delete
- `created_at`
- index on `(user_id, created_at DESC)` for ordered reads

Because it is keyed by pair, saving the same product twice is naturally
idempotent.

### `refresh_tokens`

Persisted refresh tokens, supporting rotation and reuse detection.

- `id`: UUID primary key
- `user_id`: cascades on delete
- `family_id`: groups a rotation chain; reuse detection revokes the whole family
- `token_hash`: SHA-256 hex, **unique** — the raw token is never stored
- `expires_at`, `revoked_at`
- `replaced_by_id`: self-reference, set when a token is rotated
- `user_agent`: recorded at issue time
- indexes on `user_id` and `family_id`

`src/server.js` prunes expired rows once at boot and then hourly, on an
unref'd timer that will not hold the process open.

### `inventory_movements`

The stock audit trail. Every sale, cancellation, reinstatement and manual
adjustment appends a row.

- `id`: UUID primary key
- `product_id`: cascades on delete
- `order_id`: optional, cascades to null, partial index where not null
- `delta`, `previous_stock`, `resulting_stock`
- `reason`: `adjustment`, `restock`, `sale`, `cancellation`, `reinstatement`, `seed`
- `note`, `actor_id`
- index on `(product_id, created_at DESC)`

### `site_images`

Editorial imagery, addressed by a fixed `key` rather than a slug.

- `id`: UUID primary key
- `key`: unique, constrained to `^[a-z0-9_]+$`
- `url`, `alt`
- `width`, `height`: optional, must be positive when present
- `is_active`, timestamps

### `editorial_stories`

- `id`: UUID primary key
- `slug`: unique
- `title`, `excerpt`, `body`
- `image_url`, `image_alt`, `read_time`, `author_name`
- `sort_order`, `is_published`, `published_at`
- A check constraint enforces `is_published = FALSE OR published_at IS NOT NULL`,
  so a published story can never lack a date to sort by.

### `testimonials`

- `id`: UUID primary key
- `user_id`: optional; seeded testimonials have no account behind them
- `name`, `city`, `quote`, `rating` (1–5)
- `image_url`, `image_alt`
- `sort_order`, `is_published`
- Uniqueness is an expression index over `(name, city, md5(quote))`, which makes
  the seed idempotent without a surrogate identity column.

### `schema_migrations`

- `name`: primary key
- `applied_at`

Written by `scripts/migrate.js`; its presence is what makes a re-run a no-op.

### Migration files

| File | Contents |
|---|---|
| `001_initial_schema.sql` | `pgcrypto`, and `users`, `categories`, `products`, `carts`, `cart_items`, `orders`, `order_items` |
| `002_storefront_domain.sql` | Deletes 001's template rows, adds the editorial product columns and a generated `search_vector` with a GIN index, creates `product_images`, `wishlists`, `refresh_tokens`, `inventory_movements`, adds the order sequence |
| `003_orders_payment_and_inventory.sql` | Renames `orders.city`/`phone`/`state`/`pincode` to `shipping_*`, adds `payment_status`, `note`, `order_items.product_slug`, and the `reinstatement` movement reason |
| `004_editorial_content.sql` | `site_images`, `editorial_stories`, `testimonials` |

## Validation and security

- Zod validates request bodies, query parameters, and route parameters.
- UUID route parameters must be valid UUIDs.
- Registration passwords must be between 8 and 72 characters. The **login**
  `password` is `min(1).max(72)` on purpose — see the login section.
- Product prices must be positive.
- Product stock cannot be negative.
- Cart quantities must be between 1 and 99 in the schema, and no more than 10
  in the service.
- SQL uses PostgreSQL parameters rather than concatenating user values.
- Helmet adds common HTTP security headers, with two exceptions worth knowing:
  `contentSecurityPolicy` is **disabled** (the API serves HTML-less JSON plus
  user uploads, and a strict CSP broke image loading in development), and
  `crossOriginResourcePolicy` is set to `cross-origin` so the storefront on a
  different origin can load `/uploads`.
- CORS limits browser origins using `CORS_ORIGIN`. A disallowed origin is
  rejected silently rather than raising, which produces a browser-side failure
  with no server log.
- Rate limiting: 300 requests per minute per IP, and 20 credential attempts per
  15 minutes per IP **and** email — see the Rate limiting section, including the
  single-process caveat.
- Protected routes require a valid session cookie.
- Admin routes check the session's role.
- Passwords and password hashes are not returned in API responses.
- Login responses are constant-time between a known and an unknown email.
- A few query parameters are read but not schema-validated, among them
  `?color=`/`?size=` on cart line removal, `?limit=` on
  `GET /api/admin/low-stock`, and `shippingId`/`paymentMethod` on `GET /api/cart`.
  They cannot reach SQL unbound, but they are not checked for shape.

## Frontend integration example

There is no token to store. Log in, keep the CSRF token in memory, and echo it on every
state-changing request:

```javascript
const API = 'http://localhost:3000';

// The CSRF cookie is readable by JavaScript precisely so it can be echoed back.
const readCsrfToken = () =>
  document.cookie
    .split('; ')
    .find((entry) => entry.startsWith('sc_csrf='))
    ?.split('=')[1];

await fetch(`${API}/api/auth/csrf`, { credentials: 'include' });

await fetch(`${API}/api/auth/login`, {
  method: 'POST',
  credentials: 'include',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: 'customer@example.com',
    password: 'password123'
  })
});
```

The session cookies are set by that response. Later writes must carry the token:

```javascript
await fetch(`${API}/api/cart/items`, {
  method: 'POST',
  credentials: 'include',
  headers: {
    'Content-Type': 'application/json',
    'X-CSRF-Token': readCsrfToken()
  },
  body: JSON.stringify({ productId, quantity: 1 })
});
```

A successful response is `{ success: true, data }`; a failure is
`{ success: false, error: { code, message, details } }` with a 4xx or 5xx status, so
check `response.ok` before reading `data`. When the access cookie expires, call
`POST /api/auth/refresh` once and replay the original request.

The CSRF cookie is absent on a first visit, which is why login and registration are
exempt. A client that only reads `data` will see `403 CSRF_TOKEN_INVALID` on every
write until it fetches `/api/auth/csrf`.

## Available npm scripts

| Command | Purpose |
|---|---|
| `npm start` | Start the server normally |
| `npm run dev` | Start with Node's watch mode |
| `npm test` | Run the automated tests |
| `npm run db:migrate` | Apply pending SQL migrations |
| `npm run db:seed` | Insert sample catalog data and optional admin |

## Tests and verification

`npm test` runs `node --test`, so there is no test framework to install. The
suite is 8 files, **151 tests, 484 assertions**:

| File | Tests | Assertions | Covers |
|---|---:|---:|---|
| `admin.test.js` | 25 | 113 | Dashboard, product CRUD, archive/restore/purge, bulk operations, categories, orders, users, low stock, image upload/reorder/delete |
| `orders.test.js` | 24 | 86 | Checkout, totals, stock effects, status transitions, cancellation |
| `cart.test.js` | 28 | 70 | Cart lines, variants, quantity limits, clearing |
| `auth.test.js` | 24 | 75 | Registration, login, invalid credentials, refresh rotation and reuse, CSRF, authorization, password change, guest merge |
| `wishlist.test.js` | 15 | 39 | Add, remove, clear, idempotency |
| `editorial.test.js` | 13 | 37 | Home bundle, stories, testimonials, site images |
| `catalogue.test.js` | 12 | 45 | Products, categories, filters, pagination, related products |
| `app.test.js` | 10 | 19 | Health, 404 handling, envelope shape, CORS |

Each backend suite rebuilds an isolated `sc_test` schema from the migrations and seed files, so
a run never depends on what a previous run left behind. The script pins
`--test-concurrency=1` because the suites share one schema.

Isolation is by **schema, not database**, because the application role may not
have `CREATEDB`. `tests/helpers/env.js` refuses to run unless
`TEST_DATABASE_SCHEMA` ends in `_test`, so pointing the suite at a production
schema is not possible by accident. It also force-sets `NODE_ENV=test`, the
schema, `JWT_SECRET`, `CORS_ORIGIN` and the admin credentials, and points
`UPLOAD_DIR` at a throwaway `mkdtemp` directory.

Because the limiters are in-process, the suites share one process's counters;
`resetRateLimiters()` is exported for exactly that reason and is called between
test files.

The tests run against a real PostgreSQL instance and a real HTTP server on an ephemeral
port, so `DATABASE_URL` must be configured and the database reachable.

The frontend has its own suite, run from `Shoba Creations - Frontend` with `npm test`
(Vitest): 57 tests across 4 files covering the API client, the guest bag, media URL
resolution, and the auth error-selection logic. Together the two suites cover the seam
between them.

## Current limitations

This backend does not include:

- Payment gateway integration
- Email verification or password reset
- Product image processing beyond format and signature validation
- Shipping-provider integration
- Tax, discount, and coupon calculation
- API documentation generation such as OpenAPI/Swagger

These can be added as separate services or modules without changing the existing
route-controller-service-repository separation.

Worth knowing beyond that list:

- **Rate limiting is per-process.** Correct on one node, wrong behind more than
  one. A shared store such as Redis is required before horizontal scaling.
- **No account lockout and no captcha**, so the 20-per-15-minutes auth budget is
  the only brute-force defence, and it does not survive a distributed attempt.
- **Dead code is present.** `src/controllers/product-controller.js` and
  `src/controllers/order-controller.js` each carry a full set of handlers that
  are not routed — `admin-controller.js` has its own equivalents, and only those
  are mounted. `product-controller.inventoryMovements` has no route at all, so
  there is no way to read the `inventory_movements` audit trail over the API.
  `editorial-repository` likewise implements full CRUD that nothing calls, and
  `refresh-token-repository.revokeById` is unused.
- **Unused schemas.** `cartQuote`, `productIdParams` and the top-level
  `guestState` schema in `src/schemas.js` are defined but never referenced.
- **Unused dependencies.** `cookie-signature` is declared in `package.json` and
  imported nowhere.
- **`POST /api/admin/categories` has no request schema**, so category names are
  not validated for length or shape at the API boundary.
- **Some query parameters are unvalidated**, listed under Validation and
  security above.
- `uploads/` is not in `.gitignore`, so committed working copies can accumulate
  uploaded images.

## Troubleshooting

### `DATABASE_URL is required`

Create `.env` from `.env.example` and set `DATABASE_URL`.

### `JWT_SECRET is required`

Set a long random `JWT_SECRET` in `.env` before starting the server.

### Database connection refused

Confirm that PostgreSQL is running, the host and port are correct, and the database exists. The application uses the migration scripts rather than requiring the `psql` command locally.

### `PORT must be between 1 and 65535`

`PORT` is parsed with `Number()`. A blank, non-numeric or out-of-range value
fails `assertServerConfig` before the server listens.

### `DATABASE_SCHEMA must be a valid PostgreSQL identifier`

The schema is interpolated into `CREATE SCHEMA` and `SET search_path`, so it is
constrained to `^[a-z_][a-z0-9_]*$`. The injection is not the reason for the
check — it is the fact that this string becomes an identifier.

### `403 CSRF_TOKEN_INVALID` on every write

Expected on a first visit. The client has no `sc_csrf` cookie until it calls
`GET /api/auth/csrf`. A client that only reads the `data` field will see this on
every write until it does.

### `401` from `POST /api/auth/login` with the right password

Usually a reused refresh token. Rotation is enforced: if a refresh token that
has already been rotated is presented again, the entire family is revoked and
the endpoint answers `401 SESSION_EXPIRED`. Sign in again from a clean client
rather than retrying.

### `429 RATE_LIMITED` on login

The `authRateLimiter` allows 20 attempts per 15 minutes per IP **and** email.
`Retry-After` carries the window in seconds. Because the key includes the email,
switching accounts does not reset the per-address budget, and running the
request through two addresses does not reset the per-account budget.

### Images 404 in the browser but the row exists

Uploaded files are served from `/uploads` on the API origin, not from the
frontend origin. The frontend resolves relative paths through `resolveMediaUrl`
for this reason. If an image is missing entirely, check `UPLOAD_DIR` — it is
resolved against `process.cwd()`, so starting the server from a different
directory changes where it looks.

### Duplicate migration errors

The migration runner records applied filenames in `schema_migrations`. Run `npm run db:migrate` after configuring the database.

### Frontend receives CORS errors

Set `CORS_ORIGIN` to the exact frontend origin, for example:

```dotenv
CORS_ORIGIN=http://localhost:5173
```

A disallowed origin is rejected silently rather than raising, so the browser
reports a CORS failure with nothing in the server log. Restart the server after
changing `.env`.
