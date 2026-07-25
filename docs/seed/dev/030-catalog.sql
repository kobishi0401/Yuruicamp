-- 開發環境商品目錄資料；由 002-dev-seed.sql 統一載入。
-- 固定 ID 與預期價格請同步核對 docs/data/product-catalog-seed-manifest.md。

INSERT INTO public.equipment_items (id, category_id, brand_id, name, description, active) VALUES ('E001', 1, 'coleman', 'Coleman 六人帳篷', '<p>適合露營使用。</p>', true) ON CONFLICT (id) DO NOTHING;
INSERT INTO public.products (id, status, item_id) VALUES ('P001', 'active', 'E001') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.equipment_images (item_id, sort_order, url, alt_text) VALUES ('E001', 0, '/assets/images/products/P001-1.jpg', 'Coleman 六人帳篷') ON CONFLICT (item_id, sort_order) DO NOTHING;
INSERT INTO public.equipment_images (item_id, sort_order, url, alt_text) VALUES ('E001', 1, '/assets/images/products/P001-2.jpg', 'Coleman 六人帳篷') ON CONFLICT (item_id, sort_order) DO NOTHING;
INSERT INTO public.equipment_images (item_id, sort_order, url, alt_text) VALUES ('E001', 2, '/assets/images/products/P001-3.jpg', 'Coleman 六人帳篷') ON CONFLICT (item_id, sort_order) DO NOTHING;
INSERT INTO public.equipment_interest_tags (item_id, tag) VALUES ('E001', 'tent') ON CONFLICT (item_id, tag) DO NOTHING;
INSERT INTO public.equipment_tags (item_id, tag) VALUES ('E001', '帳篷') ON CONFLICT (item_id, tag) DO NOTHING;
INSERT INTO public.equipment_tags (item_id, tag) VALUES ('E001', 'Coleman') ON CONFLICT (item_id, tag) DO NOTHING;
INSERT INTO public.equipment_specifications (item_id, spec_key, value) VALUES ('E001', 'weight', '4.2 kg') ON CONFLICT (item_id, spec_key) DO NOTHING;
INSERT INTO public.equipment_specifications (item_id, spec_key, value) VALUES ('E001', 'capacity', '6 人') ON CONFLICT (item_id, spec_key) DO NOTHING;
INSERT INTO public.equipment_specifications (item_id, spec_key, value) VALUES ('E001', 'material', '聚酯纖維') ON CONFLICT (item_id, spec_key) DO NOTHING;
INSERT INTO public.equipment_specifications (item_id, spec_key, value) VALUES ('E001', 'waterproof', '3000mm') ON CONFLICT (item_id, spec_key) DO NOTHING;
INSERT INTO public.product_variants (id, product_id, sku, color, size, price, specification, status) VALUES ('V001', 'P001', 'TENT-OLIVE', '深橄欖綠', NULL, 3200.00, '深橄欖綠', 'active') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.product_variants (id, product_id, sku, color, size, price, specification, status) VALUES ('V002', 'P001', 'TENT-SAND', '沙漠棕', NULL, 3300.00, '沙漠棕', 'active') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.product_variants (id, product_id, sku, color, size, price, specification, status) VALUES ('V003', 'P001', 'TENT-GRAY', '太空灰', NULL, 3200.00, '太空灰', 'active') ON CONFLICT (id) DO NOTHING;

INSERT INTO public.equipment_items (id, category_id, brand_id, name, description, active) VALUES ('E002', 1, 'msr', 'MSR 超輕量帳篷', '<p><strong>MSR 超輕量帳篷</strong> 為 Yuruicamp 精選的帳篷商品，規格：<em>沙漠卡其</em>。</p><p>適合露營、登山與戶外活動使用，後台可透過 Summernote 編輯器調整此描述。</p>', true) ON CONFLICT (id) DO NOTHING;
INSERT INTO public.products (id, status, item_id) VALUES ('P002', 'active', 'E002') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.equipment_images (item_id, sort_order, url, alt_text) VALUES ('E002', 0, '/assets/images/products/P002-1.jpg', 'MSR 超輕量帳篷') ON CONFLICT (item_id, sort_order) DO NOTHING;
INSERT INTO public.equipment_images (item_id, sort_order, url, alt_text) VALUES ('E002', 1, '/assets/images/products/P002-2.jpg', 'MSR 超輕量帳篷') ON CONFLICT (item_id, sort_order) DO NOTHING;
INSERT INTO public.equipment_images (item_id, sort_order, url, alt_text) VALUES ('E002', 2, '/assets/images/products/P002-3.jpg', 'MSR 超輕量帳篷') ON CONFLICT (item_id, sort_order) DO NOTHING;
INSERT INTO public.equipment_interest_tags (item_id, tag) VALUES ('E002', 'tent') ON CONFLICT (item_id, tag) DO NOTHING;
INSERT INTO public.equipment_tags (item_id, tag) VALUES ('E002', '帳篷') ON CONFLICT (item_id, tag) DO NOTHING;
INSERT INTO public.equipment_tags (item_id, tag) VALUES ('E002', 'MSR') ON CONFLICT (item_id, tag) DO NOTHING;
INSERT INTO public.product_variants (id, product_id, sku, color, size, price, specification, status) VALUES ('V002-01', 'P002', 'P002-01', '沙漠卡其', NULL, 9800.00, '沙漠卡其', 'active') ON CONFLICT (id) DO NOTHING;

INSERT INTO public.equipment_items (id, category_id, brand_id, name, description, active) VALUES ('E003', 2, 'yuruicamp', '充氣式睡墊', '<p><strong>充氣式睡墊</strong> 為 Yuruicamp 精選的睡袋商品，提供 <em>S / M / L</em> 三種尺寸。</p><p>適合露營、登山與戶外活動使用，後台可透過 Summernote 編輯器調整此描述。</p>', true) ON CONFLICT (id) DO NOTHING;
INSERT INTO public.products (id, status, item_id) VALUES ('P003', 'active', 'E003') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.equipment_images (item_id, sort_order, url, alt_text) VALUES ('E003', 0, '/assets/images/products/P003-1.jpg', '充氣式睡墊') ON CONFLICT (item_id, sort_order) DO NOTHING;
INSERT INTO public.equipment_images (item_id, sort_order, url, alt_text) VALUES ('E003', 1, '/assets/images/products/P003-2.jpg', '充氣式睡墊') ON CONFLICT (item_id, sort_order) DO NOTHING;
INSERT INTO public.equipment_images (item_id, sort_order, url, alt_text) VALUES ('E003', 2, '/assets/images/products/P003-3.jpg', '充氣式睡墊') ON CONFLICT (item_id, sort_order) DO NOTHING;
INSERT INTO public.equipment_interest_tags (item_id, tag) VALUES ('E003', 'safety') ON CONFLICT (item_id, tag) DO NOTHING;
INSERT INTO public.equipment_tags (item_id, tag) VALUES ('E003', '睡袋') ON CONFLICT (item_id, tag) DO NOTHING;
INSERT INTO public.equipment_specifications (item_id, spec_key, value) VALUES ('E003', 'weight', '0.8 kg') ON CONFLICT (item_id, spec_key) DO NOTHING;
INSERT INTO public.equipment_specifications (item_id, spec_key, value) VALUES ('E003', 'material', 'TPU 充氣層') ON CONFLICT (item_id, spec_key) DO NOTHING;
INSERT INTO public.equipment_specifications (item_id, spec_key, value) VALUES ('E003', 'capacity', '單人') ON CONFLICT (item_id, spec_key) DO NOTHING;
INSERT INTO public.product_variants (id, product_id, sku, color, size, price, specification, status) VALUES ('V003-01', 'P003', 'P003-01', NULL, 'S', 1200.00, 'S', 'active') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.product_variants (id, product_id, sku, color, size, price, specification, status) VALUES ('V003-02', 'P003', 'P003-02', NULL, 'M', 1200.00, 'M', 'active') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.product_variants (id, product_id, sku, color, size, price, specification, status) VALUES ('V003-03', 'P003', 'P003-03', NULL, 'L', 1200.00, 'L', 'active') ON CONFLICT (id) DO NOTHING;

