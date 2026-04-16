import { render, screen } from '@testing-library/react';
import App from './App';

test('renders login form', () => {
  window.history.pushState({}, 'Test page', '/login');
  render(<App />);
  expect(screen.getByText('管理员登录')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '登录后台' })).toBeInTheDocument();
});
