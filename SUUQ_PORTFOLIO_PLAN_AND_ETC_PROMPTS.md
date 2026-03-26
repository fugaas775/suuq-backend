# Suuq App Portfolio Plan And ETC VS Code AI Prompts

## Saved Plan

### Plan: Suuq App Portfolio

Recommended direction: do not create many small apps just because the backend can support them. Create one surface per real operator persona, in this order.

### Recommended apps and sites

#### Vendor Portal

Purpose: seller-facing operations for catalog, orders, staff, payouts, moderation, and performance.

Format: web first.

Why next:

- the backend already has strong vendor and vendor-staff capability
- vendors usually work better on desktop for bulk product and operational tasks
- this is a clearer commercial surface than building more internal tools

#### Supplier / B2B Portal

Purpose: procurement-side portal for wholesalers, manufacturers, and distributors.

Format: web first.

Why:

- the backend already supports supplier profiles, supplier offers, purchase orders, acknowledgements, receipt discrepancies, and procurement lifecycle flows
- this is a separate persona from marketplace vendors
- it unlocks Suuq as a supply network, not only a consumer marketplace

#### POS S

Purpose: branch-level retail operations.

Format: app plus tablet-friendly web where needed.

Why:

- repo memory and backend structure strongly support POS sync, branch inventory, replenishment, purchase orders, branch staff, HR attendance, and retail entitlements
- this is the most strategic business product after the marketplace
- it produces the operational data needed for later intelligence products

#### Retail HQ Console

Purpose: tenant-level oversight for multi-branch retailers.

Format: web.

Why:

- branch managers and HQ operators need dashboards, compliance, procurement oversight, sync health, accounting exceptions, and command-center workflows
- this should be part of the POS S product line, not a separate unrelated product
- it matches the retail ops and network-summary surfaces already present in the backend

#### Ops / Warehouse App

Purpose: receiving, discrepancy handling, stock movement, branch transfer, and possibly scan-first workflows.

Format: mobile or rugged tablet app.

Why:

- the backend already supports receipt events, discrepancies, branch inventory, and transfers
- this becomes useful after POS S and supplier flows are active
- it is operationally distinct from consumer, vendor, and admin apps

#### AI Inventory S

Purpose: forecasting, reorder recommendations, dead-stock alerts, and anomaly detection.

Format: mostly web inside Retail HQ first, possibly later as a branded module.

Why later:

- the roadmap in repo memory already suggests this should come after reliable POS and inventory data
- building it earlier would create weak recommendations and low trust

#### Public Marketing / Onboarding Site

Purpose: explain products, capture leads, onboard vendors, suppliers, and retailers.

Format: website.

Why:

- useful for trust and acquisition
- should be lightweight and parallel to product rollout, not your main build priority

### What I would not create yet

#### Separate deliverer app

Reason:

- the backend has some delivery support, but it does not look like the highest-value standalone surface compared with vendor, supplier, and retail ops

#### Separate finance app

Reason:

- wallet, payouts, and credit look better as modules inside admin, vendor, or retail HQ for now

#### Separate chat app

Reason:

- chat is a supporting workflow, not a standalone product line

#### More admin clones

Reason:

- Suuq Admin already covers governance, finance, audit, notifications, analytics, ads, vendors, users, and B2B oversight

### Best portfolio shape

- Consumer App
- Suuq Admin
- Vendor Portal
- Supplier / B2B Portal
- POS S
- Retail HQ Console
- Ops / Warehouse App
- AI Inventory S
- Public marketing site

### Priority order

- Vendor Portal
- Supplier / B2B Portal
- POS S plus Retail HQ Console
- Ops / Warehouse App
- AI Inventory S
- Marketing site

### Reasoning

- Consumer and admin already exist.
- The backend most clearly supports four additional operator personas: sellers, suppliers, branch operators, and retail HQ operators.
- POS S and procurement are the strongest business expansion path in the repo roadmaps.
- AI should come after the data-producing apps, not before them.

### Recommendation

If you want the tightest, most commercially sensible roadmap, build:

- Vendor Portal
- Supplier / B2B Portal
- POS S with Retail HQ Console
- AI Inventory S later

