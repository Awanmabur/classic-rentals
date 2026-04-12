const express = require('express');
const controller = require('../../controllers/api/userController');
const { authenticateRequired } = require('../../middlewares/auth');
const upload = require('../../middlewares/upload');

const router = express.Router();
router.use(authenticateRequired);
router.get('/me', controller.getProfile);
router.patch('/me', upload.array('avatar', 1), controller.updateProfile);
router.post('/change-password', controller.changePassword);
module.exports = router;
