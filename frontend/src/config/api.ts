const DEFAULT_API_BASE_URL = 'http://localhost:8000/api/v1';
const DEFAULT_STATIC_BASE_URL = 'http://localhost:8000';

const BASE_URL = process.env.REACT_APP_API_URL || DEFAULT_API_BASE_URL;
const STATIC_BASE_URL = process.env.REACT_APP_STATIC_URL || DEFAULT_STATIC_BASE_URL;

function getConfigHint(): string {
  return `请检查前端环境变量 REACT_APP_API_URL（当前: ${BASE_URL}）以及后端服务/CORS是否可用`;
}

export function getImageUrl(url: string | null | undefined): string {
  if (!url) {
    return '';
  }

  if (url.startsWith('http://') || url.startsWith('https://')) {
    return url;
  }

  return STATIC_BASE_URL + (url.startsWith('/') ? url : `/${url}`);
}

export function isUnsafeApiUrl(): boolean {
  try {
    const parsed = new URL(BASE_URL);
    if (parsed.protocol !== 'http:') {
      return false;
    }

    const host = parsed.hostname.toLowerCase();
    return host !== 'localhost' && host !== '127.0.0.1';
  } catch {
    return false;
  }
}

export const API_PATHS = {
  auth: {
    login: `${BASE_URL}/auth/login`,
    logout: `${BASE_URL}/auth/logout`,
    setPassword: `${BASE_URL}/auth/set-password`,
    setAdminPassword: `${BASE_URL}/auth/set-admin-password`,
    me: `${BASE_URL}/auth/me`,
  },
  users: {
    list: `${BASE_URL}/users/`,
    create: `${BASE_URL}/users/create`,
    detail: (id: number) => `${BASE_URL}/users/${id}`,
    adminAll: `${BASE_URL}/users/admin/all`,
    adminAllWeb: `${BASE_URL}/users/admin/all-web`,
    block: (id: number) => `${BASE_URL}/users/${id}/block`,
    unblock: (id: number) => `${BASE_URL}/users/${id}/unblock`,
    importTemplate: `${BASE_URL}/users/import-template`,
    importExcel: `${BASE_URL}/users/import-excel`,
  },
  roles: {
    permissions: `${BASE_URL}/roles/permissions`,
    list: `${BASE_URL}/roles/roles`,
    userRoles: `${BASE_URL}/roles/user-roles`,
    userRoleDetail: (userId: number) => `${BASE_URL}/roles/users/${userId}/roles`,
    deleteUserRole: (userRoleId: number) => `${BASE_URL}/roles/user-roles/${userRoleId}`,
  },
  activityTypes: {
    list: `${BASE_URL}/activity-types`,
  },
  userActivityTypes: {
    bind: `${BASE_URL}/user-activity-types`,
    listByUser: (userId: number) => `${BASE_URL}/user-activity-types/by-user/${userId}`,
    listByType: (activityTypeId: number) => `${BASE_URL}/user-activity-types/by-type/${activityTypeId}`,
    unbind: (userId: number, activityTypeId: number) => `${BASE_URL}/user-activity-types/by-user/${userId}/${activityTypeId}`,
    unbindBatch: `${BASE_URL}/user-activity-types/batch`,
  },
  activities: {
    create: `${BASE_URL}/activities/`,
    list: `${BASE_URL}/activities/`,
    export: `${BASE_URL}/activities/export`,
    unstart: `${BASE_URL}/activities/unstarted/`,
    detail: (id: number) => `${BASE_URL}/activities/${id}`,
    update: (id: number) => `${BASE_URL}/activities/${id}`,
    delete: (id: number) => `${BASE_URL}/activities/${id}`,
    updateStatus: (id: number, status: number) => `${BASE_URL}/activities/${id}/status?status=${status}`,
    statistics: (id: number) => `${BASE_URL}/activities/${id}/statistics/`,
    enrollmentInfo: (id: number) => `${BASE_URL}/activities/${id}/enrollment-info`,
    checkins: (id: number) => `${BASE_URL}/activities/${id}/checkins/`,
    participants: (id: number) => `${BASE_URL}/participants/${id}/`,
  },
  participants: {
    list: (id: number) => `${BASE_URL}/participants/${id}/`,
  },
  checkins: {
    list: `${BASE_URL}/checkins/`,
    add: `${BASE_URL}/checkins/`,
    verify: `${BASE_URL}/verify-sign-in`,
  },
  tenants: {
    list: `${BASE_URL}/tenants`,
    create: `${BASE_URL}/tenants`,
    detail: (id: number) => `${BASE_URL}/tenants/${id}`,
    update: (id: number) => `${BASE_URL}/tenants/${id}`,
    stats: (id: number) => `${BASE_URL}/tenants/${id}/stats`,
  },
} as const;

