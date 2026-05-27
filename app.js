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
            boardroom: 'חדר ישיבות',
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
            case 'boardroom': this.renderBoardroom(); break;
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

    // === Boardroom Page ===
    renderBoardroom() {
        const grid = document.getElementById('boardroomGrid');
        const viewer = document.getElementById('boardroomViewer');

        // Show grid, hide viewer
        grid.style.display = '';
        viewer.style.display = 'none';

        const items = [
            {
                id: 'roadmap',
                title: 'מפת דרכים',
                desc: 'תרשים עץ ההחלטות - מבוגרים וצעירים, חלופות, סוגיות משפטיות והמלצות',
                icon: '🗺️',
                date: '16 באפריל 2026',
                color: '#2563eb'
            },
            {
                id: 'corporate-structure',
                title: 'תאגיד, איחוד קרנות, OPT OUT',
                desc: 'מבנה תאגידי · איחוד קרנות · OPT IN / OPT OUT במוצר החדש',
                icon: '🏛️',
                date: '29 באפריל 2026',
                color: '#2563eb'
            },
            {
                id: 'tender-alternatives',
                title: 'חלופות לגוף המבצע את המכרז',
                desc: 'שלוש חלופות לאופן ביצוע המכרז · השוואה לפי 5 העקרונות של הממונה',
                icon: '⚖️',
                date: '27 במאי 2026',
                color: '#2563eb'
            }
        ];

        let html = '';
        items.forEach(item => {
            html += `
                <div class="boardroom-card" onclick="app.openBoardroomItem('${item.id}')" style="--br-color: ${item.color}">
                    <div class="boardroom-card-icon">${item.icon}</div>
                    <div class="boardroom-card-info">
                        <div class="boardroom-card-title">${item.title}</div>
                        <div class="boardroom-card-desc">${item.desc}</div>
                        <div class="boardroom-card-date">${item.date}</div>
                    </div>
                </div>
            `;
        });

        grid.innerHTML = html;
    }

    openBoardroomItem(id) {
        const grid = document.getElementById('boardroomGrid');
        const viewer = document.getElementById('boardroomViewer');
        const content = document.getElementById('boardroomContent');

        grid.style.display = 'none';
        viewer.style.display = '';

        if (id === 'roadmap') {
            content.innerHTML = this.getRoadmapHTML();
        } else if (id === 'corporate-structure') {
            content.innerHTML = this.getCorporateStructureHTML();
        } else if (id === 'tender-alternatives') {
            content.innerHTML = this.getTenderAlternativesHTML();
        }
    }

    closeBoardroomItem() {
        this.renderBoardroom();
    }

    getRoadmapHTML() {
        return `
<div class="roadmap-container">
    <div class="roadmap-top-bar">
        <button class="rm-action-btn" onclick="app.closeBoardroomItem()">→ חזרה לחדר ישיבות</button>
        <div class="roadmap-top-title-group">
            <h2 class="roadmap-top-title">🗺️ מפת דרכים</h2>
            <div class="roadmap-subtitle">${new Date().toLocaleDateString('he-IL', { day: 'numeric', month: 'long', year: 'numeric' })}</div>
        </div>
        <div class="roadmap-top-actions">
            <button class="rm-action-btn" onclick="app.roadmapExpandAll()">📂 הרחב הכל</button>
            <button class="rm-action-btn" onclick="app.roadmapCollapseAll()">📁 כווץ הכל</button>
        </div>
    </div>

    <div class="roadmap-columns">
        <!-- מבוגרים מעל גיל החתך -->
        <div class="roadmap-section" style="--rm-color: #c75b39">
            <div class="roadmap-section-header">
                <h3>מבוגרים - הקבוצה הסגורה</h3>
                <span class="roadmap-age-badge" style="background:#c75b39">מעל גיל החתך</span>
            </div>

            <div class="rm-box" onclick="this.classList.toggle('expanded')">
                <div class="rm-box-header"><span class="rm-num" style="background:#c75b39">1</span><span class="rm-title">הצדקה - המוצר לא בר-קיימא</span><span class="rm-status rm-resolved">✅ מגובש</span><span class="rm-arrow">◄</span></div>
                <div class="rm-box-body">
                    <div class="rm-desc">ביסוס עובדתי לכך שהמודל הקיים אינו בר-קיימא לטווח ארוך.</div>
                    <div class="rm-callout rm-callout-success"><strong>נקודות ביסוס:</strong><br>• חוסר יציבות היסטורי — תנודתיות והחמרה בתנאים לאורך השנים<br>• סבסוד צולב — צעירים ממנים מבוגרים במוצר וולונטרי, לא תקין ולא בר-קיימא<br>• דוח מבקר המדינה</div>
                </div>
            </div>
            <div class="rm-arrow-down">▼</div>

            <div class="rm-box" onclick="this.classList.toggle('expanded')">
                <div class="rm-box-header"><span class="rm-num" style="background:#c75b39">2</span><span class="rm-title">החלת הוראות על כל הקרנות</span><span class="rm-status rm-warning">⚠️ דורש הצדקה</span><span class="rm-arrow">◄</span></div>
                <div class="rm-box-body">
                    <div class="rm-desc">האם מחילים את ההוראות (סגירה, מעבר, מינוי מנהל) על כל 4 הקרנות, כולל אלו שאינן גירעוניות?</div>
                    <div class="rm-callout rm-callout-warning">בקרנות הוותיקות בהסדר השאירו את קרנות היציבות.</div>
                    <div class="rm-callout rm-callout-info" style="margin-top:6px"><strong>סעיף 68:</strong> מבטח שאינו יכול לקיים התחייבויותיו / ניהול לא תקין / טובת הציבור מחייבת פעולה ללא דיחוי. לא מתאים — כאן אין בעיה במבטח עצמו, אלא בתכניות הביטוח.<br><strong>סעיף 78ד(א):</strong> מינוי מנהל מיוחד בקרנות הפנסיה הוותיקות בגלל גירעון אקטוארי.<br><strong>המצב שלנו:</strong> אין קריסה ואין כשל מבטח — יש סיכון עתידי ברמת התכניות. נדרש מסלול חקיקתי חדש.</div>

                    <div class="rm-alt" onclick="event.stopPropagation(); this.classList.toggle('expanded')"><div class="rm-alt-title"><span class="rm-alt-arrow">◄</span> למה גם על קופות לא גירעוניות</div><div class="rm-alt-body">מדוע להחיל הוראות על קופה יציבה?<br><strong>תשובה:</strong> חוסר היציבות הוא מערכתי ולא נקודתי. קופה שיציבה היום עלולה להפוך לגירעונית מחר. פעולת מנע לפני קריסה — לא אחריה.<br><strong>ובנוסף:</strong> למה אי אפשר להשאיר קופה אחת ולהחיל על כל היתר? בשונה מהוותיקות בהסדר, כאן יש ניהול פעיל.</div></div>
                    <div class="rm-callout rm-callout-danger" style="margin-top:10px"><strong>🔴 סיכון מרכזי:</strong><br>מבוטח בקופה יציבה ששילם פרמיות גבוהות יטען שאין הצדקה לקחת את הניהול.</div>
                </div>
            </div>
            <div class="rm-arrow-down">▼</div>

            <div class="rm-box" onclick="this.classList.toggle('expanded')">
                <div class="rm-box-header"><span class="rm-num" style="background:#c75b39">3</span><span class="rm-title">איחוד קרנות</span><span class="rm-status rm-open">❓ פתוחה</span><span class="rm-arrow">◄</span></div>
                <div class="rm-box-body">
                    <div class="rm-desc">האם לאחד את כל הקרנות לאחת או לנהל בנפרד? שאלה פתוחה.</div>
                    <div class="rm-alt" onclick="event.stopPropagation(); this.classList.toggle('expanded')"><div class="rm-alt-title"><span class="rm-alt-arrow">◄</span> חלופה א': איחוד מלא</div><div class="rm-alt-body">כל הקרנות מתמזגות לקרן אחת.<div class="rm-pros-cons"><div class="rm-pro">✓ הכי נכון אקטוארית — אוכלוסייה גדולה, פיזור סיכון מרבי</div><div class="rm-con">✗ הכי קשה משפטית — פגיעה בזכות הקניין</div><div class="rm-pro">✓ הכי פשוט לניהול</div></div></div></div>
                    <div class="rm-alt" onclick="event.stopPropagation(); this.classList.toggle('expanded')"><div class="rm-alt-title"><span class="rm-alt-arrow">◄</span> חלופה ב': Risk Allocation — איזון סיכונים</div><div class="rm-alt-body">קרנות נפרדות, כל קרן עם הפרמיה שלה, אבל מנגנון איזון ביניהן.<div class="rm-pros-cons"><div class="rm-pro">✓ אפשר לקבוע פרמיות שונות לכל קרן</div><div class="rm-pro">✓ פחות פוגע בזכות הקניין</div></div></div></div>
                    <div class="rm-alt" onclick="event.stopPropagation(); this.classList.toggle('expanded')"><div class="rm-alt-title"><span class="rm-alt-arrow">◄</span> חלופה ג': קרנות נפרדות לחלוטין</div><div class="rm-alt-body">כל קרן נשארת עצמאית ומתנהלת כיחידה בפני עצמה.<div class="rm-pros-cons"><div class="rm-pro">✓ פחות פוגע בזכויות</div><div class="rm-con">✗ לא משיג את התכלית — קרנות קטנות יקרסו מהר מסיבות דמוגרפיות</div><div class="rm-pro">✓ חשיפה משפטית נמוכה</div><div class="rm-con">✗ לא ניתן להשתמש בקרנות חזקות לצמצום גירעון</div></div></div></div>
                    <div class="rm-callout rm-callout-info" style="margin-top:8px"><strong>הערה — ענפיות:</strong> הקרנות הענפיות מתנהלות בנפרד, כל אחת כיחידה בפני עצמה. לא אוחדו.</div>
                </div>
            </div>
            <div class="rm-arrow-down">▼</div>

            <div class="rm-box" onclick="this.classList.toggle('expanded')">
                <div class="rm-box-header"><span class="rm-num" style="background:#c75b39">4</span><span class="rm-title">מבנה התאגיד</span><span class="rm-status rm-open">❓ פתוחה</span><span class="rm-arrow">◄</span></div>
                <div class="rm-box-body">
                    <div class="rm-desc">איזה גוף ינהל את הקבוצה הסגורה.</div>
                    <div class="rm-alt" onclick="event.stopPropagation(); this.classList.toggle('expanded')"><div class="rm-alt-title"><span class="rm-alt-arrow">◄</span> א. חברת בת של עמיתים</div><div class="rm-alt-body">שימוש בתשתית קיימת של עמיתים.<div class="rm-callout rm-callout-warning" style="margin-top:4px"><strong>⚠️ בעיה:</strong> לעמיתים אין היום רישיון מבטח. צריך להקים חברת בת חדשה עם רישיון מבטח.</div><div class="rm-callout rm-callout-info" style="margin-top:4px"><strong>קושי:</strong> נדרשת הצדקה לקבוע בחוק דווקא חברה ספציפית.</div></div></div>
                    <div class="rm-alt" onclick="event.stopPropagation(); this.classList.toggle('expanded')"><div class="rm-alt-title"><span class="rm-alt-arrow">◄</span> ב. חברה ממשלתית</div><div class="rm-alt-body">הקמת חברת ביטוח ממשלתית לפי החלטת ממשלה.<div class="rm-pros-cons"><div class="rm-pro">✓ גיבוי ממשלתי מובנה</div><div class="rm-con">✗ פוליטיזציה — שרים ממנים את המנהלים</div><div class="rm-pro">✓ אמון ציבורי</div><div class="rm-con">✗ חוסר מומחיות ויעילות</div></div><div class="rm-callout rm-callout-info" style="margin-top:8px"><strong>ענבל:</strong> החברה הממשלתית היחידה עם מומחיות בניהול ביטוח. הפול — יש חקיקה ספציפית אבל רק לרכב חובה.</div></div></div>
                    <div class="rm-alt" onclick="event.stopPropagation(); this.classList.toggle('expanded')"><div class="rm-alt-title"><span class="rm-alt-arrow">◄</span> ג. מכרז לחברת ביטוח פרטית</div><div class="rm-alt-body">חברת ביטוח פרטית שתיכנס דרך מכרז. לא נדרשת הקמה.<div class="rm-callout rm-callout-danger" style="margin-top:4px"><strong>קושי:</strong> ל-30 שנה זה בעייתי. דורש יציאה למכרז כל מספר שנים.</div></div></div>
                </div>
            </div>
            <div class="rm-arrow-down">▼</div>

            <div class="rm-box" onclick="this.classList.toggle('expanded')">
                <div class="rm-box-header"><span class="rm-num" style="background:#c75b39">5</span><span class="rm-title">סיוע ממשלתי</span><span class="rm-status rm-open">❓ פתוחה</span><span class="rm-arrow">◄</span></div>
                <div class="rm-box-body">
                    <div class="rm-desc">מנגנון הסיוע הממשלתי לקבוצה הסגורה.</div>
                    <div class="rm-alt" onclick="event.stopPropagation(); this.classList.toggle('expanded')"><div class="rm-alt-title"><span class="rm-alt-arrow">◄</span> חלופה א': סיוע ישיר - סכום קבוע מראש</div><div class="rm-alt-body">סכום קבוע (למשל X מיליארד ש"ח) שנכנס למאזני הקרן בפריסה עד לסוף חייה.<div class="rm-pros-cons"><div class="rm-pro">✓ ודאות לקרן ולמנהל</div><div class="rm-con">✗ בעיה תמריצית</div><div class="rm-pro">✓ פשטות ניהולית</div><div class="rm-con">✗ עלות גבוהה למדינה מראש</div></div></div></div>
                    <div class="rm-alt" onclick="event.stopPropagation(); this.classList.toggle('expanded')"><div class="rm-alt-title"><span class="rm-alt-arrow">◄</span> חלופה ב': כרית ביטחון עקיפה - לפי מדדים</div><div class="rm-alt-body">סיוע מותנה שמופעל לפי מדדים אובייקטיביים: עקום ריבית, אישורי תביעות, הזדקנות אוכלוסייה. הכסף עובר רק כשנגמר הכסף בקרן, לא לפני. המדינה רושמת בספרים אך לא מעבירה בפועל עד שצריך.<div class="rm-pros-cons"><div class="rm-pro">✓ חוסך כסף למדינה</div><div class="rm-con">✗ אי-ודאות למנהל הקרן</div><div class="rm-pro">✓ מדדים אובייקטיביים</div><div class="rm-con">✗ מורכבות בהגדרת המדדים</div></div></div></div>
                    <div class="rm-tags"><span class="rm-tag">🏛️ אגף תקציבים</span></div>
                </div>
            </div>
        </div>

        <!-- צעירים מתחת לגיל החתך -->
        <div class="roadmap-section" style="--rm-color: #0891b2">
            <div class="roadmap-section-header">
                <h3>צעירים - מעבר למוצר חדש</h3>
                <span class="roadmap-age-badge" style="background:#0891b2">מתחת לגיל החתך</span>
            </div>

            <div class="rm-box" onclick="this.classList.toggle('expanded')">
                <div class="rm-box-header"><span class="rm-num" style="background:#0891b2">1</span><span class="rm-title">הקצאה מהקרן הקיימת</span><span class="rm-status rm-open">❓ פתוחה</span><span class="rm-arrow">◄</span></div>
                <div class="rm-box-body">
                    <div class="rm-desc">האם הצעירים (מתחת לגיל החתך) מקבלים חלק מנכסי הקרן?</div>
                    <div class="rm-alt" onclick="event.stopPropagation(); this.classList.toggle('expanded')"><div class="rm-alt-title"><span class="rm-alt-arrow">◄</span> הקצאה לפי אחוזים</div><div class="rm-alt-body">מבוגרים מהווים 20% מהאוכלוסייה. המטרה: להצדיק הגדלה של חלקם בקרן.</div></div>
                    <div class="rm-alt" onclick="event.stopPropagation(); this.classList.toggle('expanded')"><div class="rm-alt-title"><span class="rm-alt-arrow">◄</span> אין הקצאה</div><div class="rm-alt-body">הכל למבוגרים. צעירים יקבלו סכום התחלתי בעקבות המכרז "שווי מבוטח".</div></div>
                </div>
            </div>
            <div class="rm-arrow-down">▼</div>

            <div class="rm-box" onclick="this.classList.toggle('expanded')">
                <div class="rm-box-header"><span class="rm-num" style="background:#0891b2">2</span><span class="rm-title">עיקרון - הכסף שייך למבוטחים</span><span class="rm-status rm-resolved">✅ מגובש</span><span class="rm-arrow">◄</span></div>
                <div class="rm-box-body">
                    <div class="rm-desc">הכסף שייך למבוטחים - לא לקופות, לא למדינה.</div>
                    <div class="rm-callout rm-callout-success"><strong>תקדים:</strong> עמדת הרשות בהפרטת הקופות הענפיות.</div>                </div>
            </div>
            <div class="rm-arrow-down">▼</div>

            <div class="rm-box" onclick="this.classList.toggle('expanded')">
                <div class="rm-box-header"><span class="rm-num" style="background:#0891b2">3</span><span class="rm-title">מכרז להעברת מבוטחים</span><span class="rm-status rm-open">❓ פתוחה</span><span class="rm-arrow">◄</span></div>
                <div class="rm-box-body">
                    <div class="rm-desc">חברות ביטוח מתחרות על קליטת הצעירים למוצר החדש.</div>
                    <div class="rm-alt" onclick="event.stopPropagation(); this.classList.toggle('expanded')"><div class="rm-alt-title"><span class="rm-alt-arrow">◄</span> שיטת קביעת מחיר</div><div class="rm-alt-body"><div class="rm-callout rm-callout-warning" style="margin-top:8px"><strong>שאלה:</strong> האם הרשות קובעת את השווי והחברות מציעות?</div></div></div>
                    <div class="rm-alt" onclick="event.stopPropagation(); this.classList.toggle('expanded')"><div class="rm-alt-title"><span class="rm-alt-arrow">◄</span> חלוקת מבוטחים</div><div class="rm-alt-body"><div class="rm-callout rm-callout-warning"><strong>שאלות:</strong> הגבלת מספר / אחוז מבוטחים לחברה. חלוקה לפי ת"ז / הגרלה.</div></div></div>
                    <div class="rm-alt" onclick="event.stopPropagation(); this.classList.toggle('expanded')"><div class="rm-alt-title"><span class="rm-alt-arrow">◄</span> מי עורך מכרז</div><div class="rm-alt-body">הקופות (בהוראת חוק) או הרשות ישירות.</div></div>                </div>
            </div>
            <div class="rm-arrow-down">▼</div>

            <div class="rm-box" onclick="this.classList.toggle('expanded')">
                <div class="rm-box-header"><span class="rm-num" style="background:#0891b2">4</span><span class="rm-title">בחירת מבטח - אופט-אין / אאוט</span><span class="rm-status rm-warning">⚠️ דילמה</span><span class="rm-arrow">◄</span></div>
                <div class="rm-box-body">
                    <div class="rm-callout rm-callout-danger"><strong>הבעיה:</strong> בחירה חופשית פוגעת בחלוקת סיכון ומשבשת מכרז — אנטי-סלקציה.</div>
                    <div class="rm-callout rm-callout-success" style="margin-top:6px"><strong>פתרון:</strong> שיבוץ אוטומטי + תקופת זמן מסוימת שמאפשרת ניוד מוגבל.</div>
                    <div class="rm-callout rm-callout-info" style="margin-top:6px"><strong>קשר למבנה המוצר:</strong> שאלת הניוד מתחברת ישירות למבנה המוצר החדש — אם גמל, ניוד מובנה. אם ביטוח, ניוד דורש תיקון חוק.</div>
                </div>
            </div>
            <div class="rm-arrow-down">▼</div>

            <div class="rm-box" onclick="this.classList.toggle('expanded')">
                <div class="rm-box-header"><span class="rm-num" style="background:#0891b2">5</span><span class="rm-title">מבנה המוצר החדש</span><span class="rm-status rm-critical">🔴 הכרעה נדרשת</span><span class="rm-arrow">◄</span></div>
                <div class="rm-box-body">
                    <div class="rm-desc">המוצר הקיים = פוליסת ביטוח חיים שאינה קופת גמל ← לא ניתן לניוד.</div>
                    <div class="rm-alt" onclick="event.stopPropagation(); this.classList.toggle('expanded')"><div class="rm-alt-title"><span class="rm-alt-arrow">◄</span> חלופה א': פוליסת חיסכון + תיקון חוק לניוד</div><div class="rm-alt-body">תיקון חקיקה שיאפשר ניוד בפוליסות חיסכון.<div class="rm-pros-cons"><div class="rm-pro">✓ מתבסס על מוצר קיים — כבר בנוי</div><div class="rm-con">✗ תיבת פנדורה — פתיחת ניוד בביטוח משפיעה על כל השוק, ארביטרז'</div><div class="rm-pro">✓ עם תקנון — קל יותר לשנות זכויות ולעשות איזון</div></div></div></div>
                    <div class="rm-alt" onclick="event.stopPropagation(); this.classList.toggle('expanded')"><div class="rm-alt-title"><span class="rm-alt-arrow">◄</span> חלופה ב': קופת גמל לסיעוד — מוצר חדש</div><div class="rm-alt-body">הקמת סוג קופת גמל חדש שלא קיים היום.<div class="rm-pros-cons"><div class="rm-pro">✓ ניוד מובנה</div><div class="rm-con">✗ צריך תיקון תקנות כיסויים ביטוחיים — היום אי אפשר לקבוע כיסוי סיעודי בגמל</div><div class="rm-pro">✓ מגדיל היצע גופים — יש חברות עם רישיון מבטח רק לגמל</div><div class="rm-pro">✓ סעיפים קיימים — כמו מגבלות הפקדה</div></div></div></div>
                    <div class="rm-callout rm-callout-danger" style="margin-top:6px"><strong>עיקרון:</strong> חייבת להיות ניידות במוצר החדש.</div>
                </div>
            </div>
        </div>
    </div>

</div>`;
    }

    getCorporateStructureHTML() {
        return `
<style>
.cs-container { padding: 24px; max-width: 1400px; margin: 0 auto; direction: rtl; }
.cs-top-bar { display:flex; align-items:center; justify-content:space-between; gap:16px; margin-bottom:20px; padding-bottom:16px; border-bottom:1px solid #e5e7eb; }
.cs-title-group { text-align:center; flex:1; }
.cs-title { font-size: 26px; font-weight: 800; color:#111827; margin:0; }
.cs-subtitle { font-size: 14px; color:#6b7280; margin:4px 0 0; }
.cs-tabs { display:flex; gap:0; margin-bottom:24px; border-bottom:2px solid #e5e7eb; }
.cs-tab { padding:12px 22px; background:transparent; border:none; border-bottom:2px solid transparent; margin-bottom:-2px; cursor:pointer; font-size:14px; font-weight:600; color:#64748b; transition:all 0.15s; font-family:inherit; }
.cs-tab:hover { color:#2563eb; }
.cs-tab.active { color:#2563eb; border-bottom-color:#2563eb; }
.cs-tab-icon { margin-left:6px; }
.cs-tab-pane { display:none; }
.cs-tab-pane.active { display:block; }
.cs-section-title { font-size:18px; font-weight:800; color:#1e3a8a; margin:0 0 6px; }
.cs-section-sub { font-size:13.5px; color:#6b7280; margin:0 0 18px; }
.cs-options-grid { display:grid; grid-template-columns:repeat(3, 1fr); gap:16px; margin-bottom:20px; align-items:start; }
@media (max-width:1100px){ .cs-options-grid{grid-template-columns:1fr;} }
.cs-option-card { background:white; border-radius:12px; border:1px solid #e5e7eb; box-shadow:0 1px 3px rgba(0,0,0,0.05); overflow:hidden; display:flex; flex-direction:column; }
.cs-option-header { padding:14px 16px; border-bottom:1px solid #f3f4f6; display:flex; align-items:center; justify-content:space-between; gap:8px; background:linear-gradient(180deg,#f8fafc 0%, #eff6ff 100%); }
.cs-option-name { font-size:15px; font-weight:800; color:#1e3a8a; }
.cs-rank { font-size:11px; padding:4px 10px; border-radius:999px; font-weight:700; letter-spacing:.04em; }
.cs-rank-1 { background:#d1fae5; color:#065f46; }
.cs-rank-2 { background:#fef3c7; color:#92400e; }
.cs-rank-3 { background:#fee2e2; color:#991b1b; }
.cs-option-body { padding:14px 16px; flex:1; }
.cs-option-desc { font-size:13px; color:#374151; line-height:1.6; margin-bottom:12px; }
.cs-pc-block { margin-bottom:10px; }
.cs-pc-title { font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:.05em; margin-bottom:4px; }
.cs-pc-title.pros { color:#047857; }
.cs-pc-title.cons { color:#b91c1c; }
.cs-pc-title.justify { color:#1d4ed8; }
.cs-pc-list { margin:0; padding:0; list-style:none; font-size:12.5px; line-height:1.65; }
.cs-pc-list.pros li { color:#065f46; }
.cs-pc-list.cons li { color:#991b1b; }
.cs-pc-list.justify li { color:#1e40af; }

/* תקדים משפטי - מרכיב מתקפל */
.cs-precedent-box {
    margin-top:14px;
    border:1px solid #e0d4f7;
    border-radius:10px;
    background:linear-gradient(135deg, #faf5ff 0%, #f3eafe 100%);
    overflow:hidden;
    transition:all 0.3s ease;
}
.cs-precedent-box[open] {
    box-shadow:0 4px 12px rgba(124,58,237,0.12);
    border-color:#c4b5fd;
}
.cs-precedent-summary {
    display:flex;
    align-items:center;
    gap:10px;
    padding:12px 14px;
    cursor:pointer;
    list-style:none;
    user-select:none;
    transition:background 0.2s;
}
.cs-precedent-summary::-webkit-details-marker { display:none; }
.cs-precedent-summary:hover { background:rgba(124,58,237,0.06); }
.cs-precedent-icon {
    font-size:18px;
    filter:drop-shadow(0 1px 2px rgba(124,58,237,0.3));
}
.cs-precedent-title {
    flex:1;
    font-weight:700;
    color:#5b21b6;
    font-size:14px;
}
.cs-precedent-arrow {
    color:#7c3aed;
    font-size:12px;
    transition:transform 0.3s ease;
}
.cs-precedent-box[open] .cs-precedent-arrow {
    transform:rotate(-90deg);
}
.cs-precedent-content {
    padding:4px 16px 16px;
    border-top:1px dashed #d8b4fe;
    margin-top:4px;
    animation:cs-precedent-fade 0.4s ease;
}
@keyframes cs-precedent-fade {
    from { opacity:0; transform:translateY(-4px); }
    to { opacity:1; transform:translateY(0); }
}
.cs-precedent-intro {
    margin:10px 0 8px;
    color:#6b21a8;
    font-size:13px;
    font-weight:600;
}
.cs-precedent-list {
    margin:0;
    padding-right:18px;
    color:#374151;
    font-size:13px;
    line-height:1.7;
}
.cs-precedent-list li { margin-bottom:8px; }
.cs-precedent-list li strong { color:#5b21b6; }
.cs-flow { background:white; border-radius:12px; border:1px solid #e5e7eb; padding:20px; }
.cs-flow-step { display:flex; gap:14px; padding:14px 0; border-bottom:1px dashed #e5e7eb; }
.cs-flow-step:last-child { border-bottom:none; }
.cs-flow-num { flex-shrink:0; width:36px; height:36px; line-height:36px; text-align:center; background:#2563eb; color:white; border-radius:50%; font-weight:700; }
.cs-flow-content { flex:1; }
.cs-flow-title { font-size:14.5px; font-weight:700; color:#111827; margin-bottom:4px; }
.cs-flow-desc { font-size:13px; color:#4b5563; line-height:1.6; }
.cs-table-wrap { background:white; border-radius:12px; box-shadow:0 1px 3px rgba(0,0,0,0.06); overflow:hidden; border:1px solid #e5e7eb; }
.cs-table { width:100%; border-collapse:collapse; }
.cs-table thead th { background:#f3f4f6; color:#374151; font-weight:700; font-size:13px; padding:14px 16px; text-align:right; border-bottom:2px solid #e5e7eb; letter-spacing:.02em; }
.cs-table tbody tr.cs-row-main { transition: background 0.15s; }
.cs-table tbody tr.cs-row-main:hover { background:#fafbff; }
.cs-table tbody td { padding:16px; vertical-align:top; border-bottom:1px solid #f3f4f6; font-size:13.5px; line-height:1.65; color:#374151; }
.cs-type-cell { font-weight:700; font-size:15px; color:#111827; white-space:nowrap; min-width:160px; }
.cs-type-icon { display:inline-block; width:32px; height:32px; line-height:32px; text-align:center; border-radius:8px; margin-left:8px; vertical-align:middle; font-size:18px; }
.cs-pros-list, .cs-cons-list { margin:0; padding:0; list-style:none; }
.cs-pros-list li { color:#047857; padding:2px 0; }
.cs-pros-list li::before { content:"✓ "; font-weight:700; }
.cs-cons-list li { color:#b91c1c; padding:2px 0; }
.cs-cons-list li::before { content:"✗ "; font-weight:700; }
.cs-examples-cell { min-width:180px; }
.cs-chip { display:inline-flex; align-items:center; gap:4px; padding:6px 12px; background:#eff6ff; border:1px solid #bfdbfe; color:#1d4ed8; border-radius:999px; cursor:pointer; margin:3px 3px 3px 0; font-size:13px; font-weight:600; transition: all 0.15s; user-select:none; }
.cs-chip::before { content:'▸'; font-size:9px; transition:transform 0.2s; opacity:.6; }
.cs-chip:hover { background:#dbeafe; transform: translateY(-1px); }
.cs-chip.active { background:#2563eb; color:white; border-color:#2563eb; box-shadow:0 2px 6px rgba(37,99,235,0.3); }
.cs-chip.active::before { transform:rotate(90deg); opacity:1; }
.cs-chip.no-example { background:#f9fafb; color:#9ca3af; border:1px dashed #d1d5db; cursor:default; font-weight:500; }
.cs-chip.no-example::before { display:none; }
.cs-chip.no-example:hover { background:#f9fafb; transform:none; }
.cs-detail-row { display:none; }
.cs-detail-row.expanded { display:table-row; }
.cs-detail-cell { padding:0 !important; background:transparent; }
.cs-detail-inner { background: linear-gradient(180deg, #f8fafc 0%, #eff6ff 100%); border-right:4px solid var(--cs-accent, #2563eb); padding:18px 24px; margin:0; }
.cs-detail-header { display:flex; align-items:center; gap:10px; margin-bottom:10px; }
.cs-detail-name { font-size:16px; font-weight:800; color:#1e3a8a; }
.cs-detail-badge { font-size:11px; padding:3px 8px; background:rgba(37,99,235,0.12); color:#1e40af; border-radius:999px; font-weight:600; }
.cs-detail-desc { font-size:13.5px; color:#374151; line-height:1.7; margin-bottom:12px; }
.cs-detail-grid { display:grid; grid-template-columns:1fr 1fr; gap:16px; }
.cs-detail-col { background:white; border-radius:8px; padding:12px 14px; border:1px solid #dbeafe; }
.cs-detail-col-title { font-size:12px; font-weight:700; text-transform:uppercase; letter-spacing:.05em; margin-bottom:6px; }
.cs-detail-col.cs-pros .cs-detail-col-title { color:#047857; }
.cs-detail-col.cs-cons .cs-detail-col-title { color:#b91c1c; }
.cs-detail-col ul { margin:0; padding:0; list-style:none; font-size:13px; line-height:1.7; }
.cs-detail-col.cs-pros li { color:#065f46; }
.cs-detail-col.cs-cons li { color:#991b1b; }
@media (max-width:900px){ .cs-detail-grid{grid-template-columns:1fr;} .cs-table thead{display:none;} }
</style>

<div class="cs-container">
    <div class="cs-top-bar">
        <button class="rm-action-btn" onclick="app.closeBoardroomItem()">→ חזרה לחדר ישיבות</button>
        <div class="cs-title-group">
            <h2 class="cs-title">🏛️ תאגיד, איחוד קרנות, OPT OUT</h2>
            <p class="cs-subtitle">חלופות מבנה תאגידי, איחוד קרנות, ומתווה צירוף מבוטחים למוצר החדש</p>
        </div>
        <div style="width:180px"></div>
    </div>

    <div class="cs-tabs" role="tablist">
        <button class="cs-tab active" onclick="csSwitchTab(this,'cs-pane-structure')"><span class="cs-tab-icon">🏛️</span>מבנה תאגידי</button>
        <button class="cs-tab" onclick="csSwitchTab(this,'cs-pane-merge')"><span class="cs-tab-icon">🔗</span>איחוד קרנות</button>
        <button class="cs-tab" onclick="csSwitchTab(this,'cs-pane-optin')"><span class="cs-tab-icon">🎯</span>OPT IN / OPT OUT</button>
    </div>

    <!-- ============ טאב 1: מבנה תאגידי ============ -->
    <div class="cs-tab-pane active" id="cs-pane-structure">
    <h3 class="cs-section-title">השוואת חלופות לגוף שינהל את הקבוצה הסגורה</h3>
    <p class="cs-section-sub">לחיצה על דוגמה פותחת פירוט ספציפי לאותה דוגמה.</p>
    <div class="cs-table-wrap">
        <table class="cs-table">
            <thead>
                <tr>
                    <th style="width:16%">סוג</th>
                    <th style="width:23%">הסבר</th>
                    <th style="width:23%">יתרונות</th>
                    <th style="width:23%">חסרונות</th>
                    <th style="width:15%">דוגמאות</th>
                </tr>
            </thead>
            <tbody>
                <!-- 1. תאגיד סטטוטורי -->
                <tr class="cs-row-main">
                    <td class="cs-type-cell"><span class="cs-type-icon" style="background:#d1fae5">📜</span>תאגיד סטטוטורי<div style="margin-top:6px"><span class="cs-rank cs-rank-1">מועדף</span></div></td>
                    <td>תאגיד שמוקם בחקיקה ראשית. לא נדרש להעבירו דרך רשות החברות הממשלתיות, אין דרישת הון עצמי פורמלית, וניתן לעצב את כל המבנה בחוק עצמו (מי ממנה, איך ממנה, סמכויות פיקוח, מימון).</td>
                    <td><ul class="cs-pros-list"><li>מבנה ידוע ומוכר — תקדים מוצלח של 30 שנה</li><li>אין צורך ברשות החברות הממשלתיות</li><li>שליטה ממשלתית — השר ממנה את היו״ר (לא הממונה)</li><li>חל אוטומטית: חוק מבקר המדינה, חובת מכרזים</li><li>פשטות הקמה יחסית</li><li>מוציא את חברות הביטוח וקופות החולים מהמשוואה הניהולית (ייתכן שיהיו נציגים בהנהלה ויהיו אחראים לגבייה)</li></ul></td>
                    <td><ul class="cs-cons-list"><li>חוק חוזה הביטוח לא חל על קרנית — רק ע"י תקנון פנימי</li><li>חוק הפיקוח לא חל במישירין</li><li>בקרנית הקיימת: הוראות הרשות מתקבלות ב"רצון טוב"</li><li>ככל הנראה יהיה דרישה למינוי דירקטורים מהציבור</li><li>הקמת תאגיד סטטוטורי נוסף כאשר הרשות אינה כזו</li></ul></td>
                    <td class="cs-examples-cell">
                        <span class="cs-chip" onclick="csToggleExample(this,'stat-karnit')">קרנית</span>
                    </td>
                </tr>
                <tr class="cs-detail-row" id="cs-detail-stat-karnit">
                    <td colspan="5" class="cs-detail-cell">
                        <div class="cs-detail-inner" style="--cs-accent:#059669">
                            <div class="cs-detail-header">
                                <span class="cs-detail-name">קרנית</span>
                                <span class="cs-detail-badge">דוגמה — תאגיד סטטוטורי</span>
                            </div>
                            <div class="cs-detail-desc"><strong>בסיס משפטי:</strong> סעיף 10 לחוק הפיצויים לנפגעי תאונות דרכים. הוקמה בחקיקה ראשית.<br><strong>תיאור:</strong> תאגיד סטטוטורי מובהק. ממומנת ב-1% מהפרמיה ברכב חובה (~70-75 מ׳ ש״ח/שנה). משלמת תביעות בלבד — אינה גובה פרמיות. שר האוצר ממנה את היו״ר ואת הדירקטוריון. מבטחת דה-פקטו (אינה בעלת רישיון מבטח).</div>
                            <div class="cs-detail-grid">
                                <div class="cs-detail-col cs-pros"><div class="cs-detail-col-title">יתרונות קרנית</div><ul><li>תקדים מוצלח לאורך 30 שנה</li><li>מימון מובנה דרך הפרמיה</li><li>שליטה ממשלתית ברורה (השר ממנה יו״ר)</li><li>פטור מרשות החברות הממשלתיות</li></ul></div>
                                <div class="cs-detail-col cs-cons"><div class="cs-detail-col-title">חסרונות קרנית</div><ul><li>חוק חוזה הביטוח / חוק הפיקוח לא חלים</li><li>הוראות הרשות מתקבלות ב"רצון טוב"</li><li>"מצפצפת על הרשות" (ציטוט ודיע)</li><li>חובת מסירת דוחות בלבד</li></ul></div>
                            </div>
                            <div class="cs-detail-desc" style="margin-top:10px"><strong>סוגיות לבדיקה:</strong> בחוק החדש לעגן מפורשות — החלת חוק חוזה ביטוח, חוק הפיקוח, סמכויות פיקוח מלאות, מינוי דירקטורים, דרישות הון עצמי. גביית פרמיות ע״י קופות החולים. מבנה הדירקטוריון, נציג רשות, נציג משפטים.</div>
                        </div>
                    </td>
                </tr>

                <!-- 2. חברה ממשלתית -->
                <tr class="cs-row-main">
                    <td class="cs-type-cell"><span class="cs-type-icon" style="background:#dbeafe">🏛️</span>חברה ממשלתית</td>
                    <td>חברה שהוקמה לפי חוק החברות הממשלתיות. כפופה לפיקוח של רשות החברות הממשלתיות, מינויים דרך השר, ודרישות הון עצמי.</td>
                    <td><ul class="cs-pros-list"><li>תשתית רגולטורית קיימת (ענבל)</li><li>ניסיון מוכח בניהול ביטוח</li></ul></td>
                    <td><ul class="cs-cons-list"><li>כפיפות לרשות החברות הממשלתיות — חסמי הקמה ופיקוח</li><li>מצב פוליטי בעייתי — מינויים תקועים, רעש סביב חברות ממשלתיות</li><li>מורכבות הקמה</li></ul></td>
                    <td class="cs-examples-cell">
                        <span class="cs-chip" onclick="csToggleExample(this,'gov-inbal')">ענבל</span>
                    </td>
                </tr>
                <tr class="cs-detail-row" id="cs-detail-gov-inbal">
                    <td colspan="5" class="cs-detail-cell">
                        <div class="cs-detail-inner" style="--cs-accent:#2563eb">
                            <div class="cs-detail-header">
                                <span class="cs-detail-name">ענבל</span>
                                <span class="cs-detail-badge">דוגמה — חברה ממשלתית</span>
                            </div>
                            <div class="cs-detail-desc"><strong>בסיס משפטי:</strong> חברה ממשלתית רגילה. רישיון מבטח לחלק מתחומיה. חקיקה ספציפית רק לרכב חובה (לבדיקה).<br><strong>תיאור:</strong> החברה הממשלתית היחידה עם מומחיות בניהול ביטוח. מטפלת בנכסי המדינה, רכב חובה ממשלתי וכו׳. עובדת מול החשב הכללי.</div>
                            <div class="cs-detail-grid">
                                <div class="cs-detail-col cs-pros"><div class="cs-detail-col-title">יתרונות ענבל</div><ul><li>מומחיות קיימת בניהול ביטוח</li><li>תשתית פעילה</li><li>מנגנון פיקוח מבוסס מול החשכ״ל</li></ul></div>
                                <div class="cs-detail-col cs-cons"><div class="cs-detail-col-title">חסרונות ענבל</div><ul><li>כפיפות לרשות החברות הממשלתיות</li><li>מצב פוליטי בעייתי, הרבה רעש</li><li>מורכבות הקמה</li></ul></div>
                            </div>
                            <div class="cs-detail-desc" style="margin-top:10px"><strong>סוגיות:</strong> האם יש חקיקה ספציפית קיימת לענבל שיכולה לכלול גם סיעוד?</div>
                        </div>
                    </td>
                </tr>

                <!-- 3. חברת ביטוח פרטית -->
                <tr class="cs-row-main">
                    <td class="cs-type-cell"><span class="cs-type-icon" style="background:#fee2e2">🏢</span>חברת ביטוח פרטית</td>
                    <td>חברת ביטוח פרטית שמנהלת — בין אם דרך מכרז ובין אם הוקמה ביוזמת המפקח. מודל הסתמכות על שוק קיים.</td>
                    <td><ul class="cs-pros-list"><li>ידע ומומחיות קיימים בשוק</li><li>אין צורך בהקמת גוף חדש</li><li>תחרות במכרז</li></ul></td>
                    <td><ul class="cs-cons-list"><li>דומה מדי למודל הקיים — מעלה שאלות למה לשנות</li><li>חברת ביטוח עושה רווח על מוצר שמקבל סבסוד ממשלתי</li><li>מכרז ל-30 שנה בעייתי — דורש יציאה מחודשת</li><li>אינטרס מסחרי שמתנגש עם הציבורי</li></ul></td>
                    <td class="cs-examples-cell">
                        <span class="cs-chip" onclick="csToggleExample(this,'priv-tender')">חברת ביטוח פרטית</span>
                    </td>
                </tr>
                <tr class="cs-detail-row" id="cs-detail-priv-tender">
                    <td colspan="5" class="cs-detail-cell">
                        <div class="cs-detail-inner" style="--cs-accent:#dc2626">
                            <div class="cs-detail-header">
                                <span class="cs-detail-name">מכרז לחברת ביטוח רגילה</span>
                                <span class="cs-detail-badge">דוגמה — חברת ביטוח פרטית</span>
                            </div>
                            <div class="cs-detail-desc"><strong>בסיס משפטי:</strong> מכרז ציבורי. החברה הזוכה מנהלת ל-X שנים.<br><strong>תיאור:</strong> המודל הקיים היום (כל קופת חולים מנהלת מכרז ובוחרת חברת ביטוח). הצעה: להמשיך באותו מודל אבל באופן מרוכז, או להעביר לחברה אחת בלבד.</div>
                            <div class="cs-detail-grid">
                                <div class="cs-detail-col cs-pros"><div class="cs-detail-col-title">יתרונות מכרז</div><ul><li>ידע ומומחיות קיימים בשוק</li><li>אין צורך בהקמת גוף חדש</li><li>תחרות במכרז</li></ul></div>
                                <div class="cs-detail-col cs-cons"><div class="cs-detail-col-title">חסרונות מכרז</div><ul><li>דומה מדי למודל הקיים — מעלה שאלות למה לשנות</li><li>רווח על מוצר עם סבסוד ממשלתי — לא תקין</li><li>מכרז ל-30 שנה בעייתי</li><li>אינטרס מסחרי מתנגש עם הציבורי</li></ul></div>
                            </div>
                        </div>
                    </td>
                </tr>

                <!-- 4. פול -->
                <tr class="cs-row-main">
                    <td class="cs-type-cell"><span class="cs-type-icon" style="background:#fef3c7">🌀</span>פול</td>
                    <td>תאגיד שהוקם בתקנות (לא בחוק) ע״י חברות הביטוח.</td>
                    <td><ul class="cs-pros-list"><li>מנגנון מתמרץ — חברות הביטוח מקימות מתוך אינטרס</li><li>עלות נמוכה למדינה — אין מימון ישיר</li><li>פיזור סיכונים מובנה בין חברות הביטוח</li></ul></td>
                    <td><ul class="cs-cons-list"><li>שליטה רגולטורית חלשה</li><li>בעלי המניות הם חברות הביטוח</li><li>אינו מוגדר כמבטח (אין רישיון)</li></ul></td>
                    <td class="cs-examples-cell">
                        <span class="cs-chip" onclick="csToggleExample(this,'pool-existing')">הפול</span>
                    </td>
                </tr>
                <tr class="cs-detail-row" id="cs-detail-pool-existing">
                    <td colspan="5" class="cs-detail-cell">
                        <div class="cs-detail-inner" style="--cs-accent:#d97706">
                            <div class="cs-detail-header">
                                <span class="cs-detail-name">הפול הקיים (ביטוח רכב חובה)</span>
                                <span class="cs-detail-badge">דוגמה — פול</span>
                            </div>
                            <div class="cs-detail-desc"><strong>בסיס משפטי:</strong> סעיף 7ג לפקודת ביטוח רכב מנועים. תקנה 3 לתקנות "ביטוח רכב מנועים, הסדר ביטוח שיורי". אין הקמה בחקיקה ראשית.<br><strong>תיאור:</strong> המבטחים מקימים תאגיד באישור הרשות. אם הם לא מקימים — הרשות עצמה משמשת מנהל ההסדר (סנקציה: 1.5% מהפרמיה כעלות גבייה). בעלי המניות הם חברות הביטוח. בית המשפט העליון פסק שאין עליו חובת מכרזים.</div>
                            <div class="cs-detail-grid">
                                <div class="cs-detail-col cs-pros"><div class="cs-detail-col-title">יתרונות פול</div><ul><li>מנגנון מתמרץ — חברות הביטוח פועלות מאינטרס</li><li>עלות נמוכה למדינה</li><li>פיזור סיכונים מובנה</li></ul></div>
                                <div class="cs-detail-col cs-cons"><div class="cs-detail-col-title">חסרונות פול</div><ul><li>שליטה רגולטורית חלשה (אין סמכות לפסול מינויים)</li><li>בעלי המניות = חברות הביטוח</li><li>אינו מוגדר כמבטח</li></ul></div>
                            </div>
                            <div class="cs-detail-desc" style="margin-top:10px"><strong>סוגיות:</strong> לא רלוונטי לסיעוד — מודל לא מותאם. ההמלצה החד-משמעית: לא לשקול.</div>
                        </div>
                    </td>
                </tr>

                <!-- 5. מנהל מורשה -->
                <tr class="cs-row-main">
                    <td class="cs-type-cell"><span class="cs-type-icon" style="background:#ede9fe">🔑</span>מנהל מורשה</td>
                    <td>מנהל מורשה שמקבל מנדט לתחום מסוים ולא לחברה. כפוף למפקח. המנהל מקים תאגיד.</td>
                    <td><ul class="cs-pros-list"><li>שליטה רגולטוריה</li></ul></td>
                    <td><ul class="cs-cons-list"><li>מבנה מעורפל — בין חברה עמיתים לפול</li><li>שליטה ממשלתית פחותה ממודל סטטוטורי</li></ul></td>
                    <td class="cs-examples-cell">
                        <span class="cs-chip" onclick="csToggleExample(this,'mng-amitim')">עמיתים</span>
                        <span class="cs-chip" onclick="csToggleExample(this,'mng-kupot')">קופ״ח כבעלי מניות</span>
                    </td>
                </tr>
                <tr class="cs-detail-row" id="cs-detail-mng-amitim">
                    <td colspan="5" class="cs-detail-cell">
                        <div class="cs-detail-inner" style="--cs-accent:#7c3aed">
                            <div class="cs-detail-header">
                                <span class="cs-detail-name">עמיתים</span>
                                <span class="cs-detail-badge">דוגמה — מנהל מורשה</span>
                            </div>
                            <div class="cs-detail-desc"><strong>בסיס משפטי:</strong> מנהל מורשה לקרנות הפנסיה הוותיקות בהסדר. חברת בת של מבטחים. אין לה רישיון מבטח. תפעול בלבד.<br><strong>תיאור:</strong> מנהל את קרנות הפנסיה הוותיקות בהסדר. גובה היום תגמולים דרך המעסיק בלבד — לא יודעת לגבות מאדם פרטי. תשתית תפעולית קיימת.</div>
                            <div class="cs-detail-grid">
                                <div class="cs-detail-col cs-pros"><div class="cs-detail-col-title">יתרונות עמיתים</div><ul><li>תשתית קיימת לניהול קרנות בהסדר</li><li>ניסיון מוכח</li><li>תפעול שוטף של תקנון, דירקטוריון וכו׳</li><li>תחת פיקוח הרשות</li></ul></div>
                                <div class="cs-detail-col cs-cons"><div class="cs-detail-col-title">חסרונות עמיתים</div><ul><li>אין רישיון מבטח — חייבת להקים חברת בת עם רישיון</li><li>אין יכולת גבייה מאדם פרטי — רק ממעסיק</li></ul></div>
                            </div>
                        </div>
                    </td>
                </tr>
                <tr class="cs-detail-row" id="cs-detail-mng-kupot">
                    <td colspan="5" class="cs-detail-cell">
                        <div class="cs-detail-inner" style="--cs-accent:#7c3aed">
                            <div class="cs-detail-header">
                                <span class="cs-detail-name">תאגיד שבו קופ״ח בעלי מניות</span>
                                <span class="cs-detail-badge">דוגמה — מנהל מורשה (סוג של פול)</span>
                            </div>
                            <div class="cs-detail-desc"><strong>בסיס משפטי:</strong> נדרשת מסגרת חקיקתית חדשה. סוג של פול — אבל עם קופות החולים כבעלי מניות במקום חברות הביטוח.<br><strong>תיאור:</strong> הקמת תאגיד לניהול הקבוצה הסגורה, בו קופות החולים משמשות "מעין בעלי מניות". מנוהל ע״י מנהל מורשה כפוף למפקח. הצעה שעלתה מדור.</div>
                            <div class="cs-detail-grid">
                                <div class="cs-detail-col cs-pros"><div class="cs-detail-col-title">יתרונות</div><ul><li>שליטה דומה לעמיתים ולפול</li><li>שליטה כפופה למפקח</li><li>דומה למבנה הקיים שבו קופ״ח חלק מתכניות הביטוח — ייתכן ויקל על ההקמה</li><li>פשוט יחסית לרשות — מאפיינים של עמיתים</li></ul></div>
                                <div class="cs-detail-col cs-cons"><div class="cs-detail-col-title">חסרונות</div><ul><li>קופ״ח כחלק מתכניות הביטוח = חלק מהבעיה הקיימת (גם יתרון וגם חיסרון)</li><li>ניגוד עניינים פוטנציאלי של הקופות</li><li>מעמד "מעין בעל מניות" לא מוגדר משפטית</li><li>סיכון של דומיננטיות הקופות על חשבון האינטרס הציבורי</li></ul></div>
                            </div>
                            <div class="cs-detail-desc" style="margin-top:10px"><strong>סוגיות:</strong> דור — לעצב הוראות חוק שיגדירו מעמד הקופות (זכויות הצבעה, רווחים, אחריות). מודל ההכרעה: מי מנהל בפועל — הקופות, המנהל המורשה, או דירקטוריון מעורב.</div>
                        </div>
                    </td>
                </tr>
            </tbody>
        </table>
    </div>
    </div><!-- /pane structure -->

    <!-- ============ טאב 2: איחוד קרנות ============ -->
    <div class="cs-tab-pane" id="cs-pane-merge">
        <h3 class="cs-section-title">איחוד קרנות — חלופות</h3>
        <p class="cs-section-sub">שלוש חלופות מבניות לניהול 4 הקרנות הקיימות.</p>

        <div class="cs-options-grid">
            <!-- חלופה 1 -->
            <div class="cs-option-card">
                <div class="cs-option-header">
                    <div class="cs-option-name">איחוד מלא — קרן אחת</div>
                    <span class="cs-rank cs-rank-1">דירוג 1</span>
                </div>
                <div class="cs-option-body">
                    <div class="cs-option-desc">כל 4 הקרנות מתמזגות לקרן אחת מאוחדת תחת גוף ניהולי אחד.</div>
                    <div class="cs-pc-block"><div class="cs-pc-title pros">יתרונות</div><ul class="cs-pc-list pros"><li>✓ פיזור סיכון מקסימלי — האוכלוסייה הגדולה ביותר</li><li>✓ ניהול פשוט — מערכת אחת, מנגנון אחד</li><li>✓ הכי נכון אקטוארית</li></ul></div>
                    <div class="cs-pc-block"><div class="cs-pc-title cons">חסרונות</div><ul class="cs-pc-list cons"><li>✗ הכי קשה משפטית</li></ul></div>
                    <div class="cs-pc-block"><div class="cs-pc-title justify">הצדקה</div><ul class="cs-pc-list justify"><li>★ Run Off — אין מבוטחים חדשים, נדרש ניהול מאוחד</li><li>★ סיוע ממשלתי זהה בין אם מדובר בקרן אחת או בקרנות נפרדות</li></ul></div>
                    <div class="cs-pc-block"><div class="cs-pc-title" style="color:#7c3aed;font-weight:700">פתרון אפשרי</div><ul class="cs-pc-list" style="color:#5b21b6"><li>★ הלאמה של חלק מהקרן של מכבי</li></ul></div>

                    <details class="cs-precedent-box">
                        <summary class="cs-precedent-summary">
                            <span class="cs-precedent-icon">⚖️</span>
                            <span class="cs-precedent-title">תקדים משפטי — פס"ד הדסה</span>
                            <span class="cs-precedent-arrow">◄</span>
                        </summary>
                        <div class="cs-precedent-content">
                            <p class="cs-precedent-intro">בית הדין מסביר את הרציונל בכמה רבדים:</p>
                            <ol class="cs-precedent-list">
                                <li><strong>המדינה התנדבה לשאת בנטל</strong> — היא לא הייתה חייבת לפי הדין הקודם, אבל בחרה להציל. בתמורה, היא רשאית להטיל חובה גם על שאר ה"שחקנים".</li>
                                <li><strong>התוספת לא נגזרת מהגירעון הספציפי</strong> — זוהי הנקודה העקרונית: התוספת לא חושבה לפי תרומת כל עמית/מעסיק לגירעון של הקרן הספציפית שלו. זה הסדר אחיד.</li>
                                <li><strong>לא הפתרון "הצודק" ביותר — אבל ה"נכון"</strong> — בית הדין מודה בכך מפורשות: עמית בקרן חזקה יותר נדרש לתוספת זהה לעמית בקרן חלשה יותר, וזה לא צודק במובן האריתמטי הצר. אבל זה ישים, פרקטי ויעיל בהקשר של הליך הבראה.</li>
                                <li><strong>כולם נרתמו "בעל כורחם — אך לטובתם"</strong> — גם המעסיקים והעמיתים בקרנות החזקות נהנים מההצלה (אחרת הקרן שלהם הייתה קורסת בסופו של דבר), ולכן צודק לדרוש מהם השתתפות גם אם היא לא פרופורציונלית במדויק.</li>
                            </ol>
                        </div>
                    </details>
                </div>
            </div>

            <!-- חלופה 2 -->
            <div class="cs-option-card">
                <div class="cs-option-header">
                    <div class="cs-option-name">4 קרנות תחת גוף אחד</div>
                    <span class="cs-rank cs-rank-2">דירוג 2</span>
                </div>
                <div class="cs-option-body">
                    <div class="cs-option-desc">הקרנות נשארות נפרדות אקטוארית, אבל מנוהלות כולן תחת גוף ניהול אחד.</div>
                    <div class="cs-pc-block"><div class="cs-pc-title pros">יתרונות</div><ul class="cs-pc-list pros"><li>✓ פגיעה פחותה בזכות הקניין</li><li>✓ אחידות ניהולית ושקיפות</li><li>✓ אפשרות לפרמיות נפרדות לכל קרן</li></ul></div>
                    <div class="cs-pc-block"><div class="cs-pc-title cons">חסרונות</div><ul class="cs-pc-list cons"><li>✗ פיזור סיכון מוגבל בכל קרן</li><li>✗ סבסוד צולב לא מובנה — דורש מנגנון איזון</li></ul></div>
                    <div class="cs-pc-block"><div class="cs-pc-title justify">הצדקה</div><ul class="cs-pc-list justify"><li>★ מאזן בין שמירה על הזכויות הקיימות לבין ניהול מסודר</li></ul></div>
                </div>
            </div>

            <!-- חלופה 3 -->
            <div class="cs-option-card">
                <div class="cs-option-header">
                    <div class="cs-option-name">4 קרנות מפוצלות תחת גופים שונים</div>
                    <span class="cs-rank cs-rank-3">דירוג 3</span>
                </div>
                <div class="cs-option-body">
                    <div class="cs-option-desc">המצב הקיים (כמעט) — כל קרן ממשיכה תחת גוף ניהולי נפרד, עם הוראות החלה אחידות.</div>
                    <div class="cs-pc-block"><div class="cs-pc-title pros">יתרונות</div><ul class="cs-pc-list pros"><li>✓ פגיעה מינימלית בזכות הקניין</li><li>✓ קל ליישום — מינימום שינוי</li></ul></div>
                    <div class="cs-pc-block"><div class="cs-pc-title cons">חסרונות</div><ul class="cs-pc-list cons"><li>✗ ארביטראז' רגולטורי בין הגופים</li><li>✗ פיזור סיכון נמוך</li><li>✗ מורכבות פיקוחית</li><li>✗ ייקור עלויות ניהול</li></ul></div>
                    <div class="cs-pc-block"><div class="cs-pc-title justify">הצדקה</div><ul class="cs-pc-list justify"><li>★ אופציה לסטטוס קוו — בעיקר אם איחוד נחסם משפטית</li></ul></div>
                </div>
            </div>
        </div>
    </div><!-- /pane merge -->

    <!-- ============ טאב 3: OPT IN / OPT OUT ============ -->
    <div class="cs-tab-pane" id="cs-pane-optin">
        <h3 class="cs-section-title">מתווה צירוף מבוטחים למוצר החדש — OPT OUT</h3>
        <p class="cs-section-sub">הוכרע: מודל אופט-אאוט. שיבוץ אוטומטי + חלון בחירה. </p>

        <div class="cs-flow">
            <div class="cs-flow-step">
                <div class="cs-flow-num">1</div>
                <div class="cs-flow-content">
                    <div class="cs-flow-title">תאריך קובע — מועד הצטרפות אחרון למוצר הקיים</div>
                    <div class="cs-flow-desc">קביעה מועד אחרון להצטרפות חדשה למוצר הסיעודי הקיים — חיוני למניעת כניסת אנשים ברגע האחרון כדי לתפוס את הסבסוד הממשלתי.</div>
                </div>
            </div>

            <div class="cs-flow-step">
                <div class="cs-flow-num">2</div>
                <div class="cs-flow-content">
                    <div class="cs-flow-title">חלון בחירה — חצי שנה לפני המעבר</div>
                    <div class="cs-flow-desc">תקופה של 6 חודשים שבה כל מבוטח רשאי לבחור באופן אקטיבי את המבטח שלו מבין הזוכים במכרז. בתום התקופה — מי שלא בחר משובץ אוטומטית.</div>
                </div>
            </div>

            <div class="cs-flow-step">
                <div class="cs-flow-num">3</div>
                <div class="cs-flow-content">
                    <div class="cs-flow-title">ברירת מחדל — שיבוץ רנדומלי שוויוני</div>
                    <div class="cs-flow-desc">מבוטח שלא בחר עד תום החלון משובץ אוטומטית באופן רנדומלי. כל חברה זוכה מקבלת חלק יחסי מהאוכלוסייה.</div>
                </div>
            </div>

            <div class="cs-flow-step">
                <div class="cs-flow-num">4</div>
                <div class="cs-flow-content">
                    <div class="cs-flow-title">תקופת חרטה אחרי המעבר</div>
                    <div class="cs-flow-desc">לאחר השיבוץ למוצר החדש — חלון נוסף של מספר חודשים שבו ניתן לבטל ולמשוך ללא מס. לאחר חלון זה — המבוטח "נעול" כמו בכל פוליסת חיסכון.</div>
                </div>
            </div>

        </div>

        <h3 class="cs-section-title" style="margin-top:24px">סוגיות פתוחות בנושא צעירים</h3>
        <div class="cs-options-grid">
            <div class="cs-option-card">
                <div class="cs-option-header">
                    <div class="cs-option-name">משיכת כסף בעת סירוב</div>
                    <span class="cs-rank cs-rank-2">פתוח</span>
                </div>
                <div class="cs-option-body">
                    <div class="cs-option-desc">מה קורה אם צעיר מסרב להצטרף בחלון הראשוני? האם מקבל פיצוי / משיכה?</div>
                    <div class="cs-pc-block"><div class="cs-pc-title pros">בעד פיצוי</div><ul class="cs-pc-list pros"><li>עיקרון מידתיות — לא מעבירים אדם בכפייה ממוצר ששילם בעדו</li></ul></div>
                    <div class="cs-pc-block"><div class="cs-pc-title cons">נגד פיצוי</div><ul class="cs-pc-list cons"><li>הקרן היא של המבוגרים — צעיר לא תרם</li><li>שווי המבוטח יורד דרמטית — חברות במכרז לא ייקחו קבוצה שאפשר לרוקן</li><li>פגיעה במבנה הכלכלי של המכרז</li></ul></div>
                </div>
            </div>

            <div class="cs-option-card">
                <div class="cs-option-header">
                    <div class="cs-option-name">דיפרנציאליות גילי 50-55</div>
                    <span class="cs-rank cs-rank-2">פתוח</span>
                </div>
                <div class="cs-option-body">
                    <div class="cs-option-desc">קבוצת ה"חצי בוגרים" — בני 50-55 — אינה הומוגנית עם הצעירים או עם המבוגרים. נדרש פתרון מובחן.</div>
                    <div class="cs-pc-block"><div class="cs-pc-title cons">בעיות</div><ul class="cs-pc-list cons"><li>חיתוך חד ב-55 פוגע בבני 53-54 ששילמו פרמיות גבוהות</li><li>הצמדה לצעירים לא הוגנת אקטוארית</li></ul></div>
                </div>
            </div>

            <div class="cs-option-card">
                <div class="cs-option-header">
                    <div class="cs-option-name">הודעה למבוטחים</div>
                    <span class="cs-rank cs-rank-1">סוכם בפגישה</span>
                </div>
                <div class="cs-option-body">
                    <div class="cs-option-desc">מנגנון יידוע פעיל למבוטחים — הודעה עם רשימת חברות זוכות והנחיות לבחירה.</div>
                    <div class="cs-pc-block"><div class="cs-pc-title pros">לטובת אופט-אין מודע</div><ul class="cs-pc-list pros"><li>שקיפות מלאה למבוטחים</li><li>חברות הביטוח יכולות גם הן לפנות למבוטחים</li></ul></div>
                    <div class="cs-pc-block"><div class="cs-pc-title cons">מגבלה</div><ul class="cs-pc-list cons"><li>רוב האנשים עדיין לא יבחרו אקטיבית — הסיבה למודל אופט-אאוט</li></ul></div>
                </div>
            </div>
        </div>
    </div><!-- /pane optin -->

</div>

`;
    }

    roadmapExpandAll() {
        document.querySelectorAll('#boardroomContent .rm-box, #boardroomContent .rm-alt').forEach(el => el.classList.add('expanded'));
    }

    roadmapCollapseAll() {
        document.querySelectorAll('#boardroomContent .rm-box, #boardroomContent .rm-alt').forEach(el => el.classList.remove('expanded'));
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

    getTenderAlternativesHTML() {
        return `
<style>
.ta-container { padding: 24px; max-width: 1400px; margin: 0 auto; direction: rtl; }
.ta-top-bar { display:flex; align-items:center; justify-content:space-between; gap:16px; margin-bottom:20px; padding-bottom:16px; border-bottom:1px solid #e5e7eb; }
.ta-title-group { text-align:center; flex:1; }
.ta-title { font-size: 26px; font-weight: 800; color:#111827; margin:0; }
.ta-subtitle { font-size: 14px; color:#6b7280; margin:4px 0 0; }

.ta-intro { background:#f9fafb; border-right:4px solid #2563eb; padding:14px 18px; border-radius:8px; margin-bottom:24px; font-size:13.5px; color:#374151; line-height:1.7; font-style:italic; }

.ta-section-title { font-size:18px; font-weight:800; color:#1e3a8a; margin:24px 0 12px; padding-bottom:8px; border-bottom:2px solid #e0e7ff; }
.ta-section-sub { font-size:13.5px; color:#6b7280; margin:0 0 18px; }

/* עקרונות */
.ta-principles { background:white; border:1px solid #e5e7eb; border-radius:12px; overflow:hidden; margin-bottom:24px; box-shadow:0 1px 3px rgba(0,0,0,0.04); }
.ta-principle-row { display:flex; align-items:stretch; border-bottom:1px solid #f3f4f6; }
.ta-principle-row:last-child { border-bottom:none; }
.ta-principle-num { background:linear-gradient(180deg,#1e3a8a,#1d4ed8); color:white; width:48px; display:flex; align-items:center; justify-content:center; font-size:18px; font-weight:800; flex-shrink:0; }
.ta-principle-name { padding:12px 16px; font-weight:700; color:#1e3a8a; min-width:200px; background:#eff6ff; display:flex; align-items:center; }
.ta-principle-desc { padding:12px 16px; font-size:13.5px; color:#374151; flex:1; display:flex; align-items:center; }

/* כרטיסי חלופות */
.ta-alternatives-grid { display:grid; grid-template-columns:repeat(3, 1fr); gap:18px; margin-bottom:28px; align-items:start; }
@media (max-width:1100px){ .ta-alternatives-grid{grid-template-columns:1fr;} }

.ta-alt-card { background:white; border-radius:14px; border:1px solid #e5e7eb; box-shadow:0 2px 6px rgba(0,0,0,0.06); overflow:hidden; display:flex; flex-direction:column; transition:transform 0.2s, box-shadow 0.2s; }
.ta-alt-card.preferred { border:2px solid #10b981; box-shadow:0 4px 16px rgba(16,185,129,0.15); }

.ta-alt-header { padding:14px 16px; display:flex; align-items:center; justify-content:space-between; gap:8px; }
.ta-alt-header.alt-1 { background:linear-gradient(135deg,#fed7aa,#fb923c); color:#7c2d12; }
.ta-alt-header.alt-2 { background:linear-gradient(135deg,#bfdbfe,#3b82f6); color:#1e3a8a; }
.ta-alt-header.alt-3 { background:linear-gradient(135deg,#a7f3d0,#10b981); color:#064e3b; }
.ta-alt-num { font-size:11px; font-weight:700; letter-spacing:.1em; opacity:.85; }
.ta-alt-name { font-size:16px; font-weight:800; margin-top:2px; }
.ta-alt-badge { background:rgba(255,255,255,0.5); padding:4px 10px; border-radius:999px; font-size:11px; font-weight:700; }

.ta-alt-body { padding:14px 16px; flex:1; }
.ta-alt-desc { font-size:13px; color:#374151; line-height:1.65; margin-bottom:14px; }

.ta-detail-row { display:flex; gap:10px; padding:8px 0; border-bottom:1px dashed #f3f4f6; font-size:12.5px; }
.ta-detail-row:last-of-type { border-bottom:none; }
.ta-detail-label { font-weight:700; color:#1e3a8a; min-width:90px; flex-shrink:0; }
.ta-detail-value { color:#374151; line-height:1.55; flex:1; }
.ta-detail-value.open { color:#9ca3af; font-style:italic; }

.ta-pc-block { margin-top:14px; }
.ta-pc-title { font-size:11px; font-weight:800; text-transform:uppercase; letter-spacing:.06em; margin-bottom:6px; padding-bottom:4px; border-bottom:1px solid currentColor; }
.ta-pc-title.pros { color:#047857; }
.ta-pc-title.cons { color:#b91c1c; }
.ta-pc-list { margin:0; padding:0; list-style:none; font-size:12.5px; line-height:1.65; }
.ta-pc-list li { padding:3px 0; }
.ta-pc-list.pros li::before { content:"✓ "; font-weight:800; color:#047857; }
.ta-pc-list.cons li::before { content:"✗ "; font-weight:800; color:#b91c1c; }
.ta-pc-list.pros li { color:#065f46; }
.ta-pc-list.cons li { color:#991b1b; }

/* טבלת התאמה לעקרונות */
.ta-match-wrap { background:white; border-radius:12px; box-shadow:0 1px 3px rgba(0,0,0,0.06); overflow:hidden; border:1px solid #e5e7eb; margin-bottom:24px; }
.ta-match-table { width:100%; border-collapse:collapse; }
.ta-match-table thead th { background:linear-gradient(180deg,#1e3a8a,#1d4ed8); color:white; font-weight:700; font-size:13px; padding:12px 14px; text-align:center; }
.ta-match-table thead th:first-child { text-align:right; }
.ta-match-table tbody td { padding:14px; text-align:center; border-bottom:1px solid #f3f4f6; font-size:13px; }
.ta-match-table tbody td:first-child { text-align:right; font-weight:700; color:#1e3a8a; }
.ta-match-table tbody tr:nth-child(even) { background:#fafbff; }
.ta-match-table tbody tr:last-child td { border-bottom:none; }

.ta-score { display:inline-block; padding:6px 14px; border-radius:999px; font-weight:800; font-size:12.5px; letter-spacing:.02em; }
.ta-score.high { background:#d1fae5; color:#065f46; }
.ta-score.medium { background:#fef3c7; color:#92400e; }
.ta-score.low { background:#fee2e2; color:#991b1b; }
.ta-score.exec { background:#fee2e2; color:#991b1b; }
.ta-score.supervise { background:#d1fae5; color:#065f46; }
.ta-score.mixed { background:#fef3c7; color:#92400e; }

.ta-match-note { font-size:11.5px; color:#6b7280; margin-top:6px; font-style:italic; }

/* המלצה */
.ta-recommendation { background:linear-gradient(135deg,#ecfdf5,#d1fae5); border:2px solid #10b981; border-radius:14px; padding:22px 26px; margin-bottom:24px; box-shadow:0 4px 12px rgba(16,185,129,0.1); }
.ta-rec-icon { font-size:32px; margin-bottom:8px; display:block; }
.ta-rec-title { font-size:20px; font-weight:800; color:#064e3b; margin:0 0 12px; }
.ta-rec-content { font-size:14px; color:#065f46; line-height:1.75; }
.ta-rec-content ul { margin:8px 0; padding-right:22px; }
.ta-rec-content li { padding:3px 0; }
.ta-rec-content strong { color:#064e3b; }

/* נקודות פתוחות */
.ta-open-wrap { background:white; border:1px solid #fde68a; border-radius:12px; overflow:hidden; box-shadow:0 1px 3px rgba(0,0,0,0.04); }
.ta-open-header { background:linear-gradient(135deg,#fef3c7,#fde68a); padding:14px 18px; border-bottom:1px solid #fcd34d; font-weight:800; color:#92400e; font-size:15px; display:flex; align-items:center; gap:8px; }
.ta-open-table { width:100%; border-collapse:collapse; }
.ta-open-table tbody td { padding:12px 14px; border-bottom:1px solid #fef3c7; font-size:13px; vertical-align:top; }
.ta-open-table tbody tr:last-child td { border-bottom:none; }
.ta-open-table tbody td:first-child { font-weight:800; color:#92400e; width:36px; text-align:center; }
.ta-open-title { font-weight:700; color:#1f2937; margin-bottom:3px; }
.ta-open-desc { color:#6b7280; font-size:12.5px; line-height:1.55; }

.ta-urgency { display:inline-block; padding:3px 10px; border-radius:999px; font-size:11px; font-weight:700; }
.ta-urgency.high { background:#fee2e2; color:#991b1b; }
.ta-urgency.medium { background:#fef3c7; color:#92400e; }
.ta-urgency.low { background:#e0e7ff; color:#3730a3; }
</style>

<div class="ta-container">
    <div class="ta-top-bar">
        <button class="rm-action-btn" onclick="app.closeBoardroomItem()">→ חזרה לחדר ישיבות</button>
        <div class="ta-title-group">
            <h2 class="ta-title">⚖️ חלופות לגוף המבצע את המכרז</h2>
            <div class="ta-subtitle">27 במאי 2026 · הצגה לממונה</div>
        </div>
        <div style="width:140px"></div>
    </div>

    <!-- 5 העקרונות -->
    <h3 class="ta-section-title">חמש עקרונות הממונה</h3>

    <div class="ta-principles">
        <div class="ta-principle-row">
            <div class="ta-principle-num">1</div>
            <div class="ta-principle-name">מקסום שווי</div>
            <div class="ta-principle-desc">בכפוף לעקרונות האחרים</div>
        </div>
        <div class="ta-principle-row">
            <div class="ta-principle-num">2</div>
            <div class="ta-principle-name">יציבות המודל</div>
            <div class="ta-principle-desc">ודאות מספקת. שלא תהיה נטישה. שלא יערער יציבות.</div>
        </div>
        <div class="ta-principle-row">
            <div class="ta-principle-num">3</div>
            <div class="ta-principle-name">שקיפות מלאה</div>
            <div class="ta-principle-desc">ידוע מראש מההתחלה ועד הסוף</div>
        </div>
        <div class="ta-principle-row">
            <div class="ta-principle-num">4</div>
            <div class="ta-principle-name">חלוקה צעירים-מבוגרים</div>
            <div class="ta-principle-desc">מנגנון חלוקת שווי בין הקבוצות</div>
        </div>
        <div class="ta-principle-row">
            <div class="ta-principle-num">5</div>
            <div class="ta-principle-name">פיקוח לעומת ביצוע</div>
            <div class="ta-principle-desc">כמה שיותר מפקחים, לא מבצעים.</div>
        </div>
    </div>

    <!-- 3 החלופות -->
    <h3 class="ta-section-title">שלוש החלופות</h3>
    <p class="ta-section-sub">מאפיינים, יתרונות וחסרונות.</p>

    <div class="ta-alternatives-grid">

        <!-- חלופה 1 -->
        <div class="ta-alt-card">
            <div class="ta-alt-header alt-1">
                <div>
                    <div class="ta-alt-num">חלופה 1</div>
                    <div class="ta-alt-name">הקופות יוצאות למכרז</div>
                </div>
            </div>
            <div class="ta-alt-body">
                <div class="ta-alt-desc">כל קופה מקיימת מכרז עצמאי. החברה הזוכה מקבלת את מבוטחי הקופה.</div>

                <div class="ta-detail-row"><div class="ta-detail-label">מקור</div><div class="ta-detail-value">המודל הקיים</div></div>
                <div class="ta-detail-row"><div class="ta-detail-label">מי מבצע</div><div class="ta-detail-value">כל קופה בנפרד</div></div>
                <div class="ta-detail-row"><div class="ta-detail-label">מה מוכרים</div><div class="ta-detail-value">מבוטחי הקופה הספציפית</div></div>

                <div class="ta-pc-block">
                    <div class="ta-pc-title pros">יתרונות</div>
                    <ul class="ta-pc-list pros">
                        <li>מיומנות הקופות בביצוע מכרזים</li>
                        <li>שינוי תהליכי מינימלי</li>
                        <li>הרשות מפקחת, אינה מבצעת</li>
                    </ul>
                </div>

                <div class="ta-pc-block">
                    <div class="ta-pc-title cons">חסרונות</div>
                    <ul class="ta-pc-list cons">
                        <li>דרישה לתמורה גבוהה מהקופות</li>
                        <li>פערי שווי בין מבוטחי הקופות השונות</li>
                        <li>שליטה מוגבלת בחלוקת המבוטחים בין הזוכים</li>
                        <li>ארבעה תהליכים מקבילים — קושי תיאומי</li>
                        <li>שיתוף פעולה מוגבל בין הקופות</li>
                    </ul>
                </div>
            </div>
        </div>

        <!-- חלופה 2 -->
        <div class="ta-alt-card">
            <div class="ta-alt-header alt-2">
                <div>
                    <div class="ta-alt-num">חלופה 2</div>
                    <div class="ta-alt-name">מודל "חיסכון לכל ילד" — מכרז מרוכז</div>
                </div>
            </div>
            <div class="ta-alt-body">
                <div class="ta-alt-desc">מכרז אחד מרוכז על ידי האוצר או הקופות. שיבוץ המבוטחים לחברות הזוכות רנדומלית.</div>

                <div class="ta-detail-row"><div class="ta-detail-label">מקור</div><div class="ta-detail-value">"חיסכון לכל ילד"</div></div>
                <div class="ta-detail-row"><div class="ta-detail-label">מי מבצע</div><div class="ta-detail-value">הרשות או הקופות — מכרז יחיד</div></div>
                <div class="ta-detail-row"><div class="ta-detail-label">מה מוכרים</div><div class="ta-detail-value">כלל מבוטחי הקופות, שיבוץ לפי מנגנון שייקבע מראש</div></div>

                <div class="ta-pc-block">
                    <div class="ta-pc-title pros">יתרונות</div>
                    <ul class="ta-pc-list pros">
                        <li>מכרז יחיד</li>
                        <li>שווי מבוטח אחיד</li>
                        <li>לוח זמנים קצר — ללא הקמת גוף</li>
                        <li>מקסום שווי</li>
                    </ul>
                </div>

                <div class="ta-pc-block">
                    <div class="ta-pc-title cons">חסרונות</div>
                    <ul class="ta-pc-list cons">
                        <li>מעורבות הקופות</li>
                        <li>בירוקרטיה ומורכבות</li>
                        <li>תהליך ארוך</li>
                        <li>הרשות בתפקיד המבצע</li>
                    </ul>
                </div>
            </div>
        </div>

        <!-- חלופה 3 -->
        <div class="ta-alt-card preferred">
            <div class="ta-alt-header alt-3">
                <div>
                    <div class="ta-alt-num">חלופה 3</div>
                    <div class="ta-alt-name">דרך "סיעודית"</div>
                </div>
                <div class="ta-alt-badge">המלצת הצוות</div>
            </div>
            <div class="ta-alt-body">
                <div class="ta-alt-desc">הקמת תאגיד סטטוטורי בשם "סיעודית". הזרמת כלל המבוטחים מארבע הקרנות לתאגיד, והעברת הצעירים לחברת-בת בתוכו. סיעודית מבצעת את המכרז למכירת חברת-הבת.</div>

                <div class="ta-detail-row"><div class="ta-detail-label">מקור</div><div class="ta-detail-value">קרנות הפנסיה הוותיקות</div></div>
                <div class="ta-detail-row"><div class="ta-detail-label">מי מבצע</div><div class="ta-detail-value">תאגיד סיעודית</div></div>
                <div class="ta-detail-row"><div class="ta-detail-label">מה מוכרים</div><div class="ta-detail-value">הפרטת חברת הבת המכילה את הצעירים.</div></div>

                <div class="ta-pc-block">
                    <div class="ta-pc-title pros">יתרונות</div>
                    <ul class="ta-pc-list pros">
                        <li>שליטה רבה בתהליך</li>
                        <li>מקסום שווי — כל התמורה לסיעודית</li>
                        <li>הפרדה מבנית בין הצעירים למבוגרים</li>
                        <li>מנגנון חלוקה מובנה</li>
                        <li>מכרז יחיד</li>
                        <li>שווי מבוטח אחיד</li>
                        <li>שימוש בגופים פרטיים ללא צורך בבירוקרטיה מדינתית</li>
                    </ul>
                </div>

                <div class="ta-pc-block">
                    <div class="ta-pc-title cons">חסרונות</div>
                    <ul class="ta-pc-list cons">
                        <li>תהליך ארוך</li>
                        <li>מורכבות תפעולית — חברת-בת בתוך תאגיד</li>
                        <li>הרשות עוברת לתפקיד מבצע</li>
                    </ul>
                </div>
            </div>
        </div>

    </div>

    <!-- טבלת התאמה לעקרונות -->
    <h3 class="ta-section-title">התאמה לעקרונות הממונה</h3>

    <div class="ta-match-wrap">
        <table class="ta-match-table">
            <thead>
                <tr>
                    <th>עיקרון</th>
                    <th>חלופה 1<br>הקופות יוצאות למכרז</th>
                    <th>חלופה 2<br>חיסכון לכל ילד</th>
                    <th>חלופה 3<br>סיעודית</th>
                </tr>
            </thead>
            <tbody>
                <tr>
                    <td>1. מקסום שווי</td>
                    <td><span class="ta-score medium">בינוני</span></td>
                    <td><span class="ta-score medium">בינוני</span></td>
                    <td><span class="ta-score high">גבוה</span></td>
                </tr>
                <tr>
                    <td>2. יציבות המודל</td>
                    <td><span class="ta-score low">נמוך</span></td>
                    <td><span class="ta-score medium">בינוני</span></td>
                    <td><span class="ta-score high">גבוה</span></td>
                </tr>
                <tr>
                    <td>3. שקיפות</td>
                    <td><span class="ta-score medium">בינוני</span></td>
                    <td><span class="ta-score high">גבוה</span></td>
                    <td><span class="ta-score high">גבוה</span></td>
                </tr>
                <tr>
                    <td>4. מנגנון חלוקת שווי</td>
                    <td><span class="ta-score medium">בינוני</span></td>
                    <td><span class="ta-score high">גבוה</span></td>
                    <td><span class="ta-score high">גבוה</span></td>
                </tr>
                <tr>
                    <td>5. פיקוח לעומת ביצוע</td>
                    <td><span class="ta-score supervise">פיקוח</span></td>
                    <td><span class="ta-score exec">ביצוע</span></td>
                    <td><span class="ta-score supervise">פיקוח</span></td>
                </tr>
            </tbody>
        </table>
    </div>


</div>
        `;
    }

}

// Initialize app on DOM ready
let app;
document.addEventListener('DOMContentLoaded', () => {
    app = new App();
});

// === Corporate Structure helpers (boardroom tab) ===
window.csSwitchTab = function(btn, paneId){
    document.querySelectorAll('.cs-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.cs-tab-pane').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    const pane = document.getElementById(paneId);
    if (pane) pane.classList.add('active');
};
window.csToggleExample = function(chip, id){
    const row = document.getElementById('cs-detail-' + id);
    if (!row) return;
    const wasOpen = row.classList.contains('expanded');
    document.querySelectorAll('.cs-detail-row').forEach(r => r.classList.remove('expanded'));
    document.querySelectorAll('.cs-chip.active').forEach(c => c.classList.remove('active'));
    if (!wasOpen){
        row.classList.add('expanded');
        chip.classList.add('active');
    }
};
