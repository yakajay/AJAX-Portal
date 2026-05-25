import React, { useState } from 'react';
import { HelpCircle, MessageSquare, BookOpen, Send, Mail, Phone, ChevronRight, CheckCircle2 } from 'lucide-react';

const SupportCard = ({ icon: Icon, title, description, color, bgColor }) => (
  <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex flex-col items-center text-center group hover:border-cyan-500 transition-all cursor-pointer hover:shadow-lg hover:shadow-cyan-500/5">
    <div className={`w-14 h-14 rounded-2xl ${bgColor} flex items-center justify-center ${color} mb-5 group-hover:scale-110 transition-transform shadow-sm`}>
      <Icon size={28} />
    </div>
    <h3 className="font-black text-slate-900 tracking-tight">{title}</h3>
    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-2 px-4">{description}</p>
    <ChevronRight size={16} className="mt-4 text-slate-300 group-hover:text-cyan-500 group-hover:translate-x-1 transition-all" />
  </div>
);

const Support = () => {
  const [formData, setFormData] = useState({
    subject: '',
    category: 'General Inquiry',
    message: ''
  });

  const [isSubmitted, setIsSubmitted] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    setIsSubmitted(true);
    setTimeout(() => setIsSubmitted(false), 5000);
  };

  return (
    <div className="max-w-5xl mx-auto space-y-12">
      <div className="text-center space-y-4">
        <h1 className="text-4xl font-black text-slate-900 tracking-tight">How can we help?</h1>
        <p className="text-slate-500 max-w-xl mx-auto font-medium">
          Access global documentation, connect with our engineering team, or open a high-priority support ticket.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        <SupportCard 
          icon={BookOpen} 
          title="Documentation" 
          description="Browse detailed guides and API references." 
          color="text-cyan-600" 
          bgColor="bg-cyan-50"
        />
        <SupportCard 
          icon={MessageSquare} 
          title="Community" 
          description="Connect with other YakFlow enterprise users." 
          color="text-indigo-600" 
          bgColor="bg-indigo-50"
        />
        <SupportCard 
          icon={HelpCircle} 
          title="FAQs" 
          description="Quick answers to common platform questions." 
          color="text-purple-600" 
          bgColor="bg-purple-50"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
        <div className="lg:col-span-2">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden h-full">
            <div className="px-8 py-6 border-b border-slate-50 bg-slate-50/50 flex items-center justify-between">
              <h3 className="text-lg font-black text-slate-900 tracking-tight">Open a Support Ticket</h3>
              <span className="text-[10px] font-black uppercase text-slate-400 tracking-widest bg-white px-3 py-1 rounded-lg border border-slate-100 shadow-sm">Response in &lt; 24h</span>
            </div>
            {isSubmitted ? (
              <div className="p-16 text-center space-y-6 animate-in zoom-in-95 duration-500">
                <div className="w-20 h-20 bg-emerald-100 text-emerald-600 rounded-3xl flex items-center justify-center mx-auto shadow-lg shadow-emerald-600/10">
                  <CheckCircle2 size={40} />
                </div>
                <div>
                  <h3 className="text-2xl font-black text-slate-900 tracking-tight">Ticket Submitted!</h3>
                  <p className="text-slate-500 font-medium mt-2 max-w-sm mx-auto leading-relaxed">Our support team has been notified. We'll get back to you at your registered email within 24 hours.</p>
                </div>
                <button 
                  onClick={() => setIsSubmitted(false)}
                  className="px-8 py-3 bg-slate-900 text-white rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-slate-800 transition-all active:scale-95 shadow-xl"
                >
                  Send another message
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="p-8 space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Subject</label>
                    <input 
                      required
                      type="text" 
                      className="w-full px-5 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/20 focus:bg-white transition-all font-medium"
                      placeholder="e.g. Payroll Discrepancy"
                      value={formData.subject}
                      onChange={(e) => setFormData({...formData, subject: e.target.value})}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Category</label>
                    <select 
                      className="w-full px-5 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/20 focus:bg-white transition-all font-medium"
                      value={formData.category}
                      onChange={(e) => setFormData({...formData, category: e.target.value})}
                    >
                      <option>General Inquiry</option>
                      <option>Outsourcing Bug</option>
                      <option>Payroll Issue</option>
                      <option>Account Security</option>
                      <option>Feature Request</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Detailed Message</label>
                  <textarea 
                    required
                    rows="5"
                    className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/20 focus:bg-white transition-all font-medium resize-none"
                    placeholder="Describe your request in detail..."
                    value={formData.message}
                    onChange={(e) => setFormData({...formData, message: e.target.value})}
                  ></textarea>
                </div>
                <button type="submit" className="w-full flex items-center justify-center py-4 bg-cyan-600 text-white rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-cyan-700 transition-all shadow-xl shadow-cyan-600/20 active:scale-95">
                  <Send size={18} className="mr-2" />
                  Submit Support Ticket
                </button>
              </form>
            )}
          </div>
        </div>

        <div className="space-y-8">
          <div className="bg-slate-900 rounded-3xl p-8 text-white shadow-2xl relative overflow-hidden group">
            <div className="relative z-10">
              <h3 className="font-black text-[10px] uppercase tracking-widest mb-8 opacity-50">Direct Contact</h3>
              <div className="space-y-6">
                <div className="flex items-center group/item cursor-pointer">
                  <div className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center mr-5 group-hover/item:bg-cyan-500 group-hover/item:scale-110 transition-all border border-white/5">
                    <Mail size={22} className="text-cyan-400 group-hover/item:text-white" />
                  </div>
                  <div>
                    <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest">Email Support</p>
                    <p className="text-sm font-bold mt-1">support@yakflow.com</p>
                  </div>
                </div>
                <div className="flex items-center group/item cursor-pointer">
                  <div className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center mr-5 group-hover/item:bg-indigo-500 group-hover/item:scale-110 transition-all border border-white/5">
                    <Phone size={22} className="text-indigo-400 group-hover/item:text-white" />
                  </div>
                  <div>
                    <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest">Priority Line</p>
                    <p className="text-sm font-bold mt-1">+1 (888) YAK-FLOW</p>
                  </div>
                </div>
              </div>
              <div className="mt-10 p-5 bg-white/5 rounded-2xl border border-white/5">
                <p className="text-[10px] text-slate-400 leading-relaxed font-bold">
                  Available Mon-Fri, 9am - 6pm EST. Priority support available 24/7 for Super Admins and Enterprise users.
                </p>
              </div>
            </div>
            <div className="absolute -right-20 -bottom-20 w-64 h-64 bg-cyan-500 rounded-full opacity-5 blur-3xl group-hover:scale-150 transition-transform duration-1000"></div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Support;
