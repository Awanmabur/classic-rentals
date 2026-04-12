require('dotenv').config();
const connectDB = require('../config/db');
const User = require('../models/User');

(async () => {
  await connectDB();

  const email = process.argv[2] || 'owner@jubarentals.com';
  const password = process.argv[3] || 'Password123!';
  const exists = await User.findOne({ email });
  if (exists) {
    console.log('Super admin already exists');
    process.exit(0);
  }

  await User.create({
    firstName: 'Platform',
    lastName: 'Owner',
    email,
    password,
    role: 'super-admin',
    status: 'active',
  });

  console.log(`Super admin created: ${email}`);
  process.exit(0);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
