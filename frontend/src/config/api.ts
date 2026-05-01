import { getToken } from '../lib/auth';

const BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000/api/v1';
const STATIC_BASE_URL = process.env.REACT_APP_STATIC_URL || 'http://localhost:8000';

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
    setPassword: `${BASE_URL}/auth/set-password`,
    setAdminPassword: `${BASE_URL}/auth/set-admin-password`,
    me: `${BASE_URL}/auth/me`,
  },
  users: {
    list: `${BASE_URL}/users`,
    create: `${BASE_URL}/users/create`,
    detail: (id: number) => `${BASE_URL}/users/${id}`,
    adminAll: `${BASE_URL}/users/admin/all`,
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
  activities: {
    create: `${BASE_URL}/activities`,
    list: `${BASE_URL}/activities`,
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
    list: `${BASE_URL}/checkins`,
    add: `${BASE_URL}/checkins`,
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

export const apiRequest = async <T>(
  url: string,
  options: RequestInit = {},
): Promise<ApiResponse<T>> => {
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  const token = getToken();
  if (token) {
    (headers as Record<string, string>).Authorization = `Bearer ${token}`;
  }

  try {
    const response = await fetch(url, {
      ...options,
      headers,
    });

    const text = await response.text();
    const payload = text ? JSON.parse(text) : null;

    if (!response.ok) {
      throw new Error(payload?.detail || payload?.message || '请求失败');
    }

    return { data: payload as T };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : '网络请求异常',
    };
  }
};

export interface LoginResponseData {
  access_token: string;
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

export const loginApi = async (
  identifier: string,
  password: string,
  tenantCode: string = 'default',
): Promise<ApiResponse<LoginResponseData>> => {
  try {
    const response = await fetch(API_PATHS.auth.login, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier, password, tenant_code: tenantCode }),
    });
    const data = await response.json();

    if (!response.ok) {
      return { error: data.detail || '登录失败' };
    }

    return { data };
  } catch (error) {
    return { error: error instanceof Error ? error.message : '网络错误' };
  }
};
