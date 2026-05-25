import React, { useState, useEffect } from 'react';
import { UserPlus, Shield, User, Lock, X, Check, Search, Trash2, Key, Unlock, AlertCircle } from 'lucide-react';

const UserModal = ({ isOpen, onClose, onSave, editingUser }) => {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    role: 'USER',
    permissions: ['read']
  });

  useEffect(() => {
    if (editingUser) {
      setFormData(editingUser);
    } else {
      setFormData({
        name: '',
        email: '',
        role: 'USER',
        permissions: ['read']
      });
    }
  }, [editingUser, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave(formData);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-xl w-full max-w-md shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="text-xl font-bold text-slate-900">
            {editingUser ? 'Edit User' : 'Create New User'}
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X size={24} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Full Name</label>
            <input 
              required
              type="text" 
              className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
              value={formData.name}
              onChange={(e) => setFormData({...formData, name: e.target.value})}
              placeholder="Full Name"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Email Address</label>
            <input 
              required
              type="email" 
              className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
              value={formData.email}
              onChange={(e) => setFormData({...formData, email: e.target.value})}
              placeholder="user@yaksofts.com"
              disabled={!!editingUser}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Access Level</label>
            <select 
              className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
              value={formData.role}
              onChange={(e) => {
                const role = e.target.value;
                setFormData({
                  ...formData, 
                  role,
                  permissions: role === 'SUPER_ADMIN' ? ['all'] : role === 'ADMIN' ? ['read', 'write'] : ['read']
                });
              }}
            >
              <option value="SUPER_ADMIN">Super Admin (Full Access)</option>
              <option value="ADMIN">Admin (Custom Access)</option>
              <option value="USER">User (Read-Only)</option>
            </select>
          </div>
          
          {formData.role === 'ADMIN' && (
            <div className="space-y-2 p-3 bg-slate-50 rounded-lg border border-slate-200">
              <p className="text-xs font-bold text-slate-500 uppercase">Modify Permissions</p>
              <div className="flex items-center space-x-4">
                <label className="flex items-center text-sm text-slate-700 cursor-pointer">
                  <input 
                    type="checkbox" 
                    checked={formData.permissions.includes('write')}
                    onChange={(e) => {
                      const perms = e.target.checked 
                        ? [...formData.permissions, 'write']
                        : formData.permissions.filter(p => p !== 'write');
                      setFormData({...formData, permissions: perms});
                    }}
                    className="mr-2 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                  />
                  Write Access
                </label>
                <label className="flex items-center text-sm text-slate-700 cursor-pointer">
                  <input 
                    type="checkbox" 
                    checked={formData.permissions.includes('delete')}
                    onChange={(e) => {
                      const perms = e.target.checked 
                        ? [...formData.permissions, 'delete']
                        : formData.permissions.filter(p => p !== 'delete');
                      setFormData({...formData, permissions: perms});
                    }}
                    className="mr-2 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                  />
                  Delete Access
                </label>
              </div>
            </div>
          )}

          <button type="submit" className="w-full py-3 bg-emerald-600 text-white rounded-lg font-bold hover:bg-emerald-700 transition-colors mt-2">
            {editingUser ? 'Update User' : 'Create User'}
          </button>
        </form>
      </div>
    </div>
  );
};

