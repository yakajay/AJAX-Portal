import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

// Logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  next();
});


// Role Definitions
const ROLES = {
  SUPER_ADMIN: 'SUPER_ADMIN',
  ADMIN: 'ADMIN',
  USER: 'USER'
};

// Initial Users
let users = [
  { 
    id: 1, 
    email: 'admin@yaksofts.com', 
    name: 'Super Admin', 
    role: ROLES.SUPER_ADMIN,
    permissions: ['all'] 
  }
];

// --- User Management Endpoints ---
app.get('/api/users', (req, res) => {
  res.json(users);
});

app.post('/api/users', (req, res) => {
  const newUser = { 
    ...req.body, 
    id: users.length + 1,
    permissions: req.body.role === ROLES.USER ? ['read'] : req.body.permissions || ['read', 'write']
  };
  users.push(newUser);
  res.status(201).json(newUser);
});

app.put('/api/users/:id', (req, res) => {
  const { id } = req.params;
  const index = users.findIndex(u => u.id === parseInt(id));
  if (index !== -1) {
    users[index] = { ...users[index], ...req.body };
    res.json(users[index]);
  } else {
    res.status(404).json({ message: 'User not found' });
  }
});

app.delete('/api/users/:id', (req, res) => {
  const { id } = req.params;
  const index = users.findIndex(u => u.id === parseInt(id));
  if (index !== -1) {
    const deletedUser = users.splice(index, 1);
    res.json(deletedUser[0]);
  } else {
    res.status(404).json({ message: 'User not found' });
  }
});

app.post('/api/users/:id/reset-password', (req, res) => {
  const { id } = req.params;
  const user = users.find(u => u.id === parseInt(id));
  if (user) {
    // In a real app, you'd send an email or set a temp password
    res.json({ message: `Password reset link sent to ${user.email}` });
  } else {
    res.status(404).json({ message: 'User not found' });
  }
});

app.patch('/api/users/:id/lock', (req, res) => {
  const { id } = req.params;
  const { locked } = req.body;
  const index = users.findIndex(u => u.id === parseInt(id));
  if (index !== -1) {
    users[index].locked = locked;
    res.json(users[index]);
  } else {
    res.status(404).json({ message: 'User not found' });
  }
});

app.post('/api/auth/login', (req, res) => {
  const { email } = req.body;
  const user = users.find(u => u.email === email);
  if (user) {
    if (user.locked) {
      return res.status(403).json({ message: 'Account is locked. Please contact support.' });
    }
    res.json(user);
  } else {
    res.status(401).json({ message: 'User not found' });
  }
});

// Mock Data
let contractors = [
  { id: 1, name: 'Alex Rivera', role: 'Sr. Backend Developer', company: 'Digital Solutions Inc.', status: 'Active', country: 'Spain', rating: 4.9 },
  { id: 2, name: 'Priya Sharma', role: 'UI/UX Designer', company: 'Creative Labs', status: 'On Bench', country: 'India', rating: 4.8 },
  { id: 3, name: 'Marcus Chen', role: 'DevOps Engineer', company: 'CloudWorks', status: 'Active', country: 'Singapore', rating: 4.7 },
  { id: 4, name: 'Elena Petrova', role: 'QA Automation', company: 'TechSquad', status: 'Pending', country: 'Poland', rating: 4.5 },
];

let transactions = [
  { id: 1, recipient: 'Digital Solutions Inc.', date: 'May 20, 2026', amount: '$12,400.00', status: 'Success', method: 'Bank Transfer' },
  { id: 2, recipient: 'Priya Sharma', date: 'May 18, 2026', amount: '$3,200.00', status: 'Processing', method: 'PayPal' },
  { id: 3, recipient: 'CloudWorks', date: 'May 15, 2026', amount: '$8,950.00', status: 'Success', method: 'Wire Transfer' },
  { id: 4, recipient: 'Alex Rivera', date: 'May 12, 2026', amount: '$4,100.00', status: 'Failed', method: 'Stripe' },
  { id: 5, recipient: 'Marcus Chen', date: 'May 10, 2026', amount: '$2,800.00', status: 'Success', method: 'Bank Transfer' },
];

// --- Outsourcing Endpoints ---
app.get('/api/contractors', (req, res) => {
  res.json(contractors);
});

app.post('/api/contractors', (req, res) => {
  const newContractor = { ...req.body, id: contractors.length + 1 };
  contractors.push(newContractor);
  res.status(201).json(newContractor);
});

// --- Payroll Endpoints ---
app.get('/api/transactions', (req, res) => {
  res.json(transactions);
});

app.post('/api/payroll/run', (req, res) => {
  const { company, amount, method } = req.body;
  const newTx = {
    id: Date.now(),
    recipient: company,
    date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
    amount: `$${parseFloat(amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}`,
    status: 'Success',
    method: method
  };
  transactions = [newTx, ...transactions];
  res.status(201).json(newTx);
});

app.post('/api/payroll/bulk', (req, res) => {
  const { ids } = req.body;
  transactions = transactions.map(t => 
    ids.includes(t.id) ? { ...t, status: 'Success' } : t
  );
  res.json({ message: 'Bulk payroll processed' });
});

let attendance = [
  { id: 1, userId: 1, date: 'May 24, 2026', checkIn: '09:05 AM', checkOut: '06:15 PM', status: 'Present' },
  { id: 2, userId: 1, date: 'May 23, 2026', checkIn: '08:55 AM', checkOut: '06:05 PM', status: 'Present' },
];

let hrDocuments = [
  { id: 1, userId: 1, name: 'Offer Letter.pdf', type: 'Letter', date: 'Jan 15, 2026' },
  { id: 2, userId: 1, name: 'Appointment Letter.pdf', type: 'Letter', date: 'Feb 01, 2026' },
  { id: 3, userId: 1, name: 'Payslip_April_2026.pdf', type: 'Payslip', date: 'May 01, 2026' },
  { id: 4, userId: 1, name: 'Form_16_Tax.pdf', type: 'Tax', date: 'April 15, 2026' },
];

let holidays = [
  { id: 1, date: '2026-01-01', name: 'New Year\'s Day' },
  { id: 2, date: '2026-05-25', name: 'Memorial Day' },
  { id: 3, date: '2026-07-04', name: 'Independence Day' },
  { id: 4, date: '2026-12-25', name: 'Christmas Day' },
];

// --- Attendance Endpoints ---
app.get('/api/attendance/:userId', (req, res) => {
  const { userId } = req.params;
  const userAttendance = attendance.filter(a => a.userId === parseInt(userId));
  res.json(userAttendance);
});

app.post('/api/attendance/check-in', (req, res) => {
  const { userId } = req.body;
  const newEntry = {
    id: attendance.length + 1,
    userId: parseInt(userId),
    date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
    checkIn: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
    checkOut: null,
    status: 'Present'
  };
  attendance.push(newEntry);
  res.status(201).json(newEntry);
});

app.post('/api/attendance/check-out', (req, res) => {
  const { userId } = req.body;
  const entry = attendance.find(a => a.userId === parseInt(userId) && a.checkOut === null);
  if (entry) {
    entry.checkOut = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    res.json(entry);
  } else {
    res.status(404).json({ message: 'Active session not found' });
  }
});

// --- HR Documents Endpoints ---
app.get('/api/documents/:userId', (req, res) => {
  const { userId } = req.params;
  const userDocs = hrDocuments.filter(d => d.userId === parseInt(userId));
  res.json(userDocs);
});

app.get('/api/holidays', (req, res) => {
  res.json(holidays);
});

app.listen(PORT, () => {
  console.log(`YakFlow Backend running on port ${PORT}`);
});
