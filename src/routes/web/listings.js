
const express = require('express');
const controller = require('../../controllers/web/listingPageController');
const { authenticateOptional, authenticateRequired } = require('../../middlewares/auth');
const upload = require('../../middlewares/upload');

const router = express.Router();
router.get('/', authenticateOptional, controller.index);
router.get('/create', authenticateRequired, controller.showCreate);
router.post('/create', authenticateRequired, upload.array('images', 12), controller.createAction);
router.get('/manage', authenticateRequired, controller.manageMine);
router.get('/:slug/edit', authenticateRequired, controller.showEdit);
router.post('/:id/update', authenticateRequired, upload.array('images', 12), controller.updateAction);
// Image action routes must come before generic ':id/delete' so '/images/delete' is not captured as id='images'.
router.post('/images/primary', authenticateRequired, controller.setPrimaryImageAction);
router.post('/images/delete', authenticateRequired, controller.removeImageAction);
router.post('/:id/images/:publicId/primary', authenticateRequired, controller.setPrimaryImageAction);
router.post('/:id/images/primary', authenticateRequired, controller.setPrimaryImageAction);
router.post('/:id/images/:publicId/delete', authenticateRequired, controller.removeImageAction);
router.post('/:id/images/delete', authenticateRequired, controller.removeImageAction);
router.post('/:id/delete', authenticateRequired, controller.deleteAction);
router.get('/:slug', authenticateOptional, controller.show);
module.exports = router;
