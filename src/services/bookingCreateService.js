const { Client } = require('pg');
const { allocateBookingCodePg } = require('../utils/generateBookingCode');
const { allocateInvoiceNumberPg } = require('../utils/generateInvoiceNumber');
const { daysUntilTravel, addMonthsUtc, subDaysUtc, differenceNights } = require('../utils/dateHelpers');
const { recalculateBookingFinancials } = require('./bookingFinancials');
const { replaceGuestTranchesForBooking } = require('./guestTrancheGenerator');
const { isMissingFareRulesColumnError } = require('../utils/supabaseErrors');

function bad(message) {
  const e = new Error(message);
  e.status = 400;
  return e;
}

function ceilRupee(x) {
  return Math.ceil(Number(x) || 0);
}

function normalizeTime(t) {
  if (t == null || t === '') {
    return null;
  }
  const s = String(t);
  if (/^\d{2}:\d{2}$/.test(s)) {
    return `${s}:00`;
  }
  return s;
}

function ourRefundDates(isRefundable, supplierFull, supplierPartial) {
  let ourFull = null;
  let ourPartial = null;
  if (isRefundable && supplierFull) {
    ourFull = subDaysUtc(String(supplierFull).slice(0, 10), 5);
  }
  if (supplierPartial) {
    ourPartial = subDaysUtc(String(supplierPartial).slice(0, 10), 5);
  }
  return { ourFull, ourPartial };
}

function normalizeTransferType(v) {
  if (v == null || String(v).trim() === '') return null;
  const s = String(v).trim().toLowerCase();
  if (s === 'shared') return 'sic';
  return s;
}

function assertPayBeforeTravel(paymentDateStr, dateOfTravelStr) {
  const pay = String(paymentDateStr).slice(0, 10);
  const dot = String(dateOfTravelStr).slice(0, 10);
  if (pay >= dot) {
    throw bad('supplier_tranche payment_date must be before date_of_travel');
  }
}

/** Bulk create: explicit is_primary wins; otherwise first traveller defaults to primary for backward compatibility. */
function travellerIsPrimaryBulk(t, index) {
  if (t.is_primary === true) return true;
  if (t.is_primary === false) return false;
  return index === 0;
}

function contactColumnValue(v, primary) {
  if (primary) {
    return String(v).trim();
  }
  if (v == null || String(v).trim() === '') {
    return null;
  }
  return String(v).trim();
}

