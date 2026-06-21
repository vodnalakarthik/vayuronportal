import bcrypt from 'bcryptjs';
import express from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../../config/env.js';
import { requireAuth } from '../../shared/middleware/auth.js';
import { User } from '../users/user.model.js';
import { recordAudit } from '../audit/audit.service.js';

export const authRouter = express.Router();

function publicUser(user) {
  return {
    id: String(user._id || user.id),
    name: user.name,
    email: user.email,
    role: user.role,
    status: user.status
  };
}

authRouter.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email: String(email || '').toLowerCase() });

    if (!user || user.status !== 'active' || !(await bcrypt.compare(String(password || ''), user.passwordHash))) {
      return res.status(401).json({ message: 'Invalid email or password.' });
    }

    user.lastLoginAt = new Date();
    await user.save();

    const token = jwt.sign({ id: user._id, email: user.email, role: user.role }, env.jwtSecret, {
      expiresIn: '12h'
    });

    await recordAudit({ actor: publicUser(user), action: 'auth.login', entityType: 'user', entityId: user._id });

    return res.json({
      token,
      user: publicUser(user),
      admin: publicUser(user)
    });
  } catch (error) {
    return next(error);
  }
});

authRouter.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user, admin: req.user });
});
