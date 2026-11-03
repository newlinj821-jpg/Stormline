# STORMLINE — Ad-free weather intelligence

**A GitHub-ready, installable website for Netlify.** No ads, analytics SDKs, accounts, premium paywalls, or paid API keys required for core weather tracking.

## Deploy the existing GitHub repository to Netlify

The complete project is already uploaded to **[`newlinj821-jpg/Stormline`](https://github.com/newlinj821-jpg/Stormline)** on the `main` branch. **You do not need to upload, unzip, move, or copy any project files.**

1. In **Netlify → Add new project → Import an existing project → GitHub**, select `newlinj821-jpg/Stormline`.
2. **Base directory:** leave blank. The checked-in `netlify.toml` configures the build command (`npm install --no-audit --no-fund`), publish directory (`public`) and functions directory (`netlify/functions`).
3. Select **Deploy**. Visit the assigned HTTPS URL. Forecasts, geocoding, NWS warnings, radar and installable app work without a weather API key.
4. To enable background push notifications when the app is closed, follow the one-time notification configuration below.

**Keep Stormline separate from SanctumEros and other sites.** Connecting this repository to its own Netlify project avoids affecting other websites.

## Enable actual background push notifications

Netlify cannot send background pushes without a public/private Web Push key pair. This is a standard technical requirement; there is no subscription fee.

### Generate your keys

On a computer with Node.js installed, run:

```sh
npx web-push generate-vapid-keys
```

Copy the **Public Key** and **Private Key** from the output. Add these three environment variables under **Netlify → Project configuration → Environment variables**:

| Name | Value |
|---|---|
| `VAPID_PUBLIC_KEY` | Generated public key |
| `VAPID_PRIVATE_KEY` | Generated private key (keep secret; NEVER put in GitHub) |
| `VAPID_SUBJECT` | `mailto:you@example.com` — replace with an email you control |

Optional: `NWS_USER_AGENT` = `StormlineWeather/1.0 (your-email@example.com)` for the official U.S. alerts API. This is recommended for transparent NWS identification.

**Redeploy** the Netlify site after adding the variables.

### Allow notifications on iPhone

1. Open your Netlify site **in Safari on the iPhone**.
2. Tap **Share → Add to Home Screen → Add**.
3. Launch **Stormline from the Home Screen icon**, not the Safari browser tab.
4. Open **Preferences → Manage weather notifications → Enable notifications** and allow permission.
5. Choose your alert categories, click **Save preferences**, then use **Send test push** to verify.

Android and desktop browsers that support Push API can subscribe directly on the HTTPS site. Your saved locations are stored on the device. Enabling push also sends the necessary locations, categories and browser subscription to your Netlify site's private Blobs store so server-side checks can run when the app is closed.

### Push delivery and sources

- The `check-alerts` Netlify Scheduled Function runs **every 15 minutes** on the **published production deployment**. This is not real-time or guaranteed. The schedule may be delayed by service limits or deployment issues.
- It checks official National Weather Service alerts for U.S. locations via `api.weather.gov/alerts/active?point=LAT,LON`.
- For saved locations worldwide, it also evaluates a limited set of **weather-model thresholds** for thunderstorms (forecast lightning *risk*, not strike detection), snow, heavy precipitation, strong wind, heat and cold.
- Alerts are deduplicated. The function processes up to 80 subscribed devices per run to limit execution time. It is designed for **personal or small-scale use**, not high-volume public deployments.
- Optional daily summaries go out during the 7 a.m. local hour when a scheduled check succeeds; exact delivery minute is not guaranteed.
- This app does **not** have actual lightning-strike-distance detection. That requires a separately licensed real-time lightning network API. It never labels thunderstorm forecasts as live lightning observations.
- Official NWS warnings are **U.S.-only**. A missing warning elsewhere is **not** evidence that no local warning exists. International weather forecasts and model-based notifications still work.
- **DO NOT rely on Stormline as your sole source of safety-critical warnings.** Keep Wireless Emergency Alerts, official weather alerts and NOAA Weather Radio enabled.

## Features

- Search and pin up to 12 places worldwide, including raw latitude/longitude.
- Real weather conditions; 24-hour temperature, precipitation and weather-code outlook.
- 14-day high/low temperature, snow, wind, precipitation, sunrise and sunset forecasts.
- Air quality: U.S. AQI and PM2.5 when modeled data is available.
- Animated precipitation radar with map panning and zoom, limited to past radar frames and provider maximum zoom 7.
- Official U.S. NWS watches, warnings and advisories with bulletin text/instructions.
- Ad-free dark/light responsive layout, °F/°C, mph/km/h, time format, home-screen PWA.
- Local last-forecast cache and offline shell.
- Custom background web push notifications using Netlify Functions + Blobs + VAPID; per-device opt-in.

## Data sources and their rules

- [Open-Meteo](https://open-meteo.com/) — free for **non-commercial use**; check terms before publishing a commercial site.
- [National Weather Service](https://www.weather.gov/documentation/services-web-API) — official U.S. weather alerts.
- [RainViewer](https://www.rainviewer.com/api.html) — free public Weather Maps API for personal, educational, and small community use; mandatory visible attribution is provided. Current free API serves historical radar tiles, not future radar nowcasts; rate and zoom limits apply.
- [OpenStreetMap](https://www.openstreetmap.org/copyright) — map tiles with visible attribution, best-effort publicly hosted tile service; for commercial or high-traffic traffic use a tile service that permits your usage.

All third-party weather data is best-effort and is subject to the provider's accuracy, outages and usage terms.

## Tech

Static HTML/CSS/JS, Service Worker, Web App Manifest, no front-end framework/build needed. Backend uses Netlify Node Functions with `@netlify/blobs` and `web-push`. To test non-network logic:

```sh
npm test
```

To serve the static interface locally: `cd public && python3 -m http.server 8080` (serverless notification endpoints are not available in this mode). To run Netlify Functions locally: install Netlify CLI with `npm install -g netlify-cli`, run `npm install`, then `netlify dev`.

## Data & privacy

There are no ad pixels or third-party analytics in Stormline. The forecast providers necessarily receive coordinates to respond to weather queries; map/radar providers receive the viewed map area. Browser localStorage retains saved locations and preferences on the current device. When push is enabled, subscription information, saved location coordinates and selected categories are stored in a site-private Netlify Blobs store accessible to the server code. Turning push off deletes that subscription record. If Netlify retention backups exist they follow Netlify's policies. This simple app does not implement user accounts or cross-device sync.

## Tornado tracker and radar map (v1.1)

Stormline now offers **Precipitation** and **Tornado paths & warnings** radar views. The latter uses `api.weather.gov/points/{lat},{lon}` to resolve the selected U.S. state, then `api.weather.gov/alerts/active?area={STATE}` to display *official active tornado watch/warning areas*. Red polygons signify warnings, amber dotted polygons signify watches. Where NWS provides no polygon, the bulletin is listed without an invented outline. Reported direction/speed appears in text only when available. **These are not confirmed tornado trajectories** or future storm predictions; do not use the layer as the sole basis for seeking shelter.

**Center on location** restores the map to the selected city's coordinates. Weather radar returns transparent tiles where there is no measurable precipitation; the map alone may look clear during dry conditions. Radar tiles are still capped at level 7 per RainViewer's public API. NWS data and coverage can be delayed or unavailable.

### Radar and notifications repair (November 2026)

Radar now reuses stable basemap tiles during animation, with an OpenStreetMap basemap and RainViewer historical precipitation overlay. Tornado polygons are **NWS warning areas, not confirmed tornado tracks or predicted paths**. If iOS push authorization becomes stale, use **Repair subscription**, then **Send test push**. Keep Wireless Emergency Alerts enabled for critical weather.


## Push delivery diagnostics (November 2026)

If Stormline shows **Push subscription registered**, the device record is stored and authorized, but delivery is not yet confirmed. Use **Send test push**. Failure details now remain visible in the notification settings. An expired endpoint should be repaired using **Repair subscription**; a push-provider authorization failure means checking the original matching VAPID keys and redeploying. The notification endpoint returns nonsecret error codes, while Netlify function logs retain the diagnostic status. Do not publish the private VAPID key or substitute a new pair without repairing existing subscriptions. A successful provider response does not prove the phone displayed the notification.


## Web Push sender fix

Both the test push endpoint and the scheduled alert sender now use the default import for the CommonJS `web-push` package (`import webpush from 'web-push'`). A namespace import can leave `setVapidDetails`/`sendNotification` unavailable under Node's CommonJS compatibility behavior, previously yielding a misleading VAPID credentials failure. Existing VAPID environment settings and existing device subscriptions can be retained; redeploy and send a test notification. A successful test response confirms handoff to the push provider, not necessarily on-screen delivery.
