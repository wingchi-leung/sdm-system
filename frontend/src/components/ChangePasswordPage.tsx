import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from './ui/alert';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Input } from './ui/input';
import { apiRequest, API_PATHS } from '../config/api';
import { setToken } from '../lib/auth';

const ChangePasswordPage = () => {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    if (!password || password.length < 6) {
      setError('密码长度至少6位');
      return;
    }

    if (password !== confirmPassword) {
      setError('两次输入的密码不一致');
      return;
    }

    setLoading(true);

    try {
      const response = await apiRequest(API_PATHS.auth.setPassword, {
        method: 'POST',
        body: JSON.stringify({ password }),
      });

      if (response.error) {
        throw new Error(response.error);
      }

      alert('密码修改成功，请重新登录');
      navigate('/login');
    } catch (err) {
      setError(err instanceof Error ? err.message : '密码修改失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,#dff7ea_0%,#f8fafc_40%,#e2e8f0_100%)] px-4 py-10">
      <Card className="w-full max-w-md border-white/60 bg-white/90 shadow-xl backdrop-blur">
        <CardHeader>
          <CardTitle className="text-center">设置管理员密码</CardTitle>
          <p className="mt-2 text-center text-sm text-slate-600">
            请设置您的管理员密码，修改后可用新密码登录
          </p>
        </CardHeader>
        <CardContent>
          <Alert variant="destructive" className="mb-4">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>安全提示</AlertTitle>
            <AlertDescription>使用默认密码「123456」存在安全风险，请尽快修改为复杂密码。</AlertDescription>
          </Alert>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">新密码</label>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="请输入新密码（至少6位）"
                autoFocus
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">确认密码</label>
              <Input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="请再次输入新密码"
              />
            </div>

            {error ? <p className="text-sm text-red-600">{error}</p> : null}

            <Button type="submit" className="w-full bg-slate-950 hover:bg-slate-800" disabled={loading}>
              {loading ? '提交中...' : '确认修改'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default ChangePasswordPage;