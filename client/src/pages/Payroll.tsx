import React, { useState, useEffect } from 'react';
import { 
  CreditCard, 
  Download, 
  Calendar, 
  ArrowUpRight, 
  CheckCircle2, 
  Clock,
  AlertCircle,
  X,
  Plus,
  ArrowDownRight,
  TrendingUp,
  Receipt
} from 'lucide-react';

const RunPayrollModal = ({ isOpen, onClose, onConfirm, companies }) => {
  const [formData, setFormData] = useState({
    company: '',
    amount: '',
    method: 'Bank Transfer'
  });
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    await onConfirm(formData);
    setLoading(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-300">
      <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl border border-slate-100 overflow-hidden animate-in zoom-in-95 duration-300">
        <div className="px-6 py-5 border-b border-slate-50 flex items-center justify-between bg-slate-50/50">
          <h2 className="text-xl font-black text-slate-900 tracking-tight">Run New Payroll</h2>
          <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full transition-colors text-slate-400">
            <X size={20} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-1.5">Select Partner Company</label>
            <select 
              required
              className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/20 focus:bg-white transition-all"
              value={formData.company}
              onChange={(e) => setFormData({...formData, company: e.target.value})}
            >
              <option value="">Choose a company...</option>
              {companies.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-1.5">Amount ($)</label>
            <input 
              required
              type="number" 
              className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/20 focus:bg-white transition-all"
              value={formData.amount}
              onChange={(e) => setFormData({...formData, amount: e.target.value})}
              placeholder="0.00"
            />
          </div>
          <div>
            <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-1.5">Payment Method</label>
            <select 
              className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/20 focus:bg-white transition-all"
              value={formData.method}
              onChange={(e) => setFormData({...formData, method: e.target.value})}
            >
              <option value="Bank Transfer">Bank Transfer</option>
              <option value="PayPal">PayPal</option>
              <option value="Wire Transfer">Wire Transfer</option>
              <option value="Stripe">Stripe</option>
            </select>
          </div>
          <button 
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-cyan-600 text-white rounded-xl text-sm font-black uppercase tracking-widest hover:bg-cyan-700 transition-all shadow-lg shadow-cyan-600/20 active:scale-95 disabled:opacity-50 mt-4"
          >
            {loading ? 'Processing...' : 'Confirm & Run Payroll'}
          </button>
        </form>
      </div>
    </div>
  );
};

const StatCard = ({ title, value, icon: Icon, trend, trendValue, color, bgColor }) => (
  <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
    <div className="flex items-center justify-between mb-4">
      <div className={`p-2 rounded-xl ${bgColor} ${color}`}>
        <Icon size={20} />
      </div>
      {trend && (
        <div className={`flex items-center text-[10px] font-black ${trend === 'up' ? 'text-emerald-500' : 'text-rose-500'} bg-slate-50 px-2 py-0.5 rounded-lg`}>
          {trend === 'up' ? <TrendingUp size={12} className="mr-0.5" /> : <ArrowDownRight size={12} className="mr-0.5" />}
          {trendValue}
        </div>
      )}
    </div>
    <h3 className="text-slate-400 text-[10px] font-black uppercase tracking-widest">{title}</h3>
    <p className="text-2xl font-black text-slate-900 mt-1 tracking-tight">{value}</p>
  </div>
);

const Payroll = ({ user }) => {
  const [transactions, setTransactions] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);

  const canWrite = user?.role === 'SUPER_ADMIN' || user?.permissions?.includes('write');

  useEffect(() => {
    fetchTransactions();
  }, []);

  const fetchTransactions = async () => {
    try {
      const res = await fetch('http://localhost:5000/api/transactions');
      const data = await res.json();
      setTransactions(data);
    } catch (err) {
      console.error("Failed to fetch transactions", err);
    }
  };

  const companies = [
    'Digital Solutions Inc.',
    'Creative Labs',
    'CloudWorks',
    'TechSquad',
    'Global Tech Partners',
    'Yaksofts Outsourcing'
  ];

  const handleSelect = (id) => {
    if (selectedIds.includes(id)) {
      setSelectedIds(selectedIds.filter(i => i !== id));
    } else {
      setSelectedIds([...selectedIds, id]);
    }
  };

  const handleSelectAll = () => {
    if (selectedIds.length === transactions.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(transactions.map(t => t.id));
    }
  };

  const exportReport = () => {
    const dataToExport = selectedIds.length > 0 
      ? transactions.filter(t => selectedIds.includes(t.id))
      : transactions;

    const headers = ['Recipient', 'Date', 'Amount', 'Status', 'Method'];
    const csvData = dataToExport.map(tx => [
      tx.recipient,
      tx.date,
      tx.amount.replace('$', '').replace(',', ''),
      tx.status,
      tx.method
    ]);
    
    const csvContent = [headers, ...csvData].map(e => e.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `payroll_report_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleRunPayroll = async (data) => {
    setIsProcessing(true);
    try {
      const res = await fetch('http://localhost:5000/api/payroll/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      const newTx = await res.json();
      setTransactions([newTx, ...transactions]);
    } catch (err) {
      console.error("Failed to run payroll", err);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight">Payroll</h1>
          <p className="text-slate-500 text-sm mt-1">Manage bulk payments, tax accruals, and transaction history.</p>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={exportReport}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-xl text-xs font-black uppercase tracking-widest text-slate-700 hover:bg-slate-50 transition-all shadow-sm active:scale-95"
          >
            <Download size={16} />
            {selectedIds.length > 0 ? `Export (${selectedIds.length})` : 'Export Report'}
          </button>
          {canWrite && (
            <button 
              onClick={() => setIsModalOpen(true)}
              className="flex items-center gap-2 px-6 py-2 bg-cyan-600 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-cyan-700 transition-all shadow-lg shadow-cyan-600/20 active:scale-95"
            >
              <Plus size={16} />
              Run Payroll
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard 
          title="Total Payout" 
          value="$458,240" 
          icon={CreditCard} 
          trend="up" 
          trendValue="12.5%" 
          color="text-cyan-600" 
          bgColor="bg-cyan-50"
        />
        <StatCard 
          title="Tax Accrued" 
          value="$12,450" 
          icon={TrendingUp} 
          trend="up" 
          trendValue="3.2%" 
          color="text-indigo-600" 
          bgColor="bg-indigo-50"
        />
        <StatCard 
          title="Fees Saved" 
          value="$840" 
          icon={Receipt} 
          color="text-purple-600" 
          bgColor="bg-purple-50"
        />
        <StatCard 
          title="Transfer Success" 
          value="99.9%" 
          icon={CheckCircle2} 
          color="text-emerald-600" 
          bgColor="bg-emerald-50"
        />
      </div>

      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/30">
          <h2 className="text-lg font-black text-slate-900 tracking-tight">Recent Transactions</h2>
          {selectedIds.length > 0 && (
            <span className="text-xs font-bold text-cyan-600 bg-cyan-50 px-3 py-1 rounded-full animate-in slide-in-from-right-2">
              {selectedIds.length} items selected
            </span>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-50">
                {canWrite && (
                  <th className="px-6 py-4 w-12">
                    <input 
                      type="checkbox" 
                      className="rounded border-slate-300 text-cyan-600 focus:ring-cyan-500 h-4 w-4 cursor-pointer"
                      checked={selectedIds.length === transactions.length && transactions.length > 0}
                      onChange={handleSelectAll}
                    />
                  </th>
                )}
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Recipient</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Date</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Amount</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Status</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Method</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Invoice</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {transactions.map((tx) => (
                <tr key={tx.id} className={`hover:bg-slate-50/50 transition-colors group ${selectedIds.includes(tx.id) ? 'bg-cyan-50/20' : ''}`}>
                  {canWrite && (
                    <td className="px-6 py-5">
                      <input 
                        type="checkbox" 
                        className="rounded border-slate-300 text-cyan-600 focus:ring-cyan-500 h-4 w-4 cursor-pointer"
                        checked={selectedIds.includes(tx.id)}
                        onChange={() => handleSelect(tx.id)}
                      />
                    </td>
                  )}
                  <td className="px-6 py-5 font-black text-slate-900 group-hover:text-cyan-600 transition-colors">{tx.recipient}</td>
                  <td className="px-6 py-5 text-sm font-bold text-slate-500">{tx.date}</td>
                  <td className="px-6 py-5 font-black text-slate-900">{tx.amount}</td>
                  <td className="px-6 py-5">
                    <div className="flex items-center">
                      {tx.status === 'Success' && <CheckCircle2 size={16} className="text-emerald-500 mr-2" />}
                      {tx.status === 'Processing' && <Clock size={16} className="text-amber-500 mr-2 animate-pulse" />}
                      {tx.status === 'Failed' && <AlertCircle size={16} className="text-rose-500 mr-2" />}
                      <span className={`text-[10px] font-black uppercase tracking-widest ${
                        tx.status === 'Success' ? 'text-emerald-700' :
                        tx.status === 'Processing' ? 'text-amber-700' :
                        'text-rose-700'
                      }`}>
                        {tx.status}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-5">
                    <span className="text-xs font-bold text-slate-500 bg-slate-100 px-2 py-1 rounded-lg">
                      {tx.method}
                    </span>
                  </td>
                  <td className="px-6 py-5 text-right">
                    <button className="text-cyan-600 hover:text-cyan-700 font-black text-[10px] uppercase tracking-widest bg-cyan-50 hover:bg-cyan-100 px-3 py-1.5 rounded-lg transition-all">
                      Download
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {transactions.length === 0 && (
            <div className="p-12 text-center text-slate-400 font-bold text-sm italic">No transactions found.</div>
          )}
        </div>
      </div>

      <RunPayrollModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        onConfirm={handleRunPayroll}
        companies={companies}
      />
      
      {isProcessing && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-900/60 backdrop-blur-md animate-in fade-in duration-300">
          <div className="bg-white p-8 rounded-3xl shadow-2xl text-center space-y-6 max-w-xs w-full animate-in zoom-in-95 duration-300 border border-slate-100">
            <div className="w-16 h-16 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
            <div>
              <p className="text-xl font-black text-slate-900 tracking-tight">Processing Funds</p>
              <p className="text-sm font-bold text-slate-400 mt-1 leading-relaxed">Securing transfers and updating ledgers...</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Payroll;
