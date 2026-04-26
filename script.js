const INPUT_LAYERS = [
  { id: "s1rtc", label: "SAR (S1RTC)", path: "samples/s1rtc" },
  { id: "s2l2a", label: "MSI (S2L2A)", path: "samples/s2l2a" },
  { id: "dem", label: "DEM", path: "samples/dem" },
  { id: "lulc", label: "LULC", path: "samples/lulc" },
];

const OVERLAY_LAYERS = [
  { id: "mask", label: "Grount Truth (by LISFLOOD-FP)", path: "samples/mask" },
  { id: "zf-sar", label: "Input: S1RTC", path: "samples/pred/zf-sar" },
  { id: "zf-sar-opt", label: "Input: S1RTC & S2L2A", path: "samples/pred/zf-sar-opt" },
  { id: "zf-opt", label: "Input: S2L2A", path: "samples/pred/zf-opt" },
  { id: "tim-sar-l", label: "Input: S1RTC (TiM: LULC)", path: "samples/pred/zf-tim-sar/l" },
  { id: "tim-sar-ds", label: "Input: S1RTC (TiM: DEM, S2L2A)", path: "samples/pred/zf-tim-sar/ds" },
  { id: "tim-sar-dsl", label: "Input: S1RTC (TiM: DEM, S2L2A, LULC)", path: "samples/pred/zf-tim-sar/dsl" },
  { id: "tim-opt-s", label: "Input: S2L2A (TiM: S1RTC)", path: "samples/pred/zf-tim-opt/s" },
  { id: "tim-opt-sl", label: "Input: S2L2A (TiM: S1RTC, LULC)", path: "samples/pred/zf-tim-opt/sl" },
  { id: "tim-opt-dls", label: "Input: S2L2A (TiM: DEM, LULC, S2L2A)", path: "samples/pred/zf-tim-opt/dls" },
  { id: "tim-both-d", label: "Input: S1RTC, S2L2A (TiM: DEM)", path: "samples/pred/zf-tim-sar-opt/d" },
  { id: "tim-both-dl", label: "Input: S1RTC, S2L2A (TiM: DEM, LULC)", path: "samples/pred/zf-tim-sar-opt/dl" },
];

const EUROPE_VIEW_BOUNDS = [
  [-25, 35.5],
  [65, 72],
];
const SAMPLE_DATA_URL = "data/samples-golden.json";

const state = {
  samples: [],
  activeSample: null,
  country: "all",
  inputLayer: INPUT_LAYERS.find((l) => l.id === "s1rtc"),
  overlayLayer: OVERLAY_LAYERS.find((l) => l.id === "tim-sar-l"),
  mapStyle: "light",
  map: null,
  markers: new Map(),
};

const el = {
  countrySelect: document.getElementById("country-select"),
  sampleSelect: document.getElementById("sample-select"),
  inputSelect: document.getElementById("input-select"),
  overlaySelect: document.getElementById("overlay-select"),
  sampleTitle: document.getElementById("sample-title"),
  sampleCoords: document.getElementById("sample-coords"),
  comparison: document.getElementById("comparison"),
  baseImage: document.getElementById("base-image"),
  overlayImage: document.getElementById("overlay-image"),
  overlaySlider: document.getElementById("overlay-slider"),
  copyCitation: document.getElementById("copy-citation"), // safe — guarded in bindEvents
  bibtex: document.getElementById("bibtex"),
  legendImage: document.getElementById("legend-image"),
  legendImage2: document.getElementById("legend-image2"),
};

const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function imagePath(layer, sample) {
  return `${layer.path}/${sample.id}.png`;
}

function formatCoord(value, pos, neg) {
  const dir = value >= 0 ? pos : neg;
  return `${Math.abs(value).toFixed(4)} ${dir}`;
}

function isExpectedLngLat(lng, lat) {
  return lng >= EUROPE_VIEW_BOUNDS[0][0]
    && lng <= EUROPE_VIEW_BOUNDS[1][0]
    && lat >= EUROPE_VIEW_BOUNDS[0][1]
    && lat <= EUROPE_VIEW_BOUNDS[1][1];
}

function normalizeSample(sample) {
  const sourcePair = Array.isArray(sample.coordinates) ? sample.coordinates : [sample.lon, sample.lat];
  let lng = Number(sourcePair[0]);
  let lat = Number(sourcePair[1]);

  if (!isExpectedLngLat(lng, lat) && isExpectedLngLat(Number(sourcePair[1]), Number(sourcePair[0]))) {
    lng = Number(sourcePair[1]);
    lat = Number(sourcePair[0]);
  }

  return {
    ...sample,
    lon: lng,
    lat,
    coordinates: [lng, lat],
  };
}

