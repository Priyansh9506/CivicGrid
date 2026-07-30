/*
 * Practical - 3: CivicGrid — Area-Wise Task Manager
 * Description: Client-side logic for managing civic tasks using
 *              JSON data structures, DOM manipulation, array methods
 *              (map, filter, reduce), FileReader API for image uploads,
 *              and dynamic area-based grouping/rendering.
 */

// Tasks stored in a JSON array
let tasks = [
    { id: 1, text: "Repair main water pipe leak", area: "Downtown", completed: false },
    { id: 2, text: "Fix streetlights on 5th Avenue", area: "North Zone", completed: false },
    { id: 3, text: "Clear garbage dump near park", area: "South Zone", completed: true },
    { id: 4, text: "Fill potholes on Highway 9", area: "East Zone", completed: false }
];

function renderTasks() {
    const container = document.getElementById('tasksContainer');
    
    container.innerHTML = '';

    if (tasks.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: var(--text-muted); padding: 40px 0;">No tasks found.</p>';
        return;
    }

    // Group tasks by Area
    const groupedTasks = tasks.reduce((acc, task) => {
        if (!acc[task.area]) {
            acc[task.area] = [];
        }
        acc[task.area].push(task);
        return acc;
    }, {});

    // Render grouped tasks
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
            if (task.completed) {
                li.classList.add('completed');
            }

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

function addTask() {
    const input = document.getElementById('taskInput');
    const areaInput = document.getElementById('areaInput');
    const imageInput = document.getElementById('imageInput');
    
    const text = input.value.trim();
    const area = areaInput.value;
    const file = imageInput.files[0];
    
    if (text && area) {
        if (file) {
            const reader = new FileReader();
            reader.onload = function(e) {
                createTaskObject(text, area, e.target.result);
                imageInput.value = ''; // clear input
            }
            reader.readAsDataURL(file);
        } else {
            createTaskObject(text, area, null);
        }
    } else {
        alert("Please fill in all fields (Task Description and Area).");
    }
}

function createTaskObject(text, area, imageDataUrl) {
    const newTask = {
        id: Date.now(),
        text: text,
        area: area,
        image: imageDataUrl,
        completed: false
    };
    tasks.push(newTask);
    
    // Reset inputs
    document.getElementById('taskInput').value = '';
    document.getElementById('areaInput').value = '';
    
    renderTasks();
}

function toggleTask(id) {
    tasks = tasks.map(task => {
        if (task.id === id) {
            return { ...task, completed: !task.completed };
        }
        return task;
    });
    renderTasks();
}

function removeTask(id) {
    tasks = tasks.filter(task => task.id !== id);
    renderTasks();
}

// Initial render
renderTasks();
