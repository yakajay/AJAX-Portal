import React from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Users, 
  CreditCard, 
  Briefcase, 
  TrendingUp,
  ArrowUpRight,
  ArrowDownRight,
  ChevronRight,
  UserPlus,
  Play,
  FileText
} from 'lucide-react';

interface User {
  id: number;
  name: string;
  email: string;
  role: string;
  permissions?: string[];
}

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

  const recentActivities = [
    { id: 1, type: 'Payroll', user: 'Sarah Connor', amount: '$4,500', status: 'Completed', date: '2 hours ago', icon: CreditCard, color: 'text-blue-600', bg: 'bg-blue-50' },
    { id: 2, type: 'Outsourcing', user: 'Digital Solutions Inc.', amount: 'Contract Signed', status: 'Active', date: '5 hours ago', icon: Users, color: 'text-indigo-600', bg: 'bg-indigo-50' },
    { id: 3, type: 'Product', user: 'Mobile App', amount: 'Version 2.0', status: 'In Review', date: 'Yesterday', icon: Briefcase, color: 'text-purple-600', bg: 'bg-purple-50' },
    { id: 4, type: 'Payroll', user: 'John Smith', amount: '$3,200', status: 'Pending', date: '2 days ago', icon: CreditCard, color: 'text-amber-600', bg: 'bg-amber-50' },
  ];

  return (
    <div className="space-y-8">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight">Overview</h1>
          <p className="text-slate-500 text-sm mt-1">Real-time insights into your organization's performance.</p>
        </div>
        <div className="hidden md:block text-right">
          <p className="text-xs font-black text-slate-400 uppercase tracking-widest">System Status</p>
          <div className="flex items-center gap-2 mt-1 justify-end">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            <span className="text-sm font-bold text-slate-700 uppercase tracking-tight">All Systems Operational</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
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
        <StatCard 
          title="Growth Rate" 
          value="22.4%" 
          icon={TrendingUp} 
          trend="up" 
          trendValue="5.4%" 
          color="text-emerald-600" 
          bgColor="bg-emerald-50"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
            <h2 className="text-lg font-black text-slate-900 tracking-tight">Recent Activity</h2>
            <button className="text-blue-600 text-xs font-black uppercase tracking-widest hover:underline">View All</button>
          </div>
          <div className="divide-y divide-slate-50">
            {recentActivities.map((activity) => (
              <div key={activity.id} className="flex items-center justify-between px-6 py-4 hover:bg-slate-50/50 transition-colors group">
                <div className="flex items-center">
                  <div className={`w-12 h-12 rounded-2xl ${activity.bg} ${activity.color} flex items-center justify-center mr-4 group-hover:scale-110 transition-transform shadow-sm`}>
                    <activity.icon size={20} />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-900">{activity.user}</p>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">{activity.type} • {activity.date}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm font-black text-slate-900">{activity.amount}</p>
                  <span className={`inline-flex items-center mt-1 text-[10px] px-2 py-0.5 rounded-lg font-black uppercase tracking-widest ${
                    activity.status === 'Completed' ? 'bg-emerald-100 text-emerald-700' :
                    activity.status === 'Active' ? 'bg-blue-100 text-blue-700' :
                    activity.status === 'Pending' ? 'bg-amber-100 text-amber-700' :
                    'bg-slate-100 text-slate-600'
                  }`}>
                    {activity.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-8">
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

          <div className="bg-gradient-to-br from-blue-600 to-blue-800 p-6 rounded-2xl text-white shadow-xl shadow-blue-600/20 relative overflow-hidden group">
            <div className="absolute -right-10 -bottom-10 w-40 h-40 bg-white/10 rounded-full blur-3xl group-hover:scale-150 transition-transform duration-700"></div>
            <h2 className="text-lg font-black tracking-tight mb-2 relative z-10">HCM Premium</h2>
            <p className="text-blue-100 text-xs leading-relaxed mb-5 relative z-10">Unlock advanced reporting, AI forecasting, and global compliance tools.</p>
            <button className="w-full py-2.5 bg-white text-blue-700 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-blue-50 transition-colors relative z-10">
              Upgrade Now
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
