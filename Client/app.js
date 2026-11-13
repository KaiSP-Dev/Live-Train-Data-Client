// =============================================================================
// SYSTEM CONFIGURATION
// =============================================================================
let DIAGRAM_CONFIG = {
    ENABLED_CLASSES: {},
    REVERSE_FORMATION: false
};

// Auto-detect if we are running locally or on Vercel
const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

let API_BASE = isLocal 
    ? 'http://localhost:5000' 
    : 'http://145.241.233.162:5000';

let LOCATIONS_CACHE = {};
let CRS_CACHE = {};
let TOCS_CACHE = {};

const appView = document.getElementById("app-view");
const toast = document.getElementById("toast");
const statusPill = document.getElementById("connection-status");
const apiUrlInput = document.getElementById("api-url");
const locInput = document.getElementById("loc-input");
const autocompleteList = document.getElementById("autocomplete-list");
const tocSelect = document.getElementById("toc-select");
const dateInput = document.getElementById("date-input");
const directDateInput = document.getElementById("direct-date-input");
const filterPanel = document.getElementById("filter-panel");
const filterToggleBtn = document.getElementById("filter-toggle-btn");

let currentAutocompleteIndex = -1;
let autocompleteDebounceTimer = null;
let isFilterPanelVisible = true;

async function loadDiagramConfig() {
    try {
        const res = await fetch("diagram_config.json");
        if (res.ok) {
            DIAGRAM_CONFIG = await res.json();
        } else {
            console.warn("diagram_config.json not found, using default empty config.");
        }
    } catch (err) {
        console.warn("Could not load diagram_config.json. Proceeding without diagrams.", err);
    }
}

function getCarriageNumber(unitClass, unitNumber, coachIndex, totalCoaches) {
    let uNumStr = String(unitNumber).trim();
    if (unitClass === "700" && uNumStr.length >= 3) {
        let suffix = uNumStr.slice(-3);
        let prefix = 400 + parseInt(coachIndex);
        return `${prefix}${suffix}`;
    }
    return `${unitNumber} Coach ${coachIndex}`;
}

function initSystemDates() {
    const todayIso = new Date().toISOString().split("T")[0];
    dateInput.value = todayIso;
    directDateInput.value = todayIso;
}

function getCurrentTimeString() {
    const now = new Date();
    return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
}

function formatUkDate(isoDateStr) {
    if (!isoDateStr) return 'N/A';
    const parts = isoDateStr.split('-');
    if (parts.length === 3) return `${parts[2]}-${parts[1]}-${parts[0]}`;
    return isoDateStr;
}

function formatDateTimeWithSeconds(isoStr) {
    if (!isoStr) return null;
    const d = new Date(isoStr);
    if (isNaN(d.getTime())) return isoStr;
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    const seconds = String(d.getSeconds()).padStart(2, '0');
    return `${day}-${month}-${year} ${hours}:${minutes}:${seconds}`;
}

function getDayOfWeekName(isoDateStr) {
    if (!isoDateStr) return '';
    const parts = isoDateStr.split('-');
    if (parts.length === 3) {
        return new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2])).toLocaleDateString('en-GB', { weekday: 'long' });
    }
    return '';
}

function expandLocation(code) {
    if (!code) return "";
    const clean = code.trim().toUpperCase();
    if (LOCATIONS_CACHE[clean] && LOCATIONS_CACHE[clean].name) return LOCATIONS_CACHE[clean].name;
    if (CRS_CACHE[clean]) return CRS_CACHE[clean];
    for (const [tip, info] of Object.entries(LOCATIONS_CACHE)) {
        if (info.crs && info.crs.trim().toUpperCase() === clean) return info.name || clean;
    }
    return clean;
}

function expandToc(code) {
    if (!code) return "National Rail";
    const clean = code.trim().toUpperCase();
    if (TOCS_CACHE[clean] && TOCS_CACHE[clean].name) return TOCS_CACHE[clean].name;
    return clean;
}

function getTocBadgeHtml(code) {
    if (!code || code === 'ZZ') {
        return `<span class="badge badge-toc" style="background-color: #334155 !important; color: #cbd5e1 !important;">ZZ</span>`;
    }
    const clean = code.trim().toUpperCase();
    const info = TOCS_CACHE[clean] || {};
    const bgCol = info.colour || info.color || info.background || "#1e293b";
    
    let textCol = info.text_colour || info.textColor || info.text_color;
    if (!textCol) {
        const hex = bgCol.replace('#', '');
        if (hex.length === 6) {
            const r = parseInt(hex.substr(0, 2), 16);
            const g = parseInt(hex.substr(2, 2), 16);
            const b = parseInt(hex.substr(4, 2), 16);
            const yiq = ((r * 299) + (g * 587) + (b * 114)) / 1000;
            textCol = (yiq >= 135) ? '#000000' : '#ffffff';
        } else {
            textCol = '#ffffff';
        }
    }
    return `<span class="badge badge-toc" style="background-color: ${bgCol} !important; color: ${textCol} !important;" title="${info.name || clean}">${clean}</span>`;
}

function formatAllowance(raw, typeName) {
    if (!raw) return null;
    let clean = String(raw).trim().toUpperCase();
    if (clean.endsWith('H') || clean.endsWith('.5')) {
        const num = clean.replace(/H|\.5$/, '');
        clean = num ? `${num}½` : '½';
    } else if (clean.endsWith('Q') || clean.endsWith('.25')) {
        const num = clean.replace(/Q|\.25$/, '');
        clean = num ? `${num}¼` : '¼';
    } else if (clean.endsWith('T') || clean.endsWith('.75')) {
        const num = clean.replace(/T|\.75$/, '');
        clean = num ? `${num}¾` : '¾';
    }
    return `${clean}min ${typeName}`;
}