If you want, this can later be expanded into a strict rollout roadmap with app name, target users, MVP features, backend readiness, business priority, and recommended tech stack per app.

## ETC VS Code AI Prompts

Use these prompts inside the B2B Portal and POS S codebases. Each prompt is written to make the AI inspect the current frontend structure first, then implement changes that match the Suuq backend instead of inventing new contracts.

---

## Prompt 1: B2B Portal Procurement Command Center

You are working on the Suuq Supplier / B2B Portal web app.

First inspect the current frontend structure before editing anything. Identify the existing route layout, API client pattern, auth/session handling, shared table components, filters, mutation flow, and notification system. Do not assume file names or architecture. Reuse the current frontend structure and naming unless a contract mismatch forces a targeted change.

Goal:

Build or harden the procurement command-center experience for supplier and buyer-side B2B operations so the portal reflects the real Suuq backend lifecycle instead of a generic dashboard.

Backend-aligned context:

- Suuq is extending one shared NestJS backend, not creating a separate backend for the B2B portal.
- The backend direction already supports supplier profiles, supplier offers, purchase orders, acknowledgements, goods receipt, discrepancy handling, webhook replay governance, and admin B2B oversight.
- The portal should behave like an operational surface for procurement lifecycle management, not a marketing site.

Implementation requirements:

1. Inspect the current B2B portal and identify the modules or screens responsible for:
   - supplier dashboard landing page
   - purchase order list
   - purchase order detail
   - procurement status filters
   - action panels or workflow sidebars
   - API data fetching and mutation hooks
   - CSV export or table download flows

2. Implement or refine these procurement views:
   - purchase order queue with filters for draft, submitted, acknowledged, picking, partially fulfilled, shipped, received, cancelled, and reconciled
   - detail page with timeline, supplier metadata, line items, quantities, price totals, and discrepancy summary
   - action cards for acknowledge, reject, mark picking, mark shipped, confirm receipt, and record discrepancy when those actions are supported by backend responses
   - export-ready table layouts for finance and ops handoff

3. Client behavior rules:
   - derive available actions from backend action metadata when present instead of hardcoding every button state
   - preserve audit-safe read-only rendering for records that are no longer mutable
   - keep filters and pagination in the URL if the current app already follows that pattern
   - do not create fake status mappings that conflict with backend procurement lifecycle states

4. UX rules:
   - this is a workbench, not a consumer storefront
   - prioritize dense but readable tables, strong status labeling, exception visibility, and fast operator scanning
   - support desktop-first layout without breaking tablet widths

5. Deliverables:
   - updated procurement list and detail flows
   - reusable status badge mapping
   - action handling aligned to backend contracts
   - clear loading, empty, and failure states

Verification:

- Trace one purchase order from list to detail to action mutation and confirm the UI rehydrates from server state after each mutation.
- Verify filters, status badges, totals, and discrepancy states stay consistent between list and detail.
- Confirm there are no hardcoded mock procurement records left in the flow.

At the end, provide a concise summary of what you changed, which files you touched, which backend assumptions you made, and any contract gaps that still need backend confirmation.

---

## Prompt 2: B2B Portal Supplier Catalog And Offer Management

You are working on the Suuq Supplier / B2B Portal web app.

Inspect the current codebase first and find the existing catalog, product, offer, import, and form modules before making changes. Preserve the app's current component and state-management patterns.

Goal:

Implement or harden the supplier-side catalog and offer workflow so suppliers can manage wholesale offers on top of canonical products rather than creating duplicate product records.

Backend-aligned context:

- Recommended backend model: canonical product identity plus many supplier offers, not duplicate products per supplier.
- Supplier offers should carry commercial fields such as wholesale price, MOQ, lead time, availability, fulfillment region, and optional contract metadata.
- Initial onboarding and import flows should favor controlled CSV or spreadsheet import with validation instead of assuming live ERP integrations.

Implementation requirements:

1. Identify the frontend modules for:
   - product or catalog listing
   - supplier offer form
   - import/upload flow
   - validation/error display
   - bulk actions or spreadsheet preview

