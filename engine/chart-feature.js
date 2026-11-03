/*
 * TRINETRA CHART FEATURE — isolated and removable.
 * Loads Swiss Ephemeris in the browser, calculates Vedic sidereal charts, and
 * injects SVG charts only into the right-hand report preview/PDF.
 */
(() => {
  'use strict';

  const featureScript = document.currentScript;
  const engineDir = new URL('.', featureScript.src);
  const VENDOR = new URL('vendor/', engineDir);
  const SIGN_EN = ['Aries','Taurus','Gemini','Cancer','Leo','Virgo','Libra','Scorpio','Sagittarius','Capricorn','Aquarius','Pisces'];
  const SIGN_HI = ['मेष','वृषभ','मिथुन','कर्क','सिंह','कन्या','तुला','वृश्चिक','धनु','मकर','कुंभ','मीन'];
  const NAK_EN = ['Ashwini','Bharani','Krittika','Rohini','Mrigashira','Ardra','Punarvasu','Pushya','Ashlesha','Magha','Purva Phalguni','Uttara Phalguni','Hasta','Chitra','Swati','Vishakha','Anuradha','Jyeshtha','Mula','Purva Ashadha','Uttara Ashadha','Shravana','Dhanishta','Shatabhisha','Purva Bhadrapada','Uttara Bhadrapada','Revati'];
  const NAK_HI = ['अश्विनी','भरणी','कृत्तिका','रोहिणी','मृगशिरा','आर्द्रा','पुनर्वसु','पुष्य','आश्लेषा','मघा','पूर्वा फाल्गुनी','उत्तरा फाल्गुनी','हस्त','चित्रा','स्वाती','विशाखा','अनुराधा','ज्येष्ठा','मूल','पूर्वाषाढ़ा','उत्तराषाढ़ा','श्रवण','धनिष्ठा','शतभिषा','पूर्वा भाद्रपद','उत्तरा भाद्रपद','रेवती'];
  const GRAHAS = [
    { id: 0, en: 'Sun', hi: 'सूर्य', abbr: 'Su', shortHi: 'सू' },
    { id: 1, en: 'Moon', hi: 'चंद्र', abbr: 'Mo', shortHi: 'चं' },
    { id: 4, en: 'Mars', hi: 'मंगल', abbr: 'Ma', shortHi: 'मं' },
    { id: 2, en: 'Mercury', hi: 'बुध', abbr: 'Me', shortHi: 'बु' },
    { id: 5, en: 'Jupiter', hi: 'गुरु', abbr: 'Ju', shortHi: 'गु' },
    { id: 3, en: 'Venus', hi: 'शुक्र', abbr: 'Ve', shortHi: 'शु' },
    { id: 6, en: 'Saturn', hi: 'शनि', abbr: 'Sa', shortHi: 'श' },
    { id: 10, en: 'Rahu', hi: 'राहु', abbr: 'Ra', shortHi: 'रा' }
  ];
  const DASHA = [
    { en: 'Ketu', hi: 'केतु', years: 7 }, { en: 'Venus', hi: 'शुक्र', years: 20 },
    { en: 'Sun', hi: 'सूर्य', years: 6 }, { en: 'Moon', hi: 'चंद्र', years: 10 },
    { en: 'Mars', hi: 'मंगल', years: 7 }, { en: 'Rahu', hi: 'राहु', years: 18 },
    { en: 'Jupiter', hi: 'गुरु', years: 16 }, { en: 'Saturn', hi: 'शनि', years: 19 },
    { en: 'Mercury', hi: 'बुध', years: 17 }
  ];
  const DERIVED_KEYS = ['lagna', 'rashi', 'nak', 'dasha'];
  const DERIVED_LABELS = { lagna: 'Lagna', rashi: 'Moon Sign', nak: 'Nakshatra', dasha: 'Current Dasha' };
  const DASHA_YEAR_DAYS = 365.2425; // Mean Gregorian year; dasha year length is not universal.
  const DASHA_YEAR_MS = DASHA_YEAR_DAYS * 86400000;
  let swissPromise = null;
  let swissApi = null;
  const pending = new Set();

  const norm = value => ((value % 360) + 360) % 360;
  const escapeXml = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[ch]));
  const canonical = value => String(value || '').trim().toLocaleLowerCase();
  const fieldText = key => {
    const source = S.fieldSource?.[key];
    if (source && T(key, source)) return T(key, source);
    return T(key, 'en') || T(key, 'hi') || '';
  };

  function loadSwiss() {
    if (location.protocol === 'file:') throw new Error('Open this page through localhost or HTTPS. Browser modules, WebAssembly, and local .se1 files cannot load from a file:// page. See engine/CHART-ENGINE-README.md.');
    if (!swissPromise) {
      swissPromise = (async () => {
        const libraryUrl = new URL('swisseph-browser.js', VENDOR).href;
        const lib = await import(libraryUrl);
        const swe = new lib.SwissEphemeris();
        await swe.init(new URL('swisseph.wasm', VENDOR).href);
        await swe.loadEphemerisFiles([
          { name: 'sepl_18.se1', url: new URL('sepl_18.se1', engineDir).href },
          { name: 'semo_18.se1', url: new URL('semo_18.se1', engineDir).href },
          { name: 'seas_18.se1', url: new URL('seas_18.se1', engineDir).href }
        ]);
        swe.setSiderealMode(lib.SiderealMode.Lahiri);
        swissApi = { swe, lib };
        return swissApi;
      })().catch(error => {
        swissPromise = null;
        throw error;
      });
    }
    return swissPromise;
  }

  function validCoordinates(latitude, longitude) {
    return Number.isFinite(latitude) && latitude >= -90 && latitude <= 90 &&
      Number.isFinite(longitude) && longitude >= -180 && longitude <= 180;
  }

  async function geocodePlace(place) {
    const saved = S.g.birthPlaceCoordinates;
    if (!saved || canonical(saved.place) !== canonical(place) || !validCoordinates(Number(saved.latitude), Number(saved.longitude))) {
      throw new Error('Select the exact birthplace from the suggestions, or enter its latitude and longitude before generating the chart.');
    }
    const timeZone = window.tzlookup?.(Number(saved.latitude), Number(saved.longitude));
    if (!timeZone) throw new Error('The local time-zone lookup could not resolve these coordinates.');
    const resolved = { ...saved, latitude: Number(saved.latitude), longitude: Number(saved.longitude), timeZone };
    S.g.birthPlaceCoordinates = resolved;
    return resolved;
  }

  function localTimeAsUtc(year, month, day, hour, minute, timeZone) {
    const wanted = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
    });
    const partsAt = timestamp => Object.fromEntries(formatter.formatToParts(new Date(timestamp)).map(part => [part.type, part.value]));
    const matchesRequestedLocalTime = parts => +parts.year === year && +parts.month === month && +parts.day === day &&
      +parts.hour === hour && +parts.minute === minute && +parts.second === 0;
    const offsets = new Set();
    // Collect offsets on both sides of the requested clock time so DST folds are detectable.
    for (let hours = -48; hours <= 48; hours += 3) {
      const probe = wanted + hours * 3600000;
      const parts = partsAt(probe);
      const localAsUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
      offsets.add(localAsUtc - probe);
    }
    const candidates = [...offsets].map(offset => wanted - offset)
      .filter(timestamp => matchesRequestedLocalTime(partsAt(timestamp)))
      .filter((timestamp, index, values) => values.indexOf(timestamp) === index);
    if (candidates.length === 1) return new Date(candidates[0]);
    if (candidates.length > 1) throw new Error('This local birth time occurs twice because of a clock change. Confirm the recorded time or enter the correct location and time.');
    throw new Error('This local birth time does not exist in the selected time zone because of a clock change. Check the recorded time.');
  }

  function birthInput() {
    const name = fieldText('nm').trim();
    const place = fieldText('pob').trim();
    const dobValue = String(S.g.dob || '');
    const timeValue = String(S.g.tob || '');
    const dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dobValue);
    const tm = /^(\d{2}):(\d{2})$/.exec(timeValue);
    if (!name) throw new Error('Enter the client name in Client Details.');
    if (!place) throw new Error('Enter or choose the birth place in Client Details.');
    if (!dm) throw new Error('Set a valid Date of Birth first.');
    if (!tm) throw new Error('Set a valid Time of Birth first.');
    const [, ys, ms, ds] = dm;
    const [, hs, mins] = tm;
    const values = [Number(ys), Number(ms), Number(ds), Number(hs), Number(mins)];
    const dateCheck = new Date(0);
    dateCheck.setUTCFullYear(values[0], values[1] - 1, values[2]);
    dateCheck.setUTCHours(0, 0, 0, 0);
    if (values[0] < 1800 || values[0] > 2399 || dateCheck.getUTCFullYear() !== values[0] || dateCheck.getUTCMonth() !== values[1] - 1 || dateCheck.getUTCDate() !== values[2] || values[3] > 23 || values[4] > 59) {
      throw new Error('Enter a real birth date and time. Swiss Ephemeris files in this app cover approximately 1800–2399.');
    }
    return { name, place, year: values[0], month: values[1], day: values[2], hour: values[3], minute: values[4], dobValue, timeValue };
  }

  function julianForUtc(swe, date) {
    return swe.julianDay(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate(), date.getUTCHours() + date.getUTCMinutes() / 60 + date.getUTCSeconds() / 3600);
  }

  function getSunLongitude(swe, flags, jd) {
    const sun = swe.calculatePosition(jd, swissApi.lib.Planet.Sun, flags);
    if ((sun.flags & swissApi.lib.CalculationFlag.SwissEphemeris) === 0) throw new Error('The Swiss files were not used. Check that the local engine files are being served.');
    return norm(sun.longitude);
  }

  function calculateAt(swe, flags, jd, latitude, longitude) {
    // The house wrapper returns a tropical ascendant on the true equinox. Swiss sidereal
    // planetary longitudes use the mean frame, so subtract the nutation-inclusive ayanamsha
    // to cancel nutation and align the ascendant with those sidereal longitudes.
    const ayanamsa = swe.getAyanamsaExUt(jd, swissApi.lib.CalculationFlag.SwissEphemeris);
    const houseData = swe.calculateHouses(jd, latitude, longitude, swissApi.lib.HouseSystem.WholeSign);
    const ascendant = norm(houseData.ascendant - ayanamsa);
    const planets = GRAHAS.map(graha => {
      const position = swe.calculatePosition(jd, graha.id, flags);
      if ((position.flags & swissApi.lib.CalculationFlag.SwissEphemeris) === 0) throw new Error('The selected birth date is outside the Swiss files’ supported range (about 1800–2400).');
      return { ...graha, longitude: norm(position.longitude), sign: Math.floor(norm(position.longitude) / 30), degree: norm(position.longitude) % 30 };
    });
    const rahu = planets.find(planet => planet.en === 'Rahu');
    const ketuLongitude = norm(rahu.longitude + 180);
    planets.push({ en: 'Ketu', hi: 'केतु', abbr: 'Ke', shortHi: 'के', longitude: ketuLongitude, sign: Math.floor(ketuLongitude / 30), degree: ketuLongitude % 30 });
    const moon = planets.find(planet => planet.en === 'Moon');
    return { jd, ayanamsa, ascendant, lagnaSign: Math.floor(ascendant / 30), planets, moonLongitude: moon.longitude, moonSign: moon.sign };
  }

  function divisionalPosition(longitude, division) {
    const absolute = norm(longitude);
    const sign = Math.floor(absolute / 30);
    const inSign = absolute % 30;
    const partSize = 30 / division;
    const part = Math.min(division - 1, Math.floor(inSign / partSize));
    let vargaSign = sign;
    if (division === 2) vargaSign = sign % 2 === 0 ? (part === 0 ? 4 : 3) : (part === 0 ? 3 : 4);
    else if (division === 3) vargaSign = (sign + part * 4) % 12;
    else if (division === 4) vargaSign = (sign + part * 3) % 12;
    else if (division === 5 || division === 6) vargaSign = ((sign % 2 === 0 ? 0 : 6) + part) % 12;
    else if (division === 7) vargaSign = (sign + (sign % 2 === 0 ? 0 : 6) + part) % 12;
    else if (division === 8 || division === 9 || division === 11) vargaSign = ((sign % 3 === 0 ? sign : sign % 3 === 1 ? sign + 8 : sign + 4) + part) % 12;
    else if (division === 10) vargaSign = (sign + (sign % 2 === 0 ? 0 : 8) + part) % 12;
    else if (division === 12) vargaSign = (sign + part) % 12;
    else if (division === 16) vargaSign = ((sign % 3 === 0 ? 0 : sign % 3 === 1 ? 4 : 8) + part) % 12;
    else if (division !== 1) vargaSign = (sign * division + part) % 12;
    const degree = Math.max(0, Math.min(30 - Number.EPSILON, (inSign - part * partSize) * division));
    return { sign: vargaSign, degree, longitude: vargaSign * 30 + degree };
  }

  const divisionalSign = (longitude, division) => divisionalPosition(longitude, division).sign;

  function dateForLanguage(timestamp, timeZone, language) {
    try { return new Intl.DateTimeFormat(language === 'hi' ? 'hi-IN' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone }).format(new Date(timestamp)); }
    catch (_) { return new Date(timestamp).toISOString().slice(0, 10); }
  }

  function currentMahadasha(moonLongitude, birthUtc, timeZone) {
    const sector = 360 / 27;
    const nakshatraIndex = Math.floor(norm(moonLongitude) / sector);
    const elapsedFraction = (norm(moonLongitude) % sector) / sector;
    let sequenceIndex = nakshatraIndex % DASHA.length;
    let cursor = birthUtc.getTime();
    let periodLength = DASHA[sequenceIndex].years * (1 - elapsedFraction) * DASHA_YEAR_MS;
    const now = Date.now();
    if (now < cursor) {
      return { index: nakshatraIndex, english: 'Not started (birth date is in the future)', hindi: 'अभी शुरू नहीं हुई (जन्म तिथि भविष्य में है)' };
    }
    let guard = 0;
    while (now >= cursor + periodLength && guard++ < 150) {
      cursor += periodLength;
      sequenceIndex = (sequenceIndex + 1) % DASHA.length;
      periodLength = DASHA[sequenceIndex].years * DASHA_YEAR_MS;
    }
    const lord = DASHA[sequenceIndex];
    const end = cursor + periodLength;
    return {
      index: nakshatraIndex,
      english: `${lord.en} Mahadasha (until ${dateForLanguage(end, timeZone, 'en')})`,
      hindi: `${lord.hi} महादशा (${dateForLanguage(end, timeZone, 'hi')} तक)`
    };
  }

  function chartDetails(natal, birthUtc, timeZone) {
    const nakshatra = Math.min(26, Math.floor(norm(natal.moonLongitude) / (360 / 27)));
    const dasha = currentMahadasha(natal.moonLongitude, birthUtc, timeZone);
    return {
      lagna: { en: SIGN_EN[natal.lagnaSign], hi: SIGN_HI[natal.lagnaSign] },
      rashi: { en: SIGN_EN[natal.moonSign], hi: SIGN_HI[natal.moonSign] },
      nak: { en: NAK_EN[nakshatra], hi: NAK_HI[nakshatra] },
      dasha: { en: dasha.english, hi: dasha.hindi }
    };
  }

  function divisionalChart(natal, division, label) {
    const ascPosition = divisionalPosition(natal.ascendant, division);
    const planets = natal.planets.map(planet => {
      const position = divisionalPosition(planet.longitude, division);
      return { en: planet.en, hi: planet.hi, abbr: planet.abbr, shortHi: planet.shortHi, ...position };
    });
    return { type: `D${division}`, name: label || `D${division}`, lagnaSign: ascPosition.sign, lagnaDegree: ascPosition.degree, planets, ayanamsa: natal.ayanamsa };
  }

  function findSolarReturn(swe, flags, natalSun, dateParts, timezone, year) {
    const [birthYear, month, day] = dateParts;
    const safeDay = month === 2 && day === 29 && !((year % 4 === 0 && year % 100 !== 0) || year % 400 === 0) ? 28 : day;
    const approximate = localTimeAsUtc(year, month, safeDay, 12, 0, timezone).getTime();
    const residual = timestamp => {
      const jd = julianForUtc(swe, new Date(timestamp));
      return ((getSunLongitude(swe, flags, jd) - natalSun + 540) % 360) - 180;
    };
    let low = approximate - 5 * 86400000, high = approximate + 5 * 86400000;
    let lowValue = residual(low), highValue = residual(high);
    if (!(lowValue <= 0 && highValue >= 0)) throw new Error('Could not bracket the solar return precisely. Check the selected return year and birth details.');
    for (let i = 0; i < 48; i++) {
      const middle = (low + high) / 2;
      const value = residual(middle);
      if (value < 0) low = middle; else high = middle;
    }
    return julianForUtc(swe, new Date((low + high) / 2));
  }

  function getChartSign(value, language) {
    if (language === 'both') return `${SIGN_EN[value]} / ${SIGN_HI[value]}`;
    return language === 'hi' ? SIGN_HI[value] : SIGN_EN[value];
  }

  const HOUSE_ANCHORS = [
    null, [220, 105], [125, 60], [65, 135], [95, 220], [65, 305], [125, 380],
    [220, 345], [315, 380], [375, 305], [345, 220], [375, 135], [315, 60]
  ];

  function renderChartSvg(chart, language) {
    const hi = language === 'hi';
    const houses = Array.from({ length: 12 }, (_, i) => ({ number: i + 1, sign: (chart.lagnaSign + i) % 12, planets: [] }));
    chart.planets.forEach(planet => {
      const houseIndex = (planet.sign - chart.lagnaSign + 12) % 12;
      houses[houseIndex].planets.push(hi ? planet.shortHi : planet.abbr);
    });
    const labels = houses.map(house => {
      const [x, y] = HOUSE_ANCHORS[house.number];
      const sign = getChartSign(house.sign, language);
      const names = house.planets;
      const first = names.slice(0, 5).join(' '), second = names.slice(5).join(' ');
      return `<g text-anchor="middle"><text class="house-number" x="${x}" y="${y - 13}">${house.number} · ${escapeXml(sign)}</text><text class="planets" x="${x}" y="${y + 5}">${escapeXml(first)}</text>${second ? `<text class="planets" x="${x}" y="${y + 17}">${escapeXml(second)}</text>` : ''}</g>`;
    }).join('');
    const placements = [{ abbr: hi ? 'लग्न' : 'Asc', sign: chart.lagnaSign, degree: chart.lagnaDegree }, ...chart.planets];
    const placementLabels = placements.map((point, index) => {
      const column = index % 3, row = Math.floor(index / 3);
      const x = 24 + column * 138, y = 497 + row * 16;
      const name = hi ? (point.shortHi || point.abbr) : point.abbr;
      const signName = hi ? SIGN_HI[point.sign] : SIGN_EN[point.sign];
      return `<text class="placement" x="${x}" y="${y}">${escapeXml(name)} · ${escapeXml(signName)} ${Number(point.degree || 0).toFixed(4)}°</text>`;
    }).join('');
    const translatedTitle = language === 'hi' ? chart.subtitleHi : language === 'both' ? `${chart.subtitleEn} / ${chart.subtitleHi}` : chart.subtitleEn;
    const name = chart.clientName ? `${chart.clientName} · ` : '';
    const description = language === 'hi' ? 'लाहिड़ी · राशि भाव · भू-केंद्रीय · Mean Node' : language === 'both' ? 'Lahiri · Whole-sign · geocentric · Mean Node / लाहिड़ी · राशि भाव · भू-केंद्रीय · Mean Node' : 'Lahiri · Whole-sign · geocentric · Mean Node';
    const metadata = chart.calculationMetadata || {};
    const lat = Number(metadata.latitude), lon = Number(metadata.longitude);
    const coordinatesLine = validCoordinates(lat, lon) && metadata.timeZone
      ? `Birth coordinates ${lat.toFixed(5)}°, ${lon.toFixed(5)}° · ${metadata.timeZone}`
      : '';
    const placementTitle = language === 'hi' ? 'इस कुंडली में ग्रहों की राशि स्थिति (डिग्री)' : language === 'both' ? `${chart.type} placements (degrees) / इस कुंडली में ग्रहों की स्थिति (डिग्री)` : `${chart.type} placements (degrees)`;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 440 566" role="img" aria-label="${escapeXml(chart.type)} birth chart"><title>${escapeXml(name + translatedTitle)}</title><style>text{font-family:Georgia,'Noto Serif Devanagari',serif;fill:#17110f}.chart-name{font-size:14px;font-weight:700}.chart-note{font-size:9px;fill:#6b5f55}.chart-coordinates{font-size:8px;fill:#6b5f55}.placement-title{font-size:9px;font-weight:700}.placement{font-size:8px;font-weight:600}.house-number{font-size:9px;font-weight:600}.planets{font-size:10px;font-weight:700}.grid{fill:none;stroke:#b3121f;stroke-width:1.5}</style><text class="chart-name" x="220" y="17" text-anchor="middle">${escapeXml(name + translatedTitle)}</text><rect class="grid" x="20" y="28" width="400" height="400"/><line class="grid" x1="20" y1="28" x2="420" y2="428"/><line class="grid" x1="420" y1="28" x2="20" y2="428"/><polyline class="grid" points="220,28 420,228 220,428 20,228 220,28"/>${labels}<text class="chart-note" x="220" y="444" text-anchor="middle">${escapeXml(description)}</text>${coordinatesLine ? `<text class="chart-coordinates" x="220" y="458" text-anchor="middle">${escapeXml(coordinatesLine)}</text>` : ''}<text class="placement-title" x="220" y="480" text-anchor="middle">${escapeXml(placementTitle)}</text>${placementLabels}</svg>`;
  }

  function svgDataUrl(svg) { return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`; }

  function setComputedFields(values, birthKey) {
    S.engineDerived = { birthKey, values, engine: 'Swiss Ephemeris · Lahiri', calculatedAt: new Date().toISOString() };
    DERIVED_KEYS.forEach(key => {
      S.t[`${key}_en`] = values[key].en;
      S.t[`${key}_hi`] = values[key].hi;
      delete S.manual?.en?.[key];
      delete S.manual?.hi?.[key];
      delete S.uppercaseFields?.[key];
    });
    updateComputedFormFields();
  }

  function updateComputedFormFields() {
    DERIVED_KEYS.forEach(key => {
      const output = document.querySelector(`[data-engine-output="${key}"]`);
      if (!output) return;
      output.textContent = fieldText(key) || 'Calculated when a chart is generated';
      output.classList.toggle('is-empty', !fieldText(key));
    });
  }

  function placeCoordinateDraft(place) {
    const draft = S.g.birthPlaceCoordinateDraft;
    if (draft && canonical(draft.place) === canonical(place)) return draft;
    const saved = S.g.birthPlaceCoordinates;
    if (saved && canonical(saved.place) === canonical(place)) {
      return { place, latitude: String(saved.latitude), longitude: String(saved.longitude) };
    }
    return { place, latitude: '', longitude: '' };
  }

  function patchLocationCoordinateFields() {
    const placeInput = document.querySelector('#placeInput');
    const form = document.querySelector('#form');
    if (!placeInput || !form) return;
    const field = placeInput.closest('.field-with-option') || placeInput.closest('.place-field');
    if (!field) return;
    let controls = form.querySelector('.chart-location-coordinates');
    if (!controls) {
      controls = document.createElement('div');
      controls.className = 'chart-location-coordinates';
      controls.innerHTML = `<div class="chart-coordinate-fields"><label>Latitude<input type="number" min="-90" max="90" step="any" inputmode="decimal" data-chart-coordinate="latitude" placeholder="e.g. 31.1040"></label><label>Longitude<input type="number" min="-180" max="180" step="any" inputmode="decimal" data-chart-coordinate="longitude" placeholder="e.g. 77.1708"></label></div><p>Map matches are estimates. Adjust these to the exact birthplace for a more precise Lagna and house placement.</p>`;
      field.insertAdjacentElement('afterend', controls);
    }
    if (controls.contains(document.activeElement)) return;
    const draft = placeCoordinateDraft(placeInput.value);
    controls.querySelector('[data-chart-coordinate="latitude"]').value = draft.latitude;
    controls.querySelector('[data-chart-coordinate="longitude"]').value = draft.longitude;
  }

  function birthKeyFor(input, coordinates) {
    return [input.dobValue, input.timeValue, canonical(input.place), Number(coordinates.latitude).toFixed(7), Number(coordinates.longitude).toFixed(7), coordinates.timeZone].join('|');
  }

  function patchForm() {
    const form = document.querySelector('#form');
    if (!form) return;
    patchLocationCoordinateFields();
    DERIVED_KEYS.forEach(key => {
      const input = form.querySelector(`[data-k="${key}"]`);
      if (!input) return;
      const label = input.closest('label');
      if (!label) return;
      label.classList.add('engine-derived-field');
      const method = key === 'dasha' ? 'Vimshottari · 365.2425-day year' : 'Swiss Ephemeris · Lahiri';
      label.innerHTML = `<span>${DERIVED_LABELS[key]}<small>${method}</small></span><output data-engine-output="${key}"></output>`;
    });
    form.querySelectorAll('input[type="file"][data-cf], img.thumb').forEach(node => node.remove());
    S.charts.forEach(chart => {
      const mode = form.querySelector(`[data-c="${chart.id}"][data-f="mode"]`);
      const card = mode?.closest('.blk');
      if (!card) return;
      card.dataset.chartCard = String(chart.id);
      const generated = chart.chartData && chart.generatedType === chart.type;
      let action = card.querySelector('.chart-engine-actions');
      if (!action) {
        action = document.createElement('div');
        action.className = 'chart-engine-actions';
        action.innerHTML = `<button type="button" class="chart-generate-button" data-chart-generate="${chart.id}"></button><span class="chart-engine-status" data-chart-status="${chart.id}" aria-live="polite"></span>`;
        card.insertBefore(action, card.querySelector('textarea'));
      }
      const button = action.querySelector('[data-chart-generate]');
      const status = action.querySelector('[data-chart-status]');
      if (!pending.has(chart.id)) button.textContent = generated ? 'Regenerate chart' : 'Generate chart';
      if (!status.classList.contains('is-error')) status.textContent = location.protocol === 'file:' ? 'Serve the full app folder from localhost or HTTPS to load the Swiss chart engine.' : generated ? 'Chart is in the right preview.' : 'Swiss chart output appears in the right preview.';
    });
    updateComputedFormFields();
  }

  function clearCalculatedResults(patch = true) {
    S.engineDerived = null;
    DERIVED_KEYS.forEach(key => ['en', 'hi'].forEach(lang => { delete S.t[`${key}_${lang}`]; }));
    S.charts.forEach(chart => { chart.chartData = null; chart.generatedType = null; chart.img = ''; });
    if (patch) patchForm();
    updateComputedFormFields();
    render();
    later();
  }

  async function generateChart(chartId, button) {
    const chart = S.charts.find(item => Number(item.id) === Number(chartId));
    if (!chart || pending.has(chart.id)) return;
    pending.add(chart.id);
    button.disabled = true;
    button.textContent = 'Calculating…';
    const status = document.querySelector(`[data-chart-status="${chart.id}"]`);
    if (status) { status.textContent = 'Loading Swiss Ephemeris and birth location…'; status.classList.remove('is-error'); }
    try {
      if (location.protocol === 'file:') throw new Error('Open this page through localhost or HTTPS. Browser modules, WebAssembly, and local .se1 files cannot load from a file:// page. See engine/CHART-ENGINE-README.md.');
      const input = birthInput();
      const coordinates = await geocodePlace(input.place);
      const birthUtc = localTimeAsUtc(input.year, input.month, input.day, input.hour, input.minute, coordinates.timeZone);
      const { swe, lib } = await loadSwiss();
      const flags = lib.CalculationFlag.SwissEphemeris | lib.CalculationFlag.Sidereal | lib.CalculationFlag.Speed;
      const birthJd = julianForUtc(swe, birthUtc);
      const natal = calculateAt(swe, flags, birthJd, coordinates.latitude, coordinates.longitude);
      const derived = chartDetails(natal, birthUtc, coordinates.timeZone);
      const inputKey = birthKeyFor(input, coordinates);
      setComputedFields(derived, inputKey);

      let chartResult;
      if (chart.type[0] === 'V') {
        const yearNumber = Number(chart.type.slice(1));
        const startingYear = Number(S.g.vy) || input.year;
        const solarYear = startingYear + yearNumber - 1;
        const sun = natal.planets.find(planet => planet.en === 'Sun').longitude;
        const returnJd = findSolarReturn(swe, flags, sun, [input.year, input.month, input.day], coordinates.timeZone, solarYear);
        const returned = calculateAt(swe, flags, returnJd, coordinates.latitude, coordinates.longitude);
        chartResult = divisionalChart(returned, 1, `Varshaphal ${solarYear}`);
        chartResult.subtitleEn = `Varshaphal · ${solarYear}`;
        chartResult.subtitleHi = `वर्षफल · ${solarYear}`;
        chartResult.type = chart.type;
      } else {
        const division = Number(chart.type.slice(1));
        if (!Number.isFinite(division) || division < 1) throw new Error('Select a valid chart type.');
        chartResult = divisionalChart(natal, division, chart.type);
        chartResult.subtitleEn = `${chart.type} · ${division === 1 ? 'Rashi chart' : 'Divisional chart'}`;
        chartResult.subtitleHi = `${chart.type} · ${division === 1 ? 'राशि कुंडली' : 'वर्ग कुंडली'}`;
      }
      chartResult.clientName = input.name;
      chartResult.calculationMetadata = {
        latitude: coordinates.latitude,
        longitude: coordinates.longitude,
        timeZone: coordinates.timeZone,
        birthUtc: birthUtc.toISOString()
      };
      chart.generatedType = chart.type;
      chart.chartData = chartResult;
      chart.img = svgDataUrl(renderChartSvg(chartResult, chart.mode === 'hi' ? 'hi' : 'en'));
      render();
      later();
      if (status) {
        status.textContent = `Generated from ${input.dobValue} ${input.timeValue} local (${coordinates.timeZone}) · ${coordinates.latitude.toFixed(5)}, ${coordinates.longitude.toFixed(5)}.`;
        status.classList.remove('is-error');
      }
      button.textContent = 'Regenerate chart';
    } catch (error) {
      console.error('Swiss chart generation failed:', error);
      if (status) {
        status.textContent = error?.message || 'Chart generation failed. Check the engine files and location.';
        status.classList.add('is-error');
      }
      button.textContent = 'Generate chart';
    } finally {
      pending.delete(chart.id);
      button.disabled = false;
    }
  }

  function install() {
    if (S.engineDerived?.birthKey) {
      const savedLocation = S.g.birthPlaceCoordinates || {};
      const currentKey = [S.g.dob || '', S.g.tob || '', canonical(fieldText('pob')),
        Number.isFinite(Number(savedLocation.latitude)) ? Number(savedLocation.latitude).toFixed(7) : '',
        Number.isFinite(Number(savedLocation.longitude)) ? Number(savedLocation.longitude).toFixed(7) : '', savedLocation.timeZone || ''].join('|');
      if (currentKey !== S.engineDerived.birthKey) {
        S.engineDerived = null;
        S.charts.forEach(chart => { chart.chartData = null; chart.generatedType = null; chart.img = ''; });
      }
    }
    if (!S.engineDerived) {
      DERIVED_KEYS.forEach(key => ['en', 'hi'].forEach(lang => { delete S.t[`${key}_${lang}`]; }));
    } else if (S.engineDerived.values) {
      DERIVED_KEYS.forEach(key => {
        if (S.engineDerived.values[key]) {
          S.t[`${key}_en`] = S.engineDerived.values[key].en;
          S.t[`${key}_hi`] = S.engineDerived.values[key].hi;
        }
      });
    }
    const originalBuildForm = buildForm;
    buildForm = function (...args) {
      const result = originalBuildForm.apply(this, args);
      patchForm();
      return result;
    };
    const originalReportHTML = reportHTML;
    reportHTML = function (language) {
      S.charts.forEach(chart => {
        if (chart.chartData && chart.generatedType === chart.type) {
          chart.chartData.clientName = fieldText('nm');
          const chartLanguage = chart.mode === 'hi' || chart.mode === 'en' || chart.mode === 'both' ? chart.mode : language;
          chart.img = svgDataUrl(renderChartSvg(chart.chartData, chartLanguage));
        } else if (chart.chartData && chart.generatedType !== chart.type) {
          chart.img = '';
        }
      });
      return originalReportHTML(language)
        .replaceAll('Chart not uploaded', 'Generate this chart from the Charts section.')
        .replaceAll('चार्ट अपलोड नहीं हुआ', 'Charts सेक्शन से यह कुंडली बनाएँ।');
    };
    patchForm();
    render();

    document.addEventListener('click', event => {
      const button = event.target.closest('[data-chart-generate]');
      if (!button) return;
      event.preventDefault();
      generateChart(button.dataset.chartGenerate, button);
    });

    document.querySelector('#form')?.addEventListener('change', event => {
      const field = event.target.dataset;
      if (field?.c && field.f === 'type') {
        const chart = S.charts.find(item => Number(item.id) === Number(field.c));
        if (chart) { chart.chartData = null; chart.generatedType = null; chart.img = ''; render(); later(); patchForm(); }
      }
    });
    document.querySelector('#form')?.addEventListener('input', event => {
      const field = event.target.dataset;
      if (field?.chartCoordinate) {
        const latitudeInput = document.querySelector('[data-chart-coordinate="latitude"]');
        const longitudeInput = document.querySelector('[data-chart-coordinate="longitude"]');
        const place = document.querySelector('#placeInput')?.value.trim() || '';
        const latitudeText = latitudeInput?.value.trim() || '';
        const longitudeText = longitudeInput?.value.trim() || '';
        S.g.birthPlaceCoordinateDraft = { place, latitude: latitudeText, longitude: longitudeText };
        const latitude = Number(latitudeText), longitude = Number(longitudeText);
        if (place && latitudeText && longitudeText && validCoordinates(latitude, longitude)) {
          const timeZone = window.tzlookup?.(latitude, longitude);
          if (timeZone) S.g.birthPlaceCoordinates = { place, label: place, latitude, longitude, timeZone, source: 'manual' };
          else delete S.g.birthPlaceCoordinates;
        } else delete S.g.birthPlaceCoordinates;
        clearCalculatedResults(false);
        return;
      }
      if (field?.g === 'dob' || field?.g === 'tob' || field?.k === 'pob') {
        if (field.k === 'pob') {
          const saved = S.g.birthPlaceCoordinates;
          if (saved && canonical(saved.place) !== canonical(event.target.value)) delete S.g.birthPlaceCoordinates;
          const draft = S.g.birthPlaceCoordinateDraft;
          if (draft && canonical(draft.place) !== canonical(event.target.value)) delete S.g.birthPlaceCoordinateDraft;
        }
        clearCalculatedResults();
      } else if (field?.k === 'nm') {
        S.charts.forEach(chart => { if (chart.chartData) chart.chartData.clientName = fieldText('nm'); });
        render();
        later();
      }
    });
    document.querySelector('#form')?.addEventListener('click', event => {
      if (!event.target.closest('[data-place]')) return;
      const selectedPlace = document.querySelector('#placeInput')?.value || '';
      const saved = S.g.birthPlaceCoordinates;
      if (saved && canonical(saved.place) !== canonical(selectedPlace)) delete S.g.birthPlaceCoordinates;
      const draft = S.g.birthPlaceCoordinateDraft;
      if (draft && canonical(draft.place) !== canonical(selectedPlace)) delete S.g.birthPlaceCoordinateDraft;
      clearCalculatedResults();
    });
    document.querySelector('#form')?.addEventListener('change', event => {
      const field = event.target.dataset;
      if (field?.g === 'dob' || field?.g === 'tob') clearCalculatedResults();
    });
    window.TrinetraChartFeatureReady = true;
  }

  install();
})();
