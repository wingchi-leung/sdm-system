import { formatCurrency, formatDateTime, getActivityStatusLabel } from './admin';

export interface ActivityExportParticipantRow {
  id: number;
  user_id?: number | null;
  participant_name: string;
  phone: string;
  identity_type?: string | null;
  identity_number?: string | null;
  sex?: string | null;
  age?: number | null;
  occupation?: string | null;
  industry?: string | null;
  email?: string | null;
  enroll_status: number;
  payment_status: number;
  payment_order_id?: number | null;
  paid_amount: number;
  why_join?: string | null;
  channel?: string | null;
  expectation?: string | null;
  activity_understanding?: string | null;
  has_questions?: string | null;
  payment_order_no?: string | null;
  payment_paid_at?: string | null;
  create_time: string;
  update_time: string;
}

export interface ActivityExportItem {
  tenant_id: number;
  tenant_name?: string | null;
  tenant_code?: string | null;
  activity_id: number;
  activity_name: string;
  activity_type_name?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  status: number;
  tag?: string | null;
  suggested_fee: number;
  require_payment: number;
  location?: string | null;
  max_participants?: number | null;
  participants: ActivityExportParticipantRow[];
}

export interface ActivityExportResponse {
  exported_at: string;
  activities: ActivityExportItem[];
}

export interface ActivityExportSheetRow {
  租户名称: string;
  租户编码: string;
  活动ID: number;
  活动名称: string;
  活动类型: string;
  活动标签: string;
  活动状态: string;
  活动开始时间: string;
  活动结束时间: string;
  活动地点: string;
  活动建议报名费: string;
  是否收费: string;
  最大人数: string | number;
  报名记录ID: number | string;
  报名时间: string;
  更新时间: string;
  报名状态: string;
  支付状态: string;
  支付订单ID: number | string;
  支付订单号: string;
  支付时间: string;
  实付金额: string;
  用户ID: number | string;
  姓名: string;
  手机号: string;
  证件类型: string;
  证件号: string;
  性别: string;
  年龄: number | string;
  职业: string;
  行业: string;
  邮箱: string;
  为什么报名: string;
  了解渠道: string;
  学习期待: string;
  对活动理解: string;
  其他问题: string;
}

function formatIdentityType(value?: string | null): string {
  switch (value) {
    case 'mainland':
      return '中国大陆身份证';
    case 'hongkong':
      return '中国香港身份证';
    case 'taiwan':
      return '中国台湾身份证';
    case 'foreign':
      return '其他证件';
    default:
      return value || '';
  }
}

function formatEnrollStatus(value: number): string {
  return value === 2 ? '候补' : '已报名';
}

function formatPaymentStatus(value: number): string {
  switch (value) {
    case 2:
      return '已支付';
    case 1:
      return '待支付';
    default:
      return '无需支付';
  }
}

function sanitizeStringValue(value?: string | null): string {
  if (value == null) {
    return '';
  }
  return value.trim();
}

export function sanitizeSheetName(name: string, index: number): string {
  const cleanedName = name.replace(/[\\/:*?[\]]/g, ' ').trim();
  const fallbackName = `活动${index}`;
  const safeName = cleanedName || fallbackName;
  return safeName.slice(0, 31);
}

export function buildActivityExportSheetRows(activity: ActivityExportItem): ActivityExportSheetRow[] {
  const baseRow = {
    租户名称: sanitizeStringValue(activity.tenant_name),
    租户编码: sanitizeStringValue(activity.tenant_code),
    活动ID: activity.activity_id,
    活动名称: activity.activity_name,
    活动类型: sanitizeStringValue(activity.activity_type_name),
    活动标签: sanitizeStringValue(activity.tag),
    活动状态: getActivityStatusLabel(activity.status),
    活动开始时间: activity.start_time ? formatDateTime(activity.start_time) : '',
    活动结束时间: activity.end_time ? formatDateTime(activity.end_time) : '',
    活动地点: sanitizeStringValue(activity.location) || '线上活动',
    活动建议报名费: activity.require_payment === 1 ? formatCurrency(activity.suggested_fee) : '免费',
    是否收费: activity.require_payment === 1 ? '是' : '否',
    最大人数: activity.max_participants ?? '不限',
  };

  if (activity.participants.length === 0) {
    return [{
      ...baseRow,
      报名记录ID: '',
      报名时间: '',
      更新时间: '',
      报名状态: '',
      支付状态: '',
      支付订单ID: '',
      支付订单号: '',
      支付时间: '',
      实付金额: '',
      用户ID: '',
      姓名: '',
      手机号: '',
      证件类型: '',
      证件号: '',
      性别: '',
      年龄: '',
      职业: '',
      行业: '',
      邮箱: '',
      为什么报名: '',
      了解渠道: '',
      学习期待: '',
      对活动理解: '',
      其他问题: '',
    }];
  }

  return activity.participants.map((participant) => ({
    ...baseRow,
    报名记录ID: participant.id,
    报名时间: formatDateTime(participant.create_time),
    更新时间: formatDateTime(participant.update_time),
    报名状态: formatEnrollStatus(participant.enroll_status),
    支付状态: formatPaymentStatus(participant.payment_status),
    支付订单ID: participant.payment_order_id ?? '',
    支付订单号: sanitizeStringValue(participant.payment_order_no),
    支付时间: participant.payment_paid_at ? formatDateTime(participant.payment_paid_at) : '',
    实付金额: participant.payment_status === 2 ? formatCurrency(participant.paid_amount) : '',
    用户ID: participant.user_id ?? '',
    姓名: participant.participant_name,
    手机号: participant.phone,
    证件类型: formatIdentityType(participant.identity_type),
    证件号: sanitizeStringValue(participant.identity_number),
    性别: sanitizeStringValue(participant.sex),
    年龄: participant.age ?? '',
    职业: sanitizeStringValue(participant.occupation),
    行业: sanitizeStringValue(participant.industry),
    邮箱: sanitizeStringValue(participant.email),
    为什么报名: sanitizeStringValue(participant.why_join),
    了解渠道: sanitizeStringValue(participant.channel),
    学习期待: sanitizeStringValue(participant.expectation),
    对活动理解: sanitizeStringValue(participant.activity_understanding),
    其他问题: sanitizeStringValue(participant.has_questions),
  }));
}

export async function exportActivitiesWorkbook(payload: ActivityExportResponse): Promise<void> {
  const XLSX = await import('xlsx');
  const workbook = XLSX.utils.book_new();

  payload.activities.forEach((activityItem, index) => {
    const rows = buildActivityExportSheetRows(activityItem);
    const worksheet = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(workbook, worksheet, sanitizeSheetName(activityItem.activity_name, index + 1));
  });

  const exportDate = payload.exported_at ? payload.exported_at.slice(0, 10) : new Date().toISOString().slice(0, 10);
  XLSX.writeFile(workbook, `活动报名导出_${exportDate}.xlsx`);
}
