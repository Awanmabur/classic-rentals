require('dotenv').config();
const connectDB = require('../config/db');
const User = require('../models/User');
const Listing = require('../models/Listing');
const Favorite = require('../models/Favorite');
const Inquiry = require('../models/Inquiry');
const Review = require('../models/Review');
const Report = require('../models/Report');
const Plan = require('../models/Plan');
const Subscription = require('../models/Subscription');

(async () => {
  await connectDB();

  await Promise.all([
    Favorite.deleteMany({}),
    Inquiry.deleteMany({}),
    Review.deleteMany({}),
    Report.deleteMany({}),
    Listing.deleteMany({}),
    User.deleteMany({}),
    Plan.deleteMany({}),
    Subscription.deleteMany({}),
  ]);

  const [superAdmin, admin, agent, user] = await User.create([
    { firstName: 'Super', lastName: 'Admin', email: 'superadmin@jubarentals.com', phone: '+211900000001', password: 'Password123!', role: 'super-admin' },
    { firstName: 'Main', lastName: 'Admin', email: 'admin@jubarentals.com', phone: '+211900000002', password: 'Password123!', role: 'admin' },
    { firstName: 'Field', lastName: 'Agent', email: 'agent@jubarentals.com', phone: '+211900000003', password: 'Password123!', role: 'agent' },
    { firstName: 'Regular', lastName: 'User', email: 'user@jubarentals.com', phone: '+211900000004', password: 'Password123!', role: 'user' },
  ]);

  const demoImages = [
    'https://images.unsplash.com/photo-1560518883-ce09059eeffa?q=80&w=1400&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?q=80&w=1400&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1494526585095-c41746248156?q=80&w=1400&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1553444892-20174939d7bb?q=80&w=1400&auto=format&fit=crop',
  ];

  const listingData = [
    {
      title: 'Modern 3 Bedroom Villa in Thongpiny',
      description: 'Premium villa with parking, secure wall fence and great road access.',
      category: 'house',
      purpose: 'rent',
      status: 'published',
      featured: true,
      verified: true,
      price: { amount: 1800, currency: 'USD', unit: 'month', negotiable: true },
      location: { country: 'South Sudan', city: 'Juba', area: 'Thongpiny', addressLine: 'Near main road', latitude: 4.8434, longitude: 31.5801 },
      specs: { bedrooms: 3, bathrooms: 3, sizeSqm: 240, furnished: true },
      amenities: ['Parking', 'Security', 'Water tank', 'Garden'],
      owner: user._id,
      assignedAgent: agent._id,
      publishedAt: new Date(),
      images: [{ url: demoImages[0], publicId: 'seed-1', isPrimary: true }],
    },
    {
      title: 'Prime Land Plot in Munuki',
      description: 'Strategic land plot suitable for mixed-use development.',
      category: 'land',
      purpose: 'sale',
      status: 'published',
      featured: true,
      verified: true,
      price: { amount: 25000, currency: 'USD', unit: 'one-time', negotiable: false },
      location: { country: 'South Sudan', city: 'Juba', area: 'Munuki', addressLine: 'Phase 2', latitude: 4.8512, longitude: 31.6010 },
      specs: { landSize: 900 },
      amenities: ['Road access'],
      owner: user._id,
      assignedAgent: agent._id,
      publishedAt: new Date(),
      images: [{ url: demoImages[1], publicId: 'seed-2', isPrimary: true }],
    },
    {
      title: 'Toyota Land Cruiser for Long-Term Hire',
      description: 'Clean SUV available for project, NGO and corporate rentals.',
      category: 'car',
      purpose: 'rent',
      status: 'published',
      featured: false,
      verified: true,
      price: { amount: 120, currency: 'USD', unit: 'day', negotiable: true },
      location: { country: 'South Sudan', city: 'Juba', area: 'Juba Town', addressLine: 'Airport road', latitude: 4.8720, longitude: 31.6015 },
      specs: { seats: 7, transmission: 'Automatic', fuelType: 'Diesel', year: 2021, mileage: 52000 },
      amenities: ['AC', '4x4', 'Driver option'],
      owner: user._id,
      assignedAgent: agent._id,
      publishedAt: new Date(),
      images: [{ url: demoImages[2], publicId: 'seed-3', isPrimary: true }],
    },
    {
      title: 'Fully Serviced Office Space in Hai Malakal',
      description: 'Commercial office space with generator backup and reception area.',
      category: 'office',
      purpose: 'rent',
      status: 'published',
      featured: true,
      verified: false,
      price: { amount: 2200, currency: 'USD', unit: 'month', negotiable: true },
      location: { country: 'South Sudan', city: 'Juba', area: 'Hai Malakal', addressLine: 'Business district', latitude: 4.8601, longitude: 31.5750 },
      specs: { sizeSqm: 180 },
      amenities: ['Generator', 'Reception', 'Parking', 'Internet ready'],
      owner: admin._id,
      assignedAgent: agent._id,
      publishedAt: new Date(),
      images: [{ url: demoImages[3], publicId: 'seed-4', isPrimary: true }],
    },
  ];

  const listings = await Listing.create(listingData);

  const plans = await Plan.create([
    {
      name: 'Starter Agent', slug: 'starter-agent', audience: 'agent', amount: 29, interval: 'monthly', trialDays: 7,
      description: 'For individual agents posting and managing active listings.',
      features: [
        { key: 'listings', label: 'Up to 25 active listings', limit: 25 },
        { key: 'featured', label: '1 featured slot', limit: 1 },
        { key: 'verification', label: 'Paid verification requests', included: true, limit: 3 },
        { key: 'analytics', label: 'Billing and listing analytics', included: true },
      ],
    },
    {
      name: 'Premium Agent', slug: 'premium-agent', audience: 'agent', amount: 79, interval: 'monthly', trialDays: 0,
      description: 'For higher-volume teams that want monetized premium inventory and recurring visibility.',
      features: [
        { key: 'listings', label: 'Up to 120 active listings', limit: 120 },
        { key: 'featured', label: '10 featured slots', limit: 10 },
        { key: 'verification', label: 'Paid verification requests', included: true, limit: 25 },
        { key: 'exact-map', label: 'Premium map/location upsell', included: true },
        { key: 'analytics', label: 'Advanced analytics', included: true },
      ],
    },
    {
      name: 'Growth Office', slug: 'growth-office', audience: 'admin', amount: 99, interval: 'monthly', trialDays: 0,
      description: 'For teams managing inventory, staff, moderation, and monetization operations.',
      features: [
        { key: 'listings', label: 'Up to 250 active listings', limit: 250 },
        { key: 'featured', label: '25 featured slots', limit: 25 },
        { key: 'staff', label: '3 admin seats', limit: 3 },
        { key: 'verification', label: 'Paid verification requests', included: true, limit: 100 },
        { key: 'analytics', label: 'Advanced analytics', included: true },
      ],
    },
  ]);

  await Subscription.create({
    user: agent._id,
    plan: plans[0]._id,
    status: 'active',
    startsAt: new Date(),
    endsAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30),
    payment: { provider: 'manual', reference: 'SEED-001', amount: plans[0].amount, currency: plans[0].currency, status: 'paid', paidAt: new Date() },
  });


  await Favorite.create({ user: user._id, listing: listings[0]._id });
  await Inquiry.create({
    listing: listings[0]._id,
    sender: user._id,
    owner: user._id,
    name: 'Regular User',
    email: 'user@jubarentals.com',
    phone: '+211900000004',
    message: 'I would like to schedule a viewing this week.',
    status: 'new',
  });

  await Review.create({
    listing: listings[0]._id,
    user: user._id,
    rating: 5,
    comment: 'Great property and smooth communication.',
    status: 'published',
  });

  await Report.create({
    listing: listings[3]._id,
    reporter: user._id,
    reason: 'wrong-price',
    details: 'Please verify the pricing information.',
    status: 'open',
  });

  console.log('Seed completed');
  process.exit(0);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
