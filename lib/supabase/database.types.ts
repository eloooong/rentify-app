export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      audit_log: {
        Row: {
          action: string;
          actor_id: string | null;
          created_at: string;
          details: NonNullable<Json>;
          id: string;
          target_id: string | null;
          target_table: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          action: string;
          actor_id?: string | null;
          created_at?: string;
          details?: NonNullable<Json>;
          id?: string;
          target_id?: string | null;
          target_table: string;
          updated_at?: string;
        };
        Update: {
          action?: string;
          actor_id?: string | null;
          created_at?: string;
          details?: NonNullable<Json>;
          id?: string;
          target_id?: string | null;
          target_table?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "audit_log_actor_id_fkey";
            columns: ["actor_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      bookings: {
        Row: {
          accepted_at: string | null;
          cancellation_terms: NonNullable<Json>;
          closed_by: string | null;
          created_at: string;
          currency: string;
          daily_price_amount: number | null;
          deposit_amount: number;
          id: string;
          listing_id: string;
          owner_id: string;
          payment_expires_at: string | null;
          policy_version: string | null;
          rental_amount: number;
          rental_days: number;
          rental_period: unknown;
          renter_id: string;
          request_expires_at: string | null;
          request_key: string | null;
          status: Database["public"]["Enums"]["booking_status"];
          status_reason: string | null;
          updated_at: string;
          booking_payload: Json | null;
          refund_payload: Json | null;
        };
        ComputedFields: "booking_payload" | "refund_payload";
        Insert: {
          accepted_at?: string | null;
          cancellation_terms?: NonNullable<Json>;
          closed_by?: string | null;
          created_at?: string;
          currency?: string;
          daily_price_amount?: number | null;
          deposit_amount: number;
          id?: string;
          listing_id: string;
          owner_id: string;
          payment_expires_at?: string | null;
          policy_version?: string | null;
          rental_amount: number;
          rental_days?: never;
          rental_period: unknown;
          renter_id: string;
          request_expires_at?: string | null;
          request_key?: string | null;
          status?: Database["public"]["Enums"]["booking_status"];
          status_reason?: string | null;
          updated_at?: string;
        };
        Update: {
          accepted_at?: string | null;
          cancellation_terms?: NonNullable<Json>;
          closed_by?: string | null;
          created_at?: string;
          currency?: string;
          daily_price_amount?: number | null;
          deposit_amount?: number;
          id?: string;
          listing_id?: string;
          owner_id?: string;
          payment_expires_at?: string | null;
          policy_version?: string | null;
          rental_amount?: number;
          rental_days?: never;
          rental_period?: unknown;
          renter_id?: string;
          request_expires_at?: string | null;
          request_key?: string | null;
          status?: Database["public"]["Enums"]["booking_status"];
          status_reason?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "bookings_closed_by_fkey";
            columns: ["closed_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "bookings_listing_id_owner_id_fkey";
            columns: ["listing_id", "owner_id"];
            isOneToOne: false;
            referencedRelation: "listings";
            referencedColumns: ["id", "owner_id"];
          },
          {
            foreignKeyName: "bookings_owner_id_fkey";
            columns: ["owner_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "bookings_renter_id_fkey";
            columns: ["renter_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      categories: {
        Row: {
          attribute_schema: NonNullable<Json>;
          created_at: string;
          id: string;
          name: string;
          parent_id: string | null;
          slug: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          attribute_schema?: NonNullable<Json>;
          created_at?: string;
          id?: string;
          name: string;
          parent_id?: string | null;
          slug: string;
          updated_at?: string;
        };
        Update: {
          attribute_schema?: NonNullable<Json>;
          created_at?: string;
          id?: string;
          name?: string;
          parent_id?: string | null;
          slug?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "categories_parent_id_fkey";
            columns: ["parent_id"];
            isOneToOne: false;
            referencedRelation: "categories";
            referencedColumns: ["id"];
          },
        ];
      };
      checkout_attempts: {
        Row: {
          booking_id: string;
          candidate_session_id: string | null;
          checkout_url: string | null;
          consented_at: string;
          created_at: string;
          creation_started_at: string | null;
          deposit_amount: number;
          id: string;
          last_error_code: string | null;
          lease_token: string | null;
          lease_until: string | null;
          next_check_at: string | null;
          policy_version: string;
          provider: string;
          rental_amount: number;
          renter_id: string;
          session_id: string | null;
          state: string;
          total_amount: number | null;
          updated_at: string;
          checkout_payload: Json | null;
        };
        ComputedFields: "checkout_payload";
        Insert: {
          booking_id: string;
          candidate_session_id?: string | null;
          checkout_url?: string | null;
          consented_at?: string;
          created_at?: string;
          creation_started_at?: string | null;
          deposit_amount: number;
          id?: string;
          last_error_code?: string | null;
          lease_token?: string | null;
          lease_until?: string | null;
          next_check_at?: string | null;
          policy_version: string;
          provider?: string;
          rental_amount: number;
          renter_id: string;
          session_id?: string | null;
          state?: string;
          total_amount?: never;
          updated_at?: string;
        };
        Update: {
          booking_id?: string;
          candidate_session_id?: string | null;
          checkout_url?: string | null;
          consented_at?: string;
          created_at?: string;
          creation_started_at?: string | null;
          deposit_amount?: number;
          id?: string;
          last_error_code?: string | null;
          lease_token?: string | null;
          lease_until?: string | null;
          next_check_at?: string | null;
          policy_version?: string;
          provider?: string;
          rental_amount?: number;
          renter_id?: string;
          session_id?: string | null;
          state?: string;
          total_amount?: never;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "checkout_attempts_booking_id_fkey";
            columns: ["booking_id"];
            isOneToOne: true;
            referencedRelation: "bookings";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "checkout_attempts_renter_id_fkey";
            columns: ["renter_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      condition_reports: {
        Row: {
          booking_id: string;
          checklist: NonNullable<Json>;
          created_at: string;
          id: string;
          notes: string;
          owner_confirmed_at: string | null;
          photo_paths: string[];
          renter_confirmed_at: string | null;
          stage: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          booking_id: string;
          checklist?: NonNullable<Json>;
          created_at?: string;
          id?: string;
          notes?: string;
          owner_confirmed_at?: string | null;
          photo_paths?: string[];
          renter_confirmed_at?: string | null;
          stage: string;
          updated_at?: string;
        };
        Update: {
          booking_id?: string;
          checklist?: NonNullable<Json>;
          created_at?: string;
          id?: string;
          notes?: string;
          owner_confirmed_at?: string | null;
          photo_paths?: string[];
          renter_confirmed_at?: string | null;
          stage?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "condition_reports_booking_id_fkey";
            columns: ["booking_id"];
            isOneToOne: false;
            referencedRelation: "bookings";
            referencedColumns: ["id"];
          },
        ];
      };
      conversations: {
        Row: {
          booking_id: string;
          created_at: string;
          id: string;
          updated_at: string;
          chat_conversation_json: Json | null;
        };
        ComputedFields: "chat_conversation_json";
        Insert: {
          booking_id: string;
          created_at?: string;
          id?: string;
          updated_at?: string;
        };
        Update: {
          booking_id?: string;
          created_at?: string;
          id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "conversations_booking_id_fkey";
            columns: ["booking_id"];
            isOneToOne: true;
            referencedRelation: "bookings";
            referencedColumns: ["id"];
          },
        ];
      };
      listing_photos: {
        Row: {
          created_at: string;
          id: string;
          listing_id: string;
          position: number;
          storage_path: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          id?: string;
          listing_id: string;
          position: number;
          storage_path: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          listing_id?: string;
          position?: number;
          storage_path?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "listing_photos_listing_id_fkey";
            columns: ["listing_id"];
            isOneToOne: false;
            referencedRelation: "listings";
            referencedColumns: ["id"];
          },
        ];
      };
      listings: {
        Row: {
          attributes: NonNullable<Json>;
          category_id: string;
          condition: string;
          created_at: string;
          currency: string;
          daily_price_amount: number;
          deposit_amount: number;
          description: string;
          id: string;
          owner_id: string;
          pickup_area: string;
          status: string;
          title: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          attributes?: NonNullable<Json>;
          category_id: string;
          condition: string;
          created_at?: string;
          currency?: string;
          daily_price_amount: number;
          deposit_amount: number;
          description?: string;
          id?: string;
          owner_id?: string;
          pickup_area: string;
          status?: string;
          title: string;
          updated_at?: string;
        };
        Update: {
          attributes?: NonNullable<Json>;
          category_id?: string;
          condition?: string;
          created_at?: string;
          currency?: string;
          daily_price_amount?: number;
          deposit_amount?: number;
          description?: string;
          id?: string;
          owner_id?: string;
          pickup_area?: string;
          status?: string;
          title?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "listings_category_id_fkey";
            columns: ["category_id"];
            isOneToOne: false;
            referencedRelation: "categories";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "listings_owner_id_fkey";
            columns: ["owner_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      messages: {
        Row: {
          body: string;
          client_key: string;
          conversation_id: string;
          created_at: string;
          id: string;
          read_at: string | null;
          sender_id: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          body: string;
          client_key?: string;
          conversation_id: string;
          created_at?: string;
          id?: string;
          read_at?: string | null;
          sender_id: string;
          updated_at?: string;
        };
        Update: {
          body?: string;
          client_key?: string;
          conversation_id?: string;
          created_at?: string;
          id?: string;
          read_at?: string | null;
          sender_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey";
            columns: ["conversation_id"];
            isOneToOne: false;
            referencedRelation: "conversations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "messages_sender_id_fkey";
            columns: ["sender_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      notifications: {
        Row: {
          created_at: string;
          event_key: string | null;
          id: string;
          payload: NonNullable<Json>;
          read_at: string | null;
          type: string;
          updated_at: string;
          user_id: string;
          notification_json: Json | null;
        };
        ComputedFields: "notification_json";
        Insert: {
          created_at?: string;
          event_key?: string | null;
          id?: string;
          payload?: NonNullable<Json>;
          read_at?: string | null;
          type: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          event_key?: string | null;
          id?: string;
          payload?: NonNullable<Json>;
          read_at?: string | null;
          type?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "notifications_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      payment_events: {
        Row: {
          attempt_id: string | null;
          body_hash: string;
          event_id: string;
          received_at: string;
          session_id: string;
          state: string;
        };
        ComputedFields: never;
        Insert: {
          attempt_id?: string | null;
          body_hash: string;
          event_id: string;
          received_at?: string;
          session_id: string;
          state: string;
        };
        Update: {
          attempt_id?: string | null;
          body_hash?: string;
          event_id?: string;
          received_at?: string;
          session_id?: string;
          state?: string;
        };
        Relationships: [
          {
            foreignKeyName: "payment_events_attempt_id_fkey";
            columns: ["attempt_id"];
            isOneToOne: false;
            referencedRelation: "checkout_attempts";
            referencedColumns: ["id"];
          },
        ];
      };
      payment_receipts: {
        Row: {
          amount: number;
          attempt_id: string;
          created_at: string;
          currency: string;
          disposition: string;
          id: string;
          method: string;
          paid_at: string;
          payment_id: string;
          reason: string;
        };
        ComputedFields: never;
        Insert: {
          amount: number;
          attempt_id: string;
          created_at?: string;
          currency: string;
          disposition: string;
          id?: string;
          method: string;
          paid_at: string;
          payment_id: string;
          reason: string;
        };
        Update: {
          amount?: number;
          attempt_id?: string;
          created_at?: string;
          currency?: string;
          disposition?: string;
          id?: string;
          method?: string;
          paid_at?: string;
          payment_id?: string;
          reason?: string;
        };
        Relationships: [
          {
            foreignKeyName: "payment_receipts_attempt_id_fkey";
            columns: ["attempt_id"];
            isOneToOne: false;
            referencedRelation: "checkout_attempts";
            referencedColumns: ["id"];
          },
        ];
      };
      payments: {
        Row: {
          amount: number;
          booking_id: string;
          checkout_receipt_id: string | null;
          created_at: string;
          currency: string;
          gateway: string | null;
          gateway_reference: string | null;
          id: string;
          status: string;
          type: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          amount: number;
          booking_id: string;
          checkout_receipt_id?: string | null;
          created_at?: string;
          currency?: string;
          gateway?: string | null;
          gateway_reference?: string | null;
          id?: string;
          status?: string;
          type: string;
          updated_at?: string;
        };
        Update: {
          amount?: number;
          booking_id?: string;
          checkout_receipt_id?: string | null;
          created_at?: string;
          currency?: string;
          gateway?: string | null;
          gateway_reference?: string | null;
          id?: string;
          status?: string;
          type?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "payments_booking_id_fkey";
            columns: ["booking_id"];
            isOneToOne: false;
            referencedRelation: "bookings";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "payments_checkout_receipt_id_fkey";
            columns: ["checkout_receipt_id"];
            isOneToOne: false;
            referencedRelation: "payment_receipts";
            referencedColumns: ["id"];
          },
        ];
      };
      profile_private: {
        Row: {
          created_at: string;
          phone: string | null;
          phone_verified_at: string | null;
          updated_at: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          phone?: string | null;
          phone_verified_at?: string | null;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          phone?: string | null;
          phone_verified_at?: string | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "profile_private_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: true;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          account_status: string;
          avatar_path: string | null;
          created_at: string;
          display_name: string;
          id: string;
          role: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          account_status?: string;
          avatar_path?: string | null;
          created_at?: string;
          display_name: string;
          id: string;
          role?: string;
          updated_at?: string;
        };
        Update: {
          account_status?: string;
          avatar_path?: string | null;
          created_at?: string;
          display_name?: string;
          id?: string;
          role?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      refund_attempts: {
        Row: {
          amount: number;
          created_at: string;
          creation_started_at: string | null;
          generation: number;
          id: string;
          last_error_code: string | null;
          lease_token: string | null;
          lease_until: string | null;
          next_check_at: string | null;
          provider_refund_id: string | null;
          receipt_id: string;
          state: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          amount: number;
          created_at?: string;
          creation_started_at?: string | null;
          generation: number;
          id?: string;
          last_error_code?: string | null;
          lease_token?: string | null;
          lease_until?: string | null;
          next_check_at?: string | null;
          provider_refund_id?: string | null;
          receipt_id: string;
          state?: string;
          updated_at?: string;
        };
        Update: {
          amount?: number;
          created_at?: string;
          creation_started_at?: string | null;
          generation?: number;
          id?: string;
          last_error_code?: string | null;
          lease_token?: string | null;
          lease_until?: string | null;
          next_check_at?: string | null;
          provider_refund_id?: string | null;
          receipt_id?: string;
          state?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "refund_attempts_receipt_id_fkey";
            columns: ["receipt_id"];
            isOneToOne: false;
            referencedRelation: "payment_receipts";
            referencedColumns: ["id"];
          },
        ];
      };
      reports: {
        Row: {
          booking_id: string | null;
          created_at: string;
          evidence: NonNullable<Json>;
          id: string;
          listing_id: string | null;
          reason: string;
          reported_user_id: string | null;
          reporter_id: string;
          resolution: string | null;
          resolved_at: string | null;
          resolved_by: string | null;
          status: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          booking_id?: string | null;
          created_at?: string;
          evidence?: NonNullable<Json>;
          id?: string;
          listing_id?: string | null;
          reason: string;
          reported_user_id?: string | null;
          reporter_id: string;
          resolution?: string | null;
          resolved_at?: string | null;
          resolved_by?: string | null;
          status?: string;
          updated_at?: string;
        };
        Update: {
          booking_id?: string | null;
          created_at?: string;
          evidence?: NonNullable<Json>;
          id?: string;
          listing_id?: string | null;
          reason?: string;
          reported_user_id?: string | null;
          reporter_id?: string;
          resolution?: string | null;
          resolved_at?: string | null;
          resolved_by?: string | null;
          status?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "reports_booking_id_fkey";
            columns: ["booking_id"];
            isOneToOne: false;
            referencedRelation: "bookings";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "reports_listing_id_fkey";
            columns: ["listing_id"];
            isOneToOne: false;
            referencedRelation: "listings";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "reports_reported_user_id_fkey";
            columns: ["reported_user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "reports_reporter_id_fkey";
            columns: ["reporter_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "reports_resolved_by_fkey";
            columns: ["resolved_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      reviews: {
        Row: {
          author_id: string;
          booking_id: string;
          comment: string;
          created_at: string;
          id: string;
          rating: number;
          subject_id: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          author_id: string;
          booking_id: string;
          comment?: string;
          created_at?: string;
          id?: string;
          rating: number;
          subject_id: string;
          updated_at?: string;
        };
        Update: {
          author_id?: string;
          booking_id?: string;
          comment?: string;
          created_at?: string;
          id?: string;
          rating?: number;
          subject_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "reviews_author_id_fkey";
            columns: ["author_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "reviews_booking_id_fkey";
            columns: ["booking_id"];
            isOneToOne: false;
            referencedRelation: "bookings";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "reviews_subject_id_fkey";
            columns: ["subject_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      act_on_booking: {
        Args: { p_action: string; p_booking: string; p_reason?: string };
        Returns: Json;
      };
      booking_actor_eligible: { Args: { actor: string }; Returns: boolean };
      booking_availability: {
        Args: { p_from: string; p_listing: string; p_to: string };
        Returns: Json;
      };
      booking_device_unavailable: {
        Args: { at_time: string; listing: string };
        Returns: boolean;
      };
      booking_payload: {
        Args: {
          b: Omit<
            Database["public"]["Tables"]["bookings"]["Row"],
            Database["public"]["Tables"]["bookings"]["ComputedFields"]
          >;
        };
        Returns: Json;
      };
      booking_reserves_dates: {
        Args: {
          at_time: string;
          deadline: string;
          s: Database["public"]["Enums"]["booking_status"];
        };
        Returns: boolean;
      };
      can_edit_own_profile: {
        Args: Record<PropertyKey, never>;
        Returns: boolean;
      };
      can_manage_listing: { Args: { listing: string }; Returns: boolean };
      can_read_listing_image: {
        Args: { object_name: string };
        Returns: boolean;
      };
      can_write_listing_image: {
        Args: { object_name: string };
        Returns: boolean;
      };
      cancel_paid_booking: {
        Args: { p_booking: string; p_reason: string };
        Returns: Json;
      };
      chat_can_read: { Args: { p_booking: string }; Returns: boolean };
      chat_conversation_json: {
        Args: {
          c: Omit<
            Database["public"]["Tables"]["conversations"]["Row"],
            Database["public"]["Tables"]["conversations"]["ComputedFields"]
          >;
        };
        Returns: Json;
      };
      checkout_can_pay: { Args: { p_booking: string }; Returns: boolean };
      checkout_payload: {
        Args: {
          a: Omit<
            Database["public"]["Tables"]["checkout_attempts"]["Row"],
            Database["public"]["Tables"]["checkout_attempts"]["ComputedFields"]
          >;
        };
        Returns: Json;
      };
      claim_payment_work: {
        Args: { p_attempt?: string; p_limit?: number };
        Returns: {
          booking_id: string;
          candidate_session_id: string | null;
          checkout_url: string | null;
          consented_at: string;
          created_at: string;
          creation_started_at: string | null;
          deposit_amount: number;
          id: string;
          last_error_code: string | null;
          lease_token: string | null;
          lease_until: string | null;
          next_check_at: string | null;
          policy_version: string;
          provider: string;
          rental_amount: number;
          renter_id: string;
          session_id: string | null;
          state: string;
          total_amount: number | null;
          updated_at: string;
        }[];
        SetofOptions: {
          from: "*";
          to: "checkout_attempts";
          isOneToOne: false;
          isSetofReturn: true;
        };
      };
      claim_refund_work: {
        Args: { p_refund?: string };
        Returns: {
          amount: number;
          creation_started_at: string;
          id: string;
          lease_token: string;
          paid_at: string;
          payment_id: string;
          provider_refund_id: string;
          receipt_id: string;
        }[];
      };
      communication_user: { Args: Record<PropertyKey, never>; Returns: string };
      enqueue_payment_event: {
        Args: {
          p_event: string;
          p_hash: string;
          p_reference: string;
          p_session: string;
        };
        Returns: boolean;
      };
      expire_booking_holds: { Args: { p_limit?: number }; Returns: number };
      expire_listing_booking_holds: {
        Args: { at_time: string; listing: string };
        Returns: number;
      };
      fail_payment_work: {
        Args: { p_attempt: string; p_code: string; p_lease: string };
        Returns: undefined;
      };
      fail_refund_work: {
        Args: { p_code: string; p_lease: string; p_refund: string };
        Returns: undefined;
      };
      get_booking: { Args: { p_booking: string }; Returns: Json };
      get_booking_refunds: { Args: { p_booking: string }; Returns: Json };
      get_checkout: { Args: { p_booking: string }; Returns: Json };
      is_public_listing: { Args: { listing: string }; Returns: boolean };
      list_chat_messages: {
        Args: { p_before?: string; p_conversation: string; p_limit?: number };
        Returns: Json;
      };
      list_my_bookings: {
        Args: {
          p_page?: number;
          p_page_size?: number;
          p_role?: string;
          p_status?: Database["public"]["Enums"]["booking_status"];
        };
        Returns: Json;
      };
      list_my_conversations: {
        Args: { p_page?: number; p_page_size?: number };
        Returns: Json;
      };
      list_my_notifications: {
        Args: { p_page?: number; p_page_size?: number; p_unread?: boolean };
        Returns: Json;
      };
      list_payment_history: {
        Args: {
          p_from?: string;
          p_page?: number;
          p_page_size?: number;
          p_role?: string;
          p_to?: string;
          p_type?: string;
        };
        Returns: Json;
      };
      mark_chat_read: {
        Args: { p_conversation: string; p_through: string };
        Returns: Json;
      };
      mark_notification_read: {
        Args: { p_notification: string };
        Returns: Json;
      };
      notification_json: {
        Args: {
          n: Omit<
            Database["public"]["Tables"]["notifications"]["Row"],
            Database["public"]["Tables"]["notifications"]["ComputedFields"]
          >;
        };
        Returns: Json;
      };
      open_booking_chat: { Args: { p_booking: string }; Returns: Json };
      paid_cancellation_allowed: {
        Args: {
          actor: string;
          at_time: string;
          b: Omit<
            Database["public"]["Tables"]["bookings"]["Row"],
            Database["public"]["Tables"]["bookings"]["ComputedFields"]
          >;
        };
        Returns: boolean;
      };
      prepare_checkout: {
        Args: { p_booking: string; p_policy: string };
        Returns: Json;
      };
      queue_receipt_refund: { Args: { p_receipt: string }; Returns: undefined };
      refund_payload: {
        Args: {
          b: Omit<
            Database["public"]["Tables"]["bookings"]["Row"],
            Database["public"]["Tables"]["bookings"]["ComputedFields"]
          >;
        };
        Returns: Json;
      };
      request_booking: {
        Args: {
          p_listing: string;
          p_pickup: string;
          p_request_key: string;
          p_return: string;
        };
        Returns: Json;
      };
      save_my_profile: {
        Args: { p_display_name: string; p_phone?: string };
        Returns: undefined;
      };
      send_chat_message: {
        Args: { p_body: string; p_conversation: string; p_key: string };
        Returns: Json;
      };
      start_checkout_creation: {
        Args: { p_attempt: string; p_lease: string };
        Returns: undefined;
      };
      start_refund_creation: {
        Args: { p_lease: string; p_refund: string };
        Returns: undefined;
      };
      sync_checkout: {
        Args: { p_attempt: string; p_lease: string; p_snapshot: Json };
        Returns: string;
      };
      sync_refund: {
        Args: { p_lease: string; p_refund: string; p_snapshot: Json };
        Returns: string;
      };
      valid_catalog_attributes: {
        Args: { attrs: Json; category: string };
        Returns: boolean;
      };
    };
    Enums: {
      booking_status:
        | "requested"
        | "accepted"
        | "declined"
        | "expired"
        | "cancelled"
        | "paid"
        | "handed_over"
        | "returned"
        | "completed"
        | "disputed";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<
  keyof Database,
  "public"
>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      booking_status: [
        "requested",
        "accepted",
        "declined",
        "expired",
        "cancelled",
        "paid",
        "handed_over",
        "returned",
        "completed",
        "disputed",
      ],
    },
  },
} as const;
