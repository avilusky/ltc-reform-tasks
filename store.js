// ============================================
// store.js - Data Management Layer
// מערכת ניהול משימות - רפורמת הביטוח הסיעודי
// ============================================

const STORAGE_KEY = 'nursing_reform_tasks_v1';

// Department definitions
const DEPARTMENTS = {
    product: { id: 'product', name: 'מוצר', short: 'מוצר', color: '#3b82f6', icon: '🏥' },
    actuarial: { id: 'actuarial', name: 'אקטואריה', short: 'אקטואריה', color: '#10b981', icon: '📊' },
    legal: { id: 'legal', name: 'משפטית', short: 'משפטית', color: '#8b5cf6', icon: '⚖️' }
};

// Status definitions
const TASK_STATUSES = {
    'waiting': { label: 'ממתין', color: '#94a3b8', icon: '○' },
    'in-progress': { label: 'בביצוע', color: '#3b82f6', icon: '◐' },
    'completed': { label: 'הושלם', color: '#10b981', icon: '✓' }
};

// Map old statuses to new ones
const STATUS_MIGRATION = {
    'not-started': 'waiting',
    'blocked': 'waiting',
    'review': 'waiting'
};

const SUBPROJECT_STATUSES = {
    'planning': { label: 'בתכנון', color: '#94a3b8' },
    'active': { label: 'פעיל', color: '#3b82f6' },
    'on-hold': { label: 'מושהה', color: '#f59e0b' },
    'completed': { label: 'הושלם', color: '#10b981' }
};

const PRIORITIES = {
    'critical': { label: 'קריטי', color: '#dc2626', order: 0 },
    'high': { label: 'גבוה', color: '#f97316', order: 1 },
    'medium': { label: 'בינוני', color: '#eab308', order: 2 },
    'low': { label: 'נמוך', color: '#6b7280', order: 3 }
};

const DEPENDENCY_TYPES = {
    'FS': { label: 'מתחילה אחרי סיום', desc: 'המשימה מתחילה רק אחרי שהתלויה מסתיימת' },
    'SS': { label: 'מתחילות ביחד', desc: 'המשימה מתחילה רק כשהתלויה מתחילה' },
    'FF': { label: 'מסתיימות ביחד', desc: 'המשימה מסתיימת רק כשהתלויה מסתיימת' }
};

// ============================================
// Store Class
// ============================================

class Store {
    constructor() {
        this.subProjects = [];
        this.tasks = [];
        this.stakeholders = [];
        this.listeners = [];
        this.useFirebase = typeof db !== 'undefined';
        this.firebaseReady = false;
        this._notifyTimer = null;
        this._seedChecked = false;
        this._localWrite = false; // Flag to skip onSnapshot after our own writes
        this._initialLoad = { subProjects: true, tasks: true, stakeholders: true };
        this.load();
    }

    // --- Persistence ---
    load() {
        // Load from localStorage first (instant UI)
        try {
            const data = localStorage.getItem(STORAGE_KEY);
            if (data) {
                const parsed = JSON.parse(data);
                this.subProjects = parsed.subProjects || [];
                this.tasks = (parsed.tasks || []).map(t => this.migrateStatus(t));
                this.stakeholders = parsed.stakeholders || [];
                // Seed stakeholders if missing
                if (this.stakeholders.length === 0) {
                    this.seedStakeholders();
                }
            } else {
                this.seedData();
                this.saveLocal();
            }
        } catch (e) {
            console.error('Failed to load from localStorage:', e);
            this.seedData();
        }

        // Set up real-time listeners (serves as both initial load AND ongoing sync)
        // onSnapshot fires once immediately with current data = 2 reads total
        if (this.useFirebase) {
            this.setupRealtimeListeners();
        }
    }

    setupRealtimeListeners() {
        // === SubProjects listener ===
        db.collection(COLLECTIONS.subProjects).onSnapshot(snapshot => {
            // First callback: check if Firestore is empty and needs seeding
            if (!this._seedChecked) {
                this._seedChecked = true;
                if (snapshot.empty) {
                    console.log('Firestore empty, uploading local data...');
                    this.uploadToFirebase();
                    return;
                }
            }

            // Skip if this was triggered by our own write
            if (this._localWrite) return;

            if (this._initialLoad.subProjects) {
                // First load: get all docs (unavoidable)
                this._initialLoad.subProjects = false;
                this.subProjects = snapshot.docs.map(doc => doc.data());
            } else {
                // Subsequent updates: only process changes (saves reads!)
                this._applyChanges(snapshot, 'subProjects', 'id');
            }

            this.saveLocal();
            this.debouncedNotify();

            if (!this.firebaseReady) {
                this.firebaseReady = true;
                updateSyncStatus(true);
                console.log('Firebase sync ready');
            }
        }, err => {
            console.error('SubProjects listener error:', err);
            updateSyncStatus(false);
        });

        // === Tasks listener ===
        db.collection(COLLECTIONS.tasks).onSnapshot(snapshot => {
            if (!this._seedChecked) return;
            if (this._localWrite) return;

            if (this._initialLoad.tasks) {
                this._initialLoad.tasks = false;
                this.tasks = snapshot.docs.map(doc => this.migrateStatus(doc.data()));
            } else {
                this._applyChanges(snapshot, 'tasks', 'id', true);
            }

            this.saveLocal();
            this.debouncedNotify();
        }, err => {
            console.error('Tasks listener error:', err);
            updateSyncStatus(false);
        });

        // === Stakeholders listener ===
        db.collection(COLLECTIONS.stakeholders).onSnapshot(snapshot => {
            if (!this._seedChecked) return;
            if (this._localWrite) return;

            if (snapshot.empty && this.stakeholders.length === 0) {
                this.seedStakeholders();
                this.saveLocal();
                this.stakeholders.forEach(sh => {
                    this.writeDoc(COLLECTIONS.stakeholders, sh.id, sh);
                });
                this.debouncedNotify();
                return;
            }

            if (this._initialLoad.stakeholders) {
                this._initialLoad.stakeholders = false;
                if (!snapshot.empty) {
                    this.stakeholders = snapshot.docs.map(doc => doc.data());
                }
            } else {
                this._applyChanges(snapshot, 'stakeholders', 'id');
            }

            this.saveLocal();
            this.debouncedNotify();
        }, err => {
            console.error('Stakeholders listener error:', err);
        });
    }

