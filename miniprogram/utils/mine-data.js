function formatParticipantActivities(items = [], formatTime) {
  return (Array.isArray(items) ? items : []).map((item) => ({
    ...item,
    start_time_display: typeof formatTime === 'function' ? formatTime(item.start_time) : '',
    enroll_status_text: item.enroll_status === 2 ? '候补中' : '已报名',
  }));
}

module.exports = {
  formatParticipantActivities,
};
