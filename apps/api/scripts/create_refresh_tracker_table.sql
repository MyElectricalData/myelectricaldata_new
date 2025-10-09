-- Create refresh_tracker table to store last refresh times
CREATE TABLE IF NOT EXISTS refresh_tracker (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cache_type VARCHAR NOT NULL UNIQUE,
    last_refresh TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_refresh_tracker_cache_type ON refresh_tracker(cache_type);

-- Optional: Add initial records
INSERT INTO refresh_tracker (cache_type, last_refresh)
VALUES
    ('tempo', NOW() - INTERVAL '1 day'),
    ('ecowatt', NOW() - INTERVAL '1 day')
ON CONFLICT (cache_type) DO NOTHING;