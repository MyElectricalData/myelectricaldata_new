-- Add debug_mode column to users table
-- This column controls whether debug logs are shown in the browser console for a specific user

ALTER TABLE users ADD COLUMN debug_mode BOOLEAN NOT NULL DEFAULT FALSE;
