// ============================================
// calendar.js - Calendar Component
// ============================================

class CalendarView {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.currentDate = new Date();
        this.currentDate.setDate(1); // Start of month

        this.hebrewMonths = [
            'ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני',
            'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'
        ];
        this.hebrewDays = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
        this.hebrewDaysShort = ['א\'', 'ב\'', 'ג\'', 'ד\'', 'ה\'', 'ו\'', 'ש\''];
    }

    getTitle() {
        return `${this.hebrewMonths[this.currentDate.getMonth()]} ${this.currentDate.getFullYear()}`;
    }

    prevMonth() {
        this.currentDate.setMonth(this.currentDate.getMonth() - 1);
        this.render();
    }

    nextMonth() {
        this.currentDate.setMonth(this.currentDate.getMonth() + 1);
        this.render();
    }

    goToday() {
        this.currentDate = new Date();
        this.currentDate.setDate(1);
        this.render();
    }

    render() {
        const year = this.currentDate.getFullYear();
        const month = this.currentDate.getMonth();
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        // Update title
        document.getElementById('calTitle').textContent = this.getTitle();

        // Build calendar grid
        const firstDay = new Date(year, month, 1);
        const lastDay = new Date(year, month + 1, 0);
        const startDay = firstDay.getDay(); // 0=Sunday
        const totalDays = lastDay.getDate();

        // Start from the previous month's days
        const prevMonthLastDay = new Date(year, month, 0).getDate();
        const startDate = prevMonthLastDay - startDay + 1;

        let html = '';

        // Weekday headers
        html += '<div class="calendar-weekdays">';
        this.hebrewDays.forEach(day => {
            html += `<div class="calendar-weekday">${day}</div>`;
        });
        html += '</div>';

        // Days grid
        html += '<div class="calendar-days">';

        let currentDay = 1;
        let nextMonthDay = 1;
        const rows = Math.ceil((startDay + totalDays) / 7);

        for (let row = 0; row < rows; row++) {
            for (let col = 0; col < 7; col++) {
                const cellIndex = row * 7 + col;

                let dayNum, dateStr, isOtherMonth = false, isToday = false, isShabbat = col === 5 || col === 6;

                if (cellIndex < startDay) {
                    // Previous month
                    dayNum = startDate + cellIndex;
                    const pm = month === 0 ? 11 : month - 1;
                    const py = month === 0 ? year - 1 : year;
                    dateStr = `${py}-${String(pm + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
                    isOtherMonth = true;
                } else if (currentDay <= totalDays) {
                    dayNum = currentDay;
                    dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
                    const cellDate = new Date(year, month, dayNum);
                    cellDate.setHours(0, 0, 0, 0);
                    isToday = cellDate.getTime() === today.getTime();
                    currentDay++;
                } else {
                    dayNum = nextMonthDay;
                    const nm = month === 11 ? 0 : month + 1;
                    const ny = month === 11 ? year + 1 : year;
                    dateStr = `${ny}-${String(nm + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
                    isOtherMonth = true;
                    nextMonthDay++;
                }

                const classes = ['calendar-day'];
                if (isOtherMonth) classes.push('other-month');
                if (isToday) classes.push('today');
                if (isShabbat) classes.push('shabbat');

                // Get tasks for this day
                const tasks = store.getTasksForDate(dateStr);
                const hasTasks = tasks.length > 0;
                if (hasTasks) classes.push('has-tasks');
                const maxShow = 3;

                html += `<div class="${classes.join(' ')}" data-date="${dateStr}" onclick="app.onCalendarDayClick('${dateStr}')">`;
                html += `<div class="calendar-day-header">`;
                html += `<div class="calendar-day-number">${dayNum}</div>`;
                if (hasTasks && !isOtherMonth) {
                    html += `<span class="calendar-task-count">${tasks.length}</span>`;
                }
                html += `</div>`;

                html += `<div class="calendar-tasks-list">`;
                tasks.slice(0, maxShow).forEach(task => {
                    const dept = DEPARTMENTS[task.department] || DEPARTMENTS.product;
                    const bgColor = dept.color;
                    const statusIcon = task.status === 'done' ? '✓ ' : '';
                    html += `<div class="calendar-task" style="background: ${bgColor}" title="${task.title} (${task.progress || 0}%)">${statusIcon}${task.title}</div>`;
                });

                if (tasks.length > maxShow) {
                    html += `<div class="calendar-more">+${tasks.length - maxShow} נוספות</div>`;
                }
                html += `</div>`;

                html += '</div>';
            }
        }

        html += '</div>';

        this.container.innerHTML = html;
    }
}
