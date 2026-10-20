import React, { Suspense, lazy, useState, useEffect, useCallback } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './layouts/Layout';
import { Spinner } from './components/ui';
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Outsourcing = lazy(() => import('./pages/Outsourcing'));
const Payroll = lazy(() => import('./pages/Payroll'));
const Compliance = lazy(() => import('./pages/Compliance'));
const Employers = lazy(() => import('./pages/Employers'));
const Attendance = lazy(() => import('./pages/Attendance'));
const HRHub = lazy(() => import('./pages/HRHub'));
const EmployeeDirectory = lazy(() => import('./pages/EmployeeDirectory'));
const LeaveManagement = lazy(() => import('./pages/LeaveManagement'));
const UserManagement = lazy(() => import('./pages/UserManagement'));
const Profile = lazy(() => import('./pages/Profile'));
const Support = lazy(() => import('./pages/Support'));
import Login from './pages/Login';
import SsoCallback from './pages/SsoCallback';
const Signup = lazy(() => import('./pages/Signup'));
const ForgotPassword = lazy(() => import('./pages/ForgotPassword'));
const Payslips = lazy(() => import('./pages/Payslips'));
const Expenses = lazy(() => import('./pages/Expenses'));
const Performance = lazy(() => import('./pages/Performance'));
const Onboarding = lazy(() => import('./pages/Onboarding'));
const Recruitment = lazy(() => import('./pages/Recruitment'));
const Offboarding = lazy(() => import('./pages/Offboarding'));
const Reports = lazy(() => import('./pages/Reports'));
const Announcements = lazy(() => import('./pages/Announcements'));
const Notifications = lazy(() => import('./pages/Notifications'));
const Preferences = lazy(() => import('./pages/Preferences'));
const AuditLog = lazy(() => import('./pages/AuditLog'));
const CompanySettings = lazy(() => import('./pages/CompanySettings'));
const DeleteRequests = lazy(() => import('./pages/DeleteRequests'));
const Companies = lazy(() => import('./pages/platform/Companies'));
const PlatformRequests = lazy(() => import('./pages/platform/PlatformRequests'));
const PlatformAudit = lazy(() => import('./pages/platform/PlatformAudit'));
import type { User } from './types';
import { getToken, setSession, clearToken, apiFetch, UNAUTHORIZED_EVENT } from './lib/api';
import { I18nProvider } from './lib/i18n';

