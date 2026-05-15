import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import ProtectedRoute from './ProtectedRoute';

describe('ProtectedRoute', () => {
  afterEach(() => {
    localStorage.clear();
    jest.restoreAllMocks();
  });

  test('后端会话失效时应清理本地状态并跳转到登录页', async () => {
    localStorage.setItem('auth_info', JSON.stringify({
      is_admin: true,
      is_platform_admin: false,
      is_super_admin: false,
      permissions: [],
      must_reset_password: false,
    }));

    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      text: async () => JSON.stringify({ detail: '未登录' }),
    }) as unknown as typeof fetch;

    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <Routes>
          <Route
            path="/dashboard"
            element={(
              <ProtectedRoute>
                <div>私有页面</div>
              </ProtectedRoute>
            )}
          />
          <Route path="/login" element={<div>登录页</div>} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText('登录页')).toBeInTheDocument();
    });
    expect(localStorage.getItem('auth_info')).toBeNull();
  });
});