2. Build or refine these screens:
   - supplier catalog view showing canonical product identity separately from supplier-specific offer data
   - offer create/edit form with wholesale pricing, MOQ, lead time, availability, region, and optional notes/contract fields
   - import review flow with row-level validation feedback, duplicate detection, and status summary
   - supplier offer detail or side panel that clearly distinguishes immutable product identity from editable offer fields

3. Guardrails:
   - do not design the UI around duplicate product creation if the backend already treats offers as a layer on top of products
   - centralize DTO mapping so list, detail, and form edit states use one consistent contract
   - preserve backend validation errors instead of flattening them into a generic toast only

4. UX rules:
   - optimize for spreadsheet-driven operators
   - surface errors in-place and in a top-level summary
   - make price, MOQ, lead time, and offer status visually scannable in tables

Verification:

- Create or edit an offer and confirm the list view, detail view, and form defaults all agree on the same field mapping.
- Upload a sample import file and confirm row-level validation can be understood without opening browser devtools.
- Verify no view mislabels canonical product fields as supplier-owned fields.

At the end, return a short implementation summary, touched files, reusable components introduced, and any backend fields that were missing or ambiguous.

---

## Prompt 3: POS S Branch Operations Dashboard

You are working on the Suuq POS S web portal.

Inspect the current app structure before editing anything. Identify the route system, shell layout, branch context handling, API abstraction, data-table components, chart or metrics components, and permission model already used in the app.

Goal:

Build or harden the branch-level POS operations dashboard so it reflects the real retail ops backend and feels like an operator console for branch staff.

Backend-aligned context:

- Retail OS monetization is tenant-scoped and entitlement-driven.
- `POS_CORE` already has first-class backend support for branch POS operations, tenant network summaries, export flows, throughput metrics, payment recovery, delayed fulfillment queues, and exception drilldowns.
- POS S should be branch-operations-first, not an e-commerce storefront clone.

Implementation requirements:

1. Identify the frontend modules responsible for:
   - dashboard landing page
   - branch selector or tenant context
   - POS operations list
   - exception queue
   - order drilldown
   - export actions
   - auth or permission gating

2. Implement or refine these screens:
   - branch dashboard with daily throughput, payment recovery, delayed fulfillment, and staffing-aware operational health indicators
   - POS operations list with date filters, status filters, and branch-aware summaries
   - exception queue for failed payment, payment review, and delayed fulfillment classes
   - order detail drilldown with operational metadata and action hints

3. Contract rules:
   - use backend action hints where available instead of hardcoding every remediation action
   - keep branch context explicit in data fetches and navigation state
   - preserve export flows for spreadsheet triage where the backend supports export endpoints
   - do not collapse payment issues, fulfillment delay, and staffing issues into one undifferentiated alert count

4. UX rules:
   - dense, tablet-friendly, operations-first layout
   - strong hierarchy for exception severity and queue ownership
   - fast scan for branch managers during active store hours

Verification:

- Confirm one operator can move from dashboard to exception queue to order drilldown without losing branch context.
- Confirm metrics, queue counts, and drilldown states are pulled from real API data rather than local aggregate guesses.
- Verify the branch dashboard remains usable on tablet widths.

At the end, summarize the branch operations features implemented, touched files, unresolved API assumptions, and any missing empty/error/loading states you found and fixed.

---

## Prompt 4: POS S Inventory, Replenishment, And Transfer Workflows

You are working on the Suuq POS S web portal.

Inspect the current inventory, stock, replenishment, and purchasing modules first. Reuse existing architecture and shared form/table patterns. Fix the root contract mismatches instead of adding one-off adapters.

Goal:

Implement or harden branch inventory and replenishment workflows so POS S becomes a real branch operations surface and feeds later HQ and AI workflows with reliable data.

Backend-aligned context:

- Branch inventory includes projection fields such as reserved online, reserved store ops, inbound open purchase orders, outbound transfers, safety stock, available to sell, and version.
- Retail ops replenishment already exposes review and re-evaluation flows.
- The backend direction supports stock movement, branch transfer, purchase-order lifecycle integration, and inventory-ledger-driven availability.

Implementation requirements:

1. Identify the current modules for:
   - branch inventory list
   - stock detail
   - replenishment drafts or reorder suggestions
   - purchase order creation from branch context
   - branch transfer or movement logging

