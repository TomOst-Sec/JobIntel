-- 014: Add external applicant count to jobs + index for internal count queries.
ALTER TABLE jobs ADD COLUMN external_applicant_count INTEGER;
CREATE INDEX IF NOT EXISTS idx_applications_job_id ON job_applications(job_id);
