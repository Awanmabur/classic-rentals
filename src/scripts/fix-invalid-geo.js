require('dotenv').config();
const connectDB = require('../config/db');
const Listing = require('../models/Listing');

(async () => {
  await connectDB();

  const listings = await Listing.find({});
  let fixed = 0;

  for (const listing of listings) {
    const hasLng = Number.isFinite(listing.location?.longitude);
    const hasLat = Number.isFinite(listing.location?.latitude);

    if (hasLng && hasLat) {
      listing.location.coordinates = {
        type: 'Point',
        coordinates: [listing.location.longitude, listing.location.latitude],
      };
    } else {
      listing.location.coordinates = undefined;
    }

    await listing.save();
    fixed += 1;
  }

  console.log(`Geo repair complete. Processed ${fixed} listings.`);
  process.exit(0);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
