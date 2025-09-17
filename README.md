# OPD LoggerX (v10X)

Tap-only OPD data logger with compact, single-row **Age** and **Disposition** chips, updated labels (“Referred to ED”, “Referred out”), Save & New scroll-to-top, offline-ready PWA, CSV/XLS export.

## Deploy on Netlify
1) Go to Netlify Drop and upload the folder or ZIP.
2) Open the URL Netlify provides.
3) If previously installed, reinstall to refresh the PWA.

## Files
- index.html – cache-busted links, header shows OPD LoggerX + version
- app.js – logic, Save & New → top, no Quick/Save-Duplicate
- styles.css – one-row equal-width chips, square mild-rounded
- service-worker.js – cache name bumped (opd-x-v11)
- manifest.webmanifest – name OPD LoggerX, start_url with ?v=11
