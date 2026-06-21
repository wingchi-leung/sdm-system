Component({
  properties: {
    year: {
      type: Number,
      value: 0,
      observer() {
        this.rebuildCalendar();
      },
    },
    month: {
      type: Number,
      value: 0,
      observer() {
        this.rebuildCalendar();
      },
    },
    selectedDate: {
      type: String,
      value: '',
      observer() {
        this.rebuildCalendar();
      },
    },
    eventDates: {
      type: Array,
      value: [],
      observer() {
        this.rebuildCalendar();
      },
    },
  },

  data: {
    monthLabel: '',
    weekLabels: ['一', '二', '三', '四', '五', '六', '日'],
    weeks: [],
    todayKey: '',
  },

  lifetimes: {
    attached() {
      this.rebuildCalendar();
    },
  },

  methods: {
    rebuildCalendar() {
      const year = Number(this.data.year || 0);
      const month = Number(this.data.month || 0);
      if (!year || !month) return;

      const monthLabel = `${year} 年 ${String(month).padStart(2, '0')} 月`;
      const todayKey = this.formatDateKey(new Date());
      const selectedDate = String(this.data.selectedDate || '');
      const eventDateSet = new Set((this.data.eventDates || []).map((item) => String(item)));
      const weeks = this.buildWeeks(year, month, selectedDate, todayKey, eventDateSet);

      this.setData({
        monthLabel,
        todayKey,
        weeks,
      });
    },

    buildWeeks(year, month, selectedDate, todayKey, eventDateSet) {
      const firstDay = new Date(year, month - 1, 1);
      const firstWeekday = (firstDay.getDay() + 6) % 7;
      const daysInMonth = new Date(year, month, 0).getDate();
      const prevMonthDays = new Date(year, month - 1, 0).getDate();

      const cells = [];
      for (let index = 0; index < 42; index += 1) {
        const offset = index - firstWeekday + 1;
        let cellYear = year;
        let cellMonth = month;
        let day = offset;
        let inMonth = true;

        if (offset <= 0) {
          inMonth = false;
          cellMonth = month - 1;
          if (cellMonth <= 0) {
            cellMonth = 12;
            cellYear -= 1;
          }
          day = prevMonthDays + offset;
        } else if (offset > daysInMonth) {
          inMonth = false;
          cellMonth = month + 1;
          if (cellMonth > 12) {
            cellMonth = 1;
            cellYear += 1;
          }
          day = offset - daysInMonth;
        }

        const dateKey = this.formatDateKey(new Date(cellYear, cellMonth - 1, day));
        cells.push({
          dateKey,
          day,
          inMonth,
          isToday: dateKey === todayKey,
          isSelected: dateKey === selectedDate,
          hasEvent: eventDateSet.has(dateKey),
          isWeekend: this.isWeekendIndex(index % 7),
        });
      }

      const weeks = [];
      for (let index = 0; index < cells.length; index += 7) {
        weeks.push(cells.slice(index, index + 7));
      }
      return weeks;
    },

    isWeekendIndex(index) {
      return index === 5 || index === 6;
    },

    formatDateKey(date) {
      const y = date.getFullYear();
      const m = String(date.getMonth() + 1).padStart(2, '0');
      const d = String(date.getDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    },

    onPrevMonth() {
      const year = Number(this.data.year || 0);
      const month = Number(this.data.month || 0);
      if (!year || !month) return;
      let nextYear = year;
      let nextMonth = month - 1;
      if (nextMonth <= 0) {
        nextMonth = 12;
        nextYear -= 1;
      }
      this.triggerEvent('monthchange', { year: nextYear, month: nextMonth });
    },

    onNextMonth() {
      const year = Number(this.data.year || 0);
      const month = Number(this.data.month || 0);
      if (!year || !month) return;
      let nextYear = year;
      let nextMonth = month + 1;
      if (nextMonth > 12) {
        nextMonth = 1;
        nextYear += 1;
      }
      this.triggerEvent('monthchange', { year: nextYear, month: nextMonth });
    },

    onTodayTap() {
      const now = new Date();
      this.triggerEvent('todaytap', {
        year: now.getFullYear(),
        month: now.getMonth() + 1,
        date: this.formatDateKey(now),
      });
    },

    onSelectCell(e) {
      const date = String(e.currentTarget.dataset.date || '');
      if (!date) return;
      this.triggerEvent('selectdate', { date });
    },
  },
});
