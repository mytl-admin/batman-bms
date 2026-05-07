-- Non-primary travellers may omit phone / email / emergency contacts at DB level.
ALTER TABLE booking_travellers ALTER COLUMN phone DROP NOT NULL;
ALTER TABLE booking_travellers ALTER COLUMN email DROP NOT NULL;
ALTER TABLE booking_travellers ALTER COLUMN emergency_contact_name DROP NOT NULL;
ALTER TABLE booking_travellers ALTER COLUMN emergency_contact_phone DROP NOT NULL;
