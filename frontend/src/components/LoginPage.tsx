import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AlertTriangle, LockKeyhole, UserCircle2 } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from './ui/alert';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Input } from './ui/input';
import { isUnsafeApiUrl, loginApi, platformLoginApi } from '../config/api';
import {
  AuthRole,
  clearTenantContext,
  getAuthRole,
  isAuthenticated,
  setAuthRole,
  setTenantId,
  setTenantName,
  setToken,
} from '../lib/auth';

const LoginPage = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [tenantCode, setTenantCode] = useState('default');
  const [loginRole, setLoginRole] = useState<AuthRole>('admin');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirectTo = searchParams.get('redirect') || '/dashboard';

  useEffect(() => {
    if (isAuthenticated()) {
      navigate(getAuthRole() === 'platform_admin' ? '/tenants' : redirectTo, { replace: true });
    }
  }, [navigate, redirectTo]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    if (!username.trim() || !password) {
      setError('请输入用户名和密码');
      return;
    }

    setLoading(true);
    const result = loginRole === 'platform_admin'
      ? await platformLoginApi(username.trim(), password)
      : await loginApi(username.trim(), password, tenantCode.trim() || 'default');
    setLoading(false);

    if (result.error) {
      setError(result.error);
      return;
    }

    if (result.data?.access_token) {
      setToken(result.data.access_token);
      setAuthRole(loginRole);
      if (loginRole === 'platform_admin') {
        clearTenantContext();
        setTenantName('平台管理员');
        navigate('/tenants', { replace: true });
        return;
      }

      if ('tenant_id' in result.data && 'tenant_name' in result.data) {
        setTenantId(result.data.tenant_id);
        setTenantName(result.data.tenant_name);
      }
      navigate(redirectTo, { replace: true });
    }
  };

  const unsafe = isUnsafeApiUrl();

  return (
    <div className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,#dff7ea_0%,#f8fafc_40%,#e2e8f0_100%)] px-4 py-10">
      <div className="grid w-full max-w-5xl gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-[32px] bg-slate-950 p-8 text-white shadow-2xl">
          <p className="text-sm uppercase tracking-[0.35em] text-emerald-300">SDM Web Console</p>
          <h1 className="mt-6 text-4xl font-semibold leading-tight">
            把零散工具页升级成
            <br />
            正式后台
          </h1>
          <p className="mt-4 max-w-xl text-sm leading-6 text-slate-300">
            本轮重点先完成工作台、活动管理和用户管理，后续再继续补权限、租户和报表中心。
          </p>

          <div className="mt-10 grid gap-4 md:grid-cols-3">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <UserCircle2 className="h-5 w-5 text-emerald-300" />
              <p className="mt-3 text-sm text-slate-300">多角色后台入口</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <LockKeyhole className="h-5 w-5 text-emerald-300" />
              <p className="mt-3 text-sm text-slate-300">管理员鉴权与权限边界</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <AlertTriangle className="h-5 w-5 text-emerald-300" />
              <p className="mt-3 text-sm text-slate-300">后续承接异常提醒与运营治理</p>
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
                <AlertDescription>
                  当前 API 使用 HTTP 且非本地地址，生产环境建议切换到 HTTPS。
                </AlertDescription>
              </Alert>
            ) : null}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 rounded-lg bg-slate-100 p-1">
                <button
                  type="button"
                  onClick={() => setLoginRole('admin')}
                  className={`rounded-md px-3 py-2 text-sm font-medium transition ${loginRole === 'admin' ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-500'}`}
                  disabled={loading}
                >
                  租户管理员
                </button>
                <button
                  type="button"
                  onClick={() => setLoginRole('platform_admin')}
                  className={`rounded-md px-3 py-2 text-sm font-medium transition ${loginRole === 'platform_admin' ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-500'}`}
                  disabled={loading}
                >
                  平台管理员
                </button>
              </div>

              {loginRole === 'admin' ? (
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">租户编码</label>
                  <Input
                    value={tenantCode}
                    onChange={(event) => setTenantCode(event.target.value)}
                    placeholder="默认 default"
                    disabled={loading}
                  />
                </div>
              ) : null}

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">用户名</label>
                <Input
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  placeholder="请输入用户名"
                  autoComplete="username"
                  disabled={loading}
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">密码</label>
                <Input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="请输入密码"
                  autoComplete="current-password"
                  disabled={loading}
                />
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