INSERT INTO public.equipment_items (id, category_id, brand_id, name, description, active) VALUES ('E004', 2, 'yuruicamp', '羽絨睡袋', '<p><strong>羽絨睡袋</strong> 為 Yuruicamp 精選的睡袋商品，提供 <em>-10°C / -5°C / 0°C</em> 三種溫標可選。</p><p>適合露營、登山與戶外活動使用，後台可透過 Summernote 編輯器調整此描述。</p>', true) ON CONFLICT (id) DO NOTHING;
INSERT INTO public.products (id, status, item_id) VALUES ('P004', 'active', 'E004') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.equipment_images (item_id, sort_order, url, alt_text) VALUES ('E004', 0, '/assets/images/products/P004-1.jpg', '羽絨睡袋') ON CONFLICT (item_id, sort_order) DO NOTHING;
INSERT INTO public.equipment_images (item_id, sort_order, url, alt_text) VALUES ('E004', 1, '/assets/images/products/P004-2.jpg', '羽絨睡袋') ON CONFLICT (item_id, sort_order) DO NOTHING;
INSERT INTO public.equipment_images (item_id, sort_order, url, alt_text) VALUES ('E004', 2, '/assets/images/products/P004-3.jpg', '羽絨睡袋') ON CONFLICT (item_id, sort_order) DO NOTHING;
INSERT INTO public.equipment_interest_tags (item_id, tag) VALUES ('E004', 'safety') ON CONFLICT (item_id, tag) DO NOTHING;
INSERT INTO public.equipment_tags (item_id, tag) VALUES ('E004', '睡袋') ON CONFLICT (item_id, tag) DO NOTHING;
INSERT INTO public.equipment_specifications (item_id, spec_key, value) VALUES ('E004', 'weight', '1.2 kg') ON CONFLICT (item_id, spec_key) DO NOTHING;
INSERT INTO public.equipment_specifications (item_id, spec_key, value) VALUES ('E004', 'material', '90% 羽絨') ON CONFLICT (item_id, spec_key) DO NOTHING;
INSERT INTO public.equipment_specifications (item_id, spec_key, value) VALUES ('E004', 'capacity', '單人') ON CONFLICT (item_id, spec_key) DO NOTHING;
INSERT INTO public.product_variants (id, product_id, sku, color, size, price, specification, status) VALUES ('V004-01', 'P004', 'P004-01', NULL, '-10°C', 2800.00, '-10°C', 'active') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.product_variants (id, product_id, sku, color, size, price, specification, status) VALUES ('V004-02', 'P004', 'P004-02', NULL, '-5°C', 2800.00, '-5°C', 'active') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.product_variants (id, product_id, sku, color, size, price, specification, status) VALUES ('V004-03', 'P004', 'P004-03', NULL, '0°C', 2800.00, '0°C', 'active') ON CONFLICT (id) DO NOTHING;

INSERT INTO public.equipment_items (id, category_id, brand_id, name, description, active) VALUES ('E005', 3, 'coleman', 'Coleman 氣化爐', '<p><strong>Coleman 氣化爐</strong> 為 Yuruicamp 精選的炊具商品，規格：<em>標準版</em>。</p><p>適合露營、登山與戶外活動使用，後台可透過 Summernote 編輯器調整此描述。</p>', true) ON CONFLICT (id) DO NOTHING;
INSERT INTO public.products (id, status, item_id) VALUES ('P005', 'active', 'E005') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.equipment_images (item_id, sort_order, url, alt_text) VALUES ('E005', 0, '/assets/images/products/P005-1.jpg', 'Coleman 氣化爐') ON CONFLICT (item_id, sort_order) DO NOTHING;
INSERT INTO public.equipment_images (item_id, sort_order, url, alt_text) VALUES ('E005', 1, '/assets/images/products/P005-2.jpg', 'Coleman 氣化爐') ON CONFLICT (item_id, sort_order) DO NOTHING;
INSERT INTO public.equipment_images (item_id, sort_order, url, alt_text) VALUES ('E005', 2, '/assets/images/products/P005-3.jpg', 'Coleman 氣化爐') ON CONFLICT (item_id, sort_order) DO NOTHING;
INSERT INTO public.equipment_interest_tags (item_id, tag) VALUES ('E005', 'cooking') ON CONFLICT (item_id, tag) DO NOTHING;
INSERT INTO public.equipment_tags (item_id, tag) VALUES ('E005', '炊具') ON CONFLICT (item_id, tag) DO NOTHING;
INSERT INTO public.equipment_tags (item_id, tag) VALUES ('E005', 'Coleman') ON CONFLICT (item_id, tag) DO NOTHING;
INSERT INTO public.product_variants (id, product_id, sku, color, size, price, specification, status) VALUES ('V005-01', 'P005', 'P005-01', '標準版', NULL, 5000.00, '標準版', 'active') ON CONFLICT (id) DO NOTHING;

INSERT INTO public.equipment_items (id, category_id, brand_id, name, description, active) VALUES ('E006', 3, 'snow-peak', 'Snow Peak 鈦合金杯組', '<p><strong>Snow Peak 鈦合金杯組</strong> 為 Yuruicamp 精選的炊具商品，規格：<em>鈦金屬原色</em>。</p><p>適合露營、登山與戶外活動使用，後台可透過 Summernote 編輯器調整此描述。</p>', true) ON CONFLICT (id) DO NOTHING;
INSERT INTO public.products (id, status, item_id) VALUES ('P006', 'active', 'E006') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.equipment_images (item_id, sort_order, url, alt_text) VALUES ('E006', 0, '/assets/images/products/P006-1.jpg', 'Snow Peak 鈦合金杯組') ON CONFLICT (item_id, sort_order) DO NOTHING;
INSERT INTO public.equipment_images (item_id, sort_order, url, alt_text) VALUES ('E006', 1, '/assets/images/products/P006-2.jpg', 'Snow Peak 鈦合金杯組') ON CONFLICT (item_id, sort_order) DO NOTHING;
INSERT INTO public.equipment_images (item_id, sort_order, url, alt_text) VALUES ('E006', 2, '/assets/images/products/P006-3.jpg', 'Snow Peak 鈦合金杯組') ON CONFLICT (item_id, sort_order) DO NOTHING;
INSERT INTO public.equipment_interest_tags (item_id, tag) VALUES ('E006', 'cooking') ON CONFLICT (item_id, tag) DO NOTHING;
INSERT INTO public.equipment_tags (item_id, tag) VALUES ('E006', '炊具') ON CONFLICT (item_id, tag) DO NOTHING;
INSERT INTO public.equipment_tags (item_id, tag) VALUES ('E006', 'Snow Peak') ON CONFLICT (item_id, tag) DO NOTHING;
INSERT INTO public.product_variants (id, product_id, sku, color, size, price, specification, status) VALUES ('V006-01', 'P006', 'P006-01', '鈦金屬原色', NULL, 1800.00, '鈦金屬原色', 'active') ON CONFLICT (id) DO NOTHING;

INSERT INTO public.equipment_items (id, category_id, brand_id, name, description, active) VALUES ('E007', 4, 'yuruicamp', 'LED 露營燈', '<p><strong>LED 露營燈</strong> 為 Yuruicamp 精選的燈具商品，提供 <em>暖白光</em>、<em>冷白光</em> 兩種色溫。</p><p>適合露營、登山與戶外活動使用，後台可透過 Summernote 編輯器調整此描述。</p>', true) ON CONFLICT (id) DO NOTHING;
INSERT INTO public.products (id, status, item_id) VALUES ('P007', 'active', 'E007') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.equipment_images (item_id, sort_order, url, alt_text) VALUES ('E007', 0, '/assets/images/products/P007-1.jpg', 'LED 露營燈') ON CONFLICT (item_id, sort_order) DO NOTHING;
INSERT INTO public.equipment_images (item_id, sort_order, url, alt_text) VALUES ('E007', 1, '/assets/images/products/P007-2.jpg', 'LED 露營燈') ON CONFLICT (item_id, sort_order) DO NOTHING;
INSERT INTO public.equipment_images (item_id, sort_order, url, alt_text) VALUES ('E007', 2, '/assets/images/products/P007-3.jpg', 'LED 露營燈') ON CONFLICT (item_id, sort_order) DO NOTHING;
INSERT INTO public.equipment_interest_tags (item_id, tag) VALUES ('E007', 'safety') ON CONFLICT (item_id, tag) DO NOTHING;
INSERT INTO public.equipment_tags (item_id, tag) VALUES ('E007', '燈具') ON CONFLICT (item_id, tag) DO NOTHING;
INSERT INTO public.equipment_specifications (item_id, spec_key, value) VALUES ('E007', 'lumens', '300 lm') ON CONFLICT (item_id, spec_key) DO NOTHING;
INSERT INTO public.equipment_specifications (item_id, spec_key, value) VALUES ('E007', 'batteryLife', '約 40 小時') ON CONFLICT (item_id, spec_key) DO NOTHING;
INSERT INTO public.equipment_specifications (item_id, spec_key, value) VALUES ('E007', 'power', 'USB 充電') ON CONFLICT (item_id, spec_key) DO NOTHING;
INSERT INTO public.product_variants (id, product_id, sku, color, size, price, specification, status) VALUES ('V007-01', 'P007', 'P007-01', '暖白光', NULL, 800.00, '暖白光', 'active') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.product_variants (id, product_id, sku, color, size, price, specification, status) VALUES ('V007-02', 'P007', 'P007-02', '冷白光', NULL, 800.00, '冷白光', 'active') ON CONFLICT (id) DO NOTHING;

