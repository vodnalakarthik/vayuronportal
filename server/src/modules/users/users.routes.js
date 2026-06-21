import bcrypt from 'bcryptjs';
import express from 'express';
import { requireAuth, requireRole } from '../../shared/middleware/auth.js';
import { recordAudit } from '../audit/audit.service.js';
import { User } from './user.model.js';

export const usersRouter = express.Router();

usersRouter.use(requireAuth);
usersRouter.use(requireRole('admin'));

function publicUser(user) {
  return {
    id: String(user._id),
    name: user.name,
    email: user.email,
    role: user.role,
    status: user.status,
    createdAt: user.createdAt,
    lastLoginAt: user.lastLoginAt
  };
}

usersRouter.get('/', async (req, res, next) => {
  try {
    const { role, status = 'active' } = req.query;
    const query = {};
    if (role) query.role = role;
    if (status) query.status = status;

    const users = await User.find(query).sort({ createdAt: -1 }).lean();
    res.json({ users: users.map(publicUser) });
  } catch (error) {
    next(error);
  }
});

usersRouter.post('/', async (req, res, next) => {
  try {
    const { name, email, password, role = 'recruiter' } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ message: 'Name, email, and password are required.' });
    }

    if (!['admin', 'recruiter'].includes(role)) {
      return res.status(400).json({ message: 'Invalid user role.' });
    }

    const passwordHash = await bcrypt.hash(String(password), 12);
    const user = await User.create({
      name,
      email,
      passwordHash,
      role,
      status: 'active'
    });

    await recordAudit({
      actor: req.user,
      action: 'user.create',
      entityType: 'user',
      entityId: user._id,
      metadata: { role: user.role, email: user.email }
    });

    res.status(201).json({ user: publicUser(user) });
  } catch (error) {
    next(error);
  }
});

usersRouter.post('/:id/reset-password', async (req, res, next) => {
  try {
    const { password } = req.body;

    if (!password || String(password).length < 6) {
      return res.status(400).json({ message: 'New password must be at least 6 characters.' });
    }

    const user = await User.findOne({ _id: req.params.id, role: 'recruiter' });
    if (!user) return res.status(404).json({ message: 'Recruiter not found.' });

    user.passwordHash = await bcrypt.hash(String(password), 12);
    await user.save();

    await recordAudit({
      actor: req.user,
      action: 'user.password_reset',
      entityType: 'user',
      entityId: user._id,
      metadata: { role: user.role, email: user.email }
    });

    res.json({ user: publicUser(user) });
  } catch (error) {
    next(error);
  }
});

usersRouter.patch('/:id', async (req, res, next) => {
  try {
    const updates = {};
    if (req.body.name) updates.name = req.body.name;
    if (req.body.status && ['active', 'disabled'].includes(req.body.status)) updates.status = req.body.status;
    if (req.body.role && ['admin', 'recruiter'].includes(req.body.role)) updates.role = req.body.role;

    const user = await User.findByIdAndUpdate(req.params.id, updates, { new: true, runValidators: true });
    if (!user) return res.status(404).json({ message: 'User not found.' });

    await recordAudit({
      actor: req.user,
      action: 'user.update',
      entityType: 'user',
      entityId: user._id,
      metadata: updates
    });

    res.json({ user: publicUser(user) });
  } catch (error) {
    next(error);
  }
});
