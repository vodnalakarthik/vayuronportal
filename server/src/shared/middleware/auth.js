import jwt from 'jsonwebtoken';
import { env } from '../../config/env.js';
import { User } from '../../modules/users/user.model.js';

export async function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) return res.status(401).json({ message: 'Authentication required.' });

  try {
    const payload = jwt.verify(token, env.jwtSecret);
    const user = await User.findById(payload.id).select('name email role status').lean();

    if (!user || user.status !== 'active') {
      return res.status(401).json({ message: 'Invalid or disabled session.' });
    }

    req.user = {
      id: String(user._id),
      name: user.name,
      email: user.email,
      role: user.role
    };
    req.admin = req.user;
    return next();
  } catch {
    return res.status(401).json({ message: 'Invalid or expired session.' });
  }
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ message: 'You do not have permission to perform this action.' });
    }

    return next();
  };
}
