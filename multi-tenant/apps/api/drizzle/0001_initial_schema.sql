CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid,
	"branch_id" uuid,
	"actor_type" text NOT NULL,
	"actor_user_id" uuid,
	"actor_membership_id" uuid,
	"support_session_id" uuid,
	"action" text NOT NULL,
	"resource_type" text NOT NULL,
	"resource_id" uuid,
	"changes" jsonb,
	"metadata" jsonb,
	"ip" "inet",
	"user_agent" text,
	"request_id" text,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "audit_logs_actor_type_ck" CHECK ("actor_type" IN ('user', 'system', 'support', 'webhook'))
);
--> statement-breakpoint
CREATE TABLE "branches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"city" text,
	"district" text,
	"address" text,
	"phone" text,
	"email" "citext",
	"is_headquarters" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "branches_org_id_uq" UNIQUE("organization_id","id"),
	CONSTRAINT "branches_org_code_uq" UNIQUE("organization_id","code"),
	CONSTRAINT "branches_status_ck" CHECK ("status" IN ('active', 'inactive'))
);
--> statement-breakpoint
CREATE TABLE "document_sequences" (
	"organization_id" uuid NOT NULL,
	"sequence_key" text NOT NULL,
	"period" text DEFAULT '' NOT NULL,
	"next_value" integer NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "document_sequences_pk" PRIMARY KEY("organization_id","sequence_key","period"),
	CONSTRAINT "document_sequences_next_value_ck" CHECK (next_value > 0)
);
--> statement-breakpoint
CREATE TABLE "invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"membership_id" uuid NOT NULL,
	"email" "citext" NOT NULL,
	"token_hash" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"invited_by_membership_id" uuid,
	"accepted_at" timestamp with time zone,
	"last_sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	"send_count" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invitations_org_id_uq" UNIQUE("organization_id","id"),
	CONSTRAINT "invitations_status_ck" CHECK ("status" IN ('pending', 'accepted', 'revoked', 'expired'))
);
--> statement-breakpoint
CREATE TABLE "membership_branches" (
	"organization_id" uuid NOT NULL,
	"membership_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "membership_branches_pk" PRIMARY KEY("membership_id","branch_id")
);
--> statement-breakpoint
CREATE TABLE "membership_roles" (
	"organization_id" uuid NOT NULL,
	"membership_id" uuid NOT NULL,
	"role_id" uuid NOT NULL,
	"assigned_by_membership_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "membership_roles_pk" PRIMARY KEY("membership_id","role_id")
);
--> statement-breakpoint
CREATE TABLE "memberships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"status" text DEFAULT 'invited' NOT NULL,
	"all_branches" boolean DEFAULT false NOT NULL,
	"title" text,
	"authz_version" integer DEFAULT 1 NOT NULL,
	"invited_by_membership_id" uuid,
	"invited_at" timestamp with time zone,
	"joined_at" timestamp with time zone,
	"suspended_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "memberships_org_id_uq" UNIQUE("organization_id","id"),
	CONSTRAINT "memberships_org_user_uq" UNIQUE("organization_id","user_id"),
	CONSTRAINT "memberships_status_ck" CHECK ("status" IN ('invited', 'active', 'suspended'))
);
--> statement-breakpoint
CREATE TABLE "organization_modules" (
	"organization_id" uuid NOT NULL,
	"module_key" text NOT NULL,
	"enabled" boolean NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organization_modules_pk" PRIMARY KEY("organization_id","module_key")
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" "citext" NOT NULL,
	"name" text NOT NULL,
	"legal_name" text,
	"status" text DEFAULT 'active' NOT NULL,
	"plan_key" text DEFAULT 'standard' NOT NULL,
	"locale" text DEFAULT 'tr-TR' NOT NULL,
	"timezone" text DEFAULT 'Europe/Istanbul' NOT NULL,
	"default_currency" char(3) DEFAULT 'TRY' NOT NULL,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organizations_status_ck" CHECK ("status" IN ('active', 'suspended', 'archived')),
	CONSTRAINT "organizations_currency_ck" CHECK ("default_currency" ~ '^[A-Z]{3}$')
);
--> statement-breakpoint
CREATE TABLE "outbox_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid,
	"aggregate_type" text NOT NULL,
	"aggregate_id" uuid NOT NULL,
	"event_type" text NOT NULL,
	"event_version" integer DEFAULT 1 NOT NULL,
	"payload" jsonb NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"published_at" timestamp with time zone,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	CONSTRAINT "outbox_events_status_ck" CHECK ("status" IN ('pending', 'published', 'failed'))
);
--> statement-breakpoint
CREATE TABLE "password_reset_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"requested_ip" "inet",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "permissions" (
	"key" text PRIMARY KEY NOT NULL,
	"module" text NOT NULL,
	"allowed_scopes" text[] NOT NULL,
	"sensitivity" text NOT NULL,
	"description" text NOT NULL,
	"deprecated_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "role_permissions" (
	"organization_id" uuid NOT NULL,
	"role_id" uuid NOT NULL,
	"permission_key" text NOT NULL,
	"scope" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "role_permissions_pk" PRIMARY KEY("role_id","permission_key"),
	CONSTRAINT "role_permissions_scope_ck" CHECK ("scope" IN ('own', 'assigned', 'branch', 'organization'))
);
--> statement-breakpoint
CREATE TABLE "roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"is_system" boolean DEFAULT false NOT NULL,
	"template_key" text,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "roles_org_id_uq" UNIQUE("organization_id","id"),
	CONSTRAINT "roles_org_key_uq" UNIQUE("organization_id","key")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"csrf_token_hash" text NOT NULL,
	"active_organization_id" uuid,
	"active_membership_id" uuid,
	"auth_method" text DEFAULT 'password' NOT NULL,
	"mfa_verified_at" timestamp with time zone,
	"ip" "inet",
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"idle_expires_at" timestamp with time zone NOT NULL,
	"absolute_expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"revoked_reason" text
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" "citext" NOT NULL,
	"full_name" text NOT NULL,
	"phone" text,
	"password_hash" text,
	"status" text DEFAULT 'active' NOT NULL,
	"platform_role" text,
	"locale" text,
	"email_verified_at" timestamp with time zone,
	"last_login_at" timestamp with time zone,
	"password_changed_at" timestamp with time zone,
	"failed_login_attempts" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_status_ck" CHECK ("status" IN ('invited', 'active', 'disabled')),
	CONSTRAINT "users_platform_role_ck" CHECK (("platform_role" IS NULL OR "platform_role" IN ('platform_admin', 'platform_support')))
);
--> statement-breakpoint
CREATE TABLE "academic_years" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"starts_on" date NOT NULL,
	"ends_on" date NOT NULL,
	"status" text DEFAULT 'planned' NOT NULL,
	"is_current" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "academic_years_org_id_uq" UNIQUE("organization_id","id"),
	CONSTRAINT "academic_years_org_name_uq" UNIQUE("organization_id","name"),
	CONSTRAINT "academic_years_dates_ck" CHECK (ends_on > starts_on),
	CONSTRAINT "academic_years_status_ck" CHECK ("status" IN ('planned', 'active', 'closed'))
);
--> statement-breakpoint
CREATE TABLE "class_enrollments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"class_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"starts_on" date NOT NULL,
	"ends_on" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "class_enrollments_org_id_uq" UNIQUE("organization_id","id"),
	CONSTRAINT "class_enrollments_status_ck" CHECK ("status" IN ('active', 'ended'))
);
--> statement-breakpoint
CREATE TABLE "classes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"academic_year_id" uuid NOT NULL,
	"grade_level_id" uuid,
	"name" text NOT NULL,
	"capacity" integer,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "classes_org_id_uq" UNIQUE("organization_id","id"),
	CONSTRAINT "classes_name_uq" UNIQUE("organization_id","academic_year_id","branch_id","name"),
	CONSTRAINT "classes_capacity_ck" CHECK (capacity IS NULL OR capacity > 0),
	CONSTRAINT "classes_status_ck" CHECK ("status" IN ('active', 'archived'))
);
--> statement-breakpoint
CREATE TABLE "enrollments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"academic_year_id" uuid NOT NULL,
	"grade_level_id" uuid,
	"status" text DEFAULT 'active' NOT NULL,
	"enrolled_on" date NOT NULL,
	"ended_on" date,
	"end_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "enrollments_org_id_uq" UNIQUE("organization_id","id"),
	CONSTRAINT "enrollments_status_ck" CHECK ("status" IN ('active', 'completed', 'withdrawn', 'transferred'))
);
--> statement-breakpoint
CREATE TABLE "grade_levels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"stage" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "grade_levels_org_id_uq" UNIQUE("organization_id","id"),
	CONSTRAINT "grade_levels_org_code_uq" UNIQUE("organization_id","code"),
	CONSTRAINT "grade_levels_stage_ck" CHECK ("stage" IN ('preschool', 'primary', 'middle', 'high', 'other'))
);
--> statement-breakpoint
CREATE TABLE "guardians" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"phone" text,
	"email" "citext",
	"occupation" text,
	"address" text,
	"national_id_ciphertext" text,
	"national_id_hash" text,
	"national_id_last4" text,
	"custom_fields" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"search_text" text GENERATED ALWAYS AS (app.search_normalize(first_name || ' ' || last_name || ' ' || coalesce(phone, ''))) STORED,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	CONSTRAINT "guardians_org_id_uq" UNIQUE("organization_id","id")
);
--> statement-breakpoint
CREATE TABLE "personnel" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"membership_id" uuid,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"position" text,
	"department" text,
	"employment_type" text,
	"email" "citext",
	"phone" text,
	"hire_date" date,
	"status" text DEFAULT 'active' NOT NULL,
	"search_text" text GENERATED ALWAYS AS (app.search_normalize(first_name || ' ' || last_name || ' ' || coalesce(position, ''))) STORED,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	CONSTRAINT "personnel_org_id_uq" UNIQUE("organization_id","id"),
	CONSTRAINT "personnel_status_ck" CHECK ("status" IN ('active', 'inactive')),
	CONSTRAINT "personnel_employment_type_ck" CHECK (("employment_type" IS NULL OR "employment_type" IN ('full_time', 'part_time', 'contractor')))
);
--> statement-breakpoint
CREATE TABLE "student_guardians" (
	"organization_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"guardian_id" uuid NOT NULL,
	"relationship" text NOT NULL,
	"is_primary_contact" boolean DEFAULT false NOT NULL,
	"is_financially_responsible" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "student_guardians_pk" PRIMARY KEY("student_id","guardian_id"),
	CONSTRAINT "student_guardians_relationship_ck" CHECK ("relationship" IN ('mother', 'father', 'legal_guardian', 'grandparent', 'sibling', 'other'))
);
--> statement-breakpoint
CREATE TABLE "students" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"student_number" text NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"gender" text,
	"birth_date" date,
	"national_id_ciphertext" text,
	"national_id_hash" text,
	"national_id_last4" text,
	"status" text DEFAULT 'active' NOT NULL,
	"enrolled_on" date,
	"email" "citext",
	"phone" text,
	"address" text,
	"custom_fields" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"search_text" text GENERATED ALWAYS AS (app.search_normalize(first_name || ' ' || last_name || ' ' || student_number)) STORED,
	"created_by_membership_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	CONSTRAINT "students_org_id_uq" UNIQUE("organization_id","id"),
	CONSTRAINT "students_org_number_uq" UNIQUE("organization_id","student_number"),
	CONSTRAINT "students_status_ck" CHECK ("status" IN ('active', 'inactive', 'graduated', 'withdrawn', 'transferred')),
	CONSTRAINT "students_gender_ck" CHECK (("gender" IS NULL OR "gender" IN ('female', 'male', 'other', 'unspecified')))
);
--> statement-breakpoint
CREATE TABLE "teacher_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"class_id" uuid NOT NULL,
	"personnel_id" uuid NOT NULL,
	"role" text NOT NULL,
	"subject" text,
	"starts_on" date NOT NULL,
	"ends_on" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "teacher_assignments_org_id_uq" UNIQUE("organization_id","id"),
	CONSTRAINT "teacher_assignments_role_ck" CHECK ("role" IN ('homeroom', 'subject'))
);
--> statement-breakpoint
CREATE TABLE "agreement_discounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"agreement_id" uuid NOT NULL,
	"sort_order" integer NOT NULL,
	"category" text NOT NULL,
	"label" text NOT NULL,
	"kind" text NOT NULL,
	"percentage_bps" integer,
	"fixed_amount_minor" bigint,
	"amount_minor" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agreement_discounts_kind_ck" CHECK ((kind = 'percentage' AND percentage_bps BETWEEN 1 AND 10000 AND fixed_amount_minor IS NULL)
       OR (kind = 'fixed' AND fixed_amount_minor > 0 AND percentage_bps IS NULL)),
	CONSTRAINT "agreement_discounts_amount_ck" CHECK (amount_minor >= 0),
	CONSTRAINT "agreement_discounts_category_ck" CHECK ("category" IN ('sibling', 'early_payment', 'scholarship', 'staff', 'corporate', 'other'))
);
--> statement-breakpoint
CREATE TABLE "financial_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"currency" char(3) NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "financial_accounts_org_id_uq" UNIQUE("organization_id","id"),
	CONSTRAINT "financial_accounts_org_branch_id_uq" UNIQUE("organization_id","branch_id","id"),
	CONSTRAINT "financial_accounts_student_uq" UNIQUE("organization_id","student_id","branch_id","currency"),
	CONSTRAINT "financial_accounts_currency_ck" CHECK ("currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "financial_accounts_status_ck" CHECK ("status" IN ('active', 'closed'))
);
--> statement-breakpoint
CREATE TABLE "payment_allocations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"payment_id" uuid NOT NULL,
	"receivable_id" uuid NOT NULL,
	"amount_minor" bigint NOT NULL,
	"created_by_membership_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reversed_at" timestamp with time zone,
	"reversed_by_membership_id" uuid,
	"reversal_reason" text,
	CONSTRAINT "payment_allocations_amount_ck" CHECK (amount_minor > 0)
);
--> statement-breakpoint
CREATE TABLE "payment_intents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"provider_reference" text NOT NULL,
	"description" text NOT NULL,
	"currency" char(3) NOT NULL,
	"amount_minor" bigint NOT NULL,
	"status" text DEFAULT 'created' NOT NULL,
	"checkout_url" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"payment_id" uuid,
	"created_by_membership_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_intents_org_id_uq" UNIQUE("organization_id","id"),
	CONSTRAINT "payment_intents_amount_ck" CHECK (amount_minor > 0),
	CONSTRAINT "payment_intents_currency_ck" CHECK ("currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "payment_intents_status_ck" CHECK ("status" IN ('created', 'succeeded', 'failed', 'expired', 'cancelled'))
);
--> statement-breakpoint
CREATE TABLE "payment_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"agreement_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"installment_count" integer NOT NULL,
	"first_due_date" date NOT NULL,
	"frequency" text DEFAULT 'monthly' NOT NULL,
	"down_payment_minor" bigint DEFAULT 0 NOT NULL,
	"total_minor" bigint NOT NULL,
	"rounding_unit_minor" integer DEFAULT 100 NOT NULL,
	"remainder_placement" text DEFAULT 'last' NOT NULL,
	"created_by_membership_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"superseded_at" timestamp with time zone,
	CONSTRAINT "payment_plans_org_id_uq" UNIQUE("organization_id","id"),
	CONSTRAINT "payment_plans_org_branch_id_uq" UNIQUE("organization_id","branch_id","id"),
	CONSTRAINT "payment_plans_count_ck" CHECK (installment_count BETWEEN 1 AND 36),
	CONSTRAINT "payment_plans_amounts_ck" CHECK (down_payment_minor >= 0 AND total_minor >= 0),
	CONSTRAINT "payment_plans_status_ck" CHECK ("status" IN ('active', 'superseded', 'cancelled')),
	CONSTRAINT "payment_plans_frequency_ck" CHECK ("frequency" IN ('monthly')),
	CONSTRAINT "payment_plans_remainder_ck" CHECK ("remainder_placement" IN ('first', 'last'))
);
--> statement-breakpoint
CREATE TABLE "payment_provider_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text NOT NULL,
	"provider_event_id" text NOT NULL,
	"event_type" text NOT NULL,
	"organization_id" uuid,
	"payload" jsonb NOT NULL,
	"signature_valid" boolean NOT NULL,
	"status" text DEFAULT 'received' NOT NULL,
	"error" text,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	CONSTRAINT "payment_provider_events_status_ck" CHECK ("status" IN ('received', 'processed', 'ignored', 'failed'))
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"payer_guardian_id" uuid,
	"payer_name" text,
	"currency" char(3) NOT NULL,
	"amount_minor" bigint NOT NULL,
	"allocated_minor" bigint DEFAULT 0 NOT NULL,
	"refunded_minor" bigint DEFAULT 0 NOT NULL,
	"method" text NOT NULL,
	"status" text DEFAULT 'completed' NOT NULL,
	"received_at" timestamp with time zone NOT NULL,
	"receipt_number" text NOT NULL,
	"reference" text,
	"notes" text,
	"idempotency_key" text,
	"request_hash" text,
	"provider" text,
	"provider_reference" text,
	"payment_intent_id" uuid,
	"recorded_by_membership_id" uuid,
	"reversed_at" timestamp with time zone,
	"reversed_by_membership_id" uuid,
	"reversal_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payments_org_id_uq" UNIQUE("organization_id","id"),
	CONSTRAINT "payments_org_branch_id_uq" UNIQUE("organization_id","branch_id","id"),
	CONSTRAINT "payments_org_receipt_uq" UNIQUE("organization_id","receipt_number"),
	CONSTRAINT "payments_amount_ck" CHECK (amount_minor > 0),
	CONSTRAINT "payments_allocation_ck" CHECK (allocated_minor >= 0 AND refunded_minor >= 0 AND allocated_minor + refunded_minor <= amount_minor),
	CONSTRAINT "payments_reversal_ck" CHECK ((status = 'completed' AND reversed_at IS NULL)
       OR (status = 'reversed' AND reversed_at IS NOT NULL AND reversal_reason IS NOT NULL AND allocated_minor = 0)),
	CONSTRAINT "payments_currency_ck" CHECK ("currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "payments_method_ck" CHECK ("method" IN ('cash', 'bank_transfer', 'credit_card', 'pos', 'online', 'check', 'other')),
	CONSTRAINT "payments_status_ck" CHECK ("status" IN ('completed', 'reversed'))
);
--> statement-breakpoint
CREATE TABLE "receivables" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"agreement_id" uuid,
	"payment_plan_id" uuid,
	"kind" text NOT NULL,
	"sequence_no" integer,
	"category" text NOT NULL,
	"description" text NOT NULL,
	"currency" char(3) NOT NULL,
	"amount_minor" bigint NOT NULL,
	"allocated_minor" bigint DEFAULT 0 NOT NULL,
	"due_date" date NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"overdue_marked_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"cancel_reason" text,
	"created_by_membership_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "receivables_org_id_uq" UNIQUE("organization_id","id"),
	CONSTRAINT "receivables_org_branch_id_uq" UNIQUE("organization_id","branch_id","id"),
	CONSTRAINT "receivables_amount_ck" CHECK (amount_minor > 0),
	CONSTRAINT "receivables_allocated_ck" CHECK (allocated_minor >= 0 AND allocated_minor <= amount_minor),
	CONSTRAINT "receivables_installment_ck" CHECK (kind <> 'installment' OR (payment_plan_id IS NOT NULL AND sequence_no IS NOT NULL)),
	CONSTRAINT "receivables_status_consistency_ck" CHECK ((status = 'cancelled' AND allocated_minor = 0)
       OR (status = 'paid' AND allocated_minor = amount_minor)
       OR (status = 'open' AND allocated_minor < amount_minor)),
	CONSTRAINT "receivables_currency_ck" CHECK ("currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "receivables_kind_ck" CHECK ("kind" IN ('installment', 'charge')),
	CONSTRAINT "receivables_status_ck" CHECK ("status" IN ('open', 'paid', 'cancelled')),
	CONSTRAINT "receivables_category_ck" CHECK ("category" IN ('tuition', 'down_payment', 'books', 'uniform', 'transport', 'meals', 'trip', 'exam', 'other'))
);
--> statement-breakpoint
CREATE TABLE "tuition_agreements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"academic_year_id" uuid,
	"enrollment_id" uuid,
	"responsible_guardian_id" uuid,
	"title" text NOT NULL,
	"currency" char(3) NOT NULL,
	"gross_amount_minor" bigint NOT NULL,
	"discount_total_minor" bigint DEFAULT 0 NOT NULL,
	"net_amount_minor" bigint NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"signed_on" date,
	"notes" text,
	"created_by_membership_id" uuid,
	"cancelled_at" timestamp with time zone,
	"cancel_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tuition_agreements_org_id_uq" UNIQUE("organization_id","id"),
	CONSTRAINT "tuition_agreements_org_branch_id_uq" UNIQUE("organization_id","branch_id","id"),
	CONSTRAINT "tuition_agreements_gross_ck" CHECK (gross_amount_minor > 0),
	CONSTRAINT "tuition_agreements_discount_ck" CHECK (discount_total_minor >= 0),
	CONSTRAINT "tuition_agreements_net_ck" CHECK (net_amount_minor >= 0 AND net_amount_minor = gross_amount_minor - discount_total_minor),
	CONSTRAINT "tuition_agreements_currency_ck" CHECK ("currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "tuition_agreements_status_ck" CHECK ("status" IN ('active', 'completed', 'cancelled'))
);
--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "branches" ADD CONSTRAINT "branches_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_sequences" ADD CONSTRAINT "document_sequences_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_membership_fk" FOREIGN KEY ("organization_id","membership_id") REFERENCES "public"."memberships"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership_branches" ADD CONSTRAINT "membership_branches_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership_branches" ADD CONSTRAINT "membership_branches_membership_fk" FOREIGN KEY ("organization_id","membership_id") REFERENCES "public"."memberships"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership_branches" ADD CONSTRAINT "membership_branches_branch_fk" FOREIGN KEY ("organization_id","branch_id") REFERENCES "public"."branches"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership_roles" ADD CONSTRAINT "membership_roles_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership_roles" ADD CONSTRAINT "membership_roles_membership_fk" FOREIGN KEY ("organization_id","membership_id") REFERENCES "public"."memberships"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership_roles" ADD CONSTRAINT "membership_roles_role_fk" FOREIGN KEY ("organization_id","role_id") REFERENCES "public"."roles"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_invited_by_fk" FOREIGN KEY ("organization_id","invited_by_membership_id") REFERENCES "public"."memberships"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_modules" ADD CONSTRAINT "organization_modules_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outbox_events" ADD CONSTRAINT "outbox_events_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_key_permissions_key_fk" FOREIGN KEY ("permission_key") REFERENCES "public"."permissions"("key") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_fk" FOREIGN KEY ("organization_id","role_id") REFERENCES "public"."roles"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roles" ADD CONSTRAINT "roles_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_active_organization_id_organizations_id_fk" FOREIGN KEY ("active_organization_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_active_membership_id_memberships_id_fk" FOREIGN KEY ("active_membership_id") REFERENCES "public"."memberships"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "academic_years" ADD CONSTRAINT "academic_years_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_enrollments" ADD CONSTRAINT "class_enrollments_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_enrollments" ADD CONSTRAINT "class_enrollments_class_fk" FOREIGN KEY ("organization_id","class_id") REFERENCES "public"."classes"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_enrollments" ADD CONSTRAINT "class_enrollments_student_fk" FOREIGN KEY ("organization_id","student_id") REFERENCES "public"."students"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_enrollments" ADD CONSTRAINT "class_enrollments_branch_fk" FOREIGN KEY ("organization_id","branch_id") REFERENCES "public"."branches"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "classes" ADD CONSTRAINT "classes_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "classes" ADD CONSTRAINT "classes_branch_fk" FOREIGN KEY ("organization_id","branch_id") REFERENCES "public"."branches"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "classes" ADD CONSTRAINT "classes_year_fk" FOREIGN KEY ("organization_id","academic_year_id") REFERENCES "public"."academic_years"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "classes" ADD CONSTRAINT "classes_grade_fk" FOREIGN KEY ("organization_id","grade_level_id") REFERENCES "public"."grade_levels"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_branch_fk" FOREIGN KEY ("organization_id","branch_id") REFERENCES "public"."branches"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_student_fk" FOREIGN KEY ("organization_id","student_id") REFERENCES "public"."students"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_year_fk" FOREIGN KEY ("organization_id","academic_year_id") REFERENCES "public"."academic_years"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_grade_fk" FOREIGN KEY ("organization_id","grade_level_id") REFERENCES "public"."grade_levels"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grade_levels" ADD CONSTRAINT "grade_levels_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guardians" ADD CONSTRAINT "guardians_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personnel" ADD CONSTRAINT "personnel_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personnel" ADD CONSTRAINT "personnel_branch_fk" FOREIGN KEY ("organization_id","branch_id") REFERENCES "public"."branches"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personnel" ADD CONSTRAINT "personnel_membership_fk" FOREIGN KEY ("organization_id","membership_id") REFERENCES "public"."memberships"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_guardians" ADD CONSTRAINT "student_guardians_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_guardians" ADD CONSTRAINT "student_guardians_student_fk" FOREIGN KEY ("organization_id","student_id") REFERENCES "public"."students"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_guardians" ADD CONSTRAINT "student_guardians_guardian_fk" FOREIGN KEY ("organization_id","guardian_id") REFERENCES "public"."guardians"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "students" ADD CONSTRAINT "students_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "students" ADD CONSTRAINT "students_branch_fk" FOREIGN KEY ("organization_id","branch_id") REFERENCES "public"."branches"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teacher_assignments" ADD CONSTRAINT "teacher_assignments_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teacher_assignments" ADD CONSTRAINT "teacher_assignments_class_fk" FOREIGN KEY ("organization_id","class_id") REFERENCES "public"."classes"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teacher_assignments" ADD CONSTRAINT "teacher_assignments_personnel_fk" FOREIGN KEY ("organization_id","personnel_id") REFERENCES "public"."personnel"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teacher_assignments" ADD CONSTRAINT "teacher_assignments_branch_fk" FOREIGN KEY ("organization_id","branch_id") REFERENCES "public"."branches"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agreement_discounts" ADD CONSTRAINT "agreement_discounts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agreement_discounts" ADD CONSTRAINT "agreement_discounts_agreement_fk" FOREIGN KEY ("organization_id","branch_id","agreement_id") REFERENCES "public"."tuition_agreements"("organization_id","branch_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_accounts" ADD CONSTRAINT "financial_accounts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_accounts" ADD CONSTRAINT "financial_accounts_branch_fk" FOREIGN KEY ("organization_id","branch_id") REFERENCES "public"."branches"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_accounts" ADD CONSTRAINT "financial_accounts_student_fk" FOREIGN KEY ("organization_id","student_id") REFERENCES "public"."students"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_payment_fk" FOREIGN KEY ("organization_id","branch_id","payment_id") REFERENCES "public"."payments"("organization_id","branch_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_receivable_fk" FOREIGN KEY ("organization_id","branch_id","receivable_id") REFERENCES "public"."receivables"("organization_id","branch_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_account_fk" FOREIGN KEY ("organization_id","branch_id","account_id") REFERENCES "public"."financial_accounts"("organization_id","branch_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_intents" ADD CONSTRAINT "payment_intents_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_intents" ADD CONSTRAINT "payment_intents_account_fk" FOREIGN KEY ("organization_id","branch_id","account_id") REFERENCES "public"."financial_accounts"("organization_id","branch_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_intents" ADD CONSTRAINT "payment_intents_payment_fk" FOREIGN KEY ("organization_id","branch_id","payment_id") REFERENCES "public"."payments"("organization_id","branch_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_plans" ADD CONSTRAINT "payment_plans_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_plans" ADD CONSTRAINT "payment_plans_agreement_fk" FOREIGN KEY ("organization_id","branch_id","agreement_id") REFERENCES "public"."tuition_agreements"("organization_id","branch_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_plans" ADD CONSTRAINT "payment_plans_account_fk" FOREIGN KEY ("organization_id","branch_id","account_id") REFERENCES "public"."financial_accounts"("organization_id","branch_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_provider_events" ADD CONSTRAINT "payment_provider_events_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_account_fk" FOREIGN KEY ("organization_id","branch_id","account_id") REFERENCES "public"."financial_accounts"("organization_id","branch_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_student_fk" FOREIGN KEY ("organization_id","student_id") REFERENCES "public"."students"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_payer_fk" FOREIGN KEY ("organization_id","payer_guardian_id") REFERENCES "public"."guardians"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receivables" ADD CONSTRAINT "receivables_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receivables" ADD CONSTRAINT "receivables_account_fk" FOREIGN KEY ("organization_id","branch_id","account_id") REFERENCES "public"."financial_accounts"("organization_id","branch_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receivables" ADD CONSTRAINT "receivables_student_fk" FOREIGN KEY ("organization_id","student_id") REFERENCES "public"."students"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receivables" ADD CONSTRAINT "receivables_agreement_fk" FOREIGN KEY ("organization_id","branch_id","agreement_id") REFERENCES "public"."tuition_agreements"("organization_id","branch_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receivables" ADD CONSTRAINT "receivables_plan_fk" FOREIGN KEY ("organization_id","branch_id","payment_plan_id") REFERENCES "public"."payment_plans"("organization_id","branch_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tuition_agreements" ADD CONSTRAINT "tuition_agreements_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tuition_agreements" ADD CONSTRAINT "tuition_agreements_account_fk" FOREIGN KEY ("organization_id","branch_id","account_id") REFERENCES "public"."financial_accounts"("organization_id","branch_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tuition_agreements" ADD CONSTRAINT "tuition_agreements_student_fk" FOREIGN KEY ("organization_id","student_id") REFERENCES "public"."students"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tuition_agreements" ADD CONSTRAINT "tuition_agreements_year_fk" FOREIGN KEY ("organization_id","academic_year_id") REFERENCES "public"."academic_years"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tuition_agreements" ADD CONSTRAINT "tuition_agreements_enrollment_fk" FOREIGN KEY ("organization_id","enrollment_id") REFERENCES "public"."enrollments"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tuition_agreements" ADD CONSTRAINT "tuition_agreements_guardian_fk" FOREIGN KEY ("organization_id","responsible_guardian_id") REFERENCES "public"."guardians"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_logs_org_time_idx" ON "audit_logs" USING btree ("organization_id","occurred_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "audit_logs_org_resource_idx" ON "audit_logs" USING btree ("organization_id","resource_type","resource_id","occurred_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "audit_logs_org_actor_idx" ON "audit_logs" USING btree ("organization_id","actor_user_id","occurred_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "invitations_token_hash_uq" ON "invitations" USING btree ("token_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "invitations_pending_membership_uq" ON "invitations" USING btree ("membership_id") WHERE status = 'pending';--> statement-breakpoint
CREATE INDEX "membership_branches_branch_idx" ON "membership_branches" USING btree ("organization_id","branch_id");--> statement-breakpoint
CREATE INDEX "membership_roles_role_idx" ON "membership_roles" USING btree ("organization_id","role_id");--> statement-breakpoint
CREATE INDEX "memberships_user_idx" ON "memberships" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "organizations_slug_uq" ON "organizations" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "outbox_events_pending_idx" ON "outbox_events" USING btree ("available_at") WHERE status = 'pending';--> statement-breakpoint
CREATE INDEX "outbox_events_org_type_idx" ON "outbox_events" USING btree ("organization_id","event_type","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "password_reset_tokens_hash_uq" ON "password_reset_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "password_reset_tokens_user_idx" ON "password_reset_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sessions_token_hash_uq" ON "sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "sessions_user_active_idx" ON "sessions" USING btree ("user_id") WHERE revoked_at IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_uq" ON "users" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "academic_years_current_uq" ON "academic_years" USING btree ("organization_id") WHERE is_current;--> statement-breakpoint
CREATE UNIQUE INDEX "class_enrollments_active_uq" ON "class_enrollments" USING btree ("organization_id","class_id","student_id") WHERE status = 'active';--> statement-breakpoint
CREATE INDEX "class_enrollments_student_idx" ON "class_enrollments" USING btree ("organization_id","student_id");--> statement-breakpoint
CREATE UNIQUE INDEX "enrollments_active_uq" ON "enrollments" USING btree ("organization_id","student_id","academic_year_id") WHERE status = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "guardians_org_national_id_uq" ON "guardians" USING btree ("organization_id","national_id_hash") WHERE national_id_hash IS NOT NULL;--> statement-breakpoint
CREATE INDEX "guardians_org_phone_idx" ON "guardians" USING btree ("organization_id","phone");--> statement-breakpoint
CREATE INDEX "guardians_search_trgm_idx" ON "guardians" USING gin ("search_text" gin_trgm_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "personnel_org_membership_uq" ON "personnel" USING btree ("organization_id","membership_id") WHERE membership_id IS NOT NULL;--> statement-breakpoint
CREATE INDEX "personnel_search_trgm_idx" ON "personnel" USING gin ("search_text" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "student_guardians_guardian_idx" ON "student_guardians" USING btree ("organization_id","guardian_id");--> statement-breakpoint
CREATE UNIQUE INDEX "students_org_national_id_uq" ON "students" USING btree ("organization_id","national_id_hash") WHERE national_id_hash IS NOT NULL;--> statement-breakpoint
CREATE INDEX "students_org_branch_status_idx" ON "students" USING btree ("organization_id","branch_id","status");--> statement-breakpoint
CREATE INDEX "students_org_name_idx" ON "students" USING btree ("organization_id","last_name","first_name");--> statement-breakpoint
CREATE INDEX "students_search_trgm_idx" ON "students" USING gin ("search_text" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "teacher_assignments_personnel_idx" ON "teacher_assignments" USING btree ("organization_id","personnel_id");--> statement-breakpoint
CREATE INDEX "teacher_assignments_class_idx" ON "teacher_assignments" USING btree ("organization_id","class_id");--> statement-breakpoint
CREATE INDEX "agreement_discounts_agreement_idx" ON "agreement_discounts" USING btree ("organization_id","agreement_id");--> statement-breakpoint
CREATE INDEX "payment_allocations_payment_idx" ON "payment_allocations" USING btree ("organization_id","payment_id");--> statement-breakpoint
CREATE INDEX "payment_allocations_receivable_idx" ON "payment_allocations" USING btree ("organization_id","receivable_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_intents_provider_reference_uq" ON "payment_intents" USING btree ("provider","provider_reference");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_plans_active_uq" ON "payment_plans" USING btree ("organization_id","agreement_id") WHERE status = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "payment_provider_events_uq" ON "payment_provider_events" USING btree ("provider","provider_event_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_idempotency_uq" ON "payments" USING btree ("organization_id","idempotency_key") WHERE idempotency_key IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "payments_provider_reference_uq" ON "payments" USING btree ("organization_id","provider","provider_reference") WHERE provider_reference IS NOT NULL;--> statement-breakpoint
CREATE INDEX "payments_org_received_idx" ON "payments" USING btree ("organization_id","received_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "payments_account_idx" ON "payments" USING btree ("organization_id","account_id","received_at");--> statement-breakpoint
CREATE INDEX "payments_student_idx" ON "payments" USING btree ("organization_id","student_id");--> statement-breakpoint
CREATE UNIQUE INDEX "receivables_plan_sequence_uq" ON "receivables" USING btree ("organization_id","payment_plan_id","sequence_no") WHERE kind = 'installment';--> statement-breakpoint
CREATE INDEX "receivables_account_due_idx" ON "receivables" USING btree ("organization_id","account_id","due_date");--> statement-breakpoint
CREATE INDEX "receivables_open_due_idx" ON "receivables" USING btree ("organization_id","due_date") WHERE status = 'open';--> statement-breakpoint
CREATE INDEX "receivables_student_idx" ON "receivables" USING btree ("organization_id","student_id");--> statement-breakpoint
CREATE INDEX "tuition_agreements_student_idx" ON "tuition_agreements" USING btree ("organization_id","student_id");