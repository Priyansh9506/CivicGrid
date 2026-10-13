/*
 * Practical - 9: CivicGrid — Area-Wise Task Manager + Kanban Board + RBAC
 * Description: Role-Based Authentication and Access Control layered over
 *              Geolocation, Drag and Drop, Leaflet map, Vue Kanban.
 *              Status changes are restricted to Officers/Admins.
 *              Deletion is owner-only for Citizens, universal for Admins.
 */

// ── State ──
let tasks = [];
let userLocation = null;
let userCoords = null;
let currentView = 'list'; // 'list' or 'kanban'

// Leaflet state variables
let map = null;
let selectedMarker = null;
let taskMarkers = [];

// =======================================================
// API — talk to the Node.js + MySQL backend
// =======================================================

async function api(url, options = {}) {
    const res = await fetch(url, { credentials: 'same-origin', ...options });
    if (res.status === 401) {
        window.location.href = 'login.html';
        throw new Error('Please sign in.');
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
    return data;
}

async function loadTasks() {
    try {
        tasks = await api('/api/complaints');
    } catch (err) {
        showToast(`⚠️ ${err.message}`);
    }
}

// Used by List view (Complete/Undo) and the Kanban drag & drop
async function updateTaskStatus(id, status, source) {
    try {
        const updated = await api(`/api/complaints/${id}/status`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status, source })
        });
        tasks = tasks.map(t => (t.id === id ? updated : t));
        render();
        return true;
    } catch (err) {
        showToast(`⚠️ ${err.message}`);
        return false;
    }
}

// =======================================================
// MAP INTEGRATION — Initialize Map, Handle Clicks & Markers
// =======================================================

function initMap() {
    // Initialize map centered at default coordinates (Ahmedabad)
    const defaultCenter = [23.0225, 72.5714];
    map = L.map('map').setView(defaultCenter, 12);

    // Add OpenStreetMap tile layer
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);

    // Handle map clicks to place a selection pin manually
    map.on('click', async (e) => {
        const { lat, lng } = e.latlng;
        userCoords = { lat, lng };
        placeSelectionPin(lat, lng);
        await updateAddressFromCoords(lat, lng);
    });
}

function getSelectionIcon() {
    return L.divIcon({
        html: `<div style="position: relative; width: 24px; height: 24px;">
            <div style="
                background-color: #ef4444; 
                border: 2px solid #ffffff; 
                width: 16px; 
                height: 16px; 
                border-radius: 50%; 
                box-shadow: 0 2px 6px rgba(0,0,0,0.4);
                position: absolute;
                top: 4px;
                left: 4px;
                z-index: 2;
            "></div>
            <div style="
                background-color: #ef4444;
                opacity: 0.4;
                width: 24px;
                height: 24px;
                border-radius: 50%;
                animation: pulse 1.5s infinite ease-in-out;
                position: absolute;
                top: 0;
                left: 0;
                z-index: 1;
            "></div>
        </div>`,
        className: 'custom-selection-marker',
        iconSize: [24, 24],
        iconAnchor: [12, 12]
    });
}

function getMarkerIcon(status) {
    let color;
    switch (status) {
        case 'resolved': color = '#16a34a'; break; // green
        case 'inprogress': color = '#f97316'; break; // orange
        case 'reported':
        default: color = '#3b82f6'; break; // blue
    }
    
    return L.divIcon({
        html: `<div style="
            background-color: ${color}; 
            border: 2px solid #ffffff; 
            width: 16px; 
            height: 16px; 
            border-radius: 50%; 
            box-shadow: 0 2px 5px rgba(0,0,0,0.3);
            display: inline-block;
        "></div>`,
        className: 'custom-task-marker',
        iconSize: [16, 16],
        iconAnchor: [8, 8]
    });
}

function placeSelectionPin(lat, lng) {
    if (selectedMarker) {
        selectedMarker.setLatLng([lat, lng]);
    } else {
        selectedMarker = L.marker([lat, lng], { icon: getSelectionIcon() }).addTo(map);
    }
}

