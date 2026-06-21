import bcrypt from 'bcryptjs';
import { User } from '../modules/users/user.model.js';
import { env } from '../config/env.js';

export async function bootstrapAdmin() {
  const email = env.adminEmail.toLowerCase();
  const existing = await User.findOne({ email });

  if (existing) {
    if (existing.role !== 'admin') {
      existing.role = 'admin';
      existing.status = 'active';
      await existing.save();
    }
    return;
  }

  const passwordHash = await bcrypt.hash(env.adminPassword, 12);
  await User.create({
    email,
    passwordHash,
    name: 'Vayuron Admin',
    role: 'admin',
    status: 'active'
  });

  console.log(`Admin user created: ${email}`);
}
