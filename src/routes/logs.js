const { Router } = require('express');
const logs = require('../controllers/logsController');
const { requireRole } = require('../middleware/requireRole');

const router = Router();

router.get('/', requireRole('admin'), logs.listLogs);
router.get('/booking/:booking_id', logs.listLogsForBooking);

module.exports = router;