function coordinatePair(sample) {
  // MapLibre expects [longitude, latitude]. This pair is generated from the source CSV lon/lat columns.
  return [Number(sample.coordinates[0]), Number(sample.coordinates[1])];
}

function countrySamples() {
  if (state.country === "all") return state.samples;
  return state.samples.filter((sample) => sample.country === state.country);
}

function formatCount(value, counter) {
  const decimals = Number(counter.dataset.decimals || 0);
  const formatted = value.toFixed(decimals);
  return counter.dataset.format === "comma" ? Number(formatted).toLocaleString("en-US") : formatted;
}

function animateCounter(counter) {
  if (counter.dataset.animated === "true") return;
  counter.dataset.animated = "true";

  const target = Number(counter.dataset.count);
  if (!Number.isFinite(target) || prefersReducedMotion) {
    counter.textContent = counter.dataset.format === "comma" ? target.toLocaleString("en-US") : counter.textContent;
    return;
  }

  const duration = 1100;
  const startedAt = performance.now();

  function tick(now) {
    const progress = Math.min((now - startedAt) / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    counter.textContent = formatCount(target * eased, counter);
    if (progress < 1) requestAnimationFrame(tick);
  }

  requestAnimationFrame(tick);
}

function initPageEffects() {
  document.documentElement.classList.add("js-ready");

  const revealTargets = document.querySelectorAll([
    ".hero-shell",
    ".section-inner",
    ".tldr-card",
    ".paper-figure",
    ".method-steps article",
    ".stat-grid div",
    ".demo-metrics div",
    ".map-card",
    ".explorer-card",
    ".result-takeaways li",
    ".result-table-card",
    ".bibtex",
  ].join(","));

  revealTargets.forEach((target) => target.classList.add("reveal-target"));

  if (!("IntersectionObserver" in window) || prefersReducedMotion) {
    revealTargets.forEach((target) => target.classList.add("in-view"));
    document.querySelectorAll("[data-count]").forEach(animateCounter);
    return;
  }

  const revealObserver = new IntersectionObserver((entries, observer) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add("in-view");
      entry.target.querySelectorAll("[data-count]").forEach(animateCounter);
      if (entry.target.matches("[data-count]")) animateCounter(entry.target);
      observer.unobserve(entry.target);
    });
  }, { threshold: 0.16 });

  revealTargets.forEach((target) => revealObserver.observe(target));
  document.querySelectorAll("[data-count]").forEach((counter) => revealObserver.observe(counter));

  const navLinks = [...document.querySelectorAll(".nav-links a")];
  const sectionObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      navLinks.forEach((link) => {
        link.classList.toggle("active", link.getAttribute("href") === `#${entry.target.id}`);
      });
    });
  }, { rootMargin: "-34% 0px -52% 0px", threshold: 0.01 });

  document.querySelectorAll("section[id]").forEach((section) => sectionObserver.observe(section));
}

function populateStaticControls(locations) {
  el.countrySelect.innerHTML = [
    `<option value="all">All countries (${state.samples.length})</option>`,
    ...Object.entries(locations).map(([name, count]) => `<option value="${name}">${name} (${count})</option>`),
  ].join("");

  el.inputSelect.innerHTML = INPUT_LAYERS.map(
    (layer) => `<option value="${layer.id}">${layer.label}</option>`,
  ).join("");

  el.overlaySelect.innerHTML = OVERLAY_LAYERS.map(
    (layer) => `<option value="${layer.id}">${layer.label}</option>`,
  ).join("");
  el.overlaySelect.value = state.overlayLayer.id;
}

function populateSampleSelect() {
  const samples = countrySamples();
  el.sampleSelect.innerHTML = samples.map((sample) => {
    const label = sample.region || sample.id;
    return `<option value="${sample.id}">${label}</option>`;
  }).join("");

  if (!samples.some((sample) => sample.id === state.activeSample?.id)) {
    setActiveSample(samples[0] || state.samples[0]);
  } else if (state.activeSample) {
    el.sampleSelect.value = state.activeSample.id;
  }
}

function updateLegend() {
  if (state.inputLayer.id === "dem") {
    el.legendImage.src = "./assets/legend_dem.png";
    el.legendImage.alt = "DEM legend";
    el.legendImage2.src = "./assets/legend_w_fh.png";
    el.legendImage2.alt = "Flood hazard legend";
    el.legendImage2.style.display = "block";
  } else if (state.inputLayer.id === "lulc") {
    el.legendImage.src = "./assets/legend_lulc.png";
    el.legendImage.alt = "LULC legend";
    el.legendImage2.style.display = "none";
  } else {
    el.legendImage.src = "./assets/legend_w_fh.png";
    el.legendImage.alt = "Flood hazard legend";
    el.legendImage2.style.display = "none";
  }
}

