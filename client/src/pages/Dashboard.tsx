import React from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Users, 
  CreditCard, 
  Briefcase, 
  ArrowUpRight,
  ArrowDownRight,
  ChevronRight,
  UserPlus,
  Play,
  FileText
} from 'lucide-react';
import type { User } from '../types';

interface StatCardProps {
  title: string;
  value: string;
  icon: React.ElementType;
  trend?: 'up' | 'down';
  trendValue?: string;
  color: string;
  bgColor: string;
}

const StatCard = ({ title, value, icon: Icon, trend, trendValue, color, bgColor }: StatCardProps) => (
  <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
    <div className="flex items-center justify-between mb-4">
      <div className={`p-2.5 rounded-xl ${bgColor} ${color}`}>
        <Icon size={24} />
      </div>
      {trend && (
        <div className={`flex items-center text-xs font-black ${trend === 'up' ? 'text-emerald-500' : 'text-rose-500'} bg-slate-50 px-2 py-1 rounded-lg`}>
          {trend === 'up' ? <ArrowUpRight size={14} className="mr-0.5" /> : <ArrowDownRight size={14} className="mr-0.5" />}
          {trendValue}
        </div>
      )}
    </div>
    <h3 className="text-slate-500 text-xs font-black uppercase tracking-widest">{title}</h3>
    <p className="text-3xl font-black text-slate-900 mt-2 tracking-tight">{value}</p>
  </div>
);

const Dashboard = ({ user }: { user: User | null }) => {
  const navigate = useNavigate();
  const isAdmin = user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN';

  return (
    <div className="space-y-8">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight">Overview</h1>
          <p className="text-slate-500 text-sm mt-1">Your organization at a glance.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <StatCard 
          title="Total Workforce" 
          value="1,248" 
          icon={Users} 
          trend="up" 
          trendValue="12.5%" 
          color="text-blue-600" 
          bgColor="bg-blue-50"
        />
        <StatCard 
          title="Monthly Spend" 
          value="$128.4k" 
          icon={CreditCard} 
          trend="down" 
          trendValue="3.2%" 
          color="text-indigo-600" 
          bgColor="bg-indigo-50"
        />
        <StatCard 
          title="Open Positions" 
          value="42" 
          icon={Briefcase} 
          color="text-purple-600" 
          bgColor="bg-purple-50"
        />
      </div>

      <div className="max-w-xl">
        <div>
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
            <h2 className="text-lg font-black text-slate-900 tracking-tight mb-5">Action Center</h2>
            <div className="grid grid-cols-1 gap-3">
              {isAdmin && (
                <>
                  <button 
                    onClick={() => navigate('/directory')}
                    className="group p-4 bg-slate-50 rounded-2xl hover:bg-blue-600 transition-all flex items-center justify-between border border-transparent hover:border-blue-500 shadow-sm"
                  >
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-white rounded-xl text-blue-600 group-hover:text-blue-600 transition-colors">
                        <UserPlus size={20} />
                      </div>
                      <span className="text-sm font-bold text-slate-700 group-hover:text-white transition-colors">Add Employee</span>
                    </div>
                    <ChevronRight size={18} className="text-slate-400 group-hover:text-white group-hover:translate-x-1 transition-all" />
                  </button>
                  
                  <button 
                    onClick={() => navigate('/payroll')}
                    className="group p-4 bg-slate-50 rounded-2xl hover:bg-indigo-600 transition-all flex items-center justify-between border border-transparent hover:border-indigo-500 shadow-sm"
                  >
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-white rounded-xl text-indigo-600 transition-colors">
                        <Play size={20} />
                      </div>
                      <span className="text-sm font-bold text-slate-700 group-hover:text-white transition-colors">Run Payroll</span>
                    </div>
                    <ChevronRight size={18} className="text-slate-400 group-hover:text-white group-hover:translate-x-1 transition-all" />
                  </button>
                </>
              )}

              <button 
                onClick={() => navigate('/hr-hub')}
                className="group p-4 bg-slate-50 rounded-2xl hover:bg-purple-600 transition-all flex items-center justify-between border border-transparent hover:border-purple-500 shadow-sm"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-white rounded-xl text-purple-600 transition-colors">
                    <FileText size={20} />
                  </div>
                  <span className="text-sm font-bold text-slate-700 group-hover:text-white transition-colors">Upload Docs</span>
                </div>
                <ChevronRight size={18} className="text-slate-400 group-hover:text-white group-hover:translate-x-1 transition-all" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
