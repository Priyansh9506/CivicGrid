/*
 * Practical - 4: CivicGrid — Area-Wise Task Manager + Kanban Board
 * Description: Extends Practical-3 with three HTML5 APIs:
 *              I.   Geolocation API — detect user's current location
 *              II.  Local Storage API — persist tasks across sessions
 *              III. Drag and Drop API — Kanban board with draggable cards
 */

// ── Constants ──
const STORAGE_KEY = 'civicgrid_tasks';
const KANBAN_COLUMNS = [
    { id: 'reported',   label: '📋 Reported',    colorClass: 'col-reported' },
    { id: 'inprogress', label: '🔧 In Progress', colorClass: 'col-inprogress' },
    { id: 'resolved',   label: '✅ Resolved',    colorClass: 'col-resolved' }
];

// Default sample tasks (same as Practical-3 with added status & location)
const DEFAULT_TASKS = [
    { id: 1, text: "Repair main water pipe leak", area: "Downtown", completed: false, status: "reported", location: "Downtown", coords: { lat: 23.0257, lng: 72.5786 }, image: null, createdAt: Date.now() - 86400000 },
    { id: 2, text: "Fix streetlights on 5th Avenue", area: "North Zone", completed: false, status: "inprogress", location: "North Zone", coords: { lat: 23.0784, lng: 72.5998 }, image: null, createdAt: Date.now() - 43200000 },
    { id: 3, text: "Clear garbage dump near park", area: "South Zone", completed: true, status: "resolved", location: "South Zone", coords: { lat: 22.9904, lng: 72.5936 }, image: null, createdAt: Date.now() - 172800000 },
    { id: 4, text: "Fill potholes on Highway 9", area: "East Zone", completed: false, status: "reported", location: "East Zone", coords: { lat: 23.0334, lng: 72.6324 }, image: null, createdAt: Date.now() - 3600000 }
];

// ── State ──
let tasks = [];
let userLocation = null;
let userCoords = null;
let currentView = 'list'; // 'list' or 'kanban'

// Leaflet state variables
let map = null;
let selectedMarker = null;
let taskMarkers = [];

const ZONE_COORDS = {
    "North Zone": { lat: 23.0784, lng: 72.5998 },
    "South Zone": { lat: 22.9904, lng: 72.5936 },
    "East Zone": { lat: 23.0334, lng: 72.6324 },
    "West Zone": { lat: 23.0366, lng: 72.5456 },
    "Downtown": { lat: 23.0257, lng: 72.5786 }
};

// =======================================================
// II. LOCAL STORAGE API — Load and Save Tasks
// =======================================================

function loadTasks() {
    // II. Retrieve tasks from Local Storage
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
        try {
            tasks = JSON.parse(saved);
            // Migrate old tasks that lack status/createdAt/coords
            tasks = tasks.map(t => ({
                ...t,
                status: t.status || (t.completed ? 'resolved' : 'reported'),
                createdAt: t.createdAt || Date.now(),
                location: t.location || null,
                coords: t.coords || (ZONE_COORDS[t.area] || null)
            }));
        } catch (e) {
            console.warn('Failed to parse saved tasks, using defaults.');
            tasks = [...DEFAULT_TASKS];
        }
    } else {
        tasks = [...DEFAULT_TASKS];
    }
    saveTasks();
}

function saveTasks() {
    // II. Persist tasks to Local Storage
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
}

