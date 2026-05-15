import React, { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { authMeApi } from '../config/api';
import { clearToken, isAuthenticated } from '../lib/auth';

/**
 * 需要管理员登录才能访问的页面包装器；未登录时跳转到 /login?redirect=当前路径
 */
const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const location = useLocation();
  const [validating, setValidating] = useState(true);
  const [authorized, setAuthorized] = useState(false);

  useEffect(() => {
    let mounted = true;

    const validateSession = async () => {
      if (!isAuthenticated()) {
        if (mounted) {
          setAuthorized(false);
          setValidating(false);
        }
        return;
      }

      try {
        const result = await authMeApi();
        if (!mounted) {
          return;
        }
        if (result.error || !result.data?.auth) {
          clearToken();
          setAuthorized(false);
        } else {
          setAuthorized(true);
        }
      } catch {
        if (!mounted) {
          return;
        }
        clearToken();
        setAuthorized(false);
      } finally {
        if (mounted) {
          setValidating(false);
        }
      }
    };

    void validateSession();
    return () => {
      mounted = false;
    };
  }, []);

  if (validating) {
    return null;
  }
  if (!authorized) {
    const redirect = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?redirect=${redirect}`} replace />;
  }
  return <>{children}</>;
};

export default ProtectedRoute;
