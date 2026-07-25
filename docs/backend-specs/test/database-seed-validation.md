# 資料庫與完整 Seed 實際驗證

## 1. 驗證目標

- PostgreSQL 16 可先套用 `docs/latest_schema.sql`，再以單一交易執行 `docs/seed/002-dev-seed.sql`。
- Seed 片段依 `010`～`070` 順序完成，沒有 FK 孤兒、重複預設地址或 active 保留超過庫存。
- JPA Entity 能在 `ddl-auto=validate` 下啟動。

## 2. 安全原則

完整 Seed 會覆寫固定 ID 的展示資料。優先使用一次性容器／資料庫；不要對要保留人工測試資料的 `yuruicamp` 重跑。`docker compose down -v` 會刪除本機 volume，不是一般驗證步驟。

## 3. 既有開發庫健康檢查

```powershell
docker compose up -d
docker compose ps
docker exec yuruicamp-db pg_isready -U postgres -d yuruicamp
```

再執行只讀核對：

```powershell
docker exec yuruicamp-db psql -U postgres -d yuruicamp -c "SELECT COUNT(*) AS customers FROM customers;"
docker exec yuruicamp-db psql -U postgres -d yuruicamp -c "SELECT COUNT(*) AS orders FROM orders;"
docker exec yuruicamp-db psql -U postgres -d yuruicamp -c "SELECT COUNT(*) AS bookings FROM bookings;"
```

詳細預期筆數以 [`docs/seed/README.md`](../../seed/README.md) 當前版本為準，不在本文件複製固定數字，避免 Seed 更新後雙份規格漂移。

## 4. 一次性資料庫完整灌入

以下名稱與 port 專供驗證；執行前先確認沒有同名容器。從專案根目錄執行：

```powershell
$verifyContainer = 'yuruicamp-seed-verify'
$verifyPort = '55433'

docker run --detach --name $verifyContainer `
  -e POSTGRES_USER=postgres `
  -e POSTGRES_PASSWORD=verify-only `
  -e POSTGRES_DB=yuruicamp_verify `
  -p "${verifyPort}:5432" `
  -v "${PWD}\docs\latest_schema.sql:/verify/latest_schema.sql:ro" `
  -v "${PWD}\docs\seed:/verify/seed:ro" `
  postgres:16
```

等待 `pg_isready` 成功後：

```powershell
docker exec $verifyContainer psql -v ON_ERROR_STOP=1 -U postgres -d yuruicamp_verify -f /verify/latest_schema.sql
docker exec $verifyContainer psql -v ON_ERROR_STOP=1 -U postgres -d yuruicamp_verify -f /verify/seed/002-dev-seed.sql
```

預期：兩個指令 exit code 都是 `0`；Seed 輸出包含 `BEGIN`、`COMMIT`，沒有 `ERROR`／`FATAL`。

## 5. 完整性 SQL

至少核對：

```sql
SELECT COUNT(*) FROM customers;
SELECT COUNT(*) FROM products;
SELECT COUNT(*) FROM product_variants;
SELECT COUNT(*) FROM orders;
SELECT COUNT(*) FROM order_items;
SELECT COUNT(*) FROM bookings;
SELECT COUNT(*) FROM booking_selected_zones;
SELECT COUNT(*) FROM booking_selected_rentals;

SELECT tag, COUNT(*)
FROM equipment_tags
WHERE tag IN ('新品', '熱銷')
GROUP BY tag
ORDER BY tag;

SELECT COUNT(*) AS orphan_order_items
FROM order_items i
LEFT JOIN orders o ON o.id = i.order_id
WHERE o.id IS NULL;

SELECT COUNT(*) AS orphan_booking_zones
FROM booking_selected_zones z
LEFT JOIN bookings b ON b.id = z.booking_id
WHERE b.id IS NULL;

SELECT customer_id, COUNT(*)
FROM customer_shipping_addresses
WHERE is_default = true
GROUP BY customer_id
HAVING COUNT(*) > 1;
```

孤兒與重複預設地址查詢應回 `0`／空集合；商品標籤應為新品 `10`、熱銷 `6`。新品 ID 必須符合可售商品 `created_at DESC, id DESC` 前 10，熱銷 ID 必須符合排除取消／退貨訂單後的 `order_items.quantity` 合計前 6。庫存與 active 保留的完整查詢以 `docs/seed/README.md` 和庫存資料庫文件為準。

## 6. JPA 與完整整合測試

將測試 datasource 指向一次性資料庫後執行：

```powershell
cd backend
$env:RUN_BACKEND_IT = 'true'
$env:DB_PASSWORD = 'verify-only'
.\mvnw.cmd test `
  -Dspring.datasource.url=jdbc:postgresql://localhost:55433/yuruicamp_verify
```

完成標準為所有測試 `Failures=0`、`Errors=0`、`Skipped=0`。若測試會共用 fixture，必須確認每個測試可獨立執行且能清理資料，避免順序相依。

驗證完成後，確認 `$verifyContainer` 值仍是上述專用名稱，才可移除一次性容器：

```powershell
docker rm --force yuruicamp-seed-verify
```

## 7. 通過標準

- 全新資料庫 Schema 與完整 Seed 一次成功。
- 主要資料筆數符合 `docs/seed/README.md`。
- FK、唯一性、保留量與預設地址檢查通過。
- Spring Context 與全部 PostgreSQL 整合測試全綠。
- 驗證沒有停止、重建或污染既有開發／正式資料庫。