// =======================================================
// I. GEOLOCATION API — Detect User's Location
// =======================================================

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

            const popupContent = `
                <div style="min-width: 180px; max-width: 240px; font-family: 'Inter', sans-serif;">
                    <h4 class="popup-title" style="margin: 0 0 6px 0; font-size: 0.95rem; color: var(--text-main); font-weight:600;">${task.text}</h4>
                    <p style="margin: 2px 0; font-size: 0.8rem; color: var(--text-muted)">
                        <strong>Area:</strong> ${task.area}
                    </p>
                    ${task.reporterDetails ? `
                    <p style="margin: 4px 0; font-size: 0.75rem; color: var(--text-muted); background: #f8fafc; padding: 6px; border-radius: 6px; border: 1px solid #e2e8f0;">
                        <strong>Reporter:</strong> ${task.reporterDetails.name} (${task.reporterDetails.gender}, ${task.reporterDetails.age})<br>
                        <strong>Aadhar:</strong> ${task.reporterDetails.aadhar}<br>
                        <strong>Residence:</strong> ${task.reporterDetails.residence}
                    </p>` : ''}
                    <div class="popup-meta" style="display: flex; gap: 6px; margin-top: 6px;">
                        <span class="tag" style="background: ${statusBadgeColor}; color: var(--text-main); font-size: 0.7rem; padding: 2px 6px;">
                            ${statusLabel}
                        </span>
                        ${task.location ? `<span class="tag tag-location" style="font-size: 0.7rem; padding: 2px 6px;">🌐 ${task.location}</span>` : ''}
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
// VIEW TOGGLE — Switch between List and Kanban
// =======================================================

function switchView(view) {
    currentView = view;
    document.getElementById('listView').style.display = view === 'list' ? '' : 'none';
    document.getElementById('kanbanView').style.display = view === 'kanban' ? '' : 'none';
    document.getElementById('btnListView').classList.toggle('active', view === 'list');
    document.getElementById('btnKanbanView').classList.toggle('active', view === 'kanban');
    render();
}

// =======================================================
// TASK MANAGEMENT — Add, Toggle, Remove
// =======================================================

function addTask() {
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

    const reporterDetails = { name, aadhar, age, gender, residence };

    const file = imageInput.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function (e) {
            createTaskObject(text, area, reporterDetails, e.target.result);
            imageInput.value = '';
        };
        reader.readAsDataURL(file);
    } else {
        createTaskObject(text, area, reporterDetails, null);
    }
}

function createTaskObject(text, area, reporterDetails, imageDataUrl) {
    const newTask = {
        id: Date.now(),
        text: text,
        area: area,
        reporterDetails: reporterDetails,
        image: imageDataUrl,
        completed: false,
        status: 'reported',
        location: userLocation || area,  // Attach detected location or default area name
        coords: userCoords ? { ...userCoords } : (ZONE_COORDS[area] || null),
        createdAt: Date.now()
    };
    tasks.push(newTask);
    saveTasks();   // II. Persist to Local Storage

    document.getElementById('taskInput').value = '';
    document.getElementById('areaInput').value = '';
    document.getElementById('reporterName').value = '';
    document.getElementById('reporterAadhar').value = '';
    document.getElementById('reporterAge').value = '';
    document.getElementById('reporterGender').value = '';
    document.getElementById('reporterResidence').value = '';

    // Reset location selection
    userCoords = null;
    userLocation = null;
    if (selectedMarker) {
        map.removeLayer(selectedMarker);
        selectedMarker = null;
    }
    document.getElementById('locationText').textContent = '📍 Detect My Location';

    render();
    showToast('✅ Task added!');
}

function toggleTask(id) {
    tasks = tasks.map(task => {
        if (task.id === id) {
            const newCompleted = !task.completed;
            return {
                ...task,
                completed: newCompleted,
                status: newCompleted ? 'resolved' : 'reported'
            };
        }
        return task;
    });
    saveTasks();   // II. Persist change
    render();
}

function removeTask(id) {
    tasks = tasks.filter(task => task.id !== id);
    saveTasks();   // II. Persist deletion
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
                reporterInfo.innerHTML = `<strong>Reported by:</strong> ${task.reporterDetails.name} (Aadhar: ${task.reporterDetails.aadhar})`;
                taskContent.appendChild(reporterInfo);
            }

            if (task.image) {
                const img = document.createElement('img');
                img.src = task.image;
                img.className = 'w-full max-w-sm max-h-52 object-cover rounded-xl border border-slate-200 mt-2';
                taskContent.appendChild(img);
            }

            const actions = document.createElement('div');
            actions.className = 'actions flex items-center gap-2 self-end sm:self-center';

            const toggleBtn = document.createElement('button');
            toggleBtn.className = task.completed ? 'px-4 py-2 bg-amber-100 text-amber-700 hover:bg-amber-200 rounded-xl text-xs font-bold transition' : 'px-4 py-2 bg-emerald-100 text-emerald-700 hover:bg-emerald-200 rounded-xl text-xs font-bold transition';
            toggleBtn.textContent = task.completed ? 'Undo' : 'Complete';
            toggleBtn.onclick = () => toggleTask(task.id);

            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'px-4 py-2 bg-rose-100 text-rose-700 hover:bg-rose-200 rounded-xl text-xs font-bold transition';
            deleteBtn.textContent = 'Remove';
            deleteBtn.onclick = () => removeTask(task.id);

            actions.appendChild(toggleBtn);
            actions.appendChild(deleteBtn);

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

let draggedTaskId = null;

function handleDragStart(e) {
    draggedTaskId = e.target.dataset.taskId;
    e.dataTransfer.setData('text/plain', draggedTaskId);
    e.dataTransfer.effectAllowed = 'move';
    setTimeout(() => e.target.classList.add('opacity-40', 'rotate-2', 'scale-95'), 0);
}

function handleDragEnd(e) {
    e.target.classList.remove('opacity-40', 'rotate-2', 'scale-95');
    draggedTaskId = null;
    document.querySelectorAll('.kanban-column').forEach(col => col.classList.remove('bg-orange-50', 'border-brand-500'));
}

function handleDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    e.currentTarget.classList.add('bg-orange-50', 'border-brand-500');
}

function handleDragLeave(e) {
    if (!e.currentTarget.contains(e.relatedTarget)) {
        e.currentTarget.classList.remove('bg-orange-50', 'border-brand-500');
    }
}

function handleDrop(e) {
    e.preventDefault();
    e.currentTarget.classList.remove('bg-orange-50', 'border-brand-500');

    const taskId = parseInt(e.dataTransfer.getData('text/plain'));
    const newStatus = e.currentTarget.dataset.status;

    const task = tasks.find(t => t.id === taskId);
    if (task && task.status !== newStatus) {
        task.status = newStatus;
        task.completed = (newStatus === 'resolved');
        saveTasks();        // II. Persist change
        render();
        const colLabel = KANBAN_COLUMNS.find(c => c.id === newStatus).label;
        showToast(`✨ Moved to ${colLabel}`);
    }
}

function renderKanbanView() {
    const board = document.getElementById('kanbanBoard');
    board.innerHTML = '';

    KANBAN_COLUMNS.forEach(col => {
        const colEl = document.createElement('div');
        colEl.className = `kanban-column bg-slate-50/80 border-2 border-dashed border-slate-200 rounded-2xl p-4 flex flex-col min-h-[320px] transition-all duration-200`;
        colEl.dataset.status = col.id;

        colEl.addEventListener('dragover', handleDragOver);
        colEl.addEventListener('dragleave', handleDragLeave);
        colEl.addEventListener('drop', handleDrop);

        const colTasks = tasks.filter(t => t.status === col.id);

        let headerColorClass = 'text-blue-600 border-blue-200';
        let countBgClass = 'bg-blue-100 text-blue-700';
        if (col.id === 'inprogress') {
            headerColorClass = 'text-brand-600 border-orange-200';
            countBgClass = 'bg-orange-100 text-brand-700';
        } else if (col.id === 'resolved') {
            headerColorClass = 'text-emerald-600 border-emerald-200';
            countBgClass = 'bg-emerald-100 text-emerald-700';
        }

        const header = document.createElement('div');
        header.className = `flex items-center justify-between pb-3 mb-3 border-b-2 ${headerColorClass}`;
        header.innerHTML = `
            <h3 class="text-xs font-bold uppercase tracking-wider">${col.label}</h3>
            <span class="px-2.5 py-0.5 rounded-full text-xs font-extrabold ${countBgClass}">${colTasks.length}</span>
        `;
        colEl.appendChild(header);

        const cardList = document.createElement('div');
        cardList.className = 'card-list flex-1 space-y-3';

        if (colTasks.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'h-24 rounded-xl border-2 border-dashed border-slate-200 flex items-center justify-center text-xs text-slate-400 italic';
            empty.textContent = 'Drop tasks here';
            cardList.appendChild(empty);
        } else {
            colTasks.forEach(task => {
                const card = document.createElement('div');
                card.className = `kanban-card bg-white border border-slate-200 rounded-xl p-4 shadow-sm hover:shadow-md cursor-grab active:cursor-grabbing transition space-y-2 relative ${col.id === 'resolved' ? 'opacity-70 hover:opacity-100' : ''}`;
                card.draggable = true;
                card.dataset.taskId = task.id;
                card.addEventListener('dragstart', handleDragStart);
                card.addEventListener('dragend', handleDragEnd);

                const title = document.createElement('div');
                title.className = `text-xs font-semibold text-slate-900 leading-snug pr-4 ${col.id === 'resolved' ? 'line-through text-slate-400' : ''}`;
                title.textContent = task.text;
                card.appendChild(title);

                const tags = document.createElement('div');
                tags.className = 'flex flex-wrap gap-1.5';

                const areaTag = document.createElement('span');
                areaTag.className = 'px-2 py-0.5 bg-orange-100 text-brand-700 rounded-md text-[10px] font-bold';
                areaTag.textContent = task.area;
                tags.appendChild(areaTag);

                if (task.location) {
                    const locTag = document.createElement('span');
                    locTag.className = 'px-2 py-0.5 bg-purple-100 text-purple-700 rounded-md text-[10px] font-bold';
                    locTag.textContent = `📍 ${task.location}`;
                    tags.appendChild(locTag);
                }
                card.appendChild(tags);

                if (task.image) {
                    const img = document.createElement('img');
                    img.src = task.image;
                    img.className = 'w-full max-h-28 object-cover rounded-lg border border-slate-200';
                    img.alt = 'Task photo';
                    card.appendChild(img);
                }

                const footer = document.createElement('div');
                footer.className = 'flex items-center justify-between pt-1 border-t border-slate-100 text-[11px]';

                const timeEl = document.createElement('span');
                timeEl.className = 'text-slate-400 font-medium';
                timeEl.textContent = timeAgo(task.createdAt);
                footer.appendChild(timeEl);

                const delBtn = document.createElement('button');
                delBtn.className = 'text-slate-400 hover:text-rose-600 hover:bg-rose-50 px-2 py-0.5 rounded transition font-medium';
                delBtn.textContent = '🗑️ Remove';
                delBtn.onclick = (e) => {
                    e.stopPropagation();
                    removeTask(task.id);
                };
                footer.appendChild(delBtn);

                card.appendChild(footer);
                cardList.appendChild(card);
            });
        }

        colEl.appendChild(cardList);
        board.appendChild(colEl);
    });
}

// =======================================================
// UNIFIED RENDER
// =======================================================

function render() {
    if (currentView === 'list') {
        renderListView();
    } else {
        renderKanbanView();
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
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 2500);
}

// =======================================================
// INIT — Load from Local Storage and render
// =======================================================

loadTasks();   // II. Load persisted tasks
initMap();     // Initialize Leaflet map
render();
