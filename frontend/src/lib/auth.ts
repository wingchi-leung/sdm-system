/**
 * 认证状态管理（localStorage）
 */
const TOKEN_KEY = 'admin_token';
const TENANT_KEY = 'tenant_info';
const AUTH_KEY = 'auth_info';

export interface TenantInfo {
  id: number;
  name: string;
  code: string;
}

export interface AuthInfo {
  is_admin: boolean;
  is_platform_admin: boolean;
  is_super_admin: boolean;
  permissions: string[];
  must_reset_password: boolean;
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(TENANT_KEY);
  localStorage.removeItem(AUTH_KEY);
}

export function isAuthenticated(): boolean {
  return !!getToken();
}

export function getTenantInfo(): TenantInfo | null {
  const stored = localStorage.getItem(TENANT_KEY);
  return stored ? JSON.parse(stored) : null;
}

export function setTenantInfo(info: TenantInfo | null): void {
  if (info) {
    localStorage.setItem(TENANT_KEY, JSON.stringify(info));
  } else {
    localStorage.removeItem(TENANT_KEY);
  }
}

export function getTenantId(): number | null {
  return getTenantInfo()?.id ?? null;
}

export function getTenantName(): string | null {
  return getTenantInfo()?.name ?? null;
}

export function getAuthInfo(): AuthInfo | null {
  const stored = localStorage.getItem(AUTH_KEY);
  return stored ? JSON.parse(stored) : null;
}

export function setAuthInfo(info: AuthInfo): void {
  localStorage.setItem(AUTH_KEY, JSON.stringify(info));
}

export function getPermissions(): string[] {
  return getAuthInfo()?.permissions ?? [];
}

export function getIsSuperAdmin(): boolean {
  return getAuthInfo()?.is_super_admin ?? false;
}

export function isPlatformAdmin(): boolean {
  return getAuthInfo()?.is_platform_admin ?? false;
}

export function isAdmin(): boolean {
  return getAuthInfo()?.is_admin ?? false;
}

// 向后兼容
export type AuthRole = 'admin' | 'platform_admin';
export function getAuthRole(): AuthRole {
  return isPlatformAdmin() ? 'platform_admin' : 'admin';
}
export function setTenantId(id: number): void {
  const info = getTenantInfo();
  setTenantInfo(info ? { ...info, id } : { id, name: '', code: '' });
}
export function setTenantName(name: string): void {
  const info = getTenantInfo();
  setTenantInfo(info ? { ...info, name } : { id: 0, name, code: '' });
}
export function clearTenantContext(): void {
  localStorage.removeItem(TENANT_KEY);
}
export function setAuthRole(_role: AuthRole): void { /* no-op, derived from auth info */ }
export function setPermissions(permissions: string[]): void {
  const info = getAuthInfo();
  if (info) setAuthInfo({ ...info, permissions });
}
export function setIsSuperAdmin(value: boolean): void {
  const info = getAuthInfo();
  if (info) setAuthInfo({ ...info, is_super_admin: value });
}
