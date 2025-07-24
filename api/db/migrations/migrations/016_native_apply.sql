-- 016: Native apply flow columns — track how applications were submitted.
ALTER TABLE job_applications ADD COLUMN apply_method TEXT DEFAULT 'native';
ALTER TABLE job_applications ADD COLUMN resume_path TEXT;
ALTER TABLE job_applications ADD COLUMN cover_letter TEXT;
