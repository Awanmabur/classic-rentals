const express = require('express');
const controller = require('../../controllers/api/listingController');
const { authenticateOptional, authenticateRequired } = require('../../middlewares/auth');
const authorize = require('../../middlewares/authorize');
const upload = require('../../middlewares/upload');

const router = express.Router();

router.get('/', authenticateOptional, controller.getListings);
router.get('/:slug', authenticateOptional, controller.getListingBySlug);
router.post('/', authenticateRequired, authorize('super-admin', 'admin', 'agent', 'user'), upload.array('images', 12), controller.createListing);
router.put('/:id', authenticateRequired, authorize('super-admin', 'admin', 'agent', 'user'), upload.array('images', 12), controller.updateListing);
router.delete('/:id', authenticateRequired, authorize('super-admin', 'admin', 'agent', 'user'), controller.deleteListing);
router.patch('/:id/moderate', authenticateRequired, authorize('super-admin', 'admin'), controller.adminModerateListing);
router.patch('/:id/images/:publicId/primary', authenticateRequired, authorize('super-admin', 'admin', 'agent', 'user'), controller.setPrimaryImage);
router.delete('/:id/images/:publicId', authenticateRequired, authorize('super-admin', 'admin', 'agent', 'user'), controller.removeImage);

module.exports = router;
