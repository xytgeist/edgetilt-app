-- =====================================================
-- FULL SCRIPT: Create + Fill machines table (catalog AP slots)
-- Paste into Supabase SQL editor, or run via CLI against a dev project.
-- WARNING: Section 5 TRUNCATE wipes existing machines + guides. Do not
-- re-run that block in production after you have real guide content.
-- =====================================================

-- 1. Create the machines table
CREATE TABLE IF NOT EXISTS machines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,
  name text NOT NULL,
  manufacturer text,
  type text,
  difficulty text CHECK (difficulty IN ('Beginner', 'Intermediate', 'Advanced')),
  popularity text,
  nerf_risk text CHECK (nerf_risk IN ('Low', 'Medium', 'High')),
  has_calculator boolean DEFAULT false,
  calculator_slug text,
  thumbnail_url text,
  release_year smallint,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 2. (Optional but recommended) Create the guides table
CREATE TABLE IF NOT EXISTS guides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  machine_id uuid REFERENCES machines(id) ON DELETE CASCADE,
  slug text UNIQUE NOT NULL,
  title text NOT NULL,
  content_markdown text NOT NULL,
  card_ev_threshold text,
  difficulty text,
  last_updated date DEFAULT CURRENT_DATE,
  published boolean DEFAULT true,
  view_count integer DEFAULT 0,
  thumbnail_url text,
  diagram_urls text[],
  related_machine_slugs text[],
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 3. Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_machines_type ON machines(type);
CREATE INDEX IF NOT EXISTS idx_machines_manufacturer ON machines(manufacturer);
CREATE INDEX IF NOT EXISTS idx_guides_published ON guides(published);

-- 4. Enable Row Level Security (safe defaults)
ALTER TABLE machines ENABLE ROW LEVEL SECURITY;
ALTER TABLE guides ENABLE ROW LEVEL SECURITY;

-- Public read access (you can tighten this later)
DROP POLICY IF EXISTS "Public can read machines" ON machines;
CREATE POLICY "Public can read machines" ON machines FOR SELECT USING (true);

DROP POLICY IF EXISTS "Public can read published guides" ON guides;
CREATE POLICY "Public can read published guides" ON guides FOR SELECT USING (published = true);

-- 5. Clear existing data and insert the catalog machines
TRUNCATE TABLE guides CASCADE;
TRUNCATE TABLE machines CASCADE;