INSERT INTO public.equipment_items (id, category_id, brand_id, name, description, active) VALUES ('E008', 5, 'yuruicamp', '防水登山背包', '<p><strong>防水登山背包</strong> 為 Yuruicamp 精選的背包商品，提供 <em>35L / 45L</em> 兩種容量（森林綠）。</p><p>適合露營、登山與戶外活動使用，後台可透過 Summernote 編輯器調整此描述。</p>', true) ON CONFLICT (id) DO NOTHING;
INSERT INTO public.products (id, status, item_id) VALUES ('P008', 'active', 'E008') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.equipment_images (item_id, sort_order, url, alt_text) VALUES ('E008', 0, '/assets/images/products/P008-1.jpg', '防水登山背包') ON CONFLICT (item_id, sort_order) DO NOTHING;
INSERT INTO public.equipment_images (item_id, sort_order, url, alt_text) VALUES ('E008', 1, '/assets/images/products/P008-2.jpg', '防水登山背包') ON CONFLICT (item_id, sort_order) DO NOTHING;
INSERT INTO public.equipment_images (item_id, sort_order, url, alt_text) VALUES ('E008', 2, '/assets/images/products/P008-3.jpg', '防水登山背包') ON CONFLICT (item_id, sort_order) DO NOTHING;
INSERT INTO public.equipment_interest_tags (item_id, tag) VALUES ('E008', 'backpack') ON CONFLICT (item_id, tag) DO NOTHING;
INSERT INTO public.equipment_tags (item_id, tag) VALUES ('E008', '背包') ON CONFLICT (item_id, tag) DO NOTHING;
INSERT INTO public.equipment_specifications (item_id, spec_key, value) VALUES ('E008', 'weight', '1.1 kg') ON CONFLICT (item_id, spec_key) DO NOTHING;
INSERT INTO public.equipment_specifications (item_id, spec_key, value) VALUES ('E008', 'material', '防潑水尼龍') ON CONFLICT (item_id, spec_key) DO NOTHING;
INSERT INTO public.equipment_specifications (item_id, spec_key, value) VALUES ('E008', 'waterproof', 'IPX4') ON CONFLICT (item_id, spec_key) DO NOTHING;
INSERT INTO public.product_variants (id, product_id, sku, color, size, price, specification, status) VALUES ('V008-01', 'P008', 'P008-01', '森林綠', '35L', 1600.00, '森林綠 / 35L', 'active') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.product_variants (id, product_id, sku, color, size, price, specification, status) VALUES ('V008-02', 'P008', 'P008-02', '森林綠', '45L', 1600.00, '森林綠 / 45L', 'active') ON CONFLICT (id) DO NOTHING;

INSERT INTO public.equipment_items (id, category_id, brand_id, name, description, active) VALUES ('E009', 6, 'yuruicamp', '折疊桌椅組', '<p><strong>折疊桌椅組</strong> 為 Yuruicamp 精選的其他商品，規格：<em>鋁合金輕量版</em>。</p><p>適合露營、登山與戶外活動使用，後台可透過 Summernote 編輯器調整此描述。</p>', true) ON CONFLICT (id) DO NOTHING;
INSERT INTO public.products (id, status, item_id) VALUES ('P009', 'active', 'E009') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.equipment_images (item_id, sort_order, url, alt_text) VALUES ('E009', 0, '/assets/images/products/P009-1.jpg', '折疊桌椅組') ON CONFLICT (item_id, sort_order) DO NOTHING;
INSERT INTO public.equipment_images (item_id, sort_order, url, alt_text) VALUES ('E009', 1, '/assets/images/products/P009-2.jpg', '折疊桌椅組') ON CONFLICT (item_id, sort_order) DO NOTHING;
INSERT INTO public.equipment_images (item_id, sort_order, url, alt_text) VALUES ('E009', 2, '/assets/images/products/P009-3.jpg', '折疊桌椅組') ON CONFLICT (item_id, sort_order) DO NOTHING;
INSERT INTO public.equipment_interest_tags (item_id, tag) VALUES ('E009', 'safety') ON CONFLICT (item_id, tag) DO NOTHING;
INSERT INTO public.equipment_tags (item_id, tag) VALUES ('E009', '其他') ON CONFLICT (item_id, tag) DO NOTHING;
INSERT INTO public.product_variants (id, product_id, sku, color, size, price, specification, status) VALUES ('V009-01', 'P009', 'P009-01', '鋁合金輕量版', NULL, 2800.00, '鋁合金輕量版', 'active') ON CONFLICT (id) DO NOTHING;

INSERT INTO public.equipment_items (id, category_id, brand_id, name, description, active) VALUES ('E010', 6, 'yuruicamp', '保溫壺 1L', '<p><strong>保溫壺 1L</strong> 為 Yuruicamp 精選的其他商品，規格：<em>消光黑</em>。</p><p>適合露營、登山與戶外活動使用，後台可透過 Summernote 編輯器調整此描述。</p>', false) ON CONFLICT (id) DO NOTHING;
INSERT INTO public.products (id, status, item_id) VALUES ('P010', 'inactive', 'E010') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.equipment_images (item_id, sort_order, url, alt_text) VALUES ('E010', 0, '/assets/images/products/P010-1.jpg', '保溫壺 1L') ON CONFLICT (item_id, sort_order) DO NOTHING;
INSERT INTO public.equipment_images (item_id, sort_order, url, alt_text) VALUES ('E010', 1, '/assets/images/products/P010-2.jpg', '保溫壺 1L') ON CONFLICT (item_id, sort_order) DO NOTHING;
INSERT INTO public.equipment_images (item_id, sort_order, url, alt_text) VALUES ('E010', 2, '/assets/images/products/P010-3.jpg', '保溫壺 1L') ON CONFLICT (item_id, sort_order) DO NOTHING;
INSERT INTO public.equipment_interest_tags (item_id, tag) VALUES ('E010', 'safety') ON CONFLICT (item_id, tag) DO NOTHING;
INSERT INTO public.equipment_tags (item_id, tag) VALUES ('E010', '其他') ON CONFLICT (item_id, tag) DO NOTHING;
INSERT INTO public.product_variants (id, product_id, sku, color, size, price, specification, status) VALUES ('V010-01', 'P010', 'P010-01', '消光黑', NULL, 880.00, '消光黑', 'inactive') ON CONFLICT (id) DO NOTHING;

INSERT INTO public.equipment_items (id, category_id, brand_id, name, description, active) VALUES ('E011', 1, 'snow-peak', 'Snow Peak 客廳帳', '<p><strong>Snow Peak 客廳帳</strong> 為 Yuruicamp 精選的帳篷商品，規格：<em>象牙白</em>。</p><p>適合露營、登山與戶外活動使用，後台可透過 Summernote 編輯器調整此描述。</p>', true) ON CONFLICT (id) DO NOTHING;
INSERT INTO public.products (id, status, item_id) VALUES ('P011', 'active', 'E011') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.equipment_images (item_id, sort_order, url, alt_text) VALUES ('E011', 0, '/assets/images/products/P011-1.jpg', 'Snow Peak 客廳帳') ON CONFLICT (item_id, sort_order) DO NOTHING;
INSERT INTO public.equipment_images (item_id, sort_order, url, alt_text) VALUES ('E011', 1, '/assets/images/products/P011-2.jpg', 'Snow Peak 客廳帳') ON CONFLICT (item_id, sort_order) DO NOTHING;
INSERT INTO public.equipment_images (item_id, sort_order, url, alt_text) VALUES ('E011', 2, '/assets/images/products/P011-3.jpg', 'Snow Peak 客廳帳') ON CONFLICT (item_id, sort_order) DO NOTHING;
INSERT INTO public.equipment_interest_tags (item_id, tag) VALUES ('E011', 'tent') ON CONFLICT (item_id, tag) DO NOTHING;
INSERT INTO public.equipment_tags (item_id, tag) VALUES ('E011', '帳篷') ON CONFLICT (item_id, tag) DO NOTHING;
INSERT INTO public.equipment_tags (item_id, tag) VALUES ('E011', 'Snow Peak') ON CONFLICT (item_id, tag) DO NOTHING;
INSERT INTO public.product_variants (id, product_id, sku, color, size, price, specification, status) VALUES ('V011-01', 'P011', 'P011-01', '象牙白', NULL, 8500.00, '象牙白', 'active') ON CONFLICT (id) DO NOTHING;