function formatDaysRunsPills(mask) {
    if (!mask || mask.length !== 7) return '';
    const days = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
    let html = '<div class="day-pills">';
    for (let i = 0; i < 7; i++) {
        html += `<span class="day-pill ${mask[i] === '1' ? 'active' : 'inactive'}">${days[i]}</span>`;
    }
    html += '</div>';
    return html;
}

async function loadReferenceCaches() {
    try {
        const [tocRes, locRes] = await Promise.all([
            fetch(`${API_BASE}/api/tocs`),
            fetch(`${API_BASE}/api/locations-db`)
        ]);

        if (tocRes.ok) {
            const rawTocs = await tocRes.json();
            TOCS_CACHE = {};
            for (const [k, v] of Object.entries(rawTocs)) {
                TOCS_CACHE[k.toUpperCase()] = v;
            }
        }

        if (locRes.ok) {
            const rawLocs = await locRes.json();
            LOCATIONS_CACHE = {};
            CRS_CACHE = {};
            for (const [tip, info] of Object.entries(rawLocs)) {
                const tipClean = tip.toUpperCase();
                LOCATIONS_CACHE[tipClean] = info;
                if (info.crs && String(info.crs).trim().length === 3) {
                    CRS_CACHE[String(info.crs).trim().toUpperCase()] = info.name || tipClean;
                }
            }
        }
        populateTocsDropdown();
    } catch (e) {
        console.warn("Could not populate reference caches:", e);
    }
}

function populateTocsDropdown() {
    const sortedCodes = Object.keys(TOCS_CACHE).sort();
    let optionsHtml = `<option value="ALL">All Operators</option>`;
    sortedCodes.forEach(code => {
        const name = TOCS_CACHE[code].name || code;
        optionsHtml += `<option value="${code}">${code} - ${name}</option>`;
    });
    tocSelect.innerHTML = optionsHtml;
}

async function testApiConnection() {
    API_BASE = apiUrlInput.value.replace(/\/+$/, "");
    try {
        const res = await fetch(`${API_BASE}/api/tocs`, { method: "GET" });
        if (res.ok) {
            statusPill.className = "status-pill status-online";
            statusPill.innerText = "API Connected";
            await loadReferenceCaches();
            return true;
        }
    } catch (e) {
        statusPill.className = "status-pill status-offline";
        statusPill.innerText = "API Offline";
    }
    return false;
}

apiUrlInput.addEventListener("change", (e) => {
    API_BASE = e.target.value.replace(/\/+$/, "");
    testApiConnection();
});

function showToast(msg, isError = false) {
    toast.innerText = msg;
    toast.className = `toast ${isError ? 'error' : 'info'}`;
    toast.style.display = 'block';
    setTimeout(() => { toast.style.display = 'none'; }, 6000);
}

function switchTab(tabId, updateUrl = true) {
    document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
    document.querySelectorAll(".tab-content").forEach(c => c.classList.remove("active"));

    const btn = document.getElementById(`tab-btn-${tabId}`);
    const content = document.getElementById(`tab-${tabId}`);
    if (btn) btn.classList.add("active");
    if (content) content.classList.add("active");

    if (updateUrl && window.location.hash.startsWith(`#/${tabId}`)) {
        window.location.hash = `#/${tabId}`;
    }
}

function toggleFilterPanel() {
    isFilterPanelVisible = !isFilterPanelVisible;
    if (isFilterPanelVisible) {
        filterPanel.style.display = "block";
        filterToggleBtn.innerText = "Hide detailed filtering options ▴";
    } else {
        filterPanel.style.display = "none";
        filterToggleBtn.innerText = "Show detailed filtering options ▾";
    }
}

locInput.addEventListener("input", (e) => {
    const val = e.target.value.trim();
    clearTimeout(autocompleteDebounceTimer);
    if (!val || val.length < 1) {
        autocompleteList.style.display = 'none';
        return;
    }
    autocompleteDebounceTimer = setTimeout(() => { fetchLocationAutocomplete(val); }, 150);
});

locInput.addEventListener("keydown", (e) => {
    const items = autocompleteList.querySelectorAll(".autocomplete-item");
    if (autocompleteList.style.display !== 'block' || items.length === 0) return;

    if (e.key === "ArrowDown") {
        e.preventDefault();
        currentAutocompleteIndex = (currentAutocompleteIndex + 1) % items.length;
        updateAutocompleteSelection(items);
    } else if (e.key === "ArrowUp") {
        e.preventDefault();
        currentAutocompleteIndex = (currentAutocompleteIndex - 1 + items.length) % items.length;
        updateAutocompleteSelection(items);
    } else if (e.key === "Enter" && currentAutocompleteIndex >= 0) {
        e.preventDefault();
        items[currentAutocompleteIndex].click();
    }
});

document.addEventListener("click", (e) => {
    if (!e.target.closest(".search-box-wrapper")) autocompleteList.style.display = 'none';
});

