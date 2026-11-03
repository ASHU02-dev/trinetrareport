# Trinetra Swiss chart feature

This folder contains the removable Swiss Ephemeris chart feature. `chart-feature.js` loads the local `sepl_18.se1`, `semo_18.se1`, and `seas_18.se1` files, calculates the selected chart in the browser, and supplies an SVG to the existing report renderer. It does not draw charts in the left editor.

## Runtime

The page must be served from localhost or HTTPS. Browser modules, WebAssembly, and the local ephemeris files cannot be fetched from a `file://` page. From this folder's parent, one simple local option is:

```sh
python3 -m http.server 8000
```

Then open `http://localhost:8000/` in Firefox or Chrome.

Photon, an OpenStreetMap-based geocoder, provides suggested place/address coordinates. Its public demo API asks for reasonable use and does not guarantee availability. Search results include OpenStreetMap attribution. A city or locality result is only a map estimate, so the chart controls expose editable latitude and longitude; use coordinates for the actual birthplace (for example, the hospital or home) when Lagna/house precision matters. The chosen coordinates and timezone are printed under the chart. The bundled `tz-lookup` file resolves coordinates to an IANA time zone locally; no separate timezone service receives them. The name, birth date, and birth time remain in the browser. Swiss Ephemeris calculations run locally using the three `.se1` files in this directory. Their available range is approximately 1800–2399. A chart is refused if the local birth time is invalid or ambiguous at a daylight-saving clock transition.

The displayed method is sidereal Lahiri, whole-sign houses, geocentric planetary positions, and the mean lunar node for Rahu/Ketu. Vimshottari starts from the Moon's birth Nakshatra and uses a 365.2425-day mean Gregorian-year convention for its Mahadasha end dates; dasha year-length conventions vary between astrology software. The feature computes the selected divisional chart (D1–D12 and D16) or a Varshaphal solar-return chart (V1–V3), plus Lagna, Moon sign, Nakshatra, and Vimshottari Mahadasha. Varga positions are remapped as follows: D2 splits odd signs Leo then Cancer and even signs Cancer then Leo; D3 starts from the natal sign and advances by four signs per part; D4 advances by three; D5/D6 start from Aries for odd signs and Libra for even signs; D7 starts from the natal sign for odd signs and the seventh sign for even signs; D8/D9/D11 use movable=same, fixed=ninth, dual=fifth; D10 uses same/ninth for odd/even signs; D12 advances sequentially; D16 starts from Aries/Leo/Sagittarius for movable/fixed/dual signs. Some traditions use different rules, especially for non-standard vargas, so matching a specific reference app requires matching its ayanamsha, varga rules, node model, and dasha-year settings.

No implementation can promise “101%” or universal 100% astrological accuracy. Swiss Ephemeris provides high-precision astronomical positions, but the final chart still depends on the accuracy of the recorded birth time and exact coordinates, timezone history, and the astrological conventions above. Birth time is entered to the nearest minute. For close sign/house boundaries, verify the source birth record and coordinate precision against a trusted reference using the same conventions.

## Remove the feature

Remove the `chart-feature.css` link and both `tz-lookup.js` / `chart-feature.js` script tags from `index.html`, then remove `chart-feature.js`, `chart-feature.css`, this README, and the `vendor/` directory. The regular report editor and preview remain.

## Third-party license

The vendored browser wrapper is `@swisseph/browser` 1.4.0, licensed under AGPL-3.0. Its license is included as `vendor/LICENSE.swisseph-browser`. The bundled `tz-lookup` 6.1.25 timezone data is CC0-1.0; see `vendor/LICENSE.tz-lookup`. Swiss Ephemeris also has a professional license option; review Astrodienst's licensing terms before distributing the application or exposing it as a public service.

## Cross-device and browser limits

- Serve this folder over HTTP on the same computer or HTTPS; opening index.html directly with file:// prevents the chart engine from loading. For use from another device, use HTTPS. A plain HTTP LAN address may not be treated as a secure context by browser AI or speech APIs.
- Swiss Ephemeris calculations run locally in the browser from the bundled WASM and .se1 files. The supported birth-year range is approximately 1800–2399.
- Free-text translation uses the browser on-device Translator API. The app has no cloud translation fallback: browsers without that API, including Firefox, Safari, and mobile browsers in the current Chrome implementation, leave typed text untranslated and show a support message when translation is requested. The language model must also be available or downloaded.
- Photon place suggestions require an internet connection and a third-party geocoder. If it is unavailable, enter coordinates manually in the chart controls. Browser storage is per browser profile/device; use Save/Open JSON to move an editable report.
- Voice input depends on browser speech recognition support. Formal rewriting sends only the text explicitly submitted for rewriting to Anthropic, requires an API key, and can fail if the service or selected model is unavailable.
