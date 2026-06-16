# explore-admin

Standalone admin tool for the **DB-driven EXPLORE ad engine** in `univest-backend`. Lets product/business
teams manage layout slots, targeting rules, super-menu tiles, experiments, and the shadow→live rollout — no
code deploys.

## Stack
Next.js 14 (App Router) · TypeScript · Tailwind · TanStack Query · dnd-kit · lucide-react.

## How it talks to the backend
The browser calls the backend **directly** at `${NEXT_PUBLIC_BACKEND_URL}/admin/ads/explore/...`. The
`/admin/**` endpoints are open (no token) and CORS-enabled (`@CrossOrigin(origins="*")`).

```
browser → ${NEXT_PUBLIC_BACKEND_URL}/admin/ads/explore/<path>
```

## Setup
```bash
cp .env.example .env        # set NEXT_PUBLIC_BACKEND_URL (e.g. https://uat-api.univest.in)
npm install
npm run dev                 # http://localhost:3100
```

No backend secret/config is required — just deploy univest-backend as usual; the migration runs on boot.

## Screens
- **Overview** — engine status + per-location rollout at a glance.
- **Layout slots** — drag-to-reorder the EXPLORE widget order; per-slot app-version range, sentinel, visibility rule.
- **Explore → Location** — asset rules per location: bind an `ads` row or a variant, build a targeting rule visually (or raw JSON), set priority/visibility.
- **Super-menu** — tile grid (colSpan/rowSpan, content key, visibility rule).
- **Experiments** — bucketed A/B definitions.
- **Engine & rollout** — per-(adType, location) OFF / Shadow% / LIVE, plus the live dry-run **preview** panel.
- **Shadow diffs** — side-by-side legacy vs engine output; drive to zero before going LIVE.

## Rollout flow (matches the backend)
1. Seed/author rules for a location. 2. Set its toggle to a small **shadow %**. 3. Watch **Shadow diffs** trend
to zero for that location. 4. Flip the toggle **LIVE**. 5. Repeat slot-by-slot. Toggling OFF instantly reverts
to the legacy hardcoded path.

## Auth note
The admin API is currently open (internal tool). If you later want access control, the cleanest spot is to put
this app behind corporate SSO and/or restrict `/admin/**` at the gateway/network layer.
# ads-admin