async function fetchLocationAutocomplete(query) {
    try {
        const res = await fetch(`${API_BASE}/api/stations/autocomplete?q=${encodeURIComponent(query)}`);
        if (!res.ok) return;
        const matches = await res.json();
        if (!matches || matches.length === 0) {
            autocompleteList.style.display = 'none';
            return;
        }

        currentAutocompleteIndex = -1;
        let html = '';
        matches.forEach((item) => {
            const badge = item.is_station ? `<span class="autocomplete-badge">Station</span>` : `<span class="autocomplete-badge">TIPLOC</span>`;
            html += `
                <div class="autocomplete-item" onclick="selectLocation('${item.code}', '${item.name.replace(/'/g, "\\'")}')">
                    <span class="autocomplete-name">${item.name} ${badge}</span>
                    <span class="autocomplete-code">${item.code}</span>
                </div>
            `;
        });
        autocompleteList.innerHTML = html;
        autocompleteList.style.display = 'block';
    } catch (err) {
        autocompleteList.style.display = 'none';
    }
}

function updateAutocompleteSelection(items) {
    items.forEach((it, idx) => { it.classList.toggle("selected", idx === currentAutocompleteIndex); });
    if (currentAutocompleteIndex >= 0) items[currentAutocompleteIndex].scrollIntoView({ block: "nearest" });
}

function selectLocation(code, name) {
    locInput.value = code;
    autocompleteList.style.display = 'none';
    executeDetailedSearch();
}

function handleLocationFormSubmit(e) {
    if (e) e.preventDefault();
    executeDetailedSearch();
}

async function executeDetailedSearch(updateUrl = true) {
    autocompleteList.style.display = 'none';
    const loc = locInput.value.trim().toUpperCase();
    if (!loc) {
        showToast("Please enter a location name, CRS code, or TIPLOC.", true);
        return;
    }

    const toc = tocSelect.value;
    const whenVal = document.getElementById("when-select").value;
    const dateVal = dateInput.value || new Date().toISOString().split("T")[0];
    const prevCall = document.getElementById("prev-call-input").value.trim();
    const laterCall = document.getElementById("later-call-input").value.trim();
    const serviceType = document.getElementById("service-type-select").value;

    let mode = "window";
    let timeParam = "";
    if (whenVal === "all") mode = "all";
    else if (whenVal === "window") { mode = "window"; timeParam = getCurrentTimeString(); } 
    else { mode = "window"; timeParam = whenVal; }

    const stpList = [];
    if (document.getElementById("stp-wtt").checked) stpList.push("WTT");
    if (document.getElementById("stp-var").checked) stpList.push("VAR");
    if (document.getElementById("stp-stp").checked) stpList.push("STP");
    if (document.getElementById("stp-can").checked) stpList.push("CAN");
    const stpParam = stpList.length ? stpList.join(",") : "WTT,VAR,STP";

    const params = new URLSearchParams({
        location: loc, toc: toc, date: dateVal, mode: mode, service_type: serviceType, stp_types: stpParam
    });
    if (timeParam) params.set("time", timeParam);
    if (prevCall) params.set("prev_call", prevCall);
    if (laterCall) params.set("later_call", laterCall);

    if (updateUrl) window.location.hash = `#/location/${loc}?${params.toString()}`;

    try {
        const res = await fetch(`${API_BASE}/api/location-schedule?${params.toString()}`);
        if (!res.ok) {
            showToast(`Location "${loc}" not found or has no matching services.`, true);
            return;
        }
        const data = await res.json();
        renderLocationBoard(data, dateVal);
    } catch (err) {
        showToast(`Failed to load location schedule: ${err.message}`, true);
    }
}

function renderLocationBoard(data, dateVal) {
    const locName = data.location_name || expandLocation(data.location_code || data.primary_tiploc);
    const services = data.services || [];
    const displayDate = data.running_date || formatUkDate(dateVal);
    const displayDay = data.running_day || getDayOfWeekName(dateVal);

    let rowsHtml = '';
    services.forEach(s => {
        const stpBadge = getBadgeHtml(s.stp_type);
        const tocBadge = getTocBadgeHtml(s.toc);
        const originName = expandLocation(s.origin);
        const destName = expandLocation(s.destination);
        
        const actualPlat = (s.actual_platform || '').trim();
        const bookedPlat = (s.platform || '').trim();

        let platHtml = '';
        if (actualPlat && bookedPlat && actualPlat !== bookedPlat) {
            platHtml = `<span class="plat-pill plat-altered">Plat ${actualPlat} <span class="plat-booked-sub">(Booked ${bookedPlat})</span></span>`;
        } else if (actualPlat || bookedPlat) {
            platHtml = `<span class="plat-pill">Plat ${actualPlat || bookedPlat}</span>`;
        }

        let isCancelled = Boolean(s.cancellation_code);
        let rowStyle = isCancelled ? "background: rgba(239, 68, 68, 0.08); text-decoration: line-through var(--badge-can);" : "";
        let cancelTag = isCancelled ? `<span class="badge" style="background: var(--badge-can); color:#fff; margin-left: 6px;">CANCELLED</span>` : '';

        const arrDisp = s.is_pass ? `<span style="color: var(--text-muted); font-style: italic;">pass</span>` : (s.arr || '');
        const depDisp = s.is_pass ? (s.pass || s.dep || '') : (s.dep || '');

        rowsHtml += `
            <div class="table-data-row" style="cursor: pointer; ${rowStyle}" onclick="navigateToSchedule('${s.cif_uid}', '${dateVal}')">
                <div class="col-headcode" style="padding: 10px 14px;">${s.headcode} ${cancelTag}</div>
                <div class="cell-time">${arrDisp}</div>
                <div class="cell-time">${depDisp}</div>
                <div class="col-route" style="padding: 10px 14px;">${originName} ➔ ${destName}</div>
                <div class="col-toc" style="padding: 10px 14px;">${tocBadge}</div>
                <div class="col-plat" style="padding: 10px 14px;">${platHtml}</div>
                <div class="col-stp" style="padding: 10px 14px;">${stpBadge}</div>
            </div>
        `;
    });

    const html = `
        <div class="schedule-header">
            <h2>Location Timetable Board: ${locName} (${data.location_code})</h2>
            <p>Services for <b>${displayDay} ${displayDate}</b> (${services.length} services passing & stopping)</p>
        </div>
        <div class="stops-table-container">
            <div class="table-super-header-row">
                <div class="col-headcode" style="padding: 10px 14px;">Train</div>
                <div style="width: 170px; min-width: 170px; text-align: center; border-right: 2px solid var(--border-divider); padding: 10px 0;">WTT Time</div>
                <div class="col-route" style="padding: 10px 14px;">Origin ➔ Destination</div>
                <div class="col-toc" style="padding: 10px 14px;">TOC</div>
                <div class="col-plat" style="padding: 10px 14px;">Plat</div>
                <div class="col-stp" style="padding: 10px 14px;">Type</div>
            </div>
            ${rowsHtml || '<div style="padding: 24px; text-align: center; color: var(--text-muted);">No trains scheduled during the selected window.</div>'}
        </div>
    `;
    appView.innerHTML = html;
}

