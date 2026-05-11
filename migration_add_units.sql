-- Run this in Supabase SQL Editor
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS units NUMERIC;