function validateAndNormalizeBody(body) {
  if (!body || typeof body !== 'object') {
    throw bad('JSON body required');
  }

  const {
    customer_name,
    crm_lead_id: crmLeadId,
    destinations,
    date_of_travel: dateOfTravel,
    return_date: returnDate,
    adults,
    children,
    children_ages: childrenAgesIn,
    margin,
    financial_confirmed: financialConfirmed,
    travellers,
    flights,
    hotels,
    land_items: landItems,
    visas,
    supplier_tranches: supplierTranches,
    pan_cards: panCards,
  } = body;

  if (!customer_name || String(customer_name).trim() === '') {
    throw bad('customer_name is required');
  }
  if (!Array.isArray(destinations) || destinations.length < 1) {
    throw bad('destinations must be a non-empty array');
  }
  if (!dateOfTravel || !returnDate) {
    throw bad('date_of_travel and return_date are required');
  }
  if (String(returnDate) <= String(dateOfTravel)) {
    throw bad('return_date must be after date_of_travel');
  }

  const adultsN = Number(adults);
  const childrenN = Number(children ?? 0);
  if (!Number.isFinite(adultsN) || adultsN < 1) {
    throw bad('adults must be at least 1');
  }
  if (!Number.isFinite(childrenN) || childrenN < 0) {
    throw bad('children must be 0 or greater');
  }

  const ages = Array.isArray(childrenAgesIn) ? [...childrenAgesIn] : [];
  if (ages.length !== childrenN) {
    throw bad('children_ages length must equal children count');
  }

  if (financialConfirmed !== true) {
    throw bad('financial_confirmed must be true');
  }

  if (margin === undefined || margin === null || Number.isNaN(Number(margin))) {
    throw bad('margin is required (0 is allowed)');
  }

  const tList = Array.isArray(travellers) ? travellers : [];
  if (tList.length < 1) {
    throw bad('At least one traveller is required');
  }

  const fList = Array.isArray(flights) ? flights : [];
  const hList = Array.isArray(hotels) ? hotels : [];
  const lList = Array.isArray(landItems) ? landItems : [];
  const vList = Array.isArray(visas) ? visas : [];

  if (fList.length + hList.length + lList.length + vList.length < 1) {
    throw bad('At least one line item (flight, hotel, land_items, or visas) is required');
  }

  const stList = Array.isArray(supplierTranches) ? supplierTranches : [];
  if (stList.length < 1) {
    throw bad('At least one supplier_tranche is required');
  }

  const panList = Array.isArray(panCards) ? panCards : [];
  if (panList.length < 1) {
    throw bad('At least one pan_cards entry is required');
  }

  const sevenMoPolicy = addMonthsUtc(String(dateOfTravel).slice(0, 10), 7);

  for (let i = 0; i < tList.length; i += 1) {
    const t = tList[i];
    const isPrimary = travellerIsPrimaryBulk(t, i);
    const coreKeys = ['full_name', 'dob', 'nationality', 'travel_document_id', 'passport_expiry_date'];
    for (const k of coreKeys) {
      if (t[k] == null || String(t[k]).trim() === '') {
        throw bad(`travellers[${i}].${k} is required`);
      }
    }
    if (isPrimary) {
      for (const k of ['phone', 'email', 'emergency_contact_name', 'emergency_contact_phone']) {
        if (t[k] == null || String(t[k]).trim() === '') {
          throw bad(`travellers[${i}].${k} is required when is_primary is true`);
        }
      }
    }
    if (typeof t.visa_needed !== 'boolean') {
      throw bad(`travellers[${i}].visa_needed is required (boolean)`);
    }
    if (t.visa_needed === false && !t.visa_exemption_proof_url) {
      throw bad(`travellers[${i}].visa_exemption_proof_url required when visa_needed is false`);
    }
    const pe = String(t.passport_expiry_date).slice(0, 10);
    if (pe < sevenMoPolicy && t.passport_alert_acknowledged !== true) {
      throw bad(
        `travellers[${i}]: passport_alert_acknowledged must be true when passport expiry falls inside the alert policy window`,
      );
    }
  }

  for (let i = 0; i < stList.length; i += 1) {
    const st = stList[i];
    if (st.amount == null || st.payment_date == null) {
      throw bad(`supplier_tranches[${i}] needs amount and payment_date`);
    }
    assertPayBeforeTravel(st.payment_date, dateOfTravel);
  }

  const neededSuppliers = new Set();
  for (const f of fList) {
    if (!f.is_self_booked && f.supplier_id) {
      neededSuppliers.add(String(f.supplier_id));
    }
  }
  for (const h of hList) {
    if (!h.is_self_booked && h.supplier_id) {
      neededSuppliers.add(String(h.supplier_id));
    }
  }
  for (const l of lList) {
    if (l.supplier_id) {
      neededSuppliers.add(String(l.supplier_id));
    }
  }
  for (const v of vList) {
    if (!v.is_self_arranged && v.supplier_id) {
      neededSuppliers.add(String(v.supplier_id));
    }
  }
  const trancheSuppliers = new Set(
    stList.map((st) => st.supplier_id).filter(Boolean).map((sid) => String(sid)),
  );
  for (const sid of neededSuppliers) {
    if (!trancheSuppliers.has(sid)) {
      throw bad(
        'Each supplier used on booked line items must appear on at least one supplier_tranche with the same supplier_id',
      );
    }
  }

  return {
    customer_name: String(customer_name).trim(),
    crm_lead_id: crmLeadId != null ? String(crmLeadId).trim() || null : null,
    destinations: destinations.map((d) => String(d).trim()).filter(Boolean),
    date_of_travel: String(dateOfTravel).slice(0, 10),
    return_date: String(returnDate).slice(0, 10),
    adults: adultsN,
    children: childrenN,
    children_ages: ages,
    margin: Number(margin),
    travellers: tList,
    flights: fList,
    hotels: hList,
    land_items: lList,
    visas: vList,
    supplier_tranches: stList,
    pan_cards: panList,
  };
}

function newPgClient() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    const e = new Error('DATABASE_URL is required for transactional booking creation');
    e.status = 503;
    throw e;
  }
  return new Client({
    connectionString: url,
    ssl: url.includes('supabase.co') ? { rejectUnauthorized: false } : undefined,
  });
}

/**
 * P2-10 — single DB transaction: booking + nested rows + financials + guest tranches.
 */
