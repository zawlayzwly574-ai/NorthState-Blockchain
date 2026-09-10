---
name: Stable member views
description: Rendering rules for member pages that poll or refresh protected API data.
---

Overview, Activity, and Settings must keep their current content mounted while protected queries revalidate. Once real data or an approved sample fallback is available, background loading and error flags must not replace the view with skeletons, empty cards, or fatal errors.

**Why:** Revalidation can briefly change query status even when the page has usable cached or fallback data, which caused visible layout jumps and repeated “We could not load this view” states.

**How to apply:** Preserve previous query data, render approved inline fallbacks on the first paint, and reserve blocking skeletons for pages that truly have neither cached data nor a safe fallback. Keep authentication and account restrictions authoritative; read fallbacks never authorize writes.