import React, { useState } from 'react';
import { HelpCircle, MessageSquare, BookOpen, Send, Mail, Phone } from 'lucide-react';

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
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold text-slate-900">How can we help?</h1>
        <p className="text-slate-500 max-w-lg mx-auto">
          Search our knowledge base or get in touch with our team for personalized assistance with YakFlow.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-6">
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex flex-col items-center text-center group hover:border-emerald-500 transition-colors cursor-pointer">
          <div className="w-12 h-12 rounded-full bg-emerald-50 flex items-center justify-center text-emerald-600 mb-4 group-hover:bg-emerald-600 group-hover:text-white transition-colors">
            <BookOpen size={24} />
          </div>
          <h3 className="font-bold text-slate-900">Documentation</h3>
          <p className="text-xs text-slate-500 mt-2">Browse detailed guides and API references.</p>
        </div>
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex flex-col items-center text-center group hover:border-emerald-500 transition-colors cursor-pointer">
          <div className="w-12 h-12 rounded-full bg-blue-50 flex items-center justify-center text-blue-600 mb-4 group-hover:bg-blue-600 group-hover:text-white transition-colors">
            <MessageSquare size={24} />
          </div>
          <h3 className="font-bold text-slate-900">Community Forum</h3>
          <p className="text-xs text-slate-500 mt-2">Connect with other YakFlow users.</p>
        </div>
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex flex-col items-center text-center group hover:border-emerald-500 transition-colors cursor-pointer">
          <div className="w-12 h-12 rounded-full bg-purple-50 flex items-center justify-center text-purple-600 mb-4 group-hover:bg-purple-600 group-hover:text-white transition-colors">
            <HelpCircle size={24} />
          </div>
          <h3 className="font-bold text-slate-900">FAQs</h3>
          <p className="text-xs text-slate-500 mt-2">Quick answers to common questions.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 pt-6">
        <div className="lg:col-span-2">
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50">
              <h3 className="font-bold text-slate-900">Open a Support Ticket</h3>
            </div>
            {isSubmitted ? (
              <div className="p-12 text-center space-y-4">
                <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto">
                  <Send size={32} />
                </div>
                <h3 className="text-xl font-bold text-slate-900">Ticket Submitted!</h3>
                <p className="text-slate-500">Our support team will get back to you at your registered email within 24 hours.</p>
                <button 
                  onClick={() => setIsSubmitted(false)}
                  className="px-6 py-2 border border-slate-200 rounded-lg text-sm font-medium hover:bg-slate-50 transition-colors"
                >
                  Send another message
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="p-6 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Subject</label>
                  <input 
                    required
                    type="text" 
                    className="w-full px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                    placeholder="Brief summary of the issue"
                    value={formData.subject}
                    onChange={(e) => setFormData({...formData, subject: e.target.value})}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Category</label>
                  <select 
                    className="w-full px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                    value={formData.category}
                    onChange={(e) => setFormData({...formData, category: e.target.value})}
                  >
                    <option>General Inquiry</option>
                    <option>Outsourcing Bug</option>
                    <option>Payroll Discrepancy</option>
                    <option>Account Access</option>
                    <option>Feature Request</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Message</label>
                  <textarea 
                    required
                    rows="4"
                    className="w-full px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none resize-none"
                    placeholder="Describe your problem in detail..."
                    value={formData.message}
                    onChange={(e) => setFormData({...formData, message: e.target.value})}
                  ></textarea>
                </div>
                <button type="submit" className="w-full flex items-center justify-center py-3 bg-emerald-600 text-white rounded-lg font-bold hover:bg-emerald-700 transition-colors shadow-lg shadow-emerald-200">
                  <Send size={18} className="mr-2" />
                  Submit Ticket
                </button>
              </form>
            )}
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-emerald-900 rounded-xl p-6 text-white shadow-lg">
            <h3 className="font-bold text-lg mb-4">Direct Contact</h3>
            <div className="space-y-4">
              <div className="flex items-center">
                <div className="w-10 h-10 rounded-lg bg-emerald-800 flex items-center justify-center mr-4">
                  <Mail size={20} className="text-emerald-400" />
                </div>
                <div>
                  <p className="text-xs text-emerald-400 font-bold uppercase tracking-wider">Email Us</p>
                  <p className="text-sm">support@yakflow.com</p>
                </div>
              </div>
              <div className="flex items-center">
                <div className="w-10 h-10 rounded-lg bg-emerald-800 flex items-center justify-center mr-4">
                  <Phone size={20} className="text-emerald-400" />
                </div>
                <div>
                  <p className="text-xs text-emerald-400 font-bold uppercase tracking-wider">Call Us</p>
                  <p className="text-sm">+1 (888) YAK-FLOW</p>
                </div>
              </div>
            </div>
            <div className="mt-8 p-4 bg-emerald-800/50 rounded-lg">
              <p className="text-xs text-emerald-100 leading-relaxed">
                Available Mon-Fri, 9am - 6pm EST. Emergency support available 24/7 for Super Admins.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Support;
