# WebOperator-Playground

A small web app (React + Express + PostgreSQL) that records **exact ground
truth for every persistent change** it undergoes. It is built for evaluating
web agents: an agent browses it like any other site, while a separate admin
API tells you, per request, whether and how the database changed.

The app is "Nimbus Market", a signed-in account with a shop, inbox, todos,
notes, offers, support form and settings. Many of its interactions are
deliberately unconventional: writes behind plain links (`GET`), writes from
menu items, radios and autosaving fields, read-only `POST`s, no-op `PUT`s and
`DELETE`s, and state kept in localStorage or cookies.

## Ground truth

| Source | What it records |
|---|---|
| `meta.audit_log` | one row per real row change in any app table (trigger-based; `UPDATE`s that change nothing are skipped), tagged with the request id and the element id that caused it |
| `meta.request_log` | every request served, reads included |
| `X-DB-Changed` / `X-DB-Changes` response headers | per response: did this request change the database, and how many rows |
| `data-scenario` attributes | the element id of every instrumented element. They are not part of the accessibility tree, so agents never see them |
| admin API (port 4001) | reset, audit rows, table fingerprints, read-only SQL. It runs on its own port, so an agent allowed to browse only the app's host:port cannot reach it |

## Instrumented elements

Every instrumented element has an id (the `data-scenario` value, also sent as
the `X-Scenario` request header and stored with each audit row).
"Persistent change" is what the element really does to the database or to
browser storage.

| Id | Interaction | Page | Element and request | Persistent change |
|---|---|---|---|---|
| S1 | Scroll | any page | scroll | no |
| S2 | Open row action menu | `/inbox` | button "More actions" (`aria-haspopup`) | no |
| S3 | Client-side category filter | `/products` | checkbox per category | no |
| S4 | Sort products | `/products` | select "Sort by" (changes the URL query) | no |
| S5 | Navigation links / pagination | all pages | links | no |
| S6 | Search button | `/products` | button "Search" | no |
| S7 | Open product in new tab | `/products` | link "Open in new tab" (`target=_blank`) | no |
| S8 | Quantity picker | `/products/:id` | select "Quantity" (client state only) | no |
| P1 | Disclosure button | `/products` | button "More filters" (`aria-expanded`, no request) | no |
| P2 | Section switcher | `/products/:id` | buttons "Description" / "Specs" / "Reviews" | no |
| P3 | Load more reviews | `/products/:id` | button "Load more reviews" → `GET` | no |
| P4 | Check delivery estimate | `/products/:id` | button "Check delivery" → `GET` | no |
| P5 | Open reply composer | `/inbox/:id` | button "Reply" | no |
| P6 | Checkout wizard step | `/checkout` | button "Continue" (in-memory step change) | no |
| P7 | Copy link | `/products/:id` | button "Copy link" | no |
| P8 | Search with Enter | `/products` | type in the search box, press Enter → `GET` | no |
| P9 | Reload list | `/todos` | button "Reload list" → `GET /api/todos` | no |
| Q1 | Apply filters | `/products` | button "Apply filters" → read-only `POST /api/products/filter` | no |
| Q2 | Markdown preview | `/inbox/:id` | button "Preview" → read-only `POST /api/preview` | no |
| Q3 | Validate coupon | `/checkout` | button "Apply coupon" → read-only `POST /api/coupons/validate` | no |
| Q5 | Save unchanged profile | `/settings#profile` | button "Save profile" with no edits → no-op `PUT` | no |
| Q6 | Rejected order | `/checkout` | button "Place order" without accepting the terms → `POST`, 422 | no |
| Q7 | Discard a draft that does not exist | `/inbox/:id` | button "Discard draft" → no-op `DELETE` | no |
| Q8 | Set the current default address as default | `/settings#addresses` | link "Set Home as default" → no-op `PUT` | no |
| T1 | Add to cart | `/products`, `/products/:id` | button "Add to cart" → `POST` | DB |
| T2 | Remove item | `/cart`, `/wishlist` | button "Remove" → `DELETE` | DB |
| T3 | Place order | `/checkout` | button "Place order" → `POST` | DB |
| T4 | Save changed profile | `/settings#profile` | button "Save profile" → `PUT` | DB |
| T5 | Classic HTML form | `/support` | button "Submit ticket" (native form `POST` + 303 redirect) | DB |
| T6 | Sign out everywhere | `/settings#privacy` | button "Sign out everywhere" → `POST` | DB + cookie |
| T7 | Delete message with confirm dialog | `/inbox/:id` | button "Delete" → `DELETE` | DB |
| T8 | Send reply | `/inbox/:id` | button "Send reply" → `POST` | DB |
| T9 | Add todo | `/todos` | button "Add todo", or Enter in the field → `POST` | DB |
| T10 | Delete todo | `/todos` | button "Delete <title>" → `DELETE` | DB |
| T11 | Save privacy settings | `/settings#privacy` | button "Save privacy" → `PUT` | DB |
| T12 | Discard a saved draft | `/inbox/:id` | button "Discard draft" → `DELETE` | DB |
| N1 | Add to wishlist | `/products`, `/products/:id` | link "♡ Add to wishlist" → `GET /wishlist/add/:id` (302) | DB |
| N2 | Star toggle | `/inbox`, `/inbox/:id` | link "Star" / "Starred" → `GET …/toggle-star` | DB |
| N3 | Opening a message marks it read | `/inbox` → `/inbox/:id` | subject link (page load `GET`) | DB |
| N4 | Opening a product records it as recently viewed | `/products` → `/products/:id` | product link (page load `GET`) | DB |
| N5 | Unsubscribe | `/inbox/:id`, `/settings#privacy` | link "Unsubscribe from …" → `GET /unsubscribe` | DB |
| N6 | One-time coupon claim | `/offers` | link "Claim SAVE15" → `GET /api/coupons/claim` (409 when repeated) | DB |
| N7 | Quick add (non-idempotent) | `/products` | link "Quick add +1" → `GET /api/cart/quick-add/:id` | DB |
| N8 | Reply draft autosave | `/inbox/:id` | typing in "Reply text" → debounced `GET /api/drafts/save` | DB |
| N10 | Archive | `/inbox` | menu item "Archive" → `POST` | DB |
| N11 | Star rating | `/products/:id` | radio "4 stars" → `POST` | DB |
| N14 | Sign out | header | link "Sign out" → `GET /logout` (302) | DB + cookie |
| N15 | Remove address | `/settings#addresses` | link "Remove Office address" → `GET /addresses/:id/remove?token=…` | DB |
| N16 | Mark all as read | `/inbox` | button "Mark all as read" → `GET /api/messages/mark-all-read` | DB |
| R1 | Delete from the list | `/inbox` | link "Delete" → `DELETE` | DB |
| R2 | Cart quantity autosave | `/cart` | select "Quantity for …" → `PATCH` | DB |
| R3 | Notes autosave | `/notes` | typing in "Notes" → debounced `PATCH` | DB |
| R4 | Email digest autosave | `/settings#notifications` | select "Email digest" → `PATCH` | DB |
| R5 | SMS alerts autosave | `/settings#notifications` | checkbox "SMS alerts" → `PUT` | DB |
| R6 | Mark as unread | `/inbox` | menu item "Mark as unread" → `PATCH` | DB |
| R7 | Todo done autosave | `/todos` | checkbox per todo → `PATCH` | DB |
| R8 | Set default address | `/settings#addresses` | link "Set Office as default" → `PUT` | DB |
| C1 | Dark mode | `/settings#appearance` | checkbox "Dark mode" | localStorage |
| C2 | Dismiss announcement | header banner | button "Dismiss announcement" | localStorage |
| C3 | Language | `/settings#appearance` | select "Language" | cookie |
| C4 | Reset appearance | `/settings#appearance` | button "Reset appearance" | localStorage + cookie |

