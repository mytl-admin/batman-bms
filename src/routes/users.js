const { Router } = require('express');
const usersController = require('../controllers/usersController');
const { requireRole } = require('../middleware/requireRole');

const router = Router();

router.get('/me', usersController.me);
router.get('/', requireRole('admin'), usersController.list);
router.post('/invite', requireRole('admin'), usersController.invite);
router.patch('/:id', requireRole('admin'), usersController.updateUser);

module.exports = router;
