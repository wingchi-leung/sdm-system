/**
 * 管理员 Token 存储（localStorage），用于 API 鉴权
 */
const TOKEN_KEY = 'admin_token';
const TENANT_ID_KEY = 'tenant_id';
const TENANT_NAME_KEY = 'tenant_name';
const AUTH_ROLE_KEY = 'auth_role';

export type AuthRole = 'admin' | 'platform_admin';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(TENANT_ID_KEY);
  localStorage.removeItem(TENANT_NAME_KEY);
  localStorage.removeItem(AUTH_ROLE_KEY);
}

export function isAuthenticated(): boolean {
  return !!getToken();
}

export function getTenantId(): number | null {
  const id = localStorage.getItem(TENANT_ID_KEY);
  return id ? parseInt(id, 10) : null;
}

export function setTenantId(id: number): void {
  localStorage.setItem(TENANT_ID_KEY, String(id));
}

export function getTenantName(): string | null {
  return localStorage.getItem(TENANT_NAME_KEY);
}

export function setTenantName(name: string): void {
  localStorage.setItem(TENANT_NAME_KEY, name);
}

export function clearTenantContext(): void {
  localStorage.removeItem(TENANT_ID_KEY);
  localStorage.removeItem(TENANT_NAME_KEY);
}

export function getAuthRole(): AuthRole {
  return localStorage.getItem(AUTH_ROLE_KEY) === 'platform_admin' ? 'platform_admin' : 'admin';
}

export function setAuthRole(role: AuthRole): void {
  localStorage.setItem(AUTH_ROLE_KEY, role);
}
