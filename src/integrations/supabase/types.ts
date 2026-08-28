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
    PostgrestVersion: "14.17"
  }
  public: {
    Tables: {
      academic_periods: {
        Row: {
          academic_year_id: string
          created_at: string
          end_date: string
          id: string
          is_current: boolean | null
          name: string
          start_date: string
        }
        Insert: {
          academic_year_id: string
          created_at?: string
          end_date: string
          id?: string
          is_current?: boolean | null
          name: string
          start_date: string
        }
        Update: {
          academic_year_id?: string
          created_at?: string
          end_date?: string
          id?: string
          is_current?: boolean | null
          name?: string
          start_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "academic_periods_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id"]
          },
        ]
      }
      academic_years: {
        Row: {
          created_at: string
          end_date: string
          id: string
          is_current: boolean | null
          name: string
          org_id: string
          start_date: string
        }
        Insert: {
          created_at?: string
          end_date: string
          id?: string
          is_current?: boolean | null
          name: string
          org_id: string
          start_date: string
        }
        Update: {
          created_at?: string
          end_date?: string
          id?: string
          is_current?: boolean | null
          name?: string
          org_id?: string
          start_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "academic_years_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisation_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_usage_events: {
        Row: {
          analysis_type: string
          created_at: string
          error_message: string | null
          id: string
          input_tokens: number
          model: string | null
          org_id: string
          output_tokens: number
          school_id: string | null
          status: string
          user_id: string | null
        }
        Insert: {
          analysis_type: string
          created_at?: string
          error_message?: string | null
          id?: string
          input_tokens?: number
          model?: string | null
          org_id: string
          output_tokens?: number
          school_id?: string | null
          status?: string
          user_id?: string | null
        }
        Update: {
          analysis_type?: string
          created_at?: string
          error_message?: string | null
          id?: string
          input_tokens?: number
          model?: string | null
          org_id?: string
          output_tokens?: number
          school_id?: string | null
          status?: string
          user_id?: string | null
        }
        Relationships: []
      }
      approval_requests: {
        Row: {
          amount: number | null
          created_at: string
          description: string
          id: string
          org_id: string
          reference_id: string | null
          reference_type: string | null
          requested_by: string | null
          review_notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["approval_status"]
          type: Database["public"]["Enums"]["approval_type"]
          updated_at: string
        }
        Insert: {
          amount?: number | null
          created_at?: string
          description: string
          id?: string
          org_id: string
          reference_id?: string | null
          reference_type?: string | null
          requested_by?: string | null
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["approval_status"]
          type: Database["public"]["Enums"]["approval_type"]
          updated_at?: string
        }
        Update: {
          amount?: number | null
          created_at?: string
          description?: string
          id?: string
          org_id?: string
          reference_id?: string | null
          reference_type?: string | null
          requested_by?: string | null
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["approval_status"]
          type?: Database["public"]["Enums"]["approval_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "approval_requests_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisation_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance_records: {
        Row: {
          class_id: string
          created_at: string
          date: string
          id: string
          marked_by: string | null
          notes: string | null
          school_id: string
          status: Database["public"]["Enums"]["attendance_status"]
          student_id: string
          updated_at: string
        }
        Insert: {
          class_id: string
          created_at?: string
          date: string
          id?: string
          marked_by?: string | null
          notes?: string | null
          school_id: string
          status?: Database["public"]["Enums"]["attendance_status"]
          student_id: string
          updated_at?: string
        }
        Update: {
          class_id?: string
          created_at?: string
          date?: string
          id?: string
          marked_by?: string | null
          notes?: string | null
          school_id?: string
          status?: Database["public"]["Enums"]["attendance_status"]
          student_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_records_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_records_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_records_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          created_at: string
          detail: string | null
          entity_id: string | null
          entity_type: string
          id: string
          new_values: Json | null
          old_values: Json | null
          org_id: string
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          detail?: string | null
          entity_id?: string | null
          entity_type: string
          id?: string
          new_values?: Json | null
          old_values?: Json | null
          org_id: string
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          detail?: string | null
          entity_id?: string | null
          entity_type?: string
          id?: string
          new_values?: Json | null
          old_values?: Json | null
          org_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisation_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      campuses: {
        Row: {
          address: string | null
          created_at: string
          id: string
          name: string
          school_id: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          created_at?: string
          id?: string
          name: string
          school_id: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          created_at?: string
          id?: string
          name?: string
          school_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "campuses_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      class_subjects: {
        Row: {
          class_id: string
          created_at: string
          id: string
          subject_id: string
        }
        Insert: {
          class_id: string
          created_at?: string
          id?: string
          subject_id: string
        }
        Update: {
          class_id?: string
          created_at?: string
          id?: string
          subject_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "class_subjects_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "class_subjects_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
        ]
      }
      class_teachers: {
        Row: {
          class_id: string
          created_at: string
          id: string
          is_form_teacher: boolean
          staff_id: string
        }
        Insert: {
          class_id: string
          created_at?: string
          id?: string
          is_form_teacher?: boolean
          staff_id: string
        }
        Update: {
          class_id?: string
          created_at?: string
          id?: string
          is_form_teacher?: boolean
          staff_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "class_teachers_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "class_teachers_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      applications: {
        Row: {
          applicant_first_name: string
          applicant_last_name: string
          converted_student_id: string | null
          created_at: string
          date_of_birth: string | null
          decision_notes: string | null
          desired_class_id: string | null
          gender: string | null
          guardian_address: string | null
          guardian_email: string | null
          guardian_name: string
          guardian_phone: string
          id: string
          message: string | null
          previous_school: string | null
          reference: string
          reviewed_at: string | null
          reviewed_by: string | null
          school_id: string
          section: Database["public"]["Enums"]["school_section"] | null
          source: string | null
          status: Database["public"]["Enums"]["application_status"]
          updated_at: string
        }
        Insert: {
          applicant_first_name: string
          applicant_last_name: string
          converted_student_id?: string | null
          created_at?: string
          date_of_birth?: string | null
          decision_notes?: string | null
          desired_class_id?: string | null
          gender?: string | null
          guardian_address?: string | null
          guardian_email?: string | null
          guardian_name: string
          guardian_phone: string
          id?: string
          message?: string | null
          previous_school?: string | null
          reference?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          school_id: string
          section?: Database["public"]["Enums"]["school_section"] | null
          source?: string | null
          status?: Database["public"]["Enums"]["application_status"]
          updated_at?: string
        }
        Update: {
          applicant_first_name?: string
          applicant_last_name?: string
          converted_student_id?: string | null
          created_at?: string
          date_of_birth?: string | null
          decision_notes?: string | null
          desired_class_id?: string | null
          gender?: string | null
          guardian_address?: string | null
          guardian_email?: string | null
          guardian_name?: string
          guardian_phone?: string
          id?: string
          message?: string | null
          previous_school?: string | null
          reference?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          school_id?: string
          section?: Database["public"]["Enums"]["school_section"] | null
          source?: string | null
          status?: Database["public"]["Enums"]["application_status"]
          updated_at?: string
        }
        Relationships: []
      }
      classes: {
        Row: {
          created_at: string
          id: string
          level_order: number | null
          section: Database["public"]["Enums"]["school_section"] | null
          name: string
          school_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          level_order?: number | null
          section?: Database["public"]["Enums"]["school_section"] | null
          name: string
          school_id: string
        }
        Update: {
          created_at?: string
          id?: string
          level_order?: number | null
          section?: Database["public"]["Enums"]["school_section"] | null
          name?: string
          school_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "classes_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      document_files: {
        Row: {
          category: string | null
          created_at: string
          entity_id: string
          entity_type: string
          file_name: string
          file_size: number | null
          file_url: string
          id: string
          notes: string | null
          org_id: string
          school_id: string
          uploaded_by: string | null
        }
        Insert: {
          category?: string | null
          created_at?: string
          entity_id: string
          entity_type: string
          file_name: string
          file_size?: number | null
          file_url: string
          id?: string
          notes?: string | null
          org_id: string
          school_id: string
          uploaded_by?: string | null
        }
        Update: {
          category?: string | null
          created_at?: string
          entity_id?: string
          entity_type?: string
          file_name?: string
          file_size?: number | null
          file_url?: string
          id?: string
          notes?: string | null
          org_id?: string
          school_id?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "document_files_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisation_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_files_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      enrolments: {
        Row: {
          academic_period_id: string
          class_id: string
          created_at: string
          enrolled_at: string
          id: string
          student_id: string
        }
        Insert: {
          academic_period_id: string
          class_id: string
          created_at?: string
          enrolled_at?: string
          id?: string
          student_id: string
        }
        Update: {
          academic_period_id?: string
          class_id?: string
          created_at?: string
          enrolled_at?: string
          id?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "enrolments_academic_period_id_fkey"
            columns: ["academic_period_id"]
            isOneToOne: false
            referencedRelation: "academic_periods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrolments_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrolments_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      exams: {
        Row: {
          academic_period_id: string | null
          class_id: string | null
          created_at: string
          created_by: string | null
          exam_date: string | null
          id: string
          max_score: number
          name: string
          school_id: string
          status: string
          updated_at: string
          weight: number
        }
        Insert: {
          academic_period_id?: string | null
          class_id?: string | null
          created_at?: string
          created_by?: string | null
          exam_date?: string | null
          id?: string
          max_score?: number
          name: string
          school_id: string
          status?: string
          updated_at?: string
          weight?: number
        }
        Update: {
          academic_period_id?: string | null
          class_id?: string | null
          created_at?: string
          created_by?: string | null
          exam_date?: string | null
          id?: string
          max_score?: number
          name?: string
          school_id?: string
          status?: string
          updated_at?: string
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "exams_academic_period_id_fkey"
            columns: ["academic_period_id"]
            isOneToOne: false
            referencedRelation: "academic_periods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exams_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exams_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      fee_categories: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          org_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          org_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          org_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fee_categories_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisation_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      fee_schedules: {
        Row: {
          academic_period_id: string | null
          class_id: string | null
          created_at: string
          id: string
          is_active: boolean | null
          name: string
          school_id: string
          total_amount: number
          updated_at: string
        }
        Insert: {
          academic_period_id?: string | null
          class_id?: string | null
          created_at?: string
          id?: string
          is_active?: boolean | null
          name: string
          school_id: string
          total_amount?: number
          updated_at?: string
        }
        Update: {
          academic_period_id?: string | null
          class_id?: string | null
          created_at?: string
          id?: string
          is_active?: boolean | null
          name?: string
          school_id?: string
          total_amount?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fee_schedules_academic_period_id_fkey"
            columns: ["academic_period_id"]
            isOneToOne: false
            referencedRelation: "academic_periods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fee_schedules_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fee_schedules_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      guardians: {
        Row: {
          address: string | null
          created_at: string
          email: string | null
          first_name: string
          id: string
          last_name: string
          org_id: string
          phone: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          address?: string | null
          created_at?: string
          email?: string | null
          first_name: string
          id?: string
          last_name: string
          org_id: string
          phone?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          address?: string | null
          created_at?: string
          email?: string | null
          first_name?: string
          id?: string
          last_name?: string
          org_id?: string
          phone?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "guardians_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisation_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_items: {
        Row: {
          amount: number
          created_at: string
          description: string
          fee_category_id: string | null
          id: string
          invoice_id: string
        }
        Insert: {
          amount?: number
          created_at?: string
          description: string
          fee_category_id?: string | null
          id?: string
          invoice_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          description?: string
          fee_category_id?: string | null
          id?: string
          invoice_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoice_items_fee_category_id_fkey"
            columns: ["fee_category_id"]
            isOneToOne: false
            referencedRelation: "fee_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          academic_period_id: string | null
          amount_paid: number
          created_at: string
          created_by: string | null
          due_date: string | null
          id: string
          invoice_number: string
          issued_at: string
          school_id: string
          status: Database["public"]["Enums"]["invoice_status"]
          student_id: string
          total_amount: number
          updated_at: string
        }
        Insert: {
          academic_period_id?: string | null
          amount_paid?: number
          created_at?: string
          created_by?: string | null
          due_date?: string | null
          id?: string
          invoice_number: string
          issued_at?: string
          school_id: string
          status?: Database["public"]["Enums"]["invoice_status"]
          student_id: string
          total_amount?: number
          updated_at?: string
        }
        Update: {
          academic_period_id?: string | null
          amount_paid?: number
          created_at?: string
          created_by?: string | null
          due_date?: string | null
          id?: string
          invoice_number?: string
          issued_at?: string
          school_id?: string
          status?: Database["public"]["Enums"]["invoice_status"]
          student_id?: string
          total_amount?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_academic_period_id_fkey"
            columns: ["academic_period_id"]
            isOneToOne: false
            referencedRelation: "academic_periods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_preferences: {
        Row: {
          channel_email: boolean
          channel_in_app: boolean
          channel_sms: boolean
          id: string
          notification_type: Database["public"]["Enums"]["notification_type"]
          user_id: string
        }
        Insert: {
          channel_email?: boolean
          channel_in_app?: boolean
          channel_sms?: boolean
          id?: string
          notification_type: Database["public"]["Enums"]["notification_type"]
          user_id: string
        }
        Update: {
          channel_email?: boolean
          channel_in_app?: boolean
          channel_sms?: boolean
          id?: string
          notification_type?: Database["public"]["Enums"]["notification_type"]
          user_id?: string
        }
        Relationships: []
      }
      notification_templates: {
        Row: {
          body: string
          channel: string
          created_at: string
          id: string
          is_active: boolean
          org_id: string
          subject: string
          type: string
          updated_at: string
        }
        Insert: {
          body?: string
          channel?: string
          created_at?: string
          id?: string
          is_active?: boolean
          org_id: string
          subject?: string
          type: string
          updated_at?: string
        }
        Update: {
          body?: string
          channel?: string
          created_at?: string
          id?: string
          is_active?: boolean
          org_id?: string
          subject?: string
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_templates_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisation_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          created_at: string
          entity_id: string | null
          entity_type: string | null
          id: string
          is_read: boolean
          message: string
          org_id: string
          school_id: string | null
          title: string
          type: Database["public"]["Enums"]["notification_type"]
          user_id: string
        }
        Insert: {
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          is_read?: boolean
          message?: string
          org_id: string
          school_id?: string | null
          title: string
          type: Database["public"]["Enums"]["notification_type"]
          user_id: string
        }
        Update: {
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          is_read?: boolean
          message?: string
          org_id?: string
          school_id?: string | null
          title?: string
          type?: Database["public"]["Enums"]["notification_type"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisation_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      organisation_groups: {
        Row: {
          ai_addon_enabled: boolean
          ai_monthly_limit: number
          country: string
          created_at: string
          created_by: string | null
          currency: string
          id: string
          logo_url: string | null
          name: string
          updated_at: string
        }
        Insert: {
          ai_addon_enabled?: boolean
          ai_monthly_limit?: number
          country?: string
          created_at?: string
          created_by?: string | null
          currency?: string
          id?: string
          logo_url?: string | null
          name: string
          updated_at?: string
        }
        Update: {
          ai_addon_enabled?: boolean
          ai_monthly_limit?: number
          country?: string
          created_at?: string
          created_by?: string | null
          currency?: string
          id?: string
          logo_url?: string | null
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      outbound_message_queue: {
        Row: {
          attempts: number
          body: string
          channel: string
          created_at: string
          error_message: string | null
          id: string
          org_id: string
          processed_at: string | null
          recipient: string
          related_notification_id: string | null
          status: string
          subject: string | null
        }
        Insert: {
          attempts?: number
          body: string
          channel: string
          created_at?: string
          error_message?: string | null
          id?: string
          org_id: string
          processed_at?: string | null
          recipient: string
          related_notification_id?: string | null
          status?: string
          subject?: string | null
        }
        Update: {
          attempts?: number
          body?: string
          channel?: string
          created_at?: string
          error_message?: string | null
          id?: string
          org_id?: string
          processed_at?: string | null
          recipient?: string
          related_notification_id?: string | null
          status?: string
          subject?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "outbound_message_queue_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisation_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outbound_message_queue_related_notification_id_fkey"
            columns: ["related_notification_id"]
            isOneToOne: false
            referencedRelation: "notifications"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_allocations: {
        Row: {
          amount: number
          created_at: string
          id: string
          invoice_id: string
          payment_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          invoice_id: string
          payment_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          invoice_id?: string
          payment_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_allocations_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_allocations_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_gateway_config: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          org_id: string
          provider: Database["public"]["Enums"]["payment_gateway"]
          public_key: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          org_id: string
          provider: Database["public"]["Enums"]["payment_gateway"]
          public_key?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          org_id?: string
          provider?: Database["public"]["Enums"]["payment_gateway"]
          public_key?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_gateway_config_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisation_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_transactions: {
        Row: {
          amount: number
          created_at: string
          gateway: Database["public"]["Enums"]["payment_gateway"]
          gateway_reference: string | null
          id: string
          invoice_id: string
          metadata: Json | null
          payer_email: string | null
          payer_name: string | null
          school_id: string
          status: Database["public"]["Enums"]["transaction_status"]
          student_id: string
          updated_at: string
        }
        Insert: {
          amount?: number
          created_at?: string
          gateway?: Database["public"]["Enums"]["payment_gateway"]
          gateway_reference?: string | null
          id?: string
          invoice_id: string
          metadata?: Json | null
          payer_email?: string | null
          payer_name?: string | null
          school_id: string
          status?: Database["public"]["Enums"]["transaction_status"]
          student_id: string
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          gateway?: Database["public"]["Enums"]["payment_gateway"]
          gateway_reference?: string | null
          id?: string
          invoice_id?: string
          metadata?: Json | null
          payer_email?: string | null
          payer_name?: string | null
          school_id?: string
          status?: Database["public"]["Enums"]["transaction_status"]
          student_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_transactions_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_transactions_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_transactions_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          created_at: string
          id: string
          notes: string | null
          payment_date: string
          payment_method: Database["public"]["Enums"]["payment_method"]
          recorded_by: string | null
          reference_number: string | null
          school_id: string
          student_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          notes?: string | null
          payment_date?: string
          payment_method?: Database["public"]["Enums"]["payment_method"]
          recorded_by?: string | null
          reference_number?: string | null
          school_id: string
          student_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          notes?: string | null
          payment_date?: string
          payment_method?: Database["public"]["Enums"]["payment_method"]
          recorded_by?: string | null
          reference_number?: string | null
          school_id?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_profiles: {
        Row: {
          basic_salary: number
          created_at: string
          housing_allowance: number | null
          id: string
          other_allowances: number | null
          pension_rate: number | null
          staff_id: string
          tax_rate: number | null
          transport_allowance: number | null
          updated_at: string
        }
        Insert: {
          basic_salary?: number
          created_at?: string
          housing_allowance?: number | null
          id?: string
          other_allowances?: number | null
          pension_rate?: number | null
          staff_id: string
          tax_rate?: number | null
          transport_allowance?: number | null
          updated_at?: string
        }
        Update: {
          basic_salary?: number
          created_at?: string
          housing_allowance?: number | null
          id?: string
          other_allowances?: number | null
          pension_rate?: number | null
          staff_id?: string
          tax_rate?: number | null
          transport_allowance?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payroll_profiles_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: true
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_run_items: {
        Row: {
          allowances: number
          basic: number
          created_at: string
          deductions: number
          id: string
          net_pay: number
          payroll_run_id: string
          staff_id: string
        }
        Insert: {
          allowances?: number
          basic?: number
          created_at?: string
          deductions?: number
          id?: string
          net_pay?: number
          payroll_run_id: string
          staff_id: string
        }
        Update: {
          allowances?: number
          basic?: number
          created_at?: string
          deductions?: number
          id?: string
          net_pay?: number
          payroll_run_id?: string
          staff_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payroll_run_items_payroll_run_id_fkey"
            columns: ["payroll_run_id"]
            isOneToOne: false
            referencedRelation: "payroll_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_run_items_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_runs: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          created_at: string
          created_by: string | null
          id: string
          period_label: string
          run_date: string
          school_id: string
          staff_count: number
          status: Database["public"]["Enums"]["payroll_status"]
          total_deductions: number
          total_gross: number
          total_net: number
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          period_label: string
          run_date?: string
          school_id: string
          staff_count?: number
          status?: Database["public"]["Enums"]["payroll_status"]
          total_deductions?: number
          total_gross?: number
          total_net?: number
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          period_label?: string
          run_date?: string
          school_id?: string
          staff_count?: number
          status?: Database["public"]["Enums"]["payroll_status"]
          total_deductions?: number
          total_gross?: number
          total_net?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payroll_runs_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string | null
          full_name: string
          id: string
          phone: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          phone?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          phone?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      receipts: {
        Row: {
          amount: number
          id: string
          issued_at: string
          issued_by: string | null
          payment_id: string | null
          payment_transaction_id: string | null
          receipt_number: string
          school_id: string
          student_id: string
        }
        Insert: {
          amount?: number
          id?: string
          issued_at?: string
          issued_by?: string | null
          payment_id?: string | null
          payment_transaction_id?: string | null
          receipt_number: string
          school_id: string
          student_id: string
        }
        Update: {
          amount?: number
          id?: string
          issued_at?: string
          issued_by?: string | null
          payment_id?: string | null
          payment_transaction_id?: string | null
          receipt_number?: string
          school_id?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "receipts_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receipts_payment_transaction_id_fkey"
            columns: ["payment_transaction_id"]
            isOneToOne: false
            referencedRelation: "payment_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receipts_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receipts_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      salary_change_requests: {
        Row: {
          approval_request_id: string | null
          created_at: string
          field_changed: string
          id: string
          new_value: string
          old_value: string
          reason: string | null
          requested_by: string | null
          school_id: string
          staff_id: string
          status: string
        }
        Insert: {
          approval_request_id?: string | null
          created_at?: string
          field_changed: string
          id?: string
          new_value: string
          old_value?: string
          reason?: string | null
          requested_by?: string | null
          school_id: string
          staff_id: string
          status?: string
        }
        Update: {
          approval_request_id?: string | null
          created_at?: string
          field_changed?: string
          id?: string
          new_value?: string
          old_value?: string
          reason?: string | null
          requested_by?: string | null
          school_id?: string
          staff_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "salary_change_requests_approval_request_id_fkey"
            columns: ["approval_request_id"]
            isOneToOne: false
            referencedRelation: "approval_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "salary_change_requests_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "salary_change_requests_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      school_announcements: {
        Row: {
          audience: string
          body: string
          channels: string[]
          created_at: string
          id: string
          org_id: string
          school_id: string | null
          sent_at: string | null
          sent_by: string | null
          status: string
          target_class_id: string | null
          title: string
          updated_at: string
        }
        Insert: {
          audience?: string
          body?: string
          channels?: string[]
          created_at?: string
          id?: string
          org_id: string
          school_id?: string | null
          sent_at?: string | null
          sent_by?: string | null
          status?: string
          target_class_id?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          audience?: string
          body?: string
          channels?: string[]
          created_at?: string
          id?: string
          org_id?: string
          school_id?: string | null
          sent_at?: string | null
          sent_by?: string | null
          status?: string
          target_class_id?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "school_announcements_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisation_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "school_announcements_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "school_announcements_target_class_id_fkey"
            columns: ["target_class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
        ]
      }
      school_events: {
        Row: {
          all_day: boolean
          audience: Database["public"]["Enums"]["event_audience"]
          created_at: string
          created_by: string | null
          description: string | null
          ends_at: string | null
          id: string
          location: string | null
          org_id: string
          school_id: string | null
          starts_at: string
          title: string
          updated_at: string
        }
        Insert: {
          all_day?: boolean
          audience?: Database["public"]["Enums"]["event_audience"]
          created_at?: string
          created_by?: string | null
          description?: string | null
          ends_at?: string | null
          id?: string
          location?: string | null
          org_id: string
          school_id?: string | null
          starts_at: string
          title: string
          updated_at?: string
        }
        Update: {
          all_day?: boolean
          audience?: Database["public"]["Enums"]["event_audience"]
          created_at?: string
          created_by?: string | null
          description?: string | null
          ends_at?: string | null
          id?: string
          location?: string | null
          org_id?: string
          school_id?: string | null
          starts_at?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      schools: {
        Row: {
          accent_color: string | null
          address: string | null
          admissions_intro: string | null
          admissions_open: boolean
          admissions_slug: string | null
          created_at: string
          email: string | null
          id: string
          logo_url: string | null
          name: string
          org_id: string
          phone: string | null
          primary_color: string | null
          tagline: string | null
          updated_at: string
        }
        Insert: {
          accent_color?: string | null
          address?: string | null
          admissions_intro?: string | null
          admissions_open?: boolean
          admissions_slug?: string | null
          created_at?: string
          email?: string | null
          id?: string
          logo_url?: string | null
          name: string
          org_id: string
          phone?: string | null
          primary_color?: string | null
          tagline?: string | null
          updated_at?: string
        }
        Update: {
          accent_color?: string | null
          address?: string | null
          admissions_intro?: string | null
          admissions_open?: boolean
          admissions_slug?: string | null
          created_at?: string
          email?: string | null
          id?: string
          logo_url?: string | null
          name?: string
          org_id?: string
          phone?: string | null
          primary_color?: string | null
          tagline?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "schools_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisation_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      staff: {
        Row: {
          created_at: string
          date_of_birth: string | null
          email: string | null
          employment_date: string | null
          employment_status: Database["public"]["Enums"]["staff_employment_status"]
          first_name: string
          gender: string | null
          id: string
          last_name: string
          phone: string | null
          photo_url: string | null
          qualifications: string | null
          school_id: string
          staff_id_number: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          date_of_birth?: string | null
          email?: string | null
          employment_date?: string | null
          employment_status?: Database["public"]["Enums"]["staff_employment_status"]
          first_name: string
          gender?: string | null
          id?: string
          last_name: string
          phone?: string | null
          photo_url?: string | null
          qualifications?: string | null
          school_id: string
          staff_id_number?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          date_of_birth?: string | null
          email?: string | null
          employment_date?: string | null
          employment_status?: Database["public"]["Enums"]["staff_employment_status"]
          first_name?: string
          gender?: string | null
          id?: string
          last_name?: string
          phone?: string | null
          photo_url?: string | null
          qualifications?: string | null
          school_id?: string
          staff_id_number?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "staff_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_bank_details: {
        Row: {
          account_name: string
          account_number: string
          bank_name: string
          created_at: string
          id: string
          staff_id: string
          updated_at: string
        }
        Insert: {
          account_name: string
          account_number: string
          bank_name: string
          created_at?: string
          id?: string
          staff_id: string
          updated_at?: string
        }
        Update: {
          account_name?: string
          account_number?: string
          bank_name?: string
          created_at?: string
          id?: string
          staff_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_bank_details_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: true
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_positions: {
        Row: {
          created_at: string
          department: string | null
          id: string
          is_current: boolean | null
          staff_id: string
          title: string
        }
        Insert: {
          created_at?: string
          department?: string | null
          id?: string
          is_current?: boolean | null
          staff_id: string
          title: string
        }
        Update: {
          created_at?: string
          department?: string | null
          id?: string
          is_current?: boolean | null
          staff_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_positions_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      student_awards: {
        Row: {
          academic_period_id: string | null
          award_date: string
          created_at: string
          description: string | null
          id: string
          school_id: string
          student_id: string
          title: string
        }
        Insert: {
          academic_period_id?: string | null
          award_date?: string
          created_at?: string
          description?: string | null
          id?: string
          school_id: string
          student_id: string
          title: string
        }
        Update: {
          academic_period_id?: string | null
          award_date?: string
          created_at?: string
          description?: string | null
          id?: string
          school_id?: string
          student_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_awards_academic_period_id_fkey"
            columns: ["academic_period_id"]
            isOneToOne: false
            referencedRelation: "academic_periods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_awards_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_awards_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      student_guardians: {
        Row: {
          guardian_id: string
          id: string
          is_primary: boolean | null
          relationship: string | null
          student_id: string
        }
        Insert: {
          guardian_id: string
          id?: string
          is_primary?: boolean | null
          relationship?: string | null
          student_id: string
        }
        Update: {
          guardian_id?: string
          id?: string
          is_primary?: boolean | null
          relationship?: string | null
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_guardians_guardian_id_fkey"
            columns: ["guardian_id"]
            isOneToOne: false
            referencedRelation: "guardians"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_guardians_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      student_scores: {
        Row: {
          created_at: string
          entered_by: string | null
          exam_id: string
          grade: string | null
          id: string
          remarks: string | null
          score: number | null
          student_id: string
          subject_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          entered_by?: string | null
          exam_id: string
          grade?: string | null
          id?: string
          remarks?: string | null
          score?: number | null
          student_id: string
          subject_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          entered_by?: string | null
          exam_id?: string
          grade?: string | null
          id?: string
          remarks?: string | null
          score?: number | null
          student_id?: string
          subject_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_scores_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "exams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_scores_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_scores_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
        ]
      }
      students: {
        Row: {
          address: string | null
          created_at: string
          date_of_birth: string | null
          first_name: string
          gender: string | null
          id: string
          last_name: string
          photo_url: string | null
          school_id: string
          status: Database["public"]["Enums"]["student_status"]
          student_id_number: string | null
          student_type: string | null
          user_id: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          created_at?: string
          date_of_birth?: string | null
          first_name: string
          gender?: string | null
          id?: string
          last_name: string
          photo_url?: string | null
          school_id: string
          status?: Database["public"]["Enums"]["student_status"]
          student_id_number?: string | null
          student_type?: string | null
          user_id?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          created_at?: string
          date_of_birth?: string | null
          first_name?: string
          gender?: string | null
          id?: string
          last_name?: string
          photo_url?: string | null
          school_id?: string
          status?: Database["public"]["Enums"]["student_status"]
          student_id_number?: string | null
          student_type?: string | null
          user_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "students_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      subjects: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          school_id: string
          short_code: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          school_id: string
          short_code?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          school_id?: string
          short_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "subjects_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      transport_routes: {
        Row: {
          capacity: number | null
          created_at: string
          description: string | null
          driver_name: string | null
          driver_phone: string | null
          fee_per_term: number
          id: string
          is_active: boolean
          name: string
          school_id: string
          updated_at: string
          vehicle_registration: string | null
        }
        Insert: {
          capacity?: number | null
          created_at?: string
          description?: string | null
          driver_name?: string | null
          driver_phone?: string | null
          fee_per_term?: number
          id?: string
          is_active?: boolean
          name: string
          school_id: string
          updated_at?: string
          vehicle_registration?: string | null
        }
        Update: {
          capacity?: number | null
          created_at?: string
          description?: string | null
          driver_name?: string | null
          driver_phone?: string | null
          fee_per_term?: number
          id?: string
          is_active?: boolean
          name?: string
          school_id?: string
          updated_at?: string
          vehicle_registration?: string | null
        }
        Relationships: []
      }
      transport_stops: {
        Row: {
          created_at: string
          dropoff_time: string | null
          id: string
          name: string
          pickup_time: string | null
          route_id: string
          stop_order: number
        }
        Insert: {
          created_at?: string
          dropoff_time?: string | null
          id?: string
          name: string
          pickup_time?: string | null
          route_id: string
          stop_order?: number
        }
        Update: {
          created_at?: string
          dropoff_time?: string | null
          id?: string
          name?: string
          pickup_time?: string | null
          route_id?: string
          stop_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "transport_stops_route_id_fkey"
            columns: ["route_id"]
            isOneToOne: false
            referencedRelation: "transport_routes"
            referencedColumns: ["id"]
          },
        ]
      }
      student_transport: {
        Row: {
          academic_period_id: string | null
          created_at: string
          fee_override: number | null
          id: string
          route_id: string
          stop_id: string | null
          student_id: string
        }
        Insert: {
          academic_period_id?: string | null
          created_at?: string
          fee_override?: number | null
          id?: string
          route_id: string
          stop_id?: string | null
          student_id: string
        }
        Update: {
          academic_period_id?: string | null
          created_at?: string
          fee_override?: number | null
          id?: string
          route_id?: string
          stop_id?: string | null
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_transport_route_id_fkey"
            columns: ["route_id"]
            isOneToOne: false
            referencedRelation: "transport_routes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_transport_stop_id_fkey"
            columns: ["stop_id"]
            isOneToOne: false
            referencedRelation: "transport_stops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_transport_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          org_id: string | null
          role: Database["public"]["Enums"]["app_role"]
          school_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          org_id?: string | null
          role: Database["public"]["Enums"]["app_role"]
          school_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          org_id?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          school_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisation_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_roles_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_my_role: {
        Args: never
        Returns: {
          org_id: string
          role: Database["public"]["Enums"]["app_role"]
          school_id: string
        }[]
      }
      get_user_org_id: { Args: { _user_id: string }; Returns: string }
      ai_usage_this_month: { Args: { _org_id: string }; Returns: number }
      my_staff_id: { Args: never; Returns: string }
      my_student_id: { Args: never; Returns: string }
      is_self_service_role: { Args: { _user_id: string }; Returns: boolean }
      teaches_class: { Args: { _class_id: string }; Returns: boolean }
      teaches_student: { Args: { _student_id: string }; Returns: boolean }
      is_teacher_only: { Args: { _user_id: string }; Returns: boolean }
      my_outbox_summary: {
        Args: never
        Returns: { status: string; count: number }[]
      }
      is_my_child: { Args: { _student_id: string }; Returns: boolean }
      my_guardian_id: { Args: never; Returns: string }
      my_ai_entitlement: {
        Args: never
        Returns: {
          enabled: boolean
          used: number
          monthly_limit: number
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role:
        | "super_admin"
        | "proprietor"
        | "group_admin"
        | "principal"
        | "bursar"
        | "finance_officer"
        | "hr_admin"
        | "teacher"
        | "parent"
        | "student"
        | "school_admin"
      approval_status: "pending" | "approved" | "rejected"
      approval_type:
        | "fee_waiver"
        | "salary_change"
        | "payroll_run"
        | "arrears_exception"
        | "discount"
      attendance_status: "present" | "absent" | "late" | "excused"
      invoice_status: "draft" | "pending" | "paid" | "overdue" | "void"
      notification_type:
        | "invoice_generated"
        | "payment_received"
        | "overdue_reminder"
        | "guardian_invite"
        | "staff_invite"
        | "payroll_pending"
        | "approval_result"
        | "fee_reminder"
        | "payment_confirmation"
        | "school_announcement"
      payment_gateway: "paystack" | "flutterwave" | "manual"
      payment_method: "cash" | "bank_transfer" | "pos" | "online" | "cheque"
      payroll_status: "draft" | "pending" | "approved" | "paid" | "rejected"
      staff_employment_status: "active" | "inactive" | "terminated" | "on_leave"
      application_status:
        | "new"
        | "reviewing"
        | "interview"
        | "offered"
        | "accepted"
        | "enrolled"
        | "rejected"
        | "withdrawn"
      event_audience: "all" | "staff" | "parents" | "students"
      school_section: "toddler" | "nursery" | "primary" | "secondary"
      student_status: "active" | "inactive" | "suspended" | "withdrawn"
      transaction_status:
        | "initiated"
        | "pending"
        | "successful"
        | "failed"
        | "reversed"
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
      app_role: [
        "super_admin",
        "proprietor",
        "group_admin",
        "principal",
        "bursar",
        "finance_officer",
        "hr_admin",
        "teacher",
        "parent",
        "school_admin",
      ],
      approval_status: ["pending", "approved", "rejected"],
      approval_type: [
        "fee_waiver",
        "salary_change",
        "payroll_run",
        "arrears_exception",
        "discount",
      ],
      attendance_status: ["present", "absent", "late", "excused"],
      invoice_status: ["draft", "pending", "paid", "overdue", "void"],
      notification_type: [
        "invoice_generated",
        "payment_received",
        "overdue_reminder",
        "guardian_invite",
        "staff_invite",
        "payroll_pending",
        "approval_result",
        "fee_reminder",
        "payment_confirmation",
        "school_announcement",
      ],
      payment_gateway: ["paystack", "flutterwave", "manual"],
      payment_method: ["cash", "bank_transfer", "pos", "online", "cheque"],
      payroll_status: ["draft", "pending", "approved", "paid", "rejected"],
      staff_employment_status: ["active", "inactive", "terminated", "on_leave"],
      application_status: [
        "new",
        "reviewing",
        "interview",
        "offered",
        "accepted",
        "enrolled",
        "rejected",
        "withdrawn",
      ],
      event_audience: ["all", "staff", "parents", "students"],
      school_section: ["toddler", "nursery", "primary", "secondary"],
      student_status: ["active", "inactive", "suspended", "withdrawn"],
      transaction_status: [
        "initiated",
        "pending",
        "successful",
        "failed",
        "reversed",
      ],
    },
  },
} as const