async function updateAddressFromCoords(lat, lng) {
    const textEl = document.getElementById('locationText');
    const btn = document.getElementById('locationBtn');
    
    btn.classList.add('detecting');
    textEl.textContent = '⏳ Reverse geocoding…';

    try {
        const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`
        );
        const data = await res.json();
        if (data && data.address) {
            const addr = data.address;
            const readable = addr.suburb || addr.neighbourhood || addr.city_district || addr.city || addr.town || addr.state || 'Selected Point';
            userLocation = readable;
        } else {
            userLocation = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
        }
    } catch (err) {
        console.warn('Reverse geocode failed, using coordinates.');
        userLocation = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
    }

    textEl.textContent = `📍 ${userLocation}`;
    btn.classList.remove('detecting');
    showToast(`📍 Selected: ${userLocation}`);
}

function renderMapMarkers() {
    if (!map) return;

    // Clear existing task markers from the map
    taskMarkers.forEach(m => map.removeLayer(m));
    taskMarkers = [];

    // Filter tasks that have coordinates and render them
    tasks.forEach(task => {
        if (task.coords && task.coords.lat && task.coords.lng) {
            const marker = L.marker([task.coords.lat, task.coords.lng], {
                icon: getMarkerIcon(task.status)
            });

            // Create a premium looking popup card
            let imageTag = '';
            if (task.image) {
                imageTag = `<img src="${task.image}" class="popup-img" alt="Task photo">`;
            }

            let statusBadgeColor;
            let statusLabel;
            if (task.status === 'resolved') {
                statusBadgeColor = '#dcfce7';
                statusLabel = 'Resolved';
            } else if (task.status === 'inprogress') {
                statusBadgeColor = '#ffedd5';
                statusLabel = 'In Progress';
            } else {
                statusBadgeColor = '#dbeafe';
                statusLabel = 'Reported';
            }

            const r = task.reporterDetails;
            const popupContent = `
                <div style="min-width: 180px; max-width: 240px; font-family: 'Inter', sans-serif;">
                    <h4 class="popup-title" style="margin: 0 0 6px 0; font-size: 0.95rem; color: var(--text-main); font-weight:600;">${escapeHtml(task.text)}</h4>
                    <p style="margin: 2px 0; font-size: 0.8rem; color: var(--text-muted)">
                        <strong>Area:</strong> ${escapeHtml(task.area)}
                    </p>
                    ${r ? `
                    <p style="margin: 4px 0; font-size: 0.75rem; color: var(--text-muted); background: #f8fafc; padding: 6px; border-radius: 6px; border: 1px solid #e2e8f0;">
                        <strong>Reporter:</strong> ${escapeHtml(r.name)} (${escapeHtml(r.gender)}, ${escapeHtml(r.age)})<br>
                        <strong>Aadhar:</strong> ${escapeHtml(r.aadhar)}<br>
                        <strong>Residence:</strong> ${escapeHtml(r.residence)}
                    </p>` : ''}
                    <div class="popup-meta" style="display: flex; gap: 6px; margin-top: 6px;">
                        <span class="tag" style="background: ${statusBadgeColor}; color: var(--text-main); font-size: 0.7rem; padding: 2px 6px;">
                            ${statusLabel}
                        </span>
                        ${task.location ? `<span class="tag tag-location" style="font-size: 0.7rem; padding: 2px 6px;">🌐 ${escapeHtml(task.location)}</span>` : ''}
                    </div>
                    ${imageTag}
                </div>
            `;

            marker.bindPopup(popupContent);
            marker.addTo(map);
            taskMarkers.push(marker);
        }
    });
}

// =======================================================
// I. GEOLOCATION API — Detect User's Location
// =======================================================

function detectLocation() {
    const btn = document.getElementById('locationBtn');
    const textEl = document.getElementById('locationText');

    // I. Check if Geolocation API is available
    if (!navigator.geolocation) {
        showToast('⚠️ Geolocation is not supported by your browser.');
        return;
    }

    btn.classList.add('detecting');
    textEl.textContent = '⏳ Detecting…';

    // I. Use Geolocation API to get current position
    navigator.geolocation.getCurrentPosition(
        async (position) => {
            const { latitude, longitude } = position.coords;
            userCoords = { lat: latitude, lng: longitude };

            // Center map on user location and drop selection pin
            if (map) {
                map.setView([latitude, longitude], 14);
                placeSelectionPin(latitude, longitude);
            }

            // Reverse geocode via free Nominatim API
            try {
                const res = await fetch(
                    `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json`
                );
                const data = await res.json();
                if (data && data.address) {
                    const addr = data.address;
                    const readable = addr.suburb || addr.neighbourhood || addr.city_district || addr.city || addr.town || addr.state || 'Detected';
                    userLocation = readable;
                } else {
                    userLocation = `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;
                }
            } catch (err) {
                console.warn('Reverse geocode failed, using raw coordinates.');
                userLocation = `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;
            }

            textEl.textContent = `📍 ${userLocation}`;
            btn.classList.remove('detecting');
            showToast(`📍 Location detected: ${userLocation}`);
        },
        (error) => {
            btn.classList.remove('detecting');
            let msg = 'Location access denied.';
            if (error.code === 2) msg = 'Location unavailable.';
            if (error.code === 3) msg = 'Location request timed out.';
            textEl.textContent = '📍 Detect My Location';
            showToast(`⚠️ ${msg}`);
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
}

// =======================================================
// TASK MANAGEMENT — Add, Toggle, Remove (saved in MySQL)
// =======================================================

async function addTask() {
    const input = document.getElementById('taskInput');
    const areaInput = document.getElementById('areaInput');
    const imageInput = document.getElementById('imageInput');

    const reporterName = document.getElementById('reporterName');
    const reporterAadhar = document.getElementById('reporterAadhar');
    const reporterAge = document.getElementById('reporterAge');
    const reporterGender = document.getElementById('reporterGender');
    const reporterResidence = document.getElementById('reporterResidence');

    const text = input.value.trim();
    const area = areaInput.value;
    const name = reporterName.value.trim();
    const aadhar = reporterAadhar.value.trim();
    const age = reporterAge.value.trim();
    const gender = reporterGender.value;
    const residence = reporterResidence.value.trim();

    if (!text || !area || !name || !aadhar || !age || !gender || !residence) {
        showToast('⚠️ Please fill in all reporter and issue details.');
        return;
    }

    if (!/^\d{12}$/.test(aadhar)) {
        showToast('⚠️ Aadhar number must be 12 digits.');
        return;
    }

    const file = imageInput.files[0];
    if (file && file.size > 5 * 1024 * 1024) {
        showToast('⚠️ Image must be 5 MB or smaller.');
        return;
    }

    // multipart/form-data so the image goes to the server as a file and is stored in MySQL
    const form = new FormData();
    form.append('text', text);
    form.append('area', area);
    form.append('reporterName', name);
    form.append('reporterAadhar', aadhar);
    form.append('reporterAge', age);
    form.append('reporterGender', gender);
    form.append('reporterResidence', residence);
    form.append('location', userLocation || area);  // Attach detected location or default area name
    if (userCoords) {
        form.append('lat', userCoords.lat);
        form.append('lng', userCoords.lng);
    }
    if (file) form.append('image', file);

    const submitBtn = document.getElementById('submitBtn');
    submitBtn.disabled = true;
    try {
        const newTask = await api('/api/complaints', { method: 'POST', body: form });
        tasks.push(newTask);
    } catch (err) {
        showToast(`⚠️ ${err.message}`);
        return;
    } finally {
        submitBtn.disabled = false;
    }

    // Keep the signed-in user's name/Aadhar filled in for the next complaint
    input.value = '';
    areaInput.value = '';
    imageInput.value = '';
    reporterAge.value = '';
    reporterGender.value = '';
    reporterResidence.value = '';

    // Reset location selection
    userCoords = null;
    userLocation = null;
    if (selectedMarker) {
        map.removeLayer(selectedMarker);
        selectedMarker = null;
    }
    document.getElementById('locationText').textContent = '📍 Detect My Location';

    render();
    showToast('✅ Complaint saved!');
}

function toggleTask(id) {
    const task = tasks.find(t => t.id === id);
    if (!task) return;
    updateTaskStatus(id, task.completed ? 'reported' : 'resolved', 'list');
}

async function removeTask(id) {
    if (!confirm('Remove this complaint permanently?')) return;
    try {
        await api(`/api/complaints/${id}`, { method: 'DELETE' });
    } catch (err) {
        showToast(`⚠️ ${err.message}`);
        return;
    }
    tasks = tasks.filter(task => task.id !== id);
    render();
    showToast('🗑️ Task removed');
}

// =======================================================
// RENDERING — List View (original Practical-3)
// =======================================================

function renderListView() {
    const container = document.getElementById('tasksContainer');
    container.innerHTML = '';

    if (tasks.length === 0) {
        container.innerHTML = '<p class="text-center text-slate-400 py-10 text-sm font-medium">No tasks found.</p>';
        return;
    }

    // Group tasks by Area (original logic)
    const groupedTasks = tasks.reduce((acc, task) => {
        if (!acc[task.area]) acc[task.area] = [];
        acc[task.area].push(task);
        return acc;
    }, {});

    for (const [area, areaTasks] of Object.entries(groupedTasks)) {
        const areaSection = document.createElement('div');
        areaSection.className = 'area-section mb-8';

        const areaTitle = document.createElement('div');
        areaTitle.className = 'text-lg font-bold text-slate-900 border-l-4 border-brand-500 pl-3 mb-4';
        areaTitle.textContent = area;
        areaSection.appendChild(areaTitle);

        const ul = document.createElement('ul');
        ul.className = 'space-y-4';

        areaTasks.forEach(task => {
            const li = document.createElement('li');
            li.className = 'bg-white border border-slate-200 rounded-2xl p-5 flex flex-col sm:flex-row justify-between items-start gap-4 shadow-sm hover:shadow-md transition-all duration-200';
            if (task.completed) li.classList.add('opacity-60', 'bg-slate-50');

            const taskContent = document.createElement('div');
            taskContent.className = 'task-content flex-1 space-y-2 w-full';

            const title = document.createElement('div');
            title.className = `text-base font-semibold text-slate-900 ${task.completed ? 'line-through text-slate-400' : ''}`;
            title.textContent = task.text;

            const meta = document.createElement('div');
            meta.className = 'task-meta flex flex-wrap gap-2 text-xs';

            const areaTag = document.createElement('span');
            areaTag.className = 'px-3 py-1 bg-orange-100 text-brand-700 rounded-full font-bold';
            areaTag.textContent = `📍 ${task.area}`;
            meta.appendChild(areaTag);

            if (task.location) {
                const locTag = document.createElement('span');
                locTag.className = 'px-3 py-1 bg-purple-100 text-purple-700 rounded-full font-bold';
                locTag.textContent = `🌐 ${task.location}`;
                meta.appendChild(locTag);
            }

            taskContent.appendChild(title);
            taskContent.appendChild(meta);

            if (task.reporterDetails) {
                const reporterInfo = document.createElement('div');
                reporterInfo.className = 'text-xs text-slate-500 bg-slate-50 p-2.5 rounded-xl border border-slate-200';
                reporterInfo.innerHTML = `<strong>Reported by:</strong> ${escapeHtml(task.reporterDetails.name)} (Aadhar: ${escapeHtml(task.reporterDetails.aadhar)})`;
                taskContent.appendChild(reporterInfo);
            }

            if (task.image) {
                const img = document.createElement('img');
                img.src = task.image;
                img.className = 'w-full max-w-sm max-h-52 object-cover rounded-xl border border-slate-200 mt-2';
                taskContent.appendChild(img);
            }

            const actions = document.createElement('div');
            actions.className = 'actions flex flex-col items-end gap-2 self-end sm:self-center';

            // RBAC: Complete/Undo button only visible to Officer & Admin
            const vue = window.vueComponent;
            const canUpdateStatus = vue && vue.state.canUpdateStatus;
            const canDeleteAny = vue && vue.state.canDeleteAny;
            const canDeleteOwn = vue && vue.state.canDeleteOwn;
            const userId = vue && vue.state.userId;
            const isOwner = task.createdBy === userId;

            if (canUpdateStatus) {
                const toggleBtn = document.createElement('button');
                toggleBtn.className = task.completed ? 'px-4 py-2 bg-amber-100 text-amber-700 hover:bg-amber-200 rounded-xl text-xs font-bold transition' : 'px-4 py-2 bg-emerald-100 text-emerald-700 hover:bg-emerald-200 rounded-xl text-xs font-bold transition';
                toggleBtn.textContent = task.completed ? 'Undo' : 'Complete';
                toggleBtn.onclick = () => toggleTask(task.id);
                actions.appendChild(toggleBtn);
            }

            // RBAC: Remove button — Admin (any), Citizen (own only)
            if (canDeleteAny || (canDeleteOwn && isOwner)) {
                const deleteBtn = document.createElement('button');
                deleteBtn.className = 'px-4 py-2 bg-rose-100 text-rose-700 hover:bg-rose-200 rounded-xl text-xs font-bold transition';
                deleteBtn.textContent = 'Remove';
                deleteBtn.onclick = () => removeTask(task.id);
                actions.appendChild(deleteBtn);
            }

            // If no actions available, show a lock icon
            if (!actions.children.length) {
                const lockMsg = document.createElement('span');
                lockMsg.className = 'text-[11px] text-slate-400 font-medium';
                lockMsg.textContent = '🔒 Read Only';
                actions.appendChild(lockMsg);
            }

            li.appendChild(taskContent);
            li.appendChild(actions);
            ul.appendChild(li);
        });

        areaSection.appendChild(ul);
        container.appendChild(areaSection);
    }
}

// =======================================================
// III. DRAG AND DROP API — Kanban Board Rendering
// =======================================================

// Kanban rendering and drag-and-drop logic has been migrated to Vue.js
// See index.html for the Vue template and methods handling this view.

// =======================================================
// UNIFIED RENDER
// =======================================================

function render() {
    window.tasks = tasks; // Export to global scope for Vue
    if (window.vueComponent) {
        window.vueComponent.state.tasks = tasks;
        window.vueComponent.state.currentView = currentView;
    }

    if (currentView === 'list') {
        document.getElementById('listView').style.display = '';
        renderListView();
    } else {
        document.getElementById('listView').style.display = 'none';
        // Kanban view rendering is now handled reactivity by Vue in index.html
    }
    renderMapMarkers();
}

// Alias for backward compat (used by old toggleTask/removeTask calls)
function renderTasks() { render(); }

// =======================================================
// UTILITIES
// =======================================================

function timeAgo(timestamp) {
    const diff = Date.now() - timestamp;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
}

function showToast(msg) {
    const toast = document.getElementById('toast');
    toast.textContent = msg;
    toast.classList.remove('opacity-0', 'translate-y-4');
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => toast.classList.add('opacity-0', 'translate-y-4'), 2500);
}

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, ch => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[ch]);
}

// =======================================================
// INIT — called from index.html once Vue has mounted
// =======================================================

async function initApp() {
    initMap();          // Initialize Leaflet map
    await loadTasks();  // Load complaints from MySQL
    render();
}