INSERT INTO public.equipment_items (id, category_id, brand_id, name, description, active) VALUES ('E012', 2, 'yuruicamp', '四季保暖睡袋', '<p><strong>四季保暖睡袋</strong> 為 Yuruicamp 精選的睡袋商品，提供 <em>M / L</em> 兩種尺寸（深藍）。</p><p>適合露營、登山與戶外活動使用，後台可透過 Summernote 編輯器調整此描述。</p>', true) ON CONFLICT (id) DO NOTHING;
INSERT INTO public.products (id, status, item_id) VALUES ('P012', 'active', 'E012') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.equipment_images (item_id, sort_order, url, alt_text) VALUES ('E012', 0, '/assets/images/products/P012-1.jpg', '四季保暖睡袋') ON CONFLICT (item_id, sort_order) DO NOTHING;
INSERT INTO public.equipment_images (item_id, sort_order, url, alt_text) VALUES ('E012', 1, '/assets/images/products/P012-2.jpg', '四季保暖睡袋') ON CONFLICT (item_id, sort_order) DO NOTHING;
INSERT INTO public.equipment_images (item_id, sort_order, url, alt_text) VALUES ('E012', 2, '/assets/images/products/P012-3.jpg', '四季保暖睡袋') ON CONFLICT (item_id, sort_order) DO NOTHING;
INSERT INTO public.equipment_interest_tags (item_id, tag) VALUES ('E012', 'safety') ON CONFLICT (item_id, tag) DO NOTHING;
INSERT INTO public.equipment_tags (item_id, tag) VALUES ('E012', '睡袋') ON CONFLICT (item_id, tag) DO NOTHING;
INSERT INTO public.equipment_specifications (item_id, spec_key, value) VALUES ('E012', 'weight', '1.5 kg') ON CONFLICT (item_id, spec_key) DO NOTHING;
INSERT INTO public.equipment_specifications (item_id, spec_key, value) VALUES ('E012', 'material', '合成纖維') ON CONFLICT (item_id, spec_key) DO NOTHING;
INSERT INTO public.equipment_specifications (item_id, spec_key, value) VALUES ('E012', 'capacity', '單人') ON CONFLICT (item_id, spec_key) DO NOTHING;
INSERT INTO public.product_variants (id, product_id, sku, color, size, price, specification, status) VALUES ('V012-01', 'P012', 'P012-01', '深藍', 'M', 2200.00, '深藍 / M', 'active') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.product_variants (id, product_id, sku, color, size, price, specification, status) VALUES ('V012-02', 'P012', 'P012-02', '深藍', 'L', 2200.00, '深藍 / L', 'active') ON CONFLICT (id) DO NOTHING;

INSERT INTO public.equipment_items (id, category_id, brand_id, name, description, active) VALUES ('E013', 6, 'yuruicamp', '折疊蛋捲桌', '<p><strong>折疊蛋捲桌</strong> 為 Yuruicamp 精選的其他商品，規格：<em>胡桃木紋</em>。</p><p>適合露營、登山與戶外活動使用，後台可透過 Summernote 編輯器調整此描述。</p>', true) ON CONFLICT (id) DO NOTHING;
INSERT INTO public.products (id, status, item_id) VALUES ('P013', 'active', 'E013') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.equipment_images (item_id, sort_order, url, alt_text) VALUES ('E013', 0, '/assets/images/products/P013-1.jpg', '折疊蛋捲桌') ON CONFLICT (item_id, sort_order) DO NOTHING;
INSERT INTO public.equipment_images (item_id, sort_order, url, alt_text) VALUES ('E013', 1, '/assets/images/products/P013-2.jpg', '折疊蛋捲桌') ON CONFLICT (item_id, sort_order) DO NOTHING;
INSERT INTO public.equipment_images (item_id, sort_order, url, alt_text) VALUES ('E013', 2, '/assets/images/products/P013-3.jpg', '折疊蛋捲桌') ON CONFLICT (item_id, sort_order) DO NOTHING;
INSERT INTO public.equipment_interest_tags (item_id, tag) VALUES ('E013', 'safety') ON CONFLICT (item_id, tag) DO NOTHING;
INSERT INTO public.equipment_tags (item_id, tag) VALUES ('E013', '其他') ON CONFLICT (item_id, tag) DO NOTHING;
INSERT INTO public.product_variants (id, product_id, sku, color, size, price, specification, status) VALUES ('V013-01', 'P013', 'P013-01', '胡桃木紋', NULL, 1500.00, '胡桃木紋', 'active') ON CONFLICT (id) DO NOTHING;

INSERT INTO public.equipment_items (id, category_id, brand_id, name, description, active) VALUES ('E014', 6, 'yuruicamp', '高背月亮椅', '<p><strong>高背月亮椅</strong> 為 Yuruicamp 精選的其他商品，規格：<em>軍綠</em>。</p><p>適合露營、登山與戶外活動使用，後台可透過 Summernote 編輯器調整此描述。</p>', true) ON CONFLICT (id) DO NOTHING;
INSERT INTO public.products (id, status, item_id) VALUES ('P014', 'active', 'E014') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.equipment_images (item_id, sort_order, url, alt_text) VALUES ('E014', 0, '/assets/images/products/P014-1.jpg', '高背月亮椅') ON CONFLICT (item_id, sort_order) DO NOTHING;
INSERT INTO public.equipment_images (item_id, sort_order, url, alt_text) VALUES ('E014', 1, '/assets/images/products/P014-2.jpg', '高背月亮椅') ON CONFLICT (item_id, sort_order) DO NOTHING;
INSERT INTO public.equipment_images (item_id, sort_order, url, alt_text) VALUES ('E014', 2, '/assets/images/products/P014-3.jpg', '高背月亮椅') ON CONFLICT (item_id, sort_order) DO NOTHING;
INSERT INTO public.equipment_interest_tags (item_id, tag) VALUES ('E014', 'safety') ON CONFLICT (item_id, tag) DO NOTHING;
INSERT INTO public.equipment_tags (item_id, tag) VALUES ('E014', '其他') ON CONFLICT (item_id, tag) DO NOTHING;
INSERT INTO public.product_variants (id, product_id, sku, color, size, price, specification, status) VALUES ('V014-01', 'P014', 'P014-01', '軍綠', NULL, 980.00, '軍綠', 'active') ON CONFLICT (id) DO NOTHING;

INSERT INTO public.equipment_items (id, category_id, brand_id, name, description, active) VALUES ('E015', 4, 'yuruicamp', '充電式頭燈', '<p><strong>充電式頭燈</strong> 為 Yuruicamp 精選的燈具商品，規格：<em>USB-C</em>。</p><p>適合露營、登山與戶外活動使用，後台可透過 Summernote 編輯器調整此描述。</p>', true) ON CONFLICT (id) DO NOTHING;
INSERT INTO public.products (id, status, item_id) VALUES ('P015', 'active', 'E015') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.equipment_images (item_id, sort_order, url, alt_text) VALUES ('E015', 0, '/assets/images/products/P015-1.jpg', '充電式頭燈') ON CONFLICT (item_id, sort_order) DO NOTHING;
INSERT INTO public.equipment_images (item_id, sort_order, url, alt_text) VALUES ('E015', 1, '/assets/images/products/P015-2.jpg', '充電式頭燈') ON CONFLICT (item_id, sort_order) DO NOTHING;
INSERT INTO public.equipment_images (item_id, sort_order, url, alt_text) VALUES ('E015', 2, '/assets/images/products/P015-3.jpg', '充電式頭燈') ON CONFLICT (item_id, sort_order) DO NOTHING;
INSERT INTO public.equipment_interest_tags (item_id, tag) VALUES ('E015', 'safety') ON CONFLICT (item_id, tag) DO NOTHING;
INSERT INTO public.equipment_tags (item_id, tag) VALUES ('E015', '燈具') ON CONFLICT (item_id, tag) DO NOTHING;
INSERT INTO public.product_variants (id, product_id, sku, color, size, price, specification, status) VALUES ('V015-01', 'P015', 'P015-01', 'USB-C', NULL, 650.00, 'USB-C', 'active') ON CONFLICT (id) DO NOTHING;

INSERT INTO public.equipment_items (id, category_id, brand_id, name, description, active) VALUES ('E016', 5, 'yuruicamp', '65L 重裝背包', '<p><strong>65L 重裝背包</strong> 為 Yuruicamp 精選的背包商品，規格：<em>岩石灰</em>。</p><p>適合露營、登山與戶外活動使用，後台可透過 Summernote 編輯器調整此描述。</p>', true) ON CONFLICT (id) DO NOTHING;
INSERT INTO public.products (id, status, item_id) VALUES ('P016', 'active', 'E016') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.equipment_images (item_id, sort_order, url, alt_text) VALUES ('E016', 0, '/assets/images/products/P016-1.jpg', '65L 重裝背包') ON CONFLICT (item_id, sort_order) DO NOTHING;
INSERT INTO public.equipment_images (item_id, sort_order, url, alt_text) VALUES ('E016', 1, '/assets/images/products/P016-2.jpg', '65L 重裝背包') ON CONFLICT (item_id, sort_order) DO NOTHING;
INSERT INTO public.equipment_images (item_id, sort_order, url, alt_text) VALUES ('E016', 2, '/assets/images/products/P016-3.jpg', '65L 重裝背包') ON CONFLICT (item_id, sort_order) DO NOTHING;
INSERT INTO public.equipment_interest_tags (item_id, tag) VALUES ('E016', 'backpack') ON CONFLICT (item_id, tag) DO NOTHING;
INSERT INTO public.equipment_tags (item_id, tag) VALUES ('E016', '背包') ON CONFLICT (item_id, tag) DO NOTHING;
INSERT INTO public.product_variants (id, product_id, sku, color, size, price, specification, status) VALUES ('V016-01', 'P016', 'P016-01', '岩石灰', NULL, 4200.00, '岩石灰', 'active') ON CONFLICT (id) DO NOTHING;