function quickDirect(q) {
    document.getElementById("direct-input").value = q;
    handleDirectFormSubmit();
}

function handleDirectFormSubmit(e) {
    if (e) e.preventDefault();
    const raw = document.getElementById("direct-input").value.trim().toUpperCase();
    const dateVal = directDateInput.value || new Date().toISOString().split("T")[0];
    if (!raw) return;

    if (/^\d{5,6}$/.test(raw)) navigateToUnit(raw, dateVal);
    else if (/^\d{2,4}$/.test(raw)) navigateToFleet(raw, dateVal);
    else if (/^[A-Z]\d{5}$/.test(raw) || /^\d[A-Z]\d{2}$/.test(raw)) navigateToSchedule(raw, dateVal);
    else {
        switchTab("location", false);
        locInput.value = raw;
        executeDetailedSearch();
    }
}

function navigateToSchedule(uidOrHeadcode, dateVal = null, updateUrl = true) {
    const d = dateVal || directDateInput.value || dateInput.value || new Date().toISOString().split("T")[0];
    if (updateUrl) window.location.hash = `#/service/${uidOrHeadcode}?date=${d}`;
    loadSchedule(uidOrHeadcode, d);
}

function navigateToFleet(traction, dateVal = null, updateUrl = true) {
    const d = dateVal || directDateInput.value || new Date().toISOString().split("T")[0];
    if (updateUrl) window.location.hash = `#/fleet/${traction}?date=${d}`;
    loadTractionServices(traction, d);
}

function navigateToUnit(unit, dateVal = null, updateUrl = true) {
    const d = dateVal || directDateInput.value || new Date().toISOString().split("T")[0];
    if (updateUrl) window.location.hash = `#/unit/${unit}?date=${d}`;
    loadUnitHistory(unit, d);
}

async function loadSchedule(uidOrHeadcode, dateVal) {
    try {
        const res = await fetch(`${API_BASE}/api/service/${encodeURIComponent(uidOrHeadcode)}?date=${encodeURIComponent(dateVal)}`);
        if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            const msg = errData.message || `Schedule "${uidOrHeadcode}" not found for date ${formatUkDate(dateVal)}.`;
            showToast(msg, true);
            return;
        }
        const data = await res.json();
        if (Array.isArray(data)) renderMultipleMatches(data, uidOrHeadcode, dateVal);
        else renderScheduleView(data, dateVal);
    } catch (err) {
        showToast(`Failed to load schedule: ${err.message}`, true);
    }
}

function renderMultipleMatches(services, query, dateVal) {
    const ukDate = formatUkDate(dateVal);
    const dayName = getDayOfWeekName(dateVal);

    let html = `
        <div style="font-size: 18px; font-weight: 700; text-transform: uppercase; margin-bottom: 8px;">Search Results for ${dayName} ${ukDate}</div>
        <p style="color: var(--text-muted); margin-bottom: 20px;">
            Multiple train runs matched <b>${query}</b> on this date. Please select the specific service:
        </p>
        <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(340px, 1fr)); gap: 16px;">
    `;

    services.forEach(s => {
        const stpBadge = getBadgeHtml(s.validity_range?.stp_type || 'WTT');
        const tocBadge = getTocBadgeHtml(s.toc);
        const originName = expandLocation(s.origin);
        const destName = expandLocation(s.destination);
        const tocFullName = expandToc(s.toc);

        html += `
            <div class="spec-card" style="cursor: pointer;" onclick="navigateToSchedule('${s.cif_uid}', '${dateVal}')">
                <div style="font-size: 16px; color: var(--primary); font-weight: 700; margin-bottom: 4px;">
                    ${s.origin_time} ${originName} ➔ ${destName}
                </div>
                <div style="font-size: 13px; color: var(--text-muted); display: flex; align-items: center; gap: 8px;">
                    ${tocBadge} <span>${tocFullName}</span> | <span>Headcode: <b>${s.headcode}</b></span> | ${stpBadge}
                </div>
            </div>
        `;
    });

    html += `</div>`;
    appView.innerHTML = html;
}

