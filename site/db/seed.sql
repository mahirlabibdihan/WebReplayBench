-- Deterministic seed. Every reset restores exactly this state.
SET search_path TO app, meta;

INSERT INTO users (id, username, password_hash, full_name, email, phone) VALUES
    (1, 'jordan', encode(sha256('playground123'::bytea), 'hex'), 'Jordan Lee', 'jordan.lee@example.test', '555-0100');

INSERT INTO settings (user_id, email_digest, sms_alerts, items_per_page, profile_public) VALUES
    (1, 'daily', true, 12, false);

INSERT INTO products (id, name, category, price_cents, stock, description, specs) VALUES
    (1,  'Aurora Wireless Mouse',        'Electronics', 2499,  40, 'Compact 2.4 GHz wireless mouse with silent clicks.', 'DPI: 1600 | Battery: AA x1 | Weight: 78 g'),
    (2,  'Aurora Wireless Mouse Pro',    'Electronics', 3999,  25, 'Ergonomic wireless mouse with 6 programmable buttons.', 'DPI: 4000 | Battery: USB-C rechargeable | Weight: 96 g'),
    (3,  'Nimbus Travel Mug',            'Home',        1850,  60, 'Insulated 350 ml mug that keeps drinks hot for 6 hours.', 'Capacity: 350 ml | Material: steel | Lid: leak-proof'),
    (4,  'Summit Hiking Boots',          'Outdoor',     12900, 15, 'Waterproof leather boots with a grippy outsole.', 'Sizes: 38-46 | Waterproof: yes | Weight: 1.1 kg'),
    (5,  'USB-C Cable 2m',               'Electronics', 999,   120,'Braided USB-C to USB-C cable, 60 W.', 'Length: 2 m | Power: 60 W | Data: USB 2.0'),
    (6,  'USB-C Cable 1m',               'Electronics', 749,   150,'Braided USB-C to USB-C cable, 60 W.', 'Length: 1 m | Power: 60 W | Data: USB 2.0'),
    (7,  'Old Phone Case',               'Electronics', 1200,  8,  'Slim case for older phone models.', 'Material: TPU | Colour: black'),
    (8,  'Mechanical Keyboard K2',       'Electronics', 8900,  20, 'Hot-swappable mechanical keyboard, brown switches.', 'Layout: 75% | Switches: brown | Backlight: white'),
    (9,  'Noise-Cancelling Headphones',  'Electronics', 19900, 12, 'Over-ear headphones with adaptive noise cancelling.', 'Battery: 30 h | Bluetooth 5.3 | Weight: 250 g'),
    (10, 'Cork Yoga Mat',                'Outdoor',     2900,  30, 'Non-slip natural cork yoga mat.', 'Size: 183 x 61 cm | Thickness: 4 mm'),
    (11, 'Arc Desk Lamp',                'Home',        3400,  22, 'Dimmable LED desk lamp with USB port.', 'Brightness: 5 levels | Colour temp: 3000-6000 K'),
    (12, 'Trail Water Bottle',           'Outdoor',     1500,  80, 'BPA-free 750 ml bottle with carry loop.', 'Capacity: 750 ml | Material: Tritan'),
    (13, 'Commuter Backpack',            'Outdoor',     5900,  18, 'Water-resistant 20 L backpack with laptop sleeve.', 'Volume: 20 L | Laptop: up to 15 in'),
    (14, 'Dot Grid Notebook Set',        'Home',        1100,  70, 'Three A5 dot-grid notebooks.', 'Pages: 120 each | Paper: 100 gsm'),
    (15, 'House Blend Coffee Beans',     'Home',        1600,  45, 'Medium roast whole beans, 500 g.', 'Weight: 500 g | Roast: medium'),
    (16, 'Pocket Bluetooth Speaker',     'Electronics', 4900,  33, 'Splash-proof speaker with 12 h battery.', 'Battery: 12 h | IPX5 | Weight: 210 g');

INSERT INTO reviews (product_id, author, stars, body)
SELECT p.id, a.author, a.stars, a.body || ' (' || p.name || ')'
FROM products p
CROSS JOIN (VALUES
    ('Maya',   5, 'Exactly as described, would buy again.'),
    ('Tomás',  4, 'Good value for the price.'),
    ('Ishaan', 3, 'Does the job, nothing special.'),
    ('Chloe',  5, 'Arrived quickly and works great.'),
    ('Ren',    4, 'Solid build quality.'),
    ('Amara',  2, 'Smaller than I expected.'),
    ('Felix',  4, 'Happy with it overall.')
) AS a(author, stars, body);

