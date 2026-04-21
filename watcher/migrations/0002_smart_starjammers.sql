CREATE TABLE "dispatcher_cursor" (
	"id" integer PRIMARY KEY NOT NULL,
	"last_block" bigint NOT NULL,
	"last_id" text NOT NULL,
	"initialised_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
