-- Must run before core_tables: students_search_trgm_idx uses gin_trgm_ops (STU-01)
CREATE EXTENSION IF NOT EXISTS pg_trgm;
