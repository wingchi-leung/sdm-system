export interface HasCreateTime {
  create_time: string;
}

export interface ActivityWithStatus {
  start_time: string;
  status: number;
}

export function getActivityStatusLabel(status: number): string {
  switch (status) {
    case 1:
      return '未开始';
    case 2:
      return '进行中';
    case 3:
      return '已结束';
    default:
      return '未知状态';
  }
}

export function formatDateTime(dateString?: string | null): string {
  if (!dateString) {
    return '--';
  }

  const value = new Date(dateString);
  if (Number.isNaN(value.getTime())) {
    return '--';
  }

  return value.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatCurrency(amountInFen?: number | null): string {
  if (!amountInFen) {
    return '¥0.00';
  }

  return `¥${(amountInFen / 100).toFixed(2)}`;
}

export function countTodayRegistrations<T extends HasCreateTime>(items: T[]): number {
  const today = new Date();

  return items.filter((item) => {
    const createdAt = new Date(item.create_time);
    return (
      createdAt.getFullYear() === today.getFullYear()
      && createdAt.getMonth() === today.getMonth()
      && createdAt.getDate() === today.getDate()
    );
  }).length;
}

export function countTodayCheckins<T extends HasCreateTime>(items: T[]): number {
  return countTodayRegistrations(items);
}

export function countTodayActivities<T extends ActivityWithStatus>(items: T[]): number {
  const today = new Date();

  return items.filter((item) => {
    const startAt = new Date(item.start_time);
    return (
      startAt.getFullYear() === today.getFullYear()
      && startAt.getMonth() === today.getMonth()
      && startAt.getDate() === today.getDate()
      && item.status !== 3
    );
  }).length;
}
