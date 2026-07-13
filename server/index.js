import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';

dotenv.config();

const app = express();
const prisma = new PrismaClient();
const PORT = process.env.PORT || 5000;

app.use(cors({
  origin: 'http://localhost:5173',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
  credentials: true
}));

app.use(express.json());

// Ensure CORS headers are present on all responses for local dev
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', 'http://localhost:5173');
  res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }
  next();
});

// Logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  next();
});

// --- User Management Endpoints ---
app.get('/api/users', async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      include: {
        manager: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      }
    });
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/users', async (req, res) => {
  try {
    const { email, name, password, role, permissions, department, managerId } = req.body;

    if (!email || !name || !password) {
      return res.status(400).json({ message: 'Name, email, and password are required.' });
    }

    // Handle permissions if they are passed as an array
    const permissionsString = Array.isArray(permissions)
      ? permissions.join(',')
      : (permissions || (role === 'USER' ? 'read' : 'read,write'));

    const user = await prisma.user.create({
      data: {
        email,
        name,
        password,
        department: department || 'Engineering',
        role: role || 'USER',
        permissions: permissionsString,
        managerId: managerId ? parseInt(managerId) : null
      },
      include: {
        manager: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      }
    });
    res.status(201).json(user);
  } catch (error) {
    if (error.code === 'P2002' && error.meta?.target?.includes('email')) {
      return res.status(409).json({ message: 'A user with that email already exists.' });
    }
    res.status(500).json({ message: error.message });
  }
});

app.put('/api/users/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { managerId, permissions, ...rest } = req.body;
    
    const updateData = { ...rest };
    if (managerId !== undefined) {
      updateData.managerId = managerId ? parseInt(managerId) : null;
    }
    
    if (permissions !== undefined) {
      updateData.permissions = Array.isArray(permissions) 
        ? permissions.join(',') 
        : permissions;
    }

    const user = await prisma.user.update({
      where: { id: parseInt(id) },
      data: updateData,
      include: {
        manager: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      }
    });
    res.json(user);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// --- HR Documents Endpoints ---
app.get('/api/documents', async (req, res) => {
  try {
    const documents = await prisma.hrDocument.findMany({
      include: {
        user: {
          select: {
            name: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });
    res.json(documents);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/documents', async (req, res) => {
  try {
    const { userId, name, type, date } = req.body;
    const document = await prisma.hrDocument.create({
      data: {
        userId: parseInt(userId),
        name,
        type,
        date: date || new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
      }
    });
    res.status(201).json(document);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/users/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const user = await prisma.user.delete({
      where: { id: parseInt(id) }
    });
    res.json(user);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email } = req.body;
    const user = await prisma.user.findUnique({
      where: { email }
    });
    if (user) {
      if (user.locked) {
        return res.status(403).json({ message: 'Account is locked. Please contact support.' });
      }
      res.json(user);
    } else {
      res.status(401).json({ message: 'User not found' });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// --- Outsourcing Endpoints ---
app.get('/api/contractors', async (req, res) => {
  try {
    const contractors = await prisma.contractor.findMany();
    res.json(contractors);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/contractors', async (req, res) => {
  try {
    const contractor = await prisma.contractor.create({
      data: req.body
    });
    res.status(201).json(contractor);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// --- Payroll Endpoints ---
app.get('/api/transactions', async (req, res) => {
  try {
    const transactions = await prisma.transaction.findMany({
      orderBy: { createdAt: 'desc' }
    });
    res.json(transactions);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/payroll/run', async (req, res) => {
  try {
    const { company, amount, method } = req.body;
    const transaction = await prisma.transaction.create({
      data: {
        recipient: company,
        date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
        amount: `$${parseFloat(amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}`,
        status: 'Success',
        method: method
      }
    });
    res.status(201).json(transaction);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// --- Attendance Endpoints ---
app.get('/api/attendance/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const attendance = await prisma.attendance.findMany({
      where: { userId: parseInt(userId) },
      orderBy: { createdAt: 'desc' }
    });
    res.json(attendance);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/attendance/check-in', async (req, res) => {
  try {
    const { userId } = req.body;
    const attendance = await prisma.attendance.create({
      data: {
        userId: parseInt(userId),
        date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
        checkIn: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
        status: 'Present'
      }
    });
    res.status(201).json(attendance);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/attendance/check-out', async (req, res) => {
  try {
    const { userId } = req.body;
    const lastEntry = await prisma.attendance.findFirst({
      where: { userId: parseInt(userId), checkOut: null },
      orderBy: { createdAt: 'desc' }
    });
    if (lastEntry) {
      const updatedEntry = await prisma.attendance.update({
        where: { id: lastEntry.id },
        data: {
          checkOut: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
        }
      });
      res.json(updatedEntry);
    } else {
      res.status(404).json({ message: 'Active session not found' });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// --- HR Documents Endpoints ---
app.get('/api/documents/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const documents = await prisma.hrDocument.findMany({
      where: { userId: parseInt(userId) }
    });
    res.json(documents);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/holidays', async (req, res) => {
  try {
    const holidays = await prisma.holiday.findMany();
    res.json(holidays);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// --- Leave Management Endpoints ---
app.get('/api/leaves/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const leaves = await prisma.leaveRequest.findMany({
      where: { userId: parseInt(userId) },
      orderBy: { createdAt: 'desc' }
    });
    res.json(leaves);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/leaves', async (req, res) => {
  try {
    const leave = await prisma.leaveRequest.create({
      data: {
        ...req.body,
        userId: parseInt(req.body.userId)
      }
    });
    res.status(201).json(leave);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`YakFlow Backend (Prisma) running on port ${PORT}`);
});