function renderScheduleView(s, dateVal) {
    const originName = expandLocation(s.origin);
    const destName = expandLocation(s.destination);
    const targetIsoDate = s.iso_date || dateVal;

    const stpBadge = getBadgeHtml(s.validity_range?.stp_type || 'WTT');
    const tocBadge = getTocBadgeHtml(s.toc);
    const tocFullName = expandToc(s.toc);
    const daysPills = formatDaysRunsPills(s.validity_range?.days_runs);
    const daysText = s.validity_range?.days_runs_text || s.validity_range?.days_runs;
    const tscFlowDescription = s.tsc_description ? ` (${s.tsc_description})` : '';

    const cat = (s.service_spec?.category || '').toUpperCase();
    const isPassengerService = ['OO', 'XX', 'OL', 'OW', 'XC', 'XD', 'XI', 'XR', 'XU', 'XZ', 'EE', 'ES', 'BR', 'BS', 'SS'].includes(cat);

    let displayHeadcode = s.headcode;
    let unitText = 'Unallocated';
    if (s.live_metrics?.active_units && s.live_metrics.active_units.length > 0) {
        unitText = s.live_metrics.active_units.join(' + ');
    }

    let statusText = 'Not departed yet';
    const cancelCode = s.live_metrics?.cancellation_code;
    const lastDelay = s.live_metrics?.last_reported_delay;
    
    if (cancelCode) {
        statusText = `<span style="color: #ef4444;">Cancelled (${s.live_metrics.cancellation_reason})</span>`;
    } else if (lastDelay !== null && lastDelay !== undefined) {
        if (lastDelay >= 1) statusText = `<span style="color: #f59e0b;">Running ${lastDelay}m late</span>`;
        else if (lastDelay <= -1) statusText = `<span style="color: #10b981;">Running ${Math.abs(lastDelay)}m early</span>`;
        else statusText = `<span style="color: #10b981;">Running on time</span>`;
    }

    // 1. Train Diagram HTML
    let diagramVisualizerHtml = '';
    if (s.live_metrics?.active_units_details && s.live_metrics.active_units_details.length > 0) {
        const units = s.live_metrics.active_units_details;
        const supportsDiagrams = units.some(u => DIAGRAM_CONFIG.ENABLED_CLASSES[u.class] === true);
        
        let trainVisualHtml = '';
        if (supportsDiagrams) {
            units.forEach((u) => {
                if (DIAGRAM_CONFIG.ENABLED_CLASSES[u.class]) {
                    const basePath = (u.diagram_path || '').replace("Client/", "");
                    const startCoach = DIAGRAM_CONFIG.REVERSE_FORMATION ? u.coaches : 1;
                    const endCoach = DIAGRAM_CONFIG.REVERSE_FORMATION ? 1 : u.coaches;
                    const step = DIAGRAM_CONFIG.REVERSE_FORMATION ? -1 : 1;

                    let carriagesHtml = '';
                    for(let i = startCoach; DIAGRAM_CONFIG.REVERSE_FORMATION ? i >= endCoach : i <= endCoach; i += step) {
                        let imgPath = `${basePath}/${i}.png`;
                        carriagesHtml += `
                            <div class="rtt-carriage-col">
                                <span class="rtt-carriage-num">Coach ${i}</span>
                                <img src="${imgPath}" alt="C${i}" style="height: 35px; min-width: 72px; object-fit: contain;">
                            </div>
                        `;
                    }

                    trainVisualHtml += `
                        <div style="display: flex; flex-direction: column; align-items: stretch; margin-right: 12px; cursor: pointer;" onclick="navigateToUnit('${u.unit}', '${targetIsoDate}')">
                            <div style="display: flex;">${carriagesHtml}</div>
                            <div class="rtt-unit-bar">${u.unit}</div>
                        </div>
                    `;
                }
            });

            diagramVisualizerHtml = `
                <div class="rtt-card">
                    <div style="font-weight: bold; color: #fff; margin-bottom: 8px;">
                        🚆 ${s.booked_metrics?.traction || 'Standard Unit'} (${s.live_metrics?.actual_coaches || s.booked_metrics?.coaches || '?'} coaches)
                    </div>
                    <div class="rtt-diagram-track">
                        ${trainVisualHtml}
                    </div>
                </div>
            `;
        }
    }

    // 2. Timetable Rows (Without GBTT)
    const assocMap = {};
    (s.diagram_associations || []).forEach(a => {
        const locKey = a.location.trim().toUpperCase();
        if (!assocMap[locKey]) assocMap[locKey] = [];
        assocMap[locKey].push(a);
    });

    let stopsHtml = '';
    (s.timetable_stops || []).forEach(loc => {
        const locKey = loc.tiploc.trim().toUpperCase();
        const locName = expandLocation(loc.tiploc);
        
        let arrWttDisplay = loc.pass_wtt ? 'pass' : (loc.arr_wtt || '');
        let depWttDisplay = loc.pass_wtt ? loc.pass_wtt : (loc.dep_wtt || '');

        let arrRtDisplay = loc.pass_realtime ? 'pass' : (loc.arr_realtime || '');
        let depRtDisplay = loc.pass_realtime ? loc.pass_realtime : (loc.dep_realtime || '');

        let colorClass = '';
        if (loc.delay_minutes !== null && loc.delay_minutes !== undefined && !loc.is_expected) {
            if (loc.delay_minutes <= -1) colorClass = 'color: #10b981; font-weight: bold;';
            else if (loc.delay_minutes >= 1) colorClass = 'color: #ef4444; font-weight: bold;';
        }

        let delayDisplay = '';
        if (loc.delay_minutes !== null && loc.delay_minutes !== undefined && !loc.is_expected) {
            delayDisplay = loc.delay_minutes > 0 ? `${loc.delay_minutes}` : 'RT';
        }

        if (loc.is_cancelled_call) {
            depRtDisplay = '<span style="color: #ef4444; font-style: italic;">cancelled</span>';
            arrRtDisplay = '';
        }

        let subtextHtml = '';
        if (assocMap[locKey]) {
            assocMap[locKey].forEach(a => {
                subtextHtml += `<span class="rtt-loc-sub">${a.context_description}</span>`;
            });
        }

        stopsHtml += `
            <tr>
                <td style="width: 250px;">
                    <span class="rtt-loc-name" style="${loc.is_expected ? 'color: #fff;' : ''}">${locName}</span>
                    ${subtextHtml}
                </td>
                <td class="center-txt">${loc.actual_platform || loc.platform || ''}</td>
                <td class="center-txt" style="color: #94a3b8;">${arrWttDisplay}</td>
                <td class="center-txt" style="color: #94a3b8;">${depWttDisplay}</td>
                <td class="center-txt" style="${colorClass}">${arrRtDisplay}</td>
                <td class="center-txt" style="${colorClass}">${depRtDisplay}</td>
                <td class="center-txt" style="${colorClass}">${delayDisplay}</td>
                <td class="center-txt">${loc.path || ''}</td>
                <td class="center-txt">${loc.actual_route || loc.line || ''}</td>
            </tr>
        `;
    });

    let activationDisplay = 'Standard Timetable';
    if (s.live_metrics?.activation_time) {
        const actFormatted = formatDateTimeWithSeconds(s.live_metrics.activation_time);
        activationDisplay = `${actFormatted} (${s.live_metrics.activation_type || 'Automatic'})`;
    }

    let scheduleUpdatedDisplay = s.schedule_updated_at ? formatDateTimeWithSeconds(s.schedule_updated_at) : 'Base Timetable';

    let passengerSpecificRows = '';
    if (isPassengerService) {
        passengerSpecificRows = `
            <div class="spec-row"><span class="spec-label">Catering:</span><span class="spec-val">${s.service_spec?.catering_desc || 'None'}</span></div>
            <div class="spec-row"><span class="spec-label">Reservations:</span><span class="spec-val">${s.service_spec?.reservations_desc || 'None'}</span></div>
        `;
    }

    let bankHolidayRow = '';
    const bhDesc = s.service_spec?.bank_holiday_running_desc;
    if (bhDesc && !bhDesc.toLowerCase().includes('standard') && s.service_spec?.bank_holiday_running !== ' ') {
        bankHolidayRow = `<div class="spec-row"><span class="spec-label">Bank Holiday:</span><span class="spec-val">${bhDesc}</span></div>`;
    }

    const html = `
        <div class="rtt-header">
            <div class="rtt-title-row">
                <h1>${s.origin_time} ${originName} to ${destName} (${displayHeadcode})</h1>
                <div class="rtt-unit">${unitText}</div>
            </div>
            <h2 class="rtt-status">${statusText}</h2>
        </div>

        ${diagramVisualizerHtml}

        <div class="rtt-card">
            <h3>Live Timetable</h3>
            <div style="overflow-x: auto;">
                <table class="rtt-table">
                    <thead>
                        <tr>
                            <th>Location</th>
                            <th class="center-txt">Pl</th>
                            <th colspan="2" class="time-col">WTT</th>
                            <th colspan="2" class="time-col">Realtime</th>
                            <th class="center-txt">Dly</th>
                            <th class="center-txt">Path</th>
                            <th class="center-txt">Line</th>
                        </tr>
                        <tr>
                            <th></th>
                            <th></th>
                            <th class="time-col">Arr</th>
                            <th class="time-col">Dep</th>
                            <th class="time-col">Arr</th>
                            <th class="time-col">Dep</th>
                            <th></th>
                            <th></th>
                            <th></th>
                        </tr>
                    </thead>
                    <tbody>
                        ${stopsHtml || '<tr><td colspan="9" class="center-txt">No schedule locations found.</td></tr>'}
                    </tbody>
                </table>
            </div>
        </div>

        <div class="spec-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 16px; margin-top: 20px;">
            <div class="rtt-card">
                <h3>Schedule Info</h3>
                <div class="spec-row" style="display:flex; justify-content:space-between; padding:6px 0; border-bottom:1px solid #374151;"><span class="spec-label" style="color:#94a3b8;">Departure:</span><span class="spec-val">${s.origin_time} (${s.running_day || ''})</span></div>
                <div class="spec-row" style="display:flex; justify-content:space-between; padding:6px 0; border-bottom:1px solid #374151;"><span class="spec-label" style="color:#94a3b8;">Timetable Window:</span><span class="spec-val">${s.validity_range?.start_date} to ${s.validity_range?.end_date}</span></div>
                <div class="spec-row" style="display:flex; justify-content:space-between; padding:6px 0; border-bottom:1px solid #374151;"><span class="spec-label" style="color:#94a3b8;">Days Running:</span><span class="spec-val">${daysText} ${daysPills}</span></div>
                <div class="spec-row" style="display:flex; justify-content:space-between; padding:6px 0; border-bottom:1px solid #374151;"><span class="spec-label" style="color:#94a3b8;">Schedule ID (UID):</span><span class="spec-val">${s.cif_uid || 'N/A'}</span></div>
                <div class="spec-row" style="display:flex; justify-content:space-between; padding:6px 0; border-bottom:1px solid #374151;"><span class="spec-label" style="color:#94a3b8;">Schedule Type:</span><span class="spec-val">${stpBadge}</span></div>
                <div class="spec-row" style="display:flex; justify-content:space-between; padding:6px 0; border-bottom:1px solid #374151;"><span class="spec-label" style="color:#94a3b8;">Schedule Updated:</span><span class="spec-val" style="font-family: monospace;">${scheduleUpdatedDisplay}</span></div>
                <div class="spec-row" style="display:flex; justify-content:space-between; padding:6px 0; border-bottom:1px solid #374151;"><span class="spec-label" style="color:#94a3b8;">TRUST Activation:</span><span class="spec-val" style="color: var(--primary); font-family: monospace;">${activationDisplay}</span></div>
                ${s.live_metrics?.trust_id ? `<div class="spec-row" style="display:flex; justify-content:space-between; padding:6px 0; border-bottom:1px solid #374151;"><span class="spec-label" style="color:#94a3b8;">TRUST ID:</span><span class="spec-val" style="color: var(--warning); font-family: monospace;">${s.live_metrics.trust_id}</span></div>` : ''}
                ${bankHolidayRow}
            </div>

            <div class="rtt-card">
                <h3>Train Info & Formation</h3>
                <div class="spec-row" style="display:flex; justify-content:space-between; padding:6px 0; border-bottom:1px solid #374151;"><span class="spec-label" style="color:#94a3b8;">Operated By:</span><span class="spec-val" style="display:flex; align-items:center; gap:6px;">${tocBadge} ${tocFullName}</span></div>
                <div class="spec-row" style="display:flex; justify-content:space-between; padding:6px 0; border-bottom:1px solid #374151;"><span class="spec-label" style="color:#94a3b8;">Allocated Units:</span><span class="spec-val">${unitText}</span></div>
                <div class="spec-row" style="display:flex; justify-content:space-between; padding:6px 0; border-bottom:1px solid #374151;"><span class="spec-label" style="color:#94a3b8;">Service Code (TSC):</span><span class="spec-val">${s.tsc || '—'}${tscFlowDescription}</span></div>
                <div class="spec-row" style="display:flex; justify-content:space-between; padding:6px 0; border-bottom:1px solid #374151;"><span class="spec-label" style="color:#94a3b8;">Booked Speed:</span><span class="spec-val">${s.service_spec?.max_speed ? s.service_spec.max_speed + ' mph' : 'Standard'}</span></div>
                <div class="spec-row" style="display:flex; justify-content:space-between; padding:6px 0; border-bottom:1px solid #374151;"><span class="spec-label" style="color:#94a3b8;">Power Type:</span><span class="spec-val">${s.service_spec?.power_type_desc || s.service_spec?.power_type || 'EMU'}</span></div>
                <div class="spec-row" style="display:flex; justify-content:space-between; padding:6px 0; border-bottom:1px solid #374151;"><span class="spec-label" style="color:#94a3b8;">Booked Traction:</span><span class="spec-val" style="color: var(--badge-var);">${s.booked_metrics?.traction || 'Standard Multiple Unit'}</span></div>
                <div class="spec-row" style="display:flex; justify-content:space-between; padding:6px 0; border-bottom:1px solid #374151;"><span class="spec-label" style="color:#94a3b8;">Service Category:</span><span class="spec-val">${s.service_spec?.category_desc || s.service_spec?.category || 'Ordinary Passenger'}</span></div>
                ${passengerSpecificRows}
            </div>
        </div>
    `;
    appView.innerHTML = html;
}
function jumpToLocationBoard(tiploc, roundedTime) {
    switchTab("location", false);
    locInput.value = tiploc;
    document.getElementById("when-select").value = roundedTime;
    executeDetailedSearch(true);
}