export interface ApiResponse<T> {
  data?: T;
  detail?: string;
  error?: string;
  message?: string;
}

interface ApiValidationErrorItem {
  type?: string;
  loc?: Array<string | number>;
  msg?: string;
  input?: unknown;
}

function isValidationErrorItem(value: unknown): value is ApiValidationErrorItem {
  return typeof value === 'object' && value !== null;
}

export function formatApiError(errorPayload: unknown, fallback: string): string {
  if (typeof errorPayload === 'string' && errorPayload.trim()) {
    return errorPayload;
  }

  if (Array.isArray(errorPayload)) {
    const messages = errorPayload
      .filter(isValidationErrorItem)
      .map((item) => {
        const message = typeof item.msg === 'string' ? item.msg : '';
        const location = Array.isArray(item.loc)
          ? item.loc
            .filter((segment) => typeof segment === 'string' || typeof segment === 'number')
            .join('.')
          : '';

        if (location && message) {
          return `${location}: ${message}`;
        }

        return message || '';
      })
      .filter(Boolean);

    if (messages.length > 0) {
      return messages.join('；');
    }
  }

  if (typeof errorPayload === 'object' && errorPayload !== null) {
    const payload = errorPayload as Record<string, unknown>;

    if (typeof payload.message === 'string' && payload.message.trim()) {
      return payload.message;
    }

    if (typeof payload.detail === 'string' && payload.detail.trim()) {
      return payload.detail;
    }
  }

  return fallback;
}

export function formatNetworkError(error: unknown): string {
  if (!(error instanceof Error)) {
    return `网络请求异常，${getConfigHint()}`;
  }

  if (error.message === 'Failed to fetch') {
    return `网络连接失败（Failed to fetch），${getConfigHint()}。若使用浏览器插件，请先用无痕模式验证是否为插件拦截。`;
  }

  return error.message;
}

export const apiRequest = async <T>(
  url: string,
  options: RequestInit = {},
): Promise<ApiResponse<T>> => {
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  try {
    const response = await fetch(url, {
      ...options,
      headers,
      credentials: 'include',
    });

    const text = await response.text();
    const payload = text ? JSON.parse(text) : null;

    if (!response.ok) {
      throw new Error(formatApiError(payload?.detail ?? payload?.message ?? payload, '请求失败'));
    }

    return { data: payload as T };
  } catch (error) {
    return {
      error: formatNetworkError(error),
    };
  }
};

export interface LoginResponseData {
  access_token?: string;
  user: { id: number; name: string | null; phone: string | null };
  tenant: { id: number; name: string; code: string } | null;
  auth: {
    is_admin: boolean;
    is_platform_admin: boolean;
    is_super_admin: boolean;
    permissions: string[];
    activity_types: { id: number; name: string; code: string | null }[];
    must_reset_password: boolean;
  };
}

export const authMeApi = async (): Promise<ApiResponse<LoginResponseData>> => {
  return apiRequest<LoginResponseData>(API_PATHS.auth.me, { method: 'GET' });
};

export const loginApi = async (
  identifier: string,
  password: string,
  tenantCode: string = 'default',
): Promise<ApiResponse<LoginResponseData>> => {
  try {
    const response = await fetch(API_PATHS.auth.login, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ identifier, password, tenant_code: tenantCode }),
    });
    const data = await response.json();

    if (!response.ok) {
      return { error: formatApiError(data?.detail ?? data?.message ?? data, '登录失败') };
    }

    return { data };
  } catch (error) {
    return { error: formatNetworkError(error) };
  }
};

export const logoutApi = async (): Promise<ApiResponse<{ status: string; message: string }>> => {
  return apiRequest(API_PATHS.auth.logout, { method: 'POST' });
};
