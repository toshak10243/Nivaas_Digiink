export function initialSuperAdminCredentials(env = process.env) {
  const name = typeof env.SUPERADMIN_INITIAL_NAME === 'string' ? env.SUPERADMIN_INITIAL_NAME.trim() : '';
  const email = typeof env.SUPERADMIN_INITIAL_EMAIL === 'string' ? env.SUPERADMIN_INITIAL_EMAIL.trim().toLowerCase() : '';
  const password = typeof env.SUPERADMIN_INITIAL_PASSWORD === 'string' ? env.SUPERADMIN_INITIAL_PASSWORD : '';

  if (!name || name.length > 120) throw new Error('Set SUPERADMIN_INITIAL_NAME (1 to 120 characters) for the first master database setup.');
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('Set a valid SUPERADMIN_INITIAL_EMAIL for the first master database setup.');
  }
  if (password.length < 16 || password.length > 1024) {
    throw new Error('Set SUPERADMIN_INITIAL_PASSWORD to a unique password with at least 16 characters for the first master database setup.');
  }
  return { name, email, password };
}
