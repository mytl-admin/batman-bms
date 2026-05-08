const { Router } = require('express');
const config = require('../controllers/configController');
const { requireRole } = require('../middleware/requireRole');

const router = Router();

router.get('/all', config.getAllActive);

router.get('/tcs-rate/current', config.getTcsCurrent);
router.post('/tcs-rate', requireRole('admin'), config.postTcs);

router.get('/gst-rate/current', config.getGstCurrent);
router.post('/gst-rate', requireRole('admin'), config.postGst);

router.get('/fx-threshold/current', config.getFxCurrent);
router.post('/fx-threshold', requireRole('admin'), config.postFx);

router.get('/default-margin-pct/current', config.getDefaultMarginCurrent);
router.post('/default-margin-pct', requireRole('admin'), config.postDefaultMargin);

router.get('/:config', config.listConfig);
router.get('/:config/:id', config.getConfigOne);
router.post('/:config', requireRole('admin'), config.createConfig);
router.patch('/:config/:id', requireRole('admin'), config.patchConfig);

module.exports = router;
