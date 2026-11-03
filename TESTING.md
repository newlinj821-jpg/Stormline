# Smoke-test checklist

1. Netlify deploy succeeds and website is served at HTTPS (not blank and no 404s).
2. Open Overview → temperature and 14-day rows show **live** Open-Meteo results, not static sample values.
3. Search `Tokyo`, open result, verify °F/°C switching refetches and location appears in sidebar.
4. Search `40.69, -89.59` and verify exact coordinate selection.
5. Save 2 locations and switch between them. Reload; locations and units should persist.
6. Expand a 14-day forecast row for snowfall, wind, UV, sunrise and sunset.
7. Open Radar; scrub history slider, use Play/Pause, Zoom +/-, drag map, and expand map. Frames should be historical.
8. U.S. location: alerts report either no active NWS bulletins or actual bulletins. Outside U.S.: NWS unavailable notice.
9. Turn on push keys in Netlify, redeploy, then install on iOS Home Screen and enable permissions. Click Test push.
10. Confirm `check-alerts` appears in Netlify **Functions** with a scheduled badge. Check logs and run manually via Netlify's **Run now**.
11. Disable notifications; test again only after re-enabling.
12. Simulate offline: previously cached weather remains visible; refresh error explicitly says weather may be stale.

Automated local tests: `node --test tests/*.test.mjs`. These test alert classification, forecast thresholds, location validation and push endpoint validation. A deployed Netlify end-to-end test with valid VAPID keys and real Apple/Google push delivery is still required; it cannot be proven by unit tests alone.
