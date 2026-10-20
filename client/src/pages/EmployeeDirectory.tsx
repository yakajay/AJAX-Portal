import React, { useState, useEffect } from 'react';
import { 
  Mail, 
  Briefcase, 
  ChevronRight,
  UserPlus,
  Download,
  X,
  CheckCircle2,
  GitBranch
} from 'lucide-react';
import type { User } from '../types';
import { useSearchParams } from 'react-router-dom';
import { apiFetch } from '../lib/api';
import { Tabs, PasswordInput } from '../components/ui';
import { Avatar } from '../components/Avatar';
import { OrgChart, Departments } from '../components/org/OrgViews';

interface Employee {
  id: string;
  name: string;
  email: string;
  employeeId?: string | null;
  designation?: string;
  avatarVersion?: number | null;
  role: string;
  department: string;
  managerId?: string | null;
  manager?: {
    id: string;
    name: string;
    email: string;
  } | null;
  permissions?: string;
  locked?: boolean;
}

const EmployeeModal = ({ 
  isOpen, 
  onClose, 
  onSave, 
  employee, 
  allEmployees, 
  mode,
  isAdmin,
  isSuperAdmin = false
}: { 
  isOpen: boolean; 
  onClose: () => void; 
  onSave: (emp: Employee) => void; 
  employee?: Employee | null; 
  allEmployees: Employee[];
  mode: 'add' | 'edit';
  isAdmin: boolean;
  isSuperAdmin?: boolean;
}) => {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    role: 'USER',
    department: 'Engineering',
    managerId: '' as string | number
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (mode === 'edit' && employee) {
      setFormData({
        name: employee.name,
        email: employee.email,
        password: '',
        role: employee.role,
        department: employee.department,
        managerId: employee.managerId || ''
      });
    } else {
      setFormData({
        name: '',
        email: '',
        password: '',
        role: 'USER',
        department: 'Engineering',
        managerId: ''
      });
    }
  }, [mode, employee, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const url = mode === 'add' ? '/admin/users' : `/admin/users/${employee?.id}`;
      const method = mode === 'add' ? 'POST' : 'PUT';
      
      const { password, ...rest } = formData;
      const response = await apiFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(mode === 'add' ? formData : rest),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || data.error || `Failed to ${mode} employee`);
      onSave(data);
      onClose();
    } catch (error) {
      console.error(`Failed to ${mode} employee`, error);
      alert(error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-300">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl border border-slate-100 overflow-hidden animate-in zoom-in-95 duration-300">
        <div className="px-6 py-5 border-b border-slate-50 flex items-center justify-between bg-slate-50/50">
          <h2 className="text-xl font-extrabold text-slate-900 tracking-tight">{mode === 'add' ? 'Add New Employee' : 'Edit Employee Details'}</h2>
          <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full transition-colors text-slate-400">
            <X size={20} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-extrabold text-slate-400 mb-1.5">Full Name</label>
            <input 
              required
              type="text" 
              className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:bg-white transition-all"
              placeholder="e.g. John Doe"
              value={formData.name}
              onChange={(e) => setFormData({...formData, name: e.target.value})}
            />
          </div>
          <div>
            <label className="block text-xs font-extrabold text-slate-400 mb-1.5">Email Address</label>
            <input 
              required
              type="email" 
              className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:bg-white transition-all"
              placeholder="john@organization.com"
              value={formData.email}
              onChange={(e) => setFormData({...formData, email: e.target.value})}
            />
          </div>
          {mode === 'add' && (
            <div>
              <label className="block text-xs font-extrabold text-slate-400 mb-1.5">Temporary Password</label>
              <PasswordInput
                required
                
                minLength={6}
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:bg-white transition-all"
                placeholder="At least 6 characters"
                value={formData.password}
                onChange={(e) => setFormData({...formData, password: e.target.value})}
              />
            </div>
          )}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-extrabold text-slate-400 mb-1.5">Role</label>
              <select 
                disabled={!isSuperAdmin}
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:bg-white transition-all disabled:opacity-50"
                value={formData.role}
                onChange={(e) => setFormData({...formData, role: e.target.value})}
              >
                <option value="USER">User</option>
                <option value="ADMIN">Admin</option>
                <option value="SUPER_ADMIN">Super Admin</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-extrabold text-slate-400 mb-1.5">Department</label>
              <select 
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:bg-white transition-all"
                value={formData.department}
                onChange={(e) => setFormData({...formData, department: e.target.value})}
              >
                <option>Engineering</option>
                <option>Human Resources</option>
                <option>Operations</option>
                <option>Sales</option>
              </select>
            </div>
          </div>
          
          <div>
            <label className="block text-xs font-extrabold text-slate-400 mb-1.5 flex items-center">
              <GitBranch size={12} className="mr-1" /> Manager Tree
            </label>
            <select 
              disabled={!isAdmin}
              className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:bg-white transition-all disabled:opacity-50"
              value={formData.managerId}
              onChange={(e) => setFormData({...formData, managerId: e.target.value})}
            >
              <option value="">No Manager (Independent)</option>
              {allEmployees.filter(emp => emp.id !== employee?.id).map(emp => (
                <option key={emp.id} value={emp.id}>{emp.name} ({emp.department})</option>
              ))}
            </select>
          </div>

          <button 
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-blue-600 text-white rounded-xl text-sm font-extrabold hover:bg-blue-700 transition-all shadow-lg shadow-blue-600/20 active:scale-95 disabled:opacity-50 mt-4"
          >
            {loading ? 'Saving...' : mode === 'add' ? 'Create Employee' : 'Update Details'}
          </button>
        </form>
      </div>
    </div>
  );
};

