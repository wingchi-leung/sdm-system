import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AlertTriangle, LockKeyhole, UserCircle2 } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from './ui/alert';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Input } from './ui/input';
import { isUnsafeApiUrl, loginApi } from '../config/api';
import {
  clearTenantContext,
  isAuthenticated,
  isPlatformAdmin,
  setAuthInfo,
  setTenantInfo,
  setToken,
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
    if (isAuthenticated()) {
      navigate(isPlatformAdmin() ? '/tenants' : redirectTo, { replace: true });
    }
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
      setError(result.error);
      return;
    }

    const data = result.data!;
    setToken(data.access_token);
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
    <div className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,#dff7ea_0%,#f8fafc_40%,#e2e8f0_100%)] px-4 py-10">
      <div className="grid w-full max-w-5xl gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-[32px] bg-slate-950 p-8 text-white shadow-2xl">
          <p className="text-sm uppercase tracking-[0.35em] text-emerald-300">SDM Web Console</p>

          <div className="mt-10 grid gap-4 md:grid-cols-3">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <UserCircle2 className="h-5 w-5 text-emerald-300" />
              <p className="mt-3 text-sm text-slate-300">统一登录入口</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <LockKeyhole className="h-5 w-5 text-emerald-300" />
              <p className="mt-3 text-sm text-slate-300">RBAC 权限管理</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <AlertTriangle className="h-5 w-5 text-emerald-300" />
              <p className="mt-3 text-sm text-slate-300">多租户隔离</p>
            </div>
          </div>
        </div>

        <Card className="border-white/60 bg-white/90 shadow-xl backdrop-blur">
          <CardHeader>
            <CardTitle className="text-center">管理员登录</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {unsafe ? (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>安全提示</AlertTitle>
                <AlertDescription>当前 API 使用 HTTP 且非本地地址，生产环境建议切换到 HTTPS。</AlertDescription>
              </Alert>
            ) : null}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 rounded-lg bg-slate-100 p-1">
                <button type="button" onClick={() => setLoginMode('tenant')}
                  className={`rounded-md px-3 py-2 text-sm font-medium transition ${loginMode === 'tenant' ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-500'}`}
                  disabled={loading}>租户管理员</button>
                <button type="button" onClick={() => setLoginMode('platform')}
                  className={`rounded-md px-3 py-2 text-sm font-medium transition ${loginMode === 'platform' ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-500'}`}
                  disabled={loading}>平台管理员</button>
              </div>

              {loginMode === 'tenant' ? (
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">租户编码</label>
                  <Input value={tenantCode} onChange={(e) => setTenantCode(e.target.value)} placeholder="默认 default" disabled={loading} />
                </div>
              ) : null}

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">用户名</label>
                <Input value={identifier} onChange={(e) => setIdentifier(e.target.value)} placeholder="请输入用户名" autoComplete="username" disabled={loading} />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">密码</label>
                <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="请输入密码" autoComplete="current-password" disabled={loading} />
              </div>

              {error ? <p className="text-sm text-red-600">{error}</p> : null}

              <Button type="submit" className="w-full bg-slate-950 hover:bg-slate-800" disabled={loading}>
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
