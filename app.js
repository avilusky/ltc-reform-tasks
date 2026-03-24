// ============================================
// app.js - Main Application Logic
// מערכת ניהול משימות - רפורמת הביטוח הסיעודי
// ============================================

class App {
    constructor() {
        this.currentPage = 'dashboard';
        this.calendar = new CalendarView('calendarGrid');
        this.gantt = new GanttChart('ganttChart');
        this.editingDeps = [];
        this.editingNotes = [];
        this.confirmCallback = null;
        this.upcomingDeptFilter = 'all';
        this.taskViewMode = 'project';

        this.init();
    }

    init() {
        this.bindNavigation();
        this.bindModals();
        this.bindFilters();
        this.bindGanttControls();
        this.bindCalendarControls();
        this.bindMobileMenu();

        // Subscribe to store changes
        store.subscribe(() => this.refresh());

        // Initial render
        this.refresh();
    }

    // === Navigation ===
    bindNavigation() {
        document.querySelectorAll('.nav-item').forEach(item => {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                const page = item.dataset.page;
                this.navigateTo(page);
            });
        });

        document.getElementById('sidebarToggle').addEventListener('click', () => {
            document.getElementById('sidebar').classList.toggle('collapsed');
        });

        document.querySelectorAll('.dept-badge').forEach(badge => {
            badge.addEventListener('click', () => {
                this.navigateToDepartment(badge.dataset.dept);
            });
        });
    }

    navigateTo(page) {
        this.currentPage = page;

        // Update nav
        document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
        document.querySelector(`.nav-item[data-page="${page}"]`)?.classList.add('active');

        // Update pages
        document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
        document.getElementById(`page-${page}`)?.classList.add('active');

        // Update title
        const titles = {
            dashboard: 'ראשי',
            subprojects: 'פרויקטים',
            tasks: 'משימות',
            calendar: 'לוח שנה',
            gantt: 'תרשים גאנט',
            settings: 'בעלי עניין'
        };
        document.getElementById('pageTitle').textContent = titles[page] || '';

        // Close mobile menu
        document.getElementById('sidebar').classList.remove('mobile-open');

        this.refresh();
    }

    // === Refresh All Views ===
    refresh() {
        switch (this.currentPage) {
            case 'dashboard': this.renderDashboard(); break;
            case 'subprojects': this.renderSubProjects(); break;
            case 'tasks': this.renderTasks(); break;
            case 'calendar': this.calendar.render(); break;
            case 'gantt': this.gantt.render(); break;
            case 'settings': this.renderSettings(); break;
        }
    }

    // === Dashboard ===
    renderDashboard() {
        const stats = store.getStats();

        document.getElementById('statActiveProjects').textContent = stats.activeSubProjects;
        document.getElementById('statCompletedTasks').textContent = stats.completedTasks;
        document.getElementById('statInProgressTasks').textContent = stats.inProgressTasks;
        document.getElementById('statBlockedTasks').textContent = stats.blockedTasks;
        document.getElementById('statOverdueTasks').textContent = stats.overdueTasks;

        this.renderSpProgress();
        this.renderUpcomingTasks();
    }

    renderDeptProgress(stats) {
        const container = document.getElementById('deptProgress');
        const depts = [
            { key: 'product', name: 'מוצר', color: '#3b82f6' },
            { key: 'actuarial', name: 'אקטואריה', color: '#10b981' },
            { key: 'legal', name: 'משפטית', color: '#8b5cf6' }
        ];

        let html = '';
        depts.forEach(dept => {
            const tasks = store.getTasks({ department: dept.key, rootOnly: true });
            const total = tasks.length;
            const completed = tasks.filter(t => t.status === 'completed').length;
            const pct = total > 0 ? Math.round((completed / total) * 100) : 0;

            html += `
                <div class="dept-progress-item">
                    <div class="dept-progress-header">
                        <span class="dept-progress-name" style="color:${dept.color}">${dept.name}</span>
                        <span class="dept-progress-count">${completed}/${total} משימות</span>
                    </div>
                    <div class="progress-bar">
                        <div class="progress-fill" style="width:${pct}%;background:${dept.color}"></div>
                    </div>
                </div>
            `;
        });

        container.innerHTML = html || '<div class="empty-state"><div class="empty-state-text">אין נתונים</div></div>';
    }

    renderSpProgress() {
        const container = document.getElementById('spProgress');
        const subProjects = store.getSubProjects();

        let html = '';
        subProjects.forEach(sp => {
            const pct = store.getSubProjectProgress(sp.id);
            html += `
                <div class="sp-progress-item" onclick="app.navigateToSubProject('${sp.id}')" style="cursor:pointer">
                    <div class="sp-progress-icon">${sp.icon}</div>
                    <div class="sp-progress-info">
                        <div class="sp-progress-name">${sp.name}</div>
                        <div class="sp-progress-bar">
                            <div class="progress-bar"><div class="progress-fill" style="width:${pct}%;background:${sp.color}"></div></div>
                            <span class="sp-progress-pct">${pct}%</span>
                        </div>
                    </div>
                </div>
            `;
        });

        container.innerHTML = html || '<div class="empty-state"><div class="empty-state-text">אין פרויקטים</div></div>';
    }

    filterUpcomingTasks(days, btn) {
        btn.closest('.filter-group').querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
        btn.classList.add('active');
        this.upcomingDaysFilter = days;
        this.renderUpcomingTasks();
    }

    filterUpcomingDept(dept, btn) {
        btn.closest('.filter-group').querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
        btn.classList.add('active');
        this.upcomingDeptFilter = dept;
        this.renderUpcomingTasks();
    }

    renderUpcomingTasks() {
        const container = document.getElementById('upcomingTasks');
        const now = new Date();
        const todayStr = now.toISOString().split('T')[0];

        // "משימות בעבודה" = תאריך התחלה עבר + לא הושלמו (progress < 100)
        let tasks = store.getTasks({ notCompleted: true });
        tasks = tasks.filter(t => t.startDate && t.startDate <= todayStr && (t.progress || 0) < 100);

        // Department filter
        if (this.upcomingDeptFilter && this.upcomingDeptFilter !== 'all') {
            tasks = tasks.filter(t => t.department === this.upcomingDeptFilter);
        }

        tasks.sort((a, b) => new Date(a.startDate) - new Date(b.startDate));
        tasks = tasks.slice(0, 15);

        if (tasks.length === 0) {
            container.innerHTML = '<div class="empty-state"><div class="empty-state-text">אין משימות בעבודה</div></div>';
            return;
        }

        let html = '';
        tasks.forEach(task => {
            const dept = DEPARTMENTS[task.department] || DEPARTMENTS.product;
            const sp = store.getSubProject(task.subProjectId);
            const priorityDef = PRIORITIES[task.priority];

            let dateText = '';
            if (task.dueDate) {
                const dueDate = new Date(task.dueDate);
                const diffDays = Math.ceil((dueDate - now) / (1000 * 60 * 60 * 24));
                if (diffDays < 0) {
                    dateText = `באיחור (${Math.abs(diffDays)} ימים)`;
                } else if (diffDays === 0) {
                    dateText = 'מסתיים היום!';
                } else {
                    dateText = `עוד ${diffDays} ימים`;
                }
            }

            const dateClass = task.dueDate && new Date(task.dueDate) < now ? 'date-overdue' : 'date-normal';

            html += `
                <div class="upcoming-task-item" onclick="app.openTaskDetail('${task.id}')">
                    <div class="task-dept-dot" style="background:${dept.color}"></div>
                    <div class="upcoming-task-info">
                        <div class="upcoming-task-title">${task.title}</div>
                        <div class="upcoming-task-meta">
                            <span>${sp ? sp.name : ''}</span>
                            <span>${dept.short}</span>
                            <span style="color:${priorityDef.color}">${priorityDef.label}</span>
                        </div>
                    </div>
                    <div class="upcoming-task-right">
                        <div class="upcoming-task-progress">${task.progress || 0}%</div>
                        ${dateText ? `<div class="upcoming-task-date ${dateClass}">${dateText}</div>` : ''}
                    </div>
                </div>
            `;
        });

        container.innerHTML = html;
    }

    renderBlockedTasks() {
        const container = document.getElementById('blockedTasksList');
        const allTasks = store.getTasks({ notCompleted: true, rootOnly: true });
        const blockedTasks = allTasks.filter(t => store.isTaskBlocked(t.id));

        if (blockedTasks.length === 0) {
            container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">✅</div><div class="empty-state-text">אין משימות חסומות כרגע</div></div>';
            return;
        }

        let html = '';
        blockedTasks.forEach(task => {
            const blocking = store.getBlockingTasks(task.id);
            const blockingNames = blocking.map(b =>
                `<span class="blocked-dep-link" onclick="event.stopPropagation(); app.openTaskDetail('${b.task.id}')">${b.task.title}</span>`
            ).join(', ');

            html += `
                <div class="blocked-task-item" onclick="app.openTaskDetail('${task.id}')" style="cursor:pointer">
                    <div class="blocked-icon">🚫</div>
                    <div class="blocked-info">
                        <div class="blocked-title">${task.title}</div>
                        <div class="blocked-reason">חסומה על ידי: ${blockingNames}</div>
                    </div>
                </div>
            `;
        });

        container.innerHTML = html;
    }

    // === Sub-Projects ===
    renderSubProjects() {
        const container = document.getElementById('subprojectsGrid');
        const subProjects = store.getSubProjects();

        if (subProjects.length === 0) {
            container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📁</div><div class="empty-state-text">אין פרויקטים. לחץ על "פרויקט חדש" להוספה.</div></div>';
            return;
        }

        let html = '';
        subProjects.forEach(sp => {
            const tasks = store.getTasks({ subProjectId: sp.id, rootOnly: true });
            const completed = tasks.filter(t => t.status === 'completed').length;
            const inProgress = tasks.filter(t => t.status === 'in-progress').length;
            const pct = store.getSubProjectProgress(sp.id);
            const statusDef = SUBPROJECT_STATUSES[sp.status];
            const spDates = store.getSubProjectDates(sp.id);
            const dates = [];
            if (spDates.startDate) dates.push(this.formatDate(spDates.startDate));
            if (spDates.endDate) dates.push(this.formatDate(spDates.endDate));

            html += `
                <div class="sp-card" style="--sp-color:${sp.color}" onclick="app.navigateToSubProject('${sp.id}')">
                    <div class="sp-card-header">
                        <div class="sp-card-icon">${sp.icon}</div>
                        <div class="sp-card-title-area">
                            <div class="sp-card-name">${sp.name}</div>
                            <div class="sp-card-desc">${sp.description}</div>
                        </div>
                        <div class="sp-card-actions">
                            <button class="sp-action-btn" onclick="event.stopPropagation(); app.openEditSubProject('${sp.id}')" title="עריכה">✏️</button>
                        </div>
                    </div>
                    <div class="sp-card-body">
                        <div class="sp-card-stats">
                            <div class="sp-stat">סה"כ: <strong>${tasks.length}</strong></div>
                            <div class="sp-stat">בביצוע: <strong>${inProgress}</strong></div>
                            <div class="sp-stat">הושלמו: <strong>${completed}</strong></div>
                        </div>
                        <div class="sp-card-progress">
                            <div class="progress-bar"><div class="progress-fill" style="width:${pct}%;background:${sp.color}"></div></div>
                            <span class="sp-card-progress-pct">${pct}%</span>
                        </div>
                    </div>
                    <div class="sp-card-footer">
                        <div class="sp-card-dates">${dates.join(' - ')}</div>
                    </div>
                </div>
            `;
        });

        container.innerHTML = html;
    }

    navigateToSubProject(spId) {
        this.navigateTo('tasks');
        document.getElementById('filterSubProject').value = spId;
        this.renderTasks();
    }

    navigateToDepartment(dept) {
        this.navigateTo('tasks');
        document.getElementById('filterDepartment').value = dept;
        this.renderTasks();
    }

    // === Tasks ===
    setTaskView(mode, btn) {
        this.taskViewMode = mode;
        btn.closest('.view-toggle').querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
        btn.classList.add('active');
        this.renderTasks();
    }

    renderTasks() {
        if (this.taskViewMode === 'timeline') {
            return this.renderTasksTimeline();
        }

        const container = document.getElementById('tasksContainer');
        const filters = this.getTaskFilters();

        // Populate sub-project filter
        this.populateSubProjectFilter('filterSubProject');

        // Get filtered tasks (root only)
        // For department filter: also show parent tasks that have matching subtasks
        let tasks;
        if (filters.department) {
            const deptFilter = filters.department;
            const allRoot = store.getTasks({ ...filters, department: undefined, rootOnly: true });
            tasks = allRoot.filter(t => {
                if (t.department === deptFilter) return true;
                const subs = store.getSubTasks(t.id);
                return subs.some(s => s.department === deptFilter);
            });
        } else {
            tasks = store.getTasks({ ...filters, rootOnly: true });
        }

        if (tasks.length === 0) {
            container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">✅</div><div class="empty-state-text">אין משימות מתאימות לסינון. לחץ על "+ משימה חדשה" להוספה.</div></div>';
            return;
        }

        // Group by sub-project
        const grouped = {};
        const subProjects = store.getSubProjects();
        subProjects.forEach(sp => { grouped[sp.id] = { sp, tasks: [] }; });

        tasks.forEach(task => {
            if (grouped[task.subProjectId]) {
                grouped[task.subProjectId].tasks.push(task);
            }
        });

        let html = '';
        Object.values(grouped).forEach(group => {
            if (group.tasks.length === 0) return;
            const sp = group.sp;

            html += `<div class="task-group">`;
            html += `<div class="task-group-header" onclick="this.classList.toggle('collapsed'); this.nextElementSibling.style.maxHeight = this.classList.contains('collapsed') ? '0' : 'none'">`;
            html += `<span class="task-group-toggle">▼</span>`;
            html += `<span class="task-group-icon">${sp.icon}</span>`;
            html += `<span class="task-group-name" style="color:${sp.color}">${sp.name}</span>`;
            html += `<span class="task-group-count">${group.tasks.length} משימות</span>`;
            html += `</div>`;
            html += `<div class="task-group-body" style="max-height:none">`;

            group.tasks.forEach(task => {
                html += this.renderTaskRow(task, false);
                // Subtasks
                const subtasks = store.getSubTasks(task.id);
                if (subtasks.length > 0) {
                    // Apply filters to subtasks too
                    let filteredSubs = subtasks;
                    if (filters.department) filteredSubs = filteredSubs.filter(st => st.department === filters.department);
                    if (filters.status) filteredSubs = filteredSubs.filter(st => st.status === filters.status);
                    if (filters.priority) filteredSubs = filteredSubs.filter(st => st.priority === filters.priority);
                    if (filters.notCompleted) filteredSubs = filteredSubs.filter(st => st.status !== 'completed');

                    filteredSubs.forEach(sub => {
                        html += this.renderTaskRow(sub, true);
                    });
                }
            });

            html += `</div></div>`;
        });

        container.innerHTML = html;
    }

    renderTaskRow(task, isSubtask) {
        const dept = DEPARTMENTS[task.department] || DEPARTMENTS.product;
        const priorityDef = PRIORITIES[task.priority];
        const statusDef = TASK_STATUSES[task.status];
        const isBlocked = store.isTaskBlocked(task.id);
        const subtasks = store.getSubTasks(task.id);
        const blockedIndicator = isBlocked ? '<span class="task-dep-indicator">🚫</span>' : '';

        let progressColor = '#94a3b8';
        if (task.progress >= 100) progressColor = '#10b981';
        else if (task.progress >= 50) progressColor = '#3b82f6';
        else if (task.progress > 0) progressColor = '#f59e0b';

        return `
            <div class="task-row ${isSubtask ? 'subtask' : ''}" onclick="app.openTaskDetail('${task.id}')">
                <div class="task-color-bar" style="background:${dept.color}"></div>
                <div class="task-title-cell">
                    <div class="task-title-text">${blockedIndicator}${task.title}</div>
                    ${!isSubtask && subtasks.length > 0 ? `<div class="task-subtask-count">${subtasks.length} תתי משימות</div>` : ''}
                </div>
                <div class="task-dept-cell dept-${task.department}">${dept.short}</div>
                <div class="task-priority-cell priority-${task.priority}">${priorityDef.label}</div>
                <div class="task-date-cell">${task.startDate ? this.formatDate(task.startDate) : '-'}</div>
                <div class="task-date-cell">${task.dueDate ? this.formatDate(task.dueDate) : '-'}</div>
                <div class="task-status-cell status-${task.status}">${statusDef.label}</div>
                <div class="task-progress-cell">
                    <div class="task-progress-bar"><div class="task-progress-fill" style="width:${task.progress}%;background:${progressColor}"></div></div>
                    <span class="task-progress-text">${task.progress}%</span>
                </div>
            </div>
        `;
    }

    renderTasksTimeline() {
        const container = document.getElementById('tasksContainer');
        const filters = this.getTaskFilters();
        this.populateSubProjectFilter('filterSubProject');

        const now = new Date();
        const todayStr = now.toISOString().split('T')[0];
        const soonDate = new Date();
        soonDate.setDate(soonDate.getDate() + 14);
        const soonStr = soonDate.toISOString().split('T')[0];

        // Get ALL tasks (root + subtasks) with filters
        let allTasks = store.getTasks(filters);

        if (allTasks.length === 0) {
            container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">✅</div><div class="empty-state-text">אין משימות מתאימות לסינון.</div></div>';
            return;
        }

        // Split into 3 groups
        const groups = {
            now: { label: 'עכשיו', color: '#ef4444', icon: '🔴', tasks: [] },
            soon: { label: 'בקרוב', color: '#3b82f6', icon: '🔵', tasks: [] },
            later: { label: 'בהמשך', color: '#94a3b8', icon: '⚪', tasks: [] }
        };

        allTasks.forEach(task => {
            if (task.status === 'completed') return;
            if (task.startDate && task.startDate <= todayStr) {
                groups.now.tasks.push(task);
            } else if (task.startDate && task.startDate <= soonStr) {
                groups.soon.tasks.push(task);
            } else {
                groups.later.tasks.push(task);
            }
        });

        // Sort each group by startDate then priority
        const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
        Object.values(groups).forEach(g => {
            g.tasks.sort((a, b) => {
                if (a.startDate && b.startDate) {
                    const dateDiff = new Date(a.startDate) - new Date(b.startDate);
                    if (dateDiff !== 0) return dateDiff;
                }
                return (priorityOrder[a.priority] || 2) - (priorityOrder[b.priority] || 2);
            });
        });

        let html = '';
        const subProjects = store.getSubProjects();
        const spMap = {};
        subProjects.forEach(sp => spMap[sp.id] = sp);

        Object.values(groups).forEach(group => {
            if (group.tasks.length === 0) return;
            html += `<div class="timeline-group">`;
            html += `<div class="timeline-header" style="--tl-color: ${group.color}">`;
            html += `<span class="timeline-icon">${group.icon}</span>`;
            html += `<span class="timeline-label">${group.label}</span>`;
            html += `<span class="timeline-count">${group.tasks.length}</span>`;
            html += `</div>`;
            html += `<div class="timeline-body">`;

            // Group by sub-project within each time group
            const byProject = {};
            group.tasks.forEach(task => {
                if (!byProject[task.subProjectId]) byProject[task.subProjectId] = [];
                byProject[task.subProjectId].push(task);
            });

            Object.entries(byProject).forEach(([spId, tasks]) => {
                const sp = spMap[spId];
                if (!sp) return;

                // Project header
                html += `<div class="timeline-sp-header" style="border-right-color:${sp.color}">`;
                html += `<span>${sp.icon}</span> <span style="color:${sp.color};font-weight:600">${sp.name}</span>`;
                html += `</div>`;

                // Show parent labels for subtasks - track which parents already shown
                const shownParents = new Set();
                tasks.forEach(task => {
                    const isSubtask = !!task.parentTaskId;
                    if (isSubtask && !shownParents.has(task.parentTaskId)) {
                        const parent = store.getTask(task.parentTaskId);
                        if (parent) {
                            shownParents.add(task.parentTaskId);
                            html += `<div class="timeline-parent-label">${parent.title}</div>`;
                        }
                    }
                    html += this.renderTaskRow(task, isSubtask);
                });
            });

            html += `</div></div>`;
        });

        container.innerHTML = html;
    }

    getTaskFilters() {
        const filters = {};
        const spVal = document.getElementById('filterSubProject').value;
        const deptVal = document.getElementById('filterDepartment').value;
        const statusVal = document.getElementById('filterStatus').value;
        const priorityVal = document.getElementById('filterPriority').value;

        if (spVal) filters.subProjectId = spVal;
        if (deptVal) filters.department = deptVal;
        if (statusVal === 'not-completed') {
            filters.notCompleted = true;
        } else if (statusVal) {
            filters.status = statusVal;
        }
        if (priorityVal) filters.priority = priorityVal;

        return filters;
    }

    bindFilters() {
        ['filterSubProject', 'filterDepartment', 'filterStatus', 'filterPriority'].forEach(id => {
            document.getElementById(id).addEventListener('change', () => this.renderTasks());
        });
    }

    resetTaskFilters() {
        document.getElementById('filterSubProject').value = '';
        document.getElementById('filterDepartment').value = '';
        document.getElementById('filterStatus').value = 'not-completed';
        document.getElementById('filterPriority').value = '';
        this.renderTasks();
    }

    populateSubProjectFilter(selectId) {
        const select = document.getElementById(selectId);
        const currentVal = select.value;
        const subProjects = store.getSubProjects();

        // Keep first option
        while (select.options.length > 1) select.remove(1);

        subProjects.forEach(sp => {
            const opt = document.createElement('option');
            opt.value = sp.id;
            opt.textContent = `${sp.icon} ${sp.name}`;
            select.appendChild(opt);
        });

        select.value = currentVal;
    }

    // === Modals ===
    bindModals() {
        // Task modal
        document.getElementById('btnAddTask').addEventListener('click', () => this.openAddTask());
        document.getElementById('taskModalClose').addEventListener('click', () => this.closeModal('taskModal'));
        document.getElementById('taskModalCancel').addEventListener('click', () => this.closeModal('taskModal'));
        document.getElementById('taskForm').addEventListener('submit', (e) => this.handleTaskSubmit(e));
        document.getElementById('taskModalDelete').addEventListener('click', () => this.handleTaskDelete());

        // Progress slider
        document.getElementById('taskProgress').addEventListener('input', (e) => {
            document.getElementById('taskProgressValue').textContent = e.target.value + '%';
        });

        // Dependencies
        document.getElementById('btnAddDep').addEventListener('click', () => this.addDependencyToForm());

        // Notes log
        document.getElementById('btnAddNote').addEventListener('click', () => this.addNoteToForm());

        // Sub-project modal
        document.getElementById('btnAddSubProject').addEventListener('click', () => this.openAddSubProject());
        document.getElementById('spModalClose').addEventListener('click', () => this.closeModal('spModal'));
        document.getElementById('spModalCancel').addEventListener('click', () => this.closeModal('spModal'));
        document.getElementById('spForm').addEventListener('submit', (e) => this.handleSpSubmit(e));
        document.getElementById('spModalDelete').addEventListener('click', () => this.handleSpDelete());

        // Settings
        document.getElementById('btnAddStakeholder').addEventListener('click', () => this.addStakeholder());
        document.getElementById('newStakeholderName').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.addStakeholder();
        });

        // Detail modal
        document.getElementById('taskDetailClose').addEventListener('click', () => this.closeModal('taskDetailModal'));

        // Day modal
        document.getElementById('dayModalClose').addEventListener('click', () => this.closeModal('dayModal'));

        // Confirm modal
        document.getElementById('confirmClose').addEventListener('click', () => this.closeModal('confirmModal'));
        document.getElementById('confirmNo').addEventListener('click', () => this.closeModal('confirmModal'));
        document.getElementById('confirmYes').addEventListener('click', () => {
            if (this.confirmRequiresPassword) {
                this.closeModal('confirmModal');
                this.showPasswordDialog();
            } else {
                if (this.confirmCallback) this.confirmCallback();
                this.closeModal('confirmModal');
            }
        });

        // Close modals on overlay click (except edit forms)
        const editModals = ['taskModal', 'spModal'];
        document.querySelectorAll('.modal-overlay').forEach(overlay => {
            overlay.addEventListener('click', (e) => {
                if (e.target === overlay && !editModals.includes(overlay.id)) {
                    overlay.classList.remove('active');
                }
            });
        });
    }

    openModal(id) {
        document.getElementById(id).classList.add('active');
    }

    closeModal(id) {
        document.getElementById(id).classList.remove('active');
    }

    showConfirm(message, callback, requirePassword = false) {
        document.getElementById('confirmMessage').textContent = message;
        this.confirmCallback = callback;
        this.confirmRequiresPassword = requirePassword;
        this.openModal('confirmModal');
    }

    showDeleteConfirm(message, callback) {
        this.showConfirm(message, callback, true);
    }

    showPasswordDialog() {
        document.getElementById('adminPasswordInput').value = '';
        document.getElementById('passwordError').style.display = 'none';
        this.openModal('passwordModal');
        setTimeout(() => document.getElementById('adminPasswordInput').focus(), 100);
    }

    verifyPassword() {
        const input = document.getElementById('adminPasswordInput').value;
        if (input === '15041993') {
            this.closeModal('passwordModal');
            if (this.confirmCallback) this.confirmCallback();
        } else {
            document.getElementById('passwordError').style.display = 'block';
            document.getElementById('adminPasswordInput').value = '';
            document.getElementById('adminPasswordInput').focus();
        }
    }

    // === Task Modal ===
    openAddTask(parentTaskId = null) {
        document.getElementById('taskModalTitle').textContent = parentTaskId ? 'תת משימה חדשה' : 'משימה חדשה';
        document.getElementById('taskForm').reset();
        document.getElementById('taskId').value = '';
        document.getElementById('taskParentId').value = parentTaskId || '';
        document.getElementById('taskProgress').value = 0;
        document.getElementById('taskProgressValue').textContent = '0%';
        document.getElementById('taskModalDelete').style.display = 'none';

        // Populate sub-project select
        this.populateSubProjectSelect('taskSubProject');

        // Set default sub-project from filter
        const filterSp = document.getElementById('filterSubProject').value;
        if (filterSp) {
            document.getElementById('taskSubProject').value = filterSp;
        }

        // If parent task, lock sub-project
        if (parentTaskId) {
            const parentTask = store.getTask(parentTaskId);
            if (parentTask) {
                document.getElementById('taskSubProject').value = parentTask.subProjectId;
                document.getElementById('taskSubProject').disabled = true;
            }
        } else {
            document.getElementById('taskSubProject').disabled = false;
        }

        this.editingDeps = [];
        this.editingNotes = [];
        this.renderDependencyList();
        this.renderNotesLog();
        this.populateDependencySelect();
        this.populateStakeholderCheckboxes([]);

        this.openModal('taskModal');
    }

    openEditTask(taskId) {
        const task = store.getTask(taskId);
        if (!task) return;

        document.getElementById('taskModalTitle').textContent = task.parentTaskId ? 'עריכת תת משימה' : 'עריכת משימה';
        document.getElementById('taskId').value = task.id;
        document.getElementById('taskParentId').value = task.parentTaskId || '';
        document.getElementById('taskTitle').value = task.title;
        document.getElementById('taskDescription').value = task.description || '';
        document.getElementById('taskDepartment').value = task.department || 'product';
        document.getElementById('taskPriority').value = task.priority || 'medium';
        document.getElementById('taskStartDate').value = task.startDate || '';
        document.getElementById('taskDueDate').value = task.dueDate || '';
        document.getElementById('taskStatus').value = task.status || 'waiting';
        document.getElementById('taskProgress').value = task.progress || 0;
        document.getElementById('taskProgressValue').textContent = (task.progress || 0) + '%';
        document.getElementById('taskModalDelete').style.display = 'inline-flex';

        this.populateSubProjectSelect('taskSubProject');
        document.getElementById('taskSubProject').value = task.subProjectId;
        document.getElementById('taskSubProject').disabled = !!task.parentTaskId;

        this.editingDeps = task.dependencies ? [...task.dependencies] : [];
        this.editingNotes = task.notesLog ? [...task.notesLog] : [];
        this.renderDependencyList();
        this.renderNotesLog();
        this.populateDependencySelect(task.id);
        this.populateStakeholderCheckboxes(task.stakeholderIds || []);

        this.openModal('taskModal');
    }

    handleTaskSubmit(e) {
        e.preventDefault();

        const id = document.getElementById('taskId').value;
        const data = {
            title: document.getElementById('taskTitle').value.trim(),
            description: document.getElementById('taskDescription').value.trim(),
            subProjectId: document.getElementById('taskSubProject').value,
            parentTaskId: document.getElementById('taskParentId').value || null,
            department: document.getElementById('taskDepartment').value,
            priority: document.getElementById('taskPriority').value,
            startDate: document.getElementById('taskStartDate').value || null,
            dueDate: document.getElementById('taskDueDate').value || null,
            status: document.getElementById('taskStatus').value,
            progress: parseInt(document.getElementById('taskProgress').value) || 0,
            notesLog: this.editingNotes,
            dependencies: this.editingDeps,
            stakeholderIds: this.getSelectedStakeholders()
        };

        if (!data.title || !data.subProjectId) return;

        if (data.status === 'completed') data.progress = 100;

        if (id) {
            store.updateTask(id, data);
        } else {
            store.addTask(data);
        }

        this.closeModal('taskModal');
    }

    handleTaskDelete() {
        const id = document.getElementById('taskId').value;
        if (!id) return;

        this.showDeleteConfirm('האם אתה בטוח שברצונך למחוק משימה זו? כל תתי המשימות ימחקו גם הם.', () => {
            store.deleteTask(id);
            this.closeModal('taskModal');
        });
    }

    populateSubProjectSelect(selectId) {
        const select = document.getElementById(selectId);
        select.innerHTML = '';
        store.getSubProjects().forEach(sp => {
            const opt = document.createElement('option');
            opt.value = sp.id;
            opt.textContent = `${sp.icon} ${sp.name}`;
            select.appendChild(opt);
        });
    }

    // === Dependencies Form ===
    populateDependencySelect(excludeTaskId = null) {
        const select = document.getElementById('depTaskSelect');
        select.innerHTML = '<option value="">בחר משימה...</option>';

        const rootTasks = store.getTasks({ rootOnly: true });
        const subProjects = store.getSubProjects();
        const spMap = {};
        subProjects.forEach(sp => spMap[sp.id] = sp);

        // Group by sub-project
        const grouped = {};
        rootTasks.forEach(t => {
            if (!grouped[t.subProjectId]) grouped[t.subProjectId] = [];
            grouped[t.subProjectId].push(t);
        });

        Object.entries(grouped).forEach(([spId, tasks]) => {
            const sp = spMap[spId];
            if (!sp) return;
            const group = document.createElement('optgroup');
            group.label = `${sp.icon} ${sp.name}`;
            tasks.forEach(t => {
                // Add root task
                if (t.id !== excludeTaskId && !this.editingDeps.some(d => d.taskId === t.id)) {
                    const opt = document.createElement('option');
                    opt.value = t.id;
                    opt.textContent = t.title;
                    group.appendChild(opt);
                }
                // Add subtasks
                const subs = store.getSubTasks(t.id);
                subs.forEach(sub => {
                    if (sub.id !== excludeTaskId && !this.editingDeps.some(d => d.taskId === sub.id)) {
                        const opt = document.createElement('option');
                        opt.value = sub.id;
                        opt.textContent = `  ↲ ${sub.title}`;
                        group.appendChild(opt);
                    }
                });
            });
            select.appendChild(group);
        });
    }

    addDependencyToForm() {
        const taskId = document.getElementById('depTaskSelect').value;
        const type = document.getElementById('depTypeSelect').value;
        if (!taskId) return;

        this.editingDeps.push({ taskId, type });
        this.renderDependencyList();
        this.populateDependencySelect(document.getElementById('taskId').value);
    }

    removeDependencyFromForm(index) {
        this.editingDeps.splice(index, 1);
        this.renderDependencyList();
        this.populateDependencySelect(document.getElementById('taskId').value);
    }

    renderDependencyList() {
        const container = document.getElementById('dependenciesList');
        if (this.editingDeps.length === 0) {
            container.innerHTML = '<div style="font-size:12px;color:var(--text-secondary);padding:4px 0">אין תלויות</div>';
            return;
        }

        let html = '';
        this.editingDeps.forEach((dep, idx) => {
            const task = store.getTask(dep.taskId);
            if (!task) return;
            const typeDef = DEPENDENCY_TYPES[dep.type];
            html += `
                <div class="dep-item">
                    <span class="dep-item-type">${typeDef.label}</span>
                    <span class="dep-item-icon">←</span>
                    <span class="dep-item-name">${task.title}</span>
                    <button type="button" class="dep-item-remove" onclick="app.removeDependencyFromForm(${idx})">×</button>
                </div>
            `;
        });

        container.innerHTML = html;
    }

    // === Notes Log ===
    addNoteToForm() {
        const author = document.getElementById('noteAuthor').value.trim();
        const text = document.getElementById('noteText').value.trim();
        const link = document.getElementById('noteLink').value.trim();
        if (!text) return;

        this.editingNotes.unshift({
            id: Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
            author: author || 'לא צוין',
            text,
            link: link || '',
            createdAt: new Date().toISOString()
        });

        document.getElementById('noteText').value = '';
        document.getElementById('noteLink').value = '';
        this.renderNotesLog();
    }

    deleteNoteFromForm(idx) {
        this.showConfirm('האם למחוק הערה זו?', () => {
            this.editingNotes.splice(idx, 1);
            this.renderNotesLog();
        });
    }

    formatLinkHref(link) {
        if (!link) return '';
        return link;
    }

    isLocalPath(link) {
        if (!link) return false;
        return /^[A-Za-z]:\\/.test(link) || link.startsWith('\\\\');
    }

    copyToClipboard(text) {
        navigator.clipboard.writeText(text).then(() => {
            // Brief visual feedback
            const btn = document.querySelector('.copy-feedback');
            if (btn) {
                btn.textContent = '✓ הועתק';
                setTimeout(() => { btn.textContent = '📋 העתק נתיב'; }, 1500);
            }
        });
    }

    formatLinkDisplay(link) {
        if (!link) return '';
        // Show just filename for local paths
        const parts = link.replace(/\\/g, '/').split('/');
        return parts[parts.length - 1] || link;
    }

    _authorColorMap = {};
    _authorColors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#f97316'];

    buildAuthorColorMap() {
        this._authorColorMap = {};
        const usedColors = [];
        const authors = [...new Set(this.editingNotes.map(n => n.author || 'לא צוין'))];
        authors.forEach(name => {
            const available = this._authorColors.filter(c => !usedColors.includes(c));
            const color = available.length > 0 ? available[0] : this._authorColors[usedColors.length % this._authorColors.length];
            this._authorColorMap[name] = color;
            usedColors.push(color);
        });
    }

    getAuthorColor(name) {
        return this._authorColorMap[name] || this._authorColors[0];
    }

    renderNotesLog() {
        const container = document.getElementById('notesLogList');
        if (!container) return;

        this.buildAuthorColorMap();

        if (this.editingNotes.length === 0) {
            container.innerHTML = '<div style="font-size:12px;color:var(--text-secondary);padding:4px 0">אין הערות</div>';
            return;
        }

        let html = '';
        this.editingNotes.forEach((note, idx) => {
            const date = new Date(note.createdAt);
            const dateStr = date.toLocaleDateString('he-IL') + ' ' + date.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
            const color = this.getAuthorColor(note.author || 'לא צוין');
            let linkHtml = '';
            if (note.link) {
                if (this.isLocalPath(note.link)) {
                    linkHtml = `<div class="notes-log-link"><span class="copy-feedback local-path-link" onclick="event.stopPropagation(); app.copyToClipboard('${note.link.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}')">📋 העתק נתיב</span> <span class="local-path-name">${this.formatLinkDisplay(note.link)}</span></div>`;
                } else {
                    linkHtml = `<div class="notes-log-link"><a href="${note.link}" target="_blank" onclick="event.stopPropagation()">🔗 ${this.formatLinkDisplay(note.link)}</a></div>`;
                }
            }
            html += `
                <div class="notes-log-item" style="border-right-color:${color}">
                    <div class="notes-log-meta">
                        <span class="notes-log-author" style="color:${color}">${note.author || 'לא צוין'}</span>
                        <span class="notes-log-date">${dateStr}</span>
                        <button type="button" class="notes-log-delete" onclick="app.deleteNoteFromForm(${idx})">×</button>
                    </div>
                    <div class="notes-log-text">${note.text}</div>
                    ${linkHtml}
                </div>
            `;
        });

        container.innerHTML = html;
    }

    // === Quick Note (from detail view) ===
    openQuickNote(taskId) {
        document.getElementById('quickNoteTaskId').value = taskId;
        document.getElementById('quickNoteAuthor').value = '';
        document.getElementById('quickNoteText').value = '';
        this.openModal('quickNoteModal');
    }

    submitQuickNote() {
        const taskId = document.getElementById('quickNoteTaskId').value;
        const author = document.getElementById('quickNoteAuthor').value.trim() || 'לא צוין';
        const text = document.getElementById('quickNoteText').value.trim();
        const link = document.getElementById('quickNoteLink').value.trim();
        if (!text || !taskId) return;

        const task = store.getTask(taskId);
        if (!task) return;

        const notesLog = task.notesLog || [];
        notesLog.unshift({
            id: Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
            author,
            text,
            link: link || '',
            createdAt: new Date().toISOString()
        });

        store.updateTask(taskId, { notesLog });
        this.closeModal('quickNoteModal');
        this.openTaskDetail(taskId); // Refresh detail view
    }

    // === Sub-Project Modal ===
    openAddSubProject() {
        document.getElementById('spModalTitle').textContent = 'פרויקט חדש';
        document.getElementById('spForm').reset();
        document.getElementById('spId').value = '';
        document.getElementById('spColor').value = '#3b82f6';
        document.getElementById('spModalDelete').style.display = 'none';
        this.openModal('spModal');
    }

    openEditSubProject(spId) {
        const sp = store.getSubProject(spId);
        if (!sp) return;

        document.getElementById('spModalTitle').textContent = 'עריכת פרויקט';
        document.getElementById('spId').value = sp.id;
        document.getElementById('spName').value = sp.name;
        document.getElementById('spDescription').value = sp.description || '';
        document.getElementById('spStatus').value = sp.status || 'planning';
        const spDates = store.getSubProjectDates(sp.id);
        document.getElementById('spStartDate').value = spDates.startDate || sp.startDate || '';
        document.getElementById('spEndDate').value = spDates.endDate || sp.endDate || '';
        document.getElementById('spColor').value = sp.color || '#3b82f6';
        document.getElementById('spIcon').value = sp.icon || '📁';
        document.getElementById('spModalDelete').style.display = 'inline-flex';

        this.openModal('spModal');
    }

    handleSpSubmit(e) {
        e.preventDefault();

        const id = document.getElementById('spId').value;
        const data = {
            name: document.getElementById('spName').value.trim(),
            description: document.getElementById('spDescription').value.trim(),
            status: document.getElementById('spStatus').value,
            startDate: document.getElementById('spStartDate').value || null,
            endDate: document.getElementById('spEndDate').value || null,
            color: document.getElementById('spColor').value,
            icon: document.getElementById('spIcon').value
        };

        if (!data.name) return;

        if (id) {
            store.updateSubProject(id, data);
        } else {
            store.addSubProject(data);
        }

        this.closeModal('spModal');
    }

    handleSpDelete() {
        const id = document.getElementById('spId').value;
        if (!id) return;

        const tasks = store.getTasks({ subProjectId: id });
        const msg = tasks.length > 0
            ? `האם אתה בטוח? יימחקו גם ${tasks.length} משימות השייכות לפרויקט זה.`
            : 'האם אתה בטוח שברצונך למחוק פרויקט זה?';

        this.showDeleteConfirm(msg, () => {
            store.deleteSubProject(id);
            this.closeModal('spModal');
        });
    }

    // === Stakeholder Multi-Select ===
    populateStakeholderCheckboxes(selectedIds = []) {
        const container = document.getElementById('stakeholdersOptions');
        const trigger = document.getElementById('stakeholdersTrigger');
        const stakeholders = store.getStakeholders();
        const external = stakeholders.filter(sh => sh.type !== 'internal');
        const internal = stakeholders.filter(sh => sh.type === 'internal');

        const renderGroup = (items) => items.map(sh => `
            <label class="multi-select-option">
                <input type="checkbox" value="${sh.id}" ${selectedIds.includes(sh.id) ? 'checked' : ''}>
                <span>${sh.name}</span>
            </label>
        `).join('');

        let html = '';
        if (external.length > 0) {
            html += `<div class="multi-select-group-label">חיצוניים</div>${renderGroup(external)}`;
        }
        if (internal.length > 0) {
            html += `<div class="multi-select-group-label">פנימיים</div>${renderGroup(internal)}`;
        }
        container.innerHTML = html;

        // Update trigger text
        container.querySelectorAll('input').forEach(cb => {
            cb.addEventListener('change', () => this.updateStakeholderTrigger());
        });
        this.updateStakeholderTrigger();

        // Toggle dropdown
        trigger.onclick = () => container.classList.toggle('open');

        // Close on outside click
        document.addEventListener('click', (e) => {
            if (!e.target.closest('#stakeholdersDropdown')) {
                container.classList.remove('open');
            }
        });
    }

    updateStakeholderTrigger() {
        const checked = document.querySelectorAll('#stakeholdersOptions input:checked');
        const trigger = document.getElementById('stakeholdersTrigger');
        if (checked.length === 0) {
            trigger.innerHTML = '<span class="multi-select-placeholder">בחר בעלי עניין...</span>';
        } else {
            const names = [...checked].map(cb => cb.parentElement.querySelector('span').textContent);
            trigger.innerHTML = names.map(n => `<span class="multi-select-tag">${n}</span>`).join('');
        }
    }

    getSelectedStakeholders() {
        const checked = document.querySelectorAll('#stakeholdersOptions input:checked');
        return [...checked].map(cb => cb.value);
    }

    // === Stakeholders Page ===
    renderSettings() {
        const stakeholders = store.getStakeholders();
        const external = stakeholders.filter(sh => sh.type !== 'internal');
        const internal = stakeholders.filter(sh => sh.type === 'internal');

        const shColors = ['#3b82f6', '#10b981', '#8b5cf6', '#f59e0b', '#ef4444', '#06b6d4', '#ec4899', '#6366f1'];

        const renderGroup = (list, container) => {
            const el = document.getElementById(container);
            if (list.length === 0) {
                el.innerHTML = '<div class="sh-no-tasks" style="padding:12px">אין בעלי עניין</div>';
                return;
            }
            el.innerHTML = list.map((sh, idx) => {
                const tasks = store.getTasksForStakeholder(sh.id);
                const taskCount = tasks.length;
                const color = shColors[idx % shColors.length];

                let tasksHtml = '';
                if (tasks.length > 0) {
                    tasksHtml = tasks.map(t => {
                        const statusDef = TASK_STATUSES[t.status] || TASK_STATUSES.waiting;
                        const sp = store.getSubProject(t.subProjectId);
                        const spName = sp ? sp.icon + ' ' + sp.name : '';
                        return `<div class="sh-task-item" onclick="event.stopPropagation(); app.openTaskDetail('${t.id}')">
                            <span class="sh-task-status" style="color:${statusDef.color}">${statusDef.icon}</span>
                            <span class="sh-task-title">${t.title}</span>
                            <span class="sh-task-project">${spName}</span>
                        </div>`;
                    }).join('');
                } else {
                    tasksHtml = '<div class="sh-no-tasks">אין משימות משויכות</div>';
                }

                return `
                    <div class="stakeholder-card" id="sh-card-${sh.id}" style="--sh-color: ${color}">
                        <div class="stakeholder-card-header" onclick="app.toggleStakeholderCard('${sh.id}')">
                            <div class="sh-card-info">
                                <div>
                                    <div class="sh-card-name">${sh.name}</div>
                                    <span class="sh-card-count">${taskCount} משימות משויכות</span>
                                </div>
                            </div>
                            <div class="sh-card-actions">
                                <button class="btn-icon-danger" onclick="event.stopPropagation(); app.deleteStakeholder('${sh.id}')" title="מחק">×</button>
                                <span class="sh-card-arrow">◂</span>
                            </div>
                        </div>
                        <div class="stakeholder-tasks-list">${tasksHtml}</div>
                    </div>
                `;
            }).join('');
        };

        renderGroup(external, 'stakeholdersExternal');
        renderGroup(internal, 'stakeholdersInternal');
    }

    toggleStakeholderCard(shId) {
        const card = document.getElementById('sh-card-' + shId);
        if (card) card.classList.toggle('expanded');
    }

    addStakeholder() {
        const input = document.getElementById('newStakeholderName');
        const typeSelect = document.getElementById('newStakeholderType');
        const name = input.value.trim();
        if (!name) return;
        store.addStakeholder(name, typeSelect.value);
        input.value = '';
        this.renderSettings();
    }

    deleteStakeholder(id) {
        this.showDeleteConfirm('האם למחוק בעל עניין זה?', () => {
            store.deleteStakeholder(id);
            this.renderSettings();
        });
    }

    // === Task Detail Modal ===
    openTaskDetail(taskId) {
        const task = store.getTask(taskId);
        if (!task) return;

        const sp = store.getSubProject(task.subProjectId);
        const dept = DEPARTMENTS[task.department] || DEPARTMENTS.product;
        const priorityDef = PRIORITIES[task.priority];
        const statusDef = TASK_STATUSES[task.status];
        const subtasks = store.getSubTasks(taskId);
        const deps = store.getTaskDependencies(taskId);
        const dependents = store.getDependentTasks(taskId);
        const isBlocked = store.isTaskBlocked(taskId);

        document.getElementById('taskDetailTitle').textContent = task.title;

        let html = '';

        // Parent task link (for subtasks)
        if (task.parentTaskId) {
            const parent = store.getTask(task.parentTaskId);
            if (parent) {
                html += `<div class="task-detail-parent" onclick="app.openTaskDetail('${parent.id}')">`;
                html += `<span style="color:var(--text-secondary);font-size:12px">משימת אם:</span> `;
                html += `<span style="color:var(--primary);cursor:pointer;font-size:13px;font-weight:500">${parent.title}</span>`;
                html += `</div>`;
            }
        }

        // Badges
        html += '<div class="task-detail-header">';
        html += '<div class="task-detail-badges">';
        html += `<span class="task-detail-badge status-${task.status}">${statusDef.icon} ${statusDef.label}</span>`;
        html += `<span class="task-detail-badge priority-${task.priority}">${priorityDef.label}</span>`;
        html += `<span class="task-detail-badge" style="background:${dept.color}20;color:${dept.color}">${dept.name}</span>`;
        if (isBlocked) {
            html += `<span class="task-detail-badge" style="background:#fee2e2;color:#991b1b">🚫 חסום</span>`;
        }
        html += '</div></div>';

        // Two columns
        html += '<div class="task-detail-columns">';
        html += '<div class="task-detail-col-right">';

        // Details grid
        html += '<div class="task-detail-section">';
        html += '<div class="task-detail-grid">';
        html += `<div class="task-detail-field"><label>פרויקט</label><span>${sp ? sp.icon + ' ' + sp.name : '-'}</span></div>`;
        html += `<div class="task-detail-field"><label>תאריך התחלה</label><span>${task.startDate ? this.formatDate(task.startDate) : '-'}</span></div>`;
        html += `<div class="task-detail-field"><label>תאריך יעד</label><span>${task.dueDate ? this.formatDate(task.dueDate) : '-'}</span></div>`;
        html += `<div class="task-detail-field"><label>התקדמות</label><span>${task.progress}%</span></div>`;

        // Days remaining
        if (task.dueDate && task.status !== 'completed') {
            const now = new Date();
            now.setHours(0, 0, 0, 0);
            const due = new Date(task.dueDate);
            const diff = Math.ceil((due - now) / (1000 * 60 * 60 * 24));
            let daysText = diff < 0 ? `באיחור של ${Math.abs(diff)} ימים` : `${diff} ימים`;
            let daysColor = diff < 0 ? 'var(--danger)' : (diff <= 3 ? 'var(--warning)' : 'var(--success)');
            html += `<div class="task-detail-field"><label>זמן שנותר</label><span style="color:${daysColor};font-weight:700">${daysText}</span></div>`;
        }

        html += '</div></div>';

        // Stakeholders
        if (task.stakeholderIds && task.stakeholderIds.length > 0) {
            const allStakeholders = store.getStakeholders();
            const taskStakeholders = task.stakeholderIds
                .map(id => allStakeholders.find(sh => sh.id === id))
                .filter(Boolean);
            if (taskStakeholders.length > 0) {
                html += '<div class="task-detail-section">';
                html += '<h4 style="margin-bottom:8px;font-size:14px">בעלי עניין</h4>';
                html += '<div class="task-detail-stakeholders">';
                taskStakeholders.forEach(sh => {
                    html += `<span class="stakeholder-tag">${sh.name}</span>`;
                });
                html += '</div></div>';
            }
        }

        // Progress bar
        html += '<div class="task-detail-section">';
        let progressColor = '#94a3b8';
        if (task.progress >= 100) progressColor = '#10b981';
        else if (task.progress >= 50) progressColor = '#3b82f6';
        else if (task.progress > 0) progressColor = '#f59e0b';
        html += `<div class="progress-bar" style="height:10px"><div class="progress-fill" style="width:${task.progress}%;background:${progressColor}"></div></div>`;
        html += '</div>';

        // Description
        if (task.description) {
            html += '<div class="task-detail-section">';
            html += '<h4 style="margin-bottom:8px;font-size:14px">תיאור</h4>';
            html += `<div class="task-detail-desc">${task.description}</div>`;
            html += '</div>';
        }

        // Dependencies
        if (deps.length > 0) {
            html += '<div class="task-detail-section">';
            html += '<h4 style="margin-bottom:8px;font-size:14px">תלויה במשימות</h4>';
            html += '<ul class="task-detail-deps">';
            deps.forEach(dep => {
                const depStatus = TASK_STATUSES[dep.task.status];
                const depType = DEPENDENCY_TYPES[dep.type];
                const isBlocking = dep.type === 'FS' && dep.task.status !== 'completed';
                html += `<li onclick="app.openTaskDetail('${dep.task.id}')" style="cursor:pointer">
                    <span style="color:${depStatus.color}">${depStatus.icon}</span>
                    <span style="flex:1">${dep.task.title}</span>
                    <span style="font-size:11px;color:var(--text-secondary)">${depType.label}</span>
                    ${isBlocking ? '<span style="color:var(--danger);font-size:11px">חוסם!</span>' : ''}
                </li>`;
            });
            html += '</ul></div>';
        }

        // Dependent tasks (tasks that depend on this one)
        if (dependents.length > 0) {
            html += '<div class="task-detail-section">';
            html += '<h4 style="margin-bottom:8px;font-size:14px">משימות תלויות (מחכות למשימה זו)</h4>';
            html += '<ul class="task-detail-deps">';
            dependents.forEach(depTask => {
                const depStatus = TASK_STATUSES[depTask.status];
                html += `<li onclick="app.openTaskDetail('${depTask.id}')" style="cursor:pointer">
                    <span style="color:${depStatus.color}">${depStatus.icon}</span>
                    <span style="flex:1">${depTask.title}</span>
                </li>`;
            });
            html += '</ul></div>';
        }

        // Subtasks
        if (subtasks.length > 0) {
            html += '<div class="task-detail-section">';
            html += `<h4 style="margin-bottom:8px;font-size:14px">תתי משימות (${subtasks.length})</h4>`;
            html += '<ul class="task-detail-subtasks">';
            subtasks.forEach(sub => {
                const subStatus = TASK_STATUSES[sub.status];
                const subDept = DEPARTMENTS[sub.department] || DEPARTMENTS.product;
                html += `<li onclick="app.openTaskDetail('${sub.id}')">
                    <span style="color:${subStatus.color}">${subStatus.icon}</span>
                    <span style="flex:1">${sub.title}</span>
                    <span class="task-detail-badge" style="font-size:10px;padding:2px 6px;background:${subDept.color}20;color:${subDept.color}">${subDept.short}</span>
                    <span style="font-size:11px;color:var(--text-secondary)">${sub.progress}%</span>
                </li>`;
            });
            html += '</ul></div>';
        }

        html += '</div>'; // end right column

        // Left column - Notes Log
        html += '<div class="task-detail-col-left">';
        html += '<h4 style="margin-bottom:8px;font-size:14px">יומן הערות</h4>';
        const notesLog = task.notesLog || [];
        if (notesLog.length > 0) {
            this.editingNotes = [...notesLog];
            this.buildAuthorColorMap();
            html += '<div class="notes-log-scroll">';
            notesLog.forEach(note => {
                const date = new Date(note.createdAt);
                const dateStr = date.toLocaleDateString('he-IL') + ' ' + date.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
                const color = this.getAuthorColor(note.author || 'לא צוין');
                let linkH = '';
                if (note.link) {
                    if (this.isLocalPath(note.link)) {
                        linkH = `<div class="notes-log-link"><span class="copy-feedback local-path-link" onclick="event.stopPropagation(); app.copyToClipboard('${note.link.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}')">📋 העתק נתיב</span> <span class="local-path-name">${this.formatLinkDisplay(note.link)}</span></div>`;
                    } else {
                        linkH = `<div class="notes-log-link"><a href="${note.link}" target="_blank">🔗 ${this.formatLinkDisplay(note.link)}</a></div>`;
                    }
                }
                html += `<div class="notes-log-item" style="border-right-color:${color}">
                    <div class="notes-log-meta">
                        <span class="notes-log-author" style="color:${color}">${note.author || 'לא צוין'}</span>
                        <span class="notes-log-date">${dateStr}</span>
                    </div>
                    <div class="notes-log-text">${note.text}</div>
                    ${linkH}
                </div>`;
            });
            html += '</div>';
        } else {
            html += '<div style="font-size:12px;color:var(--text-secondary)">אין הערות</div>';
        }
        html += '</div>'; // end left column
        html += '</div>'; // end columns

        // Actions
        html += '<div class="task-detail-actions">';
        html += `<button class="btn btn-primary" onclick="app.closeModal('taskDetailModal'); app.openEditTask('${task.id}')">✏️ עריכה</button>`;
        if (!task.parentTaskId) {
            html += `<button class="btn btn-secondary" onclick="app.closeModal('taskDetailModal'); app.openAddTask('${task.id}')">+ תת משימה</button>`;
        }
        html += `<button class="btn btn-danger" onclick="app.showDeleteConfirm('האם למחוק משימה זו?', () => { store.deleteTask('${task.id}'); app.closeModal('taskDetailModal'); })">🗑️ מחק</button>`;
        html += `<div style="margin-right:auto"></div>`;
        html += `<button class="btn btn-sm btn-secondary" onclick="app.openQuickNote('${task.id}')">+ הוסף הערה</button>`;
        html += '</div>';

        document.getElementById('taskDetailBody').innerHTML = html;
        this.openModal('taskDetailModal');

        // Set left column height to match right column
        setTimeout(() => {
            const right = document.querySelector('.task-detail-col-right');
            const left = document.querySelector('.task-detail-col-left');
            const scroll = document.querySelector('.notes-log-scroll');
            if (right && left) {
                // Hide left to measure right without interference
                left.style.visibility = 'hidden';
                left.style.position = 'absolute';
                const rightH = right.offsetHeight;
                left.style.visibility = '';
                left.style.position = '';
                left.style.height = rightH + 'px';
                if (scroll) {
                    const headerH = left.querySelector('h4')?.offsetHeight || 0;
                    scroll.style.maxHeight = (rightH - headerH - 16) + 'px';
                }
            }
        }, 50);
    }

    // === Calendar Day Click ===
    onCalendarDayClick(dateStr) {
        const tasks = store.getTasksForDate(dateStr);
        const formattedDate = this.formatDate(dateStr);

        document.getElementById('dayModalTitle').textContent = `משימות ליום ${formattedDate}`;

        if (tasks.length === 0) {
            document.getElementById('dayModalBody').innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-text">אין משימות ליום זה</div>
                </div>
            `;
        } else {
            let html = '<ul class="task-detail-subtasks">';
            tasks.forEach(task => {
                const statusDef = TASK_STATUSES[task.status];
                const taskDept = DEPARTMENTS[task.department] || DEPARTMENTS.product;
                const sp = store.getSubProject(task.subProjectId);
                html += `<li onclick="app.closeModal('dayModal'); app.openTaskDetail('${task.id}')">
                    <span style="color:${statusDef.color}">${statusDef.icon}</span>
                    <span style="flex:1">${task.title}</span>
                    <span class="task-detail-badge" style="font-size:10px;padding:2px 6px;background:${taskDept.color}20;color:${taskDept.color}">${taskDept.short}</span>
                </li>`;
            });
            html += '</ul>';
            document.getElementById('dayModalBody').innerHTML = html;
        }

        this.openModal('dayModal');
    }

    // === Gantt Controls ===
    bindGanttControls() {
        document.querySelectorAll('.gantt-zoom-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.gantt-zoom-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.gantt.setZoom(btn.dataset.zoom);
            });
        });

        document.getElementById('ganttSubProject').addEventListener('change', (e) => {
            this.gantt.setFilters({ subProjectId: e.target.value });
        });

        document.getElementById('ganttDepartment').addEventListener('change', (e) => {
            this.gantt.setFilters({ department: e.target.value });
        });

        // Populate Gantt filters
        this.populateSubProjectFilter('ganttSubProject');

    }

    // === Calendar Controls ===
    bindCalendarControls() {
        document.getElementById('calPrev').addEventListener('click', () => this.calendar.prevMonth()); // → = back in time
        document.getElementById('calNext').addEventListener('click', () => this.calendar.nextMonth()); // ← = forward in time
        document.getElementById('calToday').addEventListener('click', () => this.calendar.goToday());
    }

    // === Mobile Menu ===
    bindMobileMenu() {
        document.getElementById('mobileMenuBtn').addEventListener('click', () => {
            document.getElementById('sidebar').classList.toggle('mobile-open');
        });
    }

    // === Utility ===
    formatDate(dateStr) {
        if (!dateStr) return '-';
        const d = new Date(dateStr);
        return d.toLocaleDateString('he-IL', { day: 'numeric', month: 'short', year: 'numeric' });
    }

}

// Initialize app on DOM ready
let app;
document.addEventListener('DOMContentLoaded', () => {
    app = new App();
});
