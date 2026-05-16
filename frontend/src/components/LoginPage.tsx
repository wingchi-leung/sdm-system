import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AlertTriangle, LockKeyhole, UserCircle2 } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from './ui/alert';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Input } from './ui/input';
import { authMeApi, isUnsafeApiUrl, loginApi } from '../config/api';
import {
  clearToken,
  clearTenantContext,
  isAuthenticated,
  isPlatformAdmin,
  setAuthInfo,
  setTenantInfo,
} from '../lib/auth';

const LoginPage = () => {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [tenantCode, setTenantCode] = useState('default');
  const [loginMode, setLoginMode] = useState<'tenant' | 'platform'>('tenant');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirectTo = searchParams.get('redirect') || '/dashboard';

  useEffect(() => {
    let mounted = true;
    const checkSession = async () => {
      if (!isAuthenticated()) {
        return;
      }
      const result = await authMeApi();
      if (!mounted) {
        return;
      }
      if (result.error || !result.data?.auth) {
        clearToken();
        return;
      }
      navigate(isPlatformAdmin() ? '/tenants' : redirectTo, { replace: true });
    };
    void checkSession();
    return () => {
      mounted = false;
    };
  }, [navigate, redirectTo]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    if (!identifier.trim() || !password) {
      setError('请输入用户名和密码');
      return;
    }

    setLoading(true);
    const tc = loginMode === 'platform' ? 'platform' : (tenantCode.trim() || 'default');
    const result = await loginApi(identifier.trim(), password, tc);
    setLoading(false);

    if (result.error) {
      clearToken();
      setError(result.error);
      return;
    }

    const data = result.data!;
    setTenantInfo(data.tenant);
    setAuthInfo({
      is_admin: data.auth.is_admin,
      is_platform_admin: data.auth.is_platform_admin,
      is_super_admin: data.auth.is_super_admin,
      permissions: data.auth.permissions,
      must_reset_password: data.auth.must_reset_password,
    });

    if (data.auth.is_platform_admin) {
      clearTenantContext();
      navigate('/tenants', { replace: true });
      return;
    }

    if (data.auth.must_reset_password) {
      navigate('/change-password', { replace: true });
      return;
    }

    navigate(redirectTo, { replace: true });
  };

  const unsafe = isUnsafeApiUrl();

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 via-blue-50/30 to-slate-100 p-4">
      <div className="grid w-full max-w-5xl gap-8 lg:grid-cols-[1fr_1.2fr]">
        {/* Left Panel - Branding */}
        <div className="hidden lg:flex flex-col justify-center rounded-3xl bg-gradient-to-br from-primary to-blue-600 p-10 text-white shadow-2xl">
          <div className="space-y-6">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.3em] text-blue-200">SDM System</p>
              <h2 className="mt-4 text-4xl font-bold tracking-tight font-display">智能活动管理</h2>
              <p className="mt-3 text-lg text-blue-100 leading-relaxed">高效、安全、可扩展的现代化管理系统</p>
            </div>

            <div className="grid gap-4 pt-4">
              <div className="flex items-center gap-4 rounded-2xl bg-white/10 p-4 backdrop-blur-sm">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/20">
                  <UserCircle2 className="h-6 w-6" />
                </div>
                <div>
                  <p className="font-semibold">统一身份认证</p>
                  <p className="text-sm text-blue-200">多租户安全登录</p>
                </div>
              </div>
              <div className="flex items-center gap-4 rounded-2xl bg-white/10 p-4 backdrop-blur-sm">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/20">
                  <LockKeyhole className="h-6 w-6" />
                </div>
                <div>
                  <p className="font-semibold">RBAC 权限控制</p>
                  <p className="text-sm text-blue-200">细粒度权限管理</p>
                </div>
              </div>
              <div className="flex items-center gap-4 rounded-2xl bg-white/10 p-4 backdrop-blur-sm">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/20">
                  <AlertTriangle className="h-6 w-6" />
                </div>
                <div>
                  <p className="font-semibold">数据安全隔离</p>
                  <p className="text-sm text-blue-200">租户级数据保护</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Panel - Login Form */}
        <Card className="border-border/60 bg-white shadow-xl">
          <CardHeader className="space-y-1 p-8 pb-4">
            <CardTitle className="text-2xl font-bold">管理员登录</CardTitle>
            <p className="text-sm text-muted-foreground">输入您的凭据以访问管理后台</p>
          </CardHeader>
          <CardContent className="space-y-5 p-8 pt-4">
            {unsafe ? (
              <Alert variant="destructive" className="rounded-lg">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>安全提示</AlertTitle>
                <AlertDescription>当前 API 使用 HTTP 且非本地地址，生产环境建议切换到 HTTPS。</AlertDescription>
              </Alert>
            ) : null}

            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Login Mode Toggle */}
              <div className="grid grid-cols-2 rounded-xl bg-slate-100 p-1">
                <button
                  type="button"
                  onClick={() => setLoginMode('tenant')}
                  className={`rounded-lg px-4 py-2.5 text-sm font-semibold transition-all duration-200 ${
                    loginMode === 'tenant'
                      ? 'bg-white text-foreground shadow-md'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                  disabled={loading}
                >
                  租户管理员
                </button>
                <button
                  type="button"
                  onClick={() => setLoginMode('platform')}
                  className={`rounded-lg px-4 py-2.5 text-sm font-semibold transition-all duration-200 ${
                    loginMode === 'platform'
                      ? 'bg-white text-foreground shadow-md'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                  disabled={loading}
                >
                  平台管理员
                </button>
              </div>

              {loginMode === 'tenant' ? (
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">租户编码</label>
                  <Input
                    value={tenantCode}
                    onChange={(e) => setTenantCode(e.target.value)}
                    placeholder="默认 default"
                    disabled={loading}
                    className="rounded-lg"
                  />
                </div>
              ) : null}

              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">用户名</label>
                <Input
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder="请输入用户名"
                  autoComplete="username"
                  disabled={loading}
                  className="rounded-lg"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">密码</label>
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="请输入密码"
                  autoComplete="current-password"
                  disabled={loading}
                  className="rounded-lg"
                />
              </div>

              {error ? (
                <p className="text-sm text-destructive font-medium">{error}</p>
              ) : null}

              <Button
                type="submit"
                className="w-full rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 shadow-lg shadow-primary/25"
                disabled={loading}
              >
                {loading ? '登录中...' : '登录后台'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default LoginPage;