INSERT INTO wishlist (user_id, product_id) VALUES (1, 13);

INSERT INTO cart_items (user_id, product_id, qty) VALUES
    (1, 7, 1),
    (1, 15, 2);

INSERT INTO addresses (id, user_id, label, line, is_default) VALUES
    (1, 1, 'Home', '12 Elm Street, Springfield', true),
    (2, 1, 'Office', '400 Market Avenue, Suite 9, Springfield', false);

INSERT INTO coupons (code, description, percent_off) VALUES
    ('SAVE15',    '15% off your next order',          15),
    ('WELCOME10', '10% off for new members',          10),
    ('FREESHIP',  'Free standard shipping (5% off)',   5);

INSERT INTO coupon_claims (user_id, code) VALUES (1, 'WELCOME10');

INSERT INTO orders (id, user_id, address_id, shipping, coupon_code, total_cents, placed_at) VALUES
    (1, 1, 1, 'standard', NULL, 3398, '2026-08-14');
INSERT INTO order_items (order_id, product_id, qty, price_cents) VALUES
    (1, 14, 1, 1100),
    (1, 12, 1, 1500);

INSERT INTO messages (id, user_id, sender, subject, body, sent_at, sort_key, is_read, is_starred) VALUES
    (1,  1, 'Priya Shah',     'Q3 budget draft',            'Hi Jordan, attached is the Q3 budget draft. Please review and reply with your approval or comments.', 'Sep 26', 114, false, false),
    (2,  1, 'IT Support',     'Your verification code',     'Use verification code 482913 to finish signing in. The code expires in 30 minutes.',                   'Sep 26', 113, false, false),
    (3,  1, 'Promo Deals',    'Flash sale: 40% off audio',  'Headphones and speakers are 40% off for 24 hours only.',                                              'Sep 25', 112, false, false),
    (4,  1, 'Weekly Picks',   'This week''s top picks',     'Our editors picked five products you will love. Not interested? You can unsubscribe from Weekly Picks.', 'Sep 25', 111, false, false),
    (5,  1, 'Sam Chen',       'Lunch on Friday?',           'Are you free for lunch on Friday around 12:30?',                                                       'Sep 24', 110, true,  false),
    (6,  1, 'Promo Deals',    'Last chance: free shipping', 'Free shipping on every order ends tonight.',                                                          'Sep 24', 109, false, false),
    (7,  1, 'Priya Shah',     'Q2 budget final',            'The Q2 budget is final. No action needed.',                                                           'Sep 20', 108, true,  true),
    (8,  1, 'Alex Rivera',    'Trip photos',                'Uploaded the trip photos to the shared album.',                                                       'Sep 19', 107, true,  false),
    (9,  1, 'Promo Deals',    'New arrivals just landed',   'Check out the new outdoor collection.',                                                               'Sep 18', 106, true,  false),
    (10, 1, 'IT Support',     'Password expiry notice',     'Your password will expire in 14 days.',                                                               'Sep 15', 105, true,  false),
    (11, 1, 'Billing',        'Receipt for order #1',       'Thanks for your order. Total: $33.98.',                                                               'Aug 14', 104, true,  false);

INSERT INTO newsletter_subscriptions (user_id, list, title, subscribed) VALUES
    (1, 'weekly-picks',    'Weekly Picks',    true),
    (1, 'product-updates', 'Product Updates', true),
    (1, 'outdoor-club',    'Outdoor Club',    false);

INSERT INTO todos (user_id, title, done) VALUES
    (1, 'Renew passport', false),
    (1, 'Buy groceries',  true),
    (1, 'Call plumber',   false);

INSERT INTO notes (user_id, body) VALUES (1, 'Gift ideas: travel mug for Sam, yoga mat for Alex.');

-- Keep sequences past the explicit ids.
SELECT setval('app.users_id_seq',     (SELECT MAX(id) FROM app.users));
SELECT setval('app.products_id_seq',  (SELECT MAX(id) FROM app.products));
SELECT setval('app.addresses_id_seq', (SELECT MAX(id) FROM app.addresses));
SELECT setval('app.orders_id_seq',    (SELECT MAX(id) FROM app.orders));
SELECT setval('app.messages_id_seq',  (SELECT MAX(id) FROM app.messages));