function updateImages() {
  if (!state.activeSample) return;
  el.baseImage.src = imagePath(state.inputLayer, state.activeSample);
  el.overlayImage.src = imagePath(state.overlayLayer, state.activeSample);
}

function updateMeta() {
  const sample = state.activeSample;
  if (!sample) return;
  el.sampleTitle.textContent = `${sample.region}, ${sample.country}`;
  el.sampleCoords.textContent = `Latitude ${formatCoord(sample.lat, "N", "S")} · Longitude ${formatCoord(sample.lon, "E", "W")}`;
  el.sampleSelect.value = sample.id;
}

function updateMarkerStates() {
  state.markers.forEach(({ marker, node, sample }) => {
    const visible = state.country === "all" || sample.country === state.country;
    const markerElement = marker.getElement();
    markerElement.style.display = visible ? "block" : "none";
    markerElement.style.zIndex = state.activeSample?.id === sample.id ? "10" : "1";
    node.classList.toggle("active", state.activeSample?.id === sample.id);
    markerElement.setAttribute("aria-label", `${sample.country} ${sample.region || sample.id}`);
  });
}

function setActiveSample(sample, options = {}) {
  if (!sample) return;
  state.activeSample = sample;

  if (options.updateCountry) {
    state.country = sample.country;
    el.countrySelect.value = sample.country;
    populateSampleSelect();
  }

  updateMeta();
  updateImages();
  updateMarkerStates();
}

function bindEvents() {
  el.countrySelect.addEventListener("change", () => {
    state.country = el.countrySelect.value;
    populateSampleSelect();
    updateMarkerStates();
    fitSamples(countrySamples(), { animate: true });
  });

  el.sampleSelect.addEventListener("change", () => {
    const sample = state.samples.find((item) => item.id === el.sampleSelect.value);
    setActiveSample(sample, { fly: true });
  });

  el.inputSelect.addEventListener("change", () => {
    state.inputLayer = INPUT_LAYERS.find((layer) => layer.id === el.inputSelect.value) || INPUT_LAYERS[0];
    updateImages();
    updateLegend(); // ← add this
  });

  el.overlaySelect.addEventListener("change", () => {
    state.overlayLayer = OVERLAY_LAYERS.find((layer) => layer.id === el.overlaySelect.value) || OVERLAY_LAYERS[0];
    updateImages();
  });

  el.overlaySlider.addEventListener("input", () => {
    el.comparison.style.setProperty("--reveal", `${el.overlaySlider.value}%`);
  });
  el.comparison.style.setProperty("--reveal", `${el.overlaySlider.value}%`);

  if (el.copyCitation) {
    el.copyCitation.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(el.bibtex.textContent.trim());
        el.copyCitation.textContent = "Copied";
        setTimeout(() => {
          el.copyCitation.textContent = "Copy BibTeX";
        }, 1800);
      } catch {
        el.copyCitation.textContent = "Select BibTeX above";
      }
    });
  }
}

document.querySelectorAll(".result-tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    // Update active tab button
    document.querySelectorAll(".result-tab").forEach((t) => t.classList.remove("active"));
    tab.classList.add("active");

    // Show matching table, hide others
    document.querySelectorAll(".result-table-card").forEach((card) => {
      card.hidden = card.id !== tab.dataset.target;
    });
  });
});

async function init() {
  const response = await fetch(SAMPLE_DATA_URL);
  const data = await response.json();
  state.samples = (data.samples || [])
    .map(normalizeSample)
    .sort((a, b) => a.rank - b.rank);

  populateStaticControls(data.locations || {});
  bindEvents();

  // Default: France / Paris, S1RTC context, TiM SAR->LULC overlay
  const initial =
    state.samples.find((s) => s.country === "France" && s.region === "Paris") ||
    state.samples.find((s) => s.featured) ||
    state.samples[0];

  // Sync the layer dropdowns to the pre-set state values
  el.inputSelect.value = state.inputLayer.id;
  el.overlaySelect.value = state.overlayLayer.id;

  setActiveSample(initial);
  populateSampleSelect();
  updateLegend(); // ← add this
  // initMap();
}

initPageEffects();
init().catch((error) => {
  console.error("ZeroFlood: failed to load sample data →", error);
  el.sampleTitle.textContent = "Samples unavailable";
  el.sampleCoords.textContent = "Could not fetch data/samples-golden.json — serve the page via a local web server (e.g. npx serve .) instead of opening the file directly.";
});
