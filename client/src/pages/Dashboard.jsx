import React from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Users, 
  CreditCard, 
  Briefcase, 
  TrendingUp,
  ArrowUpRight,
  ArrowDownRight
} from 'lucide-react';

const StatCard = ({ title, value, icon: Icon, trend, trendValue, color }) => (
// ...
  <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
    <div className="flex items-center justify-between mb-4">
      <div className={`p-2 rounded-lg ${color} bg-opacity-10 text-opacity-100`}>
        <Icon size={24} className={color.replace('bg-', 'text-')} />
      </div>
      {trend && (
        <div className={`flex items-center text-sm ${trend === 'up' ? 'text-emerald-500' : 'text-rose-500'}`}>
          {trend === 'up' ? <ArrowUpRight size={16} /> : <ArrowDownRight size={16} />}
          <span className="ml-1 font-medium">{trendValue}</span>
        </div>
      )}
    </div>
    <h3 className="text-slate-500 text-sm font-medium">{title}</h3>
    <p className="text-2xl font-bold text-slate-900 mt-1">{value}</p>
  </div>
);

const Dashboard = ({ user }) => {
  const navigate = useNavigate();
  const canWrite = user?.role === 'SUPER_ADMIN' || user?.permissions?.includes('write');
  const isSuperAdmin = user?.role === 'SUPER_ADMIN';

  const recentActivities = [
    { id: 1, type: 'Payroll', user: 'Sarah Connor', amount: '$4,500', status: 'Completed', date: '2 hours ago' },
    { id: 2, type: 'Outsourcing', user: 'Digital Solutions Inc.', amount: 'Contract Signed', status: 'Active', date: '5 hours ago' },
    { id: 3, type: 'Product', user: 'YakFlow Mobile App', amount: 'Version 2.0', status: 'In Review', date: 'Yesterday' },
    { id: 4, type: 'Payroll', user: 'John Smith', amount: '$3,200', status: 'Pending', date: '2 days ago' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
        <div className="text-sm text-slate-500">Welcome back, Admin!</div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard 
          title="Total Active Contractors" 
          value="24" 
          icon={Users} 
          trend="up" 
          trendValue="12%" 
          color="bg-blue-500" 
        />
        <StatCard 
          title="Monthly Payroll" 
          value="$128,450" 
          icon={CreditCard} 
          trend="down" 
          trendValue="3.2%" 
          color="bg-emerald-500" 
        />
        <StatCard 
          title="Active Projects" 
          value="8" 
          icon={Briefcase} 
          color="bg-purple-500" 
        />
        <StatCard 
          title="Revenue Growth" 
          value="+22.4%" 
          icon={TrendingUp} 
          trend="up" 
          trendValue="5.4%" 
          color="bg-amber-500" 
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <h2 className="text-lg font-bold text-slate-900 mb-4">Recent Activity</h2>
          <div className="space-y-4">
            {recentActivities.map((activity) => (
              <div key={activity.id} className="flex items-center justify-between py-3 border-b border-slate-50 last:border-0">
                <div className="flex items-center">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center mr-4 bg-slate-100 text-slate-500 font-bold`}>
                    {activity.type[0]}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-900">{activity.user}</p>
                    <p className="text-xs text-slate-500">{activity.type} • {activity.date}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-slate-900">{activity.amount}</p>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${
                    activity.status === 'Completed' ? 'bg-emerald-100 text-emerald-600' :
                    activity.status === 'Active' ? 'bg-blue-100 text-blue-600' :
                    activity.status === 'Pending' ? 'bg-amber-100 text-amber-600' :
                    'bg-slate-100 text-slate-600'
                  }`}>
                    {activity.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
          <button className="w-full mt-4 py-2 text-sm font-medium text-emerald-600 hover:text-emerald-700 transition-colors">
            View All Activity
          </button>
        </div>

        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <h2 className="text-lg font-bold text-slate-900 mb-4">Quick Actions</h2>
          <div className="grid grid-cols-2 gap-4">
            <button 
              onClick={() => navigate('/outsourcing')}
              disabled={!canWrite}
              className="p-4 border border-slate-100 rounded-lg hover:bg-slate-50 transition-colors flex flex-col items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Users size={24} className="text-emerald-500 mb-2" />
              <span className="text-sm font-medium text-slate-700">Add Contractor</span>
            </button>
            <button 
              onClick={() => navigate('/payroll')}
              disabled={!canWrite}
              className="p-4 border border-slate-100 rounded-lg hover:bg-slate-50 transition-colors flex flex-col items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <CreditCard size={24} className="text-emerald-500 mb-2" />
              <span className="text-sm font-medium text-slate-700">Process Payroll</span>
            </button>
            <button 
              onClick={() => navigate('/products')}
              disabled={!canWrite}
              className="p-4 border border-slate-100 rounded-lg hover:bg-slate-50 transition-colors flex flex-col items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Briefcase size={24} className="text-emerald-500 mb-2" />
              <span className="text-sm font-medium text-slate-700">New Product</span>
            </button>
            <button 
              onClick={() => navigate('/payroll')}
              className="p-4 border border-slate-100 rounded-lg hover:bg-slate-50 transition-colors flex flex-col items-center justify-center"
            >
              <TrendingUp size={24} className="text-emerald-500 mb-2" />
              <span className="text-sm font-medium text-slate-700">Report Export</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};


export default Dashboard;