async function createBookingFromPayload(body, user, logService) {
  const payload = validateAndNormalizeBody(body);
  const isNrf = daysUntilTravel(payload.date_of_travel) <= 20;
  const agesParam = payload.children > 0 ? payload.children_ages : null;

  const client = newPgClient();
  await client.connect();

  let bookingId;

  try {
    await client.query('BEGIN');

    const bookingCode = await allocateBookingCodePg(client);
    const invoiceNumber = await allocateInvoiceNumberPg(client);

    const { rows: insRows } = await client.query(
      `INSERT INTO bookings (
        booking_code, invoice_number, crm_lead_id, customer_name, destination,
        date_of_travel, return_date, adults, children, children_ages,
        status, is_nrf, case_owner_id, margin,
        financial_confirmed, financial_confirmed_by, financial_confirmed_at,
        created_by
      ) VALUES (
        $1, $2, $3, $4, $5::text[],
        $6::date, $7::date, $8, $9, $10::int[],
        'active', $11, $12, $13,
        true, $12, now(), $12
      ) RETURNING id`,
      [
        bookingCode,
        invoiceNumber,
        payload.crm_lead_id,
        payload.customer_name,
        payload.destinations,
        payload.date_of_travel,
        payload.return_date,
        payload.adults,
        payload.children,
        agesParam,
        isNrf,
        user.id,
        payload.margin,
      ],
    );

    bookingId = insRows[0].id;

    const travellerIds = [];
    const sevenMo = addMonthsUtc(payload.date_of_travel, 7);

    for (let i = 0; i < payload.travellers.length; i += 1) {
      const t = payload.travellers[i];
      const isPrimary = travellerIsPrimaryBulk(t, i);
      const passportExpiry = String(t.passport_expiry_date).slice(0, 10);
      const passportAlertShown = passportExpiry < sevenMo;

      const { rows: tr } = await client.query(
        `INSERT INTO booking_travellers (
          booking_id, crm_customer_id, is_primary, full_name, dob, nationality, phone, email,
          emergency_contact_name, emergency_contact_phone, travel_document_id, passport_expiry_date,
          passport_alert_shown, passport_alert_acknowledged, visa_needed, visa_exemption_proof_url, sort_order
        ) VALUES (
          $1, $2, $3, $4, $5::date, $6, $7, $8, $9, $10, $11, $12::date,
          $13, COALESCE($14, false), $15, $16, $17
        ) RETURNING id`,
        [
          bookingId,
          t.crm_customer_id != null ? String(t.crm_customer_id).trim() || null : null,
          isPrimary,
          String(t.full_name).trim(),
          String(t.dob).slice(0, 10),
          String(t.nationality).trim(),
          contactColumnValue(t.phone, isPrimary),
          contactColumnValue(t.email, isPrimary),
          contactColumnValue(t.emergency_contact_name, isPrimary),
          contactColumnValue(t.emergency_contact_phone, isPrimary),
          String(t.travel_document_id).trim(),
          passportExpiry,
          passportAlertShown,
          t.passport_alert_acknowledged === true,
          t.visa_needed,
          t.visa_exemption_proof_url != null ? String(t.visa_exemption_proof_url) : null,
          i,
        ],
      );
      travellerIds.push(tr[0].id);
    }

    for (let i = 0; i < payload.pan_cards.length; i += 1) {
      const p = payload.pan_cards[i];
      if (!p.pan_number) {
        throw bad(`pan_cards[${i}].pan_number is required`);
      }
      await client.query(
        `INSERT INTO booking_pan_cards (booking_id, pan_number, name)
         VALUES ($1, $2, $3)`,
        [bookingId, String(p.pan_number).trim(), p.name != null ? String(p.name).trim() : null],
      );
    }

    for (let i = 0; i < payload.flights.length; i += 1) {
      const f = payload.flights[i];
      const self = Boolean(f.is_self_booked);
      const cost = f.cost != null ? Number(f.cost) : null;
      const ex = f.exchange_rate != null ? Number(f.exchange_rate) : 1;
      const inr = self ? null : ceilRupee((cost || 0) * ex);
      const { ourFull, ourPartial } = ourRefundDates(
        Boolean(f.is_refundable),
        f.supplier_full_refund_till,
        f.supplier_partial_refund_till,
      );

      const flightParams = [
        bookingId,
        self,
        f.sector_from != null ? String(f.sector_from) : null,
        f.sector_to != null ? String(f.sector_to) : null,
        f.supplier_id || null,
        f.travel_date != null ? String(f.travel_date).slice(0, 10) : null,
        normalizeTime(f.departure_time),
        f.cabin_class != null ? String(f.cabin_class) : null,
        f.baggage_allowance != null ? String(f.baggage_allowance) : null,
        cost,
        f.currency,
        ex,
        inr,
        Boolean(f.is_refundable),
        f.supplier_full_refund_till != null ? String(f.supplier_full_refund_till).slice(0, 10) : null,
        ourFull,
        f.partial_refund_pct != null ? Number(f.partial_refund_pct) : null,
        f.supplier_partial_refund_till != null ? String(f.supplier_partial_refund_till).slice(0, 10) : null,
        ourPartial,
        f.fare_rules != null ? String(f.fare_rules) : null,
        i,
      ];
      await client.query('SAVEPOINT sp_flight_insert');
      try {
        await client.query(
          `INSERT INTO booking_flights (
          booking_id, is_self_booked, sector_from, sector_to, supplier_id, travel_date, departure_time,
          cabin_class, baggage_allowance, cost, currency, exchange_rate_decimal, inr_equivalent,
          is_refundable, supplier_full_refund_till, our_full_refund_till,
          partial_refund_pct, supplier_partial_refund_till, our_partial_refund_till, fare_rules, sort_order
        ) VALUES (
          $1, $2, $3, $4, $5, $6::date, $7::time, $8, $9, $10, COALESCE($11, 'INR'), COALESCE($12, 1), $13,
          $14, $15::date, $16::date, $17, $18::date, $19::date, $20, $21
        )`,
          flightParams,
        );
        await client.query('RELEASE SAVEPOINT sp_flight_insert');
      } catch (e) {
        if (!isMissingFareRulesColumnError(e)) {
          await client.query('ROLLBACK TO SAVEPOINT sp_flight_insert');
          throw e;
        }
        await client.query('ROLLBACK TO SAVEPOINT sp_flight_insert');
        const noFrParams = [...flightParams.slice(0, -2), flightParams[flightParams.length - 1]];
        await client.query(
          `INSERT INTO booking_flights (
          booking_id, is_self_booked, sector_from, sector_to, supplier_id, travel_date, departure_time,
          cabin_class, baggage_allowance, cost, currency, exchange_rate_decimal, inr_equivalent,
          is_refundable, supplier_full_refund_till, our_full_refund_till,
          partial_refund_pct, supplier_partial_refund_till, our_partial_refund_till, sort_order
        ) VALUES (
          $1, $2, $3, $4, $5, $6::date, $7::time, $8, $9, $10, COALESCE($11, 'INR'), COALESCE($12, 1), $13,
          $14, $15::date, $16::date, $17, $18::date, $19::date, $20
        )`,
          noFrParams,
        );
        await client.query('RELEASE SAVEPOINT sp_flight_insert');
      }
    }

    for (let i = 0; i < payload.hotels.length; i += 1) {
      const h = payload.hotels[i];
      const self = Boolean(h.is_self_booked);
      const cost = h.cost != null ? Number(h.cost) : null;
      const ex = h.exchange_rate != null ? Number(h.exchange_rate) : 1;
      const inr = self ? null : ceilRupee((cost || 0) * ex);
      const cin = h.check_in_date != null ? String(h.check_in_date).slice(0, 10) : null;
      const cout = h.check_out_date != null ? String(h.check_out_date).slice(0, 10) : null;
      const nights =
        cin && cout ? differenceNights(cin, cout) : h.nights != null ? Number(h.nights) : null;
      const { ourFull, ourPartial } = ourRefundDates(
        Boolean(h.is_refundable),
        h.supplier_full_refund_till,
        h.supplier_partial_refund_till,
      );

      const hotelParams = [
        bookingId,
        self,
        h.property_name != null ? String(h.property_name) : null,
        h.supplier_id || null,
        h.city != null ? String(h.city) : null,
        cin,
        cout,
        nights,
        h.room_type != null ? String(h.room_type) : null,
        h.meal_plan != null ? String(h.meal_plan) : null,
        cost,
        h.currency,
        ex,
        inr,
        Boolean(h.is_refundable),
        h.supplier_full_refund_till != null ? String(h.supplier_full_refund_till).slice(0, 10) : null,
        ourFull,
        h.partial_refund_pct != null ? Number(h.partial_refund_pct) : null,
        h.supplier_partial_refund_till != null ? String(h.supplier_partial_refund_till).slice(0, 10) : null,
        ourPartial,
        h.fare_rules != null ? String(h.fare_rules) : null,
        i,
      ];
      await client.query('SAVEPOINT sp_hotel_insert');
      try {
        await client.query(
          `INSERT INTO booking_hotels (
          booking_id, is_self_booked, property_name, supplier_id, city,
          check_in_date, check_out_date, nights, room_type, meal_plan,
          cost, currency, exchange_rate_decimal, inr_equivalent,
          is_refundable, supplier_full_refund_till, our_full_refund_till,
          partial_refund_pct, supplier_partial_refund_till, our_partial_refund_till, fare_rules, sort_order
        ) VALUES (
          $1, $2, $3, $4, $5, $6::date, $7::date, $8, $9, $10,
          $11, COALESCE($12, 'INR'), COALESCE($13, 1), $14,
          $15, $16::date, $17::date, $18, $19::date, $20::date, $21, $22
        )`,
          hotelParams,
        );
        await client.query('RELEASE SAVEPOINT sp_hotel_insert');
      } catch (e) {
        if (!isMissingFareRulesColumnError(e)) {
          await client.query('ROLLBACK TO SAVEPOINT sp_hotel_insert');
          throw e;
        }
        await client.query('ROLLBACK TO SAVEPOINT sp_hotel_insert');
        const noFrParams = [...hotelParams.slice(0, -2), hotelParams[hotelParams.length - 1]];
        await client.query(
          `INSERT INTO booking_hotels (
          booking_id, is_self_booked, property_name, supplier_id, city,
          check_in_date, check_out_date, nights, room_type, meal_plan,
          cost, currency, exchange_rate_decimal, inr_equivalent,
          is_refundable, supplier_full_refund_till, our_full_refund_till,
          partial_refund_pct, supplier_partial_refund_till, our_partial_refund_till, sort_order
        ) VALUES (
          $1, $2, $3, $4, $5, $6::date, $7::date, $8, $9, $10,
          $11, COALESCE($12, 'INR'), COALESCE($13, 1), $14,
          $15, $16::date, $17::date, $18, $19::date, $20::date, $21
        )`,
          noFrParams,
        );
        await client.query('RELEASE SAVEPOINT sp_hotel_insert');
      }
    }

    for (let i = 0; i < payload.land_items.length; i += 1) {
      const l = payload.land_items[i];
      const cost = l.cost != null ? Number(l.cost) : 0;
      const ex = l.exchange_rate != null ? Number(l.exchange_rate) : 1;
      const inr = ceilRupee(cost * ex);
      const { ourFull, ourPartial } = ourRefundDates(
        Boolean(l.is_refundable),
        l.supplier_full_refund_till,
        l.supplier_partial_refund_till,
      );
      if (!l.sub_item_type || !l.description) {
        throw bad(`land_items[${i}] requires sub_item_type and description`);
      }

      await client.query(
        `INSERT INTO booking_land_items (
          booking_id, sub_item_type, description, supplier_id, transfer_type, date,
          cost, currency, exchange_rate_decimal, inr_equivalent,
          is_refundable, supplier_full_refund_till, our_full_refund_till,
          partial_refund_pct, supplier_partial_refund_till, our_partial_refund_till, sort_order
        ) VALUES (
          $1, $2, $3, $4, $5, $6::date,
          $7, COALESCE($8, 'INR'), COALESCE($9, 1), $10,
          $11, $12::date, $13::date, $14, $15::date, $16::date, $17
        )`,
        [
          bookingId,
          l.sub_item_type,
          String(l.description).trim(),
          l.supplier_id || null,
          normalizeTransferType(l.transfer_type),
          l.date != null ? String(l.date).slice(0, 10) : null,
          cost,
          l.currency,
          ex,
          inr,
          Boolean(l.is_refundable),
          l.supplier_full_refund_till != null ? String(l.supplier_full_refund_till).slice(0, 10) : null,
          ourFull,
          l.partial_refund_pct != null ? Number(l.partial_refund_pct) : null,
          l.supplier_partial_refund_till != null ? String(l.supplier_partial_refund_till).slice(0, 10) : null,
          ourPartial,
          i,
        ],
      );
    }

    for (let i = 0; i < payload.visas.length; i += 1) {
      const v = payload.visas[i];
      const selfArr = Boolean(v.is_self_arranged);
      const idxs = Array.isArray(v.applicant_traveller_indexes) ? v.applicant_traveller_indexes : [];
      if (idxs.length < 1) {
        throw bad(`visas[${i}].applicant_traveller_indexes must reference at least one traveller`);
      }
      const cpp = v.cost_per_applicant != null ? Number(v.cost_per_applicant) : 0;
      const nApp = idxs.length;
      const totalCost = ceilRupee(cpp * nApp);
      const ex = v.exchange_rate != null ? Number(v.exchange_rate) : 1;
      const inr = selfArr ? null : ceilRupee(totalCost * ex);
      let ourFull = null;
      if (!selfArr && v.is_refundable && v.supplier_full_refund_till) {
        ourFull = subDaysUtc(String(v.supplier_full_refund_till).slice(0, 10), 5);
      }

      const { rows: vr } = await client.query(
        `INSERT INTO booking_visas (
          booking_id, is_self_arranged, country, visa_type, supplier_id,
          cost_per_applicant, number_of_applicants, total_cost,
          currency, exchange_rate_decimal, inr_equivalent,
          is_refundable, supplier_full_refund_till, our_full_refund_till, sort_order
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, COALESCE($9, 'INR'), COALESCE($10, 1), $11,
          $12, $13::date, $14::date, $15
        ) RETURNING id`,
        [
          bookingId,
          selfArr,
          v.country != null ? String(v.country) : null,
          v.visa_type != null ? String(v.visa_type) : null,
          v.supplier_id || null,
          cpp,
          nApp,
          totalCost,
          v.currency,
          ex,
          inr,
          Boolean(v.is_refundable),
          v.supplier_full_refund_till != null ? String(v.supplier_full_refund_till).slice(0, 10) : null,
          ourFull,
          i,
        ],
      );
      const visaId = vr[0].id;

      for (const ti of idxs) {
        const tid = travellerIds[Number(ti)];
        if (!tid) {
          throw bad(`visas[${i}] invalid applicant_traveller_index ${ti}`);
        }
        await client.query(
          `INSERT INTO booking_visa_applicants (visa_id, traveller_id) VALUES ($1, $2)`,
          [visaId, tid],
        );
      }
    }

    for (let i = 0; i < payload.supplier_tranches.length; i += 1) {
      const st = payload.supplier_tranches[i];
      const amt = Number(st.amount);
      const ex = st.exchange_rate != null ? Number(st.exchange_rate) : 1;
      const inr = ceilRupee(amt * ex);
      await client.query(
        `INSERT INTO supplier_tranches (
          booking_id, supplier_id, amount, currency, exchange_rate_decimal, inr_equivalent, payment_date, status
        ) VALUES ($1, $2, $3, COALESCE($4, 'INR'), COALESCE($5, 1), $6, $7::date, 'pending')`,
        [
          bookingId,
          st.supplier_id || null,
          amt,
          st.currency,
          ex,
          inr,
          String(st.payment_date).slice(0, 10),
        ],
      );
    }

    await recalculateBookingFinancials(client, bookingId);
    await replaceGuestTranchesForBooking(client, bookingId);

    const { rows: finalRows } = await client.query('SELECT * FROM bookings WHERE id = $1', [bookingId]);
    const bookingRow = finalRows[0];

    await client.query('COMMIT');

    await logService.log({
      event_type: 'BOOKING_CREATED',
      entity_type: 'booking',
      entity_id: bookingId,
      actor_id: user.id,
      actor_role: user.role,
      before_state: null,
      after_state: bookingRow,
      metadata: {},
    });

    await logService.log({
      event_type: 'FINANCIAL_CONFIRMED',
      entity_type: 'booking',
      entity_id: bookingId,
      actor_id: user.id,
      actor_role: user.role,
      before_state: null,
      after_state: {
        financial_confirmed: true,
        financial_confirmed_at: bookingRow.financial_confirmed_at,
        total_payable: bookingRow.total_payable,
        invoice_number: bookingRow.invoice_number,
      },
      metadata: {},
    });

    if (isNrf) {
      await logService.log({
        event_type: 'NRF_FLAG_SET',
        entity_type: 'booking',
        entity_id: bookingId,
        actor_id: user.id,
        actor_role: user.role,
        before_state: null,
        after_state: { is_nrf: true },
        metadata: {},
      });
    }

    return bookingId;
  } catch (e) {
    try {
      await client.query('ROLLBACK');
    } catch {
      /* ignore */
    }
    throw e;
  } finally {
    await client.end();
  }
}

module.exports = { createBookingFromPayload, validateAndNormalizeBody };