INSERT INTO public.equipment_items (id, category_id, brand_id, name, description, active) VALUES ('E017', 6, 'yuruicamp', '露營拖車', '<p><strong>露營拖車</strong> 為 Yuruicamp 精選的其他商品，規格：<em>折疊式</em>。</p><p>適合露營、登山與戶外活動使用，後台可透過 Summernote 編輯器調整此描述。</p>', true) ON CONFLICT (id) DO NOTHING;
INSERT INTO public.products (id, status, item_id) VALUES ('P017', 'active', 'E017') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.equipment_images (item_id, sort_order, url, alt_text) VALUES ('E017', 0, '/assets/images/products/P017-1.jpg', '露營拖車') ON CONFLICT (item_id, sort_order) DO NOTHING;
INSERT INTO public.equipment_images (item_id, sort_order, url, alt_text) VALUES ('E017', 1, '/assets/images/products/P017-2.jpg', '露營拖車') ON CONFLICT (item_id, sort_order) DO NOTHING;
INSERT INTO public.equipment_images (item_id, sort_order, url, alt_text) VALUES ('E017', 2, '/assets/images/products/P017-3.jpg', '露營拖車') ON CONFLICT (item_id, sort_order) DO NOTHING;
INSERT INTO public.equipment_interest_tags (item_id, tag) VALUES ('E017', 'safety') ON CONFLICT (item_id, tag) DO NOTHING;
INSERT INTO public.equipment_tags (item_id, tag) VALUES ('E017', '其他') ON CONFLICT (item_id, tag) DO NOTHING;
INSERT INTO public.product_variants (id, product_id, sku, color, size, price, specification, status) VALUES ('V017-01', 'P017', 'P017-01', '折疊式', NULL, 3600.00, '折疊式', 'active') ON CONFLICT (id) DO NOTHING;

INSERT INTO public.equipment_items (id, category_id, brand_id, name, description, active) VALUES ('E018', 1, 'yuruicamp', '大型天幕', '<p><strong>大型天幕</strong> 為 Yuruicamp 精選的帳篷商品，規格：<em>4x4m</em>。</p><p>適合露營、登山與戶外活動使用，後台可透過 Summernote 編輯器調整此描述。</p>', true) ON CONFLICT (id) DO NOTHING;
INSERT INTO public.products (id, status, item_id) VALUES ('P018', 'active', 'E018') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.equipment_images (item_id, sort_order, url, alt_text) VALUES ('E018', 0, '/assets/images/products/P018-1.jpg', '大型天幕') ON CONFLICT (item_id, sort_order) DO NOTHING;
INSERT INTO public.equipment_images (item_id, sort_order, url, alt_text) VALUES ('E018', 1, '/assets/images/products/P018-2.jpg', '大型天幕') ON CONFLICT (item_id, sort_order) DO NOTHING;
INSERT INTO public.equipment_images (item_id, sort_order, url, alt_text) VALUES ('E018', 2, '/assets/images/products/P018-3.jpg', '大型天幕') ON CONFLICT (item_id, sort_order) DO NOTHING;
INSERT INTO public.equipment_interest_tags (item_id, tag) VALUES ('E018', 'tent') ON CONFLICT (item_id, tag) DO NOTHING;
INSERT INTO public.equipment_tags (item_id, tag) VALUES ('E018', '帳篷') ON CONFLICT (item_id, tag) DO NOTHING;
INSERT INTO public.product_variants (id, product_id, sku, color, size, price, specification, status) VALUES ('V018-01', 'P018', 'P018-01', '4x4m', NULL, 2400.00, '4x4m', 'active') ON CONFLICT (id) DO NOTHING;

INSERT INTO public.equipment_items (id, category_id, brand_id, name, description, active) VALUES ('E019', 6, 'yuruicamp', '營柱與營繩組', '<p><strong>營柱與營繩組</strong> 為 Yuruicamp 精選的其他商品，規格：<em>標準套組</em>。</p><p>適合露營、登山與戶外活動使用，後台可透過 Summernote 編輯器調整此描述。</p>', true) ON CONFLICT (id) DO NOTHING;
INSERT INTO public.products (id, status, item_id) VALUES ('P019', 'active', 'E019') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.equipment_images (item_id, sort_order, url, alt_text) VALUES ('E019', 0, '/assets/images/products/P019-1.jpg', '營柱與營繩組') ON CONFLICT (item_id, sort_order) DO NOTHING;
INSERT INTO public.equipment_images (item_id, sort_order, url, alt_text) VALUES ('E019', 1, '/assets/images/products/P019-2.jpg', '營柱與營繩組') ON CONFLICT (item_id, sort_order) DO NOTHING;
INSERT INTO public.equipment_images (item_id, sort_order, url, alt_text) VALUES ('E019', 2, '/assets/images/products/P019-3.jpg', '營柱與營繩組') ON CONFLICT (item_id, sort_order) DO NOTHING;
INSERT INTO public.equipment_interest_tags (item_id, tag) VALUES ('E019', 'safety') ON CONFLICT (item_id, tag) DO NOTHING;
INSERT INTO public.equipment_tags (item_id, tag) VALUES ('E019', '其他') ON CONFLICT (item_id, tag) DO NOTHING;
INSERT INTO public.product_variants (id, product_id, sku, color, size, price, specification, status) VALUES ('V019-01', 'P019', 'P019-01', '標準套組', NULL, 450.00, '標準套組', 'active') ON CONFLICT (id) DO NOTHING;

INSERT INTO public.equipment_items (id, category_id, brand_id, name, description, active) VALUES ('E020', 6, 'yuruicamp', '行動電源站', '<p><strong>行動電源站</strong> 為 Yuruicamp 精選的其他商品，規格：<em>500Wh</em>。</p><p>適合露營、登山與戶外活動使用，後台可透過 Summernote 編輯器調整此描述。</p>', true) ON CONFLICT (id) DO NOTHING;
INSERT INTO public.products (id, status, item_id) VALUES ('P020', 'active', 'E020') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.equipment_images (item_id, sort_order, url, alt_text) VALUES ('E020', 0, '/assets/images/products/P020-1.jpg', '行動電源站') ON CONFLICT (item_id, sort_order) DO NOTHING;
INSERT INTO public.equipment_images (item_id, sort_order, url, alt_text) VALUES ('E020', 1, '/assets/images/products/P020-2.jpg', '行動電源站') ON CONFLICT (item_id, sort_order) DO NOTHING;
INSERT INTO public.equipment_images (item_id, sort_order, url, alt_text) VALUES ('E020', 2, '/assets/images/products/P020-3.jpg', '行動電源站') ON CONFLICT (item_id, sort_order) DO NOTHING;
INSERT INTO public.equipment_interest_tags (item_id, tag) VALUES ('E020', 'safety') ON CONFLICT (item_id, tag) DO NOTHING;
INSERT INTO public.equipment_tags (item_id, tag) VALUES ('E020', '其他') ON CONFLICT (item_id, tag) DO NOTHING;
INSERT INTO public.product_variants (id, product_id, sku, color, size, price, specification, status) VALUES ('V020-01', 'P020', 'P020-01', '500Wh', NULL, 12800.00, '500Wh', 'active') ON CONFLICT (id) DO NOTHING;

