import React, { useState, useEffect } from 'react';
import { 
  FileText, 
  Download, 
  Calendar, 
  ChevronRight, 
  ChevronLeft,
  FileCheck,
  FileBadge,
  BadgePercent,
  MapPin,
  Clock,
  Plus,
  Search
} from 'lucide-react';

const HRHub = ({ user }) => {
  const [documents, setDocuments] = useState([]);
  const [holidays, setHolidays] = useState([]);
  const [activeTab, setActiveTab] = useState('documents');

  useEffect(() => {
    if (user?.id) {
      fetchData();
    }
  }, [user?.id]);

  const fetchData = async () => {
    try {
      const [docsRes, holidaysRes] = await Promise.all([
        fetch(`http://localhost:5000/api/documents/${user.id}`),
        fetch(`http://localhost:5000/api/holidays`)
      ]);
      const docsData = await docsRes.json();
      const holidaysData = await holidaysRes.json();
      setDocuments(docsData);
      setHolidays(holidaysData);
    } catch (err) {
      console.error("Failed to fetch HR data", err);
    }
  };

  const docIcons = {
    'Payslip': <BadgePercent size={20} className="text-cyan-600" />,
    'Letter': <FileCheck size={20} className="text-indigo-600" />,
    'Tax': <FileBadge size={20} className="text-purple-600" />
  };

  const docBgs = {
    'Payslip': 'bg-cyan-50',
    'Letter': 'bg-indigo-50',
    'Tax': 'bg-purple-50'
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight">HR Hub</h1>
          <p className="text-slate-500 text-sm mt-1">Manage documents, view letters, and track the holiday schedule.</p>
        </div>
        <div className="flex bg-slate-100 p-1 rounded-2xl border border-slate-200 shadow-sm">
          <button 
            onClick={() => setActiveTab('documents')}
            className={`px-6 py-2 text-xs font-black uppercase tracking-widest rounded-xl transition-all ${activeTab === 'documents' ? 'bg-white text-cyan-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
          >
            Documents
          </button>
          <button 
            onClick={() => setActiveTab('calendar')}
            className={`px-6 py-2 text-xs font-black uppercase tracking-widest rounded-xl transition-all ${activeTab === 'calendar' ? 'bg-white text-cyan-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
          >
            Calendar
          </button>
        </div>
      </div>

      {activeTab === 'documents' ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden h-full">
              <div className="px-6 py-5 border-b border-slate-100 bg-slate-50/30 flex items-center justify-between">
                <h3 className="font-black text-slate-900 tracking-tight">Digital Documents</h3>
                <div className="flex items-center bg-white px-3 py-1 rounded-lg border border-slate-200 shadow-sm">
                  <Search size={14} className="text-slate-400 mr-2" />
                  <input type="text" placeholder="Search files..." className="text-xs font-bold bg-transparent outline-none w-32" />
                </div>
              </div>
              <div className="divide-y divide-slate-100">
                {documents.length > 0 ? documents.map((doc) => (
                  <div key={doc.id} className="p-6 flex items-center justify-between hover:bg-slate-50/50 transition-colors group">
                    <div className="flex items-center">
                      <div className={`w-12 h-12 rounded-2xl ${docBgs[doc.type] || 'bg-slate-100'} flex items-center justify-center mr-5 group-hover:scale-110 transition-transform shadow-sm`}>
                        {docIcons[doc.type] || <FileText size={20} className="text-slate-400" />}
                      </div>
                      <div>
                        <p className="text-sm font-black text-slate-900 group-hover:text-cyan-600 transition-colors">{doc.name}</p>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">{doc.type} • Released: {doc.date}</p>
                      </div>
                    </div>
                    <button className="p-2.5 rounded-xl bg-slate-50 text-slate-400 hover:bg-cyan-600 hover:text-white transition-all shadow-sm">
                      <Download size={18} />
                    </button>
                  </div>
                )) : (
                  <div className="p-20 text-center text-slate-400 font-bold text-sm italic">No documents available at this time.</div>
                )}
              </div>
            </div>
          </div>

          <div className="space-y-8">
            <div className="bg-gradient-to-br from-indigo-600 to-indigo-800 p-6 rounded-3xl text-white shadow-xl shadow-indigo-600/20">
              <h3 className="font-black text-[10px] uppercase tracking-widest mb-6 opacity-70">Document Statistics</h3>
              <div className="space-y-5">
                {[
                  { label: 'Total Payslips', count: 12, icon: BadgePercent, color: 'text-cyan-400' },
                  { label: 'Active Letters', count: 2, icon: FileCheck, color: 'text-emerald-400' },
                  { label: 'Tax Filings', count: 1, icon: FileBadge, color: 'text-amber-400' },
                ].map((item) => (
                  <div key={item.label} className="flex justify-between items-center py-1 border-b border-white/10">
                    <div className="flex items-center gap-3">
                      <item.icon size={16} className={item.color} />
                      <span className="text-xs font-bold text-indigo-100">{item.label}</span>
                    </div>
                    <span className="font-black text-lg">{item.count}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm text-center space-y-4">
              <div className="w-16 h-16 bg-slate-50 text-cyan-600 rounded-3xl flex items-center justify-center mx-auto mb-2 shadow-sm border border-slate-100">
                <FileText size={32} />
              </div>
              <div>
                <h4 className="font-black text-slate-900 tracking-tight">Need a Certificate?</h4>
                <p className="text-xs font-bold text-slate-400 mt-2 leading-relaxed px-4">Request experience or salary certificates directly from our portal.</p>
              </div>
              <button className="w-full py-3 bg-slate-900 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-800 transition-all shadow-lg active:scale-95">
                Request Document
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2">
            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-8">
              <div className="flex items-center justify-between mb-10">
                <h3 className="text-2xl font-black text-slate-900 tracking-tight">2026 Holiday Schedule</h3>
                <div className="flex gap-2">
                  <button className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-400 hover:text-cyan-600 transition-all shadow-sm"><ChevronLeft size={20} /></button>
                  <button className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-400 hover:text-cyan-600 transition-all shadow-sm"><ChevronRight size={20} /></button>
                </div>
              </div>
              
              <div className="space-y-4">
                {holidays.length > 0 ? holidays.map((holiday) => (
                  <div key={holiday.id} className="flex items-center p-5 rounded-2xl hover:bg-slate-50 transition-all group border border-transparent hover:border-slate-100">
                    <div className="w-16 text-center pr-6 border-r border-slate-100">
                      <p className="text-2xl font-black text-cyan-600 leading-none">{holiday.date.split(' ')[1]?.replace(',', '') || holiday.date.split(',')[0].split(' ')[1]}</p>
                      <p className="text-[10px] font-black uppercase text-slate-400 mt-1 tracking-tighter">
                        {holiday.date.split(' ')[0].substring(0, 3)}
                      </p>
                    </div>
                    <div className="pl-8 flex-1">
                      <p className="text-sm font-black text-slate-900 group-hover:text-cyan-600 transition-colors">{holiday.name}</p>
                      <div className="flex items-center text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">
                        <MapPin size={12} className="mr-1.5 text-slate-300" />
                        Global / Regional Holiday
                      </div>
                    </div>
                    <div className="bg-slate-100 px-4 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest text-slate-500 group-hover:bg-cyan-100 group-hover:text-cyan-700 transition-colors">
                      Public
                    </div>
                  </div>
                )) : (
                  <div className="p-20 text-center text-slate-400 font-bold text-sm italic">No holidays listed.</div>
                )}
              </div>
            </div>
          </div>

          <div className="space-y-8">
            <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
              <h3 className="font-black text-slate-900 tracking-tight mb-8">Upcoming Events</h3>
              <div className="space-y-8 relative before:absolute before:left-[11px] before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-100">
                <div className="relative pl-10">
                  <div className="absolute left-0 top-1.5 w-6 h-6 rounded-full bg-cyan-600 border-4 border-white shadow-lg shadow-cyan-600/20 z-10"></div>
                  <p className="text-[10px] font-black text-cyan-600 uppercase tracking-widest">Happening Now</p>
                  <p className="text-sm font-black text-slate-900 mt-1">Memorial Day Holiday</p>
                  <p className="text-xs font-bold text-slate-400 mt-1">Monday, May 25, 2026</p>
                </div>
                <div className="relative pl-10">
                  <div className="absolute left-0 top-1.5 w-6 h-6 rounded-full bg-white border-2 border-slate-200 z-10"></div>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">In 40 Days</p>
                  <p className="text-sm font-black text-slate-900 mt-1">Independence Day</p>
                  <p className="text-xs font-bold text-slate-400 mt-1">Saturday, July 4, 2026</p>
                </div>
              </div>
            </div>

            <div className="bg-slate-900 p-6 rounded-3xl text-white shadow-xl shadow-slate-900/20 flex items-center justify-between group overflow-hidden relative">
              <div className="absolute -right-10 -bottom-10 w-32 h-32 bg-cyan-500 rounded-full opacity-10 blur-3xl group-hover:scale-150 transition-transform duration-700"></div>
              <div className="relative z-10">
                <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest mb-1">Time-off Balance</p>
                <p className="text-3xl font-black tracking-tight">12.5 Days</p>
              </div>
              <div className="w-14 h-14 bg-white/10 rounded-2xl flex items-center justify-center relative z-10 group-hover:scale-110 transition-transform">
                <Clock size={28} className="text-cyan-400" />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default HRHub;
