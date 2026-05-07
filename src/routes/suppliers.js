const { Router } = require('express');
const suppliers = require('../controllers/suppliersController');
const { requireRole } = require('../middleware/requireRole');

const router = Router();

router.get('/missing-bank-details', suppliers.missingBankDetails);
router.get('/', suppliers.list);
router.post('/', requireRole('admin'), suppliers.createSupplier);
router.patch('/:id', requireRole('admin'), suppliers.patchSupplier);

module.exports = router;