const UserManagement = () => {
  const [users, setUsers] = useState([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState(null);

  useEffect(() => {
    fetch('http://localhost:5000/api/users')
      .then(res => res.json())
      .then(data => setUsers(data));
  }, []);

  const handleSaveUser = (userData) => {
    if (editingUser) {
      // Update existing user
      fetch(`http://localhost:5000/api/users/${editingUser.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(userData)
      })
      .then(res => {
        if (!res.ok) throw new Error('Failed to update user');
        return res.json();
      })
      .then(updatedUser => {
        setUsers(users.map(u => u.id === updatedUser.id ? updatedUser : u));
        alert(`User "${updatedUser.name}" has been updated successfully!`);
      })
      .catch(err => alert(err.message));
    } else {
      // Create new user
      fetch('http://localhost:5000/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(userData)
      })
      .then(res => {
        if (!res.ok) throw new Error('Failed to create user');
        return res.json();
      })
      .then(newUser => {
        setUsers([...users, newUser]);
        alert(`User "${newUser.name}" has been created successfully!`);
      })
      .catch(err => alert(err.message));
    }
  };

  const handleEdit = (user) => {
    setEditingUser(user);
    setIsModalOpen(true);
  };

  const handleAdd = () => {
    setEditingUser(null);
    setIsModalOpen(true);
  };

  const handleDelete = (id, name) => {
    if (window.confirm(`Are you sure you want to delete user "${name}"?`)) {
      fetch(`http://localhost:5000/api/users/${id}`, {
        method: 'DELETE',
      })
      .then(res => {
        if (!res.ok) throw new Error('Failed to delete user');
        setUsers(users.filter(u => u.id !== id));
        alert(`User "${name}" has been deleted.`);
      })
      .catch(err => alert(err.message));
    }
  };

  const handleResetPassword = (id, email) => {
    fetch(`http://localhost:5000/api/users/${id}/reset-password`, {
      method: 'POST',
    })
    .then(res => res.json())
    .then(data => alert(data.message))
    .catch(err => alert(err.message));
  };

  const handleToggleLock = (user) => {
    const newLockStatus = !user.locked;
    fetch(`http://localhost:5000/api/users/${user.id}/lock`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ locked: newLockStatus })
    })
    .then(res => res.json())
    .then(updatedUser => {
      setUsers(users.map(u => u.id === updatedUser.id ? updatedUser : u));
      alert(`User account ${newLockStatus ? 'locked' : 'unlocked'} successfully.`);
    })
    .catch(err => alert(err.message));
  };

  return (
    <div className="space-y-6">
      <UserModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        onSave={handleSaveUser}
        editingUser={editingUser}
      />
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">User Management</h1>
          <p className="text-slate-500 text-sm">Control access levels and permissions for your team.</p>
        </div>
        <button 
          onClick={handleAdd}
          className="flex items-center px-4 py-2 bg-emerald-600 rounded-lg text-sm font-medium text-white hover:bg-emerald-700 transition-colors"
        >
          <UserPlus size={18} className="mr-2" />
          Create User
        </button>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-slate-50 text-slate-600 text-xs font-bold uppercase tracking-wider">
            <tr>
              <th className="px-6 py-4">User</th>
              <th className="px-6 py-4">Role</th>
              <th className="px-6 py-4">Permissions</th>
              <th className="px-6 py-4">Status</th>
              <th className="px-6 py-4">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-sm">
            {users.map((u) => (
              <tr key={u.id} className="hover:bg-slate-50 transition-colors">
                <td className="px-6 py-4">
                  <div className="flex items-center">
                    <div className={`w-8 h-8 rounded-full mr-3 flex items-center justify-center font-bold text-xs ${
                      u.role === 'SUPER_ADMIN' ? 'bg-emerald-100 text-emerald-700' :
                      u.role === 'ADMIN' ? 'bg-blue-100 text-blue-700' :
                      'bg-slate-100 text-slate-700'
                    }`}>
                      {u.name.substring(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <p className="font-medium text-slate-900">{u.name}</p>
                      <p className="text-xs text-slate-500">{u.email}</p>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                    u.role === 'SUPER_ADMIN' ? 'bg-emerald-100 text-emerald-800' :
                    u.role === 'ADMIN' ? 'bg-blue-100 text-blue-800' :
                    'bg-slate-100 text-slate-800'
                  }`}>
                    {u.role === 'SUPER_ADMIN' && <Shield size={12} className="mr-1" />}
                    {u.role === 'ADMIN' && <Lock size={12} className="mr-1" />}
                    {u.role === 'USER' && <User size={12} className="mr-1" />}
                    {u.role.replace('_', ' ')}
                  </span>
                </td>
                <td className="px-6 py-4">
                  <div className="flex flex-wrap gap-1">
                    {u.permissions.map(p => (
                      <span key={p} className="text-[10px] px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded uppercase font-bold">
                        {p}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="px-6 py-4">
                  <div className={`flex items-center font-medium ${u.locked ? 'text-rose-600' : 'text-emerald-600'}`}>
                    {u.locked ? (
                      <>
                        <Lock size={16} className="mr-1" />
                        Locked
                      </>
                    ) : (
                      <>
                        <Check size={16} className="mr-1" />
                        Active
                      </>
                    )}
                  </div>
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center space-x-3">
                    <button 
                      onClick={() => handleEdit(u)}
                      className="text-slate-400 hover:text-blue-600 transition-colors"
                      title="Edit User"
                    >
                      <User size={18} />
                    </button>
                    <button 
                      onClick={() => handleResetPassword(u.id, u.email)}
                      className="text-slate-400 hover:text-amber-600 transition-colors"
                      title="Reset Password"
                    >
                      <Key size={18} />
                    </button>
                    <button 
                      onClick={() => handleToggleLock(u)}
                      className={`transition-colors ${u.locked ? 'text-rose-500 hover:text-emerald-600' : 'text-slate-400 hover:text-rose-600'}`}
                      title={u.locked ? 'Unlock Account' : 'Lock Account'}
                    >
                      {u.locked ? <Unlock size={18} /> : <Lock size={18} />}
                    </button>
                    <button 
                      onClick={() => handleDelete(u.id, u.name)}
                      className="text-slate-400 hover:text-rose-600 transition-colors"
                      title="Delete User"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default UserManagement;
