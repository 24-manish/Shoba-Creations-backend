-- Aligns the orders schema with the domain language used by the API layer.
--
-- Migration 001 created a generic commerce shape whose column names were
-- ambiguous in context: `city`, `phone`, `state` and `pincode` on `orders` are
-- shipping details, not customer profile fields. They are renamed rather than
-- duplicated so the API and the database agree on one name for each concept.
--
-- It also adds the two columns the order repository needs but the generic
-- shape lacked: a payment status, and a customer note. Finally it gives
-- `inventory_movements` a link back to the order that caused the movement, so
-- the audit trail can be queried per order rather than by free-text note alone.

BEGIN;

-- ---------------------------------------------------------------- orders
ALTER TABLE orders RENAME COLUMN city TO shipping_city;
ALTER TABLE orders RENAME COLUMN phone TO shipping_phone;
ALTER TABLE orders RENAME COLUMN state TO shipping_state;
ALTER TABLE orders RENAME COLUMN pincode TO shipping_pincode;

ALTER TABLE orders ADD COLUMN payment_status varchar(20) NOT NULL DEFAULT 'pending';
ALTER TABLE orders ADD COLUMN note text;

ALTER TABLE orders ADD CONSTRAINT orders_payment_status_check
  CHECK (payment_status IN ('pending', 'paid', 'refunded', 'failed'));

-- The seeded history predates payment_status. Cash on delivery is genuinely
-- outstanding at the point of sale; the prepaid methods were collected up front.
UPDATE orders
SET payment_status = CASE WHEN payment_method = 'cod' THEN 'pending' ELSE 'paid' END;

-- ----------------------------------------------------------- order_items
-- A product slug is stored alongside the name so a historical order still
-- links to the right page after the product is renamed.
ALTER TABLE order_items ADD COLUMN product_slug varchar(200);

UPDATE order_items oi
SET product_slug = p.slug
FROM products p
WHERE p.id = oi.product_id AND oi.product_slug IS NULL;

-- ------------------------------------------------- inventory_movements
ALTER TABLE inventory_movements ADD COLUMN order_id uuid REFERENCES orders(id) ON DELETE SET NULL;

-- `reinstatement` is written when a cancelled order is put back into
-- fulfilment and its stock is reserved again. Without it the cancel/restore
-- path fails its own CHECK constraint.
ALTER TABLE inventory_movements DROP CONSTRAINT inventory_movements_reason_check;
ALTER TABLE inventory_movements ADD CONSTRAINT inventory_movements_reason_check
  CHECK (reason IN ('adjustment', 'restock', 'sale', 'cancellation', 'reinstatement', 'seed'));

CREATE INDEX inventory_movements_order_idx ON inventory_movements (order_id)
  WHERE order_id IS NOT NULL;

COMMIT;
