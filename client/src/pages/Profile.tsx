import React, { useState } from 'react';
import { User, Mail, Lock, Save, Camera, Shield, Bell, Key } from 'lucide-react';

const Profile = ({ user }) => {
  const [formData, setFormData] = useState({
    name: user?.name || '',
    email: user?.email || '',
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });

  const [status, setStatus] = useState({ type: '', message: '' });

  const handleSubmit = (e) => {
    e.preventDefault();
    setStatus({ type: 'success', message: 'Profile updated successfully!' });
    setTimeout(() => setStatus({ type: '', message: '' }), 3000);
  };

  return (
    <div className="max-w-5xl mx-auto space-y-10">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight">Settings</h1>
          <p className="text-slate-500 text-sm mt-1">Manage your personal information, security, and notification preferences.</p>
        </div>
      </div>

      {status.message && (
        <div className={`p-4 rounded-2xl border ${
          status.type === 'success' ? 'bg-emerald-50 border-emerald-100 text-emerald-700' : 'bg-rose-50 border-rose-100 text-rose-700'
        } animate-in fade-in slide-in-from-top-2 flex items-center shadow-sm`}>
          <Save size={18} className="mr-3" />
          <span className="font-bold text-sm">{status.message}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm text-center relative overflow-hidden group">
            <div className="absolute top-0 inset-x-0 h-1.5 bg-cyan-600"></div>
            <div className="relative inline-block mt-4">
              <div className="w-28 h-28 rounded-3xl bg-cyan-50 flex items-center justify-center text-cyan-700 text-4xl font-black border-4 border-white shadow-xl mx-auto group-hover:scale-105 transition-transform duration-500">
                {formData.name.substring(0, 2).toUpperCase()}
              </div>
              <button className="absolute -bottom-2 -right-2 p-2.5 bg-slate-900 text-white rounded-2xl border-4 border-white shadow-lg hover:bg-slate-800 transition-all hover:scale-110">
                <Camera size={18} />
              </button>
            </div>
            <h3 className="mt-6 text-xl font-black text-slate-900 tracking-tight">{formData.name}</h3>
            <div className="inline-flex items-center px-3 py-1 bg-cyan-50 text-cyan-700 rounded-lg text-[10px] font-black uppercase tracking-widest mt-2 border border-cyan-100">
              {user?.role?.replace('_', ' ')}
            </div>
          </div>

          <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
            <h4 className="font-black text-[10px] text-slate-400 uppercase tracking-widest mb-6">Preferences</h4>
            <div className="space-y-2">
              <button className="w-full flex items-center gap-3 px-4 py-3 text-sm font-black text-cyan-600 bg-cyan-50 rounded-2xl border border-cyan-100">
                <User size={18} />
                Profile Info
              </button>
              <button className="w-full flex items-center gap-3 px-4 py-3 text-sm font-bold text-slate-500 hover:bg-slate-50 rounded-2xl transition-all border border-transparent hover:border-slate-100">
                <Bell size={18} />
                Notifications
              </button>
              <button className="w-full flex items-center gap-3 px-4 py-3 text-sm font-bold text-slate-500 hover:bg-slate-50 rounded-2xl transition-all border border-transparent hover:border-slate-100">
                <Shield size={18} />
                Security
              </button>
            </div>
          </div>
        </div>

        <div className="lg:col-span-2 space-y-8">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-8 py-5 border-b border-slate-100 bg-slate-50/30">
              <h3 className="font-black text-slate-900 tracking-tight">Personal Details</h3>
            </div>
            <form onSubmit={handleSubmit} className="p-8 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Full Name</label>
                  <div className="relative">
                    <User className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={18} />
                    <input 
                      type="text" 
                      className="w-full pl-12 pr-5 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/20 focus:bg-white transition-all font-medium"
                      value={formData.name}
                      onChange={(e) => setFormData({...formData, name: e.target.value})}
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Email Address</label>
                  <div className="relative">
                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={18} />
                    <input 
                      type="email" 
                      className="w-full pl-12 pr-5 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/20 focus:bg-white transition-all font-medium"
                      value={formData.email}
                      onChange={(e) => setFormData({...formData, email: e.target.value})}
                    />
                  </div>
                </div>
              </div>

              <div className="pt-8 border-t border-slate-100">
                <div className="flex items-center gap-2 mb-6">
                  <Key size={18} className="text-cyan-600" />
                  <h3 className="font-black text-slate-900 tracking-tight">Security & Password</h3>
                </div>
                <div className="space-y-6">
                  <div>
                    <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Current Password</label>
                    <div className="relative">
                      <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={18} />
                      <input 
                        type="password" 
                        className="w-full pl-12 pr-5 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/20 focus:bg-white transition-all font-medium"
                        placeholder="••••••••"
                        value={formData.currentPassword}
                        onChange={(e) => setFormData({...formData, currentPassword: e.target.value})}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">New Password</label>
                      <input 
                        type="password" 
                        className="w-full px-5 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/20 focus:bg-white transition-all font-medium"
                        placeholder="••••••••"
                        value={formData.newPassword}
                        onChange={(e) => setFormData({...formData, newPassword: e.target.value})}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Confirm New Password</label>
                      <input 
                        type="password" 
                        className="w-full px-5 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/20 focus:bg-white transition-all font-medium"
                        placeholder="••••••••"
                        value={formData.confirmPassword}
                        onChange={(e) => setFormData({...formData, confirmPassword: e.target.value})}
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex justify-end pt-4">
                <button type="submit" className="flex items-center gap-2 px-8 py-3 bg-slate-900 text-white rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-slate-800 transition-all shadow-xl active:scale-95">
                  <Save size={18} />
                  Update Profile
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Profile;