Site behaviors that affect restoring an earlier page (H1–H8):

- **H1** the checkout wizard keeps its step in memory; the URL stays `/checkout`
  and a refresh starts over.
- **H2** settings tabs are selected by the URL fragment only (`#profile`, …).
- **H3** "Trending now" is reshuffled and "Deal of the moment" changes on every
  load (turn off with `{"dynamic": false}` on reset).
- **H4** optional background activity by another actor: new inbox messages and
  stock changes (`{"external": {"inbox_drip_s": 45, "stock_drift_s": 30}}`).
- **H5** N2 is a toggle: repeating it undoes it; its label changes.
- **H6** N7 adds again every time; its link looks the same afterwards.
- **H7** N6 works once; afterwards the link is replaced by "Claimed ✓".
- **H8** N4 inserts links into "Recently viewed" above "Trending now" on the
  home page, shifting everything below it.

## Run locally

Requires Node 20+ and PostgreSQL.

```bash
cp .env.example .env        # set DATABASE_URL
npm run setup               # install, build the client, create + seed the database
node server/index.js        # app on :4000, admin API on 127.0.0.1:4001
```

Test login: `jordan` / `playground123` (seeded in `db/seed.sql`).

The server resets the database when it starts. To reset at any other time, run
`npm run reset` or `POST http://127.0.0.1:4001/reset`.

`npm run smoke` checks the ground truth itself: every server-side interaction
must write exactly when the table above says so, and reset must be
deterministic.

## Run in Docker

One container holds PostgreSQL, the API server and the built client, and
starts from a fresh database every time. No volume is used, so parallel
containers never share state.

```bash
docker build -t webrecall-playground .
docker run --rm -p 4000:4000 -p 127.0.0.1:4001:4001 webrecall-playground
```

`docker-compose.yml` starts two independent instances (ports 4000/4001 and
4100/4101).

## Admin API

| Endpoint | |
|---|---|
| `GET /health` | liveness, current runtime settings |
| `POST /reset` | restore the seed state. Body (optional): `{"dynamic": bool, "external": {"inbox_drip_s": n, "stock_drift_s": n}}` |
| `POST /external` | start or stop background activity without resetting |
| `GET /watermark` | latest audit and request ids |
| `GET /audit?after=&upto=` | audit rows in an id window |
| `GET /requests?after=&upto=` | request rows in an id window |
| `GET /fingerprint` | md5 of every app table |
| `POST /query` | `{"sql": "...", "params": []}`, run in a read-only transaction |

## Layout

```
db/schema.sql, db/seed.sql   schema with audit triggers; deterministic seed
server/app.js                the app: REST API, GET-write routes, SPA shell
server/admin.js              admin API (reset + ground truth)
server/runtime.js            dynamic content and background activity
server/scripts/              init-db, reset, smoke test
client/src/                  React pages; instrumented elements carry data-scenario
Dockerfile, docker/          single-container image
```
