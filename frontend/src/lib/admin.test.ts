import { countTodayActivities, countTodayRegistrations, formatCurrency, getActivityStatusLabel } from './admin';

describe('admin helpers', () => {
  it('returns activity status label', () => {
    expect(getActivityStatusLabel(1)).toBe('未开始');
    expect(getActivityStatusLabel(2)).toBe('进行中');
    expect(getActivityStatusLabel(99)).toBe('未知状态');
  });

  it('formats currency from fen', () => {
    expect(formatCurrency(0)).toBe('¥0.00');
    expect(formatCurrency(1250)).toBe('¥12.50');
  });

  it('counts today registrations only', () => {
    const today = new Date().toISOString();
    const yesterday = new Date(Date.now() - 86400000).toISOString();

    expect(countTodayRegistrations([
      { create_time: today },
      { create_time: today },
      { create_time: yesterday },
    ])).toBe(2);
  });

  it('counts today activities without ended records', () => {
    const today = new Date().toISOString();
    const tomorrow = new Date(Date.now() + 86400000).toISOString();

    expect(countTodayActivities([
      { start_time: today, status: 1 },
      { start_time: today, status: 3 },
      { start_time: tomorrow, status: 2 },
    ])).toBe(1);
  });
});