    // Apply only changed docs instead of re-reading entire collection
    _applyChanges(snapshot, collectionName, idField, migrate = false) {
        snapshot.docChanges().forEach(change => {
            let data = change.doc.data();
            if (migrate) data = this.migrateStatus(data);

            if (change.type === 'added') {
                // Only add if not already in local array
                if (!this[collectionName].find(item => item[idField] === data[idField])) {
                    this[collectionName].push(data);
                }
            } else if (change.type === 'modified') {
                const idx = this[collectionName].findIndex(item => item[idField] === data[idField]);
                if (idx !== -1) this[collectionName][idx] = data;
            } else if (change.type === 'removed') {
                this[collectionName] = this[collectionName].filter(item => item[idField] !== data[idField]);
            }
        });
    }

    async uploadToFirebase() {
        // Batch write - single network call for all docs
        this._localWrite = true;
        const batch = db.batch();

        this.subProjects.forEach(sp => {
            batch.set(db.collection(COLLECTIONS.subProjects).doc(sp.id), sp);
        });

        this.tasks.forEach(task => {
            batch.set(db.collection(COLLECTIONS.tasks).doc(task.id), task);
        });

        this.stakeholders.forEach(sh => {
            batch.set(db.collection(COLLECTIONS.stakeholders).doc(sh.id), sh);
        });

        await batch.commit();
        setTimeout(() => { this._localWrite = false; }, 500);
        console.log('Data uploaded to Firestore');
    }

