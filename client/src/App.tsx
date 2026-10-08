import React, { useState, useEffect, useCallback } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './layouts/Layout';
import Dashboard from './pages/Dashboard';
import Outsourcing from './pages/Outsourcing';
import Payroll from './pages/Payroll';
import Attendance from './pages/Attendance';
import HRHub from './pages/HRHub';
import EmployeeDirectory from './pages/EmployeeDirectory';
import LeaveManagement from './pages/LeaveManagement';
import UserManagement from './pages/UserManagement';
import Profile from './pages/Profile';
import Support from './pages/Support';
import Login from './pages/Login';
import Signup from './pages/Signup';
import ForgotPassword from './pages/ForgotPassword';
import type { User } from './types';
import { getToken, setToken, clearToken, UNAUTHORIZED_EVENT } from './lib/api';

function App() {
  const [user, setUser] = useState<User | null>(() => {
    const savedUser = sessionStorage.getItem('user');
    // A stored user without a token cannot call the API, so treat it as logged out
    return savedUser && getToken() ? JSON.parse(savedUser) : null;
  });

  const INACTIVITY_LIMIT = 15 * 60 * 1000; // 15 minutes

  const handleLogout = useCallback(() => {
    setUser(null);
    clearToken();
    sessionStorage.removeItem('user');
    sessionStorage.removeItem('lastActivity');
  }, []);

  const handleLogin = (userData: User, token: string) => {
    setToken(token);
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

  return (
    <Router>
      <Routes>
        {/* Auth Routes */}
        <Route path="/login" element={<Login onLogin={handleLogin} />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />

        {/* Protected App Routes */}
        <Route 
          path="/*" 
          element={
            user ? (
              <Layout user={user} onLogout={handleLogout}>
                <Routes>
                  <Route path="/" element={<Dashboard user={user} />} />
                  <Route path="/outsourcing" element={isAdmin ? <Outsourcing user={user} /> : <Navigate to="/" replace />} />
                  <Route path="/payroll" element={isAdmin ? <Payroll user={user} /> : <Navigate to="/" replace />} />
                  <Route path="/attendance" element={<Attendance user={user} />} />
                  <Route path="/hr-hub" element={<HRHub user={user} />} />
                  <Route path="/directory" element={<EmployeeDirectory user={user} />} />
                  <Route path="/leave" element={<LeaveManagement user={user} />} />
                  <Route path="/profile" element={<Profile user={user} onUserUpdate={handleUserUpdate} />} />
                  <Route path="/support" element={<Support user={user} />} />
                  <Route path="/settings" element={user.role === 'SUPER_ADMIN' ? <UserManagement /> : <Navigate to="/" replace />} />
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
              </Layout>
            ) : (
              <Navigate to="/login" />
            )
          } 
        />
      </Routes>
    </Router>
  );
}

export default App;