function roundTimeToNearestMinute(timeStr) {
    if (!timeStr) return "08:00";
    let clean = timeStr.trim();
    let addMinute = false;

    if (clean.endsWith('½') || clean.endsWith('¾') || clean.endsWith('H') || clean.endsWith('T')) {
        addMinute = true;
    }
    clean = clean.replace(/[½¼¾HQTD\.]/g, '');
    let [h, m] = clean.split(':').map(Number);
    if (isNaN(h) || isNaN(m)) return "08:00";

    if (addMinute) {
        m += 1;
        if (m >= 60) {
            m = 0;
            h = (h + 1) % 24;
        }
    }
    return `${String(h).padStart(2, '0')}:00`;
}

function getBadgeHtml(stpType) {
    const t = (stpType || 'WTT').toUpperCase();
    if (t === 'VAR') return `<span class="badge badge-var">VAR</span>`;
    if (t === 'STP') return `<span class="badge badge-stp">STP</span>`;
    if (t === 'CAN') return `<span class="badge badge-can">CAN</span>`;
    return `<span class="badge badge-wtt">WTT</span>`;
}

async function loadTractionServices(traction, dateVal) {
    try {
        const res = await fetch(`${API_BASE}/api/services-by-traction?traction=${encodeURIComponent(traction)}&date=${encodeURIComponent(dateVal)}`);
        if (!res.ok) {
            showToast(`No services found booked or allocated for Class "${traction}" on ${formatUkDate(dateVal)}.`, true);
            return;
        }
        const services = await res.json();
        const ukDate = formatUkDate(dateVal);
        const dayName = getDayOfWeekName(dateVal);
        
        let html = `
            <div style="font-size: 18px; font-weight: 700; text-transform: uppercase; margin-bottom: 8px;">Fleet Services: Class ${traction} (${dayName} ${ukDate})</div>
            <p style="color: var(--text-muted); margin-bottom: 20px;">Found ${services.length} services booked or allocated for Class ${traction}:</p>
            <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(340px, 1fr)); gap: 16px;">
        `;
        services.forEach(s => {
            const stpBadge = getBadgeHtml(s.stp_type);
            const tocBadge = getTocBadgeHtml(s.toc);
            const originName = expandLocation(s.origin);
            const destName = expandLocation(s.destination);
            
            let unitsSub = '';
            if (s.allocated_units && s.allocated_units.length > 0) {
                unitsSub = `<span style="color: var(--primary); font-weight: 700;">Units: ${s.allocated_units.join(' + ')}</span> | `;
            }

            html += `
                <div class="spec-card" style="cursor: pointer;" onclick="navigateToSchedule('${s.cif_uid}', '${dateVal}')">
                    <div style="font-size: 16px; color: var(--primary); font-weight: 700; margin-bottom: 4px;">
                        ${s.headcode} | ${s.origin_time} ${originName} ➔ ${destName}
                    </div>
                    <div style="font-size: 13px; color: var(--text-muted); display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                        ${tocBadge} ${unitsSub}<span>${s.booked_traction}</span> | ${stpBadge}
                    </div>
                </div>
            `;
        });
        html += `</div>`;
        appView.innerHTML = html;
    } catch (err) {
        showToast(`Failed to search fleet: ${err.message}`, true);
    }
}

