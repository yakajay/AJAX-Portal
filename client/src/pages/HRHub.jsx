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
  Clock
} from 'lucide-react';

const HRHub = ({ user }) => {
  const [documents, setDocuments] = useState([]);
  const [holidays, setHolidays] = useState([]);
  const [activeTab, setActiveTab] = useState('documents');

  useEffect(() => {
    if (user) {
      fetch(`http://localhost:5000/api/documents/${user.id}`)
        .then(res => res.json())
        .then(data => setDocuments(data));
      
      fetch('http://localhost:5000/api/holidays')
        .then(res => res.json())
        .then(data => setHolidays(data));
    }
  }, [user]);

  const docIcons = {
    'Payslip': <BadgePercent className="text-emerald-500" />,
    'Letter': <FileCheck className="text-blue-500" />,
    'Tax': <FileBadge className="text-purple-500" />
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">HR & Document Hub</h1>
          <p className="text-slate-500 text-sm">Access your official letters, payslips, and company calendar.</p>
        </div>
        <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200">
          <button 
            onClick={() => setActiveTab('documents')}
            className={`px-4 py-2 text-sm font-bold rounded-lg transition-all ${activeTab === 'documents' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
          >
            My Documents
          </button>
          <button 
            onClick={() => setActiveTab('calendar')}
            className={`px-4 py-2 text-sm font-bold rounded-lg transition-all ${activeTab === 'calendar' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
          >
            Holiday Calendar
          </button>
        </div>
      </div>

      {activeTab === 'documents' ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-4">
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
                <h3 className="font-bold text-slate-900">Official Records</h3>
                <span className="text-[10px] font-black uppercase text-slate-400">Latest First</span>
              </div>
              <div className="divide-y divide-slate-100">
                {documents.map((doc) => (
                  <div key={doc.id} className="p-6 flex items-center justify-between hover:bg-slate-50 transition-colors group">
                    <div className="flex items-center">
                      <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center mr-4 group-hover:bg-white transition-colors">
                        {docIcons[doc.type] || <FileText size={24} className="text-slate-400" />}
                      </div>
                      <div>
                        <p className="font-bold text-slate-900 group-hover:text-emerald-600 transition-colors">{doc.name}</p>
                        <p className="text-xs text-slate-500">{doc.type} • Released on {doc.date}</p>
                      </div>
                    </div>
                    <button className="p-2 rounded-lg bg-slate-100 text-slate-600 hover:bg-emerald-600 hover:text-white transition-all shadow-sm">
                      <Download size={18} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="lg:col-span-1 space-y-6">
            <div className="bg-emerald-600 p-6 rounded-2xl text-white shadow-xl shadow-emerald-200">
              <h3 className="font-bold text-lg mb-4">Quick Stats</h3>
              <div className="space-y-4">
                <div className="flex justify-between items-center py-2 border-b border-emerald-500/50">
                  <span className="text-sm text-emerald-100">Payslips Issued</span>
                  <span className="font-bold">12</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-emerald-500/50">
                  <span className="text-sm text-emerald-100">Active Letters</span>
                  <span className="font-bold">2</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-emerald-500/50">
                  <span className="text-sm text-emerald-100">Tax Docs</span>
                  <span className="font-bold">1</span>
                </div>
              </div>
            </div>

            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm text-center space-y-3">
              <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-2">
                <FileText size={32} />
              </div>
              <h4 className="font-bold text-slate-900">Need a custom letter?</h4>
              <p className="text-xs text-slate-500">Request experience or salary certificates from the HR portal.</p>
              <button className="w-full py-2 bg-slate-900 text-white rounded-xl text-sm font-bold hover:bg-slate-800 transition-colors">
                Request Document
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
              <div className="flex items-center justify-between mb-8">
                <h3 className="text-xl font-bold text-slate-900">2026 Holiday Schedule</h3>
                <div className="flex space-x-2">
                  <button className="p-2 border border-slate-200 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-50"><ChevronLeft size={20} /></button>
                  <button className="p-2 border border-slate-200 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-50"><ChevronRight size={20} /></button>
                </div>
              </div>
              
              <div className="space-y-4">
                {holidays.map((holiday) => (
                  <div key={holiday.id} className="flex items-center p-4 border border-slate-50 rounded-xl hover:bg-slate-50 transition-all group">
                    <div className="w-16 text-center pr-4 border-r border-slate-100">
                      <p className="text-lg font-black text-emerald-600 leading-none">{holiday.date.split('-')[2]}</p>
                      <p className="text-[10px] uppercase font-bold text-slate-400 mt-1">
                        {new Date(holiday.date).toLocaleDateString('en-US', { month: 'short' })}
                      </p>
                    </div>
                    <div className="pl-6 flex-1">
                      <p className="font-bold text-slate-900 group-hover:text-emerald-600 transition-colors">{holiday.name}</p>
                      <div className="flex items-center text-xs text-slate-500 mt-1">
                        <MapPin size={12} className="mr-1" />
                        Global / Regional Holiday
                      </div>
                    </div>
                    <div className="bg-slate-100 px-3 py-1 rounded-lg text-[10px] font-bold text-slate-500 group-hover:bg-emerald-100 group-hover:text-emerald-600 transition-colors">
                      Public Holiday
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="lg:col-span-1">
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
              <h3 className="font-bold text-slate-900 mb-6">Upcoming Holidays</h3>
              <div className="space-y-6 relative before:absolute before:left-[11px] before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-100">
                <div className="relative pl-8">
                  <div className="absolute left-0 top-1 w-6 h-6 rounded-full bg-emerald-600 border-4 border-white shadow-sm z-10"></div>
                  <p className="text-xs font-bold text-emerald-600 uppercase tracking-widest">Happening Now</p>
                  <p className="font-bold text-slate-900 mt-1">Memorial Day</p>
                  <p className="text-xs text-slate-500 mt-1">Monday, May 25, 2026</p>
                </div>
                <div className="relative pl-8">
                  <div className="absolute left-0 top-1 w-6 h-6 rounded-full bg-white border-2 border-slate-200 z-10"></div>
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">In 40 Days</p>
                  <p className="font-bold text-slate-900 mt-1">Independence Day</p>
                  <p className="text-xs text-slate-500 mt-1">Saturday, July 4, 2026</p>
                </div>
              </div>
            </div>

            <div className="mt-6 bg-blue-600 p-6 rounded-2xl text-white shadow-xl shadow-blue-100 flex items-center justify-between">
              <div>
                <p className="text-xs text-blue-100 font-bold uppercase mb-1">Leave Balance</p>
                <p className="text-2xl font-black">12.5 Days</p>
              </div>
              <div className="w-12 h-12 bg-blue-500 rounded-xl flex items-center justify-center">
                <Clock size={24} />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default HRHub;