INSERT INTO public.equipment_items (id, category_id, brand_id, name, description, active) VALUES ('E021', 6, 'yuruicamp', '保冷冰桶 45L', '<p><strong>保冷冰桶 45L</strong> 為 Yuruicamp 精選的其他商品，規格：<em>深藍</em>。</p><p>適合露營、登山與戶外活動使用，後台可透過 Summernote 編輯器調整此描述。</p>', true) ON CONFLICT (id) DO NOTHING;
INSERT INTO public.products (id, status, item_id) VALUES ('P021', 'active', 'E021') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.equipment_images (item_id, sort_order, url, alt_text) VALUES ('E021', 0, '/assets/images/products/P021-1.jpg', '保冷冰桶 45L') ON CONFLICT (item_id, sort_order) DO NOTHING;
INSERT INTO public.equipment_images (item_id, sort_order, url, alt_text) VALUES ('E021', 1, '/assets/images/products/P021-2.jpg', '保冷冰桶 45L') ON CONFLICT (item_id, sort_order) DO NOTHING;
INSERT INTO public.equipment_images (item_id, sort_order, url, alt_text) VALUES ('E021', 2, '/assets/images/products/P021-3.jpg', '保冷冰桶 45L') ON CONFLICT (item_id, sort_order) DO NOTHING;
INSERT INTO public.equipment_interest_tags (item_id, tag) VALUES ('E021', 'safety') ON CONFLICT (item_id, tag) DO NOTHING;
INSERT INTO public.equipment_tags (item_id, tag) VALUES ('E021', '其他') ON CONFLICT (item_id, tag) DO NOTHING;
INSERT INTO public.product_variants (id, product_id, sku, color, size, price, specification, status) VALUES ('V021-01', 'P021', 'P021-01', '深藍', NULL, 1900.00, '深藍', 'active') ON CONFLICT (id) DO NOTHING;

INSERT INTO public.equipment_items (id, category_id, brand_id, name, description, active) VALUES ('E022', 6, 'yuruicamp', '雙層防風外套', '<p><strong>雙層防風外套</strong> 為 Yuruicamp 精選的其他商品，規格：<em>L號</em>。</p><p>適合露營、登山與戶外活動使用，後台可透過 Summernote 編輯器調整此描述。</p>', true) ON CONFLICT (id) DO NOTHING;
INSERT INTO public.products (id, status, item_id) VALUES ('P022', 'active', 'E022') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.equipment_images (item_id, sort_order, url, alt_text) VALUES ('E022', 0, '/assets/images/products/P022-1.jpg', '雙層防風外套') ON CONFLICT (item_id, sort_order) DO NOTHING;
INSERT INTO public.equipment_images (item_id, sort_order, url, alt_text) VALUES ('E022', 1, '/assets/images/products/P022-2.jpg', '雙層防風外套') ON CONFLICT (item_id, sort_order) DO NOTHING;
INSERT INTO public.equipment_images (item_id, sort_order, url, alt_text) VALUES ('E022', 2, '/assets/images/products/P022-3.jpg', '雙層防風外套') ON CONFLICT (item_id, sort_order) DO NOTHING;
INSERT INTO public.equipment_interest_tags (item_id, tag) VALUES ('E022', 'safety') ON CONFLICT (item_id, tag) DO NOTHING;
INSERT INTO public.equipment_tags (item_id, tag) VALUES ('E022', '其他') ON CONFLICT (item_id, tag) DO NOTHING;
INSERT INTO public.product_variants (id, product_id, sku, color, size, price, specification, status) VALUES ('V022-01', 'P022', 'P022-01', 'L號', NULL, 3200.00, 'L號', 'active') ON CONFLICT (id) DO NOTHING;

INSERT INTO public.equipment_items (id, category_id, brand_id, name, description, active) VALUES ('E023', 3, 'yuruicamp', '快煮鍋 1.5L', '<p><strong>快煮鍋 1.5L</strong> 為 Yuruicamp 精選的炊具商品，規格：<em>不鏽鋼</em>。</p><p>適合露營、登山與戶外活動使用，後台可透過 Summernote 編輯器調整此描述。</p>', true) ON CONFLICT (id) DO NOTHING;
INSERT INTO public.products (id, status, item_id) VALUES ('P023', 'active', 'E023') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.equipment_images (item_id, sort_order, url, alt_text) VALUES ('E023', 0, '/assets/images/products/P023-1.jpg', '快煮鍋 1.5L') ON CONFLICT (item_id, sort_order) DO NOTHING;
INSERT INTO public.equipment_images (item_id, sort_order, url, alt_text) VALUES ('E023', 1, '/assets/images/products/P023-2.jpg', '快煮鍋 1.5L') ON CONFLICT (item_id, sort_order) DO NOTHING;
INSERT INTO public.equipment_images (item_id, sort_order, url, alt_text) VALUES ('E023', 2, '/assets/images/products/P023-3.jpg', '快煮鍋 1.5L') ON CONFLICT (item_id, sort_order) DO NOTHING;
INSERT INTO public.equipment_interest_tags (item_id, tag) VALUES ('E023', 'cooking') ON CONFLICT (item_id, tag) DO NOTHING;
INSERT INTO public.equipment_tags (item_id, tag) VALUES ('E023', '炊具') ON CONFLICT (item_id, tag) DO NOTHING;
INSERT INTO public.product_variants (id, product_id, sku, color, size, price, specification, status) VALUES ('V023-01', 'P023', 'P023-01', '不鏽鋼', NULL, 1100.00, '不鏽鋼', 'active') ON CONFLICT (id) DO NOTHING;

INSERT INTO public.equipment_items (id, category_id, brand_id, name, description, active) VALUES ('E024', 6, 'yuruicamp', '碳纖維登山杖', '<p><strong>碳纖維登山杖</strong> 為 Yuruicamp 精選的其他商品，規格：<em>一對</em>。</p><p>適合露營、登山與戶外活動使用，後台可透過 Summernote 編輯器調整此描述。</p>', true) ON CONFLICT (id) DO NOTHING;
INSERT INTO public.products (id, status, item_id) VALUES ('P024', 'active', 'E024') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.equipment_images (item_id, sort_order, url, alt_text) VALUES ('E024', 0, '/assets/images/products/P024-1.jpg', '碳纖維登山杖') ON CONFLICT (item_id, sort_order) DO NOTHING;
INSERT INTO public.equipment_images (item_id, sort_order, url, alt_text) VALUES ('E024', 1, '/assets/images/products/P024-2.jpg', '碳纖維登山杖') ON CONFLICT (item_id, sort_order) DO NOTHING;
INSERT INTO public.equipment_images (item_id, sort_order, url, alt_text) VALUES ('E024', 2, '/assets/images/products/P024-3.jpg', '碳纖維登山杖') ON CONFLICT (item_id, sort_order) DO NOTHING;
INSERT INTO public.equipment_interest_tags (item_id, tag) VALUES ('E024', 'safety') ON CONFLICT (item_id, tag) DO NOTHING;
INSERT INTO public.equipment_tags (item_id, tag) VALUES ('E024', '其他') ON CONFLICT (item_id, tag) DO NOTHING;
INSERT INTO public.product_variants (id, product_id, sku, color, size, price, specification, status) VALUES ('V024-01', 'P024', 'P024-01', '一對', NULL, 1400.00, '一對', 'active') ON CONFLICT (id) DO NOTHING;

INSERT INTO public.equipment_items (id, category_id, brand_id, name, description, active) VALUES ('E025', 6, 'yuruicamp', '防水戶外手錶', '<p><strong>防水戶外手錶</strong> 為 Yuruicamp 精選的其他商品，規格：<em>GPS版</em>。</p><p>適合露營、登山與戶外活動使用，後台可透過 Summernote 編輯器調整此描述。</p>', true) ON CONFLICT (id) DO NOTHING;
INSERT INTO public.products (id, status, item_id) VALUES ('P025', 'active', 'E025') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.equipment_images (item_id, sort_order, url, alt_text) VALUES ('E025', 0, '/assets/images/products/P025-1.jpg', '防水戶外手錶') ON CONFLICT (item_id, sort_order) DO NOTHING;
INSERT INTO public.equipment_images (item_id, sort_order, url, alt_text) VALUES ('E025', 1, '/assets/images/products/P025-2.jpg', '防水戶外手錶') ON CONFLICT (item_id, sort_order) DO NOTHING;
INSERT INTO public.equipment_images (item_id, sort_order, url, alt_text) VALUES ('E025', 2, '/assets/images/products/P025-3.jpg', '防水戶外手錶') ON CONFLICT (item_id, sort_order) DO NOTHING;
INSERT INTO public.equipment_interest_tags (item_id, tag) VALUES ('E025', 'safety') ON CONFLICT (item_id, tag) DO NOTHING;
INSERT INTO public.equipment_tags (item_id, tag) VALUES ('E025', '其他') ON CONFLICT (item_id, tag) DO NOTHING;
INSERT INTO public.product_variants (id, product_id, sku, color, size, price, specification, status) VALUES ('V025-01', 'P025', 'P025-01', 'GPS版', NULL, 5600.00, 'GPS版', 'active') ON CONFLICT (id) DO NOTHING;