const ProfileModal = ({ 
  isOpen, 
  onClose, 
  employee, 
  onEdit 
}: { 
  isOpen: boolean; 
  onClose: () => void; 
  employee: Employee | null; 
  onEdit: () => void;
}) => {
  if (!isOpen || !employee) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-300">
      <div className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl border border-slate-100 overflow-hidden animate-in zoom-in-95 duration-300">
        <div className="h-32 bg-gradient-to-r from-blue-600 to-indigo-600 relative">
          <button onClick={onClose} className="absolute top-4 right-4 p-2 bg-white/20 hover:bg-white/30 rounded-full text-white transition-colors">
            <X size={20} />
          </button>
        </div>
        <div className="px-8 pb-8">
          <div className="relative -mt-16 mb-6">
            <div className="w-32 h-32 rounded-2xl bg-white p-1.5 shadow-xl border border-slate-100">
              <div className="w-full h-full rounded-2xl bg-slate-100 overflow-hidden flex items-center justify-center text-4xl font-extrabold text-blue-700">
                <Avatar person={employee} initials={employee.name.substring(0, 2).toUpperCase()} />
              </div>
            </div>
          </div>
          
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight">{employee.name}</h2>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-xs font-extrabold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-md">
                  {employee.role.replace('_', ' ')}
                </span>
                <span className="text-slate-300">•</span>
                <span className="text-xs font-bold text-slate-400">{employee.department} Department</span>
              </div>
            </div>

            <div className="flex gap-2">
              <button className="px-4 py-2 bg-slate-900 text-white rounded-xl text-xs font-extrabold hover:bg-slate-800 transition-all">Message</button>
              <button 
                onClick={onEdit}
                className="px-4 py-2 bg-white border border-slate-200 text-slate-700 rounded-xl text-xs font-extrabold hover:bg-slate-50 transition-all"
              >
                Edit Details
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mt-10">
            <div className="space-y-6">
              <div>
                <h3 className="text-xs font-extrabold text-slate-400 mb-3">Contact Information</h3>
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-slate-50 flex items-center justify-center text-slate-400">
                      <Briefcase size={16} />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-slate-400 tracking-tight">Employee ID</p>
                      <p className="text-sm font-bold text-slate-900">{employee.employeeId || '—'}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-slate-50 flex items-center justify-center text-slate-400">
                      <Mail size={16} />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-slate-400 tracking-tight">Email</p>
                      <p className="text-sm font-bold text-slate-900">{employee.email}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-slate-50 flex items-center justify-center text-slate-400">
                      <Briefcase size={16} />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-slate-400 tracking-tight">Employee ID</p>
                      <p className="text-sm font-bold text-slate-900">DB-{2000 + employee.id}</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div className="space-y-6">
              <div>
                <h3 className="text-xs font-extrabold text-slate-400 mb-3">Organization</h3>
                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100">
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-sm font-bold text-slate-600">Reporting Manager</span>
                    <span className="flex items-center text-xs font-bold text-blue-600">
                      <GitBranch size={14} className="mr-1" /> {employee.manager?.name || 'Self Managed'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold text-slate-600">Verification</span>
                    <span className="flex items-center text-xs font-bold text-emerald-600">
                      <CheckCircle2 size={14} className="mr-1" /> Verified
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const DirectoryView = ({ user }: { user: User | null }) => {
  const [employees, setEmployees] = useState<Employee[]>([]);
  // The command palette links here with ?q=<name>
  const [searchParams] = useSearchParams();
  const [searchTerm, setSearchTerm] = useState(searchParams.get('q') ?? '');
  const [deptFilter, setDeptFilter] = useState('All Departments');
  const [loading, setLoading] = useState(true);
  const [modalMode, setModalMode] = useState<'add' | 'edit'>('add');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [isProfileOpen, setIsProfileOpen] = useState(false);

  const isAdmin = user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN';

  useEffect(() => {
    fetchEmployees();
  }, []);

  const fetchEmployees = async () => {
    try {
      const res = await apiFetch(isAdmin ? '/admin/users' : '/user/directory');
      const data = await res.json();
      setEmployees(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Failed to fetch employees", err);
    } finally {
      setLoading(false);
    }
  };

  const handleExport = () => {
    const headers = ['Employee ID', 'Name', 'Email', 'Role', 'Department', 'Manager'];
    const csvContent = [
      headers.join(','),
      ...employees.map(e => `${e.employeeId || ''},${e.name},${e.email},${e.role},${e.department},${e.manager?.name || ''}`)
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', 'employee_directory.csv');
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleSave = (updatedEmp: Employee) => {
    if (modalMode === 'add') {
      setEmployees([...employees, updatedEmp]);
    } else {
      setEmployees(employees.map(e => e.id === updatedEmp.id ? updatedEmp : e));
      setSelectedEmployee(updatedEmp);
    }
    fetchEmployees(); // Refetch to get updated relations (manager info)
  };

  const openAddModal = () => {
    setModalMode('add');
    setSelectedEmployee(null);
    setIsModalOpen(true);
  };

  const openEditModal = () => {
    setModalMode('edit');
    setIsProfileOpen(false);
    setIsModalOpen(true);
  };

  const filteredEmployees = employees.filter(emp => {
    const matchesSearch = 
      emp.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      emp.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (emp.employeeId || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      emp.role.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesDept = deptFilter === 'All Departments' || emp.department === deptFilter;
    
    return matchesSearch && matchesDept;
  });

  const departments = ['All Departments', ...[...new Set(employees.map(e => e.department).filter(Boolean))].sort()];
  const inputCls = 'w-full min-h-11 px-3 bg-white border-[1.5px] border-slate-300 rounded-[10px] text-[15px] font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-600';

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <span className="text-sm font-semibold text-slate-500">{filteredEmployees.length} of {employees.length} people</span>
          <h1 className="text-[32px] leading-tight font-extrabold text-slate-900 tracking-tight">Directory</h1>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-[13px] font-bold text-slate-600">
            Search people or teams
            <input
              type="search"
              placeholder="Name, team or role"
              className={`${inputCls} mt-1.5 w-64`}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </label>
          <button
            onClick={handleExport}
            className="min-h-11 inline-flex items-center gap-2 px-4 rounded-[10px] border-[1.5px] border-blue-600 bg-white text-[15px] font-bold text-blue-800 hover:bg-blue-50 transition-colors"
          >
            <Download size={16} aria-hidden="true" />
            Export CSV
          </button>
          {isAdmin && (
            <button
              onClick={openAddModal}
              className="min-h-11 inline-flex items-center gap-2 px-4 rounded-[10px] bg-blue-600 text-white text-[15px] font-bold hover:bg-blue-700 transition-colors"
            >
              <UserPlus size={16} aria-hidden="true" />
              Add employee
            </button>
          )}
        </div>
      </div>

      <div role="group" aria-label="Filter by department" className="flex flex-wrap gap-2">
        {departments.map((d) => (
          <button
            key={d}
            type="button"
            aria-pressed={deptFilter === d}
            onClick={() => setDeptFilter(d)}
            className={`min-h-11 px-3.5 rounded-full text-sm font-bold border-[1.5px] border-blue-600 transition-colors ${deptFilter === d ? 'bg-blue-600 text-white' : 'bg-white text-blue-800 hover:bg-blue-50'}`}
          >
            {d === 'All Departments' ? 'Everyone' : d}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64" role="status" aria-label="Loading">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      ) : filteredEmployees.length === 0 ? (
        <p className="text-[15px] text-slate-500">No one matches that search.</p>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-5">
          {filteredEmployees.map((emp) => (
            <article key={emp.id} className="p-5 rounded-2xl bg-white border border-slate-200 flex flex-col gap-4">
              <div className="flex items-center gap-3.5">
                <div className="w-12 h-12 shrink-0 rounded-full bg-blue-100 text-blue-800 overflow-hidden flex items-center justify-center text-base font-extrabold" aria-hidden="true">
                  <Avatar person={emp} initials={emp.name.split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase()} />
                </div>
                <div className="flex flex-col min-w-0">
                  <h3 className="text-base font-extrabold text-slate-900 truncate">{emp.name}</h3>
                  <span className="text-sm text-slate-600 truncate">{emp.designation || emp.role.replace('_', ' ')}</span>
                </div>
              </div>
              <div className="flex flex-col gap-1.5 text-sm text-slate-600">
                <span><strong className="text-slate-900">{emp.department}</strong>{emp.employeeId ? ` · ${emp.employeeId}` : ''}</span>
                <span className="inline-flex items-center gap-2 min-w-0"><GitBranch size={14} className="shrink-0 text-slate-500" aria-hidden="true" /><span className="truncate">Reports to {emp.manager?.name || 'no one'}</span></span>
                <a href={`mailto:${emp.email}`} className="inline-flex items-center gap-2 min-w-0 text-blue-800 font-semibold hover:underline"><Mail size={14} className="shrink-0" aria-hidden="true" /><span className="truncate">{emp.email}</span></a>
              </div>
              <button
                onClick={() => {
                  setSelectedEmployee(emp);
                  setIsProfileOpen(true);
                }}
                className="mt-auto min-h-11 rounded-[10px] bg-slate-50 border border-slate-200 text-sm font-bold text-slate-800 hover:bg-blue-50 transition-colors inline-flex items-center justify-center"
              >
                View profile
                <ChevronRight size={16} className="ml-1" aria-hidden="true" />
              </button>
            </article>
          ))}
        </div>
      )}

      <EmployeeModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        onSave={handleSave}
        employee={selectedEmployee}
        allEmployees={employees}
        mode={modalMode}
        isAdmin={isAdmin}
        isSuperAdmin={user?.role === 'SUPER_ADMIN'}
      />

      <ProfileModal 
        isOpen={isProfileOpen} 
        onClose={() => setIsProfileOpen(false)} 
        employee={selectedEmployee}
        onEdit={openEditModal}
      />
    </div>
  );
};

const EmployeeDirectory = ({ user }: { user: User }) => {
  const [tab, setTab] = useState<'people' | 'chart' | 'departments'>('people');
  return (
    <div className="space-y-6">
      <Tabs tabs={[{ id: 'people', label: 'People' }, { id: 'chart', label: 'Org chart' }, { id: 'departments', label: 'Departments' }]} value={tab} onChange={setTab} />
      {tab === 'people' && <DirectoryView user={user} />}
      {tab === 'chart' && <OrgChart />}
      {tab === 'departments' && <Departments user={user} />}
    </div>
  );
};

export default EmployeeDirectory;