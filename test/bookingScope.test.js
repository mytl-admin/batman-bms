const test = require('node:test');
const assert = require('node:assert/strict');
const { bookingsAgentOrFilter, canAgentAccessBooking } = require('../src/utils/bookingScope');

const agentId = '550e8400-e29b-41d4-a716-446655440099';

test('bookingsAgentOrFilter builds PostgREST or string', () => {
  const f = bookingsAgentOrFilter(agentId);
  assert.equal(f, `case_owner_id.eq.${agentId},case_manager_id.eq.${agentId}`);
});

test('canAgentAccessBooking', () => {
  const b = { case_owner_id: agentId, case_manager_id: null };
  assert.equal(canAgentAccessBooking(b, agentId), true);
  assert.equal(canAgentAccessBooking(b, 'other'), false);
  assert.equal(canAgentAccessBooking(b, null), false);
});
