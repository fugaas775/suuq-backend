--
-- PostgreSQL database dump
--

\restrict 1iMxfKKofCj9gtHAmOQt8jEftWmUtgbb1jqivsRWTIdO1bmcBVRSxtqq1DMRBqS

-- Dumped from database version 14.23 (Ubuntu 14.23-0ubuntu0.22.04.1)
-- Dumped by pg_dump version 14.23 (Ubuntu 14.23-0ubuntu0.22.04.1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: pg_trgm; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;


--
-- Name: EXTENSION pg_trgm; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION pg_trgm IS 'text similarity measurement and index searching based on trigrams';


--
-- Name: uuid-ossp; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA public;


--
-- Name: EXTENSION "uuid-ossp"; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION "uuid-ossp" IS 'generate universally unique identifiers (UUIDs)';


--
-- Name: branch_accrued_liabilities_category_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.branch_accrued_liabilities_category_enum AS ENUM (
    'PAYROLL',
    'RENT',
    'UTILITIES',
    'TAX',
    'INTEREST',
    'OTHER'
);


--
-- Name: branch_accrued_liabilities_status_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.branch_accrued_liabilities_status_enum AS ENUM (
    'OPEN',
    'SETTLED'
);


--
-- Name: branch_expenses_category_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.branch_expenses_category_enum AS ENUM (
    'RENT',
    'UTILITIES',
    'PAYROLL',
    'SUPPLIES',
    'MARKETING',
    'MAINTENANCE',
    'TAXES',
    'OTHER'
);


--
-- Name: branch_fixed_assets_category_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.branch_fixed_assets_category_enum AS ENUM (
    'EQUIPMENT',
    'FURNITURE',
    'VEHICLE',
    'LEASEHOLD_IMPROVEMENT',
    'TECHNOLOGY',
    'OTHER'
);


--
-- Name: branch_fixed_assets_status_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.branch_fixed_assets_status_enum AS ENUM (
    'ACTIVE',
    'DISPOSED'
);


--
-- Name: branch_long_term_debts_status_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.branch_long_term_debts_status_enum AS ENUM (
    'ACTIVE',
    'SETTLED'
);


--
-- Name: branch_staff_assignments_role_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.branch_staff_assignments_role_enum AS ENUM (
    'MANAGER',
    'OPERATOR'
);


--
-- Name: branch_transfers_status_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.branch_transfers_status_enum AS ENUM (
    'REQUESTED',
    'DISPATCHED',
    'RECEIVED',
    'CANCELLED'
);


--
-- Name: coupon_discounttype_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.coupon_discounttype_enum AS ENUM (
    'PERCENTAGE',
    'FIXED_AMOUNT'
);


--
-- Name: credit_transaction_type_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.credit_transaction_type_enum AS ENUM (
    'USAGE',
    'REPAYMENT',
    'ADJUSTMENT'
);


--
-- Name: dispute_status_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.dispute_status_enum AS ENUM (
    'OPEN',
    'RESOLVED',
    'REFUNDED'
);


--
-- Name: equity_partner_bnpl_credit_ledger_entrytype_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.equity_partner_bnpl_credit_ledger_entrytype_enum AS ENUM (
    'CREDIT_APPLIED'
);


--
-- Name: equity_partner_bnpl_status_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.equity_partner_bnpl_status_enum AS ENUM (
    'OUTSTANDING',
    'SETTLED',
    'FORGIVEN',
    'CANCELLED'
);


--
-- Name: equity_partners_status_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.equity_partners_status_enum AS ENUM (
    'PENDING',
    'ACTIVE',
    'SUSPENDED'
);


--
-- Name: equity_payouts_status_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.equity_payouts_status_enum AS ENUM (
    'PENDING',
    'PAID',
    'CANCELLED'
);


--
-- Name: gl_account_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.gl_account_type AS ENUM (
    'ASSET',
    'LIABILITY',
    'EQUITY',
    'REVENUE',
    'EXPENSE'
);


--
-- Name: gl_journal_source_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.gl_journal_source_type AS ENUM (
    'POS_CHECKOUT',
    'POS_RETURN',
    'POS_VOID_REVERSAL',
    'AR_SETTLEMENT',
    'HOSPITALITY_PAYMENT',
    'HOSPITALITY_SETTLEMENT',
    'DEPOSIT_OPEN',
    'DEPOSIT_REFUND',
    'DEPOSIT_FORFEIT',
    'REVENUE_ACCRUAL',
    'EXPENSE',
    'FIXED_ASSET',
    'DEPRECIATION',
    'ACCRUED_LIABILITY',
    'ACCRUED_SETTLEMENT',
    'LONG_TERM_DEBT',
    'PURCHASE_ORDER',
    'OPENING_BALANCE',
    'MANUAL'
);


--
-- Name: gl_normal_balance; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.gl_normal_balance AS ENUM (
    'DEBIT',
    'CREDIT'
);


--
-- Name: message_type_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.message_type_enum AS ENUM (
    'text',
    'image',
    'offer',
    'system'
);


--
-- Name: notification_type_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.notification_type_enum AS ENUM (
    'SYSTEM',
    'ORDER',
    'PROMOTION',
    'ACCOUNT',
    'PRODUCT_REQUEST',
    'ADMIN_BROADCAST',
    'CHAT'
);


--
-- Name: order_deliveryacceptancestatus_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.order_deliveryacceptancestatus_enum AS ENUM (
    'PENDING',
    'ACCEPTED',
    'REJECTED'
);


--
-- Name: order_item_status_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.order_item_status_enum AS ENUM (
    'PENDING',
    'PROCESSING',
    'SHIPPED',
    'OUT_FOR_DELIVERY',
    'DELIVERED',
    'DELIVERY_FAILED',
    'CANCELLED',
    'CANCELLED_BY_BUYER',
    'CANCELLED_BY_SELLER',
    'DISPUTED'
);


--
-- Name: order_paymentmethod_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.order_paymentmethod_enum AS ENUM (
    'COD',
    'STRIPE',
    'MPESA',
    'TELEBIRR',
    'EBIRR',
    'CBE',
    'WAAFI',
    'DMONEY',
    'BANK_TRANSFER',
    'CREDIT'
);


--
-- Name: order_paymentstatus_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.order_paymentstatus_enum AS ENUM (
    'UNPAID',
    'PAID',
    'FAILED'
);


--
-- Name: order_status_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.order_status_enum AS ENUM (
    'PENDING',
    'PROCESSING',
    'SHIPPED',
    'OUT_FOR_DELIVERY',
    'DELIVERED',
    'DELIVERY_FAILED',
    'CANCELLED',
    'CANCELLED_BY_BUYER',
    'CANCELLED_BY_SELLER',
    'DISPUTED'
);


--
-- Name: parked_orders_source_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.parked_orders_source_enum AS ENUM (
    'PRODUCT_DETAILS',
    'FEED',
    'CHAT',
    'REQUEST'
);


--
-- Name: parked_orders_status_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.parked_orders_status_enum AS ENUM (
    'PARKED',
    'CONTACTED',
    'CONVERTED',
    'CANCELLED'
);


--
-- Name: partner_credentials_partnertype_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.partner_credentials_partnertype_enum AS ENUM (
    'POS',
    'SUPPLIER',
    'INTERNAL'
);


--
-- Name: partner_credentials_status_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.partner_credentials_status_enum AS ENUM (
    'ACTIVE',
    'REVOKED'
);


--
-- Name: payout_log_provider_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.payout_log_provider_enum AS ENUM (
    'EBIRR',
    'MPESA',
    'TELEBIRR'
);


--
-- Name: payout_log_status_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.payout_log_status_enum AS ENUM (
    'PENDING',
    'SUCCESS',
    'FAILED'
);


--
-- Name: pos_checkouts_status_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.pos_checkouts_status_enum AS ENUM (
    'RECEIVED',
    'PROCESSED',
    'FAILED',
    'VOIDED'
);


--
-- Name: pos_checkouts_transactiontype_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.pos_checkouts_transactiontype_enum AS ENUM (
    'SALE',
    'RETURN'
);


--
-- Name: pos_register_sessions_status_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.pos_register_sessions_status_enum AS ENUM (
    'OPEN',
    'CLOSED'
);


--
-- Name: pos_suspended_carts_status_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.pos_suspended_carts_status_enum AS ENUM (
    'SUSPENDED',
    'RESUMED',
    'DISCARDED'
);


--
-- Name: pos_sync_jobs_status_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.pos_sync_jobs_status_enum AS ENUM (
    'RECEIVED',
    'PROCESSED',
    'FAILED'
);


--
-- Name: pos_sync_jobs_synctype_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.pos_sync_jobs_synctype_enum AS ENUM (
    'STOCK_SNAPSHOT',
    'STOCK_DELTA',
    'SALES_SUMMARY'
);


--
-- Name: procurement_webhook_deliveries_eventtype_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.procurement_webhook_deliveries_eventtype_enum AS ENUM (
    'PROCUREMENT_INTERVENTION_UPDATED',
    'PROCUREMENT_PURCHASE_ORDER_UPDATED',
    'PROCUREMENT_RECEIPT_DISCREPANCY_RESOLVED',
    'PROCUREMENT_RECEIPT_DISCREPANCY_APPROVED'
);


--
-- Name: procurement_webhook_deliveries_status_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.procurement_webhook_deliveries_status_enum AS ENUM (
    'PENDING',
    'SUCCEEDED',
    'FAILED'
);


--
-- Name: procurement_webhook_subscriptions_lastdeliverystatus_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.procurement_webhook_subscriptions_lastdeliverystatus_enum AS ENUM (
    'SUCCEEDED',
    'FAILED'
);


--
-- Name: procurement_webhook_subscriptions_status_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.procurement_webhook_subscriptions_status_enum AS ENUM (
    'ACTIVE',
    'PAUSED'
);


--
-- Name: product_aliases_aliastype_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.product_aliases_aliastype_enum AS ENUM (
    'LOCAL_SKU',
    'BARCODE',
    'GTIN',
    'EXTERNAL_PRODUCT_ID'
);


--
-- Name: product_request_condition_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.product_request_condition_enum AS ENUM (
    'ANY',
    'NEW',
    'USED'
);


--
-- Name: product_request_offer_status_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.product_request_offer_status_enum AS ENUM (
    'SENT',
    'SEEN',
    'ACCEPTED',
    'REJECTED',
    'WITHDRAWN',
    'EXPIRED'
);


--
-- Name: product_request_status_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.product_request_status_enum AS ENUM (
    'OPEN',
    'IN_PROGRESS',
    'FULFILLED',
    'CANCELLED',
    'EXPIRED'
);


--
-- Name: product_request_urgency_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.product_request_urgency_enum AS ENUM (
    'FLEXIBLE',
    'THIS_WEEK',
    'IMMEDIATE'
);


--
-- Name: purchase_orders_status_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.purchase_orders_status_enum AS ENUM (
    'DRAFT',
    'SUBMITTED',
    'ACKNOWLEDGED',
    'SHIPPED',
    'RECEIVED',
    'RECONCILED',
    'CANCELLED'
);


--
-- Name: retail_tenants_status_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.retail_tenants_status_enum AS ENUM (
    'ACTIVE',
    'SUSPENDED',
    'ARCHIVED'
);


--
-- Name: role_upgrade_request_status_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.role_upgrade_request_status_enum AS ENUM (
    'PENDING',
    'APPROVED',
    'REJECTED'
);


--
-- Name: role_upgrade_status_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.role_upgrade_status_enum AS ENUM (
    'PENDING',
    'APPROVED',
    'REJECTED'
);


--
-- Name: seller_workspaces_billingstatus_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.seller_workspaces_billingstatus_enum AS ENUM (
    'NOT_STARTED',
    'PLAN_SELECTED',
    'TRIAL',
    'ACTIVE',
    'PAST_DUE',
    'CANCELLED'
);


--
-- Name: seller_workspaces_status_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.seller_workspaces_status_enum AS ENUM (
    'ACTIVE',
    'ARCHIVED'
);


--
-- Name: settlement_status_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.settlement_status_enum AS ENUM (
    'PENDING',
    'PROCESSING',
    'COMPLETED',
    'FAILED'
);


--
-- Name: stock_movements_movementtype_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.stock_movements_movementtype_enum AS ENUM (
    'PURCHASE_RECEIPT',
    'TRANSFER',
    'SALE',
    'ADJUSTMENT'
);


--
-- Name: subscription_request_requestedtier_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.subscription_request_requestedtier_enum AS ENUM (
    'free',
    'pro'
);


--
-- Name: subscription_request_status_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.subscription_request_status_enum AS ENUM (
    'PENDING',
    'APPROVED',
    'REJECTED'
);


--
-- Name: supplier_offers_availabilitystatus_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.supplier_offers_availabilitystatus_enum AS ENUM (
    'IN_STOCK',
    'LOW_STOCK',
    'OUT_OF_STOCK'
);


--
-- Name: supplier_offers_status_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.supplier_offers_status_enum AS ENUM (
    'DRAFT',
    'PUBLISHED',
    'ARCHIVED'
);


--
-- Name: supplier_profiles_onboardingstatus_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.supplier_profiles_onboardingstatus_enum AS ENUM (
    'DRAFT',
    'PENDING_REVIEW',
    'APPROVED',
    'REJECTED'
);


--
-- Name: supplier_staff_assignments_role_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.supplier_staff_assignments_role_enum AS ENUM (
    'MANAGER',
    'OPERATOR'
);


--
-- Name: supply_outreach_status_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.supply_outreach_status_enum AS ENUM (
    'PENDING',
    'ASSIGNED',
    'COMPLETED',
    'CANCELLED'
);


--
-- Name: tenant_module_entitlements_module_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.tenant_module_entitlements_module_enum AS ENUM (
    'POS_CORE',
    'INVENTORY_CORE',
    'INVENTORY_AUTOMATION',
    'DESKTOP_BACKOFFICE',
    'ACCOUNTING',
    'ERP_CONNECTORS',
    'AI_ANALYTICS'
);


--
-- Name: tenant_subscriptions_billinginterval_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.tenant_subscriptions_billinginterval_enum AS ENUM (
    'MONTHLY',
    'YEARLY',
    'CUSTOM',
    'SIX_MONTHS',
    'ONE_YEAR'
);


--
-- Name: tenant_subscriptions_status_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.tenant_subscriptions_status_enum AS ENUM (
    'TRIAL',
    'ACTIVE',
    'PAST_DUE',
    'CANCELLED',
    'EXPIRED'
);


--
-- Name: top_up_request_status_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.top_up_request_status_enum AS ENUM (
    'PENDING',
    'APPROVED',
    'REJECTED'
);


--
-- Name: user_businessmodel_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.user_businessmodel_enum AS ENUM (
    'SUBSCRIPTION',
    'COMMISSION'
);


--
-- Name: user_settings_theme_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.user_settings_theme_enum AS ENUM (
    'light',
    'dark'
);


--
-- Name: user_subscriptiontier_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.user_subscriptiontier_enum AS ENUM (
    'free',
    'pro'
);


--
-- Name: user_verificationmethod_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.user_verificationmethod_enum AS ENUM (
    'AUTOMATIC',
    'MANUAL',
    'NONE'
);


--
-- Name: user_verificationstatus_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.user_verificationstatus_enum AS ENUM (
    'UNVERIFIED',
    'PENDING',
    'APPROVED',
    'REJECTED',
    'SUSPENDED'
);


--
-- Name: wallet_transaction_type_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.wallet_transaction_type_enum AS ENUM (
    'EARNING',
    'PAYOUT',
    'REFUND',
    'ADJUSTMENT',
    'DEPOSIT',
    'PAYMENT',
    'COMMISSION',
    'SUBSCRIPTION',
    'SUBSCRIPTION_RENEWAL'
);


--
-- Name: withdrawal_status_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.withdrawal_status_enum AS ENUM (
    'PENDING',
    'APPROVED',
    'REJECTED'
);


--
-- Name: withdrawals_status_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.withdrawals_status_enum AS ENUM (
    'PENDING',
    'APPROVED',
    'REJECTED'
);


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: audit_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_log (
    id integer NOT NULL,
    "actorId" integer,
    "actorEmail" character varying(255),
    action character varying(128) NOT NULL,
    "targetType" character varying(64) NOT NULL,
    "targetId" integer NOT NULL,
    reason text,
    meta jsonb,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: audit_log_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.audit_log_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: audit_log_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.audit_log_id_seq OWNED BY public.audit_log.id;


--
-- Name: branch_accrued_liabilities; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.branch_accrued_liabilities (
    id integer NOT NULL,
    "branchId" integer NOT NULL,
    label character varying(255) NOT NULL,
    category public.branch_accrued_liabilities_category_enum DEFAULT 'OTHER'::public.branch_accrued_liabilities_category_enum NOT NULL,
    status public.branch_accrued_liabilities_status_enum DEFAULT 'OPEN'::public.branch_accrued_liabilities_status_enum NOT NULL,
    amount numeric(12,2) NOT NULL,
    "accruedAt" timestamp without time zone NOT NULL,
    "dueAt" timestamp without time zone,
    "settledAt" timestamp without time zone,
    currency character varying(8) DEFAULT 'ETB'::character varying NOT NULL,
    note text,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: branch_accrued_liabilities_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.branch_accrued_liabilities_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: branch_accrued_liabilities_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.branch_accrued_liabilities_id_seq OWNED BY public.branch_accrued_liabilities.id;


--
-- Name: branch_catalog_product_links; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.branch_catalog_product_links (
    id integer NOT NULL,
    "branchId" integer NOT NULL,
    "productId" integer NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: branch_catalog_product_links_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.branch_catalog_product_links_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: branch_catalog_product_links_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.branch_catalog_product_links_id_seq OWNED BY public.branch_catalog_product_links.id;


--
-- Name: branch_catalog_vendor_links; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.branch_catalog_vendor_links (
    id integer NOT NULL,
    "branchId" integer NOT NULL,
    "vendorId" integer NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: branch_catalog_vendor_links_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.branch_catalog_vendor_links_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: branch_catalog_vendor_links_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.branch_catalog_vendor_links_id_seq OWNED BY public.branch_catalog_vendor_links.id;


--
-- Name: branch_depreciation_entries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.branch_depreciation_entries (
    id integer NOT NULL,
    "branchId" integer NOT NULL,
    "fixedAssetId" integer NOT NULL,
    amount numeric(12,2) NOT NULL,
    "occurredAt" timestamp without time zone NOT NULL,
    note text,
    "recordedByUserId" integer,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: branch_depreciation_entries_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.branch_depreciation_entries_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: branch_depreciation_entries_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.branch_depreciation_entries_id_seq OWNED BY public.branch_depreciation_entries.id;


--
-- Name: branch_expenses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.branch_expenses (
    id integer NOT NULL,
    "branchId" integer NOT NULL,
    category public.branch_expenses_category_enum NOT NULL,
    amount numeric(12,2) NOT NULL,
    currency character varying(8) DEFAULT 'ETB'::character varying NOT NULL,
    "occurredAt" timestamp without time zone NOT NULL,
    note text,
    "recordedByUserId" integer,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: branch_expenses_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.branch_expenses_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: branch_expenses_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.branch_expenses_id_seq OWNED BY public.branch_expenses.id;


--
-- Name: branch_fixed_assets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.branch_fixed_assets (
    id integer NOT NULL,
    "branchId" integer NOT NULL,
    name character varying(255) NOT NULL,
    category public.branch_fixed_assets_category_enum DEFAULT 'OTHER'::public.branch_fixed_assets_category_enum NOT NULL,
    status public.branch_fixed_assets_status_enum DEFAULT 'ACTIVE'::public.branch_fixed_assets_status_enum NOT NULL,
    "acquiredAt" timestamp without time zone NOT NULL,
    "disposedAt" timestamp without time zone,
    "capitalizationAmount" numeric(12,2) NOT NULL,
    "salvageValue" numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    "usefulLifeMonths" integer,
    currency character varying(8) DEFAULT 'ETB'::character varying NOT NULL,
    note text,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: branch_fixed_assets_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.branch_fixed_assets_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: branch_fixed_assets_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.branch_fixed_assets_id_seq OWNED BY public.branch_fixed_assets.id;


--
-- Name: branch_inventory; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.branch_inventory (
    id integer NOT NULL,
    "branchId" integer NOT NULL,
    "productId" integer NOT NULL,
    "quantityOnHand" integer DEFAULT 0 NOT NULL,
    "reservedQuantity" integer DEFAULT 0 NOT NULL,
    "lastReceivedAt" timestamp without time zone,
    "lastPurchaseOrderId" integer,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "reservedOnline" integer DEFAULT 0 NOT NULL,
    "reservedStoreOps" integer DEFAULT 0 NOT NULL,
    "inboundOpenPo" integer DEFAULT 0 NOT NULL,
    "outboundTransfers" integer DEFAULT 0 NOT NULL,
    "safetyStock" integer DEFAULT 0 NOT NULL,
    "availableToSell" integer DEFAULT 0 NOT NULL,
    version integer DEFAULT 0 NOT NULL
);


--
-- Name: branch_inventory_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.branch_inventory_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: branch_inventory_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.branch_inventory_id_seq OWNED BY public.branch_inventory.id;


--
-- Name: branch_inventory_variant; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.branch_inventory_variant (
    id integer NOT NULL,
    "branchId" integer NOT NULL,
    "variantId" integer NOT NULL,
    "productId" integer NOT NULL,
    "quantityOnHand" integer DEFAULT 0 NOT NULL,
    "reservedQuantity" integer DEFAULT 0 NOT NULL,
    "safetyStock" integer DEFAULT 0 NOT NULL,
    "availableToSell" integer DEFAULT 0 NOT NULL,
    version integer DEFAULT 0 NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: branch_inventory_variant_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.branch_inventory_variant_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: branch_inventory_variant_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.branch_inventory_variant_id_seq OWNED BY public.branch_inventory_variant.id;


--
-- Name: branch_long_term_debts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.branch_long_term_debts (
    id integer NOT NULL,
    "branchId" integer NOT NULL,
    "lenderName" character varying(255) NOT NULL,
    status public.branch_long_term_debts_status_enum DEFAULT 'ACTIVE'::public.branch_long_term_debts_status_enum NOT NULL,
    "principalAmount" numeric(12,2) NOT NULL,
    "outstandingPrincipal" numeric(12,2) NOT NULL,
    "currentPortionAmount" numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    "interestRate" numeric(6,4),
    "issuedAt" timestamp without time zone NOT NULL,
    "maturityAt" timestamp without time zone,
    "settledAt" timestamp without time zone,
    currency character varying(8) DEFAULT 'ETB'::character varying NOT NULL,
    note text,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: branch_long_term_debts_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.branch_long_term_debts_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: branch_long_term_debts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.branch_long_term_debts_id_seq OWNED BY public.branch_long_term_debts.id;


--
-- Name: branch_shift_staff; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.branch_shift_staff (
    id integer NOT NULL,
    "shiftId" integer NOT NULL,
    "branchId" integer NOT NULL,
    "userId" integer NOT NULL,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: branch_shift_staff_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.branch_shift_staff_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: branch_shift_staff_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.branch_shift_staff_id_seq OWNED BY public.branch_shift_staff.id;


--
-- Name: branch_shifts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.branch_shifts (
    id integer NOT NULL,
    "branchId" integer NOT NULL,
    name character varying(100) NOT NULL,
    "startTime" character varying(5) NOT NULL,
    "endTime" character varying(5) NOT NULL,
    "daysOfWeek" text DEFAULT ''::text NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: branch_shifts_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.branch_shifts_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: branch_shifts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.branch_shifts_id_seq OWNED BY public.branch_shifts.id;


--
-- Name: branch_staff_assignments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.branch_staff_assignments (
    id integer NOT NULL,
    "branchId" integer NOT NULL,
    "userId" integer NOT NULL,
    role public.branch_staff_assignments_role_enum NOT NULL,
    permissions text DEFAULT ''::text NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "assignedSurfaces" text,
    capabilities text DEFAULT ''::text NOT NULL,
    "sessionRevokedAt" timestamp with time zone,
    "posExperienceProfileCode" character varying,
    "serviceSharePct" smallint
);


--
-- Name: branch_staff_assignments_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.branch_staff_assignments_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: branch_staff_assignments_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.branch_staff_assignments_id_seq OWNED BY public.branch_staff_assignments.id;


--
-- Name: branch_staff_invites; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.branch_staff_invites (
    id integer NOT NULL,
    "branchId" integer NOT NULL,
    email character varying(255) NOT NULL,
    role public.branch_staff_assignments_role_enum NOT NULL,
    permissions text DEFAULT ''::text NOT NULL,
    "invitedByUserId" integer,
    "acceptedByUserId" integer,
    "isActive" boolean DEFAULT true NOT NULL,
    "acceptedAt" timestamp without time zone,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: branch_staff_invites_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.branch_staff_invites_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: branch_staff_invites_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.branch_staff_invites_id_seq OWNED BY public.branch_staff_invites.id;


--
-- Name: branch_transfer_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.branch_transfer_items (
    id integer NOT NULL,
    "transferId" integer NOT NULL,
    "productId" integer NOT NULL,
    quantity integer NOT NULL,
    note text
);


--
-- Name: branch_transfer_items_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.branch_transfer_items_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: branch_transfer_items_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.branch_transfer_items_id_seq OWNED BY public.branch_transfer_items.id;


--
-- Name: branch_transfers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.branch_transfers (
    id integer NOT NULL,
    "transferNumber" character varying(64) NOT NULL,
    "fromBranchId" integer NOT NULL,
    "toBranchId" integer NOT NULL,
    status public.branch_transfers_status_enum DEFAULT 'REQUESTED'::public.branch_transfers_status_enum NOT NULL,
    note text,
    "sourceType" character varying(64),
    "sourceReferenceId" integer,
    "sourceEntryIndex" integer,
    "requestedByUserId" integer,
    "requestedAt" timestamp without time zone,
    "dispatchedByUserId" integer,
    "dispatchedAt" timestamp without time zone,
    "receivedByUserId" integer,
    "receivedAt" timestamp without time zone,
    "cancelledByUserId" integer,
    "cancelledAt" timestamp without time zone,
    "statusMeta" jsonb DEFAULT '{}'::jsonb,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: branch_transfers_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.branch_transfers_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: branch_transfers_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.branch_transfers_id_seq OWNED BY public.branch_transfers.id;


--
-- Name: branches; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.branches (
    id integer NOT NULL,
    name character varying(255) NOT NULL,
    code character varying(64),
    "ownerId" integer,
    address character varying(255),
    city character varying(128),
    country character varying(128),
    timezone character varying(64),
    latitude numeric(10,7),
    longitude numeric(10,7),
    "externalRef" character varying(128),
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "retailTenantId" integer,
    "serviceFormat" character varying(32),
    phone character varying(32),
    "tinNumber" character varying(64),
    "vendorStoreId" integer,
    "defaultCategoryId" integer
);


--
-- Name: branches_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.branches_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: branches_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.branches_id_seq OWNED BY public.branches.id;


--
-- Name: cart; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cart (
    id integer NOT NULL,
    "userId" integer
);


--
-- Name: cart_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.cart_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: cart_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.cart_id_seq OWNED BY public.cart.id;


--
-- Name: cart_item; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cart_item (
    id integer NOT NULL,
    quantity integer NOT NULL,
    "productId" integer,
    "cartId" integer,
    attributes jsonb DEFAULT '{}'::jsonb NOT NULL
);


--
-- Name: cart_item_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.cart_item_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: cart_item_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.cart_item_id_seq OWNED BY public.cart_item.id;


--
-- Name: category; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.category (
    id integer NOT NULL,
    name character varying NOT NULL,
    slug character varying NOT NULL,
    "iconUrl" character varying,
    "iconName" character varying,
    "parentId" integer,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "sortOrder" integer DEFAULT 0 NOT NULL,
    "iconVersion" integer DEFAULT 0 NOT NULL,
    name_translations jsonb,
    "posSuggestedUserFit" character varying,
    attribute_schema jsonb
);


--
-- Name: category_closure; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.category_closure (
    id_ancestor integer NOT NULL,
    id_descendant integer NOT NULL
);


--
-- Name: category_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.category_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: category_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.category_id_seq OWNED BY public.category.id;


--
-- Name: conversation; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.conversation (
    id integer NOT NULL,
    "lastMessage" character varying,
    "lastMessageAt" timestamp without time zone,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "buyerId" integer,
    "vendorId" integer,
    "productId" integer,
    "delivererId" integer,
    "orderId" integer
);


--
-- Name: conversation_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.conversation_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: conversation_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.conversation_id_seq OWNED BY public.conversation.id;


--
-- Name: country; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.country (
    id integer NOT NULL,
    name character varying NOT NULL,
    "flagUrl" character varying NOT NULL,
    "imageUrl" character varying NOT NULL,
    description text NOT NULL,
    supplies jsonb DEFAULT '[]'::jsonb NOT NULL,
    name_translations jsonb,
    description_translations jsonb,
    "defaultLanguage" character varying(5)
);


--
-- Name: country_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.country_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: country_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.country_id_seq OWNED BY public.country.id;


--
-- Name: coupon; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.coupon (
    id integer NOT NULL,
    code character varying NOT NULL,
    "discountType" public.coupon_discounttype_enum NOT NULL,
    amount numeric(10,2) NOT NULL,
    "expiresAt" timestamp without time zone NOT NULL,
    "usageLimit" integer DEFAULT 0 NOT NULL,
    "usedCount" integer DEFAULT 0 NOT NULL,
    "minOrderAmount" numeric(10,2) DEFAULT 0 NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "vendorId" integer
);


--
-- Name: coupon_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.coupon_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: coupon_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.coupon_id_seq OWNED BY public.coupon.id;


--
-- Name: credit_limit; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.credit_limit (
    id integer NOT NULL,
    "userId" integer,
    "maxLimit" numeric(12,2) DEFAULT 0 NOT NULL,
    "currentUsage" numeric(12,2) DEFAULT 0 NOT NULL,
    currency character varying DEFAULT 'ETB'::character varying NOT NULL,
    "isEligible" boolean DEFAULT false NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "dueDate" timestamp without time zone,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: credit_limit_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.credit_limit_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: credit_limit_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.credit_limit_id_seq OWNED BY public.credit_limit.id;


--
-- Name: credit_transaction; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.credit_transaction (
    id integer NOT NULL,
    "userId" integer,
    type public.credit_transaction_type_enum NOT NULL,
    amount numeric(12,2) NOT NULL,
    "referenceId" character varying,
    description character varying,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: credit_transaction_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.credit_transaction_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: credit_transaction_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.credit_transaction_id_seq OWNED BY public.credit_transaction.id;


--
-- Name: device_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.device_tokens (
    id integer NOT NULL,
    "userId" integer NOT NULL,
    token character varying NOT NULL,
    platform character varying DEFAULT 'unknown'::character varying NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: device_tokens_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.device_tokens_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: device_tokens_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.device_tokens_id_seq OWNED BY public.device_tokens.id;


--
-- Name: dispute; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dispute (
    id integer NOT NULL,
    "orderId" integer NOT NULL,
    reason character varying NOT NULL,
    details text,
    status public.dispute_status_enum DEFAULT 'OPEN'::public.dispute_status_enum NOT NULL,
    "resolutionNotes" character varying,
    "resolvedBy" integer,
    "resolvedAt" timestamp without time zone,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: dispute_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.dispute_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: dispute_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.dispute_id_seq OWNED BY public.dispute.id;


--
-- Name: ebirr_transaction; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ebirr_transaction (
    id integer NOT NULL,
    merch_order_id character varying NOT NULL,
    "invoiceId" character varying,
    trans_id character varying,
    issuer_trans_id character varying,
    status character varying DEFAULT 'PENDING'::character varying NOT NULL,
    amount numeric(10,2) NOT NULL,
    currency character varying,
    payer_name character varying,
    payer_account character varying,
    req_transaction_id character varying,
    request_timestamp character varying,
    raw_request_payload text,
    raw_response_payload text,
    response_code character varying,
    response_msg character varying,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: ebirr_transaction_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.ebirr_transaction_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ebirr_transaction_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.ebirr_transaction_id_seq OWNED BY public.ebirr_transaction.id;


--
-- Name: equity_partner_bnpl_activations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.equity_partner_bnpl_activations (
    id integer NOT NULL,
    "equityPartnerId" integer NOT NULL,
    "branchId" integer NOT NULL,
    "tenantSubscriptionId" integer,
    "targetOwnerUserId" integer NOT NULL,
    period character varying(16) NOT NULL,
    "amountDue" numeric(12,2) NOT NULL,
    currency character varying(8) DEFAULT 'ETB'::character varying NOT NULL,
    status public.equity_partner_bnpl_status_enum DEFAULT 'OUTSTANDING'::public.equity_partner_bnpl_status_enum NOT NULL,
    "dueAt" timestamp without time zone NOT NULL,
    "settledAt" timestamp without time zone,
    "settlementReferenceId" character varying(128),
    metadata jsonb,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "equityCreditAmount" numeric(12,2) DEFAULT 0 NOT NULL,
    "settlementAmountDue" numeric(12,2) DEFAULT 0 NOT NULL
);


--
-- Name: equity_partner_bnpl_activations_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.equity_partner_bnpl_activations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: equity_partner_bnpl_activations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.equity_partner_bnpl_activations_id_seq OWNED BY public.equity_partner_bnpl_activations.id;


--
-- Name: equity_partner_bnpl_credit_ledger; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.equity_partner_bnpl_credit_ledger (
    id integer NOT NULL,
    "equityPartnerId" integer NOT NULL,
    "bnplActivationId" integer NOT NULL,
    "branchId" integer NOT NULL,
    "targetOwnerUserId" integer NOT NULL,
    period character varying(16) NOT NULL,
    "entryType" public.equity_partner_bnpl_credit_ledger_entrytype_enum DEFAULT 'CREDIT_APPLIED'::public.equity_partner_bnpl_credit_ledger_entrytype_enum NOT NULL,
    "grossAmount" numeric(12,2) NOT NULL,
    "equityCreditAmount" numeric(12,2) NOT NULL,
    "settlementAmountDue" numeric(12,2) NOT NULL,
    currency character varying(8) DEFAULT 'ETB'::character varying NOT NULL,
    "activationStatus" public.equity_partner_bnpl_status_enum DEFAULT 'OUTSTANDING'::public.equity_partner_bnpl_status_enum NOT NULL,
    "settlementReferenceId" character varying(128),
    metadata jsonb,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: equity_partner_bnpl_credit_ledger_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.equity_partner_bnpl_credit_ledger_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: equity_partner_bnpl_credit_ledger_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.equity_partner_bnpl_credit_ledger_id_seq OWNED BY public.equity_partner_bnpl_credit_ledger.id;


--
-- Name: equity_partners; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.equity_partners (
    id integer NOT NULL,
    "userId" integer,
    "displayName" character varying(255) NOT NULL,
    phone character varying(64) NOT NULL,
    "bankAccountInfo" jsonb,
    "referralCode" character varying(16),
    status public.equity_partners_status_enum DEFAULT 'PENDING'::public.equity_partners_status_enum NOT NULL,
    notes text,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "referrerEquityPartnerId" integer,
    "tierNumerator" integer DEFAULT 1 NOT NULL,
    "tierDenominator" integer DEFAULT 10 NOT NULL,
    "bnplCreditLimit" integer DEFAULT 5 NOT NULL,
    "hostRetailTenantId" integer
);


--
-- Name: equity_partners_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.equity_partners_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: equity_partners_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.equity_partners_id_seq OWNED BY public.equity_partners.id;


--
-- Name: equity_payouts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.equity_payouts (
    id integer NOT NULL,
    "equityPartnerId" integer NOT NULL,
    "branchId" integer NOT NULL,
    "billingPeriodStart" timestamp without time zone NOT NULL,
    "billingPeriodEnd" timestamp without time zone NOT NULL,
    "grossAmount" numeric(12,2) DEFAULT 1900 NOT NULL,
    "splitAmount" numeric(12,2) DEFAULT 950 NOT NULL,
    currency character varying(8) DEFAULT 'ETB'::character varying NOT NULL,
    status public.equity_payouts_status_enum DEFAULT 'PENDING'::public.equity_payouts_status_enum NOT NULL,
    "paidAt" timestamp without time zone,
    notes text,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: equity_payouts_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.equity_payouts_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: equity_payouts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.equity_payouts_id_seq OWNED BY public.equity_payouts.id;


--
-- Name: equity_split_assignments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.equity_split_assignments (
    id integer NOT NULL,
    "equityPartnerId" integer NOT NULL,
    "branchId" integer NOT NULL,
    "retailTenantId" integer,
    "splitNumerator" integer DEFAULT 1 NOT NULL,
    "splitDenominator" integer DEFAULT 2 NOT NULL,
    "assignedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "activeUntil" timestamp without time zone
);


--
-- Name: equity_split_assignments_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.equity_split_assignments_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: equity_split_assignments_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.equity_split_assignments_id_seq OWNED BY public.equity_split_assignments.id;


--
-- Name: favorites; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.favorites (
    "userId" integer NOT NULL,
    ids integer[] DEFAULT '{}'::integer[] NOT NULL,
    version integer DEFAULT 0 NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: feed_interactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.feed_interactions (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    "requestId" character varying(255),
    "productId" character varying(255) NOT NULL,
    action character varying(50) NOT NULL,
    "userId" character varying(255),
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: flash_sale; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.flash_sale (
    id integer NOT NULL,
    title character varying NOT NULL,
    description text,
    "startTime" timestamp without time zone NOT NULL,
    "endTime" timestamp without time zone NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "discountPercentage" numeric(5,2) DEFAULT 0 NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: flash_sale_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.flash_sale_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: flash_sale_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.flash_sale_id_seq OWNED BY public.flash_sale.id;


--
-- Name: flash_sale_products_product; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.flash_sale_products_product (
    "flashSaleId" integer NOT NULL,
    "productId" integer NOT NULL
);


--
-- Name: gl_accounts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.gl_accounts (
    code character varying(8) NOT NULL,
    name character varying(128) NOT NULL,
    type public.gl_account_type NOT NULL,
    "normalBalance" public.gl_normal_balance NOT NULL,
    "isCurrent" boolean,
    contra boolean DEFAULT false NOT NULL
);


--
-- Name: gl_journal_entries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.gl_journal_entries (
    id integer NOT NULL,
    "branchId" integer NOT NULL,
    "occurredAt" timestamp without time zone NOT NULL,
    "postedAt" timestamp without time zone,
    "sourceType" public.gl_journal_source_type NOT NULL,
    "sourceId" character varying(128),
    "idempotencyKey" character varying(255) NOT NULL,
    currency character varying(8) DEFAULT 'ETB'::character varying NOT NULL,
    memo character varying(500),
    "reversesEntryId" integer,
    "reversedByEntryId" integer,
    "createdByUserId" integer,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: gl_journal_entries_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.gl_journal_entries_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: gl_journal_entries_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.gl_journal_entries_id_seq OWNED BY public.gl_journal_entries.id;


--
-- Name: gl_journal_lines; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.gl_journal_lines (
    id integer NOT NULL,
    "entryId" integer NOT NULL,
    "branchId" integer NOT NULL,
    "accountCode" character varying(8) NOT NULL,
    debit numeric(14,2) DEFAULT '0'::numeric NOT NULL,
    credit numeric(14,2) DEFAULT '0'::numeric NOT NULL,
    "occurredAt" timestamp without time zone NOT NULL,
    currency character varying(8) DEFAULT 'ETB'::character varying NOT NULL,
    metadata jsonb
);


--
-- Name: gl_journal_lines_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.gl_journal_lines_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: gl_journal_lines_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.gl_journal_lines_id_seq OWNED BY public.gl_journal_lines.id;


--
-- Name: media_cleanup_task; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.media_cleanup_task (
    id integer NOT NULL,
    key character varying(512) NOT NULL,
    reason_type character varying(50),
    reason_id character varying(50),
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: media_cleanup_task_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.media_cleanup_task_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: media_cleanup_task_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.media_cleanup_task_id_seq OWNED BY public.media_cleanup_task.id;


--
-- Name: message; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.message (
    id integer NOT NULL,
    content text NOT NULL,
    "readAt" timestamp without time zone,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "conversationId" integer,
    "senderId" integer NOT NULL,
    type public.message_type_enum DEFAULT 'text'::public.message_type_enum NOT NULL
);


--
-- Name: message_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.message_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: message_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.message_id_seq OWNED BY public.message.id;


--
--



--
-- Name: notification; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notification (
    id integer NOT NULL,
    title character varying NOT NULL,
    body text,
    type public.notification_type_enum DEFAULT 'SYSTEM'::public.notification_type_enum NOT NULL,
    data jsonb,
    "isRead" boolean DEFAULT false NOT NULL,
    "recipientId" integer,
    "readAt" timestamp without time zone,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: notification_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.notification_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: notification_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.notification_id_seq OWNED BY public.notification.id;


--
-- Name: order; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."order" (
    id integer NOT NULL,
    total numeric(10,2) NOT NULL,
    "paymentMethod" public.order_paymentmethod_enum NOT NULL,
    "paymentStatus" public.order_paymentstatus_enum DEFAULT 'UNPAID'::public.order_paymentstatus_enum NOT NULL,
    status public.order_status_enum DEFAULT 'PENDING'::public.order_status_enum NOT NULL,
    "shippingAddress" jsonb NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "userId" integer,
    "delivererId" integer,
    currency character(3) DEFAULT 'USD'::bpchar NOT NULL,
    exchange_rate numeric(10,4) DEFAULT '1'::numeric NOT NULL,
    "deliveryAcceptanceStatus" public.order_deliveryacceptancestatus_enum,
    "deliveryCode" character varying,
    "deliveryAttemptCount" integer DEFAULT 0 NOT NULL,
    "proofOfDeliveryUrl" character varying,
    "paymentProofUrl" character varying,
    "couponCode" character varying,
    "discountAmount" numeric(10,2) DEFAULT '0'::numeric NOT NULL,
    "paymentProofKey" character varying,
    "paymentProofMimeType" character varying,
    "paymentProofSizeBytes" integer,
    "paymentProofUploadedAt" timestamp without time zone,
    "paymentProofStatus" character varying(32),
    "deliveryFailureReasonCode" character varying(64),
    "deliveryFailureNotes" character varying(1024),
    "deliveryAssignedAt" timestamp without time zone,
    "outForDeliveryAt" timestamp without time zone,
    "deliveryResolvedAt" timestamp without time zone,
    "deliveryAttentionNotificationState" jsonb,
    "fulfillmentBranchId" integer,
    "onlineReservationReleasedAt" timestamp without time zone
);


--
-- Name: order_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.order_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: order_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.order_id_seq OWNED BY public."order".id;


--
-- Name: order_item; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.order_item (
    id integer NOT NULL,
    quantity integer NOT NULL,
    price numeric(10,2) NOT NULL,
    "productId" integer,
    "orderId" integer,
    status public.order_item_status_enum DEFAULT 'PENDING'::public.order_item_status_enum NOT NULL,
    "shippedAt" timestamp without time zone,
    "deliveredAt" timestamp without time zone,
    "trackingCarrier" character varying(255),
    "trackingNumber" character varying(255),
    "trackingUrl" character varying(1024),
    commission numeric(10,2) DEFAULT '0'::numeric NOT NULL,
    "vendorPayout" numeric(10,2) DEFAULT '0'::numeric NOT NULL,
    attributes jsonb DEFAULT '{}'::jsonb NOT NULL,
    "platformFee" numeric(10,2) DEFAULT 0 NOT NULL,
    "gatewayFee" numeric(10,2) DEFAULT 0 NOT NULL,
    image_url character varying(1024)
);


--
-- Name: order_item_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.order_item_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: order_item_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.order_item_id_seq OWNED BY public.order_item.id;


--
-- Name: parked_orders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.parked_orders (
    id integer NOT NULL,
    "productId" integer,
    "productName" character varying(255),
    "productImageUrl" character varying(1024),
    "vendorId" integer NOT NULL,
    "branchId" integer,
    quantity integer DEFAULT 1 NOT NULL,
    "unitPrice" numeric(12,2),
    currency character varying(3),
    attributes jsonb,
    "customerUserId" integer,
    "customerName" character varying(160),
    "customerPhone" character varying(40),
    note text,
    source public.parked_orders_source_enum DEFAULT 'PRODUCT_DETAILS'::public.parked_orders_source_enum NOT NULL,
    status public.parked_orders_status_enum DEFAULT 'PARKED'::public.parked_orders_status_enum NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: parked_orders_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.parked_orders_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: parked_orders_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.parked_orders_id_seq OWNED BY public.parked_orders.id;


--
-- Name: partner_credentials; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.partner_credentials (
    id integer NOT NULL,
    name character varying(255) NOT NULL,
    "partnerType" public.partner_credentials_partnertype_enum NOT NULL,
    scopes text DEFAULT ''::text NOT NULL,
    "keyHash" character varying(255) NOT NULL,
    status public.partner_credentials_status_enum DEFAULT 'ACTIVE'::public.partner_credentials_status_enum NOT NULL,
    "lastUsedAt" timestamp without time zone,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "revokedAt" timestamp without time zone,
    "revokedByUserId" integer,
    "revocationReason" character varying(500),
    "branchId" integer
);


--
-- Name: partner_credentials_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.partner_credentials_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: partner_credentials_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.partner_credentials_id_seq OWNED BY public.partner_credentials.id;


--
-- Name: payment_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payment_logs (
    id integer NOT NULL,
    provider character varying(32) NOT NULL,
    channel character varying(32) NOT NULL,
    "orderId" character varying(64),
    "eventType" character varying(64),
    "processingStatus" character varying(64),
    "signatureValid" boolean,
    "requestHeaders" jsonb,
    "rawPayload" jsonb,
    "processingMeta" jsonb,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "webhookTimestamp" character varying(64)
);


--
-- Name: payment_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.payment_logs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: payment_logs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.payment_logs_id_seq OWNED BY public.payment_logs.id;


--
-- Name: payout_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payout_log (
    id integer NOT NULL,
    provider public.payout_log_provider_enum DEFAULT 'EBIRR'::public.payout_log_provider_enum NOT NULL,
    amount numeric(10,2) NOT NULL,
    currency character varying(3) NOT NULL,
    "phoneNumber" character varying NOT NULL,
    "transactionReference" character varying NOT NULL,
    "orderId" integer,
    "orderItemId" integer,
    status public.payout_log_status_enum DEFAULT 'SUCCESS'::public.payout_log_status_enum NOT NULL,
    "failureReason" character varying,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "vendorId" integer
);


--
-- Name: payout_log_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.payout_log_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: payout_log_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.payout_log_id_seq OWNED BY public.payout_log.id;


--
-- Name: pos_branch_security; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pos_branch_security (
    "branchId" integer NOT NULL,
    "operatorSessionsRevokedAt" timestamp with time zone,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: pos_checkouts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pos_checkouts (
    id integer NOT NULL,
    "branchId" integer NOT NULL,
    "partnerCredentialId" integer,
    "externalCheckoutId" character varying(255),
    "idempotencyKey" character varying(255),
    "registerId" character varying(128),
    "registerSessionId" integer,
    "suspendedCartId" integer,
    "receiptNumber" character varying(128),
    "transactionType" public.pos_checkouts_transactiontype_enum NOT NULL,
    status public.pos_checkouts_status_enum DEFAULT 'RECEIVED'::public.pos_checkouts_status_enum NOT NULL,
    currency character varying(3) NOT NULL,
    subtotal numeric(12,2) NOT NULL,
    "discountAmount" numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    "taxAmount" numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    total numeric(12,2) NOT NULL,
    "paidAmount" numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    "changeDue" numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    "itemCount" integer DEFAULT 0 NOT NULL,
    "occurredAt" timestamp without time zone NOT NULL,
    "processedAt" timestamp without time zone,
    "cashierUserId" integer,
    "cashierName" character varying(255),
    note text,
    "failureReason" text,
    metadata jsonb,
    tenders jsonb DEFAULT '[]'::jsonb NOT NULL,
    items jsonb DEFAULT '[]'::jsonb NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "voidedAt" timestamp without time zone,
    "voidedByUserId" integer,
    "voidReason" text,
    "tipAmount" numeric(12,2) DEFAULT 0 NOT NULL
);


--
-- Name: pos_checkouts_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.pos_checkouts_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: pos_checkouts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.pos_checkouts_id_seq OWNED BY public.pos_checkouts.id;


--
-- Name: pos_checkouts_occ_fix_bak_81; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pos_checkouts_occ_fix_bak_81 (
    id integer,
    old_occurred_at timestamp without time zone,
    "createdAt" timestamp without time zone
);


--
-- Name: pos_hospitality_bill_interventions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pos_hospitality_bill_interventions (
    id integer NOT NULL,
    "branchId" integer NOT NULL,
    "interventionId" character varying(128) NOT NULL,
    "billId" character varying(128) NOT NULL,
    "billLabel" character varying(255) NOT NULL,
    "tableId" character varying(128),
    "tableLabel" character varying(255),
    "receiptId" character varying(128),
    "receiptNumber" character varying(128),
    "actionType" character varying(16) NOT NULL,
    "lifecycleStatus" character varying(32) NOT NULL,
    "serviceOwner" character varying(255),
    "itemCount" integer DEFAULT 0 NOT NULL,
    total numeric(12,2) DEFAULT 0 NOT NULL,
    currency character varying(8) DEFAULT 'ETB'::character varying NOT NULL,
    reason text,
    priority character varying(16) NOT NULL,
    "actorUserId" integer,
    "actorDisplayName" character varying(255),
    version integer DEFAULT 1 NOT NULL,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: pos_hospitality_bill_interventions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.pos_hospitality_bill_interventions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: pos_hospitality_bill_interventions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.pos_hospitality_bill_interventions_id_seq OWNED BY public.pos_hospitality_bill_interventions.id;


--
-- Name: pos_hospitality_idempotency_keys; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pos_hospitality_idempotency_keys (
    id integer NOT NULL,
    "branchId" integer NOT NULL,
    "idempotencyKey" character varying(255) NOT NULL,
    "responsePayload" jsonb NOT NULL,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: pos_hospitality_idempotency_keys_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.pos_hospitality_idempotency_keys_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: pos_hospitality_idempotency_keys_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.pos_hospitality_idempotency_keys_id_seq OWNED BY public.pos_hospitality_idempotency_keys.id;


--
-- Name: pos_hospitality_kitchen_tickets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pos_hospitality_kitchen_tickets (
    id integer NOT NULL,
    "branchId" integer NOT NULL,
    "ticketId" character varying(128) NOT NULL,
    "serviceFormat" character varying(16) NOT NULL,
    "stationCode" character varying(32) NOT NULL,
    "stationLabel" character varying(128) NOT NULL,
    state character varying(32) NOT NULL,
    "queuedAt" timestamp with time zone NOT NULL,
    "firedAt" timestamp with time zone,
    "readyAt" timestamp with time zone,
    "handedOffAt" timestamp with time zone,
    "ticketLabel" character varying(255) NOT NULL,
    "receiptId" character varying(128),
    "serviceOwner" character varying(255),
    "tableId" character varying(128),
    "tableLabel" character varying(255),
    "billId" character varying(128),
    "billLabel" character varying(255),
    lines jsonb,
    "updatedByUserId" integer,
    "updatedByDisplayName" character varying(255),
    "lastActionReason" text,
    version integer DEFAULT 1 NOT NULL,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: pos_hospitality_kitchen_tickets_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.pos_hospitality_kitchen_tickets_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: pos_hospitality_kitchen_tickets_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.pos_hospitality_kitchen_tickets_id_seq OWNED BY public.pos_hospitality_kitchen_tickets.id;


--
-- Name: pos_hospitality_table_board; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pos_hospitality_table_board (
    id integer NOT NULL,
    "branchId" integer NOT NULL,
    "tableId" character varying(128) NOT NULL,
    "tableLabel" character varying(255) NOT NULL,
    "areaCode" character varying(64) DEFAULT 'MAIN_ROOM'::character varying NOT NULL,
    status character varying(32) DEFAULT 'OPEN'::character varying NOT NULL,
    "seatCount" integer DEFAULT 4 NOT NULL,
    "ownerUserId" integer,
    "ownerReference" character varying(255),
    "ownerDisplayName" character varying(255),
    "activeGuestCount" integer DEFAULT 0 NOT NULL,
    "activeBills" jsonb DEFAULT '[]'::jsonb NOT NULL,
    "courseSummary" jsonb DEFAULT '{"fired": 0, "ready": 0, "served": 0, "ordered": 0}'::jsonb NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: pos_hospitality_table_board_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.pos_hospitality_table_board_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: pos_hospitality_table_board_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.pos_hospitality_table_board_id_seq OWNED BY public.pos_hospitality_table_board.id;


--
-- Name: pos_hotel_folio_charges; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pos_hotel_folio_charges (
    id bigint NOT NULL,
    "folioId" bigint NOT NULL,
    "branchId" integer NOT NULL,
    "chargeGroupCode" character varying(64),
    "chargeName" character varying(255) NOT NULL,
    amount numeric(14,2) NOT NULL,
    currency character varying(8) DEFAULT 'ETB'::character varying NOT NULL,
    quantity integer DEFAULT 1 NOT NULL,
    "idempotencyKey" character varying(255),
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: pos_hotel_folio_charges_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.pos_hotel_folio_charges_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: pos_hotel_folio_charges_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.pos_hotel_folio_charges_id_seq OWNED BY public.pos_hotel_folio_charges.id;


--
-- Name: pos_hotel_folios; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pos_hotel_folios (
    id bigint NOT NULL,
    "branchId" integer NOT NULL,
    "localRef" character varying(255),
    status character varying(16) DEFAULT 'OPEN'::character varying NOT NULL,
    "roomNumber" character varying(64) NOT NULL,
    "guestName" character varying(255),
    "checkInAt" date,
    "checkOutAt" date,
    currency character varying(8) DEFAULT 'ETB'::character varying NOT NULL,
    "chargesTotal" numeric(14,2) DEFAULT 0 NOT NULL,
    "settledCheckoutId" character varying(128),
    "paidAmount" numeric(14,2),
    "voidReason" text,
    "transferredToRoom" character varying(64),
    "idempotencyKey" character varying(255),
    "openedByUserId" integer,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
    "settledAt" timestamp with time zone,
    "voidedAt" timestamp with time zone,
    "guestPhone" character varying(64),
    "guestNationality" character varying(64),
    "guestIdType" character varying(32),
    "guestIdNumber" character varying(128),
    "rateId" bigint,
    "reservationId" bigint
);


--
-- Name: pos_hotel_folios_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.pos_hotel_folios_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: pos_hotel_folios_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.pos_hotel_folios_id_seq OWNED BY public.pos_hotel_folios.id;


--
-- Name: pos_hotel_night_audit_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pos_hotel_night_audit_logs (
    id bigint NOT NULL,
    "branchId" bigint NOT NULL,
    "auditDate" character varying(10) NOT NULL,
    "foliosProcessed" integer DEFAULT 0 NOT NULL,
    "chargesPosted" integer DEFAULT 0 NOT NULL,
    "totalAmount" numeric(14,2) DEFAULT 0 NOT NULL,
    currency character varying(8) DEFAULT 'ETB'::character varying NOT NULL,
    "triggeredByUserId" bigint,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    status character varying(16) DEFAULT 'COMPLETED'::character varying NOT NULL
);


--
-- Name: pos_hotel_night_audit_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.pos_hotel_night_audit_logs_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: pos_hotel_night_audit_logs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.pos_hotel_night_audit_logs_id_seq OWNED BY public.pos_hotel_night_audit_logs.id;


--
-- Name: pos_hotel_rate_plans; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pos_hotel_rate_plans (
    id bigint NOT NULL,
    "branchId" integer NOT NULL,
    name character varying(255) NOT NULL,
    "roomType" character varying(64),
    "weekdayRate" numeric(14,2) NOT NULL,
    "weekendRate" numeric(14,2),
    currency character varying(8) DEFAULT 'ETB'::character varying NOT NULL,
    "taxPercent" numeric(6,2),
    "serviceChargePercent" numeric(6,2),
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
    "mealPlan" character varying(32) DEFAULT 'ROOM_ONLY'::character varying NOT NULL,
    "minimumNights" integer DEFAULT 1 NOT NULL,
    "validFrom" date,
    "validTo" date
);


--
-- Name: pos_hotel_rate_plans_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.pos_hotel_rate_plans_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: pos_hotel_rate_plans_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.pos_hotel_rate_plans_id_seq OWNED BY public.pos_hotel_rate_plans.id;


--
-- Name: pos_hotel_reservations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pos_hotel_reservations (
    id bigint NOT NULL,
    "branchId" integer NOT NULL,
    status character varying(24) DEFAULT 'CONFIRMED'::character varying NOT NULL,
    "roomNumber" character varying(64),
    "roomType" character varying(64),
    "guestName" character varying(255) NOT NULL,
    "guestPhone" character varying(64),
    "guestEmail" character varying(255),
    "guestNationality" character varying(64),
    "guestIdType" character varying(32),
    "guestIdNumber" character varying(128),
    "numberOfGuests" integer DEFAULT 1,
    "checkInAt" date NOT NULL,
    "checkOutAt" date NOT NULL,
    "ratePlanId" bigint,
    "folioId" bigint,
    notes text,
    "createdByUserId" integer,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
    source character varying(32) DEFAULT 'POS'::character varying NOT NULL,
    "customerUserId" integer,
    "paymentSessionId" character varying(128),
    "prepaymentStatus" character varying(24)
);


--
-- Name: pos_hotel_reservations_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.pos_hotel_reservations_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: pos_hotel_reservations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.pos_hotel_reservations_id_seq OWNED BY public.pos_hotel_reservations.id;


--
-- Name: pos_hotel_rooms; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pos_hotel_rooms (
    id bigint NOT NULL,
    "branchId" integer NOT NULL,
    "roomNumber" character varying(64) NOT NULL,
    "roomType" character varying(64),
    floor integer,
    "maxOccupancy" integer DEFAULT 2,
    description text,
    status character varying(16) DEFAULT 'ACTIVE'::character varying NOT NULL,
    metadata jsonb,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: pos_hotel_rooms_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.pos_hotel_rooms_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: pos_hotel_rooms_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.pos_hotel_rooms_id_seq OWNED BY public.pos_hotel_rooms.id;


--
-- Name: pos_kitchen_product_availability; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pos_kitchen_product_availability (
    id integer NOT NULL,
    "branchId" integer NOT NULL,
    "productId" character varying(128) NOT NULL,
    available boolean DEFAULT false NOT NULL,
    "qtyRemaining" integer,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: pos_kitchen_product_availability_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.pos_kitchen_product_availability_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: pos_kitchen_product_availability_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.pos_kitchen_product_availability_id_seq OWNED BY public.pos_kitchen_product_availability.id;


--
-- Name: pos_property_rate_plans; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pos_property_rate_plans (
    id bigint NOT NULL,
    "branchId" integer NOT NULL,
    name character varying(255) NOT NULL,
    "propertyId" bigint,
    "monthlyRate" numeric(14,2),
    "weeklyRate" numeric(14,2),
    "nightlyRate" numeric(14,2),
    "depositAmount" numeric(14,2),
    "lateFeeAmount" numeric(14,2),
    currency character varying(8) DEFAULT 'ETB'::character varying NOT NULL,
    "taxPercent" numeric(6,2),
    "isActive" boolean DEFAULT true NOT NULL,
    "validFrom" date,
    "validTo" date,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: pos_property_rate_plans_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.pos_property_rate_plans_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: pos_property_rate_plans_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.pos_property_rate_plans_id_seq OWNED BY public.pos_property_rate_plans.id;


--
-- Name: pos_property_rental_booking_charges; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pos_property_rental_booking_charges (
    id bigint NOT NULL,
    "bookingId" bigint NOT NULL,
    "branchId" integer NOT NULL,
    "chargeGroupCode" character varying(64),
    "chargeName" character varying(255) NOT NULL,
    amount numeric(14,2) NOT NULL,
    currency character varying(8) DEFAULT 'ETB'::character varying NOT NULL,
    quantity integer DEFAULT 1 NOT NULL,
    recurring boolean DEFAULT false NOT NULL,
    notes text,
    "idempotencyKey" character varying(255),
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: pos_property_rental_booking_charges_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.pos_property_rental_booking_charges_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: pos_property_rental_booking_charges_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.pos_property_rental_booking_charges_id_seq OWNED BY public.pos_property_rental_booking_charges.id;


--
-- Name: pos_property_rental_bookings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pos_property_rental_bookings (
    id bigint NOT NULL,
    "branchId" integer NOT NULL,
    "localRef" character varying(255),
    status character varying(16) DEFAULT 'OPEN'::character varying NOT NULL,
    "propertyCode" character varying(64) NOT NULL,
    "propertyId" bigint,
    "renterName" character varying(255),
    "renterPhone" character varying(64),
    "renterEmail" character varying(255),
    "tenantType" character varying(16) DEFAULT 'INDIVIDUAL'::character varying NOT NULL,
    "renterNationality" character varying(64),
    "idType" character varying(32),
    "idNumber" character varying(128),
    "areaSqm" numeric(10,2),
    "ratePlanId" bigint,
    "reservationId" bigint,
    "leaseStartAt" date,
    "leaseEndAt" date,
    "billingCycle" character varying(8) DEFAULT 'MONTH'::character varying NOT NULL,
    "periodsBilled" integer DEFAULT 0 NOT NULL,
    currency character varying(8) DEFAULT 'ETB'::character varying NOT NULL,
    "depositAmount" numeric(14,2) DEFAULT 0 NOT NULL,
    "depositRefund" numeric(14,2),
    "chargesTotal" numeric(14,2) DEFAULT 0 NOT NULL,
    "settledCheckoutId" character varying(128),
    "paidAmount" numeric(14,2),
    "voidReason" text,
    "transferredToProperty" character varying(64),
    "idempotencyKey" character varying(255),
    "openedByUserId" integer,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
    "settledAt" timestamp with time zone,
    "voidedAt" timestamp with time zone,
    payments jsonb,
    "depositForfeit" numeric(14,2),
    "recognizedAmount" numeric(14,2) DEFAULT '0'::numeric NOT NULL
);


--
-- Name: pos_property_rental_bookings_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.pos_property_rental_bookings_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: pos_property_rental_bookings_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.pos_property_rental_bookings_id_seq OWNED BY public.pos_property_rental_bookings.id;


--
-- Name: pos_property_reservations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pos_property_reservations (
    id bigint NOT NULL,
    "branchId" integer NOT NULL,
    status character varying(16) DEFAULT 'HOLD'::character varying NOT NULL,
    "propertyCode" character varying(64),
    "renterName" character varying(255) NOT NULL,
    "renterPhone" character varying(64),
    "renterEmail" character varying(255),
    "numberOfOccupants" integer,
    "leaseStartAt" date,
    "leaseEndAt" date,
    "ratePlanId" bigint,
    "bookingId" bigint,
    notes text,
    "createdByUserId" integer,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: pos_property_reservations_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.pos_property_reservations_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: pos_property_reservations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.pos_property_reservations_id_seq OWNED BY public.pos_property_reservations.id;


--
-- Name: pos_property_units; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pos_property_units (
    id bigint NOT NULL,
    "branchId" integer NOT NULL,
    "propertyCode" character varying(64) NOT NULL,
    name character varying(255) NOT NULL,
    "unitType" character varying(16) DEFAULT 'OTHER'::character varying NOT NULL,
    address character varying(255),
    capacity integer,
    "areaSqm" numeric(10,2),
    status character varying(16) DEFAULT 'ACTIVE'::character varying NOT NULL,
    metadata jsonb,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: pos_property_units_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.pos_property_units_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: pos_property_units_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.pos_property_units_id_seq OWNED BY public.pos_property_units.id;


--
-- Name: pos_register_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pos_register_sessions (
    id integer NOT NULL,
    "branchId" integer NOT NULL,
    "registerId" character varying(128) NOT NULL,
    status public.pos_register_sessions_status_enum DEFAULT 'OPEN'::public.pos_register_sessions_status_enum NOT NULL,
    "openedAt" timestamp without time zone NOT NULL,
    "closedAt" timestamp without time zone,
    "openedByUserId" integer,
    "openedByName" character varying(255),
    "closedByUserId" integer,
    "closedByName" character varying(255),
    note text,
    metadata jsonb,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "openingFloat" numeric(12,2),
    "closingFloat" numeric(12,2),
    "branchSessionNumber" integer
);


--
-- Name: pos_register_sessions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.pos_register_sessions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: pos_register_sessions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.pos_register_sessions_id_seq OWNED BY public.pos_register_sessions.id;


--
-- Name: pos_suspended_carts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pos_suspended_carts (
    id integer NOT NULL,
    "branchId" integer NOT NULL,
    "registerSessionId" integer,
    "registerId" character varying(128),
    label character varying(255) NOT NULL,
    status public.pos_suspended_carts_status_enum DEFAULT 'SUSPENDED'::public.pos_suspended_carts_status_enum NOT NULL,
    currency character varying(3) NOT NULL,
    "promoCode" character varying(64),
    "itemCount" integer DEFAULT 0 NOT NULL,
    total numeric(12,2) NOT NULL,
    note text,
    "cartSnapshot" jsonb NOT NULL,
    metadata jsonb,
    "suspendedByUserId" integer,
    "suspendedByName" character varying(255),
    "resumedAt" timestamp without time zone,
    "resumedByUserId" integer,
    "resumedByName" character varying(255),
    "discardedAt" timestamp without time zone,
    "discardedByUserId" integer,
    "discardedByName" character varying(255),
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
    "clientRef" character varying(128)
);


--
-- Name: pos_suspended_carts_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.pos_suspended_carts_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: pos_suspended_carts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.pos_suspended_carts_id_seq OWNED BY public.pos_suspended_carts.id;


--
-- Name: pos_sync_jobs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pos_sync_jobs (
    id integer NOT NULL,
    "branchId" integer,
    "partnerCredentialId" integer,
    "syncType" public.pos_sync_jobs_synctype_enum NOT NULL,
    status public.pos_sync_jobs_status_enum DEFAULT 'RECEIVED'::public.pos_sync_jobs_status_enum NOT NULL,
    "externalJobId" character varying(255),
    "idempotencyKey" character varying(255),
    "acceptedCount" integer DEFAULT 0 NOT NULL,
    "rejectedCount" integer DEFAULT 0 NOT NULL,
    "processedAt" timestamp without time zone,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "failedEntries" jsonb DEFAULT '[]'::jsonb
);


--
-- Name: pos_sync_jobs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.pos_sync_jobs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: pos_sync_jobs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.pos_sync_jobs_id_seq OWNED BY public.pos_sync_jobs.id;


--
-- Name: procurement_webhook_deliveries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.procurement_webhook_deliveries (
    id integer NOT NULL,
    "subscriptionId" integer NOT NULL,
    "eventType" public.procurement_webhook_deliveries_eventtype_enum NOT NULL,
    "eventKey" character varying(255) NOT NULL,
    "requestUrl" character varying(1000) NOT NULL,
    "requestHeaders" jsonb NOT NULL,
    "requestBody" jsonb NOT NULL,
    "branchId" integer,
    "supplierProfileId" integer,
    "purchaseOrderId" integer,
    status public.procurement_webhook_deliveries_status_enum DEFAULT 'PENDING'::public.procurement_webhook_deliveries_status_enum NOT NULL,
    "attemptCount" integer DEFAULT 1 NOT NULL,
    "responseStatus" integer,
    "responseBody" text,
    "errorMessage" text,
    "durationMs" integer,
    "deliveredAt" timestamp without time zone,
    "nextRetryAt" timestamp without time zone,
    "finalFailureAt" timestamp without time zone,
    "replayedFromDeliveryId" integer,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: procurement_webhook_deliveries_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.procurement_webhook_deliveries_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: procurement_webhook_deliveries_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.procurement_webhook_deliveries_id_seq OWNED BY public.procurement_webhook_deliveries.id;


--
-- Name: procurement_webhook_subscriptions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.procurement_webhook_subscriptions (
    id integer NOT NULL,
    name character varying(255) NOT NULL,
    "endpointUrl" character varying(1000) NOT NULL,
    "signingSecret" character varying(255) NOT NULL,
    "eventTypes" text DEFAULT ''::text NOT NULL,
    status public.procurement_webhook_subscriptions_status_enum DEFAULT 'ACTIVE'::public.procurement_webhook_subscriptions_status_enum NOT NULL,
    "branchId" integer,
    "supplierProfileId" integer,
    metadata jsonb,
    "lastDeliveredAt" timestamp without time zone,
    "lastDeliveryStatus" public.procurement_webhook_subscriptions_lastdeliverystatus_enum,
    "createdByUserId" integer,
    "updatedByUserId" integer,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: procurement_webhook_subscriptions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.procurement_webhook_subscriptions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: procurement_webhook_subscriptions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.procurement_webhook_subscriptions_id_seq OWNED BY public.procurement_webhook_subscriptions.id;


--
-- Name: product; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product (
    id integer NOT NULL,
    name character varying NOT NULL,
    price numeric(10,2) NOT NULL,
    currency character varying(3) NOT NULL,
    description character varying NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "isBlocked" boolean DEFAULT false NOT NULL,
    featured boolean DEFAULT false NOT NULL,
    sale_price numeric(10,2),
    average_rating numeric(3,2),
    rating_count integer,
    sku character varying,
    stock_quantity integer,
    manage_stock boolean DEFAULT false NOT NULL,
    status character varying DEFAULT 'publish'::character varying NOT NULL,
    "vendorId" integer NOT NULL,
    "categoryId" integer,
    "imageUrl" text,
    sales_count integer DEFAULT 0 NOT NULL,
    view_count integer DEFAULT 0 NOT NULL,
    listing_type character varying(10),
    bedrooms integer,
    listing_city character varying(120),
    bathrooms integer,
    size_sqm integer,
    furnished boolean,
    rent_period character varying(16),
    attributes jsonb DEFAULT '{}'::jsonb,
    product_type character varying(16) DEFAULT 'physical'::character varying,
    deleted_at timestamp without time zone,
    deleted_by_admin_id integer,
    deleted_reason character varying(512),
    original_creator_contact json,
    "featuredExpiresAt" timestamp without time zone,
    moq integer DEFAULT 1 NOT NULL,
    dispatch_days integer,
    "featuredPaidAmount" numeric(10,2),
    "featuredPaidCurrency" character varying(3),
    created_by_id integer,
    created_by_name character varying,
    private_note text,
    private_note_updated_at timestamp without time zone,
    private_note_updated_by_id integer,
    private_note_updated_by_name character varying(120),
    barcode character varying(64),
    tax_rate numeric(5,4),
    vendor_store_id integer,
    cost_price numeric(12,2)
);


--
-- Name: product_aliases; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_aliases (
    id integer NOT NULL,
    "tenantId" integer NOT NULL,
    "branchId" integer,
    "partnerCredentialId" integer,
    "productId" integer NOT NULL,
    "aliasType" public.product_aliases_aliastype_enum NOT NULL,
    "aliasValue" character varying(255) NOT NULL,
    "normalizedAliasValue" character varying(255) NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    metadata jsonb,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: product_aliases_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.product_aliases_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: product_aliases_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.product_aliases_id_seq OWNED BY public.product_aliases.id;


--
-- Name: product_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.product_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: product_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.product_id_seq OWNED BY public.product.id;


--
-- Name: product_image; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_image (
    id integer NOT NULL,
    src character varying NOT NULL,
    alt character varying,
    "sortOrder" integer,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "productId" integer,
    "thumbnailSrc" character varying,
    "lowResSrc" character varying,
    phash character varying(64),
    "phashAlgo" character varying(16)
);


--
-- Name: product_image_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.product_image_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: product_image_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.product_image_id_seq OWNED BY public.product_image.id;


--
-- Name: product_image_moderation; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_image_moderation (
    id integer NOT NULL,
    "productId" integer NOT NULL,
    "productImageId" integer NOT NULL,
    "imageUrl" text NOT NULL,
    status character varying(16) DEFAULT 'pending'::character varying NOT NULL,
    labels jsonb,
    "matchedLabels" text[],
    "topConfidence" real,
    reason text,
    "appealMessage" text,
    "appealedAt" timestamp with time zone,
    "reviewedById" integer,
    "reviewedAt" timestamp with time zone,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "imageId" integer
);


--
-- Name: product_image_moderation_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.product_image_moderation_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: product_image_moderation_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.product_image_moderation_id_seq OWNED BY public.product_image_moderation.id;


--
-- Name: product_impression; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_impression (
    id integer NOT NULL,
    "productId" integer NOT NULL,
    "sessionKey" character varying(128) NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "ipAddress" character varying(45),
    country character varying(64),
    city character varying(128),
    "userId" integer
);


--
-- Name: product_impression_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.product_impression_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: product_impression_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.product_impression_id_seq OWNED BY public.product_impression.id;


--
-- Name: product_request; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_request (
    id integer NOT NULL,
    buyer_id integer NOT NULL,
    category_id integer,
    title character varying(180) NOT NULL,
    description text,
    budget_min numeric(12,2),
    budget_max numeric(12,2),
    currency character varying(3),
    condition public.product_request_condition_enum DEFAULT 'ANY'::public.product_request_condition_enum NOT NULL,
    urgency public.product_request_urgency_enum DEFAULT 'FLEXIBLE'::public.product_request_urgency_enum NOT NULL,
    preferred_city character varying(128),
    preferred_country character varying(2),
    image_url character varying(255),
    status public.product_request_status_enum DEFAULT 'OPEN'::public.product_request_status_enum NOT NULL,
    expires_at timestamp without time zone,
    closed_at timestamp without time zone,
    metadata jsonb DEFAULT '{}'::jsonb,
    accepted_offer_id integer,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    deleted_at timestamp without time zone
);


--
-- Name: product_request_forward; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_request_forward (
    id integer NOT NULL,
    request_id integer NOT NULL,
    vendor_id integer NOT NULL,
    forwarded_by_admin_id integer NOT NULL,
    note text,
    channel character varying(32),
    forwarded_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: product_request_forward_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.product_request_forward_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: product_request_forward_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.product_request_forward_id_seq OWNED BY public.product_request_forward.id;


--
-- Name: product_request_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.product_request_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: product_request_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.product_request_id_seq OWNED BY public.product_request.id;


--
-- Name: product_request_offer; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_request_offer (
    id integer NOT NULL,
    request_id integer NOT NULL,
    seller_id integer NOT NULL,
    product_id integer,
    price numeric(12,2),
    currency character varying(3),
    message text,
    status public.product_request_offer_status_enum DEFAULT 'SENT'::public.product_request_offer_status_enum NOT NULL,
    expires_at timestamp without time zone,
    seen_at timestamp without time zone,
    responded_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: product_request_offer_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.product_request_offer_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: product_request_offer_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.product_request_offer_id_seq OWNED BY public.product_request_offer.id;


--
-- Name: product_tags_tag; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_tags_tag (
    "productId" integer NOT NULL,
    "tagId" integer NOT NULL
);


--
-- Name: product_variant; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_variant (
    id integer NOT NULL,
    "productId" integer NOT NULL,
    "variantKey" character varying(255) NOT NULL,
    attributes jsonb,
    "priceOverride" numeric(12,2),
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: product_variant_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.product_variant_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: product_variant_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.product_variant_id_seq OWNED BY public.product_variant.id;


--
-- Name: purchase_order_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.purchase_order_items (
    id integer NOT NULL,
    "purchaseOrderId" integer NOT NULL,
    "productId" integer NOT NULL,
    "supplierOfferId" integer,
    "orderedQuantity" integer NOT NULL,
    "receivedQuantity" integer DEFAULT 0 NOT NULL,
    "unitPrice" numeric(12,2) NOT NULL,
    "shortageQuantity" integer DEFAULT 0 NOT NULL,
    "damagedQuantity" integer DEFAULT 0 NOT NULL,
    note text
);


--
-- Name: purchase_order_items_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.purchase_order_items_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: purchase_order_items_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.purchase_order_items_id_seq OWNED BY public.purchase_order_items.id;


--
-- Name: purchase_order_receipt_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.purchase_order_receipt_events (
    id integer NOT NULL,
    "purchaseOrderId" integer NOT NULL,
    "actorUserId" integer,
    note text,
    "receiptLines" jsonb NOT NULL,
    metadata jsonb,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "supplierAcknowledgedAt" timestamp without time zone,
    "supplierAcknowledgedByUserId" integer,
    "supplierAcknowledgementNote" character varying(500),
    "discrepancyStatus" character varying(32),
    "discrepancyResolutionNote" text,
    "discrepancyMetadata" jsonb,
    "discrepancyResolvedAt" timestamp without time zone,
    "discrepancyResolvedByUserId" integer,
    "discrepancyApprovedAt" timestamp without time zone,
    "discrepancyApprovedByUserId" integer,
    "discrepancyApprovalNote" text
);


--
-- Name: purchase_order_receipt_events_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.purchase_order_receipt_events_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: purchase_order_receipt_events_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.purchase_order_receipt_events_id_seq OWNED BY public.purchase_order_receipt_events.id;


--
-- Name: purchase_orders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.purchase_orders (
    id integer NOT NULL,
    "orderNumber" character varying(64) NOT NULL,
    "branchId" integer NOT NULL,
    "supplierProfileId" integer NOT NULL,
    status public.purchase_orders_status_enum DEFAULT 'DRAFT'::public.purchase_orders_status_enum NOT NULL,
    currency character varying(3) DEFAULT 'USD'::character varying NOT NULL,
    subtotal numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    total numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    "expectedDeliveryDate" date,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "submittedAt" timestamp without time zone,
    "acknowledgedAt" timestamp without time zone,
    "shippedAt" timestamp without time zone,
    "receivedAt" timestamp without time zone,
    "reconciledAt" timestamp without time zone,
    "cancelledAt" timestamp without time zone,
    "statusMeta" jsonb DEFAULT '{}'::jsonb
);


--
-- Name: purchase_orders_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.purchase_orders_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: purchase_orders_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.purchase_orders_id_seq OWNED BY public.purchase_orders.id;


--
-- Name: retail_tenants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.retail_tenants (
    id integer NOT NULL,
    name character varying(255) NOT NULL,
    code character varying(32),
    status public.retail_tenants_status_enum DEFAULT 'ACTIVE'::public.retail_tenants_status_enum NOT NULL,
    "billingEmail" character varying(255),
    "defaultCurrency" character varying(8),
    "ownerUserId" integer,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "onboardingProfile" jsonb
);


--
-- Name: retail_tenants_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.retail_tenants_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: retail_tenants_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.retail_tenants_id_seq OWNED BY public.retail_tenants.id;


--
-- Name: review; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.review (
    id integer NOT NULL,
    rating integer NOT NULL,
    comment text,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "userId" integer,
    "productId" integer
);


--
-- Name: review_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.review_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: review_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.review_id_seq OWNED BY public.review.id;


--
-- Name: role_upgrade_request; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.role_upgrade_request (
    id integer NOT NULL,
    roles text[] NOT NULL,
    country character varying(2),
    "phoneCountryCode" character varying(10),
    "phoneNumber" character varying(20),
    "storeName" character varying(255),
    "businessLicenseNumber" character varying(128),
    documents jsonb DEFAULT '[]'::jsonb,
    status public.role_upgrade_request_status_enum DEFAULT 'PENDING'::public.role_upgrade_request_status_enum NOT NULL,
    "decisionReason" text,
    "decidedBy" character varying(255),
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    user_id integer
);


--
-- Name: role_upgrade_request_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.role_upgrade_request_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: role_upgrade_request_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.role_upgrade_request_id_seq OWNED BY public.role_upgrade_request.id;


--
-- Name: search_keyword; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.search_keyword (
    id integer NOT NULL,
    q character varying(256) NOT NULL,
    q_norm character varying(256) NOT NULL,
    total_count integer DEFAULT 0 NOT NULL,
    suggest_count integer DEFAULT 0 NOT NULL,
    submit_count integer DEFAULT 0 NOT NULL,
    last_results integer,
    last_ip character varying(64),
    last_ua character varying(256),
    first_seen_at timestamp without time zone DEFAULT now() NOT NULL,
    last_seen_at timestamp without time zone DEFAULT now() NOT NULL,
    last_city character varying(128),
    last_vendor_name character varying(256),
    last_country character varying(2),
    vendor_hits jsonb,
    zero_results_count integer DEFAULT 0 NOT NULL,
    last_zero_results_at timestamp without time zone,
    last_zero_results_city character varying(128),
    last_zero_results_country character varying(2)
);


--
-- Name: search_keyword_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.search_keyword_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: search_keyword_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.search_keyword_id_seq OWNED BY public.search_keyword.id;


--
-- Name: search_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.search_log (
    id integer NOT NULL,
    query character varying(256) NOT NULL,
    result_count integer DEFAULT 0 NOT NULL,
    source character varying(64),
    category_id integer,
    city character varying(128),
    user_id integer,
    ip_address character varying(64),
    user_agent character varying(256),
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: search_log_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.search_log_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: search_log_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.search_log_id_seq OWNED BY public.search_log.id;


--
-- Name: seller_workspaces; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.seller_workspaces (
    id integer NOT NULL,
    "ownerUserId" integer NOT NULL,
    "primaryVendorId" integer,
    "primaryRetailTenantId" integer,
    "selectedPlanCode" character varying(32),
    "billingStatus" public.seller_workspaces_billingstatus_enum DEFAULT 'NOT_STARTED'::public.seller_workspaces_billingstatus_enum NOT NULL,
    status public.seller_workspaces_status_enum DEFAULT 'ACTIVE'::public.seller_workspaces_status_enum NOT NULL,
    "planSelectedAt" timestamp without time zone,
    "onboardingState" jsonb,
    "channelState" jsonb,
    metadata jsonb,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: seller_workspaces_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.seller_workspaces_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: seller_workspaces_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.seller_workspaces_id_seq OWNED BY public.seller_workspaces.id;


--
-- Name: settlement; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.settlement (
    id integer NOT NULL,
    "vendorId" integer NOT NULL,
    amount numeric(12,2) NOT NULL,
    "grossSales" numeric(12,2) NOT NULL,
    "platformFee" numeric(12,2) NOT NULL,
    "gatewayFee" numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    currency character varying NOT NULL,
    status public.settlement_status_enum DEFAULT 'PENDING'::public.settlement_status_enum NOT NULL,
    "transactionReference" character varying,
    "periodStart" date NOT NULL,
    "periodEnd" date NOT NULL,
    "generatedPdfUrl" character varying,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: settlement_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.settlement_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: settlement_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.settlement_id_seq OWNED BY public.settlement.id;


--
-- Name: stock_movements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.stock_movements (
    id integer NOT NULL,
    "branchId" integer NOT NULL,
    "productId" integer NOT NULL,
    "movementType" public.stock_movements_movementtype_enum NOT NULL,
    "quantityDelta" integer NOT NULL,
    "sourceType" character varying(64) NOT NULL,
    "sourceReferenceId" integer,
    "actorUserId" integer,
    note text,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: stock_movements_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.stock_movements_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: stock_movements_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.stock_movements_id_seq OWNED BY public.stock_movements.id;


--
-- Name: subscription_request; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.subscription_request (
    id integer NOT NULL,
    method character varying NOT NULL,
    reference character varying,
    "requestedTier" public.subscription_request_requestedtier_enum NOT NULL,
    status public.subscription_request_status_enum DEFAULT 'PENDING'::public.subscription_request_status_enum NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "userId" integer,
    amount numeric(10,2),
    currency character varying
);


--
-- Name: subscription_request_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.subscription_request_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: subscription_request_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.subscription_request_id_seq OWNED BY public.subscription_request.id;


--
-- Name: supplier_offers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.supplier_offers (
    id integer NOT NULL,
    "supplierProfileId" integer NOT NULL,
    "productId" integer NOT NULL,
    status public.supplier_offers_status_enum DEFAULT 'DRAFT'::public.supplier_offers_status_enum NOT NULL,
    "availabilityStatus" public.supplier_offers_availabilitystatus_enum DEFAULT 'IN_STOCK'::public.supplier_offers_availabilitystatus_enum NOT NULL,
    currency character varying(3) DEFAULT 'USD'::character varying NOT NULL,
    "unitWholesalePrice" numeric(12,2) NOT NULL,
    moq integer DEFAULT 1 NOT NULL,
    "leadTimeDays" integer DEFAULT 0 NOT NULL,
    "fulfillmentRegions" text[] DEFAULT '{}'::text[] NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: supplier_offers_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.supplier_offers_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: supplier_offers_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.supplier_offers_id_seq OWNED BY public.supplier_offers.id;


--
-- Name: supplier_profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.supplier_profiles (
    id integer NOT NULL,
    "userId" integer NOT NULL,
    "companyName" character varying(255) NOT NULL,
    "legalName" character varying(255),
    "taxId" character varying(128),
    "countriesServed" text[] DEFAULT '{}'::text[] NOT NULL,
    "onboardingStatus" public.supplier_profiles_onboardingstatus_enum DEFAULT 'DRAFT'::public.supplier_profiles_onboardingstatus_enum NOT NULL,
    "payoutDetails" character varying(255),
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: supplier_profiles_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.supplier_profiles_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: supplier_profiles_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.supplier_profiles_id_seq OWNED BY public.supplier_profiles.id;


--
-- Name: supplier_staff_assignments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.supplier_staff_assignments (
    id integer NOT NULL,
    "supplierProfileId" integer NOT NULL,
    "userId" integer NOT NULL,
    role public.supplier_staff_assignments_role_enum NOT NULL,
    permissions text DEFAULT ''::text NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "invitedByUserId" integer,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: supplier_staff_assignments_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.supplier_staff_assignments_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: supplier_staff_assignments_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.supplier_staff_assignments_id_seq OWNED BY public.supplier_staff_assignments.id;


--
-- Name: supply_outreach_task; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.supply_outreach_task (
    id integer NOT NULL,
    term character varying(180) NOT NULL,
    status public.supply_outreach_status_enum DEFAULT 'PENDING'::public.supply_outreach_status_enum NOT NULL,
    request_ids integer[] NOT NULL,
    request_count integer DEFAULT 0 NOT NULL,
    payload jsonb DEFAULT '{}'::jsonb,
    note text,
    created_by_admin_id integer NOT NULL,
    assigned_vendor_id integer,
    assigned_at timestamp without time zone,
    completed_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: supply_outreach_task_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.supply_outreach_task_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: supply_outreach_task_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.supply_outreach_task_id_seq OWNED BY public.supply_outreach_task.id;


--
-- Name: system_setting; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.system_setting (
    id integer NOT NULL,
    key character varying NOT NULL,
    value jsonb NOT NULL,
    description character varying
);


--
-- Name: system_setting_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.system_setting_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: system_setting_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.system_setting_id_seq OWNED BY public.system_setting.id;


--
-- Name: tag; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tag (
    id integer NOT NULL,
    name character varying NOT NULL
);


--
-- Name: tag_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tag_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tag_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tag_id_seq OWNED BY public.tag.id;


--
-- Name: telebirr_transaction; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.telebirr_transaction (
    id integer NOT NULL,
    merch_order_id character varying NOT NULL,
    trans_id character varying,
    payment_order_id character varying,
    status character varying DEFAULT 'PENDING'::character varying NOT NULL,
    amount numeric(10,2) NOT NULL,
    payer_msisdn character varying,
    raw_response text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: telebirr_transaction_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.telebirr_transaction_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: telebirr_transaction_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.telebirr_transaction_id_seq OWNED BY public.telebirr_transaction.id;


--
-- Name: tenant_module_entitlements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tenant_module_entitlements (
    id integer NOT NULL,
    "tenantId" integer NOT NULL,
    module public.tenant_module_entitlements_module_enum NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    "startsAt" timestamp without time zone,
    "expiresAt" timestamp without time zone,
    reason text,
    metadata jsonb,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: tenant_module_entitlements_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tenant_module_entitlements_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tenant_module_entitlements_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tenant_module_entitlements_id_seq OWNED BY public.tenant_module_entitlements.id;


--
-- Name: tenant_subscriptions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tenant_subscriptions (
    id integer NOT NULL,
    "tenantId" integer NOT NULL,
    "planCode" character varying(64) NOT NULL,
    status public.tenant_subscriptions_status_enum NOT NULL,
    "billingInterval" public.tenant_subscriptions_billinginterval_enum DEFAULT 'MONTHLY'::public.tenant_subscriptions_billinginterval_enum NOT NULL,
    amount numeric(12,2),
    currency character varying(8),
    "startsAt" timestamp without time zone NOT NULL,
    "endsAt" timestamp without time zone,
    "autoRenew" boolean DEFAULT false NOT NULL,
    metadata jsonb,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "periodMonths" integer,
    "amountTotal" numeric(12,2),
    "branchId" integer
);


--
-- Name: tenant_subscriptions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tenant_subscriptions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tenant_subscriptions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tenant_subscriptions_id_seq OWNED BY public.tenant_subscriptions.id;


--
-- Name: top_up_request; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.top_up_request (
    id integer NOT NULL,
    amount numeric(10,2) NOT NULL,
    method character varying NOT NULL,
    reference character varying,
    status public.top_up_request_status_enum DEFAULT 'PENDING'::public.top_up_request_status_enum NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "userId" integer,
    metadata jsonb,
    "attachmentUrl" character varying
);


--
-- Name: top_up_request_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.top_up_request_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: top_up_request_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.top_up_request_id_seq OWNED BY public.top_up_request.id;


--
-- Name: ui_setting; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ui_setting (
    id integer NOT NULL,
    key character varying NOT NULL,
    value jsonb NOT NULL,
    description character varying
);


--
-- Name: ui_setting_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.ui_setting_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ui_setting_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.ui_setting_id_seq OWNED BY public.ui_setting.id;


--
-- Name: user; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."user" (
    id integer NOT NULL,
    email character varying NOT NULL,
    "firebaseUid" character varying,
    password character varying,
    roles text[] DEFAULT '{CUSTOMER}'::text[] NOT NULL,
    "displayName" character varying,
    "avatarUrl" character varying,
    "storeName" character varying,
    "legalName" character varying(255),
    "businessLicenseNumber" character varying(128),
    "taxId" character varying(128),
    "registrationCountry" character varying(64),
    "registrationRegion" character varying(128),
    "registrationCity" character varying(128),
    "businessType" character varying(255),
    "contactName" character varying(128),
    "vendorPhoneNumber" character varying(32),
    "vendorEmail" character varying(255),
    website character varying(255),
    address character varying(255),
    "postalCode" character varying(32),
    "vendorAvatarUrl" character varying(255),
    "phoneCountryCode" character varying(10),
    "phoneNumber" character varying(20),
    "isPhoneVerified" boolean DEFAULT false NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "googleId" character varying,
    currency character varying(3),
    "yearsOnPlatform" integer,
    "lastLoginAt" timestamp without time zone,
    rating double precision DEFAULT '0'::double precision,
    "numberOfSales" integer DEFAULT 0,
    "preferredLanguage" character varying(8),
    "supportedCurrencies" text,
    timezone character varying(64),
    "bankAccountNumber" character varying(64),
    "bankName" character varying(128),
    "mobileMoneyNumber" character varying(32),
    "mobileMoneyProvider" character varying(32),
    "passwordResetToken" character varying,
    "passwordResetExpires" timestamp without time zone,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "deletedAt" timestamp without time zone,
    "updatedBy" character varying,
    "deletedBy" character varying,
    "verificationStatus" public.user_verificationstatus_enum DEFAULT 'UNVERIFIED'::public.user_verificationstatus_enum NOT NULL,
    verified boolean DEFAULT false NOT NULL,
    "verifiedAt" timestamp without time zone,
    "verificationDocuments" jsonb DEFAULT '[]'::jsonb,
    "locationLat" double precision,
    "locationLng" double precision,
    "verificationRejectionReason" text,
    "verificationReviewedBy" character varying(255),
    "verificationReviewedAt" timestamp without time zone,
    "businessLicenseInfo" jsonb,
    "verificationMethod" public.user_verificationmethod_enum DEFAULT 'NONE'::public.user_verificationmethod_enum NOT NULL,
    "appleId" character varying,
    "bankAccountHolderName" character varying(128),
    "subscriptionTier" public.user_subscriptiontier_enum DEFAULT 'free'::public.user_subscriptiontier_enum NOT NULL,
    "subscriptionExpiry" timestamp without time zone,
    "autoRenew" boolean DEFAULT true NOT NULL,
    "lastRenewalReminderAt" timestamp without time zone,
    "renewalReminderCount" integer DEFAULT 0 NOT NULL,
    language character varying(5) DEFAULT 'en'::character varying NOT NULL,
    "interestedCategoryIds" integer[],
    "interestedCategoriesLastUpdated" timestamp without time zone,
    "telebirrAccount" character varying(32),
    "telebirrVerified" boolean DEFAULT false NOT NULL,
    "telebirrVerifiedAt" timestamp without time zone,
    "businessModel" public.user_businessmodel_enum DEFAULT 'COMMISSION'::public.user_businessmodel_enum NOT NULL,
    "commissionRate" numeric(5,2) DEFAULT 0 NOT NULL,
    "flaggedForReview" boolean DEFAULT false NOT NULL,
    "posUsername" character varying(64),
    "authMode" character varying(16)
);


--
-- Name: user_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.user_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: user_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.user_id_seq OWNED BY public."user".id;


--
-- Name: user_report; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_report (
    id integer NOT NULL,
    reason character varying NOT NULL,
    details text,
    status character varying DEFAULT 'pending'::character varying NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "reporterId" integer NOT NULL,
    "productId" integer NOT NULL
);


--
-- Name: user_report_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.user_report_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: user_report_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.user_report_id_seq OWNED BY public.user_report.id;


--
-- Name: user_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_settings (
    id integer NOT NULL,
    theme public.user_settings_theme_enum DEFAULT 'light'::public.user_settings_theme_enum NOT NULL,
    "notificationsEnabled" boolean DEFAULT true NOT NULL,
    "userId" integer
);


--
-- Name: user_settings_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.user_settings_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: user_settings_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.user_settings_id_seq OWNED BY public.user_settings.id;


--
-- Name: vendor; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vendor (
    id integer NOT NULL,
    store_name character varying NOT NULL,
    legal_name character varying(255),
    business_license_number character varying(128),
    tax_id character varying(128),
    registration_country character varying(2) NOT NULL,
    registration_region character varying(128),
    registration_city character varying(128),
    business_type character varying(64),
    contact_name character varying(128),
    phone_number character varying(32),
    email character varying(255),
    website character varying(255),
    address character varying(255),
    postal_code character varying(32),
    avatar_url character varying(255),
    facebook_url character varying(255),
    instagram_url character varying(255),
    twitter_url character varying(255),
    telegram_url character varying(255),
    tiktok_url character varying(255),
    verified boolean DEFAULT false NOT NULL,
    about text,
    is_active boolean DEFAULT true,
    featured boolean DEFAULT false,
    years_on_platform integer,
    last_login_at timestamp without time zone,
    rating double precision DEFAULT '0'::double precision,
    number_of_sales integer DEFAULT 0,
    preferred_language character varying(8),
    supported_currencies text,
    timezone character varying(64),
    bank_account_number character varying(64),
    bank_name character varying(128),
    mobile_money_number character varying(32),
    mobile_money_provider character varying(32),
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "verificationRejectionReason" text,
    "verificationReviewedBy" integer,
    "verificationReviewedAt" timestamp without time zone,
    telebirr_account character varying(32)
);


--
-- Name: vendor_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.vendor_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: vendor_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.vendor_id_seq OWNED BY public.vendor.id;


--
-- Name: vendor_staff; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vendor_staff (
    id integer NOT NULL,
    "memberId" integer NOT NULL,
    "vendorId" integer NOT NULL,
    permissions text NOT NULL,
    title character varying,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: vendor_staff_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.vendor_staff_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: vendor_staff_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.vendor_staff_id_seq OWNED BY public.vendor_staff.id;


--
-- Name: vendor_stores; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vendor_stores (
    id integer NOT NULL,
    "ownerUserId" integer NOT NULL,
    "branchId" integer,
    "storeName" character varying(255) NOT NULL,
    "isConsumerVisible" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "serviceFormat" character varying(32),
    "coverImageUrl" character varying(512),
    "operatingHours" jsonb
);


--
-- Name: vendor_stores_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.vendor_stores_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: vendor_stores_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.vendor_stores_id_seq OWNED BY public.vendor_stores.id;


--
-- Name: wallet; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.wallet (
    id integer NOT NULL,
    balance numeric(10,2) DEFAULT '0'::numeric NOT NULL,
    currency character varying DEFAULT 'KES'::character varying NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "userId" integer
);


--
-- Name: wallet_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.wallet_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: wallet_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.wallet_id_seq OWNED BY public.wallet.id;


--
-- Name: wallet_transaction; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.wallet_transaction (
    id integer NOT NULL,
    type public.wallet_transaction_type_enum NOT NULL,
    amount numeric(10,2) NOT NULL,
    "orderId" integer,
    description character varying,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "walletId" integer,
    "fxRate" numeric(10,4)
);


--
-- Name: wallet_transaction_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.wallet_transaction_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: wallet_transaction_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.wallet_transaction_id_seq OWNED BY public.wallet_transaction.id;


--
-- Name: withdrawal; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.withdrawal (
    id integer NOT NULL,
    amount numeric(10,2) NOT NULL,
    status public.withdrawal_status_enum DEFAULT 'PENDING'::public.withdrawal_status_enum NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "vendorId" integer,
    "payoutDetails" jsonb
);


--
-- Name: withdrawal_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.withdrawal_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: withdrawal_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.withdrawal_id_seq OWNED BY public.withdrawal.id;


--
-- Name: withdrawals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.withdrawals (
    id integer NOT NULL,
    amount numeric(10,2) NOT NULL,
    method character varying NOT NULL,
    details jsonb,
    status public.withdrawals_status_enum DEFAULT 'PENDING'::public.withdrawals_status_enum NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "userId" integer
);


--
-- Name: withdrawals_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.withdrawals_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: withdrawals_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.withdrawals_id_seq OWNED BY public.withdrawals.id;


--
-- Name: audit_log id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_log ALTER COLUMN id SET DEFAULT nextval('public.audit_log_id_seq'::regclass);


--
-- Name: branch_accrued_liabilities id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.branch_accrued_liabilities ALTER COLUMN id SET DEFAULT nextval('public.branch_accrued_liabilities_id_seq'::regclass);


--
-- Name: branch_catalog_product_links id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.branch_catalog_product_links ALTER COLUMN id SET DEFAULT nextval('public.branch_catalog_product_links_id_seq'::regclass);


--
-- Name: branch_catalog_vendor_links id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.branch_catalog_vendor_links ALTER COLUMN id SET DEFAULT nextval('public.branch_catalog_vendor_links_id_seq'::regclass);


--
-- Name: branch_depreciation_entries id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.branch_depreciation_entries ALTER COLUMN id SET DEFAULT nextval('public.branch_depreciation_entries_id_seq'::regclass);


--
-- Name: branch_expenses id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.branch_expenses ALTER COLUMN id SET DEFAULT nextval('public.branch_expenses_id_seq'::regclass);


--
-- Name: branch_fixed_assets id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.branch_fixed_assets ALTER COLUMN id SET DEFAULT nextval('public.branch_fixed_assets_id_seq'::regclass);


--
-- Name: branch_inventory id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.branch_inventory ALTER COLUMN id SET DEFAULT nextval('public.branch_inventory_id_seq'::regclass);


--
-- Name: branch_inventory_variant id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.branch_inventory_variant ALTER COLUMN id SET DEFAULT nextval('public.branch_inventory_variant_id_seq'::regclass);


--
-- Name: branch_long_term_debts id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.branch_long_term_debts ALTER COLUMN id SET DEFAULT nextval('public.branch_long_term_debts_id_seq'::regclass);


--
-- Name: branch_shift_staff id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.branch_shift_staff ALTER COLUMN id SET DEFAULT nextval('public.branch_shift_staff_id_seq'::regclass);


--
-- Name: branch_shifts id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.branch_shifts ALTER COLUMN id SET DEFAULT nextval('public.branch_shifts_id_seq'::regclass);


--
-- Name: branch_staff_assignments id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.branch_staff_assignments ALTER COLUMN id SET DEFAULT nextval('public.branch_staff_assignments_id_seq'::regclass);


--
-- Name: branch_staff_invites id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.branch_staff_invites ALTER COLUMN id SET DEFAULT nextval('public.branch_staff_invites_id_seq'::regclass);


--
-- Name: branch_transfer_items id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.branch_transfer_items ALTER COLUMN id SET DEFAULT nextval('public.branch_transfer_items_id_seq'::regclass);


--
-- Name: branch_transfers id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.branch_transfers ALTER COLUMN id SET DEFAULT nextval('public.branch_transfers_id_seq'::regclass);


--
-- Name: branches id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.branches ALTER COLUMN id SET DEFAULT nextval('public.branches_id_seq'::regclass);


--
-- Name: cart id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cart ALTER COLUMN id SET DEFAULT nextval('public.cart_id_seq'::regclass);


--
-- Name: cart_item id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cart_item ALTER COLUMN id SET DEFAULT nextval('public.cart_item_id_seq'::regclass);


--
-- Name: category id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.category ALTER COLUMN id SET DEFAULT nextval('public.category_id_seq'::regclass);


--
-- Name: conversation id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation ALTER COLUMN id SET DEFAULT nextval('public.conversation_id_seq'::regclass);


--
-- Name: country id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.country ALTER COLUMN id SET DEFAULT nextval('public.country_id_seq'::regclass);


--
-- Name: coupon id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coupon ALTER COLUMN id SET DEFAULT nextval('public.coupon_id_seq'::regclass);


--
-- Name: credit_limit id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.credit_limit ALTER COLUMN id SET DEFAULT nextval('public.credit_limit_id_seq'::regclass);


--
-- Name: credit_transaction id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.credit_transaction ALTER COLUMN id SET DEFAULT nextval('public.credit_transaction_id_seq'::regclass);


--
-- Name: device_tokens id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.device_tokens ALTER COLUMN id SET DEFAULT nextval('public.device_tokens_id_seq'::regclass);


--
-- Name: dispute id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dispute ALTER COLUMN id SET DEFAULT nextval('public.dispute_id_seq'::regclass);


--
-- Name: ebirr_transaction id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ebirr_transaction ALTER COLUMN id SET DEFAULT nextval('public.ebirr_transaction_id_seq'::regclass);


--
-- Name: equity_partner_bnpl_activations id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.equity_partner_bnpl_activations ALTER COLUMN id SET DEFAULT nextval('public.equity_partner_bnpl_activations_id_seq'::regclass);


--
-- Name: equity_partner_bnpl_credit_ledger id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.equity_partner_bnpl_credit_ledger ALTER COLUMN id SET DEFAULT nextval('public.equity_partner_bnpl_credit_ledger_id_seq'::regclass);


--
-- Name: equity_partners id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.equity_partners ALTER COLUMN id SET DEFAULT nextval('public.equity_partners_id_seq'::regclass);


--
-- Name: equity_payouts id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.equity_payouts ALTER COLUMN id SET DEFAULT nextval('public.equity_payouts_id_seq'::regclass);


--
-- Name: equity_split_assignments id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.equity_split_assignments ALTER COLUMN id SET DEFAULT nextval('public.equity_split_assignments_id_seq'::regclass);


--
-- Name: flash_sale id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.flash_sale ALTER COLUMN id SET DEFAULT nextval('public.flash_sale_id_seq'::regclass);


--
-- Name: gl_journal_entries id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gl_journal_entries ALTER COLUMN id SET DEFAULT nextval('public.gl_journal_entries_id_seq'::regclass);


--
-- Name: gl_journal_lines id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gl_journal_lines ALTER COLUMN id SET DEFAULT nextval('public.gl_journal_lines_id_seq'::regclass);


--
-- Name: media_cleanup_task id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_cleanup_task ALTER COLUMN id SET DEFAULT nextval('public.media_cleanup_task_id_seq'::regclass);


--
-- Name: message id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.message ALTER COLUMN id SET DEFAULT nextval('public.message_id_seq'::regclass);


--
-- Name: notification id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification ALTER COLUMN id SET DEFAULT nextval('public.notification_id_seq'::regclass);


--
-- Name: order id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."order" ALTER COLUMN id SET DEFAULT nextval('public.order_id_seq'::regclass);


--
-- Name: order_item id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_item ALTER COLUMN id SET DEFAULT nextval('public.order_item_id_seq'::regclass);


--
-- Name: parked_orders id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.parked_orders ALTER COLUMN id SET DEFAULT nextval('public.parked_orders_id_seq'::regclass);


--
-- Name: partner_credentials id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.partner_credentials ALTER COLUMN id SET DEFAULT nextval('public.partner_credentials_id_seq'::regclass);


--
-- Name: payment_logs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_logs ALTER COLUMN id SET DEFAULT nextval('public.payment_logs_id_seq'::regclass);


--
-- Name: payout_log id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payout_log ALTER COLUMN id SET DEFAULT nextval('public.payout_log_id_seq'::regclass);


--
-- Name: pos_checkouts id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_checkouts ALTER COLUMN id SET DEFAULT nextval('public.pos_checkouts_id_seq'::regclass);


--
-- Name: pos_hospitality_bill_interventions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_hospitality_bill_interventions ALTER COLUMN id SET DEFAULT nextval('public.pos_hospitality_bill_interventions_id_seq'::regclass);


--
-- Name: pos_hospitality_idempotency_keys id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_hospitality_idempotency_keys ALTER COLUMN id SET DEFAULT nextval('public.pos_hospitality_idempotency_keys_id_seq'::regclass);


--
-- Name: pos_hospitality_kitchen_tickets id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_hospitality_kitchen_tickets ALTER COLUMN id SET DEFAULT nextval('public.pos_hospitality_kitchen_tickets_id_seq'::regclass);


--
-- Name: pos_hospitality_table_board id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_hospitality_table_board ALTER COLUMN id SET DEFAULT nextval('public.pos_hospitality_table_board_id_seq'::regclass);


--
-- Name: pos_hotel_folio_charges id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_hotel_folio_charges ALTER COLUMN id SET DEFAULT nextval('public.pos_hotel_folio_charges_id_seq'::regclass);


--
-- Name: pos_hotel_folios id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_hotel_folios ALTER COLUMN id SET DEFAULT nextval('public.pos_hotel_folios_id_seq'::regclass);


--
-- Name: pos_hotel_night_audit_logs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_hotel_night_audit_logs ALTER COLUMN id SET DEFAULT nextval('public.pos_hotel_night_audit_logs_id_seq'::regclass);


--
-- Name: pos_hotel_rate_plans id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_hotel_rate_plans ALTER COLUMN id SET DEFAULT nextval('public.pos_hotel_rate_plans_id_seq'::regclass);


--
-- Name: pos_hotel_reservations id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_hotel_reservations ALTER COLUMN id SET DEFAULT nextval('public.pos_hotel_reservations_id_seq'::regclass);


--
-- Name: pos_hotel_rooms id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_hotel_rooms ALTER COLUMN id SET DEFAULT nextval('public.pos_hotel_rooms_id_seq'::regclass);


--
-- Name: pos_kitchen_product_availability id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_kitchen_product_availability ALTER COLUMN id SET DEFAULT nextval('public.pos_kitchen_product_availability_id_seq'::regclass);


--
-- Name: pos_property_rate_plans id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_property_rate_plans ALTER COLUMN id SET DEFAULT nextval('public.pos_property_rate_plans_id_seq'::regclass);


--
-- Name: pos_property_rental_booking_charges id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_property_rental_booking_charges ALTER COLUMN id SET DEFAULT nextval('public.pos_property_rental_booking_charges_id_seq'::regclass);


--
-- Name: pos_property_rental_bookings id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_property_rental_bookings ALTER COLUMN id SET DEFAULT nextval('public.pos_property_rental_bookings_id_seq'::regclass);


--
-- Name: pos_property_reservations id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_property_reservations ALTER COLUMN id SET DEFAULT nextval('public.pos_property_reservations_id_seq'::regclass);


--
-- Name: pos_property_units id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_property_units ALTER COLUMN id SET DEFAULT nextval('public.pos_property_units_id_seq'::regclass);


--
-- Name: pos_register_sessions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_register_sessions ALTER COLUMN id SET DEFAULT nextval('public.pos_register_sessions_id_seq'::regclass);


--
-- Name: pos_suspended_carts id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_suspended_carts ALTER COLUMN id SET DEFAULT nextval('public.pos_suspended_carts_id_seq'::regclass);


--
-- Name: pos_sync_jobs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_sync_jobs ALTER COLUMN id SET DEFAULT nextval('public.pos_sync_jobs_id_seq'::regclass);


--
-- Name: procurement_webhook_deliveries id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.procurement_webhook_deliveries ALTER COLUMN id SET DEFAULT nextval('public.procurement_webhook_deliveries_id_seq'::regclass);


--
-- Name: procurement_webhook_subscriptions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.procurement_webhook_subscriptions ALTER COLUMN id SET DEFAULT nextval('public.procurement_webhook_subscriptions_id_seq'::regclass);


--
-- Name: product id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product ALTER COLUMN id SET DEFAULT nextval('public.product_id_seq'::regclass);


--
-- Name: product_aliases id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_aliases ALTER COLUMN id SET DEFAULT nextval('public.product_aliases_id_seq'::regclass);


--
-- Name: product_image id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_image ALTER COLUMN id SET DEFAULT nextval('public.product_image_id_seq'::regclass);


--
-- Name: product_image_moderation id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_image_moderation ALTER COLUMN id SET DEFAULT nextval('public.product_image_moderation_id_seq'::regclass);


--
-- Name: product_impression id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_impression ALTER COLUMN id SET DEFAULT nextval('public.product_impression_id_seq'::regclass);


--
-- Name: product_request id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_request ALTER COLUMN id SET DEFAULT nextval('public.product_request_id_seq'::regclass);


--
-- Name: product_request_forward id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_request_forward ALTER COLUMN id SET DEFAULT nextval('public.product_request_forward_id_seq'::regclass);


--
-- Name: product_request_offer id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_request_offer ALTER COLUMN id SET DEFAULT nextval('public.product_request_offer_id_seq'::regclass);


--
-- Name: product_variant id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_variant ALTER COLUMN id SET DEFAULT nextval('public.product_variant_id_seq'::regclass);


--
-- Name: purchase_order_items id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_order_items ALTER COLUMN id SET DEFAULT nextval('public.purchase_order_items_id_seq'::regclass);


--
-- Name: purchase_order_receipt_events id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_order_receipt_events ALTER COLUMN id SET DEFAULT nextval('public.purchase_order_receipt_events_id_seq'::regclass);


--
-- Name: purchase_orders id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_orders ALTER COLUMN id SET DEFAULT nextval('public.purchase_orders_id_seq'::regclass);


--
-- Name: retail_tenants id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retail_tenants ALTER COLUMN id SET DEFAULT nextval('public.retail_tenants_id_seq'::regclass);


--
-- Name: review id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.review ALTER COLUMN id SET DEFAULT nextval('public.review_id_seq'::regclass);


--
-- Name: role_upgrade_request id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.role_upgrade_request ALTER COLUMN id SET DEFAULT nextval('public.role_upgrade_request_id_seq'::regclass);


--
-- Name: search_keyword id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.search_keyword ALTER COLUMN id SET DEFAULT nextval('public.search_keyword_id_seq'::regclass);


--
-- Name: search_log id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.search_log ALTER COLUMN id SET DEFAULT nextval('public.search_log_id_seq'::regclass);


--
-- Name: seller_workspaces id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.seller_workspaces ALTER COLUMN id SET DEFAULT nextval('public.seller_workspaces_id_seq'::regclass);


--
-- Name: settlement id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.settlement ALTER COLUMN id SET DEFAULT nextval('public.settlement_id_seq'::regclass);


--
-- Name: stock_movements id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_movements ALTER COLUMN id SET DEFAULT nextval('public.stock_movements_id_seq'::regclass);


--
-- Name: subscription_request id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscription_request ALTER COLUMN id SET DEFAULT nextval('public.subscription_request_id_seq'::regclass);


--
-- Name: supplier_offers id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplier_offers ALTER COLUMN id SET DEFAULT nextval('public.supplier_offers_id_seq'::regclass);


--
-- Name: supplier_profiles id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplier_profiles ALTER COLUMN id SET DEFAULT nextval('public.supplier_profiles_id_seq'::regclass);


--
-- Name: supplier_staff_assignments id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplier_staff_assignments ALTER COLUMN id SET DEFAULT nextval('public.supplier_staff_assignments_id_seq'::regclass);


--
-- Name: supply_outreach_task id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supply_outreach_task ALTER COLUMN id SET DEFAULT nextval('public.supply_outreach_task_id_seq'::regclass);


--
-- Name: system_setting id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_setting ALTER COLUMN id SET DEFAULT nextval('public.system_setting_id_seq'::regclass);


--
-- Name: tag id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tag ALTER COLUMN id SET DEFAULT nextval('public.tag_id_seq'::regclass);


--
-- Name: telebirr_transaction id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.telebirr_transaction ALTER COLUMN id SET DEFAULT nextval('public.telebirr_transaction_id_seq'::regclass);


--
-- Name: tenant_module_entitlements id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenant_module_entitlements ALTER COLUMN id SET DEFAULT nextval('public.tenant_module_entitlements_id_seq'::regclass);


--
-- Name: tenant_subscriptions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenant_subscriptions ALTER COLUMN id SET DEFAULT nextval('public.tenant_subscriptions_id_seq'::regclass);


--
-- Name: top_up_request id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.top_up_request ALTER COLUMN id SET DEFAULT nextval('public.top_up_request_id_seq'::regclass);


--
-- Name: ui_setting id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ui_setting ALTER COLUMN id SET DEFAULT nextval('public.ui_setting_id_seq'::regclass);


--
-- Name: user id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."user" ALTER COLUMN id SET DEFAULT nextval('public.user_id_seq'::regclass);


--
-- Name: user_report id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_report ALTER COLUMN id SET DEFAULT nextval('public.user_report_id_seq'::regclass);


--
-- Name: user_settings id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_settings ALTER COLUMN id SET DEFAULT nextval('public.user_settings_id_seq'::regclass);


--
-- Name: vendor id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vendor ALTER COLUMN id SET DEFAULT nextval('public.vendor_id_seq'::regclass);


--
-- Name: vendor_staff id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vendor_staff ALTER COLUMN id SET DEFAULT nextval('public.vendor_staff_id_seq'::regclass);


--
-- Name: vendor_stores id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vendor_stores ALTER COLUMN id SET DEFAULT nextval('public.vendor_stores_id_seq'::regclass);


--
-- Name: wallet id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wallet ALTER COLUMN id SET DEFAULT nextval('public.wallet_id_seq'::regclass);


--
-- Name: wallet_transaction id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wallet_transaction ALTER COLUMN id SET DEFAULT nextval('public.wallet_transaction_id_seq'::regclass);


--
-- Name: withdrawal id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.withdrawal ALTER COLUMN id SET DEFAULT nextval('public.withdrawal_id_seq'::regclass);


--
-- Name: withdrawals id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.withdrawals ALTER COLUMN id SET DEFAULT nextval('public.withdrawals_id_seq'::regclass);


--
-- Name: user_settings PK_00f004f5922a0744d174530d639; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_settings
    ADD CONSTRAINT "PK_00f004f5922a0744d174530d639" PRIMARY KEY (id);


--
-- Name: order PK_1031171c13130102495201e3e20; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."order"
    ADD CONSTRAINT "PK_1031171c13130102495201e3e20" PRIMARY KEY (id);


--
-- Name: procurement_webhook_deliveries PK_106f1ef67f78239fe51ae110e23; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.procurement_webhook_deliveries
    ADD CONSTRAINT "PK_106f1ef67f78239fe51ae110e23" PRIMARY KEY (id);


--
-- Name: media_cleanup_task PK_1558ba687a1f3f806c7dc5bbf85; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_cleanup_task
    ADD CONSTRAINT "PK_1558ba687a1f3f806c7dc5bbf85" PRIMARY KEY (id);


--
-- Name: search_log PK_226481200f57d88fae8e5a63a27; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.search_log
    ADD CONSTRAINT "PK_226481200f57d88fae8e5a63a27" PRIMARY KEY (id);


--
-- Name: settlement PK_23997ae6972574beb45af0177ad; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.settlement
    ADD CONSTRAINT "PK_23997ae6972574beb45af0177ad" PRIMARY KEY (id);


--
-- Name: review PK_2e4299a343a81574217255c00ca; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.review
    ADD CONSTRAINT "PK_2e4299a343a81574217255c00ca" PRIMARY KEY (id);


--
-- Name: pos_suspended_carts PK_2efc6268e99c0b67b4084bfa777; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_suspended_carts
    ADD CONSTRAINT "PK_2efc6268e99c0b67b4084bfa777" PRIMARY KEY (id);


--
-- Name: role_upgrade_request PK_30b4e8b612e6c4f7fd00e32ad78; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.role_upgrade_request
    ADD CONSTRAINT "PK_30b4e8b612e6c4f7fd00e32ad78" PRIMARY KEY (id);


--
-- Name: top_up_request PK_33c2d93fdc33054a3967f32fba3; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.top_up_request
    ADD CONSTRAINT "PK_33c2d93fdc33054a3967f32fba3" PRIMARY KEY (id);


--
-- Name: pos_checkouts PK_3cccda2ce239700bf7eeb8894c0; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_checkouts
    ADD CONSTRAINT "PK_3cccda2ce239700bf7eeb8894c0" PRIMARY KEY (id);


--
-- Name: ui_setting PK_46a8f04233be0284cd7808b17b8; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ui_setting
    ADD CONSTRAINT "PK_46a8f04233be0284cd7808b17b8" PRIMARY KEY (id);


--
-- Name: feed_interactions PK_4f965cda810ebb3ee36c1ff6bb1; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.feed_interactions
    ADD CONSTRAINT "PK_4f965cda810ebb3ee36c1ff6bb1" PRIMARY KEY (id);


--
-- Name: product_aliases PK_5395d7d07b691c064ef15c5b66c; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_aliases
    ADD CONSTRAINT "PK_5395d7d07b691c064ef15c5b66c" PRIMARY KEY (id);


--
-- Name: user_report PK_58c08f0e20fa66561b119421eb2; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_report
    ADD CONSTRAINT "PK_58c08f0e20fa66561b119421eb2" PRIMARY KEY (id);


--
-- Name: vendor_staff PK_5b97df11805a8999d38c57c85a7; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vendor_staff
    ADD CONSTRAINT "PK_5b97df11805a8999d38c57c85a7" PRIMARY KEY (id);


--
-- Name: wallet_transaction PK_62a01b9c3a734b96a08c621b371; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wallet_transaction
    ADD CONSTRAINT "PK_62a01b9c3a734b96a08c621b371" PRIMARY KEY (id);


--
-- Name: withdrawal PK_840e247aaad3fbd4e18129122a2; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.withdrawal
    ADD CONSTRAINT "PK_840e247aaad3fbd4e18129122a2" PRIMARY KEY (id);


--
-- Name: device_tokens PK_84700be257607cfb1f9dc2e52c3; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.device_tokens
    ADD CONSTRAINT "PK_84700be257607cfb1f9dc2e52c3" PRIMARY KEY (id);


--
-- Name: conversation PK_864528ec4274360a40f66c29845; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation
    ADD CONSTRAINT "PK_864528ec4274360a40f66c29845" PRIMARY KEY (id);


--
-- Name: system_setting PK_88dbc9b10c8558420acf7ea642f; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_setting
    ADD CONSTRAINT "PK_88dbc9b10c8558420acf7ea642f" PRIMARY KEY (id);


--
-- Name: product_tags_tag PK_8da52c0bc9255c6cb07af25ac73; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_tags_tag
    ADD CONSTRAINT "PK_8da52c0bc9255c6cb07af25ac73" PRIMARY KEY ("productId", "tagId");


--
-- Name: category_closure PK_8da8666fc72217687e9b4f4c7e9; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.category_closure
    ADD CONSTRAINT "PK_8da8666fc72217687e9b4f4c7e9" PRIMARY KEY (id_ancestor, id_descendant);


--
-- Name: tag PK_8e4052373c579afc1471f526760; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tag
    ADD CONSTRAINT "PK_8e4052373c579afc1471f526760" PRIMARY KEY (id);


--
-- Name: vendor PK_931a23f6231a57604f5a0e32780; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vendor
    ADD CONSTRAINT "PK_931a23f6231a57604f5a0e32780" PRIMARY KEY (id);


--
-- Name: withdrawals PK_9871ec481baa7755f8bd8b7c7e9; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.withdrawals
    ADD CONSTRAINT "PK_9871ec481baa7755f8bd8b7c7e9" PRIMARY KEY (id);


--
-- Name: product_image PK_99d98a80f57857d51b5f63c8240; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_image
    ADD CONSTRAINT "PK_99d98a80f57857d51b5f63c8240" PRIMARY KEY (id);


--
-- Name: category PK_9c4e4a89e3674fc9f382d733f03; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.category
    ADD CONSTRAINT "PK_9c4e4a89e3674fc9f382d733f03" PRIMARY KEY (id);


--
-- Name: seller_workspaces PK_aa3aced0577aa225cdefc751dfd; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.seller_workspaces
    ADD CONSTRAINT "PK_aa3aced0577aa225cdefc751dfd" PRIMARY KEY (id);


--
-- Name: telebirr_transaction PK_aef3e4b05c77fd66fa9a57c52ae; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.telebirr_transaction
    ADD CONSTRAINT "PK_aef3e4b05c77fd66fa9a57c52ae" PRIMARY KEY (id);


--
-- Name: pos_register_sessions PK_b221710405ea9491912f881cde9; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_register_sessions
    ADD CONSTRAINT "PK_b221710405ea9491912f881cde9" PRIMARY KEY (id);


--
-- Name: message PK_ba01f0a3e0123651915008bc578; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.message
    ADD CONSTRAINT "PK_ba01f0a3e0123651915008bc578" PRIMARY KEY (id);


--
-- Name: cart_item PK_bd94725aa84f8cf37632bcde997; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cart_item
    ADD CONSTRAINT "PK_bd94725aa84f8cf37632bcde997" PRIMARY KEY (id);


--
-- Name: product PK_bebc9158e480b949565b4dc7a82; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product
    ADD CONSTRAINT "PK_bebc9158e480b949565b4dc7a82" PRIMARY KEY (id);


--
-- Name: wallet PK_bec464dd8d54c39c54fd32e2334; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wallet
    ADD CONSTRAINT "PK_bec464dd8d54c39c54fd32e2334" PRIMARY KEY (id);


--
-- Name: country PK_bf6e37c231c4f4ea56dcd887269; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.country
    ADD CONSTRAINT "PK_bf6e37c231c4f4ea56dcd887269" PRIMARY KEY (id);


--
-- Name: branch_accrued_liabilities PK_branch_accrued_liabilities_id; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.branch_accrued_liabilities
    ADD CONSTRAINT "PK_branch_accrued_liabilities_id" PRIMARY KEY (id);


--
-- Name: branch_catalog_vendor_links PK_branch_catalog_vendor_links_id; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.branch_catalog_vendor_links
    ADD CONSTRAINT "PK_branch_catalog_vendor_links_id" PRIMARY KEY (id);


--
-- Name: branch_depreciation_entries PK_branch_depreciation_entries_id; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.branch_depreciation_entries
    ADD CONSTRAINT "PK_branch_depreciation_entries_id" PRIMARY KEY (id);


--
-- Name: branch_fixed_assets PK_branch_fixed_assets_id; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.branch_fixed_assets
    ADD CONSTRAINT "PK_branch_fixed_assets_id" PRIMARY KEY (id);


--
-- Name: branch_inventory PK_branch_inventory_id; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.branch_inventory
    ADD CONSTRAINT "PK_branch_inventory_id" PRIMARY KEY (id);


--
-- Name: branch_inventory_variant PK_branch_inventory_variant_id; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.branch_inventory_variant
    ADD CONSTRAINT "PK_branch_inventory_variant_id" PRIMARY KEY (id);


--
-- Name: branch_long_term_debts PK_branch_long_term_debts_id; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.branch_long_term_debts
    ADD CONSTRAINT "PK_branch_long_term_debts_id" PRIMARY KEY (id);


--
-- Name: branch_staff_assignments PK_branch_staff_assignments_id; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.branch_staff_assignments
    ADD CONSTRAINT "PK_branch_staff_assignments_id" PRIMARY KEY (id);


--
-- Name: branch_staff_invites PK_branch_staff_invites_id; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.branch_staff_invites
    ADD CONSTRAINT "PK_branch_staff_invites_id" PRIMARY KEY (id);


--
-- Name: branch_transfer_items PK_branch_transfer_items_id; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.branch_transfer_items
    ADD CONSTRAINT "PK_branch_transfer_items_id" PRIMARY KEY (id);


--
-- Name: branch_transfers PK_branch_transfers_id; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.branch_transfers
    ADD CONSTRAINT "PK_branch_transfers_id" PRIMARY KEY (id);


--
-- Name: branches PK_branches_id; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.branches
    ADD CONSTRAINT "PK_branches_id" PRIMARY KEY (id);


--
-- Name: procurement_webhook_subscriptions PK_c1a23458a2115112250bf46e3a2; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.procurement_webhook_subscriptions
    ADD CONSTRAINT "PK_c1a23458a2115112250bf46e3a2" PRIMARY KEY (id);


--
-- Name: cart PK_c524ec48751b9b5bcfbf6e59be7; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cart
    ADD CONSTRAINT "PK_c524ec48751b9b5bcfbf6e59be7" PRIMARY KEY (id);


--
-- Name: user PK_cace4a159ff9f2512dd42373760; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."user"
    ADD CONSTRAINT "PK_cace4a159ff9f2512dd42373760" PRIMARY KEY (id);


--
-- Name: coupon PK_coupon_id; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coupon
    ADD CONSTRAINT "PK_coupon_id" PRIMARY KEY (id);


--
-- Name: credit_limit PK_credit_limit_id; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.credit_limit
    ADD CONSTRAINT "PK_credit_limit_id" PRIMARY KEY (id);


--
-- Name: credit_transaction PK_credit_transaction_id; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.credit_transaction
    ADD CONSTRAINT "PK_credit_transaction_id" PRIMARY KEY (id);


--
-- Name: order_item PK_d01158fe15b1ead5c26fd7f4e90; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_item
    ADD CONSTRAINT "PK_d01158fe15b1ead5c26fd7f4e90" PRIMARY KEY (id);


--
-- Name: payout_log PK_d0326ceb2bec65a7114e7cd9e5c; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payout_log
    ADD CONSTRAINT "PK_d0326ceb2bec65a7114e7cd9e5c" PRIMARY KEY (id);


--
-- Name: ebirr_transaction PK_d545b4e0b1e9a6362cbfd9e23b7; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ebirr_transaction
    ADD CONSTRAINT "PK_d545b4e0b1e9a6362cbfd9e23b7" PRIMARY KEY (id);


--
-- Name: dispute PK_dispute_id; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dispute
    ADD CONSTRAINT "PK_dispute_id" PRIMARY KEY (id);


--
-- Name: equity_partner_bnpl_credit_ledger PK_equity_partner_bnpl_credit_ledger_id; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.equity_partner_bnpl_credit_ledger
    ADD CONSTRAINT "PK_equity_partner_bnpl_credit_ledger_id" PRIMARY KEY (id);


--
-- Name: subscription_request PK_f65b2f436177ee123dfd199c493; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscription_request
    ADD CONSTRAINT "PK_f65b2f436177ee123dfd199c493" PRIMARY KEY (id);


--
-- Name: favorites PK_favorites_user; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.favorites
    ADD CONSTRAINT "PK_favorites_user" PRIMARY KEY ("userId");


--
-- Name: flash_sale PK_flash_sale_id; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.flash_sale
    ADD CONSTRAINT "PK_flash_sale_id" PRIMARY KEY (id);


--
-- Name: flash_sale_products_product PK_flash_sale_products; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.flash_sale_products_product
    ADD CONSTRAINT "PK_flash_sale_products" PRIMARY KEY ("flashSaleId", "productId");


--
-- Name: gl_accounts PK_gl_accounts_code; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gl_accounts
    ADD CONSTRAINT "PK_gl_accounts_code" PRIMARY KEY (code);


--
-- Name: gl_journal_entries PK_gl_journal_entries_id; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gl_journal_entries
    ADD CONSTRAINT "PK_gl_journal_entries_id" PRIMARY KEY (id);


--
-- Name: gl_journal_lines PK_gl_journal_lines_id; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gl_journal_lines
    ADD CONSTRAINT "PK_gl_journal_lines_id" PRIMARY KEY (id);


--
-- Name: partner_credentials PK_partner_credentials_id; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.partner_credentials
    ADD CONSTRAINT "PK_partner_credentials_id" PRIMARY KEY (id);


--
-- Name: payment_logs PK_payment_logs_id; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_logs
    ADD CONSTRAINT "PK_payment_logs_id" PRIMARY KEY (id);


--
-- Name: pos_branch_security PK_pos_branch_security; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_branch_security
    ADD CONSTRAINT "PK_pos_branch_security" PRIMARY KEY ("branchId");


--
-- Name: pos_hospitality_bill_interventions PK_pos_hospitality_bill_interventions_id; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_hospitality_bill_interventions
    ADD CONSTRAINT "PK_pos_hospitality_bill_interventions_id" PRIMARY KEY (id);


--
-- Name: pos_hospitality_idempotency_keys PK_pos_hospitality_idempotency_keys_id; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_hospitality_idempotency_keys
    ADD CONSTRAINT "PK_pos_hospitality_idempotency_keys_id" PRIMARY KEY (id);


--
-- Name: pos_hospitality_kitchen_tickets PK_pos_hospitality_kitchen_tickets_id; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_hospitality_kitchen_tickets
    ADD CONSTRAINT "PK_pos_hospitality_kitchen_tickets_id" PRIMARY KEY (id);


--
-- Name: pos_hospitality_table_board PK_pos_hospitality_table_board_id; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_hospitality_table_board
    ADD CONSTRAINT "PK_pos_hospitality_table_board_id" PRIMARY KEY (id);


--
-- Name: pos_hotel_folio_charges PK_pos_hotel_folio_charges_id; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_hotel_folio_charges
    ADD CONSTRAINT "PK_pos_hotel_folio_charges_id" PRIMARY KEY (id);


--
-- Name: pos_hotel_folios PK_pos_hotel_folios_id; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_hotel_folios
    ADD CONSTRAINT "PK_pos_hotel_folios_id" PRIMARY KEY (id);


--
-- Name: pos_kitchen_product_availability PK_pos_kitchen_prod_avail_id; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_kitchen_product_availability
    ADD CONSTRAINT "PK_pos_kitchen_prod_avail_id" PRIMARY KEY (id);


--
-- Name: pos_property_rate_plans PK_pos_property_rate_plans_id; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_property_rate_plans
    ADD CONSTRAINT "PK_pos_property_rate_plans_id" PRIMARY KEY (id);


--
-- Name: pos_property_rental_booking_charges PK_pos_property_rental_booking_charges_id; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_property_rental_booking_charges
    ADD CONSTRAINT "PK_pos_property_rental_booking_charges_id" PRIMARY KEY (id);


--
-- Name: pos_property_rental_bookings PK_pos_property_rental_bookings_id; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_property_rental_bookings
    ADD CONSTRAINT "PK_pos_property_rental_bookings_id" PRIMARY KEY (id);


--
-- Name: pos_property_reservations PK_pos_property_reservations_id; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_property_reservations
    ADD CONSTRAINT "PK_pos_property_reservations_id" PRIMARY KEY (id);


--
-- Name: pos_property_units PK_pos_property_units_id; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_property_units
    ADD CONSTRAINT "PK_pos_property_units_id" PRIMARY KEY (id);


--
-- Name: pos_sync_jobs PK_pos_sync_jobs_id; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_sync_jobs
    ADD CONSTRAINT "PK_pos_sync_jobs_id" PRIMARY KEY (id);


--
-- Name: product_variant PK_product_variant_id; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_variant
    ADD CONSTRAINT "PK_product_variant_id" PRIMARY KEY (id);


--
-- Name: purchase_order_items PK_purchase_order_items_id; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_order_items
    ADD CONSTRAINT "PK_purchase_order_items_id" PRIMARY KEY (id);


--
-- Name: purchase_order_receipt_events PK_purchase_order_receipt_events_id; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_order_receipt_events
    ADD CONSTRAINT "PK_purchase_order_receipt_events_id" PRIMARY KEY (id);


--
-- Name: purchase_orders PK_purchase_orders_id; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_orders
    ADD CONSTRAINT "PK_purchase_orders_id" PRIMARY KEY (id);


--
-- Name: retail_tenants PK_retail_tenants_id; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retail_tenants
    ADD CONSTRAINT "PK_retail_tenants_id" PRIMARY KEY (id);


--
-- Name: stock_movements PK_stock_movements_id; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_movements
    ADD CONSTRAINT "PK_stock_movements_id" PRIMARY KEY (id);


--
-- Name: supplier_offers PK_supplier_offers_id; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplier_offers
    ADD CONSTRAINT "PK_supplier_offers_id" PRIMARY KEY (id);


--
-- Name: supplier_profiles PK_supplier_profiles_id; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplier_profiles
    ADD CONSTRAINT "PK_supplier_profiles_id" PRIMARY KEY (id);


--
-- Name: tenant_module_entitlements PK_tenant_module_entitlements_id; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenant_module_entitlements
    ADD CONSTRAINT "PK_tenant_module_entitlements_id" PRIMARY KEY (id);


--
-- Name: tenant_subscriptions PK_tenant_subscriptions_id; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenant_subscriptions
    ADD CONSTRAINT "PK_tenant_subscriptions_id" PRIMARY KEY (id);


--
-- Name: vendor_stores PK_vendor_stores; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vendor_stores
    ADD CONSTRAINT "PK_vendor_stores" PRIMARY KEY (id);


--
-- Name: wallet REL_35472b1fe48b6330cd34970956; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wallet
    ADD CONSTRAINT "REL_35472b1fe48b6330cd34970956" UNIQUE ("userId");


--
-- Name: cart REL_756f53ab9466eb52a52619ee01; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cart
    ADD CONSTRAINT "REL_756f53ab9466eb52a52619ee01" UNIQUE ("userId");


--
-- Name: user_settings REL_986a2b6d3c05eb4091bb8066f7; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_settings
    ADD CONSTRAINT "REL_986a2b6d3c05eb4091bb8066f7" UNIQUE ("userId");


--
-- Name: dispute REL_dispute_order; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dispute
    ADD CONSTRAINT "REL_dispute_order" UNIQUE ("orderId");


--
-- Name: supplier_staff_assignments UQ_15241e4ae5a2980bdedba1e47f2; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplier_staff_assignments
    ADD CONSTRAINT "UQ_15241e4ae5a2980bdedba1e47f2" UNIQUE ("supplierProfileId", "userId");


--
-- Name: country UQ_2c5aa339240c0c3ae97fcc9dc4c; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.country
    ADD CONSTRAINT "UQ_2c5aa339240c0c3ae97fcc9dc4c" UNIQUE (name);


--
-- Name: branch_staff_assignments UQ_518c45708c7144b0bb513144744; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.branch_staff_assignments
    ADD CONSTRAINT "UQ_518c45708c7144b0bb513144744" UNIQUE ("branchId", "userId");


--
-- Name: ebirr_transaction UQ_6259e19db4d67c875966eee8c0e; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ebirr_transaction
    ADD CONSTRAINT "UQ_6259e19db4d67c875966eee8c0e" UNIQUE (merch_order_id);


--
-- Name: tag UQ_6a9775008add570dc3e5a0bab7b; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tag
    ADD CONSTRAINT "UQ_6a9775008add570dc3e5a0bab7b" UNIQUE (name);


--
-- Name: user UQ_710f0110331a5f57aa510891da2; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."user"
    ADD CONSTRAINT "UQ_710f0110331a5f57aa510891da2" UNIQUE ("posUsername");


--
-- Name: branch_staff_invites UQ_73986b6e6512094e3cc2bdc199d; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.branch_staff_invites
    ADD CONSTRAINT "UQ_73986b6e6512094e3cc2bdc199d" UNIQUE ("branchId", email);


--
-- Name: user UQ_905432b2c46bdcfe1a0dd3cdeff; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."user"
    ADD CONSTRAINT "UQ_905432b2c46bdcfe1a0dd3cdeff" UNIQUE ("firebaseUid");


--
-- Name: telebirr_transaction UQ_ab8e05e578a4f464f7a2b13b7b5; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.telebirr_transaction
    ADD CONSTRAINT "UQ_ab8e05e578a4f464f7a2b13b7b5" UNIQUE (merch_order_id);


--
-- Name: vendor_staff UQ_be2beff23dbf6e0288c6e1e6497; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vendor_staff
    ADD CONSTRAINT "UQ_be2beff23dbf6e0288c6e1e6497" UNIQUE ("memberId", "vendorId");


--
-- Name: branch_inventory_variant UQ_branch_inventory_variant_branch_variant; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.branch_inventory_variant
    ADD CONSTRAINT "UQ_branch_inventory_variant_branch_variant" UNIQUE ("branchId", "variantId");


--
-- Name: branch_shift_staff UQ_branch_shift_staff_shift_user; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.branch_shift_staff
    ADD CONSTRAINT "UQ_branch_shift_staff_shift_user" UNIQUE ("shiftId", "userId");


--
-- Name: branch_transfers UQ_branch_transfers_transfer_number; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.branch_transfers
    ADD CONSTRAINT "UQ_branch_transfers_transfer_number" UNIQUE ("transferNumber");


--
-- Name: branches UQ_branches_code; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.branches
    ADD CONSTRAINT "UQ_branches_code" UNIQUE (code);


--
-- Name: system_setting UQ_c6ce0e35b3c0d67dca93523ba1b; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_setting
    ADD CONSTRAINT "UQ_c6ce0e35b3c0d67dca93523ba1b" UNIQUE (key);


--
-- Name: category UQ_cb73208f151aa71cdd78f662d70; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.category
    ADD CONSTRAINT "UQ_cb73208f151aa71cdd78f662d70" UNIQUE (slug);


--
-- Name: coupon UQ_coupon_code; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coupon
    ADD CONSTRAINT "UQ_coupon_code" UNIQUE (code);


--
-- Name: credit_limit UQ_credit_limit_userId; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.credit_limit
    ADD CONSTRAINT "UQ_credit_limit_userId" UNIQUE ("userId");


--
-- Name: ui_setting UQ_d47106337e84473e79627ca87ce; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ui_setting
    ADD CONSTRAINT "UQ_d47106337e84473e79627ca87ce" UNIQUE (key);


--
-- Name: user UQ_e12875dfb3b1d92d7d7c5377e22; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."user"
    ADD CONSTRAINT "UQ_e12875dfb3b1d92d7d7c5377e22" UNIQUE (email);


--
-- Name: product_variant UQ_product_variant_product_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_variant
    ADD CONSTRAINT "UQ_product_variant_product_key" UNIQUE ("productId", "variantKey");


--
-- Name: purchase_orders UQ_purchase_orders_order_number; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_orders
    ADD CONSTRAINT "UQ_purchase_orders_order_number" UNIQUE ("orderNumber");


--
-- Name: retail_tenants UQ_retail_tenants_code; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retail_tenants
    ADD CONSTRAINT "UQ_retail_tenants_code" UNIQUE (code);


--
-- Name: audit_log audit_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_log
    ADD CONSTRAINT audit_log_pkey PRIMARY KEY (id);


--
-- Name: branch_catalog_product_links branch_catalog_product_links_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.branch_catalog_product_links
    ADD CONSTRAINT branch_catalog_product_links_pkey PRIMARY KEY (id);


--
-- Name: branch_expenses branch_expenses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.branch_expenses
    ADD CONSTRAINT branch_expenses_pkey PRIMARY KEY (id);


--
-- Name: branch_shift_staff branch_shift_staff_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.branch_shift_staff
    ADD CONSTRAINT branch_shift_staff_pkey PRIMARY KEY (id);


--
-- Name: branch_shifts branch_shifts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.branch_shifts
    ADD CONSTRAINT branch_shifts_pkey PRIMARY KEY (id);


--
-- Name: branches branches_vendorStoreId_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.branches
    ADD CONSTRAINT "branches_vendorStoreId_key" UNIQUE ("vendorStoreId");


--
-- Name: equity_partner_bnpl_activations equity_partner_bnpl_activations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.equity_partner_bnpl_activations
    ADD CONSTRAINT equity_partner_bnpl_activations_pkey PRIMARY KEY (id);


--
-- Name: equity_partners equity_partners_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.equity_partners
    ADD CONSTRAINT equity_partners_pkey PRIMARY KEY (id);


--
-- Name: equity_partners equity_partners_referralCode_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.equity_partners
    ADD CONSTRAINT "equity_partners_referralCode_key" UNIQUE ("referralCode");


--
-- Name: equity_payouts equity_payouts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.equity_payouts
    ADD CONSTRAINT equity_payouts_pkey PRIMARY KEY (id);


--
-- Name: equity_split_assignments equity_split_assignments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.equity_split_assignments
    ADD CONSTRAINT equity_split_assignments_pkey PRIMARY KEY (id);


--
-- Name: notification notification_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification
    ADD CONSTRAINT notification_pkey PRIMARY KEY (id);


--
-- Name: parked_orders parked_orders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.parked_orders
    ADD CONSTRAINT parked_orders_pkey PRIMARY KEY (id);


--
-- Name: pos_hotel_night_audit_logs pos_hotel_night_audit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_hotel_night_audit_logs
    ADD CONSTRAINT pos_hotel_night_audit_logs_pkey PRIMARY KEY (id);


--
-- Name: pos_hotel_rate_plans pos_hotel_rate_plans_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_hotel_rate_plans
    ADD CONSTRAINT pos_hotel_rate_plans_pkey PRIMARY KEY (id);


--
-- Name: pos_hotel_reservations pos_hotel_reservations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_hotel_reservations
    ADD CONSTRAINT pos_hotel_reservations_pkey PRIMARY KEY (id);


--
-- Name: pos_hotel_rooms pos_hotel_rooms_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_hotel_rooms
    ADD CONSTRAINT pos_hotel_rooms_pkey PRIMARY KEY (id);


--
-- Name: product_image_moderation product_image_moderation_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_image_moderation
    ADD CONSTRAINT product_image_moderation_pkey PRIMARY KEY (id);


--
-- Name: product_impression product_impression_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_impression
    ADD CONSTRAINT product_impression_pkey PRIMARY KEY (id);


--
-- Name: product_request_forward product_request_forward_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_request_forward
    ADD CONSTRAINT product_request_forward_pkey PRIMARY KEY (id);


--
-- Name: product_request_offer product_request_offer_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_request_offer
    ADD CONSTRAINT product_request_offer_pkey PRIMARY KEY (id);


--
-- Name: product_request product_request_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_request
    ADD CONSTRAINT product_request_pkey PRIMARY KEY (id);


--
-- Name: search_keyword search_keyword_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.search_keyword
    ADD CONSTRAINT search_keyword_pkey PRIMARY KEY (id);


--
-- Name: supplier_staff_assignments supplier_staff_assignments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplier_staff_assignments
    ADD CONSTRAINT supplier_staff_assignments_pkey PRIMARY KEY (id);


--
-- Name: supply_outreach_task supply_outreach_task_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supply_outreach_task
    ADD CONSTRAINT supply_outreach_task_pkey PRIMARY KEY (id);


--
-- Name: pos_hospitality_bill_interventions uq_pos_hospitality_bill_intervention_branch_bill; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_hospitality_bill_interventions
    ADD CONSTRAINT uq_pos_hospitality_bill_intervention_branch_bill UNIQUE ("branchId", "billId");


--
-- Name: pos_hospitality_idempotency_keys uq_pos_hospitality_idempotency_branch_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_hospitality_idempotency_keys
    ADD CONSTRAINT uq_pos_hospitality_idempotency_branch_key UNIQUE ("branchId", "idempotencyKey");


--
-- Name: pos_hospitality_kitchen_tickets uq_pos_hospitality_kitchen_ticket_branch_ticket; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_hospitality_kitchen_tickets
    ADD CONSTRAINT uq_pos_hospitality_kitchen_ticket_branch_ticket UNIQUE ("branchId", "ticketId");


--
-- Name: pos_hospitality_table_board uq_pos_hospitality_table_board_branch_table; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_hospitality_table_board
    ADD CONSTRAINT uq_pos_hospitality_table_board_branch_table UNIQUE ("branchId", "tableId");


--
-- Name: pos_hotel_folios uq_pos_hotel_folios_idempotency_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_hotel_folios
    ADD CONSTRAINT uq_pos_hotel_folios_idempotency_key UNIQUE ("idempotencyKey");


--
-- Name: pos_hotel_rooms uq_pos_hotel_rooms_branch_number; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_hotel_rooms
    ADD CONSTRAINT uq_pos_hotel_rooms_branch_number UNIQUE ("branchId", "roomNumber");


--
-- Name: pos_kitchen_product_availability uq_pos_kitchen_prod_avail_branch_product; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_kitchen_product_availability
    ADD CONSTRAINT uq_pos_kitchen_prod_avail_branch_product UNIQUE ("branchId", "productId");


--
-- Name: pos_property_rental_bookings uq_pos_property_rental_bookings_idempotency_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_property_rental_bookings
    ADD CONSTRAINT uq_pos_property_rental_bookings_idempotency_key UNIQUE ("idempotencyKey");


--
-- Name: vendor_stores vendor_stores_branchId_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vendor_stores
    ADD CONSTRAINT "vendor_stores_branchId_key" UNIQUE ("branchId");


--
-- Name: IDX_034c9d2a2b28cf101fe675b8e8; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "IDX_034c9d2a2b28cf101fe675b8e8" ON public.conversation USING btree ("buyerId", "vendorId", "productId") WHERE ("productId" IS NOT NULL);


--
-- Name: IDX_04611b75510aced865912c3395; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_04611b75510aced865912c3395" ON public.product_impression USING btree ("productId", "sessionKey");


--
-- Name: IDX_06f8ed4b9d949fe07dace0a791; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_06f8ed4b9d949fe07dace0a791" ON public.feed_interactions USING btree ("requestId");


--
-- Name: IDX_0de90b04710a86601acdff88c2; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_0de90b04710a86601acdff88c2" ON public.product_tags_tag USING btree ("tagId");


--
-- Name: IDX_136f0959d2bc4bcc6c4b9abe58; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_136f0959d2bc4bcc6c4b9abe58" ON public.flash_sale_products_product USING btree ("productId");


--
-- Name: IDX_142ad20f8e4e5385b548940b62; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_142ad20f8e4e5385b548940b62" ON public.user_report USING btree ("reporterId");


--
-- Name: IDX_18594ccbcb503d166ac8e00ee1; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_18594ccbcb503d166ac8e00ee1" ON public.feed_interactions USING btree ("productId");


--
-- Name: IDX_1c771a65e9a3da52177707cafd; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_1c771a65e9a3da52177707cafd" ON public.supplier_offers USING btree ("supplierProfileId", "productId");


--
-- Name: IDX_1ee74a5de6247b6e7af7584120; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_1ee74a5de6247b6e7af7584120" ON public.stock_movements USING btree ("branchId", "productId", "createdAt");


--
-- Name: IDX_208235f4a5c925f11171252b76; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_208235f4a5c925f11171252b76" ON public.product_tags_tag USING btree ("productId");


--
-- Name: IDX_23c05c292c439d77b0de816b50; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_23c05c292c439d77b0de816b50" ON public.category USING btree (name);


--
-- Name: IDX_30cf5ad1c7b5543a9347ebd48c; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "IDX_30cf5ad1c7b5543a9347ebd48c" ON public.conversation USING btree ("buyerId", "delivererId", "orderId") WHERE (("orderId" IS NOT NULL) AND ("buyerId" IS NOT NULL));


--
-- Name: IDX_344ab45ce83faea491a5e434c5; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_344ab45ce83faea491a5e434c5" ON public.product_aliases USING btree ("tenantId", "aliasType", "normalizedAliasValue");


--
-- Name: IDX_3ed6e391188924d8826fca56e9; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_3ed6e391188924d8826fca56e9" ON public.product_aliases USING btree ("branchId", "aliasType", "normalizedAliasValue");


--
-- Name: IDX_4084ddb75dbad0e3215ca723ca; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "IDX_4084ddb75dbad0e3215ca723ca" ON public.branch_inventory USING btree ("branchId", "productId");


--
-- Name: IDX_420903a01754f90365411ec7bc; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_420903a01754f90365411ec7bc" ON public.product_aliases USING btree ("partnerCredentialId", "aliasType", "normalizedAliasValue");


--
-- Name: IDX_470355432cc67b2c470c30bef7; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_470355432cc67b2c470c30bef7" ON public."user" USING btree ("googleId");


--
-- Name: IDX_4aa1348fc4b7da9bef0fae8ff4; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_4aa1348fc4b7da9bef0fae8ff4" ON public.category_closure USING btree (id_ancestor);


--
-- Name: IDX_4faa12c92a5867582ad250307e; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_4faa12c92a5867582ad250307e" ON public.branch_depreciation_entries USING btree ("branchId", "occurredAt");


--
-- Name: IDX_511957e3e8443429dc3fb00120; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_511957e3e8443429dc3fb00120" ON public.device_tokens USING btree ("userId");


--
-- Name: IDX_52962aa8f168e7691f0df5a177; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "IDX_52962aa8f168e7691f0df5a177" ON public.branch_catalog_product_links USING btree ("branchId", "productId");


--
-- Name: IDX_58bbb26043e19510876a579390; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_58bbb26043e19510876a579390" ON public.user_report USING btree ("productId");


--
-- Name: IDX_5ae5f6b585a7818b458874c53f; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "IDX_5ae5f6b585a7818b458874c53f" ON public.branch_catalog_vendor_links USING btree ("branchId", "vendorId");


--
-- Name: IDX_654a5b2219987a5667930c4809; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "IDX_654a5b2219987a5667930c4809" ON public.pos_checkouts USING btree ("branchId", "idempotencyKey");


--
-- Name: IDX_6567987321985dd7024e03f429; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "IDX_6567987321985dd7024e03f429" ON public.search_keyword USING btree (q_norm);


--
-- Name: IDX_6a22002acac4976977b1efd114; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_6a22002acac4976977b1efd114" ON public.category_closure USING btree (id_descendant);


--
-- Name: IDX_6f80b52f0b383fef795f354371; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_6f80b52f0b383fef795f354371" ON public.product_image_moderation USING btree ("productId");


--
-- Name: IDX_710f0110331a5f57aa510891da; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_710f0110331a5f57aa510891da" ON public."user" USING btree ("posUsername");


--
-- Name: IDX_77ae7d03d8bf7792870aedaf09; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "IDX_77ae7d03d8bf7792870aedaf09" ON public.conversation USING btree ("vendorId", "delivererId", "orderId") WHERE (("orderId" IS NOT NULL) AND ("vendorId" IS NOT NULL));


--
-- Name: IDX_8464ca6087a262eee6ff2c1548; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "IDX_8464ca6087a262eee6ff2c1548" ON public.seller_workspaces USING btree ("ownerUserId");


--
-- Name: IDX_87c9326146ef9829f470ac23ee; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "IDX_87c9326146ef9829f470ac23ee" ON public.equity_partner_bnpl_credit_ledger USING btree ("bnplActivationId");


--
-- Name: IDX_905432b2c46bdcfe1a0dd3cdef; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_905432b2c46bdcfe1a0dd3cdef" ON public."user" USING btree ("firebaseUid");


--
-- Name: IDX_909a03b328747bd46fc52eb66d; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_909a03b328747bd46fc52eb66d" ON public."user" USING btree ("appleId");


--
-- Name: IDX_9215b87f7ea56047ca6d90515b; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_9215b87f7ea56047ca6d90515b" ON public.branch_long_term_debts USING btree ("branchId", "maturityAt");


--
-- Name: IDX_929cc7e86956292ebba3bbe66e; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "IDX_929cc7e86956292ebba3bbe66e" ON public.equity_partners USING btree ("userId") WHERE ("userId" IS NOT NULL);


--
-- Name: IDX_94d2e018b66900c0ce11b41acb; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "IDX_94d2e018b66900c0ce11b41acb" ON public.branch_transfer_items USING btree ("transferId", "productId");


--
-- Name: IDX_96356ca5b4e6192c497973c78b; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_96356ca5b4e6192c497973c78b" ON public.branch_staff_invites USING btree (email, "isActive");


--
-- Name: IDX_977e24c520c49436d08e5eeea8; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "IDX_977e24c520c49436d08e5eeea8" ON public.device_tokens USING btree (token);


--
-- Name: IDX_9af208dc3f34e4bd254c38057d; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_9af208dc3f34e4bd254c38057d" ON public.payout_log USING btree ("vendorId");


--
-- Name: IDX_9c02b6502575ee34247d40d921; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_9c02b6502575ee34247d40d921" ON public.branch_expenses USING btree ("branchId", "occurredAt");


--
-- Name: IDX_9d44a0e8ccac73453afa8c5e46; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_9d44a0e8ccac73453afa8c5e46" ON public.pos_register_sessions USING btree ("branchId", "registerId", status);


--
-- Name: IDX_a0f22a89fb3b4fe41eaf0ebbe7; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_a0f22a89fb3b4fe41eaf0ebbe7" ON public.branch_accrued_liabilities USING btree ("branchId", "dueAt");


--
-- Name: IDX_a1a9d071dacb07d74a41cb5820; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_a1a9d071dacb07d74a41cb5820" ON public.notification USING btree ("readAt");


--
-- Name: IDX_a554b4063de337d98a28c992e0; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "IDX_a554b4063de337d98a28c992e0" ON public.retail_tenants USING btree (name);


--
-- Name: IDX_a688c518726bb11c1251312372; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_a688c518726bb11c1251312372" ON public.branch_depreciation_entries USING btree ("fixedAssetId", "occurredAt");


--
-- Name: IDX_ab7cbe7a013ecac5da0a8f8888; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_ab7cbe7a013ecac5da0a8f8888" ON public.notification USING btree ("recipientId");


--
-- Name: IDX_b11a5e627c41d4dc3170f1d370; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_b11a5e627c41d4dc3170f1d370" ON public.notification USING btree ("createdAt");


--
-- Name: IDX_bab95522ec8883854f6a759673; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_bab95522ec8883854f6a759673" ON public.branch_fixed_assets USING btree ("branchId", "acquiredAt");


--
-- Name: IDX_babf0ee265b73126be1a264bb7; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_babf0ee265b73126be1a264bb7" ON public.branch_transfers USING btree ("sourceType", "sourceReferenceId");


--
-- Name: IDX_bacad53672f3408f4cb0de8f52; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "IDX_bacad53672f3408f4cb0de8f52" ON public.tenant_module_entitlements USING btree ("tenantId", module);


--
-- Name: IDX_bb43e8420c1570e668376627b2; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_bb43e8420c1570e668376627b2" ON public.media_cleanup_task USING btree (key);


--
-- Name: IDX_branch_inventory_variant_branch_product; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_branch_inventory_variant_branch_product" ON public.branch_inventory_variant USING btree ("branchId", "productId");


--
-- Name: IDX_branch_inventory_variant_variantId; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_branch_inventory_variant_variantId" ON public.branch_inventory_variant USING btree ("variantId");


--
-- Name: IDX_branch_shift_staff_branchId_userId; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_branch_shift_staff_branchId_userId" ON public.branch_shift_staff USING btree ("branchId", "userId");


--
-- Name: IDX_branch_shift_staff_shiftId; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_branch_shift_staff_shiftId" ON public.branch_shift_staff USING btree ("shiftId");


--
-- Name: IDX_branch_shifts_branchId; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_branch_shifts_branchId" ON public.branch_shifts USING btree ("branchId");


--
-- Name: IDX_c36d64df30e197512ff7603a97; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_c36d64df30e197512ff7603a97" ON public.category USING btree ("sortOrder");


--
-- Name: IDX_c39661bd92dacbabac224130f0; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_c39661bd92dacbabac224130f0" ON public.supplier_staff_assignments USING btree ("userId", "isActive");


--
-- Name: IDX_c4f066c84f239569ee6354509e; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_c4f066c84f239569ee6354509e" ON public.product_image_moderation USING btree ("productImageId");


--
-- Name: IDX_c99eadf16b8a6cc00769387198; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_c99eadf16b8a6cc00769387198" ON public.branch_long_term_debts USING btree ("branchId", "issuedAt");


--
-- Name: IDX_ca8ea1c24f8857a118b05327f3; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_ca8ea1c24f8857a118b05327f3" ON public.product_image_moderation USING btree (status);


--
-- Name: IDX_ce63e4bfcf44d032894e7a23b4; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_ce63e4bfcf44d032894e7a23b4" ON public.equity_partner_bnpl_credit_ledger USING btree ("equityPartnerId", "createdAt");


--
-- Name: IDX_d406e79f652baee05caeaefba5; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_d406e79f652baee05caeaefba5" ON public.branch_accrued_liabilities USING btree ("branchId", "accruedAt");


--
-- Name: IDX_d4172a4992b11a3dd491129cad; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_d4172a4992b11a3dd491129cad" ON public.role_upgrade_request USING btree (user_id);


--
-- Name: IDX_d617ab14956f24a38a528cd393; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_d617ab14956f24a38a528cd393" ON public.branches USING btree ("ownerId", name);


--
-- Name: IDX_e12875dfb3b1d92d7d7c5377e2; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_e12875dfb3b1d92d7d7c5377e2" ON public."user" USING btree (email);


--
-- Name: IDX_e1e8cb6f0c2a0083c6518e67d7; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_e1e8cb6f0c2a0083c6518e67d7" ON public.feed_interactions USING btree (action);


--
-- Name: IDX_e414f3caf08ed431fd43d301bc; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_e414f3caf08ed431fd43d301bc" ON public.flash_sale_products_product USING btree ("flashSaleId");


--
-- Name: IDX_eb715faaf3791dd072797d9b00; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_eb715faaf3791dd072797d9b00" ON public.branch_transfers USING btree (status, "createdAt");


--
-- Name: IDX_ec6727e5793313a73c6ee275db; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_ec6727e5793313a73c6ee275db" ON public.vendor USING btree (registration_country);


--
-- Name: IDX_f0563a56410c194b8d0795acce; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_f0563a56410c194b8d0795acce" ON public.pos_suspended_carts USING btree ("branchId", status, "registerId");


--
-- Name: IDX_f6a81171d7507ff174b7635dbb; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_f6a81171d7507ff174b7635dbb" ON public.equity_partner_bnpl_activations USING btree ("equityPartnerId", status);


--
-- Name: IDX_fcd0b8a01dc1b4b534cf86259b; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "IDX_fcd0b8a01dc1b4b534cf86259b" ON public.pos_checkouts USING btree ("branchId", "externalCheckoutId");


--
-- Name: IDX_gl_journal_entries_branch_occurred; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_gl_journal_entries_branch_occurred" ON public.gl_journal_entries USING btree ("branchId", "occurredAt");


--
-- Name: IDX_gl_journal_lines_branch_account_occurred; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_gl_journal_lines_branch_account_occurred" ON public.gl_journal_lines USING btree ("branchId", "accountCode", "occurredAt");


--
-- Name: IDX_parked_orders_branch_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_parked_orders_branch_status" ON public.parked_orders USING btree ("branchId", status);


--
-- Name: IDX_parked_orders_vendor_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_parked_orders_vendor_status" ON public.parked_orders USING btree ("vendorId", status);


--
-- Name: IDX_pos_suspended_carts_branch_client_ref; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "IDX_pos_suspended_carts_branch_client_ref" ON public.pos_suspended_carts USING btree ("branchId", "clientRef");


--
-- Name: IDX_product_variant_productId; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_product_variant_productId" ON public.product_variant USING btree ("productId");


--
-- Name: UQ_gl_journal_entries_branch_idem; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "UQ_gl_journal_entries_branch_idem" ON public.gl_journal_entries USING btree ("branchId", "idempotencyKey");


--
-- Name: idx_audit_action; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_action ON public.audit_log USING btree (action);


--
-- Name: idx_audit_target_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_target_created ON public.audit_log USING btree ("targetType", "targetId", "createdAt");


--
-- Name: idx_hotel_night_audit_branch_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hotel_night_audit_branch_date ON public.pos_hotel_night_audit_logs USING btree ("branchId", "auditDate");


--
-- Name: idx_pos_hospitality_bill_intervention_branch_action; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pos_hospitality_bill_intervention_branch_action ON public.pos_hospitality_bill_interventions USING btree ("branchId", "actionType");


--
-- Name: idx_pos_hospitality_bill_intervention_branch_priority; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pos_hospitality_bill_intervention_branch_priority ON public.pos_hospitality_bill_interventions USING btree ("branchId", priority);


--
-- Name: idx_pos_hospitality_bill_intervention_branch_updated; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pos_hospitality_bill_intervention_branch_updated ON public.pos_hospitality_bill_interventions USING btree ("branchId", "updatedAt");


--
-- Name: idx_pos_hospitality_idempotency_branch_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pos_hospitality_idempotency_branch_created ON public.pos_hospitality_idempotency_keys USING btree ("branchId", "createdAt");


--
-- Name: idx_pos_hospitality_kitchen_ticket_branch_state; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pos_hospitality_kitchen_ticket_branch_state ON public.pos_hospitality_kitchen_tickets USING btree ("branchId", state);


--
-- Name: idx_pos_hospitality_kitchen_ticket_branch_station; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pos_hospitality_kitchen_ticket_branch_station ON public.pos_hospitality_kitchen_tickets USING btree ("branchId", "stationCode");


--
-- Name: idx_pos_hospitality_kitchen_ticket_branch_updated; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pos_hospitality_kitchen_ticket_branch_updated ON public.pos_hospitality_kitchen_tickets USING btree ("branchId", "updatedAt");


--
-- Name: idx_pos_hospitality_table_board_branch_area; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pos_hospitality_table_board_branch_area ON public.pos_hospitality_table_board USING btree ("branchId", "areaCode");


--
-- Name: idx_pos_hospitality_table_board_branch_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pos_hospitality_table_board_branch_status ON public.pos_hospitality_table_board USING btree ("branchId", status);


--
-- Name: idx_pos_hospitality_table_board_branch_updated; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pos_hospitality_table_board_branch_updated ON public.pos_hospitality_table_board USING btree ("branchId", "updatedAt");


--
-- Name: idx_pos_hotel_folio_branch_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pos_hotel_folio_branch_created ON public.pos_hotel_folios USING btree ("branchId", "createdAt");


--
-- Name: idx_pos_hotel_folio_branch_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pos_hotel_folio_branch_status ON public.pos_hotel_folios USING btree ("branchId", status);


--
-- Name: idx_pos_hotel_folio_charge_branch_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pos_hotel_folio_charge_branch_created ON public.pos_hotel_folio_charges USING btree ("branchId", "createdAt");


--
-- Name: idx_pos_hotel_folio_charge_folio; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pos_hotel_folio_charge_folio ON public.pos_hotel_folio_charges USING btree ("folioId");


--
-- Name: idx_pos_hotel_folios_local_ref; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pos_hotel_folios_local_ref ON public.pos_hotel_folios USING btree ("localRef");


--
-- Name: idx_pos_hotel_rate_plans_branch; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pos_hotel_rate_plans_branch ON public.pos_hotel_rate_plans USING btree ("branchId");


--
-- Name: idx_pos_hotel_res_branch; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pos_hotel_res_branch ON public.pos_hotel_reservations USING btree ("branchId");


--
-- Name: idx_pos_hotel_res_branch_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pos_hotel_res_branch_status ON public.pos_hotel_reservations USING btree ("branchId", status);


--
-- Name: idx_pos_hotel_res_checkin; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pos_hotel_res_checkin ON public.pos_hotel_reservations USING btree ("branchId", "checkInAt");


--
-- Name: idx_pos_hotel_res_customer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pos_hotel_res_customer ON public.pos_hotel_reservations USING btree ("customerUserId") WHERE ("customerUserId" IS NOT NULL);


--
-- Name: idx_pos_hotel_res_source; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pos_hotel_res_source ON public.pos_hotel_reservations USING btree (source);


--
-- Name: idx_pos_hotel_rooms_branch; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pos_hotel_rooms_branch ON public.pos_hotel_rooms USING btree ("branchId");


--
-- Name: idx_pos_kitchen_prod_avail_branch; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pos_kitchen_prod_avail_branch ON public.pos_kitchen_product_availability USING btree ("branchId");


--
-- Name: idx_pos_property_booking_branch_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pos_property_booking_branch_created ON public.pos_property_rental_bookings USING btree ("branchId", "createdAt");


--
-- Name: idx_pos_property_booking_branch_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pos_property_booking_branch_status ON public.pos_property_rental_bookings USING btree ("branchId", status);


--
-- Name: idx_pos_property_booking_local_ref; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pos_property_booking_local_ref ON public.pos_property_rental_bookings USING btree ("localRef");


--
-- Name: idx_pos_property_charge_booking; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pos_property_charge_booking ON public.pos_property_rental_booking_charges USING btree ("bookingId");


--
-- Name: idx_pos_property_charge_branch_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pos_property_charge_branch_created ON public.pos_property_rental_booking_charges USING btree ("branchId", "createdAt");


--
-- Name: idx_pos_property_rate_plan_branch; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pos_property_rate_plan_branch ON public.pos_property_rate_plans USING btree ("branchId");


--
-- Name: idx_pos_property_reservation_branch; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pos_property_reservation_branch ON public.pos_property_reservations USING btree ("branchId");


--
-- Name: idx_pos_property_reservation_branch_start; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pos_property_reservation_branch_start ON public.pos_property_reservations USING btree ("branchId", "leaseStartAt");


--
-- Name: idx_pos_property_reservation_branch_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pos_property_reservation_branch_status ON public.pos_property_reservations USING btree ("branchId", status);


--
-- Name: idx_pos_property_unit_branch_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pos_property_unit_branch_status ON public.pos_property_units USING btree ("branchId", status);


--
-- Name: idx_product_request_buyer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_product_request_buyer ON public.product_request USING btree (buyer_id);


--
-- Name: idx_product_request_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_product_request_category ON public.product_request USING btree (category_id);


--
-- Name: idx_product_request_forward_request; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_product_request_forward_request ON public.product_request_forward USING btree (request_id);


--
-- Name: idx_product_request_forward_vendor; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_product_request_forward_vendor ON public.product_request_forward USING btree (vendor_id);


--
-- Name: idx_product_request_offer_request; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_product_request_offer_request ON public.product_request_offer USING btree (request_id);


--
-- Name: idx_product_request_offer_seller; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_product_request_offer_seller ON public.product_request_offer USING btree (seller_id);


--
-- Name: idx_product_request_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_product_request_status ON public.product_request USING btree (status);


--
-- Name: idx_search_log_query; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_search_log_query ON public.search_log USING btree (query);


--
-- Name: idx_supply_outreach_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_supply_outreach_created ON public.supply_outreach_task USING btree (created_by_admin_id);


--
-- Name: idx_supply_outreach_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_supply_outreach_status ON public.supply_outreach_task USING btree (status);


--
-- Name: idx_user_displayname_trgm; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_displayname_trgm ON public."user" USING gin (lower(("displayName")::text) public.gin_trgm_ops);


--
-- Name: idx_user_email_trgm; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_email_trgm ON public."user" USING gin (lower((email)::text) public.gin_trgm_ops);


--
-- Name: idx_vendor_stores_service_format; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_vendor_stores_service_format ON public.vendor_stores USING btree ("serviceFormat");


--
-- Name: idx_vendor_stores_visible; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_vendor_stores_visible ON public.vendor_stores USING btree ("isConsumerVisible") WHERE ("isConsumerVisible" = true);


--
-- Name: uq_pos_property_charge_booking_idempotency; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_pos_property_charge_booking_idempotency ON public.pos_property_rental_booking_charges USING btree ("bookingId", "idempotencyKey") WHERE ("idempotencyKey" IS NOT NULL);


--
-- Name: uq_pos_property_unit_branch_code; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_pos_property_unit_branch_code ON public.pos_property_units USING btree ("branchId", "propertyCode");


--
-- Name: uq_user_settings_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_user_settings_user_id ON public.user_settings USING btree ("userId");


--
-- Name: wallet_transaction FK_07de5136ba8e92bb97d45b9a7af; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wallet_transaction
    ADD CONSTRAINT "FK_07de5136ba8e92bb97d45b9a7af" FOREIGN KEY ("walletId") REFERENCES public.wallet(id);


--
-- Name: product_aliases FK_0ad8120a1eee419f1fa3a962098; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_aliases
    ADD CONSTRAINT "FK_0ad8120a1eee419f1fa3a962098" FOREIGN KEY ("productId") REFERENCES public.product(id) ON DELETE CASCADE;


--
-- Name: branch_fixed_assets FK_0da08fb5cfac3295236e2f7cf80; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.branch_fixed_assets
    ADD CONSTRAINT "FK_0da08fb5cfac3295236e2f7cf80" FOREIGN KEY ("branchId") REFERENCES public.branches(id) ON DELETE CASCADE;


--
-- Name: product_tags_tag FK_0de90b04710a86601acdff88c21; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_tags_tag
    ADD CONSTRAINT "FK_0de90b04710a86601acdff88c21" FOREIGN KEY ("tagId") REFERENCES public.tag(id);


--
-- Name: purchase_orders FK_12b72a28f5f463833037d9cc54d; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_orders
    ADD CONSTRAINT "FK_12b72a28f5f463833037d9cc54d" FOREIGN KEY ("branchId") REFERENCES public.branches(id) ON DELETE CASCADE;


--
-- Name: review FK_1337f93918c70837d3cea105d39; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.review
    ADD CONSTRAINT "FK_1337f93918c70837d3cea105d39" FOREIGN KEY ("userId") REFERENCES public."user"(id);


--
-- Name: flash_sale_products_product FK_136f0959d2bc4bcc6c4b9abe58b; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.flash_sale_products_product
    ADD CONSTRAINT "FK_136f0959d2bc4bcc6c4b9abe58b" FOREIGN KEY ("productId") REFERENCES public.product(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: user_report FK_142ad20f8e4e5385b548940b62c; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_report
    ADD CONSTRAINT "FK_142ad20f8e4e5385b548940b62c" FOREIGN KEY ("reporterId") REFERENCES public."user"(id);


--
-- Name: product_request FK_14479bb6f8d8353bd23c7170806; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_request
    ADD CONSTRAINT "FK_14479bb6f8d8353bd23c7170806" FOREIGN KEY (category_id) REFERENCES public.category(id);


--
-- Name: branch_transfer_items FK_170590cd4af66540b63c186b458; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.branch_transfer_items
    ADD CONSTRAINT "FK_170590cd4af66540b63c186b458" FOREIGN KEY ("transferId") REFERENCES public.branch_transfers(id) ON DELETE CASCADE;


--
-- Name: order FK_1ad3b78be190313a5d9438961ed; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."order"
    ADD CONSTRAINT "FK_1ad3b78be190313a5d9438961ed" FOREIGN KEY ("delivererId") REFERENCES public."user"(id);


--
-- Name: branch_staff_assignments FK_1b481631e3bc4a0f6f03005ea68; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.branch_staff_assignments
    ADD CONSTRAINT "FK_1b481631e3bc4a0f6f03005ea68" FOREIGN KEY ("branchId") REFERENCES public.branches(id) ON DELETE CASCADE;


--
-- Name: branch_inventory FK_1d365242ee6c0b5d2f162b8658d; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.branch_inventory
    ADD CONSTRAINT "FK_1d365242ee6c0b5d2f162b8658d" FOREIGN KEY ("productId") REFERENCES public.product(id) ON DELETE CASCADE;


--
-- Name: purchase_order_items FK_1de7eb246940b05765d2c99a7ec; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_order_items
    ADD CONSTRAINT "FK_1de7eb246940b05765d2c99a7ec" FOREIGN KEY ("purchaseOrderId") REFERENCES public.purchase_orders(id) ON DELETE CASCADE;


--
-- Name: branch_staff_assignments FK_1e3bd7bee0787837999ae2041c9; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.branch_staff_assignments
    ADD CONSTRAINT "FK_1e3bd7bee0787837999ae2041c9" FOREIGN KEY ("userId") REFERENCES public."user"(id) ON DELETE CASCADE;


--
-- Name: branch_catalog_vendor_links FK_1f359ab97b424732c3685b8706e; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.branch_catalog_vendor_links
    ADD CONSTRAINT "FK_1f359ab97b424732c3685b8706e" FOREIGN KEY ("branchId") REFERENCES public.branches(id) ON DELETE CASCADE;


--
-- Name: seller_workspaces FK_2021d6ed0745494b0f179f5f105; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.seller_workspaces
    ADD CONSTRAINT "FK_2021d6ed0745494b0f179f5f105" FOREIGN KEY ("primaryRetailTenantId") REFERENCES public.retail_tenants(id) ON DELETE SET NULL;


--
-- Name: product_tags_tag FK_208235f4a5c925f11171252b760; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_tags_tag
    ADD CONSTRAINT "FK_208235f4a5c925f11171252b760" FOREIGN KEY ("productId") REFERENCES public.product(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: vendor_staff FK_24188b831449b1a309553b29cd3; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vendor_staff
    ADD CONSTRAINT "FK_24188b831449b1a309553b29cd3" FOREIGN KEY ("vendorId") REFERENCES public."user"(id) ON DELETE CASCADE;


--
-- Name: branch_expenses FK_29586be6896561efdb2c02d4e31; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.branch_expenses
    ADD CONSTRAINT "FK_29586be6896561efdb2c02d4e31" FOREIGN KEY ("branchId") REFERENCES public.branches(id) ON DELETE CASCADE;


--
-- Name: cart_item FK_29e590514f9941296f3a2440d39; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cart_item
    ADD CONSTRAINT "FK_29e590514f9941296f3a2440d39" FOREIGN KEY ("cartId") REFERENCES public.cart(id) ON DELETE CASCADE;


--
-- Name: review FK_2a11d3c0ea1b2b5b1790f762b9a; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.review
    ADD CONSTRAINT "FK_2a11d3c0ea1b2b5b1790f762b9a" FOREIGN KEY ("productId") REFERENCES public.product(id) ON DELETE CASCADE;


--
-- Name: product_aliases FK_2d8f45d2d3286243b2aa8b94cea; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_aliases
    ADD CONSTRAINT "FK_2d8f45d2d3286243b2aa8b94cea" FOREIGN KEY ("branchId") REFERENCES public.branches(id) ON DELETE CASCADE;


--
-- Name: wallet FK_35472b1fe48b6330cd349709564; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wallet
    ADD CONSTRAINT "FK_35472b1fe48b6330cd349709564" FOREIGN KEY ("userId") REFERENCES public."user"(id);


--
-- Name: tenant_module_entitlements FK_36c03f409be334070ce64a5b38b; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenant_module_entitlements
    ADD CONSTRAINT "FK_36c03f409be334070ce64a5b38b" FOREIGN KEY ("tenantId") REFERENCES public.retail_tenants(id) ON DELETE CASCADE;


--
-- Name: pos_sync_jobs FK_3765b382a06cdf45b4b46362855; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_sync_jobs
    ADD CONSTRAINT "FK_3765b382a06cdf45b4b46362855" FOREIGN KEY ("partnerCredentialId") REFERENCES public.partner_credentials(id) ON DELETE SET NULL;


--
-- Name: coupon FK_3bff2b566e664272074503c8ff2; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coupon
    ADD CONSTRAINT "FK_3bff2b566e664272074503c8ff2" FOREIGN KEY ("vendorId") REFERENCES public."user"(id);


--
-- Name: tenant_subscriptions FK_3c22dd60cf0850aa8ad2e300f12; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenant_subscriptions
    ADD CONSTRAINT "FK_3c22dd60cf0850aa8ad2e300f12" FOREIGN KEY ("tenantId") REFERENCES public.retail_tenants(id) ON DELETE CASCADE;


--
-- Name: equity_payouts FK_3c32fa07451d740abb6c97c1234; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.equity_payouts
    ADD CONSTRAINT "FK_3c32fa07451d740abb6c97c1234" FOREIGN KEY ("branchId") REFERENCES public.branches(id) ON DELETE CASCADE;


--
-- Name: equity_partner_bnpl_credit_ledger FK_3c971f1f35fc0d2eb0bc0cde68e; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.equity_partner_bnpl_credit_ledger
    ADD CONSTRAINT "FK_3c971f1f35fc0d2eb0bc0cde68e" FOREIGN KEY ("equityPartnerId") REFERENCES public.equity_partners(id) ON DELETE CASCADE;


--
-- Name: branch_transfer_items FK_3ccd0cc3805ce4082c1e9c70884; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.branch_transfer_items
    ADD CONSTRAINT "FK_3ccd0cc3805ce4082c1e9c70884" FOREIGN KEY ("productId") REFERENCES public.product(id) ON DELETE CASCADE;


--
-- Name: stock_movements FK_3dbc4d2ce7b9eecc9f284b925cd; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_movements
    ADD CONSTRAINT "FK_3dbc4d2ce7b9eecc9f284b925cd" FOREIGN KEY ("branchId") REFERENCES public.branches(id) ON DELETE CASCADE;


--
-- Name: order FK_4020094daa7f815537f5942b9fb; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."order"
    ADD CONSTRAINT "FK_4020094daa7f815537f5942b9fb" FOREIGN KEY ("fulfillmentBranchId") REFERENCES public.branches(id) ON DELETE SET NULL;


--
-- Name: credit_limit FK_40a9f1b2ed2a0b6025cedb5a923; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.credit_limit
    ADD CONSTRAINT "FK_40a9f1b2ed2a0b6025cedb5a923" FOREIGN KEY ("userId") REFERENCES public."user"(id);


--
-- Name: product_image FK_40ca0cd115ef1ff35351bed8da2; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_image
    ADD CONSTRAINT "FK_40ca0cd115ef1ff35351bed8da2" FOREIGN KEY ("productId") REFERENCES public.product(id) ON DELETE CASCADE;


--
-- Name: purchase_orders FK_4147a38c20b3da03531e548cb7f; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_orders
    ADD CONSTRAINT "FK_4147a38c20b3da03531e548cb7f" FOREIGN KEY ("supplierProfileId") REFERENCES public.supplier_profiles(id) ON DELETE CASCADE;


--
-- Name: equity_payouts FK_4612bca8603c1cd918c3c8efcb5; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.equity_payouts
    ADD CONSTRAINT "FK_4612bca8603c1cd918c3c8efcb5" FOREIGN KEY ("equityPartnerId") REFERENCES public.equity_partners(id) ON DELETE CASCADE;


--
-- Name: subscription_request FK_4793d9b49ec86c4f1140c3dcaa6; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscription_request
    ADD CONSTRAINT "FK_4793d9b49ec86c4f1140c3dcaa6" FOREIGN KEY ("userId") REFERENCES public."user"(id);


--
-- Name: product_request_offer FK_49da389463329c7f5adb3b86ad1; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_request_offer
    ADD CONSTRAINT "FK_49da389463329c7f5adb3b86ad1" FOREIGN KEY (seller_id) REFERENCES public."user"(id);


--
-- Name: category_closure FK_4aa1348fc4b7da9bef0fae8ff48; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.category_closure
    ADD CONSTRAINT "FK_4aa1348fc4b7da9bef0fae8ff48" FOREIGN KEY (id_ancestor) REFERENCES public.category(id) ON DELETE CASCADE;


--
-- Name: conversation FK_4ca3d8a73b4ef8519ff4c3de8a7; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation
    ADD CONSTRAINT "FK_4ca3d8a73b4ef8519ff4c3de8a7" FOREIGN KEY ("buyerId") REFERENCES public."user"(id);


--
-- Name: product_request_offer FK_4cd69dfd1026c5278af48276d45; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_request_offer
    ADD CONSTRAINT "FK_4cd69dfd1026c5278af48276d45" FOREIGN KEY (product_id) REFERENCES public.product(id);


--
-- Name: branch_catalog_vendor_links FK_4f43edc09774322f064efed1d00; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.branch_catalog_vendor_links
    ADD CONSTRAINT "FK_4f43edc09774322f064efed1d00" FOREIGN KEY ("vendorId") REFERENCES public."user"(id) ON DELETE CASCADE;


--
-- Name: conversation FK_50b0d958b00eb89e45af69c6a58; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation
    ADD CONSTRAINT "FK_50b0d958b00eb89e45af69c6a58" FOREIGN KEY ("orderId") REFERENCES public."order"(id);


--
-- Name: product_impression FK_5745616022b9f0348088098f646; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_impression
    ADD CONSTRAINT "FK_5745616022b9f0348088098f646" FOREIGN KEY ("userId") REFERENCES public."user"(id) ON DELETE SET NULL;


--
-- Name: branch_inventory FK_58844b23b9aefcb7ec2bc2863dc; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.branch_inventory
    ADD CONSTRAINT "FK_58844b23b9aefcb7ec2bc2863dc" FOREIGN KEY ("branchId") REFERENCES public.branches(id) ON DELETE CASCADE;


--
-- Name: user_report FK_58bbb26043e19510876a5793900; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_report
    ADD CONSTRAINT "FK_58bbb26043e19510876a5793900" FOREIGN KEY ("productId") REFERENCES public.product(id) ON DELETE CASCADE;


--
-- Name: vendor_staff FK_5a339956225e3f8596da687389d; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vendor_staff
    ADD CONSTRAINT "FK_5a339956225e3f8596da687389d" FOREIGN KEY ("memberId") REFERENCES public."user"(id) ON DELETE CASCADE;


--
-- Name: branches FK_5c74f7b0f478f641c1ab712ee4c; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.branches
    ADD CONSTRAINT "FK_5c74f7b0f478f641c1ab712ee4c" FOREIGN KEY ("retailTenantId") REFERENCES public.retail_tenants(id) ON DELETE SET NULL;


--
-- Name: procurement_webhook_subscriptions FK_6029b6538f56fc3eeaa99f5ef83; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.procurement_webhook_subscriptions
    ADD CONSTRAINT "FK_6029b6538f56fc3eeaa99f5ef83" FOREIGN KEY ("branchId") REFERENCES public.branches(id) ON DELETE CASCADE;


--
-- Name: order_item FK_646bf9ece6f45dbe41c203e06e0; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_item
    ADD CONSTRAINT "FK_646bf9ece6f45dbe41c203e06e0" FOREIGN KEY ("orderId") REFERENCES public."order"(id) ON DELETE CASCADE;


--
-- Name: product_aliases FK_6863b7bfc0e657c604abdddbdfb; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_aliases
    ADD CONSTRAINT "FK_6863b7bfc0e657c604abdddbdfb" FOREIGN KEY ("partnerCredentialId") REFERENCES public.partner_credentials(id) ON DELETE CASCADE;


--
-- Name: pos_checkouts FK_698b61ef473869e987bb5b59240; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_checkouts
    ADD CONSTRAINT "FK_698b61ef473869e987bb5b59240" FOREIGN KEY ("suspendedCartId") REFERENCES public.pos_suspended_carts(id) ON DELETE SET NULL;


--
-- Name: equity_partner_bnpl_activations FK_6a19bd5492bd18deda67d9481ad; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.equity_partner_bnpl_activations
    ADD CONSTRAINT "FK_6a19bd5492bd18deda67d9481ad" FOREIGN KEY ("equityPartnerId") REFERENCES public.equity_partners(id) ON DELETE CASCADE;


--
-- Name: category_closure FK_6a22002acac4976977b1efd114a; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.category_closure
    ADD CONSTRAINT "FK_6a22002acac4976977b1efd114a" FOREIGN KEY (id_descendant) REFERENCES public.category(id) ON DELETE CASCADE;


--
-- Name: procurement_webhook_subscriptions FK_6bebca282a2c24976ea6da110f2; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.procurement_webhook_subscriptions
    ADD CONSTRAINT "FK_6bebca282a2c24976ea6da110f2" FOREIGN KEY ("supplierProfileId") REFERENCES public.supplier_profiles(id) ON DELETE CASCADE;


--
-- Name: supplier_staff_assignments FK_6d8173aa1c9936c708edd42ed9c; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplier_staff_assignments
    ADD CONSTRAINT "FK_6d8173aa1c9936c708edd42ed9c" FOREIGN KEY ("userId") REFERENCES public."user"(id) ON DELETE CASCADE;


--
-- Name: seller_workspaces FK_6e619fac9bd0facfc6ebef26612; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.seller_workspaces
    ADD CONSTRAINT "FK_6e619fac9bd0facfc6ebef26612" FOREIGN KEY ("primaryVendorId") REFERENCES public."user"(id) ON DELETE SET NULL;


--
-- Name: product_image_moderation FK_6f80b52f0b383fef795f3543715; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_image_moderation
    ADD CONSTRAINT "FK_6f80b52f0b383fef795f3543715" FOREIGN KEY ("productId") REFERENCES public.product(id) ON DELETE CASCADE;


--
-- Name: product_request FK_6f91af727460788bc1865436006; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_request
    ADD CONSTRAINT "FK_6f91af727460788bc1865436006" FOREIGN KEY (buyer_id) REFERENCES public."user"(id);


--
-- Name: branch_long_term_debts FK_731f494ea81ff4f3cc9f33f36e4; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.branch_long_term_debts
    ADD CONSTRAINT "FK_731f494ea81ff4f3cc9f33f36e4" FOREIGN KEY ("branchId") REFERENCES public.branches(id) ON DELETE CASCADE;


--
-- Name: credit_transaction FK_735b0e9a9ac973240dc55114c38; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.credit_transaction
    ADD CONSTRAINT "FK_735b0e9a9ac973240dc55114c38" FOREIGN KEY ("userId") REFERENCES public."user"(id);


--
-- Name: cart FK_756f53ab9466eb52a52619ee019; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cart
    ADD CONSTRAINT "FK_756f53ab9466eb52a52619ee019" FOREIGN KEY ("userId") REFERENCES public."user"(id) ON DELETE CASCADE;


--
-- Name: cart_item FK_75db0de134fe0f9fe9e4591b7bf; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cart_item
    ADD CONSTRAINT "FK_75db0de134fe0f9fe9e4591b7bf" FOREIGN KEY ("productId") REFERENCES public.product(id) ON DELETE CASCADE;


--
-- Name: branch_accrued_liabilities FK_75f828b646edd676f066e85652e; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.branch_accrued_liabilities
    ADD CONSTRAINT "FK_75f828b646edd676f066e85652e" FOREIGN KEY ("branchId") REFERENCES public.branches(id) ON DELETE CASCADE;


--
-- Name: equity_split_assignments FK_769c01c8384e31124de6ab1b87d; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.equity_split_assignments
    ADD CONSTRAINT "FK_769c01c8384e31124de6ab1b87d" FOREIGN KEY ("branchId") REFERENCES public.branches(id) ON DELETE CASCADE;


--
-- Name: withdrawals FK_79a3949e02a4652fb2b2a0ccd4e; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.withdrawals
    ADD CONSTRAINT "FK_79a3949e02a4652fb2b2a0ccd4e" FOREIGN KEY ("userId") REFERENCES public."user"(id);


--
-- Name: product_image_moderation FK_79b0b7720c6f66d0007af175dc6; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_image_moderation
    ADD CONSTRAINT "FK_79b0b7720c6f66d0007af175dc6" FOREIGN KEY ("imageId") REFERENCES public.product_image(id) ON DELETE CASCADE;


--
-- Name: product_request_forward FK_7bacb53052dcc2e7dd30039939e; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_request_forward
    ADD CONSTRAINT "FK_7bacb53052dcc2e7dd30039939e" FOREIGN KEY (request_id) REFERENCES public.product_request(id) ON DELETE CASCADE;


--
-- Name: message FK_7cf4a4df1f2627f72bf6231635f; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.message
    ADD CONSTRAINT "FK_7cf4a4df1f2627f72bf6231635f" FOREIGN KEY ("conversationId") REFERENCES public.conversation(id) ON DELETE CASCADE;


--
-- Name: pos_suspended_carts FK_7e2c0c1b8d8f41fa18e23a2c26f; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_suspended_carts
    ADD CONSTRAINT "FK_7e2c0c1b8d8f41fa18e23a2c26f" FOREIGN KEY ("branchId") REFERENCES public.branches(id) ON DELETE CASCADE;


--
-- Name: seller_workspaces FK_8464ca6087a262eee6ff2c1548d; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.seller_workspaces
    ADD CONSTRAINT "FK_8464ca6087a262eee6ff2c1548d" FOREIGN KEY ("ownerUserId") REFERENCES public."user"(id) ON DELETE CASCADE;


--
-- Name: conversation FK_85c39e2d694cd46df2c78576072; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation
    ADD CONSTRAINT "FK_85c39e2d694cd46df2c78576072" FOREIGN KEY ("productId") REFERENCES public.product(id);


--
-- Name: supply_outreach_task FK_86609be9c48729b985962171667; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supply_outreach_task
    ADD CONSTRAINT "FK_86609be9c48729b985962171667" FOREIGN KEY (assigned_vendor_id) REFERENCES public."user"(id);


--
-- Name: equity_partner_bnpl_credit_ledger FK_87c9326146ef9829f470ac23ee1; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.equity_partner_bnpl_credit_ledger
    ADD CONSTRAINT "FK_87c9326146ef9829f470ac23ee1" FOREIGN KEY ("bnplActivationId") REFERENCES public.equity_partner_bnpl_activations(id) ON DELETE CASCADE;


--
-- Name: branch_staff_invites FK_8832f49eace63ea25fcedd0c3d1; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.branch_staff_invites
    ADD CONSTRAINT "FK_8832f49eace63ea25fcedd0c3d1" FOREIGN KEY ("invitedByUserId") REFERENCES public."user"(id) ON DELETE SET NULL;


--
-- Name: branch_catalog_product_links FK_88fc82bf44ae3c72b30de523998; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.branch_catalog_product_links
    ADD CONSTRAINT "FK_88fc82bf44ae3c72b30de523998" FOREIGN KEY ("productId") REFERENCES public.product(id) ON DELETE CASCADE;


--
-- Name: branches FK_8c6ae9f9c654c4fac71bccbb7ed; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.branches
    ADD CONSTRAINT "FK_8c6ae9f9c654c4fac71bccbb7ed" FOREIGN KEY ("ownerId") REFERENCES public."user"(id) ON DELETE SET NULL;


--
-- Name: product_image_moderation FK_8f2d4f2ad0887eb7d4d716b8992; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_image_moderation
    ADD CONSTRAINT "FK_8f2d4f2ad0887eb7d4d716b8992" FOREIGN KEY ("reviewedById") REFERENCES public."user"(id);


--
-- Name: order_item FK_904370c093ceea4369659a3c810; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_item
    ADD CONSTRAINT "FK_904370c093ceea4369659a3c810" FOREIGN KEY ("productId") REFERENCES public.product(id);


--
-- Name: pos_register_sessions FK_91dd151669ea36faf7682c635e9; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_register_sessions
    ADD CONSTRAINT "FK_91dd151669ea36faf7682c635e9" FOREIGN KEY ("branchId") REFERENCES public.branches(id) ON DELETE CASCADE;


--
-- Name: product FK_921582066aa70b502e78ea92012; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product
    ADD CONSTRAINT "FK_921582066aa70b502e78ea92012" FOREIGN KEY ("vendorId") REFERENCES public."user"(id);


--
-- Name: user_settings FK_986a2b6d3c05eb4091bb8066f78; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_settings
    ADD CONSTRAINT "FK_986a2b6d3c05eb4091bb8066f78" FOREIGN KEY ("userId") REFERENCES public."user"(id) ON DELETE CASCADE;


--
-- Name: purchase_order_items FK_9931be14d98efa8a026e4786f02; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_order_items
    ADD CONSTRAINT "FK_9931be14d98efa8a026e4786f02" FOREIGN KEY ("supplierOfferId") REFERENCES public.supplier_offers(id) ON DELETE SET NULL;


--
-- Name: pos_sync_jobs FK_9a179a9c11263a508245d6d0de9; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_sync_jobs
    ADD CONSTRAINT "FK_9a179a9c11263a508245d6d0de9" FOREIGN KEY ("branchId") REFERENCES public.branches(id) ON DELETE SET NULL;


--
-- Name: payout_log FK_9af208dc3f34e4bd254c38057d8; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payout_log
    ADD CONSTRAINT "FK_9af208dc3f34e4bd254c38057d8" FOREIGN KEY ("vendorId") REFERENCES public."user"(id);


--
-- Name: branch_catalog_product_links FK_9ca670427c6369703e7d84e2a56; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.branch_catalog_product_links
    ADD CONSTRAINT "FK_9ca670427c6369703e7d84e2a56" FOREIGN KEY ("branchId") REFERENCES public.branches(id) ON DELETE CASCADE;


--
-- Name: pos_checkouts FK_9ce337b99164eafe87a71c3cc7d; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_checkouts
    ADD CONSTRAINT "FK_9ce337b99164eafe87a71c3cc7d" FOREIGN KEY ("registerSessionId") REFERENCES public.pos_register_sessions(id) ON DELETE SET NULL;


--
-- Name: stock_movements FK_a3acb59db67e977be45e382fc56; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_movements
    ADD CONSTRAINT "FK_a3acb59db67e977be45e382fc56" FOREIGN KEY ("productId") REFERENCES public.product(id) ON DELETE CASCADE;


--
-- Name: conversation FK_a9d6f5e62c7f7d560b0d10e31f0; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation
    ADD CONSTRAINT "FK_a9d6f5e62c7f7d560b0d10e31f0" FOREIGN KEY ("delivererId") REFERENCES public."user"(id);


--
-- Name: notification FK_ab7cbe7a013ecac5da0a8f88884; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification
    ADD CONSTRAINT "FK_ab7cbe7a013ecac5da0a8f88884" FOREIGN KEY ("recipientId") REFERENCES public."user"(id) ON DELETE CASCADE;


--
-- Name: withdrawal FK_b0e331b589a5c8a8ef5c5fd864c; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.withdrawal
    ADD CONSTRAINT "FK_b0e331b589a5c8a8ef5c5fd864c" FOREIGN KEY ("vendorId") REFERENCES public."user"(id);


--
-- Name: conversation FK_b13072faa2e7e7e6c2674066277; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation
    ADD CONSTRAINT "FK_b13072faa2e7e7e6c2674066277" FOREIGN KEY ("vendorId") REFERENCES public."user"(id);


--
-- Name: product_aliases FK_b216cb99cc4ddbc3e675d7b377f; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_aliases
    ADD CONSTRAINT "FK_b216cb99cc4ddbc3e675d7b377f" FOREIGN KEY ("tenantId") REFERENCES public.retail_tenants(id) ON DELETE CASCADE;


--
-- Name: supplier_staff_assignments FK_b3cc806251a70214e1ee849affa; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplier_staff_assignments
    ADD CONSTRAINT "FK_b3cc806251a70214e1ee849affa" FOREIGN KEY ("supplierProfileId") REFERENCES public.supplier_profiles(id) ON DELETE CASCADE;


--
-- Name: pos_checkouts FK_b3ce5e40841a0473ead42dc1289; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_checkouts
    ADD CONSTRAINT "FK_b3ce5e40841a0473ead42dc1289" FOREIGN KEY ("branchId") REFERENCES public.branches(id) ON DELETE CASCADE;


--
-- Name: branch_depreciation_entries FK_b503d4b32248d8f56a44fe2c8d3; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.branch_depreciation_entries
    ADD CONSTRAINT "FK_b503d4b32248d8f56a44fe2c8d3" FOREIGN KEY ("branchId") REFERENCES public.branches(id) ON DELETE CASCADE;


--
-- Name: dispute FK_b692f52ca0593aa85f1026ca220; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dispute
    ADD CONSTRAINT "FK_b692f52ca0593aa85f1026ca220" FOREIGN KEY ("orderId") REFERENCES public."order"(id);


--
-- Name: branch_staff_invites FK_b9f2545f923fc0a84183ca52f90; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.branch_staff_invites
    ADD CONSTRAINT "FK_b9f2545f923fc0a84183ca52f90" FOREIGN KEY ("acceptedByUserId") REFERENCES public."user"(id) ON DELETE SET NULL;


--
-- Name: message FK_bc096b4e18b1f9508197cd98066; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.message
    ADD CONSTRAINT "FK_bc096b4e18b1f9508197cd98066" FOREIGN KEY ("senderId") REFERENCES public."user"(id);


--
-- Name: branch_inventory_variant FK_branch_inventory_variant_branch; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.branch_inventory_variant
    ADD CONSTRAINT "FK_branch_inventory_variant_branch" FOREIGN KEY ("branchId") REFERENCES public.branches(id) ON DELETE CASCADE;


--
-- Name: branch_inventory_variant FK_branch_inventory_variant_variant; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.branch_inventory_variant
    ADD CONSTRAINT "FK_branch_inventory_variant_variant" FOREIGN KEY ("variantId") REFERENCES public.product_variant(id) ON DELETE CASCADE;


--
-- Name: branch_shift_staff FK_branch_shift_staff_shift; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.branch_shift_staff
    ADD CONSTRAINT "FK_branch_shift_staff_shift" FOREIGN KEY ("shiftId") REFERENCES public.branch_shifts(id) ON DELETE CASCADE;


--
-- Name: branch_shift_staff FK_branch_shift_staff_user; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.branch_shift_staff
    ADD CONSTRAINT "FK_branch_shift_staff_user" FOREIGN KEY ("userId") REFERENCES public."user"(id) ON DELETE CASCADE;


--
-- Name: branch_shifts FK_branch_shifts_branch; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.branch_shifts
    ADD CONSTRAINT "FK_branch_shifts_branch" FOREIGN KEY ("branchId") REFERENCES public.branches(id) ON DELETE CASCADE;


--
-- Name: branches FK_branches_vendor_store; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.branches
    ADD CONSTRAINT "FK_branches_vendor_store" FOREIGN KEY ("vendorStoreId") REFERENCES public.vendor_stores(id) ON DELETE SET NULL NOT VALID;


--
-- Name: supplier_profiles FK_c4672fda409a2c70ecccbdf929b; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplier_profiles
    ADD CONSTRAINT "FK_c4672fda409a2c70ecccbdf929b" FOREIGN KEY ("userId") REFERENCES public."user"(id) ON DELETE CASCADE;


--
-- Name: equity_split_assignments FK_c726b87aa54a0875deb1d784930; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.equity_split_assignments
    ADD CONSTRAINT "FK_c726b87aa54a0875deb1d784930" FOREIGN KEY ("retailTenantId") REFERENCES public.retail_tenants(id) ON DELETE SET NULL;


--
-- Name: branch_transfers FK_c8274ec0511e5fb473e38308cf4; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.branch_transfers
    ADD CONSTRAINT "FK_c8274ec0511e5fb473e38308cf4" FOREIGN KEY ("toBranchId") REFERENCES public.branches(id) ON DELETE CASCADE;


--
-- Name: branch_transfers FK_ca007b907b741f39e3a74ccd1cd; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.branch_transfers
    ADD CONSTRAINT "FK_ca007b907b741f39e3a74ccd1cd" FOREIGN KEY ("fromBranchId") REFERENCES public.branches(id) ON DELETE CASCADE;


--
-- Name: product_request_forward FK_ca8fb0a3eb91ec901d5997497b4; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_request_forward
    ADD CONSTRAINT "FK_ca8fb0a3eb91ec901d5997497b4" FOREIGN KEY (vendor_id) REFERENCES public."user"(id);


--
-- Name: order FK_caabe91507b3379c7ba73637b84; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."order"
    ADD CONSTRAINT "FK_caabe91507b3379c7ba73637b84" FOREIGN KEY ("userId") REFERENCES public."user"(id);


--
-- Name: procurement_webhook_deliveries FK_cfd3c686e8a28407ea6f1b2de46; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.procurement_webhook_deliveries
    ADD CONSTRAINT "FK_cfd3c686e8a28407ea6f1b2de46" FOREIGN KEY ("subscriptionId") REFERENCES public.procurement_webhook_subscriptions(id) ON DELETE CASCADE;


--
-- Name: product_request_offer FK_d083a7dc1e478f85c2898f20b09; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_request_offer
    ADD CONSTRAINT "FK_d083a7dc1e478f85c2898f20b09" FOREIGN KEY (request_id) REFERENCES public.product_request(id) ON DELETE CASCADE;


--
-- Name: role_upgrade_request FK_d4172a4992b11a3dd491129cadb; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.role_upgrade_request
    ADD CONSTRAINT "FK_d4172a4992b11a3dd491129cadb" FOREIGN KEY (user_id) REFERENCES public."user"(id) ON DELETE CASCADE;


--
-- Name: supplier_offers FK_d448e03cdb56e867e3f5aea33a3; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplier_offers
    ADD CONSTRAINT "FK_d448e03cdb56e867e3f5aea33a3" FOREIGN KEY ("supplierProfileId") REFERENCES public.supplier_profiles(id) ON DELETE CASCADE;


--
-- Name: category FK_d5456fd7e4c4866fec8ada1fa10; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.category
    ADD CONSTRAINT "FK_d5456fd7e4c4866fec8ada1fa10" FOREIGN KEY ("parentId") REFERENCES public.category(id);


--
-- Name: top_up_request FK_d720160633c094e8073b383f934; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.top_up_request
    ADD CONSTRAINT "FK_d720160633c094e8073b383f934" FOREIGN KEY ("userId") REFERENCES public."user"(id);


--
-- Name: retail_tenants FK_d9de058a9950408a3a490fc000e; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retail_tenants
    ADD CONSTRAINT "FK_d9de058a9950408a3a490fc000e" FOREIGN KEY ("ownerUserId") REFERENCES public."user"(id) ON DELETE SET NULL;


--
-- Name: settlement FK_da5b3eee6e58e7dd073fa2697e4; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.settlement
    ADD CONSTRAINT "FK_da5b3eee6e58e7dd073fa2697e4" FOREIGN KEY ("vendorId") REFERENCES public."user"(id);


--
-- Name: branch_staff_invites FK_ddfaa958a2405605bf26ee40e6f; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.branch_staff_invites
    ADD CONSTRAINT "FK_ddfaa958a2405605bf26ee40e6f" FOREIGN KEY ("branchId") REFERENCES public.branches(id) ON DELETE CASCADE;


--
-- Name: pos_checkouts FK_e0780f5f56813ffe5b86caaeaf7; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_checkouts
    ADD CONSTRAINT "FK_e0780f5f56813ffe5b86caaeaf7" FOREIGN KEY ("partnerCredentialId") REFERENCES public.partner_credentials(id) ON DELETE SET NULL;


--
-- Name: supplier_offers FK_e2feb8d98097f3acbe7d76c8213; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplier_offers
    ADD CONSTRAINT "FK_e2feb8d98097f3acbe7d76c8213" FOREIGN KEY ("productId") REFERENCES public.product(id) ON DELETE CASCADE;


--
-- Name: flash_sale_products_product FK_e414f3caf08ed431fd43d301bcf; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.flash_sale_products_product
    ADD CONSTRAINT "FK_e414f3caf08ed431fd43d301bcf" FOREIGN KEY ("flashSaleId") REFERENCES public.flash_sale(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: branch_depreciation_entries FK_e9846d98f009337fe2152bb67c8; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.branch_depreciation_entries
    ADD CONSTRAINT "FK_e9846d98f009337fe2152bb67c8" FOREIGN KEY ("fixedAssetId") REFERENCES public.branch_fixed_assets(id) ON DELETE CASCADE;


--
-- Name: equity_partners FK_e98b5b2b09ff90133b6b1c32218; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.equity_partners
    ADD CONSTRAINT "FK_e98b5b2b09ff90133b6b1c32218" FOREIGN KEY ("userId") REFERENCES public."user"(id) ON DELETE SET NULL;


--
-- Name: supply_outreach_task FK_ea772dc1de92daa6af0861b33f3; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supply_outreach_task
    ADD CONSTRAINT "FK_ea772dc1de92daa6af0861b33f3" FOREIGN KEY (created_by_admin_id) REFERENCES public."user"(id);


--
-- Name: product_request_forward FK_ec6d01fa9ffecaab138fd35e7d2; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_request_forward
    ADD CONSTRAINT "FK_ec6d01fa9ffecaab138fd35e7d2" FOREIGN KEY (forwarded_by_admin_id) REFERENCES public."user"(id);


--
-- Name: purchase_order_receipt_events FK_f34c1967bcb65c5506d03e9faef; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_order_receipt_events
    ADD CONSTRAINT "FK_f34c1967bcb65c5506d03e9faef" FOREIGN KEY ("purchaseOrderId") REFERENCES public.purchase_orders(id) ON DELETE CASCADE;


--
-- Name: partner_credentials FK_f62b78aae81f21e2e9fdb742399; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.partner_credentials
    ADD CONSTRAINT "FK_f62b78aae81f21e2e9fdb742399" FOREIGN KEY ("branchId") REFERENCES public.branches(id) ON DELETE SET NULL;


--
-- Name: pos_suspended_carts FK_f6b6c67bbed49c67d61f9859fee; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_suspended_carts
    ADD CONSTRAINT "FK_f6b6c67bbed49c67d61f9859fee" FOREIGN KEY ("registerSessionId") REFERENCES public.pos_register_sessions(id) ON DELETE SET NULL;


--
-- Name: purchase_order_items FK_f87b1b82a3aff16d1cb5e49a656; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_order_items
    ADD CONSTRAINT "FK_f87b1b82a3aff16d1cb5e49a656" FOREIGN KEY ("productId") REFERENCES public.product(id) ON DELETE CASCADE;


--
-- Name: product_request FK_fefa5c052b2c4a2372af60b7d63; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_request
    ADD CONSTRAINT "FK_fefa5c052b2c4a2372af60b7d63" FOREIGN KEY (accepted_offer_id) REFERENCES public.product_request_offer(id);


--
-- Name: product FK_ff0c0301a95e517153df97f6812; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product
    ADD CONSTRAINT "FK_ff0c0301a95e517153df97f6812" FOREIGN KEY ("categoryId") REFERENCES public.category(id);


--
-- Name: equity_split_assignments FK_ff637ffa14ea2df7c0c30124e92; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.equity_split_assignments
    ADD CONSTRAINT "FK_ff637ffa14ea2df7c0c30124e92" FOREIGN KEY ("equityPartnerId") REFERENCES public.equity_partners(id) ON DELETE CASCADE;


--
-- Name: gl_journal_lines FK_gl_journal_lines_account; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gl_journal_lines
    ADD CONSTRAINT "FK_gl_journal_lines_account" FOREIGN KEY ("accountCode") REFERENCES public.gl_accounts(code);


--
-- Name: gl_journal_lines FK_gl_journal_lines_entry; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gl_journal_lines
    ADD CONSTRAINT "FK_gl_journal_lines_entry" FOREIGN KEY ("entryId") REFERENCES public.gl_journal_entries(id) ON DELETE CASCADE;


--
-- Name: pos_property_rental_booking_charges FK_pos_property_rental_booking_charges_booking; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_property_rental_booking_charges
    ADD CONSTRAINT "FK_pos_property_rental_booking_charges_booking" FOREIGN KEY ("bookingId") REFERENCES public.pos_property_rental_bookings(id) ON DELETE CASCADE;


--
-- Name: product_variant FK_product_variant_product; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_variant
    ADD CONSTRAINT "FK_product_variant_product" FOREIGN KEY ("productId") REFERENCES public.product(id) ON DELETE CASCADE;


--
-- Name: product FK_product_vendor_store; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product
    ADD CONSTRAINT "FK_product_vendor_store" FOREIGN KEY (vendor_store_id) REFERENCES public.vendor_stores(id) ON DELETE SET NULL NOT VALID;


--
-- Name: vendor_stores FK_vendor_stores_branch; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vendor_stores
    ADD CONSTRAINT "FK_vendor_stores_branch" FOREIGN KEY ("branchId") REFERENCES public.branches(id) ON DELETE SET NULL;


--
-- Name: vendor_stores FK_vendor_stores_owner; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vendor_stores
    ADD CONSTRAINT "FK_vendor_stores_owner" FOREIGN KEY ("ownerUserId") REFERENCES public."user"(id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

\unrestrict 1iMxfKKofCj9gtHAmOQt8jEftWmUtgbb1jqivsRWTIdO1bmcBVRSxtqq1DMRBqS