INSERT INTO public.equipment_items (id, category_id, brand_id, name, description, active) VALUES ('E026', 6, 'yuruicamp', '輕量吊床', '<p><strong>輕量吊床</strong> 為 Yuruicamp 精選的其他商品，規格：<em>雙人</em>。</p><p>適合露營、登山與戶外活動使用，後台可透過 Summernote 編輯器調整此描述。</p>', true) ON CONFLICT (id) DO NOTHING;
INSERT INTO public.products (id, status, item_id) VALUES ('P026', 'active', 'E026') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.equipment_images (item_id, sort_order, url, alt_text) VALUES ('E026', 0, '/assets/images/products/P026-1.jpg', '輕量吊床') ON CONFLICT (item_id, sort_order) DO NOTHING;
INSERT INTO public.equipment_images (item_id, sort_order, url, alt_text) VALUES ('E026', 1, '/assets/images/products/P026-2.jpg', '輕量吊床') ON CONFLICT (item_id, sort_order) DO NOTHING;
INSERT INTO public.equipment_images (item_id, sort_order, url, alt_text) VALUES ('E026', 2, '/assets/images/products/P026-3.jpg', '輕量吊床') ON CONFLICT (item_id, sort_order) DO NOTHING;
INSERT INTO public.equipment_interest_tags (item_id, tag) VALUES ('E026', 'safety') ON CONFLICT (item_id, tag) DO NOTHING;
INSERT INTO public.equipment_tags (item_id, tag) VALUES ('E026', '其他') ON CONFLICT (item_id, tag) DO NOTHING;
INSERT INTO public.product_variants (id, product_id, sku, color, size, price, specification, status) VALUES ('V026-01', 'P026', 'P026-01', '雙人', NULL, 890.00, '雙人', 'active') ON CONFLICT (id) DO NOTHING;

INSERT INTO public.equipment_items (id, category_id, brand_id, name, description, active) VALUES ('E027', 6, 'yuruicamp', '戶外淋浴袋', '<p><strong>戶外淋浴袋</strong> 為 Yuruicamp 精選的其他商品，規格：<em>20L</em>。</p><p>適合露營、登山與戶外活動使用，後台可透過 Summernote 編輯器調整此描述。</p>', true) ON CONFLICT (id) DO NOTHING;
INSERT INTO public.products (id, status, item_id) VALUES ('P027', 'active', 'E027') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.equipment_images (item_id, sort_order, url, alt_text) VALUES ('E027', 0, '/assets/images/products/P027-1.jpg', '戶外淋浴袋') ON CONFLICT (item_id, sort_order) DO NOTHING;
INSERT INTO public.equipment_images (item_id, sort_order, url, alt_text) VALUES ('E027', 1, '/assets/images/products/P027-2.jpg', '戶外淋浴袋') ON CONFLICT (item_id, sort_order) DO NOTHING;
INSERT INTO public.equipment_images (item_id, sort_order, url, alt_text) VALUES ('E027', 2, '/assets/images/products/P027-3.jpg', '戶外淋浴袋') ON CONFLICT (item_id, sort_order) DO NOTHING;
INSERT INTO public.equipment_interest_tags (item_id, tag) VALUES ('E027', 'safety') ON CONFLICT (item_id, tag) DO NOTHING;
INSERT INTO public.equipment_tags (item_id, tag) VALUES ('E027', '其他') ON CONFLICT (item_id, tag) DO NOTHING;
INSERT INTO public.product_variants (id, product_id, sku, color, size, price, specification, status) VALUES ('V027-01', 'P027', 'P027-01', '20L', NULL, 680.00, '20L', 'active') ON CONFLICT (id) DO NOTHING;

INSERT INTO public.equipment_items (id, category_id, brand_id, name, description, active) VALUES ('E028', 3, 'yuruicamp', '折疊式焚火台', '<p><strong>折疊式焚火台</strong> 為 Yuruicamp 精選的炊具商品，規格：<em>不鏽鋼</em>。</p><p>適合露營、登山與戶外活動使用，後台可透過 Summernote 編輯器調整此描述。</p>', true) ON CONFLICT (id) DO NOTHING;
INSERT INTO public.products (id, status, item_id) VALUES ('P028', 'active', 'E028') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.equipment_images (item_id, sort_order, url, alt_text) VALUES ('E028', 0, '/assets/images/products/P028-1.jpg', '折疊式焚火台') ON CONFLICT (item_id, sort_order) DO NOTHING;
INSERT INTO public.equipment_images (item_id, sort_order, url, alt_text) VALUES ('E028', 1, '/assets/images/products/P028-2.jpg', '折疊式焚火台') ON CONFLICT (item_id, sort_order) DO NOTHING;
INSERT INTO public.equipment_images (item_id, sort_order, url, alt_text) VALUES ('E028', 2, '/assets/images/products/P028-3.jpg', '折疊式焚火台') ON CONFLICT (item_id, sort_order) DO NOTHING;
INSERT INTO public.equipment_interest_tags (item_id, tag) VALUES ('E028', 'cooking') ON CONFLICT (item_id, tag) DO NOTHING;
INSERT INTO public.equipment_tags (item_id, tag) VALUES ('E028', '炊具') ON CONFLICT (item_id, tag) DO NOTHING;
INSERT INTO public.product_variants (id, product_id, sku, color, size, price, specification, status) VALUES ('V028-01', 'P028', 'P028-01', '不鏽鋼', NULL, 2100.00, '不鏽鋼', 'active') ON CONFLICT (id) DO NOTHING;

INSERT INTO public.equipment_items (id, category_id, brand_id, name, description, active) VALUES ('E029', 1, 'yuruicamp', '防蚊帳篷內帳', '<p><strong>防蚊帳篷內帳</strong> 為 Yuruicamp 精選的帳篷商品，規格：<em>通用型</em>。</p><p>適合露營、登山與戶外活動使用，後台可透過 Summernote 編輯器調整此描述。</p>', true) ON CONFLICT (id) DO NOTHING;
INSERT INTO public.products (id, status, item_id) VALUES ('P029', 'active', 'E029') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.equipment_images (item_id, sort_order, url, alt_text) VALUES ('E029', 0, '/assets/images/products/P029-1.jpg', '防蚊帳篷內帳') ON CONFLICT (item_id, sort_order) DO NOTHING;
INSERT INTO public.equipment_images (item_id, sort_order, url, alt_text) VALUES ('E029', 1, '/assets/images/products/P029-2.jpg', '防蚊帳篷內帳') ON CONFLICT (item_id, sort_order) DO NOTHING;
INSERT INTO public.equipment_images (item_id, sort_order, url, alt_text) VALUES ('E029', 2, '/assets/images/products/P029-3.jpg', '防蚊帳篷內帳') ON CONFLICT (item_id, sort_order) DO NOTHING;
INSERT INTO public.equipment_interest_tags (item_id, tag) VALUES ('E029', 'tent') ON CONFLICT (item_id, tag) DO NOTHING;
INSERT INTO public.equipment_tags (item_id, tag) VALUES ('E029', '帳篷') ON CONFLICT (item_id, tag) DO NOTHING;
INSERT INTO public.product_variants (id, product_id, sku, color, size, price, specification, status) VALUES ('V029-01', 'P029', 'P029-01', '通用型', NULL, 750.00, '通用型', 'active') ON CONFLICT (id) DO NOTHING;

INSERT INTO public.equipment_items (id, category_id, brand_id, name, description, active) VALUES ('E030', 6, 'yuruicamp', '露營貼紙組', '<p><strong>露營貼紙組</strong> 為 Yuruicamp 精選的其他商品，規格：<em>50入</em>。</p><p>適合露營、登山與戶外活動使用，後台可透過 Summernote 編輯器調整此描述。</p>', false) ON CONFLICT (id) DO NOTHING;
INSERT INTO public.products (id, status, item_id) VALUES ('P030', 'inactive', 'E030') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.equipment_images (item_id, sort_order, url, alt_text) VALUES ('E030', 0, '/assets/images/products/P030-1.jpg', '露營貼紙組') ON CONFLICT (item_id, sort_order) DO NOTHING;
INSERT INTO public.equipment_images (item_id, sort_order, url, alt_text) VALUES ('E030', 1, '/assets/images/products/P030-2.jpg', '露營貼紙組') ON CONFLICT (item_id, sort_order) DO NOTHING;
INSERT INTO public.equipment_images (item_id, sort_order, url, alt_text) VALUES ('E030', 2, '/assets/images/products/P030-3.jpg', '露營貼紙組') ON CONFLICT (item_id, sort_order) DO NOTHING;
INSERT INTO public.equipment_interest_tags (item_id, tag) VALUES ('E030', 'safety') ON CONFLICT (item_id, tag) DO NOTHING;
INSERT INTO public.equipment_tags (item_id, tag) VALUES ('E030', '其他') ON CONFLICT (item_id, tag) DO NOTHING;
INSERT INTO public.product_variants (id, product_id, sku, color, size, price, specification, status) VALUES ('V030-01', 'P030', 'P030-01', '50入', NULL, 199.00, '50入', 'inactive') ON CONFLICT (id) DO NOTHING;