INSERT INTO machines (slug, name, manufacturer, type, difficulty, popularity, nerf_risk, has_calculator, calculator_slug) VALUES
('stack-up-pays', 'Stack Up Pays', 'IGT', 'Persistent State', 'Intermediate', 'Very Common', 'Medium', true, 'stack-up-pays'),
('phoenix-link', 'Phoenix Link', 'Aristocrat', 'Must Hit By', 'Beginner', 'Very Common', 'Medium', false, null),
('wolf-run-eclipse', 'Wolf Run Eclipse', 'IGT', 'Persistent State', 'Advanced', 'Common', 'High', false, null),
('regal-riches', 'Regal Riches', 'IGT', 'Persistent State', 'Intermediate', 'Common', 'Medium', false, null),
('regal-link', 'Regal Link', 'IGT', 'Hybrid', 'Intermediate', 'Common', 'Medium', false, null),
('raise-the-sails', 'Raise the Sails', 'IGT', 'Persistent State', 'Intermediate', 'Common', 'Low', false, null),
('wu-jin-pen', 'Wu Jin Pen', 'Light & Wonder', 'Persistent State', 'Advanced', 'Common', 'Medium', false, null),
('scarab', 'Scarab', 'Light & Wonder', 'Persistent State', 'Intermediate', 'Common', 'Medium', false, null),
('buffalo-ascension', 'Buffalo Ascension', 'Aristocrat', 'Persistent State', 'Intermediate', 'Very Common', 'High', false, null),
('eagle-ascension', 'Buffalo Eagle Ascension', 'Aristocrat', 'Persistent State', 'Intermediate', 'Very Common', 'High', false, null),
('thunder-cash', 'Thunder Cash', 'Ainsworth', 'Must Hit By', 'Beginner', 'Very Common', 'Low', false, null),
('eagle-bucks', 'Eagle Bucks', 'Ainsworth', 'Must Hit By', 'Beginner', 'Common', 'Low', false, null),
('mustang-money-2', 'Mustang Money 2', 'Ainsworth', 'Must Hit By', 'Beginner', 'Common', 'Low', false, null),
('lucha-kitty', 'Lucha Kitty', 'Ainsworth', 'Must Hit By', 'Beginner', 'Common', 'Low', false, null),
('sumo-kitty', 'Sumo Kitty', 'Ainsworth', 'Must Hit By', 'Beginner', 'Common', 'Low', false, null),
('enforcer', 'Enforcer (Ainsworth)', 'Ainsworth', 'Must Hit By', 'Beginner', 'Common', 'Low', false, null),
('rich-little-piggies', 'Rich Little Piggies', 'Aristocrat', 'Persistent State', 'Intermediate', 'Very Common', 'Medium', false, null),
('ocean-magic-grand', 'Ocean Magic Grand', 'Light & Wonder', 'Persistent State', 'Intermediate', 'Common', 'Medium', false, null),
('dragon-rush', 'Dragon Rush', 'Light & Wonder', 'Persistent State', 'Advanced', 'Common', 'High', false, null),
('dragon-spheres', 'Dragon Spheres', 'Light & Wonder', 'Persistent State', 'Advanced', 'Common', 'High', false, null),
('cash-machine-lock', 'Cash Machine Lock', 'Light & Wonder', 'Lock Game', 'Beginner', 'Common', 'Low', true, 'cash-machine-lock'),
('mining-mayhem-gold', 'Mining Mayhem Gold', 'Aristocrat', 'Persistent State', 'Advanced', 'Common', 'High', false, null),
('life-of-luxury', 'Life of Luxury', 'IGT', 'Persistent State', 'Intermediate', 'Common', 'Medium', false, null),
('golden-egypt', 'Golden Egypt', 'Light & Wonder', 'Persistent State', 'Intermediate', 'Rare', 'Medium', false, null),
('golden-jungle-grand', 'Golden Jungle Grand', 'Light & Wonder', 'Persistent State', 'Intermediate', 'Rare', 'Medium', false, null),
('aladdins-fortune', 'Aladdin''s Fortune', 'Light & Wonder', 'Persistent State', 'Intermediate', 'Rare', 'Medium', false, null),
('treasure-box', 'Treasure Box', 'Light & Wonder', 'Persistent State', 'Intermediate', 'Rare', 'Medium', false, null),
('legend-of-the-phoenix', 'Legend of the Phoenix', 'IGT', 'Persistent State', 'Intermediate', 'Common', 'Medium', false, null),
('sh-green-stamps', 'S&H Green Stamps', 'Classic', 'Accumulator', 'Beginner', 'Rare (nostalgia)', 'Low', false, null),
('farmville-style', 'Farmville-style Collector', 'Various', 'Accumulator', 'Intermediate', 'Rare', 'Medium', false, null),
('nfl-variable-state', 'NFL Variable State Slot', 'Various', 'Persistent State', 'Advanced', 'Rare', 'High', false, null),
('pay-upgrade', 'Pay Upgrade', 'Various', 'Persistent State', 'Advanced', 'Rare', 'High', false, null),
('aztec-banner', 'Aztec Banner', 'Aristocrat', 'Persistent State', 'Intermediate', 'Common', 'Medium', false, null),
('pegasus-banner', 'Pegasus Banner', 'Aristocrat', 'Persistent State', 'Intermediate', 'Common', 'Medium', false, null),
('hold-n-gold-acorn-falls', 'Hold N Gold Acorn Falls', 'Aristocrat', 'Persistent State', 'Intermediate', 'Common', 'Medium', false, null),
('hot-spell', 'Hot Spell', 'Aristocrat', 'Persistent State', 'Intermediate', 'Common', 'Medium', false, null),
('buffalo-stampede', 'Buffalo Stampede', 'Aristocrat', 'Persistent State', 'Intermediate', 'Very Common', 'High', false, null),
('buffalo-link', 'Buffalo Link', 'Aristocrat', 'Persistent State', 'Intermediate', 'Very Common', 'High', false, null),
('buffalo-diamond', 'Buffalo Diamond', 'Aristocrat', 'Persistent State', 'Intermediate', 'Common', 'High', false, null),
('san-xing-riches', 'San Xing Riches', 'IGT', 'Persistent State', 'Intermediate', 'Common', 'Low', false, null),
('lucky-lemmings-stampede', 'Lucky Lemmings Stampede', 'Aristocrat', 'Persistent State', 'Intermediate', 'Common', 'Medium', false, null),
('treasure-blast', 'Treasure Blast', 'Aristocrat', 'Persistent State', 'Intermediate', 'Common', 'Medium', false, null),
('magic-treasures', 'Magic Treasures', 'Aristocrat', 'Persistent State', 'Intermediate', 'Common', 'Medium', false, null),
('plants-vs-zombies-3d', 'Plants vs Zombies 3D: Ancient Egypt', 'IGT', 'Accumulator', 'Intermediate', 'Very Common', 'Medium', false, null);
