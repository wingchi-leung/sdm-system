function formatParticipantActivities(items = [], formatTime) {
  return (Array.isArray(items) ? items : []).map((item) => ({
    ...item,
    start_time_display: typeof formatTime === 'function' ? formatTime(item.start_time) : '',
    enroll_status_text: item.payment_status === 1
      ? '报名处理中'
      : (item.enroll_status === 2 ? '候补中' : '已报名'),
    enroll_status_class: item.payment_status === 1
      ? 'is-pending'
      : (item.enroll_status === 2 ? 'is-waiting' : 'is-registered'),
    location_display: item.location || '线上活动',
  }));
}

module.exports = {
  formatParticipantActivities,
};