-- Booking E-1：最小租借主檔與規格；上架資料需等待 040 的營區租借庫位。
INSERT INTO public.equipment_items (
    id,
    category_id,
    brand_id,
    name,
    description,
    active
)
VALUES (
    'E-RENTAL-DEV-001',
    6,
    'yuruicamp',
    '露營折疊椅租借',
    'E-1 Swagger 租借裝備範例。',
    true
)
ON CONFLICT (id) DO UPDATE SET
    category_id = EXCLUDED.category_id,
    brand_id = EXCLUDED.brand_id,
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    active = EXCLUDED.active,
    updated_at = now();

INSERT INTO public.rental_skus (id, item_id, status)
VALUES ('RS-DEV-001', 'E-RENTAL-DEV-001', 'active')
ON CONFLICT (id) DO UPDATE SET
    item_id = EXCLUDED.item_id,
    status = EXCLUDED.status,
    updated_at = now();

INSERT INTO public.rental_sku_variants (
    id,
    rental_sku_id,
    sku,
    color,
    size,
    specification,
    status
)
VALUES (
    'RSV-DEV-001',
    'RS-DEV-001',
    'RENTAL-CHAIR-DEV',
    '森林綠',
    NULL,
    '森林綠 / 單人',
    'active'
)
ON CONFLICT (id) DO UPDATE SET
    rental_sku_id = EXCLUDED.rental_sku_id,
    color = EXCLUDED.color,
    size = EXCLUDED.size,
    specification = EXCLUDED.specification,
    status = EXCLUDED.status,
    updated_at = now();

-- 前端 rental-skus.json 的完整租借主檔；ID 以 json-seed-id-mapping.md 為準。
INSERT INTO public.rental_skus (id, item_id, status)
VALUES
    ('R001', 'E001', 'active'),
    ('R002', 'E002', 'active'),
    ('R018', 'E003', 'active'),
    ('R005', 'E004', 'active'),
    ('R006', 'E005', 'active'),
    ('R007', 'E006', 'active'),
    ('R011', 'E007', 'active'),
    ('R013', 'E008', 'active'),
    ('R008', 'E009', 'active'),
    ('R003', 'E011', 'active'),
    ('R004', 'E012', 'active'),
    ('R009', 'E013', 'active'),
    ('R010', 'E014', 'active'),
    ('R012', 'E015', 'active'),
    ('R014', 'E016', 'active'),
    ('R015', 'E017', 'active'),
    ('R016', 'E018', 'active'),
    ('R017', 'E019', 'active'),
    ('R019', 'E020', 'active'),
    ('R020', 'E021', 'active'),
    ('R021', 'E022', 'active'),
    ('R022', 'E023', 'active'),
    ('R023', 'E024', 'active'),
    ('R024', 'E025', 'active'),
    ('R025', 'E026', 'active'),
    ('R026', 'E027', 'active'),
    ('R027', 'E028', 'active'),
    ('R028', 'E029', 'active')
ON CONFLICT (id) DO UPDATE SET
    item_id = EXCLUDED.item_id,
    status = EXCLUDED.status,
    updated_at = now();

INSERT INTO public.rental_sku_variants (
    id,
    rental_sku_id,
    sku,
    color,
    size,
    specification,
    status
)
VALUES
    ('RSV-R001-01', 'R001', 'RSV-R001-01', '深橄欖綠', NULL, '深橄欖綠', 'active'),
    ('RSV-R001-02', 'R001', 'RSV-R001-02', '沙漠棕', NULL, '沙漠棕', 'active'),
    ('RSV-R001-03', 'R001', 'RSV-R001-03', '太空灰', NULL, '太空灰', 'active'),
    ('RSV-R002-01', 'R002', 'RSV-R002-01', '沙漠卡其', NULL, '沙漠卡其', 'active'),
    ('RSV-R018-01', 'R018', 'RSV-R018-01', NULL, 'S', 'S', 'active'),
    ('RSV-R018-02', 'R018', 'RSV-R018-02', NULL, 'M', 'M', 'active'),
    ('RSV-R018-03', 'R018', 'RSV-R018-03', NULL, 'L', 'L', 'active'),
    ('RSV-R005-01', 'R005', 'RSV-R005-01', NULL, '-10°C', '-10°C', 'active'),
    ('RSV-R005-02', 'R005', 'RSV-R005-02', NULL, '-5°C', '-5°C', 'active'),
    ('RSV-R005-03', 'R005', 'RSV-R005-03', NULL, '0°C', '0°C', 'active'),
    ('RSV-R006-01', 'R006', 'RSV-R006-01', '標準版', NULL, '標準版', 'active'),
    ('RSV-R007-01', 'R007', 'RSV-R007-01', '鈦金屬原色', NULL, '鈦金屬原色', 'active'),
    ('RSV-R011-01', 'R011', 'RSV-R011-01', '暖白光', NULL, '暖白光', 'active'),
    ('RSV-R011-02', 'R011', 'RSV-R011-02', '冷白光', NULL, '冷白光', 'active'),
    ('RSV-R013-01', 'R013', 'RSV-R013-01', '森林綠', '35L', '森林綠 / 35L', 'active'),
    ('RSV-R013-02', 'R013', 'RSV-R013-02', '森林綠', '45L', '森林綠 / 45L', 'active'),
    ('RSV-R008-01', 'R008', 'RSV-R008-01', '鋁合金輕量版', NULL, '鋁合金輕量版', 'active'),
    ('RSV-R003-01', 'R003', 'RSV-R003-01', '象牙白', NULL, '象牙白', 'active'),
    ('RSV-R004-01', 'R004', 'RSV-R004-01', '深藍', 'M', '深藍 / M', 'active'),
    ('RSV-R004-02', 'R004', 'RSV-R004-02', '深藍', 'L', '深藍 / L', 'active'),
    ('RSV-R009-01', 'R009', 'RSV-R009-01', '胡桃木紋', NULL, '胡桃木紋', 'active'),
    ('RSV-R010-01', 'R010', 'RSV-R010-01', '軍綠', NULL, '軍綠', 'active'),
    ('RSV-R012-01', 'R012', 'RSV-R012-01', 'USB-C', NULL, 'USB-C', 'active'),
    ('RSV-R014-01', 'R014', 'RSV-R014-01', '岩石灰', NULL, '岩石灰', 'active'),
    ('RSV-R015-01', 'R015', 'RSV-R015-01', '折疊式', NULL, '折疊式', 'active'),
    ('RSV-R016-01', 'R016', 'RSV-R016-01', '4x4m', NULL, '4x4m', 'active'),
    ('RSV-R017-01', 'R017', 'RSV-R017-01', '標準套組', NULL, '標準套組', 'active'),
    ('RSV-R019-01', 'R019', 'RSV-R019-01', '500Wh', NULL, '500Wh', 'active'),
    ('RSV-R020-01', 'R020', 'RSV-R020-01', '深藍', NULL, '深藍', 'active'),
    ('RSV-R021-01', 'R021', 'RSV-R021-01', 'L號', NULL, 'L號', 'active'),
    ('RSV-R022-01', 'R022', 'RSV-R022-01', '不鏽鋼', NULL, '不鏽鋼', 'active'),
    ('RSV-R023-01', 'R023', 'RSV-R023-01', '一對', NULL, '一對', 'active'),
    ('RSV-R024-01', 'R024', 'RSV-R024-01', 'GPS版', NULL, 'GPS版', 'active'),
    ('RSV-R025-01', 'R025', 'RSV-R025-01', '雙人', NULL, '雙人', 'active'),
    ('RSV-R026-01', 'R026', 'RSV-R026-01', '20L', NULL, '20L', 'active'),
    ('RSV-R027-01', 'R027', 'RSV-R027-01', '不鏽鋼', NULL, '不鏽鋼', 'active'),
    ('RSV-R028-01', 'R028', 'RSV-R028-01', '通用型', NULL, '通用型', 'active')
ON CONFLICT (id) DO UPDATE SET
    rental_sku_id = EXCLUDED.rental_sku_id,
    sku = EXCLUDED.sku,
    color = EXCLUDED.color,
    size = EXCLUDED.size,
    specification = EXCLUDED.specification,
    status = EXCLUDED.status,
    updated_at = now();

-- 商城標籤：每次重跑都依 products.created_at 重新標記最新的 10 件可售商品。
DELETE FROM public.equipment_tags
WHERE tag = '新品';

INSERT INTO public.equipment_tags (item_id, tag)
SELECT newest.item_id, '新品'
FROM (
    SELECT product.item_id
    FROM public.products product
    JOIN public.equipment_items item ON item.id = product.item_id
    WHERE product.status = 'active'
      AND item.active = true
      AND EXISTS (
          SELECT 1
          FROM public.product_variants variant
          WHERE variant.product_id = product.id
            AND variant.status = 'active'
      )
    ORDER BY product.created_at DESC, product.id DESC
    LIMIT 10
) newest
ON CONFLICT (item_id, tag) DO NOTHING;

