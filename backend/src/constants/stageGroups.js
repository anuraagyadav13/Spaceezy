const STAGE_GROUPS = {
  NEW: ['NEW'],
  CONTACTED: ['CONTACTED'],
  FOLLOW_UP: ['FOLLOW_UP', 'INTERESTED', 'QUALIFIED'],
  SITE_VISIT: ['SITE_VISIT'],
  QUOTATION: ['QUOTATION', 'NEGOTIATION'],
  BOOKING: ['BOOKED'],
};

const INACTIVE_STAGES = ['LOST', 'CLOSED'];

const PIPELINE_STAGES = ['NEW', 'CONTACTED', 'FOLLOW_UP', 'SITE_VISIT', 'QUOTATION', 'BOOKING'];

const STAGE_LABELS = {
  NEW: 'New Lead',
  CONTACTED: 'Contacted',
  FOLLOW_UP: 'Follow-up',
  SITE_VISIT: 'Site Visit',
  QUOTATION: 'Quotation',
  BOOKING: 'Booking',
};

const BUSINESS_TIMEZONE = 'Asia/Kolkata';

function stageToGroup(status) {
  for (const [group, statuses] of Object.entries(STAGE_GROUPS)) {
    if (statuses.includes(status)) return group;
  }
  return null;
}

function groupToStatuses(group) {
  return STAGE_GROUPS[group] || [];
}

function groupToCanonicalStatus(group) {
  const statuses = STAGE_GROUPS[group];
  return statuses ? statuses[0] : null;
}

function isActiveStage(status) {
  return stageToGroup(status) !== null;
}

module.exports = {
  STAGE_GROUPS,
  INACTIVE_STAGES,
  PIPELINE_STAGES,
  STAGE_LABELS,
  BUSINESS_TIMEZONE,
  stageToGroup,
  groupToStatuses,
  groupToCanonicalStatus,
  isActiveStage,
};