function App() {
  const [user, setUser] = useState<User | null>(() => {
    const savedUser = sessionStorage.getItem('user');
    // A stored user without a token cannot call the API, so treat it as logged out
    return savedUser && getToken() ? JSON.parse(savedUser) : null;
  });

  const INACTIVITY_LIMIT = 15 * 60 * 1000; // 15 minutes

  const handleLogout = useCallback(() => {
    // Best effort: tell the server to end this device's session before dropping the tokens
    if (getToken()) apiFetch('/auth/logout', { method: 'POST' }).catch(() => undefined);
    setUser(null);
    clearToken();
    sessionStorage.removeItem('user');
    sessionStorage.removeItem('lastActivity');
  }, []);

  const handleLogin = (userData: User, token: string, refreshToken?: string) => {
    setSession(token, refreshToken);
    setUser(userData);
    sessionStorage.setItem('user', JSON.stringify(userData));
    sessionStorage.setItem('lastActivity', Date.now().toString());
  };

  const handleUserUpdate = (userData: User) => {
    setUser(userData);
    sessionStorage.setItem('user', JSON.stringify(userData));
  };

  // Any protected API call that comes back 401 (expired/invalid token) ends the session
  useEffect(() => {
    const onUnauthorized = () => handleLogout();
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
  }, [handleLogout]);

  useEffect(() => {
    if (!user) return;

    const checkInactivity = () => {
      const lastActivity = parseInt(sessionStorage.getItem('lastActivity') || '0');
      const now = Date.now();
      
      if (now - lastActivity > INACTIVITY_LIMIT) {
        handleLogout();
        alert('You have been logged out due to inactivity.');
      }
    };

    const updateActivity = () => {
      sessionStorage.setItem('lastActivity', Date.now().toString());
    };

    // Events that count as activity
    const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart'];
    events.forEach(event => window.addEventListener(event, updateActivity));

    // Initial activity update on login/refresh
    updateActivity();

    // Check for inactivity every 30 seconds
    const interval = setInterval(checkInactivity, 30000);

    return () => {
      events.forEach(event => window.removeEventListener(event, updateActivity));
      clearInterval(interval);
    };
  }, [user, handleLogout]);

  const isAdmin = user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN';
  // The platform owner's account manages companies and has no workspace of its own
  const isPlatform = user?.role === 'PLATFORM_ADMIN';

  return (
    <I18nProvider initial={user?.preferences?.language}>
    <Router>
      <Suspense fallback={<Spinner />}>
      <Routes>
        {/* Auth Routes */}
        <Route path="/login" element={<Login onLogin={handleLogin} />} />
        <Route path="/sso/callback" element={<SsoCallback onLogin={handleLogin} />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />

        {/* Protected App Routes */}
        <Route 
          path="/*" 
          element={
            user ? (
              <Layout user={user} onLogout={handleLogout}>
                {isPlatform ? (
                <Routes>
                  <Route path="/platform" element={<Companies />} />
                  <Route path="/platform/requests" element={<PlatformRequests />} />
                  <Route path="/platform/audit" element={<PlatformAudit />} />
                  <Route path="/profile" element={<Profile user={user} onUserUpdate={handleUserUpdate} />} />
                  <Route path="/preferences" element={<Preferences user={user} onUserUpdate={handleUserUpdate} onLogout={handleLogout} />} />
                  <Route path="*" element={<Navigate to="/platform" replace />} />
                </Routes>
                ) : (
                <Routes>
                  <Route path="/" element={<Dashboard user={user} />} />
                  <Route path="/outsourcing" element={isAdmin ? <Outsourcing user={user} /> : <Navigate to="/" replace />} />
                  <Route path="/payroll" element={isAdmin ? <Payroll user={user} /> : <Navigate to="/" replace />} />
                  <Route path="/compliance" element={isAdmin ? <Compliance user={user} /> : <Navigate to="/" replace />} />
                  <Route path="/employers" element={isAdmin ? <Employers user={user} /> : <Navigate to="/" replace />} />
                  <Route path="/attendance" element={<Attendance user={user} />} />
                  <Route path="/hr-hub" element={<HRHub user={user} />} />
                  <Route path="/directory" element={<EmployeeDirectory user={user} />} />
                  <Route path="/leave" element={<LeaveManagement user={user} />} />
                  <Route path="/profile" element={<Profile user={user} onUserUpdate={handleUserUpdate} />} />
                  <Route path="/support" element={<Support user={user} />} />
                  <Route path="/payslips" element={<Payslips />} />
                  <Route path="/expenses" element={<Expenses user={user} />} />
                  <Route path="/performance" element={<Performance user={user} />} />
                  <Route path="/onboarding" element={<Onboarding user={user} />} />
                  <Route path="/recruitment" element={isAdmin ? <Recruitment user={user} /> : <Navigate to="/" replace />} />
                  <Route path="/offboarding" element={<Offboarding user={user} />} />
                  <Route path="/reports" element={isAdmin ? <Reports user={user} /> : <Navigate to="/" replace />} />
                  <Route path="/announcements" element={<Announcements user={user} />} />
                  <Route path="/notifications" element={<Notifications />} />
                  <Route path="/preferences" element={<Preferences user={user} onUserUpdate={handleUserUpdate} onLogout={handleLogout} />} />
                  <Route path="/audit" element={user.role === 'SUPER_ADMIN' ? <AuditLog /> : <Navigate to="/" replace />} />
                  <Route path="/company" element={user.role === 'SUPER_ADMIN' ? <CompanySettings /> : <Navigate to="/" replace />} />
                  <Route path="/delete-requests" element={isAdmin ? <DeleteRequests user={user} /> : <Navigate to="/" replace />} />
                  <Route path="/settings" element={user.role === 'SUPER_ADMIN' ? <UserManagement /> : <Navigate to="/" replace />} />
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
                )}
              </Layout>
            ) : (
              <Navigate to="/login" />
            )
          } 
        />
      </Routes>
      </Suspense>
    </Router>
    </I18nProvider>
  );
}

export default App;