    saveLocal() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify({
                subProjects: this.subProjects,
                tasks: this.tasks,
                stakeholders: this.stakeholders
            }));
        } catch (e) {
            console.error('Failed to save to localStorage:', e);
        }
    }

    migrateStatus(task) {
        if (STATUS_MIGRATION[task.status]) {
            task.status = STATUS_MIGRATION[task.status];
        }
        // Migrate old string notes to notesLog
        if (typeof task.notes === 'string' && task.notes.trim()) {
            task.notesLog = [{ id: this.generateId(), author: '', text: task.notes, createdAt: task.updatedAt || task.createdAt || new Date().toISOString() }];
            task.notes = undefined;
        }
        if (!task.notesLog) task.notesLog = [];
        return task;
    }

    save() {
        this.saveLocal();
        this.notify();
    }

    // Write single doc to Firestore (with local write flag to prevent re-read)
    writeDoc(collection, id, data) {
        if (!this.useFirebase) return;
        this._localWrite = true;
        db.collection(collection).doc(id).set(data).then(() => {
            // Reset flag after a short delay to allow onSnapshot to fire and be ignored
            setTimeout(() => { this._localWrite = false; }, 500);
        }).catch(e => {
            this._localWrite = false;
            console.error('Firestore write failed:', e);
        });
    }

    // Delete single doc from Firestore
    removeDoc(collection, id) {
        if (!this.useFirebase) return;
        this._localWrite = true;
        db.collection(collection).doc(id).delete().then(() => {
            setTimeout(() => { this._localWrite = false; }, 500);
        }).catch(e => {
            this._localWrite = false;
            console.error('Firestore delete failed:', e);
        });
    }

    // --- Event System ---
    subscribe(listener) {
        this.listeners.push(listener);
        return () => {
            this.listeners = this.listeners.filter(l => l !== listener);
        };
    }

    notify() {
        this.listeners.forEach(l => l());
    }

    // Debounced notify - prevents double renders when Firebase listener fires right after local save
    debouncedNotify() {
        clearTimeout(this._notifyTimer);
        this._notifyTimer = setTimeout(() => this.notify(), 300);
    }

    // --- ID Generation ---
    generateId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
    }

    // --- Sub-Projects CRUD ---
    getSubProjects() {
        return [...this.subProjects].sort((a, b) => a.order - b.order);
    }

    getSubProject(id) {
        return this.subProjects.find(sp => sp.id === id);
    }

    addSubProject(data) {
        const sp = {
            id: this.generateId(),
            name: data.name,
            description: data.description || '',
            color: data.color || '#3b82f6',
            icon: data.icon || '📁',
            chapter: data.chapter || null,
            startDate: data.startDate || null,
            endDate: data.endDate || null,
            status: data.status || 'planning',
            owner: data.owner || 'product',
            order: data.order ?? this.subProjects.length,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
        this.subProjects.push(sp);
        this.save();
        this.writeDoc(COLLECTIONS.subProjects, sp.id, sp);
        return sp;
    }

    updateSubProject(id, data) {
        const idx = this.subProjects.findIndex(sp => sp.id === id);
        if (idx === -1) return null;
        this.subProjects[idx] = { ...this.subProjects[idx], ...data, updatedAt: new Date().toISOString() };
        this.save();
        this.writeDoc(COLLECTIONS.subProjects, id, this.subProjects[idx]);
        return this.subProjects[idx];
    }

    deleteSubProject(id) {
        const tasksToDelete = this.tasks.filter(t => t.subProjectId === id);
        this.subProjects = this.subProjects.filter(sp => sp.id !== id);
        this.tasks = this.tasks.filter(t => t.subProjectId !== id);
        this.save();

        // Batch delete from Firebase (1 sub-project + N tasks in single operation)
        if (this.useFirebase) {
            this._localWrite = true;
            const batch = db.batch();
            batch.delete(db.collection(COLLECTIONS.subProjects).doc(id));
            tasksToDelete.forEach(t => {
                batch.delete(db.collection(COLLECTIONS.tasks).doc(t.id));
            });
            batch.commit().then(() => {
                setTimeout(() => { this._localWrite = false; }, 500);
            }).catch(e => {
                this._localWrite = false;
                console.error('Batch delete failed:', e);
            });
        }
    }

    getSubProjectDates(spId) {
        const tasks = this.tasks.filter(t => t.subProjectId === spId);
        let earliest = null;
        let latest = null;
        tasks.forEach(t => {
            if (t.startDate && (!earliest || t.startDate < earliest)) earliest = t.startDate;
            if (t.dueDate && (!latest || t.dueDate > latest)) latest = t.dueDate;
        });
        return { startDate: earliest, endDate: latest };
    }

    getSubProjectProgress(spId) {
        const tasks = this.tasks.filter(t => t.subProjectId === spId && !t.parentTaskId);
        if (tasks.length === 0) return 0;
        const total = tasks.reduce((sum, t) => sum + (t.progress || 0), 0);
        return Math.round(total / tasks.length);
    }

    // --- Tasks CRUD ---
    getTasks(filters = {}) {
        let result = [...this.tasks];

        if (filters.subProjectId) {
            result = result.filter(t => t.subProjectId === filters.subProjectId);
        }
        if (filters.parentTaskId !== undefined) {
            result = result.filter(t => t.parentTaskId === filters.parentTaskId);
        }
        if (filters.department) {
            result = result.filter(t => t.department === filters.department);
        }
        if (filters.status) {
            result = result.filter(t => t.status === filters.status);
        }
        if (filters.priority) {
            result = result.filter(t => t.priority === filters.priority);
        }
        if (filters.notCompleted) {
            result = result.filter(t => t.status !== 'completed');
        }
        if (filters.rootOnly) {
            result = result.filter(t => !t.parentTaskId);
        }

        return result.sort((a, b) => a.order - b.order);
    }

    getTask(id) {
        return this.tasks.find(t => t.id === id);
    }

    getSubTasks(parentTaskId) {
        return this.tasks.filter(t => t.parentTaskId === parentTaskId).sort((a, b) => a.order - b.order);
    }

    addTask(data) {
        const task = {
            id: this.generateId(),
            subProjectId: data.subProjectId,
            parentTaskId: data.parentTaskId || null,
            title: data.title,
            description: data.description || '',
            department: data.department || 'product',
            assignee: data.assignee || '',
            startDate: data.startDate || null,
            dueDate: data.dueDate || null,
            priority: data.priority || 'medium',
            status: data.status || 'waiting',
            progress: data.progress || 0,
            dependencies: data.dependencies || [],
            stakeholderIds: data.stakeholderIds || [],
            notesLog: data.notesLog || [],
            order: data.order ?? this.tasks.filter(t => t.subProjectId === data.subProjectId && t.parentTaskId === (data.parentTaskId || null)).length,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
        this.tasks.push(task);
        this.save();
        this.writeDoc(COLLECTIONS.tasks, task.id, task);
        return task;
    }

    updateTask(id, data) {
        const idx = this.tasks.findIndex(t => t.id === id);
        if (idx === -1) return null;
        this.tasks[idx] = { ...this.tasks[idx], ...data, updatedAt: new Date().toISOString() };
        this.save();
        this.writeDoc(COLLECTIONS.tasks, id, this.tasks[idx]);
        return this.tasks[idx];
    }

    deleteTask(id) {
        // Collect all IDs to delete (task + subtasks recursively)
        const idsToDelete = [];
        const collectIds = (taskId) => {
            idsToDelete.push(taskId);
            this.tasks.filter(t => t.parentTaskId === taskId).forEach(st => collectIds(st.id));
        };
        collectIds(id);

        // Track tasks with updated dependencies (for batch write)
        const updatedTasks = [];
        this.tasks.forEach(t => {
            if (t.dependencies) {
                const before = t.dependencies.length;
                t.dependencies = t.dependencies.filter(d => !idsToDelete.includes(d.taskId));
                if (t.dependencies.length !== before && !idsToDelete.includes(t.id)) {
                    updatedTasks.push(t);
                }
            }
        });

        // Remove all tasks locally
        this.tasks = this.tasks.filter(t => !idsToDelete.includes(t.id));
        this.save();

        // Single batch: delete tasks + update deps (one network call)
        if (this.useFirebase) {
            this._localWrite = true;
            const batch = db.batch();
            idsToDelete.forEach(taskId => {
                batch.delete(db.collection(COLLECTIONS.tasks).doc(taskId));
            });
            updatedTasks.forEach(t => {
                batch.set(db.collection(COLLECTIONS.tasks).doc(t.id), t);
            });
            batch.commit().then(() => {
                setTimeout(() => { this._localWrite = false; }, 500);
            }).catch(e => {
                this._localWrite = false;
                console.error('Batch delete failed:', e);
            });
        }
    }

    // --- Stakeholders ---
    getStakeholders() {
        return [...this.stakeholders];
    }

    addStakeholder(name, type = 'external') {
        const sh = {
            id: this.generateId(),
            name,
            type, // 'external' or 'internal'
            createdAt: new Date().toISOString()
        };
        this.stakeholders.push(sh);
        this.save();
        this.writeDoc(COLLECTIONS.stakeholders, sh.id, sh);
        return sh;
    }

    deleteStakeholder(id) {
        this.stakeholders = this.stakeholders.filter(sh => sh.id !== id);
        // Remove from tasks
        this.tasks.forEach(t => {
            if (t.stakeholderIds) {
                t.stakeholderIds = t.stakeholderIds.filter(sid => sid !== id);
            }
        });
        this.save();
        this.removeDoc(COLLECTIONS.stakeholders, id);
    }

    getTasksForStakeholder(stakeholderId) {
        return this.tasks.filter(t => t.stakeholderIds && t.stakeholderIds.includes(stakeholderId));
    }

    // --- Dependency Helpers ---
    getTaskDependencies(taskId) {
        const task = this.getTask(taskId);
        if (!task || !task.dependencies) return [];
        return task.dependencies.map(dep => ({
            ...dep,
            task: this.getTask(dep.taskId)
        })).filter(dep => dep.task);
    }

    getDependentTasks(taskId) {
        return this.tasks.filter(t =>
            t.dependencies && t.dependencies.some(d => d.taskId === taskId)
        );
    }

    isTaskBlocked(taskId) {
        const task = this.getTask(taskId);
        if (!task || !task.dependencies || task.dependencies.length === 0) return false;
        return task.dependencies.some(dep => {
            const depTask = this.getTask(dep.taskId);
            if (!depTask) return false;
            if (dep.type === 'FS') return depTask.status !== 'completed';
            if (dep.type === 'SS') return depTask.status === 'waiting';
            return false;
        });
    }

    getBlockingTasks(taskId) {
        const task = this.getTask(taskId);
        if (!task || !task.dependencies) return [];
        return task.dependencies
            .filter(dep => {
                const depTask = this.getTask(dep.taskId);
                if (!depTask) return false;
                if (dep.type === 'FS') return depTask.status !== 'completed';
                if (dep.type === 'SS') return depTask.status === 'waiting';
                return false;
            })
            .map(dep => ({ ...dep, task: this.getTask(dep.taskId) }));
    }

    // --- Statistics ---
    getStats() {
        const allTasks = this.tasks.filter(t => !t.parentTaskId);
        const now = new Date();
        now.setHours(0, 0, 0, 0);

        return {
            totalSubProjects: this.subProjects.length,
            activeSubProjects: this.subProjects.filter(sp => sp.status === 'active').length,
            totalTasks: allTasks.length,
            completedTasks: allTasks.filter(t => t.status === 'completed').length,
            inProgressTasks: allTasks.filter(t => t.status === 'in-progress').length,
            blockedTasks: allTasks.filter(t => this.isTaskBlocked(t.id)).length,
            overdueTasks: allTasks.filter(t => {
                if (!t.dueDate || t.status === 'completed') return false;
                return new Date(t.dueDate) < now;
            }).length,
            byDepartment: {
                product: allTasks.filter(t => t.department === 'product').length,
                actuarial: allTasks.filter(t => t.department === 'actuarial').length,
                legal: allTasks.filter(t => t.department === 'legal').length
            },
            byPriority: {
                critical: allTasks.filter(t => t.priority === 'critical').length,
                high: allTasks.filter(t => t.priority === 'high').length,
                medium: allTasks.filter(t => t.priority === 'medium').length,
                low: allTasks.filter(t => t.priority === 'low').length
            }
        };
    }

    getTasksForDateRange(startDate, endDate) {
        const start = new Date(startDate);
        const end = new Date(endDate);
        return this.tasks.filter(t => {
            if (!t.startDate && !t.dueDate) return false;
            const taskStart = t.startDate ? new Date(t.startDate) : new Date(t.dueDate);
            const taskEnd = t.dueDate ? new Date(t.dueDate) : new Date(t.startDate);
            return taskStart <= end && taskEnd >= start;
        });
    }

    getTasksForDate(date) {
        const d = new Date(date);
        d.setHours(0, 0, 0, 0);

        return this.tasks.filter(t => {
            if (!t.dueDate) return false;
            const due = new Date(t.dueDate);
            due.setHours(0, 0, 0, 0);
            return due.getTime() === d.getTime();
        });
    }

    seedStakeholders() {
        this.stakeholders = [
            { id: 'sh1', name: 'אגף תקציבים', type: 'external', createdAt: '2026-03-01T00:00:00.000Z' },
            { id: 'sh2', name: 'משרד הבריאות', type: 'external', createdAt: '2026-03-01T00:00:00.000Z' },
            { id: 'sh3', name: 'קופות חולים', type: 'external', createdAt: '2026-03-01T00:00:00.000Z' },
            { id: 'sh4', name: 'ביטוח לאומי', type: 'external', createdAt: '2026-03-01T00:00:00.000Z' },
            { id: 'sh5', name: 'משרד המשפטים', type: 'external', createdAt: '2026-03-01T00:00:00.000Z' },
            { id: 'sh6', name: 'רשות המסים', type: 'external', createdAt: '2026-03-01T00:00:00.000Z' }
        ];
    }

    // --- Seed Data ---
    seedData() {
        // Sub-Projects based on the reform document chapters
        this.subProjects = [
            {
                id: 'sp1',
                name: 'רקע ואבחון המצב הקיים',
                description: 'סקירת שלושת רבדי הסיעוד, ניתוח כשלים מבניים, נתונים כלכליים ואקטואריים, סקירה בינלאומית',
                color: '#6366f1',
                icon: '🔍',
                chapter: 1,
                startDate: '2026-03-01',
                endDate: '2026-04-30',
                status: 'active',
                owner: 'product',
                order: 0,
                createdAt: '2026-03-01T00:00:00.000Z',
                updatedAt: '2026-03-01T00:00:00.000Z'
            },
            {
                id: 'sp2',
                name: 'ניתוח חלופות מדיניות',
                description: 'בחינת ארבע חלופות: מצב קיים, פתרון ממלכתי, מודל חיסכון+ביטוח, שילוב בפנסיה',
                color: '#8b5cf6',
                icon: '⚖️',
                chapter: 2,
                startDate: '2026-03-15',
                endDate: '2026-05-15',
                status: 'active',
                owner: 'product',
                order: 1,
                createdAt: '2026-03-01T00:00:00.000Z',
                updatedAt: '2026-03-01T00:00:00.000Z'
            },
            {
                id: 'sp3',
                name: 'המוצר הקיים - ניהול ומעבר',
                description: 'ניהול מלאי מבוטחים, הקמת תאגיד, איחוד קרנות, תכנית אחידה, מנגנון מעבר',
                color: '#ec4899',
                icon: '🔄',
                chapter: 3,
                startDate: '2026-04-01',
                endDate: '2026-09-30',
                status: 'planning',
                owner: 'product',
                order: 2,
                createdAt: '2026-03-01T00:00:00.000Z',
                updatedAt: '2026-03-01T00:00:00.000Z'
            },
            {
                id: 'sp4',
                name: 'המוצר החדש - אפיון ופיתוח',
                description: 'סיווג המוצר, שלב חיסכון, שלב מעבר, שלב ביטוח, מנגנון אקטוארי, היבטי מיסוי',
                color: '#14b8a6',
                icon: '🆕',
                chapter: 4,
                startDate: '2026-04-15',
                endDate: '2026-10-31',
                status: 'planning',
                owner: 'product',
                order: 3,
                createdAt: '2026-03-01T00:00:00.000Z',
                updatedAt: '2026-03-01T00:00:00.000Z'
            },
            {
                id: 'sp5',
                name: 'ניתוח פיננסי ואקטוארי',
                description: 'חישוב גירעון, ניתוח כרית ביטחון, מודל פיננסי, השפעה על מבוטחים',
                color: '#10b981',
                icon: '📊',
                chapter: null,
                startDate: '2026-03-15',
                endDate: '2026-08-31',
                status: 'active',
                owner: 'actuarial',
                order: 4,
                createdAt: '2026-03-01T00:00:00.000Z',
                updatedAt: '2026-03-01T00:00:00.000Z'
            },
            {
                id: 'sp6',
                name: 'חקיקה ורגולציה',
                description: 'טיוטת החלטת ממשלה, תיקון חוזרים, תקנון קבוצה סגורה, היבטים משפטיים',
                color: '#8b5cf6',
                icon: '📜',
                chapter: null,
                startDate: '2026-05-01',
                endDate: '2026-11-30',
                status: 'planning',
                owner: 'legal',
                order: 5,
                createdAt: '2026-03-01T00:00:00.000Z',
                updatedAt: '2026-03-01T00:00:00.000Z'
            },
            {
                id: 'sp8',
                name: 'שיתוף ציבור ובעלי עניין',
                description: 'מסמך אסטרטגי, שיווק הרפורמה, דיון ציבורי, פרסום להערות הציבור',
                color: '#f97316',
                icon: '📢',
                chapter: null,
                startDate: '2026-07-01',
                endDate: '2027-03-31',
                status: 'planning',
                owner: 'product',
                order: 7,
                createdAt: '2026-03-01T00:00:00.000Z',
                updatedAt: '2026-03-01T00:00:00.000Z'
            }
        ];

        // Stakeholders
        this.seedStakeholders();

        // Tasks with realistic dependencies
        this.tasks = [
            // === SP1: רקע ואבחון ===
            {
                id: 't1', subProjectId: 'sp1', parentTaskId: null,
                title: 'סקירת שלושת רבדי הסיעוד בישראל',
                description: 'מיפוי מקיף של הרבדים: ציבורי (ביטוח לאומי), ביטוחי (קופות חולים), פרטי (ביטוח פרט)',
                department: 'product', assignee: 'אבי לוסקי',
                startDate: '2026-03-01', dueDate: '2026-03-20',
                priority: 'high', status: 'in-progress', progress: 60,
                dependencies: [], notes: '', order: 0,
                createdAt: '2026-03-01T00:00:00.000Z', updatedAt: '2026-03-15T00:00:00.000Z'
            },
            {
                id: 't2', subProjectId: 'sp1', parentTaskId: null,
                title: 'איסוף נתונים אקטואריים בסיסיים',
                description: 'שכיחות תביעות, לוחות תמותה, שיעורי כניסה/יציאה מתביעה, עלויות סיעוד',
                department: 'actuarial', assignee: '',
                startDate: '2026-03-05', dueDate: '2026-04-05',
                priority: 'critical', status: 'in-progress', progress: 40,
                dependencies: [], notes: 'נדרשים נתונים מקופות החולים', order: 1,
                createdAt: '2026-03-01T00:00:00.000Z', updatedAt: '2026-03-15T00:00:00.000Z'
            },
            {
                id: 't3', subProjectId: 'sp1', parentTaskId: null,
                title: 'ניתוח כשלים מבניים במערכת הנוכחית',
                description: 'סבסוד צולב, כפל רגולציה, חברות מיצוי זכויות, לחץ ציבורי',
                department: 'product', assignee: 'אבי לוסקי',
                startDate: '2026-03-10', dueDate: '2026-04-10',
                priority: 'high', status: 'waiting', progress: 0,
                dependencies: [{ taskId: 't2', type: 'SS' }],
                notes: '', order: 2,
                createdAt: '2026-03-01T00:00:00.000Z', updatedAt: '2026-03-01T00:00:00.000Z'
            },
            {
                id: 't4', subProjectId: 'sp1', parentTaskId: null,
                title: 'סקירה בינלאומית - מודלים לביטוח סיעודי',
                description: 'ארבע קבוצות מימון: ממשלתי, סל בריאות, מערכת ייעודית, פרטי',
                department: 'product', assignee: '',
                startDate: '2026-03-15', dueDate: '2026-04-15',
                priority: 'medium', status: 'waiting', progress: 0,
                dependencies: [], notes: '', order: 3,
                createdAt: '2026-03-01T00:00:00.000Z', updatedAt: '2026-03-01T00:00:00.000Z'
            },
            {
                id: 't5', subProjectId: 'sp1', parentTaskId: null,
                title: 'תרחישי קריסה - ניתוח השפעה',
                description: 'משמעות קריסת הביטוח ל-4.9 מיליון מבוטחים, חישוב פער כיסוי',
                department: 'actuarial', assignee: '',
                startDate: '2026-03-20', dueDate: '2026-04-20',
                priority: 'high', status: 'waiting', progress: 0,
                dependencies: [{ taskId: 't2', type: 'FS' }],
                notes: 'תלוי בנתונים אקטואריים', order: 4,
                createdAt: '2026-03-01T00:00:00.000Z', updatedAt: '2026-03-01T00:00:00.000Z'
            },

            // === SP2: ניתוח חלופות ===
            {
                id: 't6', subProjectId: 'sp2', parentTaskId: null,
                title: 'עריכת טבלת השוואת חלופות',
                description: 'מצב קיים, פתרון ממלכתי, מודל חיסכון+ביטוח, שילוב בפנסיה',
                department: 'product', assignee: 'אבי לוסקי',
                startDate: '2026-03-15', dueDate: '2026-04-15',
                priority: 'high', status: 'waiting', progress: 0,
                dependencies: [{ taskId: 't1', type: 'FS' }, { taskId: 't2', type: 'FS' }],
                notes: 'דורש את סקירת הרקע והנתונים האקטואריים', order: 0,
                createdAt: '2026-03-01T00:00:00.000Z', updatedAt: '2026-03-01T00:00:00.000Z'
            },
            {
                id: 't7', subProjectId: 'sp2', parentTaskId: null,
                title: 'ניתוח עלות-תועלת לכל חלופה',
                description: 'ניתוח כלכלי מפורט עם תרחישים שונים',
                department: 'actuarial', assignee: '',
                startDate: '2026-04-01', dueDate: '2026-05-01',
                priority: 'critical', status: 'waiting', progress: 0,
                dependencies: [{ taskId: 't6', type: 'SS' }, { taskId: 't5', type: 'FS' }],
                notes: '', order: 1,
                createdAt: '2026-03-01T00:00:00.000Z', updatedAt: '2026-03-01T00:00:00.000Z'
            },
            {
                id: 't8', subProjectId: 'sp2', parentTaskId: null,
                title: 'בחינה משפטית של כל חלופה',
                description: 'התאמה לחקיקה קיימת, צורך בחקיקה חדשה, סיכונים משפטיים',
                department: 'legal', assignee: '',
                startDate: '2026-04-01', dueDate: '2026-05-01',
                priority: 'high', status: 'waiting', progress: 0,
                dependencies: [{ taskId: 't6', type: 'SS' }],
                notes: '', order: 2,
                createdAt: '2026-03-01T00:00:00.000Z', updatedAt: '2026-03-01T00:00:00.000Z'
            },
            {
                id: 't9', subProjectId: 'sp2', parentTaskId: null,
                title: 'הכנת מסמך המלצה מנומקת',
                description: 'מסמך המלצה סופי עם נימוקים, המלצה על מודל חיסכון+ביטוח',
                department: 'product', assignee: 'אבי לוסקי',
                startDate: '2026-04-20', dueDate: '2026-05-15',
                priority: 'high', status: 'waiting', progress: 0,
                dependencies: [{ taskId: 't7', type: 'FS' }, { taskId: 't8', type: 'FS' }],
                notes: 'דורש השלמת ניתוח כלכלי ומשפטי', order: 3,
                createdAt: '2026-03-01T00:00:00.000Z', updatedAt: '2026-03-01T00:00:00.000Z'
            },

            // === SP3: המוצר הקיים ===
            {
                id: 't10', subProjectId: 'sp3', parentTaskId: null,
                title: 'מיפוי אוכלוסיית המבוטחים הקיימת',
                description: 'חלוקה לקבוצות גיל: מעל 55, מתחת ל-55. תיקוף אקטוארי',
                department: 'actuarial', assignee: '',
                startDate: '2026-04-01', dueDate: '2026-05-15',
                priority: 'critical', status: 'waiting', progress: 0,
                dependencies: [{ taskId: 't2', type: 'FS' }],
                notes: '', order: 0,
                createdAt: '2026-03-01T00:00:00.000Z', updatedAt: '2026-03-01T00:00:00.000Z'
            },
            {
                id: 't11', subProjectId: 'sp3', parentTaskId: null,
                title: 'הכנת מסמך דרישות להקמת תאגיד',
                description: 'דרישות רישיון מבטח, דרישות הון, ממשל תאגידי',
                department: 'legal', assignee: '',
                startDate: '2026-05-01', dueDate: '2026-06-30',
                priority: 'high', status: 'waiting', progress: 0,
                dependencies: [{ taskId: 't9', type: 'FS' }],
                notes: 'תלוי בהכרעת חלופה', order: 1,
                createdAt: '2026-03-01T00:00:00.000Z', updatedAt: '2026-03-01T00:00:00.000Z'
            },
            {
                id: 't12', subProjectId: 'sp3', parentTaskId: null,
                title: 'תכנון מנגנון המעבר',
                description: 'שתי חלופות: העברה יזומה לפי גיל חתך, או סגירה מלאה ובחירה חופשית',
                department: 'product', assignee: '',
                startDate: '2026-05-15', dueDate: '2026-07-15',
                priority: 'critical', status: 'waiting', progress: 0,
                dependencies: [{ taskId: 't10', type: 'FS' }, { taskId: 't11', type: 'SS' }],
                notes: '', order: 2,
                createdAt: '2026-03-01T00:00:00.000Z', updatedAt: '2026-03-01T00:00:00.000Z'
            },
            {
                id: 't13', subProjectId: 'sp3', parentTaskId: null,
                title: 'תכנון תכנית ביטוח אחידה',
                description: 'ללא הפליה, כללי זכאות נוקשים, דמי ביטוח שווים לפי גיל, מנגנון איזון',
                department: 'product', assignee: '',
                startDate: '2026-06-01', dueDate: '2026-08-01',
                priority: 'high', status: 'waiting', progress: 0,
                dependencies: [{ taskId: 't10', type: 'FS' }],
                notes: '', order: 3,
                createdAt: '2026-03-01T00:00:00.000Z', updatedAt: '2026-03-01T00:00:00.000Z'
            },
            {
                id: 't14', subProjectId: 'sp3', parentTaskId: null,
                title: 'הכנת מכרז לגוף מנהל',
                description: 'כתיבת תנאי מכרז, קריטריונים, לוח זמנים',
                department: 'legal', assignee: '',
                startDate: '2026-07-01', dueDate: '2026-09-01',
                priority: 'medium', status: 'waiting', progress: 0,
                dependencies: [{ taskId: 't11', type: 'FS' }, { taskId: 't12', type: 'FS' }],
                notes: '', order: 4,
                createdAt: '2026-03-01T00:00:00.000Z', updatedAt: '2026-03-01T00:00:00.000Z'
            },

            // === SP4: המוצר החדש ===
            {
                id: 't15', subProjectId: 'sp4', parentTaskId: null,
                title: 'הכרעה בסיווג המוצר',
                description: 'ביטוח פרט או קופת גמל - השלכות רגולטוריות ומיסויות',
                department: 'product', assignee: 'אבי לוסקי',
                startDate: '2026-04-15', dueDate: '2026-05-30',
                priority: 'critical', status: 'waiting', progress: 0,
                dependencies: [{ taskId: 't9', type: 'FS' }],
                notes: 'הכרעה מרכזית שמשפיעה על כל המשך הפיתוח', order: 0,
                createdAt: '2026-03-01T00:00:00.000Z', updatedAt: '2026-03-01T00:00:00.000Z'
            },
            {
                id: 't16', subProjectId: 'sp4', parentTaskId: null,
                title: 'אפיון שלב החיסכון (עד גיל 70)',
                description: 'הפקדות חודשיות, מסלולי השקעה, יעד צבירה, דמי ניהול',
                department: 'product', assignee: '',
                startDate: '2026-05-15', dueDate: '2026-07-15',
                priority: 'high', status: 'waiting', progress: 0,
                dependencies: [{ taskId: 't15', type: 'FS' }],
                notes: '', order: 1,
                createdAt: '2026-03-01T00:00:00.000Z', updatedAt: '2026-03-01T00:00:00.000Z'
            },
            {
                id: 't17', subProjectId: 'sp4', parentTaskId: null,
                title: 'בחינת היבטי מיסוי - Pre-ruling',
                description: 'פטור ממס במעבר מחיסכון לביטוח, סיווג מיסויי',
                department: 'legal', assignee: '',
                startDate: '2026-05-15', dueDate: '2026-07-30',
                priority: 'high', status: 'waiting', progress: 0,
                dependencies: [{ taskId: 't15', type: 'FS' }],
                notes: 'מצריך עבודה מול רשות המיסים', order: 2,
                createdAt: '2026-03-01T00:00:00.000Z', updatedAt: '2026-03-01T00:00:00.000Z'
            },
            {
                id: 't18', subProjectId: 'sp4', parentTaskId: null,
                title: 'תכנון מנגנון איזון אקטוארי',
                description: 'מנגנון אוטומטי להתאמת פרמיות ותגמולים',
                department: 'actuarial', assignee: '',
                startDate: '2026-06-01', dueDate: '2026-08-15',
                priority: 'critical', status: 'waiting', progress: 0,
                dependencies: [{ taskId: 't16', type: 'SS' }],
                notes: '', order: 3,
                createdAt: '2026-03-01T00:00:00.000Z', updatedAt: '2026-03-01T00:00:00.000Z'
            },
            {
                id: 't19', subProjectId: 'sp4', parentTaskId: null,
                title: 'חישוב מקדמי המרה',
                description: 'מקדמי המרה מחיסכון לביטוח לפי גיל, מין, שנת לידה',
                department: 'actuarial', assignee: '',
                startDate: '2026-06-15', dueDate: '2026-08-30',
                priority: 'high', status: 'waiting', progress: 0,
                dependencies: [{ taskId: 't18', type: 'SS' }, { taskId: 't16', type: 'FS' }],
                notes: '', order: 4,
                createdAt: '2026-03-01T00:00:00.000Z', updatedAt: '2026-03-01T00:00:00.000Z'
            },

            // === SP5: ניתוח פיננסי ===
            {
                id: 't20', subProjectId: 'sp5', parentTaskId: null,
                title: 'חישוב גירעון צפוי מסגירת התכנית',
                description: 'הערכת הגירעון הכולל - כ-16 מיליארד שקל, פריסה ל-30 שנה',
                department: 'actuarial', assignee: '',
                startDate: '2026-03-15', dueDate: '2026-05-15',
                priority: 'critical', status: 'in-progress', progress: 30,
                dependencies: [{ taskId: 't2', type: 'FS' }],
                notes: '', order: 0,
                createdAt: '2026-03-01T00:00:00.000Z', updatedAt: '2026-03-15T00:00:00.000Z'
            },
            {
                id: 't21', subProjectId: 'sp5', parentTaskId: null,
                title: 'ניתוח השפעה על הכנסה פנויה של מבוטחים',
                description: 'חישוב עלות חודשית למבוטח לפי גיל ומצב סוציו-אקונומי',
                department: 'actuarial', assignee: '',
                startDate: '2026-04-01', dueDate: '2026-05-30',
                priority: 'high', status: 'waiting', progress: 0,
                dependencies: [{ taskId: 't20', type: 'SS' }],
                notes: '', order: 1,
                createdAt: '2026-03-01T00:00:00.000Z', updatedAt: '2026-03-01T00:00:00.000Z'
            },
            {
                id: 't22', subProjectId: 'sp5', parentTaskId: null,
                title: 'תכנון כרית ביטחון ממשלתית',
                description: 'גובה הכרית, אופן תפעול, תנאי הפעלה',
                department: 'actuarial', assignee: '',
                startDate: '2026-05-01', dueDate: '2026-07-01',
                priority: 'high', status: 'waiting', progress: 0,
                dependencies: [{ taskId: 't20', type: 'FS' }],
                notes: 'דורש גם אישור משפטי', order: 2,
                createdAt: '2026-03-01T00:00:00.000Z', updatedAt: '2026-03-01T00:00:00.000Z'
            },
            {
                id: 't23', subProjectId: 'sp5', parentTaskId: null,
                title: 'בניית מודל פיננסי מלא',
                description: 'מודל אקטוארי מקיף: תזרים מזומנים, תרחישים, רגישויות',
                department: 'actuarial', assignee: '',
                startDate: '2026-05-15', dueDate: '2026-08-15',
                priority: 'critical', status: 'waiting', progress: 0,
                dependencies: [{ taskId: 't20', type: 'FS' }, { taskId: 't21', type: 'FS' }],
                notes: '', order: 3,
                createdAt: '2026-03-01T00:00:00.000Z', updatedAt: '2026-03-01T00:00:00.000Z'
            },

            // === SP6: חקיקה ורגולציה ===
            {
                id: 't24', subProjectId: 'sp6', parentTaskId: null,
                title: 'עדכון טיוטת החלטת ממשלה',
                description: 'עדכון הטיוטה בהתאם להכרעות המוצר והניתוח הפיננסי',
                department: 'legal', assignee: '',
                startDate: '2026-05-01', dueDate: '2026-06-30',
                priority: 'critical', status: 'waiting', progress: 0,
                dependencies: [{ taskId: 't9', type: 'FS' }, { taskId: 't20', type: 'FS' }],
                notes: '', order: 0,
                createdAt: '2026-03-01T00:00:00.000Z', updatedAt: '2026-03-01T00:00:00.000Z'
            },
            {
                id: 't25', subProjectId: 'sp6', parentTaskId: null,
                title: 'תיקון חוזר ביטוח - חיסכון וסיעוד',
                description: 'עדכון חוזר 2024-32 בהתאם למודל הסופי',
                department: 'legal', assignee: '',
                startDate: '2026-06-01', dueDate: '2026-08-01',
                priority: 'high', status: 'waiting', progress: 0,
                dependencies: [{ taskId: 't15', type: 'FS' }, { taskId: 't16', type: 'FS' }],
                notes: '', order: 1,
                createdAt: '2026-03-01T00:00:00.000Z', updatedAt: '2026-03-01T00:00:00.000Z'
            },
            {
                id: 't26', subProjectId: 'sp6', parentTaskId: null,
                title: 'הכנת תקנון קבוצה סגורה',
                description: 'מסמך משפטי להסדרת הקבוצה הסגורה של מבוטחים קיימים',
                department: 'legal', assignee: '',
                startDate: '2026-06-15', dueDate: '2026-09-15',
                priority: 'high', status: 'waiting', progress: 0,
                dependencies: [{ taskId: 't10', type: 'FS' }, { taskId: 't13', type: 'FS' }],
                notes: '', order: 2,
                createdAt: '2026-03-01T00:00:00.000Z', updatedAt: '2026-03-01T00:00:00.000Z'
            },
            {
                id: 't27', subProjectId: 'sp6', parentTaskId: null,
                title: 'בחינת סמכות מינוי מנהל מורשה',
                description: 'בדיקת סעיף 68 לחוק הפיקוח, תנאים למינוי',
                department: 'legal', assignee: '',
                startDate: '2026-05-15', dueDate: '2026-07-15',
                priority: 'medium', status: 'waiting', progress: 0,
                dependencies: [{ taskId: 't24', type: 'SS' }],
                notes: '', order: 3,
                createdAt: '2026-03-01T00:00:00.000Z', updatedAt: '2026-03-01T00:00:00.000Z'
            },

            // === SP8: שיתוף ציבור ===
            {
                id: 't30', subProjectId: 'sp8', parentTaskId: null,
                title: 'הכנת מסמך מדיניות לציבור',
                description: 'גרסה ציבורית של מסמך הרפורמה, נגישה ומשכנעת',
                department: 'product', assignee: '',
                startDate: '2026-07-01', dueDate: '2026-08-15',
                priority: 'high', status: 'waiting', progress: 0,
                dependencies: [{ taskId: 't9', type: 'FS' }, { taskId: 't23', type: 'FS' }],
                notes: '', order: 0,
                createdAt: '2026-03-01T00:00:00.000Z', updatedAt: '2026-03-01T00:00:00.000Z'
            },
            {
                id: 't31', subProjectId: 'sp8', parentTaskId: null,
                title: 'פרסום להערות הציבור',
                description: 'פרסום רשמי של הטיוטה לתגובות ציבוריות',
                department: 'legal', assignee: '',
                startDate: '2026-08-15', dueDate: '2026-10-15',
                priority: 'medium', status: 'waiting', progress: 0,
                dependencies: [{ taskId: 't30', type: 'FS' }, { taskId: 't24', type: 'FS' }],
                notes: '', order: 1,
                createdAt: '2026-03-01T00:00:00.000Z', updatedAt: '2026-03-01T00:00:00.000Z'
            },

            // === Sub-tasks examples (under t1) ===
            {
                id: 'st1_1', subProjectId: 'sp1', parentTaskId: 't1',
                title: 'סקירת הרובד הציבורי - ביטוח לאומי',
                description: 'גמלת סיעוד, שעות טיפול, רפורמת 2018',
                department: 'product', assignee: 'אבי לוסקי',
                startDate: '2026-03-01', dueDate: '2026-03-10',
                priority: 'high', status: 'completed', progress: 100,
                dependencies: [], notes: '', order: 0,
                createdAt: '2026-03-01T00:00:00.000Z', updatedAt: '2026-03-10T00:00:00.000Z'
            },
            {
                id: 'st1_2', subProjectId: 'sp1', parentTaskId: 't1',
                title: 'סקירת הרובד הביטוחי - קופות חולים',
                description: '4.6 מיליון מבוטחים, תנאי פוליסה, אתגרים',
                department: 'product', assignee: 'אבי לוסקי',
                startDate: '2026-03-08', dueDate: '2026-03-18',
                priority: 'high', status: 'in-progress', progress: 50,
                dependencies: [], notes: '', order: 1,
                createdAt: '2026-03-01T00:00:00.000Z', updatedAt: '2026-03-15T00:00:00.000Z'
            },
            {
                id: 'st1_3', subProjectId: 'sp1', parentTaskId: 't1',
                title: 'סקירת הרובד הפרטי',
                description: 'ביטוח סיעודי פרט, כמיליון מבוטחים',
                department: 'product', assignee: '',
                startDate: '2026-03-12', dueDate: '2026-03-20',
                priority: 'medium', status: 'waiting', progress: 0,
                dependencies: [{ taskId: 'st1_2', type: 'SS' }],
                notes: '', order: 2,
                createdAt: '2026-03-01T00:00:00.000Z', updatedAt: '2026-03-01T00:00:00.000Z'
            },

            // === Sub-tasks under t12 (מנגנון מעבר) ===
            {
                id: 'st12_1', subProjectId: 'sp3', parentTaskId: 't12',
                title: 'חלופה א - העברה יזומה לפי גיל חתך',
                description: 'מבוטחים מתחת לגיל מסוים מועברים אוטומטית',
                department: 'product', assignee: '',
                startDate: '2026-05-15', dueDate: '2026-06-15',
                priority: 'high', status: 'waiting', progress: 0,
                dependencies: [], notes: '', order: 0,
                createdAt: '2026-03-01T00:00:00.000Z', updatedAt: '2026-03-01T00:00:00.000Z'
            },
            {
                id: 'st12_2', subProjectId: 'sp3', parentTaskId: 't12',
                title: 'חלופה ב - סגירה מלאה ובחירה חופשית',
                description: 'כל המבוטחים בוחרים באופן חופשי',
                department: 'product', assignee: '',
                startDate: '2026-05-15', dueDate: '2026-06-15',
                priority: 'high', status: 'waiting', progress: 0,
                dependencies: [], notes: '', order: 1,
                createdAt: '2026-03-01T00:00:00.000Z', updatedAt: '2026-03-01T00:00:00.000Z'
            },
            {
                id: 'st12_3', subProjectId: 'sp3', parentTaskId: 't12',
                title: 'ניתוח משפטי של חלופות המעבר',
                description: 'בדיקת התכנות משפטית, סיכוני תקיפה',
                department: 'legal', assignee: '',
                startDate: '2026-06-01', dueDate: '2026-07-01',
                priority: 'critical', status: 'waiting', progress: 0,
                dependencies: [{ taskId: 'st12_1', type: 'FS' }, { taskId: 'st12_2', type: 'FS' }],
                notes: '', order: 2,
                createdAt: '2026-03-01T00:00:00.000Z', updatedAt: '2026-03-01T00:00:00.000Z'
            }
        ];
    }
}

// Global store instance
const store = new Store();