2. Build or refine these capabilities:
   - inventory table showing availability-related fields in an operator-friendly layout
   - replenishment queue with blocked reason visibility and re-evaluate action where supported
   - branch stock detail view that separates on-hand, reserved, inbound, outbound, safety stock, and available-to-sell numbers clearly
   - purchase-order or transfer initiation flow from stock exceptions where backend routes already exist

3. Guardrails:
   - do not reduce inventory state to a single quantity field if the backend exposes projected availability fields
   - preserve optimistic UX only where rollback is safe; otherwise rehydrate from server after mutations
   - centralize inventory DTO mapping and status formatting

Verification:

- Compare list and detail views for the same SKU and confirm availability numbers match.
- Trigger a replenishment action and confirm the post-mutation state is re-fetched from the backend.
- Verify blocked reasons and re-evaluation outcomes render clearly when present.

At the end, provide a short summary of completed inventory flows, touched files, and any backend endpoints or DTO fields that still need confirmation.

---

## Prompt 5: POS S HR Attendance And HQ Oversight Surfaces

You are working on the Suuq POS S web portal, including HQ-level views that belong to the same product line.

Inspect the current codebase first to find attendance, compliance, staff, branch-summary, and export-related modules. Preserve the existing shell and role model.

Goal:

Implement or harden HR attendance and network oversight surfaces so branch operators and HQ users can monitor staff exceptions, override attendance when authorized, and export compliance views.

Backend-aligned context:

- `HR_ATTENDANCE` is an entitlement-gated retail module.
- The backend already supports branch attendance logs, self-service check-in/check-out, manager overrides, branch exceptions, per-staff drilldowns, tenant network summary, JSON compliance summary, and CSV export.
- Responses expose permission metadata so the UI should not infer override rights from guesswork.

Implementation requirements:

1. Identify the current modules for:
   - staff attendance list or dashboard
   - check-in/check-out actions
   - exception queue
   - per-staff detail
   - tenant or HQ summary view
   - export actions

2. Build or refine these screens:
   - branch attendance overview with absent, late, and overtime queues
   - per-staff attendance drilldown with timeline and override actor metadata
   - HQ network summary showing ranked branches and top staff exceptions
   - compliance export entry points using existing export patterns

3. Permission rules:
   - use backend permission flags such as canOverrideAttendance and enabled action metadata
   - show disabled actions clearly when a viewer lacks authority
   - do not expose override UI based only on role name assumptions if the API already returns explicit permission metadata

Verification:

- Confirm branch exception views and staff detail views agree on status, queue type, and override metadata.
- Confirm HQ summary filters and exports stay consistent with on-screen aggregates.
- Verify unauthorized users see read-only states instead of broken buttons.

At the end, return a concise implementation summary, touched files, permission assumptions checked, and any filter/export inconsistencies you fixed.

---

## Prompt 6: Hardening Prompt For Either Portal

You are hardening an existing Suuq operations portal against the current backend contract.

First inspect the current codebase and identify:

- app shell and routing
- API client layer
- auth/session handling
- server state management
- DTO mapping layer
- shared table, form, status badge, and empty/error/loading components

Goal:

Find and fix contract drift, mock-data leftovers, duplicate DTO definitions, and operator-flow gaps in the current portal without rewriting the app architecture.

Tasks:

1. Search for:
   - hardcoded mock lists
   - duplicate status mapping utilities
   - unused fake charts or placeholder KPI cards
   - API contracts that are guessed in the UI instead of derived from server responses
   - mutations that do not re-fetch or reconcile state safely

2. Refactor so that:
   - list and detail views share one DTO mapping source where practical
   - status badges, action enablement, and server errors are rendered consistently
   - loading, empty, and failure states feel intentional for operations users
   - export, filtering, and deep-linking behavior follow the existing portal conventions

3. Produce a final report that lists:
   - each contract mismatch fixed
   - each place where mock data was removed
   - each file changed
   - any remaining backend ambiguity blocking full correctness

Success criteria:

- no obvious mock-data artifacts remain in production paths
- operator workflows rehydrate from server truth after mutations
- list, detail, and export surfaces agree on status and totals
- the UI feels like a business operations surface, not a demo dashboard
