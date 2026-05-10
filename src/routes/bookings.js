const { Router } = require('express');
const multer = require('multer');
const bookings = require('../controllers/bookingsController');
const invoice = require('../controllers/bookingInvoiceController');
const documents = require('../controllers/bookingDocumentsController');
const travellers = require('../controllers/bookingTravellersController');
const flights = require('../controllers/bookingFlightsController');
const hotels = require('../controllers/bookingHotelsController');
const land = require('../controllers/bookingLandController');
const visas = require('../controllers/bookingVisasController');
const tranches = require('../controllers/bookingTranchesController');
const collections = require('../controllers/bookingCollectionsController');
const { requireBookingAccess } = require('../middleware/bookingAccess');
const { requireRole } = require('../middleware/requireRole');

const router = Router();
const uploadLimits = {};
if (process.env.UPLOAD_MAX_BYTES) {
  uploadLimits.fileSize = Number(process.env.UPLOAD_MAX_BYTES);
}
const upload = multer({
  storage: multer.memoryStorage(),
  ...(Object.keys(uploadLimits).length ? { limits: uploadLimits } : {}),
});

router.get('/', bookings.list);
router.post('/', bookings.create);
router.post('/preview-collections', collections.previewCollections);
router.post('/generate-supplier-tranches', tranches.generateSupplierTranches);

const byId = Router({ mergeParams: true });
byId.use(requireBookingAccess);

byId.get('/', bookings.getById);
byId.patch('/', bookings.update);

byId.get('/invoice', invoice.getInvoice);
byId.patch('/invoice', invoice.patchInvoice);

byId.get('/documents', documents.listGrouped);
byId.post('/documents', upload.single('file'), documents.uploadBookingDocument);
byId.get('/documents/:documentId/versions', documents.listVersions);

byId.get('/travellers', travellers.list);
byId.post('/travellers', travellers.create);
byId.patch('/travellers/:travellerId', travellers.patch);
byId.post('/travellers/:travellerId/documents', upload.single('file'), travellers.uploadDoc);
byId.get('/travellers/:travellerId/documents', travellers.listDocs);
byId.post('/travellers/:travellerId/acknowledge-passport', travellers.ackPassport);

byId.get('/flights', flights.list);
byId.post('/flights', flights.create);
byId.patch('/flights/:flightId', flights.patch);
byId.delete('/flights/:flightId', flights.remove);
byId.post('/flights/:flightId/documents', upload.single('file'), flights.uploadDoc);
byId.get('/flights/:flightId/documents', flights.listDocs);

byId.get('/hotels', hotels.list);
byId.post('/hotels', hotels.create);
byId.patch('/hotels/:hotelId', hotels.patch);
byId.delete('/hotels/:hotelId', hotels.remove);
byId.post('/hotels/:hotelId/documents', upload.single('file'), hotels.uploadDoc);
byId.get('/hotels/:hotelId/documents', hotels.listDocs);

byId.get('/land-items', land.list);
byId.post('/land-items', land.create);
byId.patch('/land-items/:itemId', land.patch);
byId.delete('/land-items/:itemId', land.remove);

byId.get('/visas', visas.list);
byId.post('/visas', visas.create);
byId.patch('/visas/:visaId', visas.patch);
byId.delete('/visas/:visaId', visas.remove);
byId.post('/visas/:visaId/applicants', visas.addApplicant);
byId.delete('/visas/:visaId/applicants/:travellerId', visas.removeApplicant);

byId.get('/supplier-tranches', tranches.listSupplier);
byId.post('/supplier-tranches', tranches.createSupplier);
byId.patch('/supplier-tranches/:trancheId', tranches.patchSupplier);
byId.delete('/supplier-tranches/:trancheId', tranches.deleteSupplier);

byId.get('/guest-tranches', tranches.listGuest);
byId.patch('/guest-tranches/:trancheId', requireRole('admin'), tranches.patchGuest);
byId.post('/generate-guest-tranches', tranches.generateGuest);
byId.post('/guest-tranches/:trancheId/link-supplier', requireRole('admin'), tranches.linkGuestToSupplier);

router.use('/:id', byId);

module.exports = router;