async function loadUnitHistory(unit, dateVal) {
    try {
        const res = await fetch(`${API_BASE}/api/unit-history?unit=${encodeURIComponent(unit)}&date=${encodeURIComponent(dateVal)}`);
        if (!res.ok) {
            showToast(`No allocation history found for Unit #${unit}.`, true);
            return;
        }
        const data = await res.json();

        let logsHtml = '';
        (data.diagram_history || []).forEach(log => {
            const ukDate = formatUkDate(log.date);
            const depTime = (log.origin_time && log.origin_time !== 'N/A') ? log.origin_time : '';
            const originName = expandLocation(log.origin);
            const destName = expandLocation(log.destination);
            const tocBadge = getTocBadgeHtml(log.toc);
            const targetLookup = (log.cif_uid && log.cif_uid !== 'N/A') ? log.cif_uid : (log.service_id || log.headcode);

            logsHtml += `
                <div class="table-data-row" onclick="navigateToSchedule('${targetLookup}', '${log.date}')" style="cursor: pointer;">
                    <div style="width: 120px; min-width: 120px; padding: 10px 14px; color: var(--text-muted); font-family: monospace; font-weight: 600;">${ukDate}</div>
                    <div class="col-route" style="padding: 10px 14px; flex: 1; display: flex; align-items: center; gap: 8px;">
                        <span style="color: var(--primary); font-weight: 800; font-family: monospace;">${log.headcode}</span>
                        ${depTime ? `<span style="color: #fff; font-weight: 700; font-family: monospace;">${depTime}</span>` : ''}
                        <span>${originName} to ${destName}</span>
                    </div>
                    <div class="col-toc" style="padding: 10px 14px;">${tocBadge}</div>
                </div>
            `;
        });

        const html = `
            <div class="schedule-header">
                <h2>Unit Allocation History: Unit #${unit}</h2>
                <p>Class ${data.class || 'Unknown'} | Operator: ${expandToc(data.toc)} | Lifetime Mileage: ${data.lifetime_mileage.toFixed(1)} miles</p>
            </div>

            <div class="stops-table-container">
                <div class="table-super-header-row">
                    <div style="width: 120px; min-width: 120px; padding: 10px 14px; color: #fff;">DATE</div>
                    <div class="col-route" style="padding: 10px 14px; color: #fff; flex: 1;">WORKING</div>
                    <div class="col-toc" style="padding: 10px 14px; color: #fff;">TOC</div>
                </div>
                ${logsHtml || '<div style="padding: 24px; text-align: center; color: var(--text-muted);">No working allocations recorded for this unit on this date.</div>'}
            </div>
        `;
        appView.innerHTML = html;
    } catch (err) {
        showToast(`Failed to load unit history: ${err.message}`, true);
    }
}

