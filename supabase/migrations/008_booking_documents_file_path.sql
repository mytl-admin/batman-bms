-- Persist storage object path; signed URLs are never stored — generated on GET responses.
ALTER TABLE booking_documents ADD COLUMN IF NOT EXISTS file_path VARCHAR;
ALTER TABLE booking_documents ALTER COLUMN file_url DROP NOT NULL;
