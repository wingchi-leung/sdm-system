// src/config/api.ts

import { getToken } from '../lib/auth';

const BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000/api/v1';
// 静态资源基础URL（用于图片等）
const STATIC_BASE_URL = process.env.REACT_APP_STATIC_URL || 'http://localhost:8000';

/** 获取完整的图片URL，处理相对路径和完整URL */
export function getImageUrl(url: string | null | undefined): string {
  if (!url) return '';
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return url;
  }
  return STATIC_BASE_URL + (url.startsWith('/') ? url : '/' + url);
}

/** 当前 API 是否为非加密的 http 且非本地（用于登录前安全提示） */
export function isUnsafeApiUrl(): boolean {
  try {
    const u = new URL(BASE_URL);
    if (u.protocol !== 'http:') return false;
    const host = u.hostname.toLowerCase();
    return host !== 'localhost' && host !== '127.0.0.1';
  } catch {
    return false;
  }
}

export const API_PATHS = {
  auth: {
    login: `${BASE_URL}/auth/login`,
  },
  // User related endpoints
  users: {
    list: `${BASE_URL}/users`,
    create: `${BASE_URL}/users`,
    update: (id: number) => `${BASE_URL}/user/${id}`,
    delete: (id: number) => `${BASE_URL}/user/${id}`,
  },
  
// Activity related endpoints
  activities: {
    create: `${BASE_URL}/activities`,
    list: `${BASE_URL}/activities`,
    detail: (id: number) => `${BASE_URL}/activities/${id}`,
    update: (id: number) => `${BASE_URL}/activities/${id}`,
    delete: (id: number) => `${BASE_URL}/activities/${id}`,
    unstart: `${BASE_URL}/activities/unstarted`,
    participants: (id: number) => `${BASE_URL}/participants/${id}`,
  },

// Sign-in related endpoints
  checkins: {
    list: `${BASE_URL}/checkins`,
    add: `${BASE_URL}/checkins`,
    verify: `${BASE_URL}/verify-sign-in`,
  },
} as const;

// Type for API response
export interface ApiResponse<T> {
  data?: T;
  detail?:string;
  error?: string;
  message?: string;
}

// API request helper（自动附带管理员 Token）
export const apiRequest = async <T>(
  url: string, 
  options: RequestInit = {}
): Promise<ApiResponse<T>> => {
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };
  const token = getToken();
  if (token) {
    (headers as Record<string, string>)['Authorization'] = `Bearer ${token}`;
  }
  try {
    const response = await fetch(url, {
      ...options,
      headers,
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.detail || 'An error occurred');
    }
    
    return { data };
  } catch (error) {
    return { 
      error: error instanceof Error ? error.message : 'An error occurred' 
    };
  }
};

/** 管理员登录（不附带 Token），成功返回 access_token */
export const loginApi = async (
  username: string,
  password: string,
  tenantCode: string = 'default'
): Promise<ApiResponse<{ access_token: string; tenant_id: number; tenant_name: string }>> => {
  try {
    const response = await fetch(API_PATHS.auth.login, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password, tenant_code: tenantCode }),
    });
    const data = await response.json();
    if (!response.ok) {
      return { error: data.detail || '登录失败' };
    }
    return { data: { 
      access_token: data.access_token,
      tenant_id: data.tenant_id,
      tenant_name: data.tenant_name
    } };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : '网络错误',
    };
  }
};