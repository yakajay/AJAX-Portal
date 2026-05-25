import React, { useState, useEffect } from 'react';
import { Clock, LogIn, LogOut, Calendar, CheckCircle2, AlertCircle, TrendingUp, History } from 'lucide-react';

const Attendance = ({ user }) => {
  const [logs, setLogs] = useState([]);
  const [isCheckedIn, setIsCheckedIn] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (user?.id) {
      fetchLogs();
    }
  }, [user?.id]);

  const fetchLogs = async () => {
    try {
      const res = await fetch(`http://localhost:5000/api/attendance/${user.id}`);
      const data = await res.json();
      setLogs(data); // data is already ordered desc by server
      const activeSession = data.find(log => !log.checkOut);
      setIsCheckedIn(!!activeSession);
    } catch (err) {
      console.error("Failed to fetch logs", err);
    }
  };

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
      console.error(err);
      setIsLoading(false);
    });
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight">Attendance</h1>
          <p className="text-slate-500 text-sm mt-1">Track your hours and manage your daily working sessions.</p>
        </div>
        <div className="text-[10px] font-black uppercase tracking-widest bg-white px-4 py-2 rounded-xl border border-slate-200 text-slate-400 shadow-sm">
          Today: <span className="text-slate-900 ml-1">{new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm text-center space-y-8 relative overflow-hidden group">
            <div className={`absolute top-0 inset-x-0 h-1.5 ${isCheckedIn ? 'bg-cyan-500' : 'bg-slate-200'}`}></div>
            
            <div className={`w-24 h-24 rounded-3xl mx-auto flex items-center justify-center transition-all duration-500 ${isCheckedIn ? 'bg-cyan-50 text-cyan-600 shadow-lg shadow-cyan-600/10' : 'bg-slate-50 text-slate-300'}`}>
              <Clock size={48} className={isCheckedIn ? 'animate-pulse' : ''} />
            </div>
            
            <div>
              <h2 className="text-2xl font-black text-slate-900 tracking-tight">{isCheckedIn ? 'Session Active' : 'Start Session'}</h2>
              <p className="text-sm font-bold text-slate-400 mt-2 leading-relaxed">
                {isCheckedIn ? 'Tracking your working hours in real-time.' : 'Clock in to begin tracking your productivity for today.'}
              </p>
            </div>

            <button 
              onClick={handleAction}
              disabled={isLoading}
              className={`w-full py-4 rounded-2xl font-black uppercase tracking-widest text-xs transition-all transform active:scale-95 shadow-xl flex items-center justify-center group/btn ${
                isCheckedIn 
                ? 'bg-rose-600 text-white hover:bg-rose-700 shadow-rose-600/20' 
                : 'bg-cyan-600 text-white hover:bg-cyan-700 shadow-cyan-600/20'
              }`}
            >
              {isLoading ? (
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
              ) : isCheckedIn ? (
                <>
                  <LogOut size={18} className="mr-2 group-hover/btn:-translate-x-1 transition-transform" />
                  Clock Out Now
                </>
              ) : (
                <>
                  <LogIn size={18} className="mr-2 group-hover/btn:translate-x-1 transition-transform" />
                  Clock In Now
                </>
              )}
            </button>
          </div>

          <div className="bg-slate-900 p-6 rounded-3xl text-white shadow-xl shadow-slate-900/20 relative overflow-hidden group">
            <div className="relative z-10">
              <div className="flex items-center gap-2 mb-6">
                <div className="p-1.5 bg-cyan-500/20 rounded-lg text-cyan-400">
                  <TrendingUp size={16} />
                </div>
                <h3 className="font-black text-[10px] uppercase tracking-widest">Performance Insights</h3>
              </div>
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <p className="text-3xl font-black tracking-tight">18</p>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Days Present</p>
                </div>
                <div>
                  <p className="text-3xl font-black tracking-tight">162h</p>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Total Hours</p>
                </div>
              </div>
            </div>
            <div className="absolute -right-10 -bottom-10 w-40 h-40 bg-cyan-500 rounded-full opacity-10 blur-3xl group-hover:scale-150 transition-transform duration-700"></div>
          </div>
        </div>

        <div className="lg:col-span-2">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden h-full">
            <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/30">
              <h3 className="font-black text-slate-900 tracking-tight flex items-center">
                <History size={18} className="mr-2 text-cyan-600" />
                Attendance History
              </h3>
              <button className="text-[10px] font-black uppercase tracking-widest text-cyan-600 hover:underline">Download Log</button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-slate-50">
                    <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Date</th>
                    <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">In</th>
                    <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Out</th>
                    <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Duration</th>
                    <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {logs.length > 0 ? logs.map((log) => (
                    <tr key={log.id} className="hover:bg-slate-50/50 transition-colors group">
                      <td className="px-6 py-4 font-black text-slate-900">{log.date}</td>
                      <td className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-tighter">{log.checkIn}</td>
                      <td className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-tighter">{log.checkOut || '--:--'}</td>
                      <td className="px-6 py-4 text-sm font-bold text-slate-600">
                        {log.checkOut ? '9h 10m' : <span className="text-cyan-600 animate-pulse">Tracking...</span>}
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-lg text-[10px] font-black uppercase tracking-widest ${
                          log.status === 'Present' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                        }`}>
                          <CheckCircle2 size={12} className="mr-1" />
                          {log.status}
                        </span>
                      </td>
                    </tr>
                  )) : (
                    <tr>
                      <td colSpan="5" className="px-6 py-20 text-center text-slate-400 font-bold text-sm italic">
                        No activity recorded yet.
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
