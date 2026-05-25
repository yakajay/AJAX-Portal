import React, { useState, useEffect } from 'react';
import { Clock, LogIn, LogOut, Calendar, CheckCircle2, AlertCircle } from 'lucide-react';

const Attendance = ({ user }) => {
  const [logs, setLogs] = useState([]);
  const [isCheckedIn, setIsCheckedIn] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (user) {
      fetch(`http://localhost:5000/api/attendance/${user.id}`)
        .then(res => res.json())
        .then(data => {
          setLogs(data.reverse());
          const activeSession = data.find(log => !log.checkOut);
          setIsCheckedIn(!!activeSession);
        });
    }
  }, [user]);

  const handleAction = () => {
    setIsLoading(true);
    const endpoint = isCheckedIn ? 'check-out' : 'check-in';
    
    fetch(`http://localhost:5000/api/attendance/${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: user.id })
    })
    .then(res => res.json())
    .then(newLog => {
      if (isCheckedIn) {
        setLogs(logs.map(log => log.id === newLog.id ? newLog : log));
      } else {
        setLogs([newLog, ...logs]);
      }
      setIsCheckedIn(!isCheckedIn);
      setIsLoading(false);
    })
    .catch(err => {
      alert(err.message);
      setIsLoading(false);
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Attendance Tracker</h1>
          <p className="text-slate-500 text-sm">Manage your daily clock-in/out and view attendance history.</p>
        </div>
        <div className="text-sm font-medium bg-white px-4 py-2 rounded-lg border border-slate-200 text-slate-600">
          Today: <span className="text-slate-900 font-bold">{new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm text-center space-y-6">
            <div className={`w-20 h-20 rounded-full mx-auto flex items-center justify-center ${isCheckedIn ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}>
              <Clock size={40} className={isCheckedIn ? 'animate-pulse' : ''} />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-900">{isCheckedIn ? 'You are Clocked In' : 'Ready to Start?'}</h2>
              <p className="text-sm text-slate-500 mt-1">
                {isCheckedIn ? 'Currently tracking your working hours.' : 'Please clock in to begin your shift.'}
              </p>
            </div>
            <button 
              onClick={handleAction}
              disabled={isLoading}
              className={`w-full py-4 rounded-xl font-bold text-white transition-all transform active:scale-95 shadow-lg flex items-center justify-center ${
                isCheckedIn 
                ? 'bg-rose-600 hover:bg-rose-700 shadow-rose-200' 
                : 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-200'
              }`}
            >
              {isLoading ? (
                <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
              ) : isCheckedIn ? (
                <>
                  <LogOut size={20} className="mr-2" />
                  Clock Out
                </>
              ) : (
                <>
                  <LogIn size={20} className="mr-2" />
                  Clock In
                </>
              )}
            </button>
          </div>

          <div className="bg-slate-900 p-6 rounded-2xl text-white shadow-xl relative overflow-hidden">
            <div className="relative z-10">
              <h3 className="font-bold text-sm text-slate-400 uppercase tracking-wider mb-4">Summary This Month</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-2xl font-bold">18</p>
                  <p className="text-xs text-slate-400">Days Present</p>
                </div>
                <div>
                  <p className="text-2xl font-bold">162h</p>
                  <p className="text-xs text-slate-400">Hours Logged</p>
                </div>
              </div>
            </div>
            <div className="absolute top-0 right-0 -mr-8 -mt-8 w-32 h-32 bg-emerald-500 rounded-full opacity-10 blur-2xl"></div>
          </div>
        </div>

        <div className="lg:col-span-2">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <h3 className="font-bold text-slate-900 flex items-center">
                <Calendar size={18} className="mr-2 text-emerald-600" />
                Recent Activity
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-slate-50 text-slate-600 text-[10px] font-bold uppercase tracking-widest">
                  <tr>
                    <th className="px-6 py-4">Date</th>
                    <th className="px-6 py-4">Check In</th>
                    <th className="px-6 py-4">Check Out</th>
                    <th className="px-6 py-4">Duration</th>
                    <th className="px-6 py-4">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {logs.length > 0 ? logs.map((log) => (
                    <tr key={log.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-4 font-medium text-slate-900">{log.date}</td>
                      <td className="px-6 py-4 text-slate-600 font-mono text-xs">{log.checkIn}</td>
                      <td className="px-6 py-4 text-slate-600 font-mono text-xs">{log.checkOut || '--:--'}</td>
                      <td className="px-6 py-4 text-slate-600">
                        {log.checkOut ? '9h 10m' : 'In Progress'}
                      </td>
                      <td className="px-6 py-4">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700 uppercase">
                          <CheckCircle2 size={12} className="mr-1" />
                          {log.status}
                        </span>
                      </td>
                    </tr>
                  )) : (
                    <tr>
                      <td colSpan="5" className="px-6 py-12 text-center text-slate-400 italic">
                        No attendance logs found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Attendance;
