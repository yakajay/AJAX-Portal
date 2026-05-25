import React, { useState, useEffect } from 'react';
import { 
  Calendar as CalendarIcon, 
  Clock, 
  CheckCircle2, 
  XCircle, 
  AlertCircle,
  Plus,
  ChevronRight,
  X,
  Check,
  Ban
} from 'lucide-react';

interface LeaveRequest {
  id: number;
  userId: number;
  type: string;
  startDate: string;
  endDate: string;
  days: number;
  status: string;
  reason?: string;
  user?: {
    name: string;
  };
}

interface Holiday {
  id: number;
  date: string;
  name: string;
}

interface User {
  id: number;
  name: string;
  email: string;
  role: string;
}

const ApplyLeaveModal = ({ isOpen, onClose, onApply, userId }: { isOpen: boolean; onClose: () => void; onApply: (leave: LeaveRequest) => void; userId?: number }) => {
  const [formData, setFormData] = useState({
    type: 'Annual Leave',
    startDate: '',
    endDate: '',
    reason: ''
  });
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    
    const start = new Date(formData.startDate);
    const end = new Date(formData.endDate);
    const days = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;

    try {
      const response = await fetch('http://localhost:5000/api/leaves', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          userId,
          days
        }),
      });
      const data = await response.json();
      onApply(data);
      onClose();
    } catch (error) {
      console.error("Failed to apply for leave", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-300">
      <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl border border-slate-100 overflow-hidden animate-in zoom-in-95 duration-300">
        <div className="px-6 py-5 border-b border-slate-50 flex items-center justify-between bg-slate-50/50">
          <h2 className="text-xl font-black text-slate-900 tracking-tight">Apply for Leave</h2>
          <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full transition-colors text-slate-400">
            <X size={20} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-1.5">Leave Type</label>
            <select 
              className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:bg-white transition-all"
              value={formData.type}
              onChange={(e) => setFormData({...formData, type: e.target.value})}
            >
              <option>Annual Leave</option>
              <option>Sick Leave</option>
              <option>Casual Leave</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-1.5">Start Date</label>
              <input 
                required
                type="date" 
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:bg-white transition-all"
                value={formData.startDate}
                onChange={(e) => setFormData({...formData, startDate: e.target.value})}
              />
            </div>
            <div>
              <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-1.5">End Date</label>
              <input 
                required
                type="date" 
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:bg-white transition-all"
                value={formData.endDate}
                onChange={(e) => setFormData({...formData, endDate: e.target.value})}
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-1.5">Reason</label>
            <textarea 
              required
              rows={3}
              className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:bg-white transition-all resize-none"
              placeholder="Provide a brief reason for your leave..."
              value={formData.reason}
              onChange={(e) => setFormData({...formData, reason: e.target.value})}
            />
          </div>
          <button 
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-blue-600 text-white rounded-xl text-sm font-black uppercase tracking-widest hover:bg-blue-700 transition-all shadow-lg shadow-blue-600/20 active:scale-95 disabled:opacity-50 mt-4"
          >
            {loading ? 'Submitting...' : 'Submit Request'}
          </button>
        </form>
      </div>
    </div>
  );
};

