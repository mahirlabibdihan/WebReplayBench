-- Deterministic seed. Every reset restores exactly this state.
SET search_path TO app, meta;

INSERT INTO users (id, username, password_hash, full_name, email, phone) VALUES
    (1, 'jordan', encode(sha256('playground123'::bytea), 'hex'), 'Jordan Lee', 'jordan.lee@example.test', '555-0100');

INSERT INTO settings (user_id, email_digest, sms_alerts, items_per_page, profile_public) VALUES
    (1, 'daily', true, 12, false);

INSERT INTO products (id, name, category, price_cents, stock, description, specs) VALUES
    (1,  'Modern Chair',                 'Living Room', 2499,  40, 'Upholstered armchair with solid oak legs.', 'Seat height: 45 cm | Fabric: blue weave | Legs: oak'),
    (2,  'Modern Chair XL',              'Living Room', 3999,  25, 'Wider armchair with a high back and lumbar cushion.', 'Seat height: 47 cm | Fabric: blue weave | Legs: oak'),
    (3,  'Ceramic Vase',                 'Decor',       1850,  60, 'Hand-glazed 30 cm vase in matte white.', 'Height: 30 cm | Material: stoneware | Finish: matte'),
    (4,  'Teak Garden Bench',            'Outdoor',     12900, 15, 'Weatherproof three-seat bench in solid teak.', 'Width: 150 cm | Material: teak | Seats: 3'),
    (5,  'Linen Cushion Cover 50cm',     'Living Room', 999,   120,'Washed linen cushion cover with a hidden zip.', 'Size: 50 x 50 cm | Material: linen | Insert: not included'),
    (6,  'Linen Cushion Cover 45cm',     'Living Room', 749,   150,'Washed linen cushion cover with a hidden zip.', 'Size: 45 x 45 cm | Material: linen | Insert: not included'),
    (7,  'Old Picture Frame',            'Living Room', 1200,  8,  'Discontinued wooden frame for 10 x 15 cm photos.', 'Material: pine | Colour: black'),
    (8,  'Walnut Bookshelf',             'Living Room', 8900,  20, 'Five-shelf bookcase in walnut veneer.', 'Height: 180 cm | Shelves: 5 | Width: 80 cm'),
    (9,  'Velvet Loveseat',              'Living Room', 19900, 12, 'Two-seat velvet sofa with tapered legs.', 'Width: 140 cm | Fabric: velvet | Seats: 2'),
    (10, 'Woven Outdoor Rug',            'Outdoor',     2900,  30, 'Reversible rug that dries quickly after rain.', 'Size: 180 x 120 cm | Material: polypropylene'),
    (11, 'Arc Floor Lamp',               'Decor',       3400,  22, 'Dimmable arc lamp with a linen shade.', 'Height: 190 cm | Brightness: 5 levels | Bulb: E27'),
    (12, 'Terracotta Planter',           'Outdoor',     1500,  80, 'Frost-resistant 25 cm planter with a drainage hole.', 'Diameter: 25 cm | Material: terracotta'),
    (13, 'Folding Bistro Table',         'Outdoor',     5900,  18, 'Foldable round steel table for two.', 'Diameter: 60 cm | Material: steel | Folds: yes'),
    (14, 'Scented Candle Set',           'Decor',       1100,  70, 'Three soy candles: cedar, fig and linen.', 'Burn time: 30 h each | Wax: soy'),
    (15, 'Woven Storage Basket',         'Decor',       1600,  45, 'Seagrass basket with handles.', 'Size: 40 x 30 cm | Material: seagrass'),
    (16, 'Round Accent Stool',           'Living Room', 4900,  33, 'Low upholstered stool that doubles as a side table.', 'Height: 42 cm | Fabric: boucle | Legs: oak');

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
    (3,  1, 'Promo Deals',    'Flash sale: 40% off seating',  'Loveseats and stools are 40% off for 24 hours only.',                                              'Sep 25', 112, false, false),
    (4,  1, 'Weekly Picks',   'This week''s top picks',     'Our editors picked five products you will love. Not interested? You can unsubscribe from Weekly Picks.', 'Sep 25', 111, false, false),
    (5,  1, 'Sam Chen',       'Lunch on Friday?',           'Are you free for lunch on Friday around 12:30?',                                                       'Sep 24', 110, true,  false),
    (6,  1, 'Promo Deals',    'Last chance: free shipping', 'Free shipping on every order ends tonight.',                                                          'Sep 24', 109, false, false),
    (7,  1, 'Priya Shah',     'Q2 budget final',            'The Q2 budget is final. No action needed.',                                                           'Sep 20', 108, true,  true),
    (8,  1, 'Alex Rivera',    'Trip photos',                'Uploaded the trip photos to the shared album.',                                                       'Sep 19', 107, true,  false),
    (9,  1, 'Promo Deals',    'New arrivals just landed',   'Check out the new outdoor furniture collection.',                                                               'Sep 18', 106, true,  false),
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

INSERT INTO notes (user_id, body) VALUES (1, 'Gift ideas: ceramic vase for Sam, outdoor rug for Alex.');

-- Keep sequences past the explicit ids.
SELECT setval('app.users_id_seq',     (SELECT MAX(id) FROM app.users));
SELECT setval('app.products_id_seq',  (SELECT MAX(id) FROM app.products));
SELECT setval('app.addresses_id_seq', (SELECT MAX(id) FROM app.addresses));
SELECT setval('app.orders_id_seq',    (SELECT MAX(id) FROM app.orders));
SELECT setval('app.messages_id_seq',  (SELECT MAX(id) FROM app.messages));
