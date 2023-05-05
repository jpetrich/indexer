-- Up Migration

CREATE TABLE "collection_pools" (
  "address" BYTEA NOT NULL,
  "nft" BYTEA NOT NULL,
  "token" BYTEA NOT NULL,
  "bonding_curve" BYTEA NOT NULL,
  "pool_variant" SMALLINT NOT NULL,
  "pool_type" SMALLINT NOT NULL
);

ALTER TABLE "collection_pools"
  ADD CONSTRAINT "collection_pools_pk"
  PRIMARY KEY ("address");

ALTER TYPE "order_kind_t" ADD VALUE 'collectionxyz';

-- Down Migration

DROP TABLE "collection_pools";
