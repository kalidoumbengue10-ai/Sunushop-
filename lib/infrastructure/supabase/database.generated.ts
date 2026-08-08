export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      addresses: {
        Row: {
          address_hint: string
          archived_at: string | null
          city: string
          created_at: string
          id: string
          is_default: boolean
          label: string
          latitude: number | null
          longitude: number | null
          owner_user_id: string
          phone: string
          recipient_name: string
          region: string
          updated_at: string
        }
        Insert: {
          address_hint: string
          archived_at?: string | null
          city: string
          created_at?: string
          id?: string
          is_default?: boolean
          label: string
          latitude?: number | null
          longitude?: number | null
          owner_user_id: string
          phone: string
          recipient_name: string
          region: string
          updated_at?: string
        }
        Update: {
          address_hint?: string
          archived_at?: string | null
          city?: string
          created_at?: string
          id?: string
          is_default?: boolean
          label?: string
          latitude?: number | null
          longitude?: number | null
          owner_user_id?: string
          phone?: string
          recipient_name?: string
          region?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "addresses_owner_user_id_fkey"
            columns: ["owner_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_roles: {
        Row: {
          active: boolean
          created_at: string
          role: Database["public"]["Enums"]["admin_role_kind"]
          user_id: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          role: Database["public"]["Enums"]["admin_role_kind"]
          user_id: string
        }
        Update: {
          active?: boolean
          created_at?: string
          role?: Database["public"]["Enums"]["admin_role_kind"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_roles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_events: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          entity_id: string
          entity_type: string
          id: number
          ip_hash: string | null
          merchant_id: string | null
          metadata: Json
          request_id: string | null
          user_agent_hash: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          entity_id: string
          entity_type: string
          id?: never
          ip_hash?: string | null
          merchant_id?: string | null
          metadata?: Json
          request_id?: string | null
          user_agent_hash?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          entity_id?: string
          entity_type?: string
          id?: never
          ip_hash?: string | null
          merchant_id?: string | null
          metadata?: Json
          request_id?: string | null
          user_agent_hash?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_events_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchant_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      cart_items: {
        Row: {
          cart_id: string
          created_at: string
          id: string
          merchant_id: string
          quantity: number
          updated_at: string
          variant_id: string
        }
        Insert: {
          cart_id: string
          created_at?: string
          id?: string
          merchant_id: string
          quantity: number
          updated_at?: string
          variant_id: string
        }
        Update: {
          cart_id?: string
          created_at?: string
          id?: string
          merchant_id?: string
          quantity?: number
          updated_at?: string
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cart_items_cart_id_fkey"
            columns: ["cart_id"]
            isOneToOne: false
            referencedRelation: "carts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cart_items_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchant_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cart_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      carts: {
        Row: {
          buyer_id: string
          created_at: string
          id: string
          status: string
          updated_at: string
        }
        Insert: {
          buyer_id: string
          created_at?: string
          id?: string
          status?: string
          updated_at?: string
        }
        Update: {
          buyer_id?: string
          created_at?: string
          id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "carts_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          active: boolean
          created_at: string
          description: string | null
          id: string
          name: string
          parent_id: string | null
          position: number
          slug: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          description?: string | null
          id?: string
          name: string
          parent_id?: string | null
          position?: number
          slug: string
        }
        Update: {
          active?: boolean
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          parent_id?: string | null
          position?: number
          slug?: string
        }
        Relationships: [
          {
            foreignKeyName: "categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      courier_memberships: {
        Row: {
          accepted_at: string
          courier_user_id: string
          created_at: string
          display_name: string
          id: string
          invited_by: string
          merchant_id: string
          phone: string
          status: Database["public"]["Enums"]["courier_membership_status"]
          updated_at: string
        }
        Insert: {
          accepted_at?: string
          courier_user_id: string
          created_at?: string
          display_name: string
          id?: string
          invited_by: string
          merchant_id: string
          phone: string
          status?: Database["public"]["Enums"]["courier_membership_status"]
          updated_at?: string
        }
        Update: {
          accepted_at?: string
          courier_user_id?: string
          created_at?: string
          display_name?: string
          id?: string
          invited_by?: string
          merchant_id?: string
          phone?: string
          status?: Database["public"]["Enums"]["courier_membership_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "courier_memberships_courier_user_id_fkey"
            columns: ["courier_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "courier_memberships_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "courier_memberships_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchant_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_lead_events: {
        Row: {
          actor_id: string | null
          created_at: string
          event_type: string
          from_status: Database["public"]["Enums"]["crm_lead_status"] | null
          id: string
          lead_id: string
          metadata: Json
          summary: string | null
          to_status: Database["public"]["Enums"]["crm_lead_status"] | null
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          event_type: string
          from_status?: Database["public"]["Enums"]["crm_lead_status"] | null
          id?: string
          lead_id: string
          metadata?: Json
          summary?: string | null
          to_status?: Database["public"]["Enums"]["crm_lead_status"] | null
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          event_type?: string
          from_status?: Database["public"]["Enums"]["crm_lead_status"] | null
          id?: string
          lead_id?: string
          metadata?: Json
          summary?: string | null
          to_status?: Database["public"]["Enums"]["crm_lead_status"] | null
        }
        Relationships: [
          {
            foreignKeyName: "crm_lead_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_lead_events_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "crm_leads"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_lead_notes: {
        Row: {
          author_id: string
          body: string
          created_at: string
          id: string
          lead_id: string
        }
        Insert: {
          author_id: string
          body: string
          created_at?: string
          id?: string
          lead_id: string
        }
        Update: {
          author_id?: string
          body?: string
          created_at?: string
          id?: string
          lead_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_lead_notes_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_lead_notes_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "crm_leads"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_leads: {
        Row: {
          business_name: string
          business_type: string | null
          city: string | null
          converted_at: string | null
          created_at: string
          email: string
          full_name: string
          id: string
          last_contacted_at: string | null
          merchant_id: string | null
          message: string | null
          metadata: Json
          next_follow_up_at: string | null
          owner_user_id: string | null
          phone: string | null
          priority: Database["public"]["Enums"]["crm_lead_priority"]
          sales_channel: string | null
          source: string
          status: Database["public"]["Enums"]["crm_lead_status"]
          updated_at: string
        }
        Insert: {
          business_name: string
          business_type?: string | null
          city?: string | null
          converted_at?: string | null
          created_at?: string
          email: string
          full_name: string
          id?: string
          last_contacted_at?: string | null
          merchant_id?: string | null
          message?: string | null
          metadata?: Json
          next_follow_up_at?: string | null
          owner_user_id?: string | null
          phone?: string | null
          priority?: Database["public"]["Enums"]["crm_lead_priority"]
          sales_channel?: string | null
          source?: string
          status?: Database["public"]["Enums"]["crm_lead_status"]
          updated_at?: string
        }
        Update: {
          business_name?: string
          business_type?: string | null
          city?: string | null
          converted_at?: string | null
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          last_contacted_at?: string | null
          merchant_id?: string | null
          message?: string | null
          metadata?: Json
          next_follow_up_at?: string | null
          owner_user_id?: string | null
          phone?: string | null
          priority?: Database["public"]["Enums"]["crm_lead_priority"]
          sales_channel?: string | null
          source?: string
          status?: Database["public"]["Enums"]["crm_lead_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_leads_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchant_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_leads_owner_user_id_fkey"
            columns: ["owner_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_tasks: {
        Row: {
          assigned_to: string | null
          completed_at: string | null
          created_at: string
          created_by: string
          due_at: string | null
          id: string
          lead_id: string
          title: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          completed_at?: string | null
          created_at?: string
          created_by: string
          due_at?: string | null
          id?: string
          lead_id: string
          title: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string
          due_at?: string | null
          id?: string
          lead_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_tasks_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_tasks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_tasks_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "crm_leads"
            referencedColumns: ["id"]
          },
        ]
      }
      deliveries: {
        Row: {
          assigned_at: string
          assigned_by: string
          code_attempt_limit: number
          courier_membership_id: string
          created_at: string
          delivered_at: string | null
          failure_reason: string | null
          id: string
          merchant_id: string
          order_id: string
          pickup_code_attempts: number
          pickup_code_hash: string
          pickup_snapshot: Json
          pickup_verified_at: string | null
          recipient_code_attempts: number
          recipient_code_hash: string
          status: Database["public"]["Enums"]["delivery_status"]
          updated_at: string
        }
        Insert: {
          assigned_at?: string
          assigned_by: string
          code_attempt_limit?: number
          courier_membership_id: string
          created_at?: string
          delivered_at?: string | null
          failure_reason?: string | null
          id?: string
          merchant_id: string
          order_id: string
          pickup_code_attempts?: number
          pickup_code_hash: string
          pickup_snapshot: Json
          pickup_verified_at?: string | null
          recipient_code_attempts?: number
          recipient_code_hash: string
          status?: Database["public"]["Enums"]["delivery_status"]
          updated_at?: string
        }
        Update: {
          assigned_at?: string
          assigned_by?: string
          code_attempt_limit?: number
          courier_membership_id?: string
          created_at?: string
          delivered_at?: string | null
          failure_reason?: string | null
          id?: string
          merchant_id?: string
          order_id?: string
          pickup_code_attempts?: number
          pickup_code_hash?: string
          pickup_snapshot?: Json
          pickup_verified_at?: string | null
          recipient_code_attempts?: number
          recipient_code_hash?: string
          status?: Database["public"]["Enums"]["delivery_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "deliveries_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deliveries_courier_membership_id_fkey"
            columns: ["courier_membership_id"]
            isOneToOne: false
            referencedRelation: "courier_memberships"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deliveries_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchant_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deliveries_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: true
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_category_rates: {
        Row: {
          category_id: string
          created_at: string
          delivery_zone_id: string
          fee_xof: number
          id: string
          merchant_id: string
          updated_at: string
        }
        Insert: {
          category_id: string
          created_at?: string
          delivery_zone_id: string
          fee_xof: number
          id?: string
          merchant_id: string
          updated_at?: string
        }
        Update: {
          category_id?: string
          created_at?: string
          delivery_zone_id?: string
          fee_xof?: number
          id?: string
          merchant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "delivery_category_rates_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_category_rates_delivery_zone_id_fkey"
            columns: ["delivery_zone_id"]
            isOneToOne: false
            referencedRelation: "delivery_zones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_category_rates_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchant_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_events: {
        Row: {
          actor_id: string | null
          created_at: string
          delivery_id: string
          from_status: Database["public"]["Enums"]["delivery_status"] | null
          id: number
          internal_note: string | null
          merchant_id: string
          metadata: Json
          public_message: string | null
          to_status: Database["public"]["Enums"]["delivery_status"]
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          delivery_id: string
          from_status?: Database["public"]["Enums"]["delivery_status"] | null
          id?: never
          internal_note?: string | null
          merchant_id: string
          metadata?: Json
          public_message?: string | null
          to_status: Database["public"]["Enums"]["delivery_status"]
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          delivery_id?: string
          from_status?: Database["public"]["Enums"]["delivery_status"] | null
          id?: never
          internal_note?: string | null
          merchant_id?: string
          metadata?: Json
          public_message?: string | null
          to_status?: Database["public"]["Enums"]["delivery_status"]
        }
        Relationships: [
          {
            foreignKeyName: "delivery_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_events_delivery_id_fkey"
            columns: ["delivery_id"]
            isOneToOne: false
            referencedRelation: "deliveries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_events_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchant_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_methods: {
        Row: {
          active: boolean
          created_at: string
          id: string
          instructions: string | null
          kind: Database["public"]["Enums"]["delivery_method_kind"]
          merchant_id: string
          name: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          instructions?: string | null
          kind: Database["public"]["Enums"]["delivery_method_kind"]
          merchant_id: string
          name: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          instructions?: string | null
          kind?: Database["public"]["Enums"]["delivery_method_kind"]
          merchant_id?: string
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "delivery_methods_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchant_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_quotes: {
        Row: {
          buyer_id: string
          created_at: string
          delivery_fee_xof: number
          delivery_zone_id: string
          expires_at: string
          id: string
          items_hash: string
          max_delivery_at: string | null
          merchant_id: string
          min_delivery_at: string | null
          subtotal_xof: number
          total_xof: number
        }
        Insert: {
          buyer_id: string
          created_at?: string
          delivery_fee_xof: number
          delivery_zone_id: string
          expires_at: string
          id?: string
          items_hash: string
          max_delivery_at?: string | null
          merchant_id: string
          min_delivery_at?: string | null
          subtotal_xof: number
          total_xof: number
        }
        Update: {
          buyer_id?: string
          created_at?: string
          delivery_fee_xof?: number
          delivery_zone_id?: string
          expires_at?: string
          id?: string
          items_hash?: string
          max_delivery_at?: string | null
          merchant_id?: string
          min_delivery_at?: string | null
          subtotal_xof?: number
          total_xof?: number
        }
        Relationships: [
          {
            foreignKeyName: "delivery_quotes_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_quotes_delivery_zone_id_fkey"
            columns: ["delivery_zone_id"]
            isOneToOne: false
            referencedRelation: "delivery_zones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_quotes_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchant_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_zones: {
        Row: {
          active: boolean
          city: string | null
          created_at: string
          delivery_method_id: string
          fee_xof: number
          id: string
          label: string
          max_delay_minutes: number
          merchant_id: string
          min_delay_minutes: number
          region: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          city?: string | null
          created_at?: string
          delivery_method_id: string
          fee_xof: number
          id?: string
          label: string
          max_delay_minutes: number
          merchant_id: string
          min_delay_minutes: number
          region: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          city?: string | null
          created_at?: string
          delivery_method_id?: string
          fee_xof?: number
          id?: string
          label?: string
          max_delay_minutes?: number
          merchant_id?: string
          min_delay_minutes?: number
          region?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "delivery_zones_delivery_method_id_fkey"
            columns: ["delivery_method_id"]
            isOneToOne: false
            referencedRelation: "delivery_methods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_zones_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchant_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      direct_payment_declarations: {
        Row: {
          amount_xof: number
          buyer_id: string
          channel: Database["public"]["Enums"]["payment_channel"]
          confirmed_by_merchant_at: string | null
          created_at: string
          declared_at: string
          external_reference: string
          id: string
          merchant_id: string
          order_id: string
        }
        Insert: {
          amount_xof: number
          buyer_id: string
          channel: Database["public"]["Enums"]["payment_channel"]
          confirmed_by_merchant_at?: string | null
          created_at?: string
          declared_at: string
          external_reference: string
          id?: string
          merchant_id: string
          order_id: string
        }
        Update: {
          amount_xof?: number
          buyer_id?: string
          channel?: Database["public"]["Enums"]["payment_channel"]
          confirmed_by_merchant_at?: string | null
          created_at?: string
          declared_at?: string
          external_reference?: string
          id?: string
          merchant_id?: string
          order_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "direct_payment_declarations_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "direct_payment_declarations_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchant_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "direct_payment_declarations_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_items: {
        Row: {
          available_quantity: number
          low_stock_threshold: number
          merchant_id: string
          reserved_quantity: number
          updated_at: string
          variant_id: string
          version: number
        }
        Insert: {
          available_quantity?: number
          low_stock_threshold?: number
          merchant_id: string
          reserved_quantity?: number
          updated_at?: string
          variant_id: string
          version?: number
        }
        Update: {
          available_quantity?: number
          low_stock_threshold?: number
          merchant_id?: string
          reserved_quantity?: number
          updated_at?: string
          variant_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "inventory_items_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchant_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: true
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      merchant_accounts: {
        Row: {
          address_hint: string | null
          city: string | null
          closed_at: string | null
          created_at: string
          description: string | null
          email: string | null
          id: string
          kind: Database["public"]["Enums"]["merchant_kind"]
          legal_name: string | null
          ninea: string | null
          orange_money_payment_number: string | null
          owner_user_id: string
          phone: string
          pickup_address_line: string | null
          pickup_enabled: boolean
          pickup_hours: string | null
          pickup_instructions: string | null
          pickup_latitude: number | null
          pickup_longitude: number | null
          public_name: string
          rccm: string | null
          region: string | null
          representative_is_legal_owner: boolean
          slug: string
          status: Database["public"]["Enums"]["merchant_status"]
          subscription_status: Database["public"]["Enums"]["subscription_status"]
          updated_at: string
          verification_status: Database["public"]["Enums"]["verification_status"]
          wave_payment_number: string | null
        }
        Insert: {
          address_hint?: string | null
          city?: string | null
          closed_at?: string | null
          created_at?: string
          description?: string | null
          email?: string | null
          id?: string
          kind: Database["public"]["Enums"]["merchant_kind"]
          legal_name?: string | null
          ninea?: string | null
          orange_money_payment_number?: string | null
          owner_user_id: string
          phone: string
          pickup_address_line?: string | null
          pickup_enabled?: boolean
          pickup_hours?: string | null
          pickup_instructions?: string | null
          pickup_latitude?: number | null
          pickup_longitude?: number | null
          public_name: string
          rccm?: string | null
          region?: string | null
          representative_is_legal_owner?: boolean
          slug: string
          status?: Database["public"]["Enums"]["merchant_status"]
          subscription_status?: Database["public"]["Enums"]["subscription_status"]
          updated_at?: string
          verification_status?: Database["public"]["Enums"]["verification_status"]
          wave_payment_number?: string | null
        }
        Update: {
          address_hint?: string | null
          city?: string | null
          closed_at?: string | null
          created_at?: string
          description?: string | null
          email?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["merchant_kind"]
          legal_name?: string | null
          ninea?: string | null
          orange_money_payment_number?: string | null
          owner_user_id?: string
          phone?: string
          pickup_address_line?: string | null
          pickup_enabled?: boolean
          pickup_hours?: string | null
          pickup_instructions?: string | null
          pickup_latitude?: number | null
          pickup_longitude?: number | null
          public_name?: string
          rccm?: string | null
          region?: string | null
          representative_is_legal_owner?: boolean
          slug?: string
          status?: Database["public"]["Enums"]["merchant_status"]
          subscription_status?: Database["public"]["Enums"]["subscription_status"]
          updated_at?: string
          verification_status?: Database["public"]["Enums"]["verification_status"]
          wave_payment_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "merchant_accounts_owner_user_id_fkey"
            columns: ["owner_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      merchant_media: {
        Row: {
          created_at: string
          id: string
          kind: Database["public"]["Enums"]["merchant_media_kind"]
          merchant_id: string
          mime_type: string
          size_bytes: number
          storage_bucket: string
          storage_path: string
          updated_at: string
          uploaded_by: string
        }
        Insert: {
          created_at?: string
          id?: string
          kind: Database["public"]["Enums"]["merchant_media_kind"]
          merchant_id: string
          mime_type: string
          size_bytes: number
          storage_bucket?: string
          storage_path: string
          updated_at?: string
          uploaded_by: string
        }
        Update: {
          created_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["merchant_media_kind"]
          merchant_id?: string
          mime_type?: string
          size_bytes?: number
          storage_bucket?: string
          storage_path?: string
          updated_at?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "merchant_media_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchant_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "merchant_media_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      merchant_members: {
        Row: {
          active: boolean
          created_at: string
          merchant_id: string
          role: Database["public"]["Enums"]["merchant_member_role"]
          user_id: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          merchant_id: string
          role: Database["public"]["Enums"]["merchant_member_role"]
          user_id: string
        }
        Update: {
          active?: boolean
          created_at?: string
          merchant_id?: string
          role?: Database["public"]["Enums"]["merchant_member_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "merchant_members_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchant_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "merchant_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      merchant_order_counters: {
        Row: {
          merchant_id: string
          next_number: number
          updated_at: string
        }
        Insert: {
          merchant_id: string
          next_number: number
          updated_at?: string
        }
        Update: {
          merchant_id?: string
          next_number?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "merchant_order_counters_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: true
            referencedRelation: "merchant_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      merchant_payouts: {
        Row: {
          amount_xof: number
          attempts: number
          created_at: string
          destination_number: string
          escrow_id: string
          external_id: string
          failed_at: string | null
          id: string
          id_transfer: string | null
          last_error: string | null
          merchant_id: string
          paid_at: string | null
          sent_at: string | null
          service: string
          status: Database["public"]["Enums"]["payout_status"]
        }
        Insert: {
          amount_xof: number
          attempts?: number
          created_at?: string
          destination_number: string
          escrow_id: string
          external_id: string
          failed_at?: string | null
          id?: string
          id_transfer?: string | null
          last_error?: string | null
          merchant_id: string
          paid_at?: string | null
          sent_at?: string | null
          service: string
          status?: Database["public"]["Enums"]["payout_status"]
        }
        Update: {
          amount_xof?: number
          attempts?: number
          created_at?: string
          destination_number?: string
          escrow_id?: string
          external_id?: string
          failed_at?: string | null
          id?: string
          id_transfer?: string | null
          last_error?: string | null
          merchant_id?: string
          paid_at?: string | null
          sent_at?: string | null
          service?: string
          status?: Database["public"]["Enums"]["payout_status"]
        }
        Relationships: [
          {
            foreignKeyName: "merchant_payouts_escrow_id_fkey"
            columns: ["escrow_id"]
            isOneToOne: true
            referencedRelation: "payment_escrows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "merchant_payouts_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchant_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      merchant_subscriptions: {
        Row: {
          cancelled_at: string | null
          created_at: string
          current_period_ends_at: string | null
          grace_ends_at: string | null
          id: string
          merchant_id: string
          plan_id: string
          starts_at: string | null
          status: Database["public"]["Enums"]["subscription_status"]
          updated_at: string
        }
        Insert: {
          cancelled_at?: string | null
          created_at?: string
          current_period_ends_at?: string | null
          grace_ends_at?: string | null
          id?: string
          merchant_id: string
          plan_id: string
          starts_at?: string | null
          status?: Database["public"]["Enums"]["subscription_status"]
          updated_at?: string
        }
        Update: {
          cancelled_at?: string | null
          created_at?: string
          current_period_ends_at?: string | null
          grace_ends_at?: string | null
          id?: string
          merchant_id?: string
          plan_id?: string
          starts_at?: string | null
          status?: Database["public"]["Enums"]["subscription_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "merchant_subscriptions_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchant_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "merchant_subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "subscription_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_outbox: {
        Row: {
          attempts: number
          available_at: string
          channel: string
          created_at: string
          dedupe_key: string | null
          id: string
          last_error: string | null
          payload: Json
          processed_at: string | null
          recipient_user_id: string | null
          status: Database["public"]["Enums"]["notification_status"]
          template: string
        }
        Insert: {
          attempts?: number
          available_at?: string
          channel: string
          created_at?: string
          dedupe_key?: string | null
          id?: string
          last_error?: string | null
          payload: Json
          processed_at?: string | null
          recipient_user_id?: string | null
          status?: Database["public"]["Enums"]["notification_status"]
          template: string
        }
        Update: {
          attempts?: number
          available_at?: string
          channel?: string
          created_at?: string
          dedupe_key?: string | null
          id?: string
          last_error?: string | null
          payload?: Json
          processed_at?: string | null
          recipient_user_id?: string | null
          status?: Database["public"]["Enums"]["notification_status"]
          template?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_outbox_recipient_user_id_fkey"
            columns: ["recipient_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      order_batches: {
        Row: {
          buyer_id: string
          created_at: string
          id: string
          idempotency_key: string
          order_count: number
          public_code: string
          total_xof: number
        }
        Insert: {
          buyer_id: string
          created_at?: string
          id?: string
          idempotency_key: string
          order_count: number
          public_code: string
          total_xof: number
        }
        Update: {
          buyer_id?: string
          created_at?: string
          id?: string
          idempotency_key?: string
          order_count?: number
          public_code?: string
          total_xof?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_batches_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      order_events: {
        Row: {
          actor_id: string | null
          created_at: string
          from_status: Database["public"]["Enums"]["order_status"] | null
          id: number
          internal_note: string | null
          merchant_id: string
          metadata: Json
          order_id: string
          public_message: string | null
          to_status: Database["public"]["Enums"]["order_status"]
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          from_status?: Database["public"]["Enums"]["order_status"] | null
          id?: never
          internal_note?: string | null
          merchant_id: string
          metadata?: Json
          order_id: string
          public_message?: string | null
          to_status: Database["public"]["Enums"]["order_status"]
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          from_status?: Database["public"]["Enums"]["order_status"] | null
          id?: never
          internal_note?: string | null
          merchant_id?: string
          metadata?: Json
          order_id?: string
          public_message?: string | null
          to_status?: Database["public"]["Enums"]["order_status"]
        }
        Relationships: [
          {
            foreignKeyName: "order_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_events_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchant_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_events_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          created_at: string
          id: string
          line_total_xof: number | null
          merchant_id: string
          order_id: string
          product_id: string
          product_snapshot: Json
          quantity: number
          sku_snapshot: string
          unit_price_xof: number
          variant_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          line_total_xof?: number | null
          merchant_id: string
          order_id: string
          product_id: string
          product_snapshot: Json
          quantity: number
          sku_snapshot: string
          unit_price_xof: number
          variant_id: string
        }
        Update: {
          created_at?: string
          id?: string
          line_total_xof?: number | null
          merchant_id?: string
          order_id?: string
          product_id?: string
          product_snapshot?: Json
          quantity?: number
          sku_snapshot?: string
          unit_price_xof?: number
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_items_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchant_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          batch_id: string
          buyer_id: string
          cancelled_at: string | null
          created_at: string
          currency: string
          delivered_at: string | null
          delivery_fee_xof: number
          delivery_snapshot: Json
          id: string
          merchant_id: string
          merchant_sequence: number
          payment_instructions_snapshot: Json
          payment_method: Database["public"]["Enums"]["order_payment_method"]
          public_code: string
          recipient_snapshot: Json
          seller_confirm_by: string | null
          status: Database["public"]["Enums"]["order_status"]
          subtotal_xof: number
          total_xof: number
          updated_at: string
        }
        Insert: {
          batch_id: string
          buyer_id: string
          cancelled_at?: string | null
          created_at?: string
          currency?: string
          delivered_at?: string | null
          delivery_fee_xof: number
          delivery_snapshot: Json
          id?: string
          merchant_id: string
          merchant_sequence: number
          payment_instructions_snapshot?: Json
          payment_method: Database["public"]["Enums"]["order_payment_method"]
          public_code: string
          recipient_snapshot: Json
          seller_confirm_by?: string | null
          status?: Database["public"]["Enums"]["order_status"]
          subtotal_xof: number
          total_xof: number
          updated_at?: string
        }
        Update: {
          batch_id?: string
          buyer_id?: string
          cancelled_at?: string | null
          created_at?: string
          currency?: string
          delivered_at?: string | null
          delivery_fee_xof?: number
          delivery_snapshot?: Json
          id?: string
          merchant_id?: string
          merchant_sequence?: number
          payment_instructions_snapshot?: Json
          payment_method?: Database["public"]["Enums"]["order_payment_method"]
          public_code?: string
          recipient_snapshot?: Json
          seller_confirm_by?: string | null
          status?: Database["public"]["Enums"]["order_status"]
          subtotal_xof?: number
          total_xof?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "order_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchant_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_escrows: {
        Row: {
          amount_xof: number
          created_at: string
          dispute_opened_at: string | null
          dispute_reason: string | null
          dispute_resolution: string | null
          dispute_resolved_at: string | null
          held_at: string
          id: string
          merchant_id: string
          order_id: string
          payment_intent_id: string
          refunded_at: string | null
          releasable_at: string | null
          released_at: string | null
          released_by: string | null
          status: Database["public"]["Enums"]["escrow_status"]
        }
        Insert: {
          amount_xof: number
          created_at?: string
          dispute_opened_at?: string | null
          dispute_reason?: string | null
          dispute_resolution?: string | null
          dispute_resolved_at?: string | null
          held_at?: string
          id?: string
          merchant_id: string
          order_id: string
          payment_intent_id: string
          refunded_at?: string | null
          releasable_at?: string | null
          released_at?: string | null
          released_by?: string | null
          status?: Database["public"]["Enums"]["escrow_status"]
        }
        Update: {
          amount_xof?: number
          created_at?: string
          dispute_opened_at?: string | null
          dispute_reason?: string | null
          dispute_resolution?: string | null
          dispute_resolved_at?: string | null
          held_at?: string
          id?: string
          merchant_id?: string
          order_id?: string
          payment_intent_id?: string
          refunded_at?: string | null
          releasable_at?: string | null
          released_at?: string | null
          released_by?: string | null
          status?: Database["public"]["Enums"]["escrow_status"]
        }
        Relationships: [
          {
            foreignKeyName: "payment_escrows_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchant_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_escrows_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: true
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_escrows_payment_intent_id_fkey"
            columns: ["payment_intent_id"]
            isOneToOne: false
            referencedRelation: "payment_intents"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_intents: {
        Row: {
          amount_xof: number
          buyer_id: string
          cancelled_at: string | null
          client_phone: string | null
          created_at: string
          currency: string
          id: string
          kind: string
          merchant_id: string | null
          order_batch_id: string | null
          paid_at: string | null
          payment_method: string | null
          paytech_token: string | null
          plan_id: string | null
          redirect_url: string | null
          ref_command: string
          status: Database["public"]["Enums"]["payment_intent_status"]
        }
        Insert: {
          amount_xof: number
          buyer_id: string
          cancelled_at?: string | null
          client_phone?: string | null
          created_at?: string
          currency?: string
          id?: string
          kind: string
          merchant_id?: string | null
          order_batch_id?: string | null
          paid_at?: string | null
          payment_method?: string | null
          paytech_token?: string | null
          plan_id?: string | null
          redirect_url?: string | null
          ref_command: string
          status?: Database["public"]["Enums"]["payment_intent_status"]
        }
        Update: {
          amount_xof?: number
          buyer_id?: string
          cancelled_at?: string | null
          client_phone?: string | null
          created_at?: string
          currency?: string
          id?: string
          kind?: string
          merchant_id?: string | null
          order_batch_id?: string | null
          paid_at?: string | null
          payment_method?: string | null
          paytech_token?: string | null
          plan_id?: string | null
          redirect_url?: string | null
          ref_command?: string
          status?: Database["public"]["Enums"]["payment_intent_status"]
        }
        Relationships: [
          {
            foreignKeyName: "payment_intents_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_intents_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchant_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_intents_order_batch_id_fkey"
            columns: ["order_batch_id"]
            isOneToOne: false
            referencedRelation: "order_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_intents_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "subscription_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      product_media: {
        Row: {
          alt_text: string | null
          created_at: string
          id: string
          merchant_id: string
          position: number
          product_id: string
          storage_bucket: string
          storage_path: string
        }
        Insert: {
          alt_text?: string | null
          created_at?: string
          id?: string
          merchant_id: string
          position?: number
          product_id: string
          storage_bucket?: string
          storage_path: string
        }
        Update: {
          alt_text?: string | null
          created_at?: string
          id?: string
          merchant_id?: string
          position?: number
          product_id?: string
          storage_bucket?: string
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_media_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchant_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_media_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_variants: {
        Row: {
          active: boolean
          attributes: Json
          compare_at_price_xof: number | null
          created_at: string
          id: string
          merchant_id: string
          price_xof: number
          product_id: string
          sku: string
          title: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          attributes?: Json
          compare_at_price_xof?: number | null
          created_at?: string
          id?: string
          merchant_id: string
          price_xof: number
          product_id: string
          sku: string
          title?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          attributes?: Json
          compare_at_price_xof?: number | null
          created_at?: string
          id?: string
          merchant_id?: string
          price_xof?: number
          product_id?: string
          sku?: string
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_variants_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchant_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_variants_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          category_id: string
          created_at: string
          description: string
          id: string
          merchant_id: string
          option_names: string[]
          published_at: string | null
          slug: string
          status: Database["public"]["Enums"]["product_status"]
          title: string
          updated_at: string
        }
        Insert: {
          category_id: string
          created_at?: string
          description: string
          id?: string
          merchant_id: string
          option_names?: string[]
          published_at?: string | null
          slug: string
          status?: Database["public"]["Enums"]["product_status"]
          title: string
          updated_at?: string
        }
        Update: {
          category_id?: string
          created_at?: string
          description?: string
          id?: string
          merchant_id?: string
          option_names?: string[]
          published_at?: string | null
          slug?: string
          status?: Database["public"]["Enums"]["product_status"]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchant_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          email: string | null
          id: string
          locale: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          email?: string | null
          id: string
          locale?: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          locale?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      rate_limit_buckets: {
        Row: {
          action: string
          key_hash: string
          request_count: number
          updated_at: string
          window_started_at: string
        }
        Insert: {
          action: string
          key_hash: string
          request_count?: number
          updated_at?: string
          window_started_at: string
        }
        Update: {
          action?: string
          key_hash?: string
          request_count?: number
          updated_at?: string
          window_started_at?: string
        }
        Relationships: []
      }
      shop_follows: {
        Row: {
          buyer_id: string
          created_at: string
          id: string
          merchant_id: string
        }
        Insert: {
          buyer_id: string
          created_at?: string
          id?: string
          merchant_id: string
        }
        Update: {
          buyer_id?: string
          created_at?: string
          id?: string
          merchant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shop_follows_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shop_follows_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchant_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_grants: {
        Row: {
          created_at: string
          current_period_ends_at: string
          days: number
          granted_by: string
          id: string
          merchant_id: string
          plan_id: string
          reason: string
        }
        Insert: {
          created_at?: string
          current_period_ends_at: string
          days: number
          granted_by: string
          id?: string
          merchant_id: string
          plan_id: string
          reason: string
        }
        Update: {
          created_at?: string
          current_period_ends_at?: string
          days?: number
          granted_by?: string
          id?: string
          merchant_id?: string
          plan_id?: string
          reason?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscription_grants_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscription_grants_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchant_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscription_grants_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "subscription_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_payment_submissions: {
        Row: {
          amount_xof: number
          channel: Database["public"]["Enums"]["payment_channel"]
          created_at: string
          external_reference: string
          id: string
          merchant_id: string
          paid_at: string
          plan_id: string
          rejection_reason: string | null
          reviewed_at: string | null
          reviewer_id: string | null
          status: Database["public"]["Enums"]["payment_submission_status"]
          submitted_by: string
          subscription_id: string | null
        }
        Insert: {
          amount_xof: number
          channel: Database["public"]["Enums"]["payment_channel"]
          created_at?: string
          external_reference: string
          id?: string
          merchant_id: string
          paid_at: string
          plan_id: string
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewer_id?: string | null
          status?: Database["public"]["Enums"]["payment_submission_status"]
          submitted_by: string
          subscription_id?: string | null
        }
        Update: {
          amount_xof?: number
          channel?: Database["public"]["Enums"]["payment_channel"]
          created_at?: string
          external_reference?: string
          id?: string
          merchant_id?: string
          paid_at?: string
          plan_id?: string
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewer_id?: string | null
          status?: Database["public"]["Enums"]["payment_submission_status"]
          submitted_by?: string
          subscription_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "subscription_payment_submissions_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchant_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscription_payment_submissions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "subscription_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscription_payment_submissions_reviewer_id_fkey"
            columns: ["reviewer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscription_payment_submissions_submitted_by_fkey"
            columns: ["submitted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscription_payment_submissions_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "merchant_subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_plans: {
        Row: {
          active: boolean
          created_at: string
          id: string
          monthly_price_xof: number
          name: string
          position: number
          product_limit: number | null
          team_member_limit: number
        }
        Insert: {
          active?: boolean
          created_at?: string
          id: string
          monthly_price_xof: number
          name: string
          position?: number
          product_limit?: number | null
          team_member_limit?: number
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          monthly_price_xof?: number
          name?: string
          position?: number
          product_limit?: number | null
          team_member_limit?: number
        }
        Relationships: []
      }
      verification_cases: {
        Row: {
          assigned_reviewer_id: string | null
          created_at: string
          decided_at: string | null
          decision_code: string | null
          id: string
          internal_note: string | null
          merchant_id: string
          merchant_note: string | null
          review_started_at: string | null
          status: Database["public"]["Enums"]["verification_status"]
          submission_version: number
          submitted_at: string | null
          updated_at: string
        }
        Insert: {
          assigned_reviewer_id?: string | null
          created_at?: string
          decided_at?: string | null
          decision_code?: string | null
          id?: string
          internal_note?: string | null
          merchant_id: string
          merchant_note?: string | null
          review_started_at?: string | null
          status?: Database["public"]["Enums"]["verification_status"]
          submission_version?: number
          submitted_at?: string | null
          updated_at?: string
        }
        Update: {
          assigned_reviewer_id?: string | null
          created_at?: string
          decided_at?: string | null
          decision_code?: string | null
          id?: string
          internal_note?: string | null
          merchant_id?: string
          merchant_note?: string | null
          review_started_at?: string | null
          status?: Database["public"]["Enums"]["verification_status"]
          submission_version?: number
          submitted_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "verification_cases_assigned_reviewer_id_fkey"
            columns: ["assigned_reviewer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "verification_cases_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchant_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      verification_documents: {
        Row: {
          case_id: string
          document_type: Database["public"]["Enums"]["verification_document_type"]
          expires_on: string | null
          id: string
          merchant_id: string
          mime_type: string
          purged_at: string | null
          reviewed_at: string | null
          sha256: string | null
          size_bytes: number
          status: Database["public"]["Enums"]["verification_document_status"]
          storage_bucket: string
          storage_path: string | null
          uploaded_at: string
          uploaded_by: string
          version: number
        }
        Insert: {
          case_id: string
          document_type: Database["public"]["Enums"]["verification_document_type"]
          expires_on?: string | null
          id?: string
          merchant_id: string
          mime_type: string
          purged_at?: string | null
          reviewed_at?: string | null
          sha256?: string | null
          size_bytes: number
          status?: Database["public"]["Enums"]["verification_document_status"]
          storage_bucket?: string
          storage_path?: string | null
          uploaded_at?: string
          uploaded_by: string
          version: number
        }
        Update: {
          case_id?: string
          document_type?: Database["public"]["Enums"]["verification_document_type"]
          expires_on?: string | null
          id?: string
          merchant_id?: string
          mime_type?: string
          purged_at?: string | null
          reviewed_at?: string | null
          sha256?: string | null
          size_bytes?: number
          status?: Database["public"]["Enums"]["verification_document_status"]
          storage_bucket?: string
          storage_path?: string | null
          uploaded_at?: string
          uploaded_by?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "verification_documents_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "verification_cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "verification_documents_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchant_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "verification_documents_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      verification_events: {
        Row: {
          actor_id: string | null
          case_id: string
          created_at: string
          event_type: string
          from_status: Database["public"]["Enums"]["verification_status"] | null
          id: number
          merchant_id: string
          metadata: Json
          public_message: string | null
          to_status: Database["public"]["Enums"]["verification_status"] | null
        }
        Insert: {
          actor_id?: string | null
          case_id: string
          created_at?: string
          event_type: string
          from_status?:
            | Database["public"]["Enums"]["verification_status"]
            | null
          id?: never
          merchant_id: string
          metadata?: Json
          public_message?: string | null
          to_status?: Database["public"]["Enums"]["verification_status"] | null
        }
        Update: {
          actor_id?: string | null
          case_id?: string
          created_at?: string
          event_type?: string
          from_status?:
            | Database["public"]["Enums"]["verification_status"]
            | null
          id?: never
          merchant_id?: string
          metadata?: Json
          public_message?: string | null
          to_status?: Database["public"]["Enums"]["verification_status"] | null
        }
        Relationships: [
          {
            foreignKeyName: "verification_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "verification_events_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "verification_cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "verification_events_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchant_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      verification_reviews: {
        Row: {
          case_id: string
          created_at: string
          id: string
          internal_note: string | null
          merchant_message: string | null
          outcome: Database["public"]["Enums"]["verification_status"]
          reason_code: string | null
          reviewer_id: string
        }
        Insert: {
          case_id: string
          created_at?: string
          id?: string
          internal_note?: string | null
          merchant_message?: string | null
          outcome: Database["public"]["Enums"]["verification_status"]
          reason_code?: string | null
          reviewer_id: string
        }
        Update: {
          case_id?: string
          created_at?: string
          id?: string
          internal_note?: string | null
          merchant_message?: string | null
          outcome?: Database["public"]["Enums"]["verification_status"]
          reason_code?: string | null
          reviewer_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "verification_reviews_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "verification_cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "verification_reviews_reviewer_id_fkey"
            columns: ["reviewer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      webhook_events: {
        Row: {
          created_at: string
          error_message: string | null
          failed_at: string | null
          id: string
          payload: Json | null
          payload_sha256: string
          processed_at: string | null
          provider: string
          provider_event_id: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          failed_at?: string | null
          id?: string
          payload?: Json | null
          payload_sha256: string
          processed_at?: string | null
          provider: string
          provider_event_id: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          failed_at?: string | null
          id?: string
          payload?: Json | null
          payload_sha256?: string
          processed_at?: string | null
          provider?: string
          provider_event_id?: string
        }
        Relationships: []
      }
      workspace_invitations: {
        Row: {
          claimed_at: string | null
          claimed_by: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string | null
          kind: Database["public"]["Enums"]["workspace_invitation_kind"]
          lead_id: string | null
          merchant_id: string | null
          payload: Json
          status: Database["public"]["Enums"]["workspace_invitation_status"]
          token_hash: string
          updated_at: string
        }
        Insert: {
          claimed_at?: string | null
          claimed_by?: string | null
          created_at?: string
          email: string
          expires_at: string
          id?: string
          invited_by?: string | null
          kind: Database["public"]["Enums"]["workspace_invitation_kind"]
          lead_id?: string | null
          merchant_id?: string | null
          payload?: Json
          status?: Database["public"]["Enums"]["workspace_invitation_status"]
          token_hash: string
          updated_at?: string
        }
        Update: {
          claimed_at?: string | null
          claimed_by?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          kind?: Database["public"]["Enums"]["workspace_invitation_kind"]
          lead_id?: string | null
          merchant_id?: string | null
          payload?: Json
          status?: Database["public"]["Enums"]["workspace_invitation_status"]
          token_hash?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_invitations_claimed_by_fkey"
            columns: ["claimed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_invitations_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_invitations_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "crm_leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_invitations_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchant_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      activate_subscription_from_payment: {
        Args: {
          p_amount_xof: number
          p_paytech_token: string
          p_ref_command: string
        }
        Returns: {
          cancelled_at: string | null
          created_at: string
          current_period_ends_at: string | null
          grace_ends_at: string | null
          id: string
          merchant_id: string
          plan_id: string
          starts_at: string | null
          status: Database["public"]["Enums"]["subscription_status"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "merchant_subscriptions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      admin_activate_test_subscription: {
        Args: { p_days?: number; p_merchant_id: string; p_plan_id?: string }
        Returns: {
          cancelled_at: string | null
          created_at: string
          current_period_ends_at: string | null
          grace_ends_at: string | null
          id: string
          merchant_id: string
          plan_id: string
          starts_at: string | null
          status: Database["public"]["Enums"]["subscription_status"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "merchant_subscriptions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      admin_grant_subscription: {
        Args: {
          p_days: number
          p_merchant_id: string
          p_plan_id: string
          p_reason: string
        }
        Returns: {
          cancelled_at: string | null
          created_at: string
          current_period_ends_at: string | null
          grace_ends_at: string | null
          id: string
          merchant_id: string
          plan_id: string
          starts_at: string | null
          status: Database["public"]["Enums"]["subscription_status"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "merchant_subscriptions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      admin_period_analytics: {
        Args: { p_from: string; p_to: string }
        Returns: {
          approved_payments_count: number
          delivered_units: number
          product_revenue_xof: number
          subscription_revenue_xof: number
          top_sellers: Json
        }[]
      }
      capture_order_payment: {
        Args: {
          p_amount_xof: number
          p_client_phone?: string
          p_payment_method?: string
          p_paytech_token: string
          p_ref_command: string
        }
        Returns: {
          amount_xof: number
          buyer_id: string
          cancelled_at: string | null
          client_phone: string | null
          created_at: string
          currency: string
          id: string
          kind: string
          merchant_id: string | null
          order_batch_id: string | null
          paid_at: string | null
          payment_method: string | null
          paytech_token: string | null
          plan_id: string | null
          redirect_url: string | null
          ref_command: string
          status: Database["public"]["Enums"]["payment_intent_status"]
        }
        SetofOptions: {
          from: "*"
          to: "payment_intents"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      complete_delivery_stage: {
        Args: { p_actor_id: string; p_delivery_id: string; p_stage: string }
        Returns: {
          assigned_at: string
          assigned_by: string
          code_attempt_limit: number
          courier_membership_id: string
          created_at: string
          delivered_at: string | null
          failure_reason: string | null
          id: string
          merchant_id: string
          order_id: string
          pickup_code_attempts: number
          pickup_code_hash: string
          pickup_snapshot: Json
          pickup_verified_at: string | null
          recipient_code_attempts: number
          recipient_code_hash: string
          status: Database["public"]["Enums"]["delivery_status"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "deliveries"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      confirm_direct_payment: {
        Args: { p_declaration_id: string }
        Returns: undefined
      }
      confirm_order_reception: {
        Args: { p_order_id: string }
        Returns: {
          amount_xof: number
          created_at: string
          dispute_opened_at: string | null
          dispute_reason: string | null
          dispute_resolution: string | null
          dispute_resolved_at: string | null
          held_at: string
          id: string
          merchant_id: string
          order_id: string
          payment_intent_id: string
          refunded_at: string | null
          releasable_at: string | null
          released_at: string | null
          released_by: string | null
          status: Database["public"]["Enums"]["escrow_status"]
        }
        SetofOptions: {
          from: "*"
          to: "payment_escrows"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      consume_rate_limit: {
        Args: {
          p_action: string
          p_key_hash: string
          p_max_requests: number
          p_window_seconds: number
        }
        Returns: boolean
      }
      create_delivery_zone: {
        Args: {
          p_city: string
          p_fee_xof: number
          p_label: string
          p_max_delay_minutes: number
          p_merchant_id: string
          p_method_kind: Database["public"]["Enums"]["delivery_method_kind"]
          p_method_name: string
          p_min_delay_minutes: number
          p_region: string
        }
        Returns: Json
      }
      create_merchant_application: {
        Args: {
          p_address_hint?: string
          p_city?: string
          p_email?: string
          p_kind: Database["public"]["Enums"]["merchant_kind"]
          p_legal_name?: string
          p_phone: string
          p_public_name: string
          p_region?: string
          p_representative_is_legal_owner?: boolean
          p_slug: string
        }
        Returns: Json
      }
      create_merchant_product: {
        Args: {
          p_category_id: string
          p_compare_at_price_xof: number
          p_description: string
          p_merchant_id: string
          p_price_xof: number
          p_publish?: boolean
          p_sku: string
          p_slug: string
          p_stock: number
          p_title: string
          p_variant_title: string
        }
        Returns: Json
      }
      create_order_batch: {
        Args: { p_groups: Json; p_idempotency_key: string; p_recipient: Json }
        Returns: Json
      }
      create_order_payment_intent: {
        Args: {
          p_amount_xof: number
          p_order_batch_id: string
          p_ref_command: string
        }
        Returns: {
          amount_xof: number
          buyer_id: string
          cancelled_at: string | null
          client_phone: string | null
          created_at: string
          currency: string
          id: string
          kind: string
          merchant_id: string | null
          order_batch_id: string | null
          paid_at: string | null
          payment_method: string | null
          paytech_token: string | null
          plan_id: string | null
          redirect_url: string | null
          ref_command: string
          status: Database["public"]["Enums"]["payment_intent_status"]
        }
        SetofOptions: {
          from: "*"
          to: "payment_intents"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      declare_direct_payment: {
        Args: {
          p_amount_xof: number
          p_channel: Database["public"]["Enums"]["payment_channel"]
          p_declared_at: string
          p_external_reference: string
          p_order_id: string
        }
        Returns: string
      }
      document_retention_candidates: {
        Args: { p_closed_days?: number; p_rejected_days?: number }
        Returns: {
          document_id: string
          storage_bucket: string
          storage_path: string
        }[]
      }
      generate_public_code: { Args: { p_prefix: string }; Returns: string }
      has_aal2: { Args: never; Returns: boolean }
      has_admin_role: {
        Args: { p_roles?: Database["public"]["Enums"]["admin_role_kind"][] }
        Returns: boolean
      }
      is_merchant_member: {
        Args: {
          p_merchant_id: string
          p_roles?: Database["public"]["Enums"]["merchant_member_role"][]
        }
        Returns: boolean
      }
      latest_verification_document_exists: {
        Args: {
          p_case_id: string
          p_type: Database["public"]["Enums"]["verification_document_type"]
        }
        Returns: boolean
      }
      mark_escrow_refunded: {
        Args: { p_order_id: string }
        Returns: {
          amount_xof: number
          created_at: string
          dispute_opened_at: string | null
          dispute_reason: string | null
          dispute_resolution: string | null
          dispute_resolved_at: string | null
          held_at: string
          id: string
          merchant_id: string
          order_id: string
          payment_intent_id: string
          refunded_at: string | null
          releasable_at: string | null
          released_at: string | null
          released_by: string | null
          status: Database["public"]["Enums"]["escrow_status"]
        }
        SetofOptions: {
          from: "*"
          to: "payment_escrows"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      mark_payout_failed: {
        Args: { p_error?: string; p_external_id: string }
        Returns: {
          amount_xof: number
          attempts: number
          created_at: string
          destination_number: string
          escrow_id: string
          external_id: string
          failed_at: string | null
          id: string
          id_transfer: string | null
          last_error: string | null
          merchant_id: string
          paid_at: string | null
          sent_at: string | null
          service: string
          status: Database["public"]["Enums"]["payout_status"]
        }
        SetofOptions: {
          from: "*"
          to: "merchant_payouts"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      mark_payout_paid: {
        Args: { p_external_id: string; p_id_transfer?: string }
        Returns: {
          amount_xof: number
          attempts: number
          created_at: string
          destination_number: string
          escrow_id: string
          external_id: string
          failed_at: string | null
          id: string
          id_transfer: string | null
          last_error: string | null
          merchant_id: string
          paid_at: string | null
          sent_at: string | null
          service: string
          status: Database["public"]["Enums"]["payout_status"]
        }
        SetofOptions: {
          from: "*"
          to: "merchant_payouts"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      mark_payout_sent: {
        Args: { p_external_id: string }
        Returns: {
          amount_xof: number
          attempts: number
          created_at: string
          destination_number: string
          escrow_id: string
          external_id: string
          failed_at: string | null
          id: string
          id_transfer: string | null
          last_error: string | null
          merchant_id: string
          paid_at: string | null
          sent_at: string | null
          service: string
          status: Database["public"]["Enums"]["payout_status"]
        }
        SetofOptions: {
          from: "*"
          to: "merchant_payouts"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      mark_verification_document_purged: {
        Args: { p_document_id: string }
        Returns: undefined
      }
      open_order_dispute: {
        Args: { p_order_id: string; p_reason: string }
        Returns: {
          amount_xof: number
          created_at: string
          dispute_opened_at: string | null
          dispute_reason: string | null
          dispute_resolution: string | null
          dispute_resolved_at: string | null
          held_at: string
          id: string
          merchant_id: string
          order_id: string
          payment_intent_id: string
          refunded_at: string | null
          releasable_at: string | null
          released_at: string | null
          released_by: string | null
          status: Database["public"]["Enums"]["escrow_status"]
        }
        SetofOptions: {
          from: "*"
          to: "payment_escrows"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      refresh_subscription_states: { Args: never; Returns: number }
      release_due_escrows: { Args: { p_limit?: number }; Returns: Json }
      resolve_order_dispute: {
        Args: { p_note?: string; p_order_id: string; p_resolution: string }
        Returns: {
          amount_xof: number
          created_at: string
          dispute_opened_at: string | null
          dispute_reason: string | null
          dispute_resolution: string | null
          dispute_resolved_at: string | null
          held_at: string
          id: string
          merchant_id: string
          order_id: string
          payment_intent_id: string
          refunded_at: string | null
          releasable_at: string | null
          released_at: string | null
          released_by: string | null
          status: Database["public"]["Enums"]["escrow_status"]
        }
        SetofOptions: {
          from: "*"
          to: "payment_escrows"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      review_subscription_payment: {
        Args: {
          p_approved: boolean
          p_rejection_reason?: string
          p_submission_id: string
        }
        Returns: {
          amount_xof: number
          channel: Database["public"]["Enums"]["payment_channel"]
          created_at: string
          external_reference: string
          id: string
          merchant_id: string
          paid_at: string
          plan_id: string
          rejection_reason: string | null
          reviewed_at: string | null
          reviewer_id: string | null
          status: Database["public"]["Enums"]["payment_submission_status"]
          submitted_by: string
          subscription_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "subscription_payment_submissions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      review_verification_case: {
        Args: {
          p_case_id: string
          p_internal_note?: string
          p_merchant_message?: string
          p_outcome: Database["public"]["Enums"]["verification_status"]
          p_reason_code?: string
        }
        Returns: {
          assigned_reviewer_id: string | null
          created_at: string
          decided_at: string | null
          decision_code: string | null
          id: string
          internal_note: string | null
          merchant_id: string
          merchant_note: string | null
          review_started_at: string | null
          status: Database["public"]["Enums"]["verification_status"]
          submission_version: number
          submitted_at: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "verification_cases"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      save_merchant_product_variants: {
        Args: {
          p_category_id: string
          p_description: string
          p_option_names?: string[]
          p_product_id: string
          p_title: string
          p_variants: Json
        }
        Returns: Json
      }
      set_merchant_product_publication: {
        Args: { p_product_id: string; p_publish: boolean }
        Returns: {
          category_id: string
          created_at: string
          description: string
          id: string
          merchant_id: string
          published_at: string | null
          slug: string
          status: Database["public"]["Enums"]["product_status"]
          title: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "products"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      submit_subscription_payment: {
        Args: {
          p_amount_xof: number
          p_channel: Database["public"]["Enums"]["payment_channel"]
          p_external_reference: string
          p_merchant_id: string
          p_paid_at: string
          p_plan_id: string
        }
        Returns: {
          amount_xof: number
          channel: Database["public"]["Enums"]["payment_channel"]
          created_at: string
          external_reference: string
          id: string
          merchant_id: string
          paid_at: string
          plan_id: string
          rejection_reason: string | null
          reviewed_at: string | null
          reviewer_id: string | null
          status: Database["public"]["Enums"]["payment_submission_status"]
          submitted_by: string
          subscription_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "subscription_payment_submissions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      submit_verification_case: {
        Args: { p_case_id: string }
        Returns: {
          assigned_reviewer_id: string | null
          created_at: string
          decided_at: string | null
          decision_code: string | null
          id: string
          internal_note: string | null
          merchant_id: string
          merchant_note: string | null
          review_started_at: string | null
          status: Database["public"]["Enums"]["verification_status"]
          submission_version: number
          submitted_at: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "verification_cases"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      transition_order_status: {
        Args: {
          p_internal_note?: string
          p_order_id: string
          p_public_message?: string
          p_to_status: Database["public"]["Enums"]["order_status"]
        }
        Returns: {
          batch_id: string
          buyer_id: string
          cancelled_at: string | null
          created_at: string
          currency: string
          delivered_at: string | null
          delivery_fee_xof: number
          delivery_snapshot: Json
          id: string
          merchant_id: string
          merchant_sequence: number
          payment_instructions_snapshot: Json
          payment_method: Database["public"]["Enums"]["order_payment_method"]
          public_code: string
          recipient_snapshot: Json
          seller_confirm_by: string | null
          status: Database["public"]["Enums"]["order_status"]
          subtotal_xof: number
          total_xof: number
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "orders"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      verification_case_is_complete: {
        Args: { p_case_id: string }
        Returns: boolean
      }
    }
    Enums: {
      admin_role_kind: "reviewer" | "support" | "admin"
      courier_membership_status: "active" | "inactive"
      crm_lead_priority: "low" | "normal" | "high"
      crm_lead_status:
        | "new"
        | "contacted"
        | "qualified"
        | "onboarding"
        | "converted"
        | "rejected"
        | "archived"
      delivery_method_kind: "pickup" | "merchant_delivery"
      delivery_status:
        | "assigned"
        | "accepted"
        | "at_pickup"
        | "picked_up"
        | "in_transit"
        | "delivered"
        | "failed"
        | "cancelled"
      escrow_status: "held" | "released" | "refunded" | "disputed"
      merchant_kind: "informal" | "formal"
      merchant_media_kind: "logo" | "cover"
      merchant_member_role: "owner" | "manager" | "catalog" | "fulfillment"
      merchant_status: "draft" | "pending" | "active" | "suspended" | "closed"
      notification_status: "pending" | "processing" | "sent" | "failed"
      order_payment_method:
        | "cash_on_delivery"
        | "wave_direct"
        | "orange_money_direct"
        | "paytech"
      order_status:
        | "pending_seller_confirmation"
        | "confirmed"
        | "preparing"
        | "ready_for_handoff"
        | "in_transit"
        | "delivered"
        | "cancelled"
        | "disputed"
      payment_channel: "wave" | "orange_money" | "paytech"
      payment_intent_status:
        | "pending"
        | "paid"
        | "cancelled"
        | "failed"
        | "refunded"
      payment_submission_status: "pending" | "approved" | "rejected"
      payout_status: "pending" | "sent" | "paid" | "failed"
      product_status: "draft" | "published" | "archived" | "suspended"
      subscription_status:
        | "pending"
        | "active"
        | "grace"
        | "expired"
        | "cancelled"
      verification_document_status:
        | "uploaded"
        | "accepted"
        | "rejected"
        | "replaced"
        | "purged"
      verification_document_type:
        | "national_id_front"
        | "national_id_back"
        | "passport_identity"
        | "intent_letter"
        | "proof_activity"
        | "ninea"
        | "rccm"
        | "representative_mandate"
      verification_status:
        | "draft"
        | "submitted"
        | "in_review"
        | "needs_changes"
        | "resubmitted"
        | "approved"
        | "rejected"
        | "suspended"
      workspace_invitation_kind: "merchant_owner" | "courier"
      workspace_invitation_status: "pending" | "claimed" | "expired" | "revoked"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      admin_role_kind: ["reviewer", "support", "admin"],
      courier_membership_status: ["active", "inactive"],
      crm_lead_priority: ["low", "normal", "high"],
      crm_lead_status: [
        "new",
        "contacted",
        "qualified",
        "onboarding",
        "converted",
        "rejected",
        "archived",
      ],
      delivery_method_kind: ["pickup", "merchant_delivery"],
      delivery_status: [
        "assigned",
        "accepted",
        "at_pickup",
        "picked_up",
        "in_transit",
        "delivered",
        "failed",
        "cancelled",
      ],
      escrow_status: ["held", "released", "refunded", "disputed"],
      merchant_kind: ["informal", "formal"],
      merchant_media_kind: ["logo", "cover"],
      merchant_member_role: ["owner", "manager", "catalog", "fulfillment"],
      merchant_status: ["draft", "pending", "active", "suspended", "closed"],
      notification_status: ["pending", "processing", "sent", "failed"],
      order_payment_method: [
        "cash_on_delivery",
        "wave_direct",
        "orange_money_direct",
        "paytech",
      ],
      order_status: [
        "pending_seller_confirmation",
        "confirmed",
        "preparing",
        "ready_for_handoff",
        "in_transit",
        "delivered",
        "cancelled",
        "disputed",
      ],
      payment_channel: ["wave", "orange_money", "paytech"],
      payment_intent_status: [
        "pending",
        "paid",
        "cancelled",
        "failed",
        "refunded",
      ],
      payment_submission_status: ["pending", "approved", "rejected"],
      payout_status: ["pending", "sent", "paid", "failed"],
      product_status: ["draft", "published", "archived", "suspended"],
      subscription_status: [
        "pending",
        "active",
        "grace",
        "expired",
        "cancelled",
      ],
      verification_document_status: [
        "uploaded",
        "accepted",
        "rejected",
        "replaced",
        "purged",
      ],
      verification_document_type: [
        "national_id_front",
        "national_id_back",
        "passport_identity",
        "intent_letter",
        "proof_activity",
        "ninea",
        "rccm",
        "representative_mandate",
      ],
      verification_status: [
        "draft",
        "submitted",
        "in_review",
        "needs_changes",
        "resubmitted",
        "approved",
        "rejected",
        "suspended",
      ],
      workspace_invitation_kind: ["merchant_owner", "courier"],
      workspace_invitation_status: ["pending", "claimed", "expired", "revoked"],
    },
  },
} as const
