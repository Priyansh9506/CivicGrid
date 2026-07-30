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
    { id: 1, text: "Repair main water pipe leak", area: "Downtown", completed: false, status: "reported", location: null, image: null, createdAt: Date.now() - 86400000 },
    { id: 2, text: "Fix streetlights on 5th Avenue", area: "North Zone", completed: false, status: "inprogress", location: null, image: null, createdAt: Date.now() - 43200000 },
    { id: 3, text: "Clear garbage dump near park", area: "South Zone", completed: true, status: "resolved", location: null, image: null, createdAt: Date.now() - 172800000 },
    { id: 4, text: "Fill potholes on Highway 9", area: "East Zone", completed: false, status: "reported", location: null, image: null, createdAt: Date.now() - 3600000 }
];

// ── State ──
let tasks = [];
let userLocation = null;
let currentView = 'list'; // 'list' or 'kanban'

// =======================================================
// II. LOCAL STORAGE API — Load and Save Tasks
// =======================================================

function loadTasks() {
    // II. Retrieve tasks from Local Storage
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
        try {
            tasks = JSON.parse(saved);
            // Migrate old tasks that lack status/createdAt
            tasks = tasks.map(t => ({
                ...t,
                status: t.status || (t.completed ? 'resolved' : 'reported'),
                createdAt: t.createdAt || Date.now(),
                location: t.location || null
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
            userLocation = `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;

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
                }
            } catch (err) {
                console.warn('Reverse geocode failed, using raw coordinates.');
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

    const text = input.value.trim();
    const area = areaInput.value;

    if (!text || !area) {
        showToast('⚠️ Please fill in task description and area.');
        return;
    }

    const file = imageInput.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function (e) {
            createTaskObject(text, area, e.target.result);
            imageInput.value = '';
        };
        reader.readAsDataURL(file);
    } else {
        createTaskObject(text, area, null);
    }
}

function createTaskObject(text, area, imageDataUrl) {
    const newTask = {
        id: Date.now(),
        text: text,
        area: area,
        image: imageDataUrl,
        completed: false,
        status: 'reported',
        location: userLocation,  // I. Attach detected location
        createdAt: Date.now()
    };
    tasks.push(newTask);
    saveTasks();   // II. Persist to Local Storage

    document.getElementById('taskInput').value = '';
    document.getElementById('areaInput').value = '';

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
        container.innerHTML = '<p style="text-align: center; color: var(--text-muted); padding: 40px 0;">No tasks found.</p>';
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
        areaSection.className = 'area-section';

        const areaTitle = document.createElement('div');
        areaTitle.className = 'area-title';
        areaTitle.textContent = area;
        areaSection.appendChild(areaTitle);

        const ul = document.createElement('ul');

        areaTasks.forEach(task => {
            const li = document.createElement('li');
            if (task.completed) li.classList.add('completed');

            const taskContent = document.createElement('div');
            taskContent.className = 'task-content';

            const title = document.createElement('div');
            title.className = 'task-title';
            title.textContent = task.text;

            const meta = document.createElement('div');
            meta.className = 'task-meta';

            const areaTag = document.createElement('span');
            areaTag.className = 'tag';
            areaTag.textContent = `📍 ${task.area}`;
            meta.appendChild(areaTag);

            // Show location tag if available
            if (task.location) {
                const locTag = document.createElement('span');
                locTag.className = 'tag tag-location';
                locTag.textContent = `🌐 ${task.location}`;
                meta.appendChild(locTag);
            }

            taskContent.appendChild(title);
            taskContent.appendChild(meta);

            if (task.image) {
                const img = document.createElement('img');
                img.src = task.image;
                img.className = 'task-image';
                taskContent.appendChild(img);
            }

            const actions = document.createElement('div');
            actions.className = 'actions';

            const toggleBtn = document.createElement('button');
            toggleBtn.className = task.completed ? 'btn-undo' : 'btn-toggle';
            toggleBtn.textContent = task.completed ? 'Undo' : 'Complete';
            toggleBtn.onclick = () => toggleTask(task.id);

            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'btn-delete';
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
    // III. Set the task ID into the dataTransfer object
    draggedTaskId = e.target.dataset.taskId;
    e.dataTransfer.setData('text/plain', draggedTaskId);
    e.dataTransfer.effectAllowed = 'move';
    setTimeout(() => e.target.classList.add('dragging'), 0);
}

function handleDragEnd(e) {
    e.target.classList.remove('dragging');
    draggedTaskId = null;
    document.querySelectorAll('.kanban-column').forEach(col => col.classList.remove('drag-over'));
}

function handleDragOver(e) {
    // III. Prevent default to allow drop
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    e.currentTarget.classList.add('drag-over');
}

function handleDragLeave(e) {
    if (!e.currentTarget.contains(e.relatedTarget)) {
        e.currentTarget.classList.remove('drag-over');
    }
}

function handleDrop(e) {
    // III. Handle the drop — move the task to the new column status
    e.preventDefault();
    e.currentTarget.classList.remove('drag-over');

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
        colEl.className = `kanban-column ${col.colorClass}`;
        colEl.dataset.status = col.id;

        // III. Attach drop-zone event listeners
        colEl.addEventListener('dragover', handleDragOver);
        colEl.addEventListener('dragleave', handleDragLeave);
        colEl.addEventListener('drop', handleDrop);

        const colTasks = tasks.filter(t => t.status === col.id);

        // Column header
        const header = document.createElement('div');
        header.className = 'column-header';
        header.innerHTML = `
            <h3>${col.label}</h3>
            <span class="column-count">${colTasks.length}</span>
        `;
        colEl.appendChild(header);

        // Card list
        const cardList = document.createElement('div');
        cardList.className = 'card-list';

        if (colTasks.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'kanban-empty';
            empty.textContent = 'Drop tasks here';
            cardList.appendChild(empty);
        } else {
            colTasks.forEach(task => {
                const card = document.createElement('div');
                card.className = 'kanban-card';
                // III. Make card draggable
                card.draggable = true;
                card.dataset.taskId = task.id;
                card.addEventListener('dragstart', handleDragStart);
                card.addEventListener('dragend', handleDragEnd);

                // Drag handle
                const handle = document.createElement('div');
                handle.className = 'drag-handle';
                handle.textContent = '⠿';
                card.appendChild(handle);

                // Title
                const title = document.createElement('div');
                title.className = 'card-title';
                title.textContent = task.text;
                card.appendChild(title);

                // Tags
                const tags = document.createElement('div');
                tags.className = 'card-tags';

                const areaTag = document.createElement('span');
                areaTag.className = 'tag';
                areaTag.textContent = task.area;
                tags.appendChild(areaTag);

                if (task.location) {
                    const locTag = document.createElement('span');
                    locTag.className = 'tag tag-location';
                    locTag.textContent = `📍 ${task.location}`;
                    tags.appendChild(locTag);
                }
                card.appendChild(tags);

                // Image
                if (task.image) {
                    const img = document.createElement('img');
                    img.src = task.image;
                    img.className = 'card-image';
                    img.alt = 'Task photo';
                    card.appendChild(img);
                }

                // Footer
                const footer = document.createElement('div');
                footer.className = 'card-footer';

                const timeEl = document.createElement('span');
                timeEl.className = 'card-time';
                timeEl.textContent = timeAgo(task.createdAt);
                footer.appendChild(timeEl);

                const delBtn = document.createElement('button');
                delBtn.className = 'btn-card-delete';
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
render();
