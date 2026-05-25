import React, { useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './layouts/Layout';
import Dashboard from './pages/Dashboard';
import Outsourcing from './pages/Outsourcing';
import Payroll from './pages/Payroll';
import Attendance from './pages/Attendance';
import HRHub from './pages/HRHub';
import UserManagement from './pages/UserManagement';
import Profile from './pages/Profile';
import Support from './pages/Support';
import Login from './pages/Login';
import Signup from './pages/Signup';
import ForgotPassword from './pages/ForgotPassword';

function App() {
  const [user, setUser] = useState(null);

  return (
    <Router>
      <Routes>
        {/* Auth Routes */}
        <Route path="/login" element={<Login onLogin={(userData) => setUser(userData)} />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />

        {/* Protected App Routes */}
        <Route 
          path="/*" 
          element={
            user ? (
              <Layout user={user} onLogout={() => setUser(null)}>
                <Routes>
                  <Route path="/" element={<Dashboard user={user} />} />
                  <Route path="/outsourcing" element={<Outsourcing user={user} />} />
                  <Route path="/payroll" element={<Payroll user={user} />} />
                  <Route path="/attendance" element={<Attendance user={user} />} />
                  <Route path="/hr-hub" element={<HRHub user={user} />} />
                  <Route path="/profile" element={<Profile user={user} />} />
                  <Route path="/support" element={<Support />} />
                  <Route path="/products" element={<div className="p-6 bg-white rounded-xl shadow-sm border border-slate-200"><h1 className="text-2xl font-bold">Product Development</h1><p className="mt-4 text-slate-600">This module is coming soon...</p></div>} />
                  <Route path="/settings" element={<UserManagement />} />
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
