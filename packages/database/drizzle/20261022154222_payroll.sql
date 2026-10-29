CREATE TABLE "employees" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"employee_code" text NOT NULL,
	"full_name" text NOT NULL,
	"email" text NOT NULL,
	"phone" text,
	"designation" text NOT NULL,
	"department" text,
	"date_of_joining" date NOT NULL,
	"date_of_exit" date,
	"is_active" boolean DEFAULT true NOT NULL,
	"monthly_ctc_paise" integer NOT NULL,
	"work_state" text NOT NULL,
	"metro_city" boolean DEFAULT false NOT NULL,
	"pf_enabled" boolean DEFAULT true NOT NULL,
	"esi_enabled" boolean DEFAULT true NOT NULL,
	"pan_encrypted" text,
	"pan_last4" text,
	"uan" text,
	"esi_number" text,
	"bank_account_encrypted" text,
	"bank_account_last4" text,
	"ifsc" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payroll_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"month" text NOT NULL,
	"status" text DEFAULT 'DRAFT' NOT NULL,
	"created_by_user_id" uuid,
	"finalised_by_user_id" uuid,
	"finalised_at" timestamp with time zone,
	"paid_at" timestamp with time zone,
	"payment_reference" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payslips" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"month" text NOT NULL,
	"days_in_month" integer NOT NULL,
	"paid_days" numeric(5, 1) NOT NULL,
	"lop_days" numeric(5, 1) DEFAULT '0' NOT NULL,
	"earnings" jsonb NOT NULL,
	"deductions" jsonb NOT NULL,
	"employer_contributions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"adjustments" jsonb NOT NULL,
	"gross_paise" integer NOT NULL,
	"total_deductions_paise" integer NOT NULL,
	"net_paise" integer NOT NULL,
	"details" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_runs" ADD CONSTRAINT "payroll_runs_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_runs" ADD CONSTRAINT "payroll_runs_finalised_by_user_id_users_id_fk" FOREIGN KEY ("finalised_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payslips" ADD CONSTRAINT "payslips_run_id_payroll_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."payroll_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payslips" ADD CONSTRAINT "payslips_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "employees_code_unique" ON "employees" USING btree ("employee_code");--> statement-breakpoint
CREATE UNIQUE INDEX "employees_email_unique" ON "employees" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "employees_user_unique" ON "employees" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payroll_runs_month_unique" ON "payroll_runs" USING btree ("month");--> statement-breakpoint
CREATE UNIQUE INDEX "payslips_run_employee_unique" ON "payslips" USING btree ("run_id","employee_id");--> statement-breakpoint
CREATE INDEX "payslips_employee_idx" ON "payslips" USING btree ("employee_id");