const LeaveManagement = ({ user }: { user: User | null }) => {
  const [showApplyModal, setShowApplyModal] = useState(false);
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([]);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'my_leave' | 'approvals'>('my_leave');
  
  const leaveBalances = [
    { type: 'Annual Leave', total: 15, taken: 4, remaining: 11, color: 'bg-blue-500' },
    { type: 'Sick Leave', total: 10, taken: 2, remaining: 8, color: 'bg-rose-500' },
    { type: 'Casual Leave', total: 7, taken: 1, remaining: 6, color: 'bg-amber-500' },
  ];

  useEffect(() => {
    if (user?.id) {
      fetchData();
    }
  }, [user?.id, activeTab]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [leavesRes, holidaysRes] = await Promise.all([
        fetch(activeTab === 'my_leave' ? `http://localhost:5000/api/leaves/${user?.id}` : `http://localhost:5000/api/leaves`), // This endpoint might need to be fixed in backend to return ALL for admin
        fetch(`http://localhost:5000/api/holidays`)
      ]);
      const leavesData = await leavesRes.json();
      const holidaysData = await holidaysRes.json();
      setLeaveRequests(Array.isArray(leavesData) ? leavesData : []);
      setHolidays(Array.isArray(holidaysData) ? holidaysData : []);
    } catch (err) {
      console.error("Failed to fetch leave data", err);
    } finally {
      setLoading(false);
    }
  };

  const handleAction = async (id: number, status: 'Approved' | 'Rejected') => {
    try {
      await fetch(`http://localhost:5000/api/leaves/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status })
      });
      fetchData();
    } catch (error) {
      console.error("Failed to update leave status", error);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">Leave Management</h1>
          <p className="text-slate-500 text-sm">Track your leave balances and submit new requests.</p>
        </div>
        <button 
          onClick={() => setShowApplyModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-bold hover:bg-blue-700 transition-colors shadow-lg shadow-blue-600/20 active:scale-95"
        >
          <Plus size={16} />
          Apply for Leave
        </button>
      </div>

      <div className="flex border-b border-slate-200">
        <button 
          onClick={() => setActiveTab('my_leave')}
          className={`px-6 py-3 text-sm font-bold tracking-widest uppercase transition-all border-b-2 ${activeTab === 'my_leave' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
        >
          My Leave
        </button>
        {(user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN') && (
          <button 
            onClick={() => setActiveTab('approvals')}
            className={`px-6 py-3 text-sm font-bold tracking-widest uppercase transition-all border-b-2 ${activeTab === 'approvals' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
          >
            Approvals
          </button>
        )}
      </div>

      {activeTab === 'my_leave' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {leaveBalances.map((balance) => (
            <div key={balance.type} className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <span className="text-sm font-bold text-slate-500 uppercase tracking-wider">{balance.type}</span>
                <div className={`w-2 h-2 rounded-full ${balance.color}`}></div>
              </div>
              <div className="flex items-end justify-between">
                <div>
                  <p className="text-3xl font-black text-slate-900">{balance.remaining}</p>
                  <p className="text-xs text-slate-400 font-bold mt-1">DAYS REMAINING</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-slate-600">{balance.taken} / {balance.total}</p>
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">Consumed</p>
                </div>
              </div>
              <div className="mt-4 w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                <div 
                  className={`h-full ${balance.color}`} 
                  style={{ width: `${(balance.taken / balance.total) * 100}%` }}
                ></div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
            <h2 className="font-black text-slate-900 tracking-tight">{activeTab === 'my_leave' ? 'Leave History' : 'Pending Approvals'}</h2>
          </div>
          <div className="overflow-x-auto">
            {loading ? (
              <div className="p-10 flex justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div></div>
            ) : leaveRequests.length === 0 ? (
              <div className="p-10 text-center text-slate-400 font-bold text-sm">No leave requests found.</div>
            ) : (
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-slate-50">
                    {activeTab === 'approvals' && <th className="px-6 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">Employee</th>}
                    <th className="px-6 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">Type</th>
                    <th className="px-6 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">Duration</th>
                    <th className="px-6 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">Days</th>
                    <th className="px-6 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">Status</th>
                    {activeTab === 'approvals' && <th className="px-6 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Actions</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {leaveRequests.map((leave) => (
                    <tr key={leave.id} className="hover:bg-slate-50/50 transition-colors">
                      {activeTab === 'approvals' && (
                        <td className="px-6 py-4">
                          <span className="text-sm font-bold text-slate-900">{leave.user?.name || 'Unknown'}</span>
                        </td>
                      )}
                      <td className="px-6 py-4">
                        <span className="text-sm font-bold text-slate-700">{leave.type}</span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-xs font-semibold text-slate-600">
                          {new Date(leave.startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - 
                          {new Date(leave.endDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-sm font-bold text-slate-900">{leave.days}</span>
                      </td>
                      <td className="px-6 py-4">
                        <div className={`inline-flex items-center px-2 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${
                          leave.status === 'Approved' ? 'bg-emerald-100 text-emerald-700' : 
                          leave.status === 'Pending' ? 'bg-amber-100 text-amber-700' : 
                          'bg-rose-100 text-rose-700'
                        }`}>
                          {leave.status === 'Approved' && <CheckCircle2 size={10} className="mr-1" />}
                          {leave.status === 'Pending' && <Clock size={10} className="mr-1" />}
                          {leave.status === 'Rejected' && <XCircle size={10} className="mr-1" />}
                          {leave.status}
                        </div>
                      </td>
                      {activeTab === 'approvals' && (
                        <td className="px-6 py-4 text-right">
                          {leave.status === 'Pending' && (
                            <div className="flex justify-end gap-2">
                              <button 
                                onClick={() => handleAction(leave.id, 'Approved')}
                                className="p-1.5 bg-emerald-50 text-emerald-600 hover:bg-emerald-100 rounded-lg transition-colors"
                              >
                                <Check size={16} />
                              </button>
                              <button 
                                onClick={() => handleAction(leave.id, 'Rejected')}
                                className="p-1.5 bg-rose-50 text-rose-600 hover:bg-rose-100 rounded-lg transition-colors"
                              >
                                <Ban size={16} />
                              </button>
                            </div>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-slate-900 text-white p-6 rounded-2xl shadow-xl shadow-slate-900/20">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-blue-500/20 rounded-lg text-blue-400">
                <AlertCircle size={20} />
              </div>
              <h2 className="font-bold tracking-tight">Leave Policy</h2>
            </div>
            <p className="text-slate-400 text-xs leading-relaxed">
              Requests must be submitted at least 48 hours in advance for approval. Sick leaves can be applied post-facto within 24 hours of returning.
            </p>
            <button className="mt-4 w-full py-2 bg-white/10 hover:bg-white/20 transition-colors rounded-lg text-xs font-bold tracking-widest uppercase">
              Download PDF
            </button>
          </div>

          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
            <h2 className="font-black text-slate-900 tracking-tight mb-4">Upcoming Holidays</h2>
            <div className="space-y-4">
              {holidays.length === 0 ? (
                <div className="text-xs text-slate-400 italic">No holidays listed.</div>
              ) : holidays.map((holiday) => (
                <div key={holiday.id} className="flex items-center gap-4 group">
                  <div className="w-10 h-10 rounded-xl bg-slate-50 flex flex-col items-center justify-center border border-slate-100 group-hover:bg-blue-50 transition-colors">
                    <span className="text-[10px] font-black text-slate-400 uppercase leading-none">{holiday.date.split(' ')[0].substring(0, 3)}</span>
                    <span className="text-sm font-black text-slate-900 leading-none mt-0.5">{holiday.date.split(' ')[1]?.replace(',', '') || holiday.date.split(',')[0].split(' ')[1]}</span>
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-900">{holiday.name}</p>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Public Holiday</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <ApplyLeaveModal 
        isOpen={showApplyModal} 
        onClose={() => setShowApplyModal(false)} 
        onApply={(newLeave) => setLeaveRequests([newLeave, ...leaveRequests])}
        userId={user?.id}
      />
    </div>
  );
};

export default LeaveManagement;