function parseAndRouteHash() {
    const rawHash = window.location.hash.replace(/^#\/?/, "");
    if (!rawHash) return;

    const [routePath, queryString] = rawHash.split("?");
    const urlParams = new URLSearchParams(queryString || "");
    const dateParam = urlParams.get("date") || dateInput.value;

    if (routePath.startsWith("location/")) {
        const loc = decodeURIComponent(routePath.split("location/")[1]);
        switchTab("location", false);
        locInput.value = loc;
        executeDetailedSearch(false);
    } else if (routePath.startsWith("service/")) {
        const id = decodeURIComponent(routePath.split("service/")[1]);
        switchTab("direct", false);
        document.getElementById("direct-input").value = id;
        loadSchedule(id, dateParam);
    } else if (routePath.startsWith("fleet/")) {
        const tr = decodeURIComponent(routePath.split("fleet/")[1]);
        switchTab("direct", false);
        document.getElementById("direct-input").value = tr;
        loadTractionServices(tr, dateParam);
    } else if (routePath.startsWith("unit/")) {
        const u = decodeURIComponent(routePath.split("unit/")[1]);
        switchTab("direct", false);
        document.getElementById("direct-input").value = u;
        loadUnitHistory(u, dateParam);
    }
}

window.addEventListener("hashchange", () => {
    parseAndRouteHash();
});

initSystemDates();
loadDiagramConfig().then(() => {
    testApiConnection().then(() => {
        parseAndRouteHash();
    });
});