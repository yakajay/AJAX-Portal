import React, { useState, useEffect } from 'react';
import { 
  CreditCard, 
  Download, 
  Calendar, 
  ArrowUpRight, 
  CheckCircle2, 
  Clock,
  AlertCircle,
  X
} from 'lucide-react';

const RunPayrollModal = ({ isOpen, onClose, onConfirm, companies }) => {
  const [formData, setFormData] = useState({
    company: '',
    amount: '',
    method: 'Bank Transfer'
  });

  if (!isOpen) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    onConfirm(formData);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-xl w-full max-w-md shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="text-xl font-bold text-slate-900">Run New Payroll</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X size={24} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Select Payroll Company</label>
            <select 
              required
              className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
              value={formData.company}
              onChange={(e) => setFormData({...formData, company: e.target.value})}
            >
              <option value="">Choose a company...</option>
              {companies.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Amount ($)</label>
            <input 
              required
              type="number" 
              className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
              value={formData.amount}
              onChange={(e) => setFormData({...formData, amount: e.target.value})}
              placeholder="0.00"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Payment Method</label>
            <select 
              className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
              value={formData.method}
              onChange={(e) => setFormData({...formData, method: e.target.value})}
            >
              <option value="Bank Transfer">Bank Transfer</option>
              <option value="PayPal">PayPal</option>
              <option value="Wire Transfer">Wire Transfer</option>
              <option value="Stripe">Stripe</option>
            </select>
          </div>
          <button type="submit" className="w-full py-3 bg-emerald-600 text-white rounded-lg font-bold hover:bg-emerald-700 transition-colors mt-2 shadow-lg shadow-emerald-200">
            Confirm & Run Payroll
          </button>
        </form>
      </div>
    </div>
  );
};

const Payroll = ({ user }) => {
  const [transactions, setTransactions] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);

  const canWrite = user?.role === 'SUPER_ADMIN' || user?.permissions?.includes('write');

  useEffect(() => {
    fetch('http://localhost:5000/api/transactions')
      .then(res => res.json())
      .then(data => setTransactions(data));
  }, []);

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

  const handleRunPayroll = () => {
    if (selectedIds.length > 0) {
      setIsProcessing(true);
      fetch('http://localhost:5000/api/payroll/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: selectedIds })
      })
      .then(() => {
        setTransactions(transactions.map(t => 
          selectedIds.includes(t.id) ? { ...t, status: 'Success' } : t
        ));
        setSelectedIds([]);
        setIsProcessing(false);
        alert('Bulk payroll processed for selected items!');
      });
    } else {
      setIsModalOpen(true);
    }
  };

  const onConfirmNewPayroll = (data) => {
    setIsProcessing(true);
    
    fetch('http://localhost:5000/api/payroll/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    })
    .then(res => res.json())
    .then(newTx => {
      setTransactions([newTx, ...transactions]);
      setIsProcessing(false);
      alert(`Payroll processed successfully for ${data.company}!`);
    });
  };

  return (
    <div className="space-y-6">
      <RunPayrollModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        onConfirm={onConfirmNewPayroll}
        companies={companies}
      />
      
      {isProcessing && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white p-8 rounded-2xl shadow-xl text-center space-y-4">
            <div className="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
            <p className="text-lg font-bold text-slate-900">Processing Payroll...</p>
            <p className="text-sm text-slate-500">Securing funds and initiating transfers.</p>
          </div>
        </div>
      )}
      
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-slate-900">Payroll Management</h1>
        <div className="flex space-x-3">
          <button 
            onClick={exportReport}
            className="flex items-center px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
          >
            <Download size={18} className="mr-2" />
            {selectedIds.length > 0 ? `Export (${selectedIds.length})` : 'Export Report'}
          </button>
          {canWrite && (
            <button 
              onClick={handleRunPayroll}
              disabled={isProcessing}
              className="flex items-center px-4 py-2 bg-emerald-600 rounded-lg text-sm font-medium text-white hover:bg-emerald-700 transition-colors shadow-sm shadow-emerald-200 disabled:opacity-50"
            >
              <Calendar size={18} className="mr-2" />
              {selectedIds.length > 0 ? `Pay Selected (${selectedIds.length})` : 'Run Payroll'}
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <div className="bg-slate-900 rounded-xl p-6 text-white overflow-hidden relative shadow-lg">
          <div className="relative z-10">
            <div className="flex justify-between items-start mb-8">
              <p className="text-slate-400 text-sm font-medium">Total Balance</p>
              <CreditCard size={24} className="text-emerald-400" />
            </div>
            <p className="text-3xl font-bold mb-1">$458,240.50</p>
            <div className="flex items-center text-xs text-emerald-400 font-medium">
              <ArrowUpRight size={14} className="mr-1" />
              +2.5% from last month
            </div>
          </div>
          <div className="absolute top-0 right-0 -mr-16 -mt-16 w-64 h-64 bg-emerald-500 rounded-full opacity-10 blur-3xl"></div>
        </div>

        <div className="bg-white rounded-xl p-6 border border-slate-200 shadow-sm">
          <p className="text-slate-500 text-sm font-medium mb-4">Upcoming Payments</p>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-bold text-slate-900">May 30, 2026</p>
                <p className="text-xs text-slate-500">End of month cycle</p>
              </div>
              <p className="text-lg font-bold text-slate-900">$84,200.00</p>
            </div>
            <div className="w-full bg-slate-100 rounded-full h-2">
              <div className="bg-emerald-500 h-2 rounded-full w-3/4"></div>
            </div>
            <p className="text-xs text-slate-500 text-center">75% of payroll funds secured</p>
          </div>
        </div>

        <div className="bg-white rounded-xl p-6 border border-slate-200 shadow-sm">
          <p className="text-slate-500 text-sm font-medium mb-4">Quick Stats</p>
          <div className="grid grid-cols-2 gap-4">
            <div className="p-3 bg-blue-50 rounded-lg">
              <p className="text-[10px] uppercase font-bold text-blue-600 mb-1">Tax Accrued</p>
              <p className="text-lg font-bold text-blue-900">$12,450</p>
            </div>
            <div className="p-3 bg-purple-50 rounded-lg">
              <p className="text-[10px] uppercase font-bold text-purple-600 mb-1">Fees Saved</p>
              <p className="text-lg font-bold text-purple-900">$840</p>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100">
          <h2 className="text-lg font-bold text-slate-900">Recent Transactions</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-slate-50 text-slate-600 text-xs font-bold uppercase tracking-wider">
              <tr>
                {canWrite && (
                  <th className="px-6 py-4 w-10">
                    <input 
                      type="checkbox" 
                      className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 h-4 w-4 cursor-pointer"
                      checked={selectedIds.length === transactions.length && transactions.length > 0}
                      onChange={handleSelectAll}
                    />
                  </th>
                )}
                <th className="px-6 py-4">Recipient</th>
                <th className="px-6 py-4">Date</th>
                <th className="px-6 py-4">Amount</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4">Payment Method</th>
                <th className="px-6 py-4">Invoice</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {transactions.map((tx) => (
                <tr key={tx.id} className={`hover:bg-slate-50 transition-colors ${selectedIds.includes(tx.id) ? 'bg-emerald-50/30' : ''}`}>
                  {canWrite && (
                    <td className="px-6 py-4">
                      <input 
                        type="checkbox" 
                        className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 h-4 w-4 cursor-pointer"
                        checked={selectedIds.includes(tx.id)}
                        onChange={() => handleSelect(tx.id)}
                      />
                    </td>
                  )}
                  <td className="px-6 py-4 font-medium text-slate-900">{tx.recipient}</td>
                  <td className="px-6 py-4 text-slate-500">{tx.date}</td>
                  <td className="px-6 py-4 font-bold text-slate-900">{tx.amount}</td>
                  <td className="px-6 py-4">
                    <div className="flex items-center">
                      {tx.status === 'Success' && <CheckCircle2 size={16} className="text-emerald-500 mr-2" />}
                      {tx.status === 'Processing' && <Clock size={16} className="text-amber-500 mr-2" />}
                      {tx.status === 'Failed' && <AlertCircle size={16} className="text-rose-500 mr-2" />}
                      <span className={`font-medium ${
                        tx.status === 'Success' ? 'text-emerald-600' :
                        tx.status === 'Processing' ? 'text-amber-600' :
                        'text-rose-600'
                      }`}>
                        {tx.status}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-slate-500">{tx.method}</td>
                  <td className="px-6 py-4">
                    <button className="text-emerald-600 hover:underline font-medium">
                      Download
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default Payroll;
