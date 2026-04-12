# JubaRentals Platform

Production-ready scaffold for a rental marketplace built with:
- Node.js
- Express
- EJS
- MongoDB + Mongoose
- JWT auth in httpOnly cookies
- Cloudinary image uploads
- Role dashboards for super-admin, admin, agent, and user

## Included
- Public home page and listing pages
- Authentication API + pages
- Full listing CRUD controller
- Favorites, inquiries, reports, admin moderation
- Dashboard controllers and EJS pages
- Seed script with demo data

## Quick start
1. Copy `.env.example` to `.env`
2. Install packages

```bash
npm install
```

3. Start MongoDB locally or point `MONGODB_URI` to your database
4. Run seed

```bash
npm run seed
```

5. Start dev server

```bash
npm run dev
```

## Default seeded accounts
- Super Admin: `superadmin@jubarentals.com` / `Password123!`
- Admin: `admin@jubarentals.com` / `Password123!`
- Agent: `agent@jubarentals.com` / `Password123!`
- User: `user@jubarentals.com` / `Password123!`

## Notes
This is a strong scaffold with real wiring. You should still finish:
- Email verification / password reset
- More dashboard tables and charts
- Search maps / geo features
- Payments / subscriptions
- Automated tests
- CI/CD and deployment configs


## Added in this package revision
- Profile API: get/update current user profile and change password
- Admin API: list platform listings, assign agents, read settings, upsert settings
- Web listing pages: create, edit, and manage listings
- Reusable dashboard sidebar partial
- Expanded dashboard pages with quick actions and recent activity tables

## Useful routes
- `GET /dashboard`
- `GET /listings`
- `GET /listings/create`
- `GET /listings/manage`
- `GET /listings/:slug/edit`
- `GET /api/users/me`
- `PATCH /api/users/me`
- `POST /api/users/change-password`
- `GET /api/admin/listings`
- `PATCH /api/admin/listings/:id/assign-agent`
- `GET /api/admin/settings`

## Honest note
This project is now a much stronger starter and includes more missing modules, but it is still not a fully finished marketplace product. The next biggest upgrades would be password reset emails, map/geolocation search, payment flows, notifications, and automated tests.


## Added dashboard pages in v4
- `/dashboard/manage-listings`
- `/dashboard/inquiries`
- `/dashboard/reports`
- `/dashboard/users`
- `/dashboard/settings`
- `/dashboard/audit-logs`
- `/dashboard/favorites`
- `/dashboard/profile`
- `/dashboard/reviews`

## Added auth recovery UI pages in v4
- `/auth/forgot-password`
- `/auth/reset-password/:token`

## Deployment starter files
- `Dockerfile`
- `Procfile`
- `ecosystem.config.js`
- `deploy/nginx/jubarentals.conf`


## New in v5
- Real forgot-password backend with expiring reset tokens
- Real email verification backend with expiring verification tokens
- Optional SMTP delivery via nodemailer (logs email payloads when SMTP is not configured)
- Search + pagination on dashboard tables
- Web action forms for listing moderation, agent assignment, inquiry status updates, report resolution, review moderation, user role/status updates, and settings save


## Added in v6
- Cookie-based flash/toast feedback for dashboard and profile actions
- Dedicated detail pages for inquiries, reports, reviews, and users
- Dashboard profile forms now submit as regular CSRF-protected web forms
- Admin/operator actions redirect back to the page they were performed from


## Finalized in v7
- Real web auth form flows for login, register, logout, forgot-password, and reset-password
- Real web listing create, edit, and delete actions with Cloudinary upload handling
- Dashboard analytics page
- Bulk listing moderation actions for admins
- Validation helpers for auth and listing payloads

## Added in v8
- Starter billing system with Plan and Subscription models
- Billing dashboard page and API routes
- Map-ready listing coordinates and geosearch filters
- Media management actions for primary image and image deletion
- Rich HTML email templates for verification, password reset, and subscription events
- Field-level validation rendering on auth and listing forms
- Health check endpoint at `/healthz`
- Node test suite and GitHub Actions CI workflow
- `.dockerignore` for cleaner builds

