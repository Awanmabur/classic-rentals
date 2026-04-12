const express = require('express');
const controller = require('../../controllers/api/adminController');
const { authenticateRequired } = require('../../middlewares/auth');
const authorize = require('../../middlewares/authorize');

const router = express.Router();
router.use(authenticateRequired, authorize('super-admin', 'admin'));
router.get('/stats', controller.getPlatformStats);
router.get('/users', controller.getUsers);
router.patch('/users/:id', controller.updateUserRole);
router.get('/listings', controller.getListingsForAdmin);
router.patch('/listings/:id/assign-agent', controller.assignAgent);
router.get('/audit-logs', controller.getAuditLogs);
router.get('/settings', controller.getSettings);
router.post('/settings', controller.upsertSetting);
module.exports = router;
