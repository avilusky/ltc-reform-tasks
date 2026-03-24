// ============================================
// gantt.js - Gantt Chart Component (RTL timeline)
// ============================================

class GanttChart {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.zoom = 'month'; // 'week' (daily), 'month' (weekly), 'quarter' (monthly)
        this.filters = { subProjectId: '', department: '' };

        // Zoom configurations: pixels per day
        this.zoomConfig = {
            week: { pxPerDay: 40, labelFormat: 'day' },
            month: { pxPerDay: 16, labelFormat: 'week' },
            quarter: { pxPerDay: 5, labelFormat: 'month' }
        };
    }

    setZoom(zoom) {
        this.zoom = zoom;
        this.render();
    }

    setFilters(filters) {
        this.filters = { ...this.filters, ...filters };
        this.render();
    }

    render() {
        const subProjects = store.getSubProjects();
        let tasks = store.getTasks({ rootOnly: true });

        // Apply filters
        if (this.filters.subProjectId) {
            tasks = tasks.filter(t => t.subProjectId === this.filters.subProjectId);
        }
        if (this.filters.department) {
            tasks = tasks.filter(t => t.department === this.filters.department);
        }

        // Filter tasks that have dates
        tasks = tasks.filter(t => t.startDate || t.dueDate);

        // Get date range
        const allDates = [];
        tasks.forEach(t => {
            if (t.startDate) allDates.push(new Date(t.startDate));
            if (t.dueDate) allDates.push(new Date(t.dueDate));
        });
        subProjects.forEach(sp => {
            const spDates = store.getSubProjectDates(sp.id);
            if (spDates.startDate) allDates.push(new Date(spDates.startDate));
            if (spDates.endDate) allDates.push(new Date(spDates.endDate));
        });

        if (allDates.length === 0) {
            this.container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📈</div><div class="empty-state-text">אין משימות עם תאריכים להצגה</div></div>';
            return;
        }

        let minDate = new Date(Math.min(...allDates));
        let maxDate = new Date(Math.max(...allDates));

        // Start from the 1st of the earliest month, end at end of latest month
        minDate = new Date(minDate.getFullYear(), minDate.getMonth(), 1);
        maxDate = new Date(maxDate.getFullYear(), maxDate.getMonth() + 1, 0);

        const config = { ...this.zoomConfig[this.zoom] };
        const totalDays = Math.ceil((maxDate - minDate) / (1000 * 60 * 60 * 24));

        // For monthly view (quarter): fit to container width (no horizontal scroll)
        if (this.zoom === 'quarter') {
            const containerWidth = this.container.parentElement ? this.container.parentElement.clientWidth : this.container.clientWidth;
            const labelsWidth = 200; // approximate width of labels column
            const availableWidth = containerWidth - labelsWidth - 20;
            if (availableWidth > 0 && totalDays > 0) {
                config.pxPerDay = Math.max(availableWidth / totalDays, 3);
            }
        }

        const timelineWidth = totalDays * config.pxPerDay;

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayOffset = this.getDayOffset(minDate, today);

        // Group tasks by sub-project
        const grouped = {};
        subProjects.forEach(sp => {
            const spTasks = tasks.filter(t => t.subProjectId === sp.id);
            if (spTasks.length > 0 || !this.filters.subProjectId) {
                grouped[sp.id] = { sp, tasks: spTasks };
            }
        });

        let html = '';

        // Header row
        html += '<div class="gantt-header-row">';
        html += '<div class="gantt-label-col">משימה</div>';
        html += `<div class="gantt-timeline-header" style="direction:rtl;width:${timelineWidth}px;flex:none">`;
        html += this.renderTimelineHeader(minDate, maxDate, config, totalDays);
        html += '</div>';
        html += '</div>';

        // Build month grid lines (for monthly view)
        let monthGridHtml = '';
        if (config.labelFormat === 'month') {
            let mDate = new Date(minDate.getFullYear(), minDate.getMonth() + 1, 1);
            while (mDate < maxDate) {
                const off = this.getDayOffset(minDate, mDate);
                monthGridHtml += `<div class="gantt-month-divider" style="right:${off * config.pxPerDay}px"></div>`;
                mDate.setMonth(mDate.getMonth() + 1);
            }
        }

        // Data rows
        let rowIndex = 0;
        const rowPositions = {};

        Object.values(grouped).forEach(group => {
            const sp = group.sp;

            // Sub-project row (dates calculated from tasks)
            const spDates = store.getSubProjectDates(sp.id);
            const spStart = spDates.startDate ? this.getDayOffset(minDate, new Date(spDates.startDate)) : 0;
            const spEnd = spDates.endDate ? this.getDayOffset(minDate, new Date(spDates.endDate)) : totalDays;
            const spWidth = Math.max((spEnd - spStart) * config.pxPerDay, 10);
            const spRight = spStart * config.pxPerDay;

            html += `<div class="gantt-row sp-row" onclick="app.navigateToSubProject('${sp.id}')">`;
            html += `<div class="gantt-row-label"><span style="font-size:16px">${sp.icon}</span> <span class="task-name">${sp.name}</span></div>`;
            html += `<div class="gantt-timeline" style="width:${timelineWidth}px;direction:rtl;flex:none">`;
            html += monthGridHtml;
            html += `<div class="gantt-bar sp-bar" style="right:${spRight}px; width:${spWidth}px; background:${sp.color}">${sp.name}</div>`;
            html += '</div></div>';
            rowIndex++;

            // Task rows
            group.tasks.forEach(task => {
                const dept = DEPARTMENTS[task.department] || DEPARTMENTS.product;
                const taskStart = task.startDate ? new Date(task.startDate) : (task.dueDate ? new Date(task.dueDate) : null);
                const taskEnd = task.dueDate ? new Date(task.dueDate) : (task.startDate ? new Date(task.startDate) : null);

                if (!taskStart) return;

                const startOffset = this.getDayOffset(minDate, taskStart);
                const endOffset = this.getDayOffset(minDate, taskEnd);
                const barWidth = Math.max((endOffset - startOffset + 1) * config.pxPerDay, 8);
                const barRight = startOffset * config.pxPerDay;

                const isBlocked = store.isTaskBlocked(task.id);
                const blockedIcon = isBlocked ? '<span class="dep-icon">🚫</span>' : '';

                // Store positions for dependency arrows
                rowPositions[task.id] = { row: rowIndex, right: barRight, width: barWidth, endRight: barRight + barWidth };

                html += `<div class="gantt-row" onclick="app.openTaskDetail('${task.id}')">`;
                html += `<div class="gantt-row-label">`;
                html += `<span class="dept-dot" style="background:${dept.color}"></span>`;
                html += `${blockedIcon}`;
                html += `<span class="task-name">${task.title}</span>`;
                html += `</div>`;
                html += `<div class="gantt-timeline" style="width:${timelineWidth}px;direction:rtl;flex:none" data-task-id="${task.id}">`;
                html += monthGridHtml;

                // Task bar
                const progressWidth = task.progress || 0;
                html += `<div class="gantt-bar" style="right:${barRight}px; width:${barWidth}px; background:${dept.color}" title="${task.title} (${task.progress}%)">`;
                if (progressWidth > 0 && progressWidth < 100) {
                    html += `<div class="gantt-bar-progress" style="width:${100 - progressWidth}%"></div>`;
                }
                html += `${task.title}`;
                html += '</div>';

                // Today line
                if (todayOffset >= 0 && todayOffset <= totalDays) {
                    html += `<div class="gantt-today-line" style="right:${todayOffset * config.pxPerDay}px;width:${config.pxPerDay}px"></div>`;
                }

                html += '</div></div>';
                rowIndex++;
            });
        });

        this.container.innerHTML = html;

        // Force the inner container to be wide enough for horizontal scrolling
        this.container.style.width = (280 + timelineWidth) + 'px';

        // Scroll to today
        this.scrollToToday();
    }

    renderTimelineHeader(minDate, maxDate, config, totalDays) {
        let html = '';
        const d = new Date(minDate);

        if (config.labelFormat === 'day') {
            for (let i = 0; i < totalDays; i++) {
                const dayDate = new Date(d);
                dayDate.setDate(d.getDate() + i);
                const isWeekend = dayDate.getDay() === 6;
                const isFriday = dayDate.getDay() === 5;
                const dayStr = dayDate.getDate();
                const monthStr = dayDate.getMonth() + 1;
                const bg = isWeekend ? 'background:rgba(239,68,68,0.05)' : (isFriday ? 'background:rgba(245,158,11,0.05)' : '');
                html += `<div class="gantt-time-cell" style="width:${config.pxPerDay}px;${bg}">${dayStr}/${monthStr}</div>`;
            }
        } else if (config.labelFormat === 'week') {
            let weekStart = new Date(d);
            weekStart.setDate(weekStart.getDate() - weekStart.getDay());
            while (weekStart < maxDate) {
                const weekEnd = new Date(weekStart);
                weekEnd.setDate(weekEnd.getDate() + 6);
                const daysInView = Math.min(7, this.getDayOffset(minDate, weekEnd) - this.getDayOffset(minDate, weekStart) + 1);
                const width = Math.max(daysInView * config.pxPerDay, config.pxPerDay);
                const label = `${weekStart.getDate()}/${weekStart.getMonth() + 1}`;
                html += `<div class="gantt-time-cell" style="width:${width}px">${label}</div>`;
                weekStart.setDate(weekStart.getDate() + 7);
            }
        } else {
            let monthDate = new Date(d.getFullYear(), d.getMonth(), 1);
            const hebrewMonths = ['ינו\'', 'פבר\'', 'מרץ', 'אפר\'', 'מאי', 'יוני', 'יולי', 'אוג\'', 'ספט\'', 'אוק\'', 'נוב\'', 'דצמ\''];
            while (monthDate < maxDate) {
                const monthEnd = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0);
                const startOff = Math.max(0, this.getDayOffset(minDate, monthDate));
                const endOff = Math.min(totalDays, this.getDayOffset(minDate, monthEnd));
                const daysInView = endOff - startOff + 1;
                const width = Math.max(daysInView * config.pxPerDay, 30);
                html += `<div class="gantt-time-cell" style="width:${width}px">${hebrewMonths[monthDate.getMonth()]} ${monthDate.getFullYear()}</div>`;
                monthDate.setMonth(monthDate.getMonth() + 1);
            }
        }

        return html;
    }

    getDayOffset(baseDate, date) {
        const base = new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate());
        const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
        return Math.round((d - base) / (1000 * 60 * 60 * 24));
    }

    drawDependencyArrows(rowPositions, config, timelineWidth, totalRows) {
        const allTasks = store.getTasks({ rootOnly: true });
        const arrows = [];

        allTasks.forEach(task => {
            if (!task.dependencies || task.dependencies.length === 0) return;
            if (!rowPositions[task.id]) return;

            task.dependencies.forEach(dep => {
                if (!rowPositions[dep.taskId]) return;

                const from = rowPositions[dep.taskId];
                const to = rowPositions[task.id];

                arrows.push({
                    fromRow: from.row,
                    toRow: to.row,
                    fromEndRight: from.endRight,
                    toRight: to.right,
                    type: dep.type
                });
            });
        });

        if (arrows.length === 0) return;

        const timelines = this.container.querySelectorAll('.gantt-timeline');
        if (timelines.length === 0) return;

        const rowHeight = 38;
        const svgHeight = totalRows * rowHeight;

        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('class', 'gantt-svg-overlay');
        svg.setAttribute('width', timelineWidth);
        svg.setAttribute('height', svgHeight);
        svg.style.width = timelineWidth + 'px';
        svg.style.height = svgHeight + 'px';
        svg.style.position = 'absolute';
        svg.style.top = '0';
        svg.style.right = '0';
        svg.style.pointerEvents = 'none';
        svg.style.direction = 'ltr';

        // Add arrowhead marker
        const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
        const marker = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
        marker.setAttribute('id', 'arrowhead');
        marker.setAttribute('markerWidth', '6');
        marker.setAttribute('markerHeight', '4');
        marker.setAttribute('refX', '6');
        marker.setAttribute('refY', '2');
        marker.setAttribute('orient', 'auto');
        const polygon = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
        polygon.setAttribute('points', '0 0, 6 2, 0 4');
        polygon.setAttribute('fill', '#94a3b8');
        marker.appendChild(polygon);
        defs.appendChild(marker);
        svg.appendChild(defs);

        arrows.forEach(arrow => {
            // RTL: convert right-based positions to SVG x coordinates
            const fromX = timelineWidth - arrow.fromEndRight;
            const toX = timelineWidth - arrow.toRight;
            const fromY = arrow.fromRow * rowHeight + rowHeight / 2;
            const toY = arrow.toRow * rowHeight + rowHeight / 2;

            const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');

            let d;
            const dy = toY - fromY;
            if (Math.abs(dy) < rowHeight) {
                // Same or adjacent row - simple curve
                const cx = (fromX + toX) / 2;
                d = `M ${fromX} ${fromY} C ${cx} ${fromY}, ${cx} ${toY}, ${toX} ${toY}`;
            } else {
                // Multi-row - smooth S-curve via cubic bezier
                const midY = (fromY + toY) / 2;
                d = `M ${fromX} ${fromY} C ${fromX} ${midY}, ${toX} ${midY}, ${toX} ${toY}`;
            }

            path.setAttribute('d', d);
            path.setAttribute('stroke', '#94a3b8');
            path.setAttribute('stroke-width', '1.5');
            path.setAttribute('fill', 'none');
            path.setAttribute('marker-end', 'url(#arrowhead)');
            path.setAttribute('opacity', '0.5');

            svg.appendChild(path);
        });

        // Append SVG to the gantt container
        this.container.style.position = 'relative';
        this.container.appendChild(svg);
    }

    scrollToToday() {
        requestAnimationFrame(() => {
            setTimeout(() => {
                const todayLine = this.container.querySelector('.gantt-today-line');
                const scrollParent = this.container.closest('.gantt-scroll-container') || this.container.parentElement;
                if (todayLine && scrollParent) {
                    const lineRect = todayLine.getBoundingClientRect();
                    const parentRect = scrollParent.getBoundingClientRect();
                    const offset = lineRect.right - parentRect.right;
                    const target = scrollParent.scrollLeft + offset + (parentRect.width * 0.35);
                    scrollParent.scrollTo({ left: target, behavior: 'smooth' });
                }
            }, 150);
        });
    }
}
