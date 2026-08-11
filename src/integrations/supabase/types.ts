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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      app_languages: {
        Row: {
          code: string
          created_at: string
          is_enabled: boolean
          name: string
          native_name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          is_enabled?: boolean
          name: string
          native_name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          is_enabled?: boolean
          name?: string
          native_name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      app_settings: {
        Row: {
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          updated_by?: string | null
          value: Json
        }
        Update: {
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: []
      }
      apple_health_snapshots: {
        Row: {
          active_calories: number | null
          created_at: string
          date: string
          distance_meters: number | null
          exercise_minutes: number | null
          glucose_at: string | null
          glucose_mg_dl: number | null
          hrv_ms: number | null
          id: string
          resting_heart_rate: number | null
          sleep_hours: number | null
          steps: number | null
          synced_at: string
          updated_at: string
          user_id: string
          weight_at: string | null
          weight_kg: number | null
        }
        Insert: {
          active_calories?: number | null
          created_at?: string
          date?: string
          distance_meters?: number | null
          exercise_minutes?: number | null
          glucose_at?: string | null
          glucose_mg_dl?: number | null
          hrv_ms?: number | null
          id?: string
          resting_heart_rate?: number | null
          sleep_hours?: number | null
          steps?: number | null
          synced_at?: string
          updated_at?: string
          user_id: string
          weight_at?: string | null
          weight_kg?: number | null
        }
        Update: {
          active_calories?: number | null
          created_at?: string
          date?: string
          distance_meters?: number | null
          exercise_minutes?: number | null
          glucose_at?: string | null
          glucose_mg_dl?: number | null
          hrv_ms?: number | null
          id?: string
          resting_heart_rate?: number | null
          sleep_hours?: number | null
          steps?: number | null
          synced_at?: string
          updated_at?: string
          user_id?: string
          weight_at?: string | null
          weight_kg?: number | null
        }
        Relationships: []
      }
      audit_logs: {
        Row: {
          action: string
          actor_name: string | null
          actor_role: string | null
          actor_user_id: string | null
          created_at: string
          id: string
          ip_address: string | null
          metadata: Json
          module: string
          target_id: string | null
          target_label: string | null
          target_type: string | null
          user_agent: string | null
        }
        Insert: {
          action: string
          actor_name?: string | null
          actor_role?: string | null
          actor_user_id?: string | null
          created_at?: string
          id?: string
          ip_address?: string | null
          metadata?: Json
          module: string
          target_id?: string | null
          target_label?: string | null
          target_type?: string | null
          user_agent?: string | null
        }
        Update: {
          action?: string
          actor_name?: string | null
          actor_role?: string | null
          actor_user_id?: string | null
          created_at?: string
          id?: string
          ip_address?: string | null
          metadata?: Json
          module?: string
          target_id?: string | null
          target_label?: string | null
          target_type?: string | null
          user_agent?: string | null
        }
        Relationships: []
      }
      bmi_categories: {
        Row: {
          code: string
          color: string | null
          created_at: string
          description: string | null
          id: string
          label: string
          max_value: number | null
          min_value: number | null
          sort_order: number
          updated_at: string
        }
        Insert: {
          code: string
          color?: string | null
          created_at?: string
          description?: string | null
          id?: string
          label: string
          max_value?: number | null
          min_value?: number | null
          sort_order?: number
          updated_at?: string
        }
        Update: {
          code?: string
          color?: string | null
          created_at?: string
          description?: string | null
          id?: string
          label?: string
          max_value?: number | null
          min_value?: number | null
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      channel_partner_packages: {
        Row: {
          classes_per_month: number | null
          created_at: string
          description: string | null
          duration_minutes: number | null
          id: string
          is_active: boolean
          name: string
          package_type: string
          partner_id: string
          partner_split_pct: number | null
          price_inr: number
          schedule_slots: Json
          sort_order: number
          updated_at: string
        }
        Insert: {
          classes_per_month?: number | null
          created_at?: string
          description?: string | null
          duration_minutes?: number | null
          id?: string
          is_active?: boolean
          name: string
          package_type: string
          partner_id: string
          partner_split_pct?: number | null
          price_inr: number
          schedule_slots?: Json
          sort_order?: number
          updated_at?: string
        }
        Update: {
          classes_per_month?: number | null
          created_at?: string
          description?: string | null
          duration_minutes?: number | null
          id?: string
          is_active?: boolean
          name?: string
          package_type?: string
          partner_id?: string
          partner_split_pct?: number | null
          price_inr?: number
          schedule_slots?: Json
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "channel_partner_packages_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "channel_partners"
            referencedColumns: ["id"]
          },
        ]
      }
      channel_partner_slot_templates: {
        Row: {
          capacity: number
          created_at: string
          days_of_week: number[]
          duration_min: number
          id: string
          is_active: boolean
          label: string
          meet_link: string | null
          notes: string | null
          package_id: string
          package_type: string
          partner_id: string
          start_date: string
          time_of_day: string
          updated_at: string
          weeks_count: number
        }
        Insert: {
          capacity?: number
          created_at?: string
          days_of_week?: number[]
          duration_min?: number
          id?: string
          is_active?: boolean
          label: string
          meet_link?: string | null
          notes?: string | null
          package_id: string
          package_type: string
          partner_id: string
          start_date: string
          time_of_day: string
          updated_at?: string
          weeks_count?: number
        }
        Update: {
          capacity?: number
          created_at?: string
          days_of_week?: number[]
          duration_min?: number
          id?: string
          is_active?: boolean
          label?: string
          meet_link?: string | null
          notes?: string | null
          package_id?: string
          package_type?: string
          partner_id?: string
          start_date?: string
          time_of_day?: string
          updated_at?: string
          weeks_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "channel_partner_slot_templates_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "channel_partner_packages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channel_partner_slot_templates_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "channel_partners"
            referencedColumns: ["id"]
          },
        ]
      }
      channel_partner_slots: {
        Row: {
          booked_count: number
          capacity: number
          created_at: string
          duration_min: number
          id: string
          is_active: boolean
          meet_link: string | null
          notes: string | null
          package_id: string | null
          package_type: string
          partner_id: string
          scheduled_at: string
          template_id: string | null
          template_label: string | null
          title: string | null
          updated_at: string
        }
        Insert: {
          booked_count?: number
          capacity?: number
          created_at?: string
          duration_min?: number
          id?: string
          is_active?: boolean
          meet_link?: string | null
          notes?: string | null
          package_id?: string | null
          package_type: string
          partner_id: string
          scheduled_at: string
          template_id?: string | null
          template_label?: string | null
          title?: string | null
          updated_at?: string
        }
        Update: {
          booked_count?: number
          capacity?: number
          created_at?: string
          duration_min?: number
          id?: string
          is_active?: boolean
          meet_link?: string | null
          notes?: string | null
          package_id?: string | null
          package_type?: string
          partner_id?: string
          scheduled_at?: string
          template_id?: string | null
          template_label?: string | null
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "channel_partner_slots_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "channel_partner_packages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channel_partner_slots_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "channel_partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channel_partner_slots_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "channel_partner_slot_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      channel_partners: {
        Row: {
          address_line1: string | null
          address_line2: string | null
          avatar_url: string | null
          bank_account_number: string | null
          bank_ifsc: string | null
          bank_name: string | null
          bbdo_commission_pct: number
          bio: string | null
          certifications: string[]
          city: string | null
          contact_email: string | null
          contact_phone: string | null
          created_at: string
          experience_years: number | null
          headline: string | null
          id: string
          instagram_url: string | null
          is_active: boolean
          languages: string[]
          name: string
          partner_commission_pct: number
          partner_type: string
          pincode: string | null
          service_locations: string[]
          state: string | null
          updated_at: string
          user_id: string | null
          website_url: string | null
        }
        Insert: {
          address_line1?: string | null
          address_line2?: string | null
          avatar_url?: string | null
          bank_account_number?: string | null
          bank_ifsc?: string | null
          bank_name?: string | null
          bbdo_commission_pct?: number
          bio?: string | null
          certifications?: string[]
          city?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          experience_years?: number | null
          headline?: string | null
          id?: string
          instagram_url?: string | null
          is_active?: boolean
          languages?: string[]
          name: string
          partner_commission_pct?: number
          partner_type: string
          pincode?: string | null
          service_locations?: string[]
          state?: string | null
          updated_at?: string
          user_id?: string | null
          website_url?: string | null
        }
        Update: {
          address_line1?: string | null
          address_line2?: string | null
          avatar_url?: string | null
          bank_account_number?: string | null
          bank_ifsc?: string | null
          bank_name?: string | null
          bbdo_commission_pct?: number
          bio?: string | null
          certifications?: string[]
          city?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          experience_years?: number | null
          headline?: string | null
          id?: string
          instagram_url?: string | null
          is_active?: boolean
          languages?: string[]
          name?: string
          partner_commission_pct?: number
          partner_type?: string
          pincode?: string | null
          service_locations?: string[]
          state?: string | null
          updated_at?: string
          user_id?: string | null
          website_url?: string | null
        }
        Relationships: []
      }
      chat_conversations: {
        Row: {
          coach_id: string
          coach_unread_count: number
          created_at: string
          id: string
          last_message_at: string | null
          patient_id: string
          patient_unread_count: number
        }
        Insert: {
          coach_id: string
          coach_unread_count?: number
          created_at?: string
          id?: string
          last_message_at?: string | null
          patient_id: string
          patient_unread_count?: number
        }
        Update: {
          coach_id?: string
          coach_unread_count?: number
          created_at?: string
          id?: string
          last_message_at?: string | null
          patient_id?: string
          patient_unread_count?: number
        }
        Relationships: []
      }
      chat_messages: {
        Row: {
          conversation_id: string
          created_at: string
          id: string
          is_predefined: boolean
          message: string
          read_at: string | null
          sender_id: string
          sender_role: string
        }
        Insert: {
          conversation_id: string
          created_at?: string
          id?: string
          is_predefined?: boolean
          message: string
          read_at?: string | null
          sender_id: string
          sender_role?: string
        }
        Update: {
          conversation_id?: string
          created_at?: string
          id?: string
          is_predefined?: boolean
          message?: string
          read_at?: string | null
          sender_id?: string
          sender_role?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "chat_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      coach_assignments: {
        Row: {
          assigned_at: string
          coach_id: string
          id: string
          is_active: boolean
          user_id: string
        }
        Insert: {
          assigned_at?: string
          coach_id: string
          id?: string
          is_active?: boolean
          user_id: string
        }
        Update: {
          assigned_at?: string
          coach_id?: string
          id?: string
          is_active?: boolean
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "coach_assignments_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coach_assignments_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coaches_public"
            referencedColumns: ["id"]
          },
        ]
      }
      coach_meetings: {
        Row: {
          agenda: string | null
          coach_id: string
          created_at: string
          created_by: string | null
          duration_min: number
          id: string
          meeting_link: string | null
          meeting_type: Database["public"]["Enums"]["meeting_type"]
          notes: string | null
          scheduled_at: string
          status: Database["public"]["Enums"]["meeting_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          agenda?: string | null
          coach_id: string
          created_at?: string
          created_by?: string | null
          duration_min?: number
          id?: string
          meeting_link?: string | null
          meeting_type?: Database["public"]["Enums"]["meeting_type"]
          notes?: string | null
          scheduled_at: string
          status?: Database["public"]["Enums"]["meeting_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          agenda?: string | null
          coach_id?: string
          created_at?: string
          created_by?: string | null
          duration_min?: number
          id?: string
          meeting_link?: string | null
          meeting_type?: Database["public"]["Enums"]["meeting_type"]
          notes?: string | null
          scheduled_at?: string
          status?: Database["public"]["Enums"]["meeting_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "coach_meetings_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coach_meetings_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coaches_public"
            referencedColumns: ["id"]
          },
        ]
      }
      coach_ratings: {
        Row: {
          coach_id: string
          created_at: string
          id: string
          rating: number
          review: string | null
          user_id: string
        }
        Insert: {
          coach_id: string
          created_at?: string
          id?: string
          rating: number
          review?: string | null
          user_id: string
        }
        Update: {
          coach_id?: string
          created_at?: string
          id?: string
          rating?: number
          review?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "coach_ratings_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coach_ratings_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coaches_public"
            referencedColumns: ["id"]
          },
        ]
      }
      coach_supplement_recommendations: {
        Row: {
          coach_id: string
          created_at: string
          id: string
          items: Json
          note: string | null
          status: Database["public"]["Enums"]["recommendation_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          coach_id: string
          created_at?: string
          id?: string
          items?: Json
          note?: string | null
          status?: Database["public"]["Enums"]["recommendation_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          coach_id?: string
          created_at?: string
          id?: string
          items?: Json
          note?: string | null
          status?: Database["public"]["Enums"]["recommendation_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "coach_supplement_recommendations_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coach_supplement_recommendations_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coaches_public"
            referencedColumns: ["id"]
          },
        ]
      }
      coach_test_recommendations: {
        Row: {
          coach_id: string
          created_at: string
          id: string
          note: string | null
          product_codes: string[]
          status: Database["public"]["Enums"]["recommendation_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          coach_id: string
          created_at?: string
          id?: string
          note?: string | null
          product_codes?: string[]
          status?: Database["public"]["Enums"]["recommendation_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          coach_id?: string
          created_at?: string
          id?: string
          note?: string | null
          product_codes?: string[]
          status?: Database["public"]["Enums"]["recommendation_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "coach_test_recommendations_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coach_test_recommendations_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coaches_public"
            referencedColumns: ["id"]
          },
        ]
      }
      coach_video_assignments: {
        Row: {
          coach_id: string
          created_at: string
          id: string
          item_key: string
          module: string
          patient_user_id: string
        }
        Insert: {
          coach_id: string
          created_at?: string
          id?: string
          item_key: string
          module: string
          patient_user_id: string
        }
        Update: {
          coach_id?: string
          created_at?: string
          id?: string
          item_key?: string
          module?: string
          patient_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "coach_video_assignments_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coach_video_assignments_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coaches_public"
            referencedColumns: ["id"]
          },
        ]
      }
      coaches: {
        Row: {
          aadhaar_card: string | null
          aadhaar_doc_url: string | null
          address_line1: string | null
          address_line2: string | null
          avatar_url: string | null
          avg_rating: number
          bank_account_number: string | null
          bank_ifsc: string | null
          bank_name: string | null
          bbdo_community_exp: number
          bio: string | null
          city: string | null
          coach_packages: string[]
          coach_type: Database["public"]["Enums"]["coach_type"]
          commission_model_id: string | null
          commission_percent: number | null
          created_at: string
          date_of_birth: string | null
          description: string | null
          email: string | null
          emergency_contact_name: string | null
          emergency_contact_phone: string | null
          id: string
          is_active: boolean
          languages: string[] | null
          name: string
          pan_card: string | null
          pan_doc_url: string | null
          phone: string
          pincode: string | null
          qualification: string | null
          specialization: string | null
          start_date: string | null
          state: string | null
          total_consultations: number
          total_ratings: number
          tour_completed_at: string | null
          tour_signature: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          aadhaar_card?: string | null
          aadhaar_doc_url?: string | null
          address_line1?: string | null
          address_line2?: string | null
          avatar_url?: string | null
          avg_rating?: number
          bank_account_number?: string | null
          bank_ifsc?: string | null
          bank_name?: string | null
          bbdo_community_exp?: number
          bio?: string | null
          city?: string | null
          coach_packages?: string[]
          coach_type: Database["public"]["Enums"]["coach_type"]
          commission_model_id?: string | null
          commission_percent?: number | null
          created_at?: string
          date_of_birth?: string | null
          description?: string | null
          email?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          id?: string
          is_active?: boolean
          languages?: string[] | null
          name: string
          pan_card?: string | null
          pan_doc_url?: string | null
          phone: string
          pincode?: string | null
          qualification?: string | null
          specialization?: string | null
          start_date?: string | null
          state?: string | null
          total_consultations?: number
          total_ratings?: number
          tour_completed_at?: string | null
          tour_signature?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          aadhaar_card?: string | null
          aadhaar_doc_url?: string | null
          address_line1?: string | null
          address_line2?: string | null
          avatar_url?: string | null
          avg_rating?: number
          bank_account_number?: string | null
          bank_ifsc?: string | null
          bank_name?: string | null
          bbdo_community_exp?: number
          bio?: string | null
          city?: string | null
          coach_packages?: string[]
          coach_type?: Database["public"]["Enums"]["coach_type"]
          commission_model_id?: string | null
          commission_percent?: number | null
          created_at?: string
          date_of_birth?: string | null
          description?: string | null
          email?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          id?: string
          is_active?: boolean
          languages?: string[] | null
          name?: string
          pan_card?: string | null
          pan_doc_url?: string | null
          phone?: string
          pincode?: string | null
          qualification?: string | null
          specialization?: string | null
          start_date?: string | null
          state?: string | null
          total_consultations?: number
          total_ratings?: number
          tour_completed_at?: string | null
          tour_signature?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "coaches_commission_model_id_fkey"
            columns: ["commission_model_id"]
            isOneToOne: false
            referencedRelation: "commission_models"
            referencedColumns: ["id"]
          },
        ]
      }
      color_gauge_bands: {
        Row: {
          color_hex: string
          created_at: string
          id: string
          label: string
          max_value: number | null
          min_value: number | null
          module_id: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          color_hex?: string
          created_at?: string
          id?: string
          label: string
          max_value?: number | null
          min_value?: number | null
          module_id: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          color_hex?: string
          created_at?: string
          id?: string
          label?: string
          max_value?: number | null
          min_value?: number | null
          module_id?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "color_gauge_bands_module_id_fkey"
            columns: ["module_id"]
            isOneToOne: false
            referencedRelation: "color_gauge_modules"
            referencedColumns: ["id"]
          },
        ]
      }
      color_gauge_modules: {
        Row: {
          comparison_mode: string
          created_at: string
          description: string | null
          higher_is_better: boolean
          id: string
          is_active: boolean
          module_key: string
          module_name: string
          sort_order: number
          unit: string | null
          updated_at: string
        }
        Insert: {
          comparison_mode?: string
          created_at?: string
          description?: string | null
          higher_is_better?: boolean
          id?: string
          is_active?: boolean
          module_key: string
          module_name: string
          sort_order?: number
          unit?: string | null
          updated_at?: string
        }
        Update: {
          comparison_mode?: string
          created_at?: string
          description?: string | null
          higher_is_better?: boolean
          id?: string
          is_active?: boolean
          module_key?: string
          module_name?: string
          sort_order?: number
          unit?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      commission_models: {
        Row: {
          applies_to: string[]
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          is_default: boolean
          min_active_patients: number
          min_avg_rating: number
          name: string
          payout_day: number
          payout_frequency: string
          percent: number
          rules: string | null
          updated_at: string
        }
        Insert: {
          applies_to?: string[]
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          is_default?: boolean
          min_active_patients?: number
          min_avg_rating?: number
          name: string
          payout_day?: number
          payout_frequency?: string
          percent: number
          rules?: string | null
          updated_at?: string
        }
        Update: {
          applies_to?: string[]
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          is_default?: boolean
          min_active_patients?: number
          min_avg_rating?: number
          name?: string
          payout_day?: number
          payout_frequency?: string
          percent?: number
          rules?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      community_comments: {
        Row: {
          content: string
          created_at: string
          id: string
          post_id: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          post_id: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          post_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_comments_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "community_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      community_likes: {
        Row: {
          created_at: string
          id: string
          post_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          post_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          post_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_likes_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "community_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      community_post_categories: {
        Row: {
          accent_color: string
          created_at: string
          emoji: string | null
          id: string
          is_active: boolean
          label: string
          slug: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          accent_color?: string
          created_at?: string
          emoji?: string | null
          id?: string
          is_active?: boolean
          label: string
          slug: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          accent_color?: string
          created_at?: string
          emoji?: string | null
          id?: string
          is_active?: boolean
          label?: string
          slug?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      community_posts: {
        Row: {
          achievement_data: Json | null
          category_slug: string | null
          comment_count: number
          content: string
          created_at: string
          id: string
          image_url: string | null
          like_count: number
          post_type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          achievement_data?: Json | null
          category_slug?: string | null
          comment_count?: number
          content: string
          created_at?: string
          id?: string
          image_url?: string | null
          like_count?: number
          post_type?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          achievement_data?: Json | null
          category_slug?: string | null
          comment_count?: number
          content?: string
          created_at?: string
          id?: string
          image_url?: string | null
          like_count?: number
          post_type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_posts_category_slug_fkey"
            columns: ["category_slug"]
            isOneToOne: false
            referencedRelation: "community_post_categories"
            referencedColumns: ["slug"]
          },
        ]
      }
      compliments: {
        Row: {
          compliment_type: string
          created_at: string
          emoji: string
          id: string
          is_seen: boolean
          message: string
          metric_value: string | null
          user_id: string
        }
        Insert: {
          compliment_type?: string
          created_at?: string
          emoji?: string
          id?: string
          is_seen?: boolean
          message: string
          metric_value?: string | null
          user_id: string
        }
        Update: {
          compliment_type?: string
          created_at?: string
          emoji?: string
          id?: string
          is_seen?: boolean
          message?: string
          metric_value?: string | null
          user_id?: string
        }
        Relationships: []
      }
      consultation_requests: {
        Row: {
          coach_id: string | null
          coach_response: string | null
          id: string
          meeting_id: string | null
          preferred_slots: Json | null
          requested_at: string
          status: Database["public"]["Enums"]["consultation_status"]
          topic: string
          updated_at: string
          urgency: string
          user_id: string
        }
        Insert: {
          coach_id?: string | null
          coach_response?: string | null
          id?: string
          meeting_id?: string | null
          preferred_slots?: Json | null
          requested_at?: string
          status?: Database["public"]["Enums"]["consultation_status"]
          topic: string
          updated_at?: string
          urgency?: string
          user_id: string
        }
        Update: {
          coach_id?: string | null
          coach_response?: string | null
          id?: string
          meeting_id?: string | null
          preferred_slots?: Json | null
          requested_at?: string
          status?: Database["public"]["Enums"]["consultation_status"]
          topic?: string
          updated_at?: string
          urgency?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "consultation_requests_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consultation_requests_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coaches_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consultation_requests_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "coach_meetings"
            referencedColumns: ["id"]
          },
        ]
      }
      device_push_tokens: {
        Row: {
          app_version: string | null
          created_at: string
          device_model: string | null
          id: string
          platform: string
          token: string
          updated_at: string
          user_id: string
        }
        Insert: {
          app_version?: string | null
          created_at?: string
          device_model?: string | null
          id?: string
          platform: string
          token: string
          updated_at?: string
          user_id: string
        }
        Update: {
          app_version?: string | null
          created_at?: string
          device_model?: string | null
          id?: string
          platform?: string
          token?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      diet_platings: {
        Row: {
          calories: number | null
          created_at: string
          day_index: number
          id: string
          meal_slot: string
          plan_start_date: string
          plate_data: Json
          user_id: string
        }
        Insert: {
          calories?: number | null
          created_at?: string
          day_index: number
          id?: string
          meal_slot: string
          plan_start_date: string
          plate_data?: Json
          user_id: string
        }
        Update: {
          calories?: number | null
          created_at?: string
          day_index?: number
          id?: string
          meal_slot?: string
          plan_start_date?: string
          plate_data?: Json
          user_id?: string
        }
        Relationships: []
      }
      diet_types: {
        Row: {
          created_at: string
          description: string | null
          display_order: number
          dot_color: string | null
          id: string
          is_active: boolean
          label: string
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          display_order?: number
          dot_color?: string | null
          id?: string
          is_active?: boolean
          label: string
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          display_order?: number
          dot_color?: string | null
          id?: string
          is_active?: boolean
          label?: string
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      event_registrations: {
        Row: {
          amount_paid_inr: number
          cancelled_at: string | null
          created_at: string
          event_id: string
          id: string
          notes: string | null
          payment_status: string
          registered_at: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          amount_paid_inr?: number
          cancelled_at?: string | null
          created_at?: string
          event_id: string
          id?: string
          notes?: string | null
          payment_status?: string
          registered_at?: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          amount_paid_inr?: number
          cancelled_at?: string | null
          created_at?: string
          event_id?: string
          id?: string
          notes?: string | null
          payment_status?: string
          registered_at?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_registrations_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          capacity: number | null
          cover_image_url: string | null
          created_at: string
          created_by: string
          currency: string
          description: string | null
          ends_at: string | null
          fee_inr: number
          id: string
          is_paid: boolean
          mode: string
          online_url: string | null
          organizer_avatar_url: string | null
          organizer_id: string | null
          organizer_name: string
          organizer_type: string
          registered_count: number
          starts_at: string
          status: string
          tags: string[]
          timezone: string
          title: string
          updated_at: string
          venue_address: string | null
          venue_city: string | null
          venue_lat: number | null
          venue_lng: number | null
          venue_name: string | null
        }
        Insert: {
          capacity?: number | null
          cover_image_url?: string | null
          created_at?: string
          created_by: string
          currency?: string
          description?: string | null
          ends_at?: string | null
          fee_inr?: number
          id?: string
          is_paid?: boolean
          mode?: string
          online_url?: string | null
          organizer_avatar_url?: string | null
          organizer_id?: string | null
          organizer_name: string
          organizer_type?: string
          registered_count?: number
          starts_at: string
          status?: string
          tags?: string[]
          timezone?: string
          title: string
          updated_at?: string
          venue_address?: string | null
          venue_city?: string | null
          venue_lat?: number | null
          venue_lng?: number | null
          venue_name?: string | null
        }
        Update: {
          capacity?: number | null
          cover_image_url?: string | null
          created_at?: string
          created_by?: string
          currency?: string
          description?: string | null
          ends_at?: string | null
          fee_inr?: number
          id?: string
          is_paid?: boolean
          mode?: string
          online_url?: string | null
          organizer_avatar_url?: string | null
          organizer_id?: string | null
          organizer_name?: string
          organizer_type?: string
          registered_count?: number
          starts_at?: string
          status?: string
          tags?: string[]
          timezone?: string
          title?: string
          updated_at?: string
          venue_address?: string | null
          venue_city?: string | null
          venue_lat?: number | null
          venue_lng?: number | null
          venue_name?: string | null
        }
        Relationships: []
      }
      exercise_badges: {
        Row: {
          color: string
          created_at: string
          criteria_json: Json
          description: string
          enabled: boolean
          icon: string
          id: string
          key: string
          name: string
          sort_order: number
          tier_required: number
          updated_at: string
        }
        Insert: {
          color?: string
          created_at?: string
          criteria_json?: Json
          description?: string
          enabled?: boolean
          icon?: string
          id?: string
          key: string
          name: string
          sort_order?: number
          tier_required?: number
          updated_at?: string
        }
        Update: {
          color?: string
          created_at?: string
          criteria_json?: Json
          description?: string
          enabled?: boolean
          icon?: string
          id?: string
          key?: string
          name?: string
          sort_order?: number
          tier_required?: number
          updated_at?: string
        }
        Relationships: []
      }
      exercise_categories: {
        Row: {
          created_at: string
          icon: string | null
          id: string
          name: string
          slug: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          icon?: string | null
          id?: string
          name: string
          slug: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          icon?: string | null
          id?: string
          name?: string
          slug?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      exercises: {
        Row: {
          benefits: string | null
          category_id: string
          cautions: string | null
          created_at: string
          enabled: boolean
          icon: string | null
          id: string
          image_url: string | null
          instructions: string | null
          knee_pain_substitute: string | null
          name: string
          plan_key: string
          reps_duration: string
          sets: string
          sort_order: number
          tier: number
          updated_at: string
          youtube_url: string
        }
        Insert: {
          benefits?: string | null
          category_id: string
          cautions?: string | null
          created_at?: string
          enabled?: boolean
          icon?: string | null
          id?: string
          image_url?: string | null
          instructions?: string | null
          knee_pain_substitute?: string | null
          name: string
          plan_key: string
          reps_duration?: string
          sets?: string
          sort_order?: number
          tier: number
          updated_at?: string
          youtube_url?: string
        }
        Update: {
          benefits?: string | null
          category_id?: string
          cautions?: string | null
          created_at?: string
          enabled?: boolean
          icon?: string | null
          id?: string
          image_url?: string | null
          instructions?: string | null
          knee_pain_substitute?: string | null
          name?: string
          plan_key?: string
          reps_duration?: string
          sets?: string
          sort_order?: number
          tier?: number
          updated_at?: string
          youtube_url?: string
        }
        Relationships: [
          {
            foreignKeyName: "exercises_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "exercise_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      external_lab_reports: {
        Row: {
          collected_on: string | null
          created_at: string
          file_name: string | null
          file_path: string
          id: string
          lab_name: string | null
          mime_type: string | null
          notes: string | null
          product_codes: string[]
          recommendation_id: string | null
          reviewed_at: string | null
          status: string
          updated_at: string
          uploaded_by: string | null
          user_id: string
        }
        Insert: {
          collected_on?: string | null
          created_at?: string
          file_name?: string | null
          file_path: string
          id?: string
          lab_name?: string | null
          mime_type?: string | null
          notes?: string | null
          product_codes?: string[]
          recommendation_id?: string | null
          reviewed_at?: string | null
          status?: string
          updated_at?: string
          uploaded_by?: string | null
          user_id: string
        }
        Update: {
          collected_on?: string | null
          created_at?: string
          file_name?: string | null
          file_path?: string
          id?: string
          lab_name?: string | null
          mime_type?: string | null
          notes?: string | null
          product_codes?: string[]
          recommendation_id?: string | null
          reviewed_at?: string | null
          status?: string
          updated_at?: string
          uploaded_by?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "external_lab_reports_recommendation_id_fkey"
            columns: ["recommendation_id"]
            isOneToOne: false
            referencedRelation: "thyrocare_recommendations"
            referencedColumns: ["id"]
          },
        ]
      }
      fasting_badges: {
        Row: {
          badge_emoji: string
          badge_key: string
          badge_name: string
          badge_type: string
          created_at: string
          description: string | null
          id: string
          level: number
          milestones_required: number
          parent_badge_id: string | null
          pattern: string | null
          protocol_id: string | null
          required_streak_days: number
          stage_order: number
          week_range_end: number | null
          week_range_start: number | null
        }
        Insert: {
          badge_emoji?: string
          badge_key: string
          badge_name: string
          badge_type?: string
          created_at?: string
          description?: string | null
          id?: string
          level?: number
          milestones_required?: number
          parent_badge_id?: string | null
          pattern?: string | null
          protocol_id?: string | null
          required_streak_days?: number
          stage_order?: number
          week_range_end?: number | null
          week_range_start?: number | null
        }
        Update: {
          badge_emoji?: string
          badge_key?: string
          badge_name?: string
          badge_type?: string
          created_at?: string
          description?: string | null
          id?: string
          level?: number
          milestones_required?: number
          parent_badge_id?: string | null
          pattern?: string | null
          protocol_id?: string | null
          required_streak_days?: number
          stage_order?: number
          week_range_end?: number | null
          week_range_start?: number | null
        }
        Relationships: []
      }
      fasting_protocols: {
        Row: {
          allowed_items: string[]
          avoid_items: string[]
          breaking_fast_guide: string | null
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          no_calories: boolean
          protocol_name: string
          protocol_type: string
          remarks: string | null
          safety_notes: string | null
          total_weeks: number
          updated_at: string
        }
        Insert: {
          allowed_items?: string[]
          avoid_items?: string[]
          breaking_fast_guide?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          no_calories?: boolean
          protocol_name: string
          protocol_type: string
          remarks?: string | null
          safety_notes?: string | null
          total_weeks?: number
          updated_at?: string
        }
        Update: {
          allowed_items?: string[]
          avoid_items?: string[]
          breaking_fast_guide?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          no_calories?: boolean
          protocol_name?: string
          protocol_type?: string
          remarks?: string | null
          safety_notes?: string | null
          total_weeks?: number
          updated_at?: string
        }
        Relationships: []
      }
      fasting_stage_milestones: {
        Row: {
          badge_id: string
          compliant_days_required: number
          created_at: string
          id: string
          milestone_name: string | null
          milestone_order: number
        }
        Insert: {
          badge_id: string
          compliant_days_required?: number
          created_at?: string
          id?: string
          milestone_name?: string | null
          milestone_order: number
        }
        Update: {
          badge_id?: string
          compliant_days_required?: number
          created_at?: string
          id?: string
          milestone_name?: string | null
          milestone_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "fasting_stage_milestones_badge_id_fkey"
            columns: ["badge_id"]
            isOneToOne: false
            referencedRelation: "fasting_badges"
            referencedColumns: ["id"]
          },
        ]
      }
      fasting_tracking: {
        Row: {
          compliance_status: string | null
          created_at: string
          date: string
          fasting_hours_completed: number | null
          fmod_actual_time: string | null
          id: string
          lmod_actual_time: string | null
          symptoms_flag: boolean
          symptoms_notes: string | null
          user_id: string
        }
        Insert: {
          compliance_status?: string | null
          created_at?: string
          date?: string
          fasting_hours_completed?: number | null
          fmod_actual_time?: string | null
          id?: string
          lmod_actual_time?: string | null
          symptoms_flag?: boolean
          symptoms_notes?: string | null
          user_id: string
        }
        Update: {
          compliance_status?: string | null
          created_at?: string
          date?: string
          fasting_hours_completed?: number | null
          fmod_actual_time?: string | null
          id?: string
          lmod_actual_time?: string | null
          symptoms_flag?: boolean
          symptoms_notes?: string | null
          user_id?: string
        }
        Relationships: []
      }
      fasting_weekly_plans: {
        Row: {
          fasting_pattern: string
          fmod_time: string
          id: string
          lmod_time: string
          metabolic_push: boolean
          protocol_id: string
          push_days: number | null
          push_pattern: string | null
          remarks: string | null
          requires_coach_guidance: boolean
          week_number: number
        }
        Insert: {
          fasting_pattern?: string
          fmod_time?: string
          id?: string
          lmod_time?: string
          metabolic_push?: boolean
          protocol_id: string
          push_days?: number | null
          push_pattern?: string | null
          remarks?: string | null
          requires_coach_guidance?: boolean
          week_number: number
        }
        Update: {
          fasting_pattern?: string
          fmod_time?: string
          id?: string
          lmod_time?: string
          metabolic_push?: boolean
          protocol_id?: string
          push_days?: number | null
          push_pattern?: string | null
          remarks?: string | null
          requires_coach_guidance?: boolean
          week_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "fasting_weekly_plans_protocol_id_fkey"
            columns: ["protocol_id"]
            isOneToOne: false
            referencedRelation: "fasting_protocols"
            referencedColumns: ["id"]
          },
        ]
      }
      food_categories: {
        Row: {
          created_at: string
          description: string | null
          display_order: number
          id: string
          image_url: string | null
          name: string
          severity_default: Database["public"]["Enums"]["food_recommendation"]
          slug: Database["public"]["Enums"]["food_category_slug"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          display_order?: number
          id?: string
          image_url?: string | null
          name: string
          severity_default?: Database["public"]["Enums"]["food_recommendation"]
          slug: Database["public"]["Enums"]["food_category_slug"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          display_order?: number
          id?: string
          image_url?: string | null
          name?: string
          severity_default?: Database["public"]["Enums"]["food_recommendation"]
          slug?: Database["public"]["Enums"]["food_category_slug"]
          updated_at?: string
        }
        Relationships: []
      }
      food_condition_rules: {
        Row: {
          action: string
          condition_key: string
          created_at: string
          filter_id: string | null
          id: string
          is_active: boolean
          name_pattern: string
          priority: number
          reason: string
          updated_at: string
        }
        Insert: {
          action: string
          condition_key: string
          created_at?: string
          filter_id?: string | null
          id?: string
          is_active?: boolean
          name_pattern: string
          priority?: number
          reason: string
          updated_at?: string
        }
        Update: {
          action?: string
          condition_key?: string
          created_at?: string
          filter_id?: string | null
          id?: string
          is_active?: boolean
          name_pattern?: string
          priority?: number
          reason?: string
          updated_at?: string
        }
        Relationships: []
      }
      food_conditions: {
        Row: {
          created_at: string
          emoji: string | null
          icon_url: string | null
          id: string
          is_active: boolean
          key: string
          label: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          emoji?: string | null
          icon_url?: string | null
          id?: string
          is_active?: boolean
          key: string
          label: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          emoji?: string | null
          icon_url?: string | null
          id?: string
          is_active?: boolean
          key?: string
          label?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      food_filters: {
        Row: {
          category_id: string
          cautionary_note: string | null
          created_at: string
          description: string | null
          display_order: number
          icon: string | null
          id: string
          image_url: string | null
          is_active: boolean
          key_takeaways: string[]
          name: string
          number_label: string | null
          order_number: number | null
          slug: string
          updated_at: string
        }
        Insert: {
          category_id: string
          cautionary_note?: string | null
          created_at?: string
          description?: string | null
          display_order?: number
          icon?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          key_takeaways?: string[]
          name: string
          number_label?: string | null
          order_number?: number | null
          slug: string
          updated_at?: string
        }
        Update: {
          category_id?: string
          cautionary_note?: string | null
          created_at?: string
          description?: string | null
          display_order?: number
          icon?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          key_takeaways?: string[]
          name?: string
          number_label?: string | null
          order_number?: number | null
          slug?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "food_filters_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "food_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      food_item_tag_links: {
        Row: {
          food_item_id: string
          tag_id: string
        }
        Insert: {
          food_item_id: string
          tag_id: string
        }
        Update: {
          food_item_id?: string
          tag_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "food_item_tag_links_food_item_id_fkey"
            columns: ["food_item_id"]
            isOneToOne: false
            referencedRelation: "food_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "food_item_tag_links_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "food_item_tags"
            referencedColumns: ["id"]
          },
        ]
      }
      food_item_tags: {
        Row: {
          color: string | null
          created_at: string
          id: string
          label: string
          slug: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          id?: string
          label: string
          slug: string
        }
        Update: {
          color?: string | null
          created_at?: string
          id?: string
          label?: string
          slug?: string
        }
        Relationships: []
      }
      food_items: {
        Row: {
          alt_name: string | null
          calories_kcal: number | null
          carbs_max: number | null
          carbs_min: number | null
          created_at: string
          diet_type: Database["public"]["Enums"]["food_diet_type"]
          display_order: number
          extra: Json
          fat_g: number | null
          fiber_g: number | null
          filter_id: string
          gi_band: Database["public"]["Enums"]["food_gi_band"] | null
          gi_max: number | null
          gi_min: number | null
          health_benefits: string[]
          household_grams: number | null
          household_measure: string | null
          id: string
          image_url: string | null
          is_active: boolean
          is_dairy_free: boolean
          is_gluten_free: boolean | null
          is_jain_friendly: boolean
          name: string
          notes: string | null
          protein_g: number | null
          recommendation: Database["public"]["Enums"]["food_recommendation"]
          serving_basis: Database["public"]["Enums"]["food_serving_basis"]
          serving_label: string | null
          serving_size_qty: number | null
          serving_size_unit: string | null
          updated_at: string
        }
        Insert: {
          alt_name?: string | null
          calories_kcal?: number | null
          carbs_max?: number | null
          carbs_min?: number | null
          created_at?: string
          diet_type?: Database["public"]["Enums"]["food_diet_type"]
          display_order?: number
          extra?: Json
          fat_g?: number | null
          fiber_g?: number | null
          filter_id: string
          gi_band?: Database["public"]["Enums"]["food_gi_band"] | null
          gi_max?: number | null
          gi_min?: number | null
          health_benefits?: string[]
          household_grams?: number | null
          household_measure?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          is_dairy_free?: boolean
          is_gluten_free?: boolean | null
          is_jain_friendly?: boolean
          name: string
          notes?: string | null
          protein_g?: number | null
          recommendation?: Database["public"]["Enums"]["food_recommendation"]
          serving_basis?: Database["public"]["Enums"]["food_serving_basis"]
          serving_label?: string | null
          serving_size_qty?: number | null
          serving_size_unit?: string | null
          updated_at?: string
        }
        Update: {
          alt_name?: string | null
          calories_kcal?: number | null
          carbs_max?: number | null
          carbs_min?: number | null
          created_at?: string
          diet_type?: Database["public"]["Enums"]["food_diet_type"]
          display_order?: number
          extra?: Json
          fat_g?: number | null
          fiber_g?: number | null
          filter_id?: string
          gi_band?: Database["public"]["Enums"]["food_gi_band"] | null
          gi_max?: number | null
          gi_min?: number | null
          health_benefits?: string[]
          household_grams?: number | null
          household_measure?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          is_dairy_free?: boolean
          is_gluten_free?: boolean | null
          is_jain_friendly?: boolean
          name?: string
          notes?: string | null
          protein_g?: number | null
          recommendation?: Database["public"]["Enums"]["food_recommendation"]
          serving_basis?: Database["public"]["Enums"]["food_serving_basis"]
          serving_label?: string | null
          serving_size_qty?: number | null
          serving_size_unit?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "food_items_filter_id_fkey"
            columns: ["filter_id"]
            isOneToOne: false
            referencedRelation: "food_filters"
            referencedColumns: ["id"]
          },
        ]
      }
      global_streak_config: {
        Row: {
          created_at: string
          id: string
          monthly_badge_copy: string
          pillars: Json
          updated_at: string
          updated_by: string | null
          weekly_badge_copy: string
        }
        Insert: {
          created_at?: string
          id?: string
          monthly_badge_copy?: string
          pillars?: Json
          updated_at?: string
          updated_by?: string | null
          weekly_badge_copy?: string
        }
        Update: {
          created_at?: string
          id?: string
          monthly_badge_copy?: string
          pillars?: Json
          updated_at?: string
          updated_by?: string | null
          weekly_badge_copy?: string
        }
        Relationships: []
      }
      health_logs: {
        Row: {
          bp_diastolic: number | null
          bp_systolic: number | null
          created_at: string
          glucose_evening: number | null
          glucose_morning: number | null
          id: string
          log_type: string
          logged_at: string
          steps_count: number | null
          user_id: string
          weight_kg: number | null
        }
        Insert: {
          bp_diastolic?: number | null
          bp_systolic?: number | null
          created_at?: string
          glucose_evening?: number | null
          glucose_morning?: number | null
          id?: string
          log_type: string
          logged_at?: string
          steps_count?: number | null
          user_id: string
          weight_kg?: number | null
        }
        Update: {
          bp_diastolic?: number | null
          bp_systolic?: number | null
          created_at?: string
          glucose_evening?: number | null
          glucose_morning?: number | null
          id?: string
          log_type?: string
          logged_at?: string
          steps_count?: number | null
          user_id?: string
          weight_kg?: number | null
        }
        Relationships: []
      }
      health_score_alerts: {
        Row: {
          acknowledged: boolean
          alert_type: string
          coach_id: string | null
          created_at: string
          id: string
          new_score: number
          previous_score: number
          score_delta: number
          user_id: string
        }
        Insert: {
          acknowledged?: boolean
          alert_type?: string
          coach_id?: string | null
          created_at?: string
          id?: string
          new_score: number
          previous_score: number
          score_delta: number
          user_id: string
        }
        Update: {
          acknowledged?: boolean
          alert_type?: string
          coach_id?: string | null
          created_at?: string
          id?: string
          new_score?: number
          previous_score?: number
          score_delta?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "health_score_alerts_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "health_score_alerts_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coaches_public"
            referencedColumns: ["id"]
          },
        ]
      }
      lab_parameters: {
        Row: {
          code: string
          created_at: string
          direction: string
          display_order: number
          group_name: string | null
          id: string
          is_key_marker: boolean
          name: string
          product_codes: string[]
          ref_high: number | null
          ref_low: number | null
          unit: string | null
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          direction?: string
          display_order?: number
          group_name?: string | null
          id?: string
          is_key_marker?: boolean
          name: string
          product_codes?: string[]
          ref_high?: number | null
          ref_low?: number | null
          unit?: string | null
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          direction?: string
          display_order?: number
          group_name?: string | null
          id?: string
          is_key_marker?: boolean
          name?: string
          product_codes?: string[]
          ref_high?: number | null
          ref_low?: number | null
          unit?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      lab_results: {
        Row: {
          created_at: string
          delta_vs_baseline: number | null
          delta_vs_previous: number | null
          external_report_id: string | null
          id: string
          is_baseline: boolean
          observed_at: string
          order_id: string | null
          parameter_code: string
          parameter_name: string
          ref_high: number | null
          ref_low: number | null
          report_id: string | null
          source: string
          status: string | null
          trend: string | null
          unit: string | null
          updated_at: string
          user_id: string
          value_numeric: number | null
          value_text: string | null
        }
        Insert: {
          created_at?: string
          delta_vs_baseline?: number | null
          delta_vs_previous?: number | null
          external_report_id?: string | null
          id?: string
          is_baseline?: boolean
          observed_at?: string
          order_id?: string | null
          parameter_code: string
          parameter_name: string
          ref_high?: number | null
          ref_low?: number | null
          report_id?: string | null
          source?: string
          status?: string | null
          trend?: string | null
          unit?: string | null
          updated_at?: string
          user_id: string
          value_numeric?: number | null
          value_text?: string | null
        }
        Update: {
          created_at?: string
          delta_vs_baseline?: number | null
          delta_vs_previous?: number | null
          external_report_id?: string | null
          id?: string
          is_baseline?: boolean
          observed_at?: string
          order_id?: string | null
          parameter_code?: string
          parameter_name?: string
          ref_high?: number | null
          ref_low?: number | null
          report_id?: string | null
          source?: string
          status?: string | null
          trend?: string | null
          unit?: string | null
          updated_at?: string
          user_id?: string
          value_numeric?: number | null
          value_text?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lab_results_external_report_id_fkey"
            columns: ["external_report_id"]
            isOneToOne: false
            referencedRelation: "external_lab_reports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lab_results_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "thyrocare_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lab_results_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "thyrocare_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      meal_photos: {
        Row: {
          created_at: string
          estimated_calories: number | null
          fasting_tracking_id: string | null
          food_items: Json | null
          id: string
          logged_at: string
          meal_type: string
          photo_url: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          estimated_calories?: number | null
          fasting_tracking_id?: string | null
          food_items?: Json | null
          id?: string
          logged_at?: string
          meal_type?: string
          photo_url?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          estimated_calories?: number | null
          fasting_tracking_id?: string | null
          food_items?: Json | null
          id?: string
          logged_at?: string
          meal_type?: string
          photo_url?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "meal_photos_fasting_tracking_id_fkey"
            columns: ["fasting_tracking_id"]
            isOneToOne: false
            referencedRelation: "fasting_tracking"
            referencedColumns: ["id"]
          },
        ]
      }
      medical_conditions: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          type: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          type?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          type?: string
        }
        Relationships: []
      }
      movement_badges: {
        Row: {
          code: string
          color: string
          created_at: string
          criteria: Json
          description: string | null
          icon: string
          id: string
          is_active: boolean
          name: string
          updated_at: string
        }
        Insert: {
          code: string
          color?: string
          created_at?: string
          criteria?: Json
          description?: string | null
          icon?: string
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          code?: string
          color?: string
          created_at?: string
          criteria?: Json
          description?: string | null
          icon?: string
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      movement_config: {
        Row: {
          activity_modifiers: Json
          age_modifiers: Json
          base_daily_steps: number
          bmi_modifiers: Json
          created_at: string
          id: string
          increment_per_level: number
          is_active: boolean
          max_daily_steps: number
          min_days_per_week: number
          miss_policy: string
          notes: string | null
          updated_at: string
          weeks_per_level: number
        }
        Insert: {
          activity_modifiers?: Json
          age_modifiers?: Json
          base_daily_steps?: number
          bmi_modifiers?: Json
          created_at?: string
          id?: string
          increment_per_level?: number
          is_active?: boolean
          max_daily_steps?: number
          min_days_per_week?: number
          miss_policy?: string
          notes?: string | null
          updated_at?: string
          weeks_per_level?: number
        }
        Update: {
          activity_modifiers?: Json
          age_modifiers?: Json
          base_daily_steps?: number
          bmi_modifiers?: Json
          created_at?: string
          id?: string
          increment_per_level?: number
          is_active?: boolean
          max_daily_steps?: number
          min_days_per_week?: number
          miss_policy?: string
          notes?: string | null
          updated_at?: string
          weeks_per_level?: number
        }
        Relationships: []
      }
      movement_levels: {
        Row: {
          accent_color: string
          badge_color: string
          badge_icon: string
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          level_number: number
          name: string
          target_daily_steps: number
          updated_at: string
        }
        Insert: {
          accent_color?: string
          badge_color?: string
          badge_icon?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          level_number: number
          name: string
          target_daily_steps: number
          updated_at?: string
        }
        Update: {
          accent_color?: string
          badge_color?: string
          badge_icon?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          level_number?: number
          name?: string
          target_daily_steps?: number
          updated_at?: string
        }
        Relationships: []
      }
      notification_categories: {
        Row: {
          color: string
          created_at: string
          icon: string
          id: string
          is_active: boolean
          key: string
          label: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          color?: string
          created_at?: string
          icon?: string
          id?: string
          is_active?: boolean
          key: string
          label: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          color?: string
          created_at?: string
          icon?: string
          id?: string
          is_active?: boolean
          key?: string
          label?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      notification_dispatch_log: {
        Row: {
          id: string
          sent_at: string
          template_id: string
          user_id: string
          variant_index: number
        }
        Insert: {
          id?: string
          sent_at?: string
          template_id: string
          user_id: string
          variant_index?: number
        }
        Update: {
          id?: string
          sent_at?: string
          template_id?: string
          user_id?: string
          variant_index?: number
        }
        Relationships: [
          {
            foreignKeyName: "notification_dispatch_log_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "notification_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_preferences: {
        Row: {
          appointment_alerts: boolean
          community_updates: boolean
          created_at: string
          daily_log_reminders: boolean
          id: string
          supplement_reminders: boolean
          updated_at: string
          user_id: string
          weekly_weight_reminder: boolean
        }
        Insert: {
          appointment_alerts?: boolean
          community_updates?: boolean
          created_at?: string
          daily_log_reminders?: boolean
          id?: string
          supplement_reminders?: boolean
          updated_at?: string
          user_id: string
          weekly_weight_reminder?: boolean
        }
        Update: {
          appointment_alerts?: boolean
          community_updates?: boolean
          created_at?: string
          daily_log_reminders?: boolean
          id?: string
          supplement_reminders?: boolean
          updated_at?: string
          user_id?: string
          weekly_weight_reminder?: boolean
        }
        Relationships: []
      }
      notification_templates: {
        Row: {
          action_url: string | null
          audience_filter: Json
          category_id: string
          cooldown_hours: number
          created_at: string
          description: string | null
          icon: string
          id: string
          is_active: boolean
          key: string
          message_variants: Json
          send_days: number[]
          send_time_local: string
          timezone: string
          title: string
          trigger_type: string
          updated_at: string
        }
        Insert: {
          action_url?: string | null
          audience_filter?: Json
          category_id: string
          cooldown_hours?: number
          created_at?: string
          description?: string | null
          icon?: string
          id?: string
          is_active?: boolean
          key: string
          message_variants?: Json
          send_days?: number[]
          send_time_local?: string
          timezone?: string
          title: string
          trigger_type?: string
          updated_at?: string
        }
        Update: {
          action_url?: string | null
          audience_filter?: Json
          category_id?: string
          cooldown_hours?: number
          created_at?: string
          description?: string | null
          icon?: string
          id?: string
          is_active?: boolean
          key?: string
          message_variants?: Json
          send_days?: number[]
          send_time_local?: string
          timezone?: string
          title?: string
          trigger_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_templates_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "notification_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          action_url: string | null
          body: string
          created_at: string
          icon: string | null
          id: string
          is_read: boolean
          title: string
          type: string
          user_id: string
        }
        Insert: {
          action_url?: string | null
          body: string
          created_at?: string
          icon?: string | null
          id?: string
          is_read?: boolean
          title: string
          type?: string
          user_id: string
        }
        Update: {
          action_url?: string | null
          body?: string
          created_at?: string
          icon?: string | null
          id?: string
          is_read?: boolean
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      onboarding_grade_band_cards: {
        Row: {
          band_id: string
          created_at: string
          description: string
          icon: string
          id: string
          is_active: boolean
          sort_order: number
          title: string
          updated_at: string
        }
        Insert: {
          band_id: string
          created_at?: string
          description: string
          icon?: string
          id?: string
          is_active?: boolean
          sort_order?: number
          title: string
          updated_at?: string
        }
        Update: {
          band_id?: string
          created_at?: string
          description?: string
          icon?: string
          id?: string
          is_active?: boolean
          sort_order?: number
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "onboarding_grade_band_cards_band_id_fkey"
            columns: ["band_id"]
            isOneToOne: false
            referencedRelation: "onboarding_grade_bands"
            referencedColumns: ["id"]
          },
        ]
      }
      onboarding_grade_bands: {
        Row: {
          accent: string
          closing_line: string | null
          created_at: string
          cta_label: string
          grade: number
          headline: string
          headline_highlight: string | null
          id: string
          is_active: boolean
          kicker: string
          max_points: number
          min_points: number
          slug: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          accent?: string
          closing_line?: string | null
          created_at?: string
          cta_label?: string
          grade: number
          headline: string
          headline_highlight?: string | null
          id?: string
          is_active?: boolean
          kicker?: string
          max_points?: number
          min_points?: number
          slug: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          accent?: string
          closing_line?: string | null
          created_at?: string
          cta_label?: string
          grade?: number
          headline?: string
          headline_highlight?: string | null
          id?: string
          is_active?: boolean
          kicker?: string
          max_points?: number
          min_points?: number
          slug?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      onboarding_grade_rules: {
        Row: {
          answer_key: string | null
          answer_label: string
          created_at: string
          id: string
          is_active: boolean
          match_type: string
          max_value: number | null
          min_value: number | null
          points: number
          question_key: string
          question_label: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          answer_key?: string | null
          answer_label: string
          created_at?: string
          id?: string
          is_active?: boolean
          match_type?: string
          max_value?: number | null
          min_value?: number | null
          points?: number
          question_key: string
          question_label: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          answer_key?: string | null
          answer_label?: string
          created_at?: string
          id?: string
          is_active?: boolean
          match_type?: string
          max_value?: number | null
          min_value?: number | null
          points?: number
          question_key?: string
          question_label?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      package_pricing: {
        Row: {
          billing_cycle: string
          created_at: string
          discount_percent: number
          enabled: boolean
          id: string
          package_id: string
          updated_at: string
        }
        Insert: {
          billing_cycle: string
          created_at?: string
          discount_percent?: number
          enabled?: boolean
          id?: string
          package_id: string
          updated_at?: string
        }
        Update: {
          billing_cycle?: string
          created_at?: string
          discount_percent?: number
          enabled?: boolean
          id?: string
          package_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "package_pricing_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "packages"
            referencedColumns: ["id"]
          },
        ]
      }
      packages: {
        Row: {
          accent: string
          assigns_coach: boolean
          badge: string | null
          base_monthly_price: number
          created_at: string
          enabled: boolean
          features: Json
          id: string
          name: string
          plan_key: string
          show_in_onboarding: boolean
          sort_order: number
          tagline: string | null
          updated_at: string
        }
        Insert: {
          accent?: string
          assigns_coach?: boolean
          badge?: string | null
          base_monthly_price?: number
          created_at?: string
          enabled?: boolean
          features?: Json
          id?: string
          name: string
          plan_key: string
          show_in_onboarding?: boolean
          sort_order?: number
          tagline?: string | null
          updated_at?: string
        }
        Update: {
          accent?: string
          assigns_coach?: boolean
          badge?: string | null
          base_monthly_price?: number
          created_at?: string
          enabled?: boolean
          features?: Json
          id?: string
          name?: string
          plan_key?: string
          show_in_onboarding?: boolean
          sort_order?: number
          tagline?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      partner_chat_conversations: {
        Row: {
          created_at: string
          id: string
          last_message_at: string | null
          partner_id: string
          partner_unread_count: number
          subscriber_id: string
          subscriber_unread_count: number
        }
        Insert: {
          created_at?: string
          id?: string
          last_message_at?: string | null
          partner_id: string
          partner_unread_count?: number
          subscriber_id: string
          subscriber_unread_count?: number
        }
        Update: {
          created_at?: string
          id?: string
          last_message_at?: string | null
          partner_id?: string
          partner_unread_count?: number
          subscriber_id?: string
          subscriber_unread_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "partner_chat_conversations_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "channel_partners"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_chat_messages: {
        Row: {
          conversation_id: string
          created_at: string
          id: string
          message: string
          read_at: string | null
          sender_id: string
          sender_role: string
        }
        Insert: {
          conversation_id: string
          created_at?: string
          id?: string
          message: string
          read_at?: string | null
          sender_id: string
          sender_role?: string
        }
        Update: {
          conversation_id?: string
          created_at?: string
          id?: string
          message?: string
          read_at?: string | null
          sender_id?: string
          sender_role?: string
        }
        Relationships: [
          {
            foreignKeyName: "partner_chat_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "partner_chat_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      pnl_rate_config: {
        Row: {
          created_at: string
          default_coach_commission_pct: number
          default_partner_split_pct: number
          gst_pct: number
          hyperrevamp_pct: number
          id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          default_coach_commission_pct?: number
          default_partner_split_pct?: number
          gst_pct?: number
          hyperrevamp_pct?: number
          id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          default_coach_commission_pct?: number
          default_partner_split_pct?: number
          gst_pct?: number
          hyperrevamp_pct?: number
          id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          address_line1: string | null
          address_line2: string | null
          age: number | null
          anniversary_date: string | null
          assessment: Json | null
          avatar_url: string | null
          birth_date: string | null
          bmi: number | null
          bmi_category: string | null
          city: string | null
          clinical: Json | null
          coach_name: string | null
          country: string | null
          country_code: string | null
          created_at: string | null
          deep_profiling: Json | null
          email: string | null
          gender: string | null
          goals: Json | null
          height: number | null
          id: string
          initial_assessment_date: string | null
          initial_health_score: number | null
          lifestyle: Json | null
          marital_status: string | null
          name: string | null
          onboarding_completed: boolean | null
          phone: string | null
          pincode: string | null
          spouse_name: string | null
          state: string | null
          updated_at: string | null
          user_id: string
          waist: number | null
          weight: number | null
          welcome_sent_at: string | null
        }
        Insert: {
          address_line1?: string | null
          address_line2?: string | null
          age?: number | null
          anniversary_date?: string | null
          assessment?: Json | null
          avatar_url?: string | null
          birth_date?: string | null
          bmi?: number | null
          bmi_category?: string | null
          city?: string | null
          clinical?: Json | null
          coach_name?: string | null
          country?: string | null
          country_code?: string | null
          created_at?: string | null
          deep_profiling?: Json | null
          email?: string | null
          gender?: string | null
          goals?: Json | null
          height?: number | null
          id?: string
          initial_assessment_date?: string | null
          initial_health_score?: number | null
          lifestyle?: Json | null
          marital_status?: string | null
          name?: string | null
          onboarding_completed?: boolean | null
          phone?: string | null
          pincode?: string | null
          spouse_name?: string | null
          state?: string | null
          updated_at?: string | null
          user_id: string
          waist?: number | null
          weight?: number | null
          welcome_sent_at?: string | null
        }
        Update: {
          address_line1?: string | null
          address_line2?: string | null
          age?: number | null
          anniversary_date?: string | null
          assessment?: Json | null
          avatar_url?: string | null
          birth_date?: string | null
          bmi?: number | null
          bmi_category?: string | null
          city?: string | null
          clinical?: Json | null
          coach_name?: string | null
          country?: string | null
          country_code?: string | null
          created_at?: string | null
          deep_profiling?: Json | null
          email?: string | null
          gender?: string | null
          goals?: Json | null
          height?: number | null
          id?: string
          initial_assessment_date?: string | null
          initial_health_score?: number | null
          lifestyle?: Json | null
          marital_status?: string | null
          name?: string | null
          onboarding_completed?: boolean | null
          phone?: string | null
          pincode?: string | null
          spouse_name?: string | null
          state?: string | null
          updated_at?: string | null
          user_id?: string
          waist?: number | null
          weight?: number | null
          welcome_sent_at?: string | null
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          auth_key: string
          created_at: string
          endpoint: string
          id: string
          p256dh: string
          user_id: string
        }
        Insert: {
          auth_key: string
          created_at?: string
          endpoint: string
          id?: string
          p256dh: string
          user_id: string
        }
        Update: {
          auth_key?: string
          created_at?: string
          endpoint?: string
          id?: string
          p256dh?: string
          user_id?: string
        }
        Relationships: []
      }
      razorpay_payments: {
        Row: {
          amount_paise: number
          created_at: string
          currency: string
          id: string
          notes: Json | null
          order_id: string
          payment_id: string | null
          plan_key: string | null
          raw_event: Json | null
          signature: string | null
          signature_verified: boolean
          status: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          amount_paise: number
          created_at?: string
          currency?: string
          id?: string
          notes?: Json | null
          order_id: string
          payment_id?: string | null
          plan_key?: string | null
          raw_event?: Json | null
          signature?: string | null
          signature_verified?: boolean
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          amount_paise?: number
          created_at?: string
          currency?: string
          id?: string
          notes?: Json | null
          order_id?: string
          payment_id?: string | null
          plan_key?: string | null
          raw_event?: Json | null
          signature?: string | null
          signature_verified?: boolean
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      rbac_permissions: {
        Row: {
          can_delete: boolean
          can_edit: boolean
          can_view: boolean
          created_at: string
          id: string
          module: string
          package_key: string | null
          role: Database["public"]["Enums"]["app_role"]
          sub_module: string | null
          updated_at: string
        }
        Insert: {
          can_delete?: boolean
          can_edit?: boolean
          can_view?: boolean
          created_at?: string
          id?: string
          module: string
          package_key?: string | null
          role: Database["public"]["Enums"]["app_role"]
          sub_module?: string | null
          updated_at?: string
        }
        Update: {
          can_delete?: boolean
          can_edit?: boolean
          can_view?: boolean
          created_at?: string
          id?: string
          module?: string
          package_key?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          sub_module?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      referral_codes: {
        Row: {
          code: string
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      referrals: {
        Row: {
          created_at: string
          id: string
          referral_code: string
          referred_user_id: string
          referrer_id: string
          reward_granted: boolean
          status: string
        }
        Insert: {
          created_at?: string
          id?: string
          referral_code: string
          referred_user_id: string
          referrer_id: string
          reward_granted?: boolean
          status?: string
        }
        Update: {
          created_at?: string
          id?: string
          referral_code?: string
          referred_user_id?: string
          referrer_id?: string
          reward_granted?: boolean
          status?: string
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          change_type: string
          created_at: string
          credit_applied: number
          duration_months: number
          expires_at: string
          id: string
          plan_id: string
          plan_name: string
          plan_price: number
          started_at: string
          status: string
          user_id: string
        }
        Insert: {
          change_type?: string
          created_at?: string
          credit_applied?: number
          duration_months?: number
          expires_at: string
          id?: string
          plan_id: string
          plan_name: string
          plan_price: number
          started_at?: string
          status?: string
          user_id: string
        }
        Update: {
          change_type?: string
          created_at?: string
          credit_applied?: number
          duration_months?: number
          expires_at?: string
          id?: string
          plan_id?: string
          plan_name?: string
          plan_price?: number
          started_at?: string
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      supplement_badges: {
        Row: {
          badge_emoji: string
          badge_key: string
          badge_name: string
          created_at: string
          description: string | null
          id: string
          level: number
          required_streak_days: number
        }
        Insert: {
          badge_emoji?: string
          badge_key: string
          badge_name: string
          created_at?: string
          description?: string | null
          id?: string
          level?: number
          required_streak_days?: number
        }
        Update: {
          badge_emoji?: string
          badge_key?: string
          badge_name?: string
          created_at?: string
          description?: string | null
          id?: string
          level?: number
          required_streak_days?: number
        }
        Relationships: []
      }
      supplement_categories: {
        Row: {
          created_at: string
          icon: string | null
          id: string
          is_active: boolean
          key: string
          label: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          icon?: string | null
          id?: string
          is_active?: boolean
          key: string
          label: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          icon?: string | null
          id?: string
          is_active?: boolean
          key?: string
          label?: string
          sort_order?: number
        }
        Relationships: []
      }
      supplement_condition_rules: {
        Row: {
          condition: string
          created_at: string
          dosage: string
          duration_weeks: number
          frequency: string
          id: string
          is_active: boolean
          remarks: string | null
          severity: string
          supplement_id: string
          timing: string | null
        }
        Insert: {
          condition: string
          created_at?: string
          dosage: string
          duration_weeks?: number
          frequency?: string
          id?: string
          is_active?: boolean
          remarks?: string | null
          severity?: string
          supplement_id: string
          timing?: string | null
        }
        Update: {
          condition?: string
          created_at?: string
          dosage?: string
          duration_weeks?: number
          frequency?: string
          id?: string
          is_active?: boolean
          remarks?: string | null
          severity?: string
          supplement_id?: string
          timing?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "supplement_condition_rules_supplement_id_fkey"
            columns: ["supplement_id"]
            isOneToOne: false
            referencedRelation: "supplement_master"
            referencedColumns: ["id"]
          },
        ]
      }
      supplement_conditions: {
        Row: {
          created_at: string
          icon: string | null
          id: string
          is_active: boolean
          key: string
          label: string
        }
        Insert: {
          created_at?: string
          icon?: string | null
          id?: string
          is_active?: boolean
          key: string
          label: string
        }
        Update: {
          created_at?: string
          icon?: string | null
          id?: string
          is_active?: boolean
          key?: string
          label?: string
        }
        Relationships: []
      }
      supplement_master: {
        Row: {
          category: string
          created_at: string
          default_dosage: string | null
          default_frequency: string | null
          default_timing: string | null
          description: string | null
          id: string
          is_active: boolean
          name: string
          updated_at: string
          veg_type: string
        }
        Insert: {
          category?: string
          created_at?: string
          default_dosage?: string | null
          default_frequency?: string | null
          default_timing?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
          veg_type?: string
        }
        Update: {
          category?: string
          created_at?: string
          default_dosage?: string | null
          default_frequency?: string | null
          default_timing?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
          veg_type?: string
        }
        Relationships: []
      }
      symptom_categories: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          key: string
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          key: string
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          key?: string
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      symptom_options: {
        Row: {
          category_id: string
          created_at: string
          id: string
          is_active: boolean
          key: string
          label: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          category_id: string
          created_at?: string
          id?: string
          is_active?: boolean
          key: string
          label: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          category_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          key?: string
          label?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "symptom_options_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "symptom_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      thyrocare_auth_cache: {
        Row: {
          bearer_token: string
          expires_at: string
          id: number
          updated_at: string
        }
        Insert: {
          bearer_token: string
          expires_at: string
          id?: number
          updated_at?: string
        }
        Update: {
          bearer_token?: string
          expires_at?: string
          id?: number
          updated_at?: string
        }
        Relationships: []
      }
      thyrocare_orders: {
        Row: {
          address: string | null
          amount: number | null
          beneficiary_age: number | null
          beneficiary_gender: string | null
          beneficiary_name: string
          collection_date: string | null
          collection_slot: string | null
          created_at: string
          email: string | null
          id: string
          mobile: string
          pincode: string
          product_codes: string[]
          raw_request: Json | null
          raw_response: Json | null
          recommendation_id: string | null
          status: string
          status_detail: string | null
          thyrocare_lead_id: string | null
          thyrocare_order_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          address?: string | null
          amount?: number | null
          beneficiary_age?: number | null
          beneficiary_gender?: string | null
          beneficiary_name: string
          collection_date?: string | null
          collection_slot?: string | null
          created_at?: string
          email?: string | null
          id?: string
          mobile: string
          pincode: string
          product_codes?: string[]
          raw_request?: Json | null
          raw_response?: Json | null
          recommendation_id?: string | null
          status?: string
          status_detail?: string | null
          thyrocare_lead_id?: string | null
          thyrocare_order_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          address?: string | null
          amount?: number | null
          beneficiary_age?: number | null
          beneficiary_gender?: string | null
          beneficiary_name?: string
          collection_date?: string | null
          collection_slot?: string | null
          created_at?: string
          email?: string | null
          id?: string
          mobile?: string
          pincode?: string
          product_codes?: string[]
          raw_request?: Json | null
          raw_response?: Json | null
          recommendation_id?: string | null
          status?: string
          status_detail?: string | null
          thyrocare_lead_id?: string | null
          thyrocare_order_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "thyrocare_orders_recommendation_id_fkey"
            columns: ["recommendation_id"]
            isOneToOne: false
            referencedRelation: "thyrocare_recommendations"
            referencedColumns: ["id"]
          },
        ]
      }
      thyrocare_recommendations: {
        Row: {
          coach_id: string | null
          created_at: string
          external_intent: boolean
          external_note: string | null
          external_requested_at: string | null
          id: string
          notes: string | null
          product_codes: string[]
          recommended_at: string
          status: string
          test_ids: string[]
          updated_at: string
          user_id: string
          viewed_at: string | null
        }
        Insert: {
          coach_id?: string | null
          created_at?: string
          external_intent?: boolean
          external_note?: string | null
          external_requested_at?: string | null
          id?: string
          notes?: string | null
          product_codes?: string[]
          recommended_at?: string
          status?: string
          test_ids?: string[]
          updated_at?: string
          user_id: string
          viewed_at?: string | null
        }
        Update: {
          coach_id?: string | null
          created_at?: string
          external_intent?: boolean
          external_note?: string | null
          external_requested_at?: string | null
          id?: string
          notes?: string | null
          product_codes?: string[]
          recommended_at?: string
          status?: string
          test_ids?: string[]
          updated_at?: string
          user_id?: string
          viewed_at?: string | null
        }
        Relationships: []
      }
      thyrocare_reports: {
        Row: {
          created_at: string
          delivered_at: string | null
          id: string
          order_id: string
          parameters: Json | null
          raw_data: Json | null
          report_type: string | null
          report_url: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          delivered_at?: string | null
          id?: string
          order_id: string
          parameters?: Json | null
          raw_data?: Json | null
          report_type?: string | null
          report_url?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          delivered_at?: string | null
          id?: string
          order_id?: string
          parameters?: Json | null
          raw_data?: Json | null
          report_type?: string | null
          report_url?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "thyrocare_reports_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "thyrocare_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      thyrocare_tests: {
        Row: {
          category: string | null
          coach_assignable: boolean
          created_at: string
          description: string | null
          fasting_hours: number | null
          fasting_required: boolean | null
          foundation_default: boolean
          id: string
          is_active: boolean | null
          markup_pct: number | null
          offer_rate: number | null
          parameters_count: number | null
          product_code: string
          product_name: string
          product_type: string | null
          rate: number | null
          raw_data: Json | null
          synced_at: string | null
          updated_at: string
        }
        Insert: {
          category?: string | null
          coach_assignable?: boolean
          created_at?: string
          description?: string | null
          fasting_hours?: number | null
          fasting_required?: boolean | null
          foundation_default?: boolean
          id?: string
          is_active?: boolean | null
          markup_pct?: number | null
          offer_rate?: number | null
          parameters_count?: number | null
          product_code: string
          product_name: string
          product_type?: string | null
          rate?: number | null
          raw_data?: Json | null
          synced_at?: string | null
          updated_at?: string
        }
        Update: {
          category?: string | null
          coach_assignable?: boolean
          created_at?: string
          description?: string | null
          fasting_hours?: number | null
          fasting_required?: boolean | null
          foundation_default?: boolean
          id?: string
          is_active?: boolean | null
          markup_pct?: number | null
          offer_rate?: number | null
          parameters_count?: number | null
          product_code?: string
          product_name?: string
          product_type?: string | null
          rate?: number | null
          raw_data?: Json | null
          synced_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      thyrocare_webhook_events: {
        Row: {
          event_type: string | null
          id: string
          payload: Json
          processed: boolean | null
          processing_error: string | null
          received_at: string
          thyrocare_order_id: string | null
        }
        Insert: {
          event_type?: string | null
          id?: string
          payload: Json
          processed?: boolean | null
          processing_error?: string | null
          received_at?: string
          thyrocare_order_id?: string | null
        }
        Update: {
          event_type?: string | null
          id?: string
          payload?: Json
          processed?: boolean | null
          processing_error?: string | null
          received_at?: string
          thyrocare_order_id?: string | null
        }
        Relationships: []
      }
      translation_cache: {
        Row: {
          created_at: string
          id: string
          lang: string
          source_hash: string
          source_text: string
          translated: string
        }
        Insert: {
          created_at?: string
          id?: string
          lang: string
          source_hash: string
          source_text: string
          translated: string
        }
        Update: {
          created_at?: string
          id?: string
          lang?: string
          source_hash?: string
          source_text?: string
          translated?: string
        }
        Relationships: []
      }
      user_bbdo_badges: {
        Row: {
          badge_type: string
          earned_at: string
          id: string
          pdf_url: string | null
          period_end: string
          period_number: number
          period_start: string
          snapshot: Json
          user_id: string
          viewed: boolean
        }
        Insert: {
          badge_type: string
          earned_at?: string
          id?: string
          pdf_url?: string | null
          period_end: string
          period_number: number
          period_start: string
          snapshot?: Json
          user_id: string
          viewed?: boolean
        }
        Update: {
          badge_type?: string
          earned_at?: string
          id?: string
          pdf_url?: string | null
          period_end?: string
          period_number?: number
          period_start?: string
          snapshot?: Json
          user_id?: string
          viewed?: boolean
        }
        Relationships: []
      }
      user_breath_sessions: {
        Row: {
          created_at: string
          id: string
          session_at: string
          source: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          session_at?: string
          source?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          session_at?: string
          source?: string
          user_id?: string
        }
        Relationships: []
      }
      user_diet_profiles: {
        Row: {
          allergen_food_ids: string[]
          allergies: string[] | null
          condition_ids: string[] | null
          created_at: string
          diet_preference: string
          diet_preferences: string[]
          id: string
          sub_preferences: string[]
          updated_at: string
          user_id: string
        }
        Insert: {
          allergen_food_ids?: string[]
          allergies?: string[] | null
          condition_ids?: string[] | null
          created_at?: string
          diet_preference?: string
          diet_preferences?: string[]
          id?: string
          sub_preferences?: string[]
          updated_at?: string
          user_id: string
        }
        Update: {
          allergen_food_ids?: string[]
          allergies?: string[] | null
          condition_ids?: string[] | null
          created_at?: string
          diet_preference?: string
          diet_preferences?: string[]
          id?: string
          sub_preferences?: string[]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_exercise_badges: {
        Row: {
          badge_key: string
          earned_at: string
          id: string
          user_id: string
        }
        Insert: {
          badge_key: string
          earned_at?: string
          id?: string
          user_id: string
        }
        Update: {
          badge_key?: string
          earned_at?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_exercise_badges_badge_key_fkey"
            columns: ["badge_key"]
            isOneToOne: false
            referencedRelation: "exercise_badges"
            referencedColumns: ["key"]
          },
        ]
      }
      user_exercise_logs: {
        Row: {
          created_at: string
          exercise_id: string
          id: string
          logged_at: string
          notes: string | null
          sets_done: number | null
          user_id: string
        }
        Insert: {
          created_at?: string
          exercise_id: string
          id?: string
          logged_at?: string
          notes?: string | null
          sets_done?: number | null
          user_id: string
        }
        Update: {
          created_at?: string
          exercise_id?: string
          id?: string
          logged_at?: string
          notes?: string | null
          sets_done?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_exercise_logs_exercise_id_fkey"
            columns: ["exercise_id"]
            isOneToOne: false
            referencedRelation: "exercises"
            referencedColumns: ["id"]
          },
        ]
      }
      user_fasting_badges: {
        Row: {
          badge_id: string
          current_streak: number
          earned_at: string
          id: string
          longest_streak: number
          user_id: string
        }
        Insert: {
          badge_id: string
          current_streak?: number
          earned_at?: string
          id?: string
          longest_streak?: number
          user_id: string
        }
        Update: {
          badge_id?: string
          current_streak?: number
          earned_at?: string
          id?: string
          longest_streak?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_fasting_badges_badge_id_fkey"
            columns: ["badge_id"]
            isOneToOne: false
            referencedRelation: "fasting_badges"
            referencedColumns: ["id"]
          },
        ]
      }
      user_fasting_milestones: {
        Row: {
          badge_id: string
          completed_at: string
          id: string
          user_id: string
          week_number: number
        }
        Insert: {
          badge_id: string
          completed_at?: string
          id?: string
          user_id: string
          week_number: number
        }
        Update: {
          badge_id?: string
          completed_at?: string
          id?: string
          user_id?: string
          week_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "user_fasting_milestones_badge_id_fkey"
            columns: ["badge_id"]
            isOneToOne: false
            referencedRelation: "fasting_badges"
            referencedColumns: ["id"]
          },
        ]
      }
      user_global_streak: {
        Row: {
          created_at: string
          current_streak: number
          last_complete_date: string | null
          longest_streak: number
          total_complete_days: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          current_streak?: number
          last_complete_date?: string | null
          longest_streak?: number
          total_complete_days?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          current_streak?: number
          last_complete_date?: string | null
          longest_streak?: number
          total_complete_days?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_global_streak_days: {
        Row: {
          all_complete: boolean
          created_at: string
          day: string
          id: string
          pillars_status: Json
          snapshot: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          all_complete?: boolean
          created_at?: string
          day: string
          id?: string
          pillars_status?: Json
          snapshot?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          all_complete?: boolean
          created_at?: string
          day?: string
          id?: string
          pillars_status?: Json
          snapshot?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_movement_badges: {
        Row: {
          badge_code: string
          earned_at: string
          id: string
          user_id: string
        }
        Insert: {
          badge_code: string
          earned_at?: string
          id?: string
          user_id: string
        }
        Update: {
          badge_code?: string
          earned_at?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      user_movement_progress: {
        Row: {
          assigned_at: string
          current_level: number
          current_streak_weeks: number
          custom_daily_step_goal: number | null
          custom_goal_note: string | null
          custom_goal_set_by: string | null
          custom_goal_updated_at: string | null
          id: string
          longest_streak_weeks: number
          total_weeks_completed: number
          total_weeks_missed: number
          updated_at: string
          user_id: string
          weeks_at_current_level: number
        }
        Insert: {
          assigned_at?: string
          current_level?: number
          current_streak_weeks?: number
          custom_daily_step_goal?: number | null
          custom_goal_note?: string | null
          custom_goal_set_by?: string | null
          custom_goal_updated_at?: string | null
          id?: string
          longest_streak_weeks?: number
          total_weeks_completed?: number
          total_weeks_missed?: number
          updated_at?: string
          user_id: string
          weeks_at_current_level?: number
        }
        Update: {
          assigned_at?: string
          current_level?: number
          current_streak_weeks?: number
          custom_daily_step_goal?: number | null
          custom_goal_note?: string | null
          custom_goal_set_by?: string | null
          custom_goal_updated_at?: string | null
          id?: string
          longest_streak_weeks?: number
          total_weeks_completed?: number
          total_weeks_missed?: number
          updated_at?: string
          user_id?: string
          weeks_at_current_level?: number
        }
        Relationships: []
      }
      user_movement_weekly: {
        Row: {
          avg_daily_steps: number
          created_at: string
          days_hit_target: number
          finalized_at: string | null
          id: string
          level_at_week: number
          status: string
          target_daily_steps: number
          total_steps: number
          updated_at: string
          user_id: string
          week_start: string
        }
        Insert: {
          avg_daily_steps?: number
          created_at?: string
          days_hit_target?: number
          finalized_at?: string | null
          id?: string
          level_at_week: number
          status?: string
          target_daily_steps: number
          total_steps?: number
          updated_at?: string
          user_id: string
          week_start: string
        }
        Update: {
          avg_daily_steps?: number
          created_at?: string
          days_hit_target?: number
          finalized_at?: string | null
          id?: string
          level_at_week?: number
          status?: string
          target_daily_steps?: number
          total_steps?: number
          updated_at?: string
          user_id?: string
          week_start?: string
        }
        Relationships: []
      }
      user_plates: {
        Row: {
          avg_gi: number | null
          created_at: string
          gi_band: string | null
          id: string
          is_todays_meal: boolean
          items: Json
          name: string
          snapshot_url: string | null
          sugar_spike_risk: string | null
          total_calories_kcal: number | null
          total_carbs_g: number | null
          total_fat_g: number | null
          total_fiber_g: number | null
          total_protein_g: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          avg_gi?: number | null
          created_at?: string
          gi_band?: string | null
          id?: string
          is_todays_meal?: boolean
          items?: Json
          name?: string
          snapshot_url?: string | null
          sugar_spike_risk?: string | null
          total_calories_kcal?: number | null
          total_carbs_g?: number | null
          total_fat_g?: number | null
          total_fiber_g?: number | null
          total_protein_g?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          avg_gi?: number | null
          created_at?: string
          gi_band?: string | null
          id?: string
          is_todays_meal?: boolean
          items?: Json
          name?: string
          snapshot_url?: string | null
          sugar_spike_risk?: string | null
          total_calories_kcal?: number | null
          total_carbs_g?: number | null
          total_fat_g?: number | null
          total_fiber_g?: number | null
          total_protein_g?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_protocols: {
        Row: {
          assigned_by: string | null
          created_at: string
          id: string
          protocol_id: string
          start_date: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          assigned_by?: string | null
          created_at?: string
          id?: string
          protocol_id: string
          start_date?: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          assigned_by?: string | null
          created_at?: string
          id?: string
          protocol_id?: string
          start_date?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_protocols_protocol_id_fkey"
            columns: ["protocol_id"]
            isOneToOne: false
            referencedRelation: "fasting_protocols"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      user_soleus_sessions: {
        Row: {
          created_at: string
          id: string
          session_at: string
          source: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          session_at?: string
          source?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          session_at?: string
          source?: string
          user_id?: string
        }
        Relationships: []
      }
      user_supplement_badges: {
        Row: {
          badge_id: string
          current_streak: number
          earned_at: string
          id: string
          longest_streak: number
          user_id: string
        }
        Insert: {
          badge_id: string
          current_streak?: number
          earned_at?: string
          id?: string
          longest_streak?: number
          user_id: string
        }
        Update: {
          badge_id?: string
          current_streak?: number
          earned_at?: string
          id?: string
          longest_streak?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_supplement_badges_badge_id_fkey"
            columns: ["badge_id"]
            isOneToOne: false
            referencedRelation: "supplement_badges"
            referencedColumns: ["id"]
          },
        ]
      }
      user_supplement_plan_items: {
        Row: {
          created_at: string
          dosage: string
          duration_weeks: number
          frequency: string
          id: string
          is_active: boolean
          plan_id: string
          remarks: string | null
          supplement_id: string
          timing: string | null
        }
        Insert: {
          created_at?: string
          dosage: string
          duration_weeks?: number
          frequency?: string
          id?: string
          is_active?: boolean
          plan_id: string
          remarks?: string | null
          supplement_id: string
          timing?: string | null
        }
        Update: {
          created_at?: string
          dosage?: string
          duration_weeks?: number
          frequency?: string
          id?: string
          is_active?: boolean
          plan_id?: string
          remarks?: string | null
          supplement_id?: string
          timing?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_supplement_plan_items_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "user_supplement_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_supplement_plan_items_supplement_id_fkey"
            columns: ["supplement_id"]
            isOneToOne: false
            referencedRelation: "supplement_master"
            referencedColumns: ["id"]
          },
        ]
      }
      user_supplement_plans: {
        Row: {
          assigned_by: string | null
          created_at: string
          duration_weeks: number
          id: string
          notes: string | null
          plan_name: string
          start_date: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          assigned_by?: string | null
          created_at?: string
          duration_weeks?: number
          id?: string
          notes?: string | null
          plan_name?: string
          start_date?: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          assigned_by?: string | null
          created_at?: string
          duration_weeks?: number
          id?: string
          notes?: string | null
          plan_name?: string
          start_date?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_supplement_tracking: {
        Row: {
          created_at: string
          date: string
          id: string
          notes: string | null
          plan_item_id: string
          taken: boolean
          user_id: string
        }
        Insert: {
          created_at?: string
          date?: string
          id?: string
          notes?: string | null
          plan_item_id: string
          taken?: boolean
          user_id: string
        }
        Update: {
          created_at?: string
          date?: string
          id?: string
          notes?: string | null
          plan_item_id?: string
          taken?: boolean
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_supplement_tracking_plan_item_id_fkey"
            columns: ["plan_item_id"]
            isOneToOne: false
            referencedRelation: "user_supplement_plan_items"
            referencedColumns: ["id"]
          },
        ]
      }
      user_symptoms: {
        Row: {
          created_at: string
          id: string
          notes: string | null
          symptom_keys: string[]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          notes?: string | null
          symptom_keys?: string[]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          notes?: string | null
          symptom_keys?: string[]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      video_categories: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          slug: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          slug: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          slug?: string
          sort_order?: number
        }
        Relationships: []
      }
      video_metadata: {
        Row: {
          benefits: string | null
          category: string | null
          created_at: string
          donts: string | null
          dos: string | null
          group_name: string | null
          icon: string | null
          id: string
          is_custom: boolean
          is_enabled: boolean
          name: string | null
          not_suitable_for: string | null
          suitable_for: string | null
          tags: string[] | null
          thumbnail_url: string | null
          updated_at: string
          updated_by: string | null
          video_id: string
          youtube_id: string | null
        }
        Insert: {
          benefits?: string | null
          category?: string | null
          created_at?: string
          donts?: string | null
          dos?: string | null
          group_name?: string | null
          icon?: string | null
          id?: string
          is_custom?: boolean
          is_enabled?: boolean
          name?: string | null
          not_suitable_for?: string | null
          suitable_for?: string | null
          tags?: string[] | null
          thumbnail_url?: string | null
          updated_at?: string
          updated_by?: string | null
          video_id: string
          youtube_id?: string | null
        }
        Update: {
          benefits?: string | null
          category?: string | null
          created_at?: string
          donts?: string | null
          dos?: string | null
          group_name?: string | null
          icon?: string | null
          id?: string
          is_custom?: boolean
          is_enabled?: boolean
          name?: string | null
          not_suitable_for?: string | null
          suitable_for?: string | null
          tags?: string[] | null
          thumbnail_url?: string | null
          updated_at?: string
          updated_by?: string | null
          video_id?: string
          youtube_id?: string | null
        }
        Relationships: []
      }
      video_progress: {
        Row: {
          completed: boolean
          created_at: string
          duration_sec: number
          id: string
          progress_sec: number
          updated_at: string
          user_id: string
          video_id: string
          watched_at: string
          youtube_id: string | null
        }
        Insert: {
          completed?: boolean
          created_at?: string
          duration_sec?: number
          id?: string
          progress_sec?: number
          updated_at?: string
          user_id: string
          video_id: string
          watched_at?: string
          youtube_id?: string | null
        }
        Update: {
          completed?: boolean
          created_at?: string
          duration_sec?: number
          id?: string
          progress_sec?: number
          updated_at?: string
          user_id?: string
          video_id?: string
          watched_at?: string
          youtube_id?: string | null
        }
        Relationships: []
      }
      video_thumbnails: {
        Row: {
          thumbnail_url: string
          updated_at: string
          updated_by: string | null
          video_id: string
        }
        Insert: {
          thumbnail_url: string
          updated_at?: string
          updated_by?: string | null
          video_id: string
        }
        Update: {
          thumbnail_url?: string
          updated_at?: string
          updated_by?: string | null
          video_id?: string
        }
        Relationships: []
      }
      videos: {
        Row: {
          category_ids: string[]
          created_at: string
          description: string | null
          duration: number
          external_video_id: string
          id: string
          instructor_name: string | null
          is_active: boolean
          language: string
          level: string
          source_platform: string
          tags: string[]
          thumbnail_url: string
          title: string
          updated_at: string
        }
        Insert: {
          category_ids?: string[]
          created_at?: string
          description?: string | null
          duration?: number
          external_video_id: string
          id?: string
          instructor_name?: string | null
          is_active?: boolean
          language?: string
          level?: string
          source_platform?: string
          tags?: string[]
          thumbnail_url: string
          title: string
          updated_at?: string
        }
        Update: {
          category_ids?: string[]
          created_at?: string
          description?: string | null
          duration?: number
          external_video_id?: string
          id?: string
          instructor_name?: string | null
          is_active?: boolean
          language?: string
          level?: string
          source_platform?: string
          tags?: string[]
          thumbnail_url?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      yoga_booking_instances: {
        Row: {
          booking_id: string
          created_at: string
          id: string
          package_id: string
          partner_id: string
          slot_id: string
          status: string
          template_id: string
          user_id: string
        }
        Insert: {
          booking_id: string
          created_at?: string
          id?: string
          package_id: string
          partner_id: string
          slot_id: string
          status?: string
          template_id: string
          user_id: string
        }
        Update: {
          booking_id?: string
          created_at?: string
          id?: string
          package_id?: string
          partner_id?: string
          slot_id?: string
          status?: string
          template_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "yoga_booking_instances_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "yoga_bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "yoga_booking_instances_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "channel_partner_packages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "yoga_booking_instances_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "channel_partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "yoga_booking_instances_slot_id_fkey"
            columns: ["slot_id"]
            isOneToOne: false
            referencedRelation: "channel_partner_slots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "yoga_booking_instances_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "channel_partner_slot_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      yoga_bookings: {
        Row: {
          created_at: string
          expires_on: string | null
          id: string
          notes: string | null
          package_id: string
          package_type: string
          partner_id: string
          payment_ref: string | null
          payment_status: string
          preferred_days: string[] | null
          preferred_time: string | null
          price_inr: number
          selected_slot: string | null
          slot_id: string | null
          starts_on: string | null
          status: string
          template_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          expires_on?: string | null
          id?: string
          notes?: string | null
          package_id: string
          package_type: string
          partner_id: string
          payment_ref?: string | null
          payment_status?: string
          preferred_days?: string[] | null
          preferred_time?: string | null
          price_inr: number
          selected_slot?: string | null
          slot_id?: string | null
          starts_on?: string | null
          status?: string
          template_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          expires_on?: string | null
          id?: string
          notes?: string | null
          package_id?: string
          package_type?: string
          partner_id?: string
          payment_ref?: string | null
          payment_status?: string
          preferred_days?: string[] | null
          preferred_time?: string | null
          price_inr?: number
          selected_slot?: string | null
          slot_id?: string | null
          starts_on?: string | null
          status?: string
          template_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "yoga_bookings_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "channel_partner_packages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "yoga_bookings_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "channel_partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "yoga_bookings_slot_id_fkey"
            columns: ["slot_id"]
            isOneToOne: false
            referencedRelation: "channel_partner_slots"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      admin_referrals_overview: {
        Row: {
          created_at: string | null
          id: string | null
          referral_code: string | null
          referred_name: string | null
          referred_phone: string | null
          referred_subscribed: boolean | null
          referred_user_id: string | null
          referrer_id: string | null
          referrer_name: string | null
          referrer_phone: string | null
          reward_granted: boolean | null
          status: string | null
        }
        Relationships: []
      }
      coaches_public: {
        Row: {
          avatar_url: string | null
          avg_rating: number | null
          bbdo_community_exp: number | null
          bio: string | null
          city: string | null
          coach_type: Database["public"]["Enums"]["coach_type"] | null
          description: string | null
          id: string | null
          is_active: boolean | null
          languages: string[] | null
          name: string | null
          qualification: string | null
          specialization: string | null
          total_consultations: number | null
          total_ratings: number | null
        }
        Insert: {
          avatar_url?: string | null
          avg_rating?: number | null
          bbdo_community_exp?: number | null
          bio?: string | null
          city?: string | null
          coach_type?: Database["public"]["Enums"]["coach_type"] | null
          description?: string | null
          id?: string | null
          is_active?: boolean | null
          languages?: string[] | null
          name?: string | null
          qualification?: string | null
          specialization?: string | null
          total_consultations?: number | null
          total_ratings?: number | null
        }
        Update: {
          avatar_url?: string | null
          avg_rating?: number | null
          bbdo_community_exp?: number | null
          bio?: string | null
          city?: string | null
          coach_type?: Database["public"]["Enums"]["coach_type"] | null
          description?: string | null
          id?: string | null
          is_active?: boolean | null
          languages?: string[] | null
          name?: string | null
          qualification?: string | null
          specialization?: string | null
          total_consultations?: number | null
          total_ratings?: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      activate_due_subscriptions: {
        Args: { _user_id?: string }
        Returns: undefined
      }
      apply_referral_code: { Args: { _code: string }; Returns: string }
      approve_custom_slot_request: {
        Args: {
          _booking_id: string
          _days_of_week: number[]
          _duration_min?: number
          _meet_link?: string
          _time_of_day: string
        }
        Returns: undefined
      }
      assign_coach_for_plan: {
        Args: { _plan_id: string; _user_id: string }
        Returns: string
      }
      award_exercise_badges: { Args: { _user_id: string }; Returns: number }
      award_fasting_badges: {
        Args: { _user_id: string }
        Returns: {
          current_streak: number
          longest_streak: number
          newly_awarded: number
        }[]
      }
      award_movement_badges: { Args: { _user_id: string }; Returns: number }
      award_supplement_badges: {
        Args: { _user_id: string }
        Returns: {
          current_streak: number
          longest_streak: number
          newly_awarded: number
        }[]
      }
      bbdo_diet_pools: {
        Args: { _diet?: string; _user_id: string }
        Returns: Json
      }
      bbdo_food_filter_id: { Args: { _names: string[] }; Returns: string }
      bbdo_normalize_diet_preference: {
        Args: { _diet: string }
        Returns: string
      }
      bbdo_pick: { Args: { _arr: Json; _i: number }; Returns: Json }
      bbdo_plate_from_pools: {
        Args: { _diet: string; _idx: number; _pools: Json; _slot: string }
        Returns: Json
      }
      bbdo_user_diet_gating: {
        Args: { _user_id: string }
        Returns: {
          allergen_ids: string[]
          recs: string[]
          sub_prefs: string[]
        }[]
      }
      book_yoga_month: {
        Args: {
          _duration_days?: number
          _package_id: string
          _package_type: string
          _partner_id: string
          _price_inr: number
          _selected_slot: string
          _template_id: string
        }
        Returns: {
          created_at: string
          expires_on: string | null
          id: string
          notes: string | null
          package_id: string
          package_type: string
          partner_id: string
          payment_ref: string | null
          payment_status: string
          preferred_days: string[] | null
          preferred_time: string | null
          price_inr: number
          selected_slot: string | null
          slot_id: string | null
          starts_on: string | null
          status: string
          template_id: string | null
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "yoga_bookings"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      build_bbdo_snapshot: {
        Args: { _end: string; _start: string; _user_id: string }
        Returns: Json
      }
      bulk_disable_lab_tests: {
        Args: { _test_ids: string[] }
        Returns: {
          disabled_count: number
          protected_codes: string[]
          protected_count: number
        }[]
      }
      bulk_enable_lab_tests: {
        Args: { _test_ids: string[] }
        Returns: {
          enabled_count: number
        }[]
      }
      can_coach_view_assigned_user: {
        Args: { _user_id: string }
        Returns: boolean
      }
      cancel_event_registration: {
        Args: { _event_id: string }
        Returns: {
          amount_paid_inr: number
          cancelled_at: string | null
          created_at: string
          event_id: string
          id: string
          notes: string | null
          payment_status: string
          registered_at: string
          status: string
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "event_registrations"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      change_subscription_plan: {
        Args: {
          _duration_months: number
          _mode: string
          _plan_id: string
          _plan_name: string
          _plan_price: number
        }
        Returns: {
          change_type: string
          created_at: string
          credit_applied: number
          duration_months: number
          expires_at: string
          id: string
          plan_id: string
          plan_name: string
          plan_price: number
          started_at: string
          status: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "subscriptions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      cleanup_orphan_storage: {
        Args: never
        Returns: {
          bucket: string
          deleted_count: number
        }[]
      }
      coach_owns_patient: {
        Args: { _patient_user_id: string }
        Returns: boolean
      }
      community_member_count: { Args: never; Returns: number }
      complete_demo_payment: {
        Args: {
          _duration_months: number
          _plan_id: string
          _plan_name: string
          _plan_price: number
        }
        Returns: {
          change_type: string
          created_at: string
          credit_applied: number
          duration_months: number
          expires_at: string
          id: string
          plan_id: string
          plan_name: string
          plan_price: number
          started_at: string
          status: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "subscriptions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      compute_global_streak_for_user: {
        Args: { _day?: string; _user_id: string }
        Returns: Json
      }
      compute_onboarding_grade: { Args: { _answers: Json }; Returns: Json }
      create_notification: {
        Args: {
          _action_url?: string
          _body: string
          _icon?: string
          _title: string
          _type?: string
          _user_id: string
        }
        Returns: string
      }
      current_user_package_key: { Args: { _user_id: string }; Returns: string }
      delete_supplement_category: { Args: { _key: string }; Returns: undefined }
      delete_supplement_condition: {
        Args: { _key: string }
        Returns: undefined
      }
      email_exists: { Args: { _email: string }; Returns: boolean }
      generate_diet_plating: {
        Args: { _diet?: string; _user_id: string }
        Returns: number
      }
      get_assigned_coach: {
        Args: { _user_id: string }
        Returns: {
          avatar_url: string
          avg_rating: number
          bbdo_community_exp: number
          bio: string
          city: string
          coach_type: Database["public"]["Enums"]["coach_type"]
          description: string
          id: string
          is_active: boolean
          languages: string[]
          name: string
          phone: string
          qualification: string
          specialization: string
          total_consultations: number
          total_ratings: number
        }[]
      }
      get_bmi_category: {
        Args: { _bmi: number }
        Returns: {
          code: string
          color: string
          label: string
        }[]
      }
      get_coach_commission_summary: {
        Args: { _coach_id: string }
        Returns: {
          commission_name: string
          commission_percent: number
          monthly_commission: number
          payout_frequency: string
          plan_monthly_revenue: number
          plan_name: string
          plan_users: number
          total_assigned: number
          total_monthly_revenue: number
          total_paying: number
        }[]
      }
      get_community_post_likers: {
        Args: { _limit?: number; _post_id: string }
        Returns: {
          avatar_url: string
          liked_at: string
          name: string
          user_id: string
        }[]
      }
      get_daily_exercise_goal: { Args: never; Returns: number }
      get_daily_yoga_minutes: { Args: never; Returns: number }
      get_lab_test_markup_pct: { Args: never; Returns: number }
      get_referral_reward_days: { Args: never; Returns: number }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_assigned_patient_of_coach: {
        Args: { _coach_row_id: string }
        Returns: boolean
      }
      is_coach_of_assignment: { Args: { _coach_id: string }; Returns: boolean }
      is_patient_notification_recipient: {
        Args: { _user_id: string }
        Returns: boolean
      }
      issue_bbdo_badges_for_user: {
        Args: { _day?: string; _user_id: string }
        Returns: number
      }
      lab_tests_in_use: {
        Args: { _product_codes: string[] }
        Returns: {
          product_code: string
        }[]
      }
      link_coach_to_user: {
        Args: { _phone: string; _user_id: string }
        Returns: string
      }
      link_partner_to_user: {
        Args: { _phone: string; _user_id: string }
        Returns: string
      }
      notify_assigned_coaches_of_health_metric: {
        Args: {
          _body: string
          _level?: string
          _metric?: string
          _patient_user_id: string
          _title: string
        }
        Returns: undefined
      }
      pay_and_create_custom_slot: {
        Args: { _booking_id: string }
        Returns: string
      }
      pnl_compute: {
        Args: { _from: string; _to: string }
        Returns: {
          coach_cost: number
          gross: number
          gst: number
          hyperrevamp_cost: number
          label: string
          margin: number
          meta: Json
          net: number
          occurred_at: string
          partner_cost: number
          ref_id: string
          source: string
          user_id: string
        }[]
      }
      preview_plan_change: {
        Args: { _duration_months: number; _mode: string; _plan_price: number }
        Returns: Json
      }
      rbac_can: {
        Args: {
          _action: string
          _module: string
          _sub_module: string
          _user_id: string
        }
        Returns: boolean
      }
      recompute_coach_rating: {
        Args: { _coach_id: string }
        Returns: undefined
      }
      recompute_event_registered_count: {
        Args: { _event_id: string }
        Returns: undefined
      }
      recompute_movement_progress_for_user: {
        Args: { _through_day?: string; _user_id: string }
        Returns: Json
      }
      recompute_yoga_template_slot_counts: {
        Args: { _template_id: string }
        Returns: undefined
      }
      refresh_gamification_for_user: {
        Args: { _day?: string; _user_id: string }
        Returns: undefined
      }
      register_for_event: {
        Args: { _event_id: string }
        Returns: {
          amount_paid_inr: number
          cancelled_at: string | null
          created_at: string
          event_id: string
          id: string
          notes: string | null
          payment_status: string
          registered_at: string
          status: string
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "event_registrations"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      rename_supplement_category:
        | {
            Args: { _new_key: string; _new_label: string; _old_key: string }
            Returns: undefined
          }
        | {
            Args: {
              _new_icon?: string
              _new_key: string
              _new_label: string
              _old_key: string
            }
            Returns: undefined
          }
      rename_supplement_condition:
        | {
            Args: { _new_key: string; _new_label: string; _old_key: string }
            Returns: undefined
          }
        | {
            Args: {
              _new_icon?: string
              _new_key: string
              _new_label: string
              _old_key: string
            }
            Returns: undefined
          }
      run_daily_gamification_close: { Args: never; Returns: number }
      seed_onboarding_notifications: {
        Args: { _user_id: string }
        Returns: number
      }
      send_welcome_notification: { Args: { _user_id: string }; Returns: string }
      streak_from_dates: {
        Args: { _dates: string[]; _today: string }
        Returns: {
          current_streak: number
          longest_streak: number
        }[]
      }
      swap_diet_plate: {
        Args: { _plate_id: string; _seed?: number }
        Returns: Json
      }
    }
    Enums: {
      app_role: "user" | "coach" | "admin" | "channel_partner"
      coach_type: "starter_reset" | "active_reset" | "pro_transformation"
      consultation_status: "pending" | "scheduled" | "declined" | "completed"
      food_category_slug: "sugar_spike" | "metabolic_essential" | "power_addon"
      food_diet_type: "veg" | "vegan" | "non_veg" | "jain" | "eggitarian"
      food_gi_band: "low" | "low_med" | "medium" | "med_high" | "high"
      food_recommendation: "avoid" | "limit" | "moderate" | "encourage"
      food_serving_basis: "per_100g" | "per_100ml" | "cooked" | "raw"
      meeting_status: "scheduled" | "completed" | "cancelled" | "no_show"
      meeting_type:
        | "onboarding"
        | "weekly_checkpoint"
        | "quarterly_review"
        | "consultation"
        | "followup"
      recommendation_status:
        | "recommended"
        | "accepted"
        | "ordered"
        | "completed"
        | "dismissed"
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
      app_role: ["user", "coach", "admin", "channel_partner"],
      coach_type: ["starter_reset", "active_reset", "pro_transformation"],
      consultation_status: ["pending", "scheduled", "declined", "completed"],
      food_category_slug: ["sugar_spike", "metabolic_essential", "power_addon"],
      food_diet_type: ["veg", "vegan", "non_veg", "jain", "eggitarian"],
      food_gi_band: ["low", "low_med", "medium", "med_high", "high"],
      food_recommendation: ["avoid", "limit", "moderate", "encourage"],
      food_serving_basis: ["per_100g", "per_100ml", "cooked", "raw"],
      meeting_status: ["scheduled", "completed", "cancelled", "no_show"],
      meeting_type: [
        "onboarding",
        "weekly_checkpoint",
        "quarterly_review",
        "consultation",
        "followup",
      ],
      recommendation_status: [
        "recommended",
        "accepted",
        "ordered",
        "completed",
        "dismissed",
      ],
    },
  },
} as